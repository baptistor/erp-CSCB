package com.erp.schedule;

import java.time.Duration;
import java.time.LocalTime;

/** Plage horaire d'une journée ; start/end null = « non travaillé ». */
record TimeRange(LocalTime start, LocalTime end) {

	static final TimeRange NOT_WORKED = new TimeRange(null, null);

	boolean worked() {
		return start != null;
	}

	long minutes() {
		return worked() ? Duration.between(start, end).toMinutes() : 0;
	}

}
