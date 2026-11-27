package com.erp.schedule;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Validation du calendrier des vacances scolaires : une seule ligne (id = 1, créée par la migration), la dernière validation (null = jamais validé). */
@Entity
@Table(name = "school_holiday_calendar")
public class SchoolHolidayCalendar {

	static final short ID = 1;

	@Id
	private Short id = ID;

	private LocalDate validatedUntil;

	private Long validatedBy;

	private Instant validatedAt;

	protected SchoolHolidayCalendar() {
	}

	void validate(LocalDate until, Long by, Instant at) {
		this.validatedUntil = until;
		this.validatedBy = by;
		this.validatedAt = at;
	}

	LocalDate getValidatedUntil() {
		return validatedUntil;
	}

	Long getValidatedBy() {
		return validatedBy;
	}

	Instant getValidatedAt() {
		return validatedAt;
	}

}
