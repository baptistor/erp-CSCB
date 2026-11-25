package com.erp.schedule;

import java.time.LocalDate;
import java.time.LocalTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Plage d'heures ajoutée à un jour, en dehors de la journée type (plusieurs par jour possibles). Nom technique. */
@Entity
@Table(name = "special_day")
public class SpecialDay {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false)
	private Long userId;

	@Column(nullable = false)
	private LocalDate dayDate;

	@Column(nullable = false)
	private LocalTime startTime;

	@Column(nullable = false)
	private LocalTime endTime;

	protected SpecialDay() {
	}

	SpecialDay(Long userId, LocalDate dayDate, TimeRange range) {
		update(userId, dayDate, range);
	}

	final void update(Long userId, LocalDate dayDate, TimeRange range) {
		this.userId = userId;
		this.dayDate = dayDate;
		this.startTime = range.start();
		this.endTime = range.end();
	}

	TimeRange range() {
		return new TimeRange(startTime, endTime);
	}

	public Long getId() {
		return id;
	}

	public Long getUserId() {
		return userId;
	}

	public LocalDate getDayDate() {
		return dayDate;
	}

}
