package com.erp.schedule;

import java.time.LocalDate;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Semaine de vacances scolaires, commune à tous, identifiée par son lundi. */
@Entity
@Table(name = "school_holiday_week")
public class SchoolHolidayWeek {

	@Id
	private LocalDate weekStart;

	protected SchoolHolidayWeek() {
	}

	SchoolHolidayWeek(LocalDate weekStart) {
		this.weekStart = weekStart;
	}

	LocalDate getWeekStart() {
		return weekStart;
	}

}
