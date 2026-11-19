package com.erp.schedule;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.erp.auth.AuthenticatedUser;
import com.erp.leave.AbsenceRequestRepository;
import com.erp.schedule.ScheduleDtos.PlanningAbsenceDto;
import com.erp.schedule.ScheduleDtos.PlanningDayDto;
import com.erp.schedule.ScheduleDtos.PlanningDto;
import com.erp.schedule.ScheduleDtos.SpecialDayDto;
import com.erp.schedule.ScheduleDtos.SpecialDayInput;
import com.erp.schedule.ScheduleDtos.TypicalDayDto;
import com.erp.schedule.ScheduleDtos.UserScheduleDto;
import com.erp.user.AppUser;
import com.erp.user.AppUserRepository;
import com.erp.user.Role;

/**
 * Horaires (spec §1) : planning d'un jour = journée spéciale si elle existe, sinon journée type.
 * Toute journée travaillée doit durer au moins le minimum d'heures de l'employé.
 */
@Service
public class ScheduleService {

	static final int MAX_PLANNING_DAYS = 62;

	private static final TimeRange DEFAULT_WORKDAY = new TimeRange(LocalTime.of(9, 0), LocalTime.of(17, 0));

	private static final DateTimeFormatter DATE_FR = DateTimeFormatter.ofPattern("dd/MM/yyyy");

	private final TypicalDayRepository typicalDays;

	private final SpecialDayRepository specialDays;

	private final AbsenceRequestRepository absences;

	private final AppUserRepository users;

	public ScheduleService(TypicalDayRepository typicalDays, SpecialDayRepository specialDays,
			AbsenceRequestRepository absences, AppUserRepository users) {
		this.typicalDays = typicalDays;
		this.specialDays = specialDays;
		this.absences = absences;
		this.users = users;
	}

	// ---------- semaine type ----------

	/** Semaine par défaut d'un nouvel employé : lundi → vendredi 9h–17h, week-end non travaillé. */
	@Transactional
	public void createDefaultWeek(Long userId) {
		for (DayOfWeek day : DayOfWeek.values()) {
			typicalDays.save(new TypicalDay(userId, day.getValue(),
					day.getValue() <= 5 ? DEFAULT_WORKDAY : TimeRange.NOT_WORKED));
		}
	}

	@Transactional(readOnly = true)
	public UserScheduleDto getSchedule(Long userId) {
		AppUser user = findUser(userId);
		Map<Integer, TimeRange> week = typicalWeek(userId);
		List<TypicalDayDto> days = new ArrayList<>();
		for (DayOfWeek day : DayOfWeek.values()) {
			TimeRange range = week.getOrDefault(day.getValue(), TimeRange.NOT_WORKED);
			days.add(new TypicalDayDto(day.getValue(), range.start(), range.end()));
		}
		return new UserScheduleDto(user.getMinDailyHours(), days);
	}

	/** Enregistre la semaine type et le minimum ensemble (validés l'un par rapport à l'autre). */
	@Transactional
	public UserScheduleDto updateSchedule(AuthenticatedUser actor, Long userId, UserScheduleDto input) {
		checkOwner(actor, userId);
		AppUser user = findUser(userId);
		BigDecimal min = validateMinHours(input.minDailyHours());
		if (!isAdmin(actor) && min.compareTo(user.getMinDailyHours()) != 0) {
			throw forbidden("Seul un admin peut modifier le minimum d'heures");
		}

		Map<Integer, TimeRange> requested = new HashMap<>();
		List<String> errors = new ArrayList<>();
		for (TypicalDayDto day : input.days()) {
			if (requested.put(day.dayOfWeek(), toRange(day.startTime(), day.endTime())) != null) {
				throw badRequest("Chaque jour de la semaine doit apparaître une seule fois");
			}
		}
		for (DayOfWeek day : DayOfWeek.values()) {
			checkRange(dayLabel(day), requested.get(day.getValue()), min).ifPresent(errors::add);
		}
		// Le nouveau minimum s'applique aussi aux journées spéciales à venir déjà enregistrées
		for (SpecialDay special : specialDays.findByUserIdAndDayDateGreaterThanEqualOrderByDayDate(userId,
				LocalDate.now())) {
			checkRange("Journée spéciale du " + special.getDayDate().format(DATE_FR), special.range(), min)
				.ifPresent(errors::add);
		}
		if (!errors.isEmpty()) {
			throw badRequest(String.join(" ; ", errors));
		}

		Map<Integer, TypicalDay> existing = typicalDays.findByUserIdOrderByDayOfWeek(userId)
			.stream()
			.collect(Collectors.toMap(TypicalDay::getDayOfWeek, d -> d));
		requested.forEach((dow, range) -> {
			TypicalDay day = existing.get(dow);
			if (day == null) {
				typicalDays.save(new TypicalDay(userId, dow, range));
			}
			else {
				day.setRange(range);
			}
		});
		user.setMinDailyHours(min);
		return getSchedule(userId);
	}

	// ---------- journées spéciales ----------

	@Transactional
	public SpecialDayDto createSpecialDay(AuthenticatedUser actor, SpecialDayInput input) {
		checkCanEditDay(actor, input.userId(), input.date());
		TimeRange range = validateSpecialDay(input);
		if (specialDays.existsByUserIdAndDayDate(input.userId(), input.date())) {
			throw new ResponseStatusException(HttpStatus.CONFLICT,
					"Une journée spéciale existe déjà pour cet employé à cette date");
		}
		return SpecialDayDto.of(specialDays.save(new SpecialDay(input.userId(), input.date(), range)));
	}

	@Transactional
	public SpecialDayDto updateSpecialDay(AuthenticatedUser actor, Long id, SpecialDayInput input) {
		SpecialDay day = specialDays.findById(id).orElseThrow(() -> notFound("Journée spéciale introuvable"));
		checkCanEditDay(actor, day.getUserId(), day.getDayDate()); // la journée actuelle…
		checkCanEditDay(actor, input.userId(), input.date()); // …et la nouvelle
		TimeRange range = validateSpecialDay(input);
		if (specialDays.existsByUserIdAndDayDateAndIdNot(input.userId(), input.date(), id)) {
			throw new ResponseStatusException(HttpStatus.CONFLICT,
					"Une journée spéciale existe déjà pour cet employé à cette date");
		}
		day.update(input.userId(), input.date(), range);
		return SpecialDayDto.of(day);
	}

	/** Supprimer une journée spéciale = revenir à la journée type. */
	@Transactional
	public void deleteSpecialDay(AuthenticatedUser actor, Long id) {
		SpecialDay day = specialDays.findById(id).orElseThrow(() -> notFound("Journée spéciale introuvable"));
		checkCanEditDay(actor, day.getUserId(), day.getDayDate());
		specialDays.delete(day);
	}

	// ---------- planning calculé ----------

	@Transactional(readOnly = true)
	public PlanningDto planning(LocalDate from, LocalDate to) {
		if (!to.isAfter(from) || ChronoUnit.DAYS.between(from, to) > MAX_PLANNING_DAYS) {
			throw badRequest("Période invalide : 'to' doit être après 'from', " + MAX_PLANNING_DAYS + " jours max");
		}
		Map<Long, Map<Integer, TimeRange>> weeks = new HashMap<>();
		for (TypicalDay day : typicalDays.findAll()) {
			weeks.computeIfAbsent(day.getUserId(), k -> new HashMap<>()).put(day.getDayOfWeek(), day.range());
		}
		Map<String, SpecialDay> specials = new HashMap<>();
		for (SpecialDay day : specialDays.findByDayDateGreaterThanEqualAndDayDateLessThan(from, to)) {
			specials.put(day.getUserId() + "|" + day.getDayDate(), day);
		}

		List<PlanningDayDto> days = new ArrayList<>();
		for (AppUser user : users.findAll()) {
			Map<Integer, TimeRange> week = weeks.getOrDefault(user.getId(), Map.of());
			for (LocalDate date = from; date.isBefore(to); date = date.plusDays(1)) {
				SpecialDay special = specials.get(user.getId() + "|" + date);
				if (special != null) {
					TimeRange range = special.range();
					days.add(new PlanningDayDto(user.getId(), date, range.start(), range.end(), special.getId()));
				}
				else {
					TimeRange range = week.getOrDefault(date.getDayOfWeek().getValue(), TimeRange.NOT_WORKED);
					if (range.worked()) {
						days.add(new PlanningDayDto(user.getId(), date, range.start(), range.end(), null));
					}
				}
			}
		}
		var absenceDtos = absences.findApprovedOverlapping(from, to)
			.stream()
			.map(a -> new PlanningAbsenceDto(a.getId(), a.getUserId(), a.getStartDate(), a.getEndDate()))
			.toList();
		return new PlanningDto(days, absenceDtos);
	}

	// ---------- droits (spec §1 : l'ADMIN modifie tout, l'EMPLOYEE ses propres journées) ----------

	private static boolean isAdmin(AuthenticatedUser actor) {
		return actor.role() == Role.ADMIN;
	}

	private static void checkOwner(AuthenticatedUser actor, Long userId) {
		if (!isAdmin(actor) && !actor.id().equals(userId)) {
			throw forbidden("Vous ne pouvez modifier que vos propres horaires");
		}
	}

	/** Employé : uniquement ses journées, à partir d'aujourd'hui. */
	private static void checkCanEditDay(AuthenticatedUser actor, Long userId, LocalDate date) {
		checkOwner(actor, userId);
		if (!isAdmin(actor) && date.isBefore(LocalDate.now())) {
			throw badRequest("Les jours passés ne sont plus modifiables");
		}
	}

	// ---------- règles ----------

	private TimeRange validateSpecialDay(SpecialDayInput input) {
		AppUser user = findUser(input.userId());
		TimeRange range = toRange(input.startTime(), input.endTime());
		checkRange("Le " + input.date().format(DATE_FR), range, user.getMinDailyHours()).ifPresent(error -> {
			throw badRequest(error);
		});
		return range;
	}

	/** Deux heures renseignées, ou aucune (non travaillé). */
	private static TimeRange toRange(LocalTime start, LocalTime end) {
		if ((start == null) != (end == null)) {
			throw badRequest("Renseignez l'heure de début ET l'heure de fin, ou aucune (jour non travaillé)");
		}
		return start == null ? TimeRange.NOT_WORKED : new TimeRange(start, end);
	}

	/** Fin > début (donc pas à cheval sur minuit) et durée ≥ minimum ; message d'erreur sinon. */
	static Optional<String> checkRange(String label, TimeRange range, BigDecimal minHours) {
		if (range == null || !range.worked()) {
			return Optional.empty();
		}
		if (!range.end().isAfter(range.start())) {
			return Optional.of(label + " : l'heure de fin doit être après l'heure de début");
		}
		long minMinutes = minHours.multiply(BigDecimal.valueOf(60)).longValue();
		if (range.minutes() < minMinutes) {
			return Optional.of(label + " : " + formatMinutes(range.minutes()) + " < minimum de "
					+ formatMinutes(minMinutes));
		}
		return Optional.empty();
	}

	private static BigDecimal validateMinHours(BigDecimal min) {
		boolean quarter = min.multiply(BigDecimal.valueOf(4)).stripTrailingZeros().scale() <= 0;
		if (min.signum() <= 0 || min.compareTo(BigDecimal.valueOf(24)) > 0 || !quarter) {
			throw badRequest("Le minimum d'heures doit être compris entre 0,25 et 24 h, par pas de 0,25 h");
		}
		return min;
	}

	static String formatMinutes(long minutes) {
		long h = minutes / 60;
		long m = minutes % 60;
		return m == 0 ? h + " h" : h + " h " + String.format("%02d", m);
	}

	private static String dayLabel(DayOfWeek day) {
		String name = day.getDisplayName(TextStyle.FULL, Locale.FRENCH);
		return Character.toUpperCase(name.charAt(0)) + name.substring(1);
	}

	private Map<Integer, TimeRange> typicalWeek(Long userId) {
		Map<Integer, TimeRange> week = new HashMap<>();
		typicalDays.findByUserIdOrderByDayOfWeek(userId).forEach(d -> week.put(d.getDayOfWeek(), d.range()));
		return week;
	}

	private AppUser findUser(Long userId) {
		return users.findById(userId).orElseThrow(() -> notFound("Employé introuvable"));
	}

	private static ResponseStatusException badRequest(String message) {
		return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
	}

	private static ResponseStatusException forbidden(String message) {
		return new ResponseStatusException(HttpStatus.FORBIDDEN, message);
	}

	private static ResponseStatusException notFound(String message) {
		return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
	}

}
