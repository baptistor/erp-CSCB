package com.erp.schedule;

import java.time.Duration;
import java.time.LocalTime;

/** Plage horaire d'une journée ; start/end null = « non travaillé ». */
public record TimeRange(LocalTime start, LocalTime end) {

	public static final TimeRange NOT_WORKED = new TimeRange(null, null);

	public boolean worked() {
		return start != null;
	}

	public long minutes() {
		return worked() ? Duration.between(start, end).toMinutes() : 0;
	}

}
