package com.erp.schedule;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
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
import com.erp.common.RequestStatus;
import com.erp.leave.AbsenceRequest;
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
 * Horaires (spec §1) : planning d'un jour = journée type (matin + après-midi, selon le type de semaine) + plages
 * d'heures ajoutées, qui n'empiètent ni sur la journée type ni sur la pause de midi. (« SpecialDay » est le nom technique d'une plage ajoutée.)
 */
@Service
public class ScheduleService {

	static final int MAX_PLANNING_DAYS = 62;

	private static final TimeRange DEFAULT_MORNING = new TimeRange(LocalTime.of(9, 0), LocalTime.of(12, 30));

	private static final TimeRange DEFAULT_AFTERNOON = new TimeRange(LocalTime.of(13, 30), LocalTime.of(17, 0));

	private static final DateTimeFormatter DATE_FR = DateTimeFormatter.ofPattern("dd/MM/yyyy");

	private final TypicalDayRepository typicalDays;

	private final SpecialDayRepository specialDays;

	private final AbsenceRequestRepository absences;

	private final AppUserRepository users;

	private final SchoolHolidayService holidays;

	private final Clock clock;

	public ScheduleService(TypicalDayRepository typicalDays, SpecialDayRepository specialDays,
			AbsenceRequestRepository absences, AppUserRepository users, SchoolHolidayService holidays,
			Clock clock) {
		this.holidays = holidays;
		this.clock = clock;
		this.typicalDays = typicalDays;
		this.specialDays = specialDays;
		this.absences = absences;
		this.users = users;
	}

	// ---------- semaine type ----------

	/** Semaine par défaut d'un nouvel employé : lundi → vendredi 9h–12h30 / 13h30–17h (35 h), week-end non travaillé. */
	@Transactional
	public void createDefaultWeek(Long userId) {
		for (DayOfWeek day : DayOfWeek.values()) {
			boolean worked = day.getValue() <= 5;
			typicalDays.save(new TypicalDay(userId, WeekType.CLASSIC, day.getValue(),
					worked ? DEFAULT_MORNING : TimeRange.NOT_WORKED, worked ? DEFAULT_AFTERNOON : TimeRange.NOT_WORKED));
		}
	}

	@Transactional(readOnly = true)
	public UserScheduleDto getSchedule(Long userId) {
		AppUser user = findUser(userId);
		List<TypicalDayDto> holidayDays = weekDtos(userId, WeekType.HOLIDAY);
		return new UserScheduleDto(user.getWeeklyHours(), weekDtos(userId, WeekType.CLASSIC),
				holidayDays.isEmpty() ? null : holidayDays);
	}

	/**
	 * Enregistre les deux semaines type et le contrat hebdomadaire ensemble : chaque semaine doit totaliser exactement le
	 * contrat (spec §1). Seul un admin peut modifier le contrat. Semaine de vacances null = reprend la classique.
	 */
	@Transactional
	public UserScheduleDto updateSchedule(AuthenticatedUser actor, Long userId, UserScheduleDto input) {
		checkOwner(actor, userId);
		AppUser user = findUser(userId);
		BigDecimal contract = validateWeeklyHours(input.weeklyHours());
		if (!isAdmin(actor) && contract.compareTo(user.getWeeklyHours()) != 0) {
			throw forbidden("Seul un admin peut modifier le contrat hebdomadaire");
		}
		validateWeek(WeekType.CLASSIC, input.days(), contract);
		if (input.holidayDays() != null) {
			validateWeek(WeekType.HOLIDAY, input.holidayDays(), contract);
		}
		saveWeek(userId, WeekType.CLASSIC, input.days());
		if (input.holidayDays() != null) {
			saveWeek(userId, WeekType.HOLIDAY, input.holidayDays());
		}
		else {
			typicalDays.deleteAll(typicalDays.findByUserIdAndWeekTypeOrderByDayOfWeek(userId, WeekType.HOLIDAY));
		}
		user.setWeeklyHours(contract);
		return getSchedule(userId);
	}

	private List<TypicalDayDto> weekDtos(Long userId, WeekType type) {
		return typicalDays.findByUserIdAndWeekTypeOrderByDayOfWeek(userId, type).stream().map(TypicalDayDto::of).toList();
	}

	private static TimeRange morning(TypicalDayDto day) {
		return toRange(day.morningStart(), day.morningEnd());
	}

	private static TimeRange afternoon(TypicalDayDto day) {
		return toRange(day.afternoonStart(), day.afternoonEnd());
	}

	private static void validateWeek(WeekType type, List<TypicalDayDto> days, BigDecimal contract) {
		if (days.stream().map(TypicalDayDto::dayOfWeek).distinct().count() != days.size()) {
			throw badRequest("Chaque jour de la semaine doit apparaître une seule fois");
		}
		List<String> errors = new ArrayList<>();
		long total = 0;
		for (TypicalDayDto day : days) {
			String label = dayLabel(DayOfWeek.of(day.dayOfWeek()));
			TimeRange morning = morning(day);
			TimeRange afternoon = afternoon(day);
			checkRange(label + " matin", morning).ifPresent(errors::add);
			checkRange(label + " après-midi", afternoon).ifPresent(errors::add);
			if (morning.worked() && morning.end().isAfter(TimeRange.BREAK.start())) {
				errors.add(label + " : le matin doit finir au plus tard à 12:30 (pause de midi obligatoire)");
			}
			if (afternoon.worked() && afternoon.start().isBefore(TimeRange.BREAK.end())) {
				errors.add(label + " : l'après-midi doit commencer au plus tôt à 13:30 (pause de midi obligatoire)");
			}
			total += morning.minutes() + afternoon.minutes();
		}
		if (!errors.isEmpty()) {
			throw badRequest(type.label() + " — " + String.join(" ; ", errors));
		}
		checkContract(type.label(), total, contract).ifPresent(error -> {
			throw badRequest(error);
		});
	}

	private void saveWeek(Long userId, WeekType type, List<TypicalDayDto> days) {
		Map<Integer, TypicalDay> existing = typicalDays.findByUserIdAndWeekTypeOrderByDayOfWeek(userId, type)
			.stream()
			.collect(Collectors.toMap(TypicalDay::getDayOfWeek, d -> d));
		for (TypicalDayDto input : days) {
			TypicalDay day = existing.get(input.dayOfWeek());
			if (day == null) {
				typicalDays
					.save(new TypicalDay(userId, type, input.dayOfWeek(), morning(input), afternoon(input)));
			}
			else {
				day.setRanges(morning(input), afternoon(input));
			}
		}
	}

	// ---------- heures ajoutées à un jour ----------

	@Transactional
	public SpecialDayDto createSpecialDay(AuthenticatedUser actor, SpecialDayInput input) {
		checkCanEditDay(actor, input.userId(), input.date());
		TimeRange range = validateExtra(input, null);
		return SpecialDayDto.of(specialDays.save(new SpecialDay(input.userId(), input.date(), range)));
	}

	@Transactional
	public SpecialDayDto updateSpecialDay(AuthenticatedUser actor, Long id, SpecialDayInput input) {
		SpecialDay day = findExtra(id);
		checkCanEditDay(actor, day.getUserId(), day.getDayDate()); // la journée actuelle…
		checkCanEditDay(actor, input.userId(), input.date()); // …et la nouvelle
		day.update(input.userId(), input.date(), validateExtra(input, id));
		return SpecialDayDto.of(day);
	}

	@Transactional
	public void deleteSpecialDay(AuthenticatedUser actor, Long id) {
		SpecialDay day = findExtra(id);
		checkCanEditDay(actor, day.getUserId(), day.getDayDate());
		specialDays.delete(day);
	}

	// ---------- planning calculé ----------

	/**
	 * Plages prévues d'un employé à une date : journée type + heures ajoutées, fusionnées si contiguës. Vide = non
	 * travaillé.
	 */
	@Transactional(readOnly = true)
	public List<TimeRange> plannedRanges(Long userId, LocalDate date) {
		List<TimeRange> ranges = new ArrayList<>(typicalRanges(userId, date));
		specialDays.findByUserIdAndDayDate(userId, date).forEach(extra -> ranges.add(extra.range()));
		// la pause n'est jamais travaillée : aucune plage ne la touche, les plages ne fusionnent donc pas à travers elle
		return TimeRange.merge(ranges);
	}

	@Transactional(readOnly = true)
	public PlanningDto planning(LocalDate from, LocalDate to) {
		if (!to.isAfter(from) || ChronoUnit.DAYS.between(from, to) > MAX_PLANNING_DAYS) {
			throw badRequest("Période invalide : 'to' doit être après 'from', " + MAX_PLANNING_DAYS + " jours max");
		}
		Map<String, Map<Integer, List<TimeRange>>> weeks = new HashMap<>();
		for (TypicalDay day : typicalDays.findAll()) {
			weeks.computeIfAbsent(day.getUserId() + "|" + day.getWeekType(), k -> new HashMap<>())
				.put(day.getDayOfWeek(), day.ranges());
		}
		LocalDate firstMonday = SchoolHolidayService.monday(from);
		List<LocalDate> holidayWeeks = holidays.list()
			.stream()
			.filter(monday -> !monday.isBefore(firstMonday) && monday.isBefore(to))
			.toList();
		Map<String, List<SpecialDay>> extras = specialDays.findByDayDateGreaterThanEqualAndDayDateLessThan(from, to)
			.stream()
			.sorted(Comparator.comparing(extra -> extra.range().start()))
			.collect(Collectors.groupingBy(extra -> extra.getUserId() + "|" + extra.getDayDate()));

		List<PlanningDayDto> days = new ArrayList<>();
		for (AppUser user : users.findAll()) {
			var classic = weeks.getOrDefault(user.getId() + "|" + WeekType.CLASSIC, Map.of());
			var holiday = weeks.getOrDefault(user.getId() + "|" + WeekType.HOLIDAY, classic);
			for (LocalDate date = from; date.isBefore(to); date = date.plusDays(1)) {
				var week = holidayWeeks.contains(SchoolHolidayService.monday(date)) ? holiday : classic;
				List<TimeRange> typical = week.getOrDefault(date.getDayOfWeek().getValue(), List.of());
				for (TimeRange range : typical) {
					days.add(new PlanningDayDto(user.getId(), date, range.start(), range.end(), null));
				}
				for (SpecialDay extra : extras.getOrDefault(user.getId() + "|" + date, List.of())) {
					// la semaine type a pu changer depuis l'ajout : on n'affiche que ce qui n'empiète pas dessus
					for (TimeRange part : extra.range().outside(typical)) {
						days.add(new PlanningDayDto(user.getId(), date, part.start(), part.end(), extra.getId()));
					}
				}
			}
		}
		// absences acceptées et en attente de tous, sans type ni motif (spec §3)
		List<AbsenceRequest> visible = new ArrayList<>(absences.findByStatusOverlapping(RequestStatus.APPROVED, from, to));
		visible.addAll(absences.findByStatusOverlapping(RequestStatus.PENDING, from, to));
		var absenceDtos = visible.stream()
			.map(a -> new PlanningAbsenceDto(a.getId(), a.getUserId(), a.getStartDate(), a.getEndDate(),
					a.getStartTime(), a.getEndTime(), a.getStatus()))
			.toList();
		return new PlanningDto(days, absenceDtos, holidayWeeks);
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
	private void checkCanEditDay(AuthenticatedUser actor, Long userId, LocalDate date) {
		checkOwner(actor, userId);
		if (!isAdmin(actor) && date.isBefore(LocalDate.now(clock))) {
			throw badRequest("Les jours passés ne sont plus modifiables");
		}
	}

	// ---------- règles ----------

	/**
	 * Heures ajoutées (spec §1) : fin > début, sans empiéter sur la journée type ni sur d'autres heures ajoutées. L'employé
	 * est verrouillé pour que deux ajouts simultanés ne se chevauchent pas.
	 */
	private TimeRange validateExtra(SpecialDayInput input, Long ignoredId) {
		users.lockById(input.userId()).orElseThrow(() -> notFound("Employé introuvable"));
		TimeRange range = new TimeRange(input.startTime(), input.endTime());
		checkRange("Le " + input.date().format(DATE_FR), range).ifPresent(error -> {
			throw badRequest(error);
		});
		if (range.overlaps(TimeRange.BREAK)) {
			throw badRequest("Les heures ajoutées ne doivent pas empiéter sur la pause de midi (12:30–13:30)");
		}
		for (TimeRange typical : typicalRanges(input.userId(), input.date())) {
			if (range.overlaps(typical)) {
				throw badRequest("Les heures ajoutées ne doivent pas empiéter sur la journée type du "
						+ input.date().format(DATE_FR) + " (" + typical.start() + "–" + typical.end() + ")");
			}
		}
		for (SpecialDay other : specialDays.findByUserIdAndDayDate(input.userId(), input.date())) {
			if (!other.getId().equals(ignoredId) && range.overlaps(other.range())) {
				throw new ResponseStatusException(HttpStatus.CONFLICT, "Ces heures chevauchent des heures déjà ajoutées ("
						+ other.range().start() + "–" + other.range().end() + ")");
			}
		}
		return range;
	}

	private SpecialDay findExtra(Long id) {
		return specialDays.findById(id).orElseThrow(() -> notFound("Heures ajoutées introuvables"));
	}

	/** Journée type à une date, selon le type de semaine (vacances non renseignées = semaine classique). */
	private List<TimeRange> typicalRanges(Long userId, LocalDate date) {
		List<TypicalDay> week = typicalDays.findByUserIdAndWeekTypeOrderByDayOfWeek(userId, holidays.weekTypeOf(date));
		if (week.isEmpty()) {
			week = typicalDays.findByUserIdAndWeekTypeOrderByDayOfWeek(userId, WeekType.CLASSIC);
		}
		return week.stream()
			.filter(day -> day.getDayOfWeek() == date.getDayOfWeek().getValue())
			.flatMap(day -> day.ranges().stream())
			.toList();
	}

	/** Deux heures renseignées, ou aucune (non travaillé). */
	private static TimeRange toRange(LocalTime start, LocalTime end) {
		if ((start == null) != (end == null)) {
			throw badRequest("Renseignez l'heure de début ET l'heure de fin, ou aucune (période non travaillée)");
		}
		return start == null ? TimeRange.NOT_WORKED : new TimeRange(start, end);
	}

	/** Fin > début (donc pas à cheval sur minuit) ; message d'erreur sinon. */
	static Optional<String> checkRange(String label, TimeRange range) {
		if (range == null || !range.worked() || range.end().isAfter(range.start())) {
			return Optional.empty();
		}
		return Optional.of(label + " : l'heure de fin doit être après l'heure de début");
	}

	/** La semaine type doit totaliser exactement le contrat hebdomadaire ; message d'erreur sinon. */
	static Optional<String> checkContract(String label, long totalMinutes, BigDecimal contract) {
		long contractMinutes = contract.multiply(BigDecimal.valueOf(60)).longValue();
		if (totalMinutes == contractMinutes) {
			return Optional.empty();
		}
		String summary = label + " : " + formatMinutes(totalMinutes) + " pour un contrat de "
				+ formatMinutes(contractMinutes) + " — ";
		if (totalMinutes < contractMinutes) {
			return Optional.of(summary + "il manque " + formatMinutes(contractMinutes - totalMinutes));
		}
		return Optional.of(summary + formatMinutes(totalMinutes - contractMinutes) + " de trop : la semaine type doit "
				+ "rester au contrat ; ajoutez les heures en plus sur le planning (jour concerné) puis faites une "
				+ "déclaration d'heures supplémentaires");
	}

	private static BigDecimal validateWeeklyHours(BigDecimal hours) {
		boolean quarter = hours.multiply(BigDecimal.valueOf(4)).stripTrailingZeros().scale() <= 0;
		if (hours.signum() <= 0 || hours.compareTo(BigDecimal.valueOf(168)) > 0 || !quarter) {
			throw badRequest("Le contrat hebdomadaire doit être compris entre 0,25 et 168 h, par pas de 0,25 h");
		}
		return hours;
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
