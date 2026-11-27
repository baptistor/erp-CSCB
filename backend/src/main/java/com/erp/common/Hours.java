package com.erp.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Règle commune : tout se compte en heures, au pas de 0,25 (spec). */
public final class Hours {

	private static final BigDecimal QUARTERS = BigDecimal.valueOf(4);

	private Hours() {
	}

	public static boolean isQuarter(BigDecimal hours) {
		return hours.multiply(QUARTERS).stripTrailingZeros().scale() <= 0;
	}

	/** Minutes → heures arrondies au quart d'heure le plus proche (règle « pas de 0,25 »). */
	public static BigDecimal ofMinutes(long minutes) {
		long quarters = Math.round(minutes / 15.0);
		return BigDecimal.valueOf(quarters).divide(QUARTERS, 2, RoundingMode.UNNECESSARY);
	}

	/** Format lisible : 4 → « 4 h », 3.5 → « 3,5 h ». */
	public static String format(BigDecimal hours) {
		return hours.stripTrailingZeros().toPlainString().replace('.', ',') + " h";
	}

}
