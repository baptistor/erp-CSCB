package com.erp.schedule;

import java.time.LocalTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Journée type d'un employé pour un jour de semaine (1 = lundi … 7 = dimanche). */
@Entity
@Table(name = "typical_day")
public class TypicalDay {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false)
	private Long userId;

	@Column(nullable = false)
	private short dayOfWeek;

	private LocalTime startTime;

	private LocalTime endTime;

	protected TypicalDay() {
	}

	TypicalDay(Long userId, int dayOfWeek, TimeRange range) {
		this.userId = userId;
		this.dayOfWeek = (short) dayOfWeek;
		setRange(range);
	}

	void setRange(TimeRange range) {
		this.startTime = range.start();
		this.endTime = range.end();
	}

	TimeRange range() {
		return new TimeRange(startTime, endTime);
	}

	public Long getUserId() {
		return userId;
	}

	public int getDayOfWeek() {
		return dayOfWeek;
	}

}
