package com.erp.schedule;

import java.time.Clock;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.erp.auth.AuthenticatedUser;
import com.erp.schedule.ScheduleDtos.SchoolHolidayCalendarDto;

/** Semaines de vacances scolaires (spec §1), communes à tous, marquées à l'avance par un admin. */
@Service
public class SchoolHolidayService {

	private final SchoolHolidayWeekRepository weeks;

	private final SchoolHolidayCalendarRepository calendar;

	private final Clock clock;

	private static final DateTimeFormatter FR_DATE = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.FRENCH);

	/** Le calendrier doit être validé au moins jusqu'à aujourd'hui + 6 mois. */
	static final int REQUIRED_MONTHS = 6;

	/** On ne valide pas plus d'un an à l'avance (le calendrier admin couvre 52 semaines). */
	static final int MAX_YEARS = 1;

	public SchoolHolidayService(SchoolHolidayWeekRepository weeks, SchoolHolidayCalendarRepository calendar, Clock clock) {
		this.weeks = weeks;
		this.calendar = calendar;
		this.clock = clock;
	}

	/** État de validation ; {@code late} si la date validée n'atteint pas aujourd'hui + 6 mois. */
	@Transactional(readOnly = true)
	public SchoolHolidayCalendarDto validation() {
		return toDto(calendar.findById(SchoolHolidayCalendar.ID).orElseThrow());
	}

	/** Valide jusqu'à {@code until} (inclus) : pas dans le passé, au plus 1 an, jamais en recul. */
	@Transactional
	public SchoolHolidayCalendarDto validate(AuthenticatedUser admin, LocalDate until) {
		LocalDate today = LocalDate.now(clock);
		if (until.isBefore(today)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La date validée ne peut pas être dans le passé");
		}
		if (until.isAfter(today.plusYears(MAX_YEARS))) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Le calendrier se valide au plus 1 an à l'avance");
		}
		SchoolHolidayCalendar current = calendar.lockSingleton().orElseThrow();
		if (current.getValidatedUntil() != null && until.isBefore(current.getValidatedUntil())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Le calendrier est déjà validé jusqu'au " + FR_DATE.format(current.getValidatedUntil()) + " : la date ne peut qu'avancer");
		}
		current.validate(until, admin.id(), clock.instant());
		return toDto(current);
	}

	private SchoolHolidayCalendarDto toDto(SchoolHolidayCalendar c) {
		LocalDate required = LocalDate.now(clock).plusMonths(REQUIRED_MONTHS);
		LocalDate until = c.getValidatedUntil();
		return new SchoolHolidayCalendarDto(until, c.getValidatedBy(), c.getValidatedAt(), required,
				until == null || until.isBefore(required));
	}

	/** Lundis des semaines marquées, triés. */
	@Transactional(readOnly = true)
	public List<LocalDate> list() {
		return weeks.findAll().stream().map(SchoolHolidayWeek::getWeekStart).sorted().toList();
	}

	@Transactional(readOnly = true)
	public WeekType weekTypeOf(LocalDate date) {
		return weeks.existsById(monday(date)) ? WeekType.HOLIDAY : WeekType.CLASSIC;
	}

	@Transactional
	public void mark(LocalDate weekStart) {
		checkEditable(weekStart);
		weeks.save(new SchoolHolidayWeek(weekStart));
	}

	@Transactional
	public void unmark(LocalDate weekStart) {
		checkEditable(weekStart);
		weeks.deleteById(weekStart);
	}

	static LocalDate monday(LocalDate date) {
		return date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
	}

	private void checkEditable(LocalDate weekStart) {
		if (weekStart.getDayOfWeek() != DayOfWeek.MONDAY) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Une semaine est désignée par son lundi");
		}
		if (!weekStart.isAfter(LocalDate.now(clock))) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Seules les semaines à venir peuvent être marquées ou démarquées");
		}
	}

}
