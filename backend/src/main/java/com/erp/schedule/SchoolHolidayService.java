package com.erp.schedule;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Semaines de vacances scolaires (spec §1), communes à tous, marquées à l'avance par un admin. */
@Service
public class SchoolHolidayService {

	private final SchoolHolidayWeekRepository weeks;

	private final Clock clock;

	public SchoolHolidayService(SchoolHolidayWeekRepository weeks, Clock clock) {
		this.weeks = weeks;
		this.clock = clock;
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
