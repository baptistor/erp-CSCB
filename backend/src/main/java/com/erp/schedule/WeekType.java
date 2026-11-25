package com.erp.schedule;

/** Type de semaine (spec §1) : classique, ou vacances scolaires (marquée par l'admin). */
public enum WeekType {

	CLASSIC("Semaine classique"), HOLIDAY("Semaine de vacances");

	private final String label;

	WeekType(String label) {
		this.label = label;
	}

	String label() {
		return label;
	}

}
