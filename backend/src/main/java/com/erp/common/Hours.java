package com.erp.common;

import java.math.BigDecimal;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Règle commune : tout se compte en heures, au pas de 0,25 (spec). */
public final class Hours {

	private static final BigDecimal QUARTERS = BigDecimal.valueOf(4);

	private Hours() {
	}

	public static boolean isQuarter(BigDecimal hours) {
		return hours.multiply(QUARTERS).stripTrailingZeros().scale() <= 0;
	}

	/** Nombre d'heures strictement positif, au pas de 0,25, au plus {@code max}. */
	public static BigDecimal requirePositive(BigDecimal hours, int max) {
		if (hours == null || hours.signum() <= 0 || hours.compareTo(BigDecimal.valueOf(max)) > 0 || !isQuarter(hours)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Le nombre d'heures doit être positif, au pas de 0,25 h (max " + max + " h)");
		}
		return hours;
	}

	/** Format lisible : 4 → « 4 h », 3.5 → « 3,5 h ». */
	public static String format(BigDecimal hours) {
		return hours.stripTrailingZeros().toPlainString().replace('.', ',') + " h";
	}

}
