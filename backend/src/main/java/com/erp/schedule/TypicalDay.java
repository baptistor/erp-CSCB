package com.erp.schedule;

import java.time.LocalTime;
import java.util.List;
import java.util.stream.Stream;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Journée type d'un employé pour un type de semaine et un jour (1 = lundi … 7 = dimanche) : matin et après-midi, de
 * part et d'autre de la pause de midi, chacun facultatif.
 */
@Entity
@Table(name = "typical_day")
public class TypicalDay {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false)
	private Long userId;

	@Column(nullable = false)
	@Enumerated(EnumType.STRING)
	private WeekType weekType;

	@Column(nullable = false)
	private short dayOfWeek;

	private LocalTime morningStart;

	private LocalTime morningEnd;

	private LocalTime afternoonStart;

	private LocalTime afternoonEnd;

	protected TypicalDay() {
	}

	TypicalDay(Long userId, WeekType weekType, int dayOfWeek, TimeRange morning, TimeRange afternoon) {
		this.userId = userId;
		this.weekType = weekType;
		this.dayOfWeek = (short) dayOfWeek;
		setRanges(morning, afternoon);
	}

	final void setRanges(TimeRange morning, TimeRange afternoon) {
		this.morningStart = morning.start();
		this.morningEnd = morning.end();
		this.afternoonStart = afternoon.start();
		this.afternoonEnd = afternoon.end();
	}

	TimeRange morning() {
		return new TimeRange(morningStart, morningEnd);
	}

	TimeRange afternoon() {
		return new TimeRange(afternoonStart, afternoonEnd);
	}

	/** Plages travaillées (0, 1 ou 2). */
	List<TimeRange> ranges() {
		return Stream.of(morning(), afternoon()).filter(TimeRange::worked).toList();
	}

	public Long getUserId() {
		return userId;
	}

	public WeekType getWeekType() {
		return weekType;
	}

	public int getDayOfWeek() {
		return dayOfWeek;
	}

}
