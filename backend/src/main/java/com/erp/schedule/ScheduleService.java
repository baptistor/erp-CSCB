package com.erp.schedule;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
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
import com.erp.overtime.OvertimeRequestRepository;
import com.erp.schedule.ScheduleDtos.PlanningAbsenceDto;
import com.erp.schedule.ScheduleDtos.PlanningDayDto;
import com.erp.schedule.ScheduleDtos.PlanningDto;
import com.erp.schedule.ScheduleDtos.PlanningOvertimeDto;
import com.erp.schedule.ScheduleDtos.TypicalDayDto;
import com.erp.schedule.ScheduleDtos.UserScheduleDto;
import com.erp.user.AppUser;
import com.erp.user.AppUserRepository;
import com.erp.user.Role;

/**
 * Horaires (spec §1) : planning d'un jour = journée type (classique : matin + après-midi ; vacances : une plage) + heures
 * sup posées sur le planning (module overtime), qui n'empiètent ni sur la journée type ni sur la pause de midi (classique).
 */
@Service
public class ScheduleService {

	static final int MAX_PLANNING_DAYS = 62;

	private static final TimeRange DEFAULT_MORNING = new TimeRange(LocalTime.of(9, 0), LocalTime.of(12, 30));

	private static final TimeRange DEFAULT_AFTERNOON = new TimeRange(LocalTime.of(13, 30), LocalTime.of(17, 0));

	/** Semaine de vacances : une seule plage, sans pause. */
	private static final TimeRange DEFAULT_HOLIDAY = new TimeRange(LocalTime.of(9, 0), LocalTime.of(16, 0));

	private final TypicalDayRepository typicalDays;

	private final OvertimeRequestRepository overtimes;

	private final AbsenceRequestRepository absences;

	private final AppUserRepository users;

	private final SchoolHolidayService holidays;

	public ScheduleService(TypicalDayRepository typicalDays, OvertimeRequestRepository overtimes,
			AbsenceRequestRepository absences, AppUserRepository users, SchoolHolidayService holidays) {
		this.holidays = holidays;
		this.typicalDays = typicalDays;
		this.overtimes = overtimes;
		this.absences = absences;
		this.users = users;
	}

	// ---------- semaine type ----------

	/**
	 * Semaines par défaut d'un nouvel employé, week-end non travaillé : classique lundi → vendredi 9h–12h30 / 13h30–17h,
	 * vacances lundi → vendredi 9h–16h sans pause (35 h chacune).
	 */
	@Transactional
	public void createDefaultWeek(Long userId) {
		for (DayOfWeek day : DayOfWeek.values()) {
			boolean worked = day.getValue() <= 5;
			typicalDays.save(new TypicalDay(userId, WeekType.CLASSIC, day.getValue(),
					worked ? DEFAULT_MORNING : TimeRange.NOT_WORKED, worked ? DEFAULT_AFTERNOON : TimeRange.NOT_WORKED));
			typicalDays.save(new TypicalDay(userId, WeekType.HOLIDAY, day.getValue(),
					worked ? DEFAULT_HOLIDAY : TimeRange.NOT_WORKED, TimeRange.NOT_WORKED));
		}
	}

	/** Pause de midi ce jour-là : seulement en semaine classique (spec §1). */
	public boolean hasBreak(LocalDate date) {
		return holidays.weekTypeOf(date) == WeekType.CLASSIC;
	}

	@Transactional(readOnly = true)
	public UserScheduleDto getSchedule(Long userId) {
		AppUser user = findUser(userId);
		return new UserScheduleDto(user.getWeeklyHours(), weekDtos(userId, WeekType.CLASSIC),
				weekDtos(userId, WeekType.HOLIDAY));
	}

	/**
	 * Enregistre les deux semaines type et le contrat hebdomadaire ensemble : chaque semaine doit totaliser exactement le
	 * contrat (spec §1). Seul un admin peut modifier le contrat.
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
		validateWeek(WeekType.HOLIDAY, input.holidayDays(), contract);
		saveWeek(userId, WeekType.CLASSIC, input.days());
		saveWeek(userId, WeekType.HOLIDAY, input.holidayDays());
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
			if (day.dayOfWeek() == DayOfWeek.SUNDAY.getValue() && (morning.worked() || afternoon.worked())) {
				errors.add("Dimanche : le centre est fermé");
				continue;
			}
			if (type == WeekType.HOLIDAY) {
				// vacances : une seule plage, sans pause
				checkRange(label, morning).ifPresent(errors::add);
				if (afternoon.worked()) {
					errors.add(label + " : une seule plage par jour en semaine de vacances (pas de pause)");
				}
				total += morning.minutes();
				continue;
			}
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

	// ---------- planning calculé ----------

	/**
	 * Plages prévues d'un employé à une date : sa journée type (matin, après-midi), selon le type de semaine. Vide = non
	 * travaillé. Les heures sup n'en font pas partie (on n'y pose pas d'absence).
	 */
	@Transactional(readOnly = true)
	public List<TimeRange> plannedRanges(Long userId, LocalDate date) {
		return typicalRanges(userId, date);
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
		List<PlanningDayDto> days = new ArrayList<>();
		for (AppUser user : users.findAll()) {
			var classic = weeks.getOrDefault(user.getId() + "|" + WeekType.CLASSIC, Map.of());
			var holiday = weeks.getOrDefault(user.getId() + "|" + WeekType.HOLIDAY, Map.<Integer, List<TimeRange>>of());
			for (LocalDate date = from; date.isBefore(to); date = date.plusDays(1)) {
				var week = holidayWeeks.contains(SchoolHolidayService.monday(date)) ? holiday : classic;
				List<TimeRange> typical = week.getOrDefault(date.getDayOfWeek().getValue(), List.of());
				for (TimeRange range : typical) {
					days.add(new PlanningDayDto(user.getId(), date, range.start(), range.end()));
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
		// heures sup en attente et acceptées de tous, sans motif (spec §2)
		var overtimeDtos = overtimes.findPlaced(List.of(RequestStatus.PENDING, RequestStatus.APPROVED), from, to)
			.stream()
			.map(o -> new PlanningOvertimeDto(o.getId(), o.getUserId(), o.getWorkDate(), o.getStartTime(),
					o.getEndTime(), o.getStatus(), o.getCreatedBy()))
			.toList();
		return new PlanningDto(days, overtimeDtos, absenceDtos, holidayWeeks);
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

	// ---------- règles ----------

	/** Journée type à une date, selon le type de semaine. */
	public List<TimeRange> typicalRanges(Long userId, LocalDate date) {
		return typicalDays.findByUserIdAndWeekTypeOrderByDayOfWeek(userId, holidays.weekTypeOf(date))
			.stream()
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
				+ "rester au contrat ; posez les heures en plus sur le planning, au jour concerné : "
				+ "elles deviennent une demande d'heures supplémentaires");
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
