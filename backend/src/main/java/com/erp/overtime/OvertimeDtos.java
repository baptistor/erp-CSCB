package com.erp.overtime;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;

import com.erp.common.RequestStatus;
import com.fasterxml.jackson.annotation.JsonFormat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class OvertimeDtos {

	private OvertimeDtos() {
	}

	/** Heures sup posées sur le planning : le nombre d'heures est calculé (durée de la plage). */
	public record OvertimeInput(@NotNull LocalDate date, @NotNull LocalTime startTime, @NotNull LocalTime endTime,
			@NotBlank String reason) {
	}

	public record OvertimeRequestDto(Long id, Long userId, LocalDate date,
			@JsonFormat(pattern = "HH:mm") LocalTime startTime, @JsonFormat(pattern = "HH:mm") LocalTime endTime,
			Long createdBy, BigDecimal hours, String reason,
			RequestStatus status, String adminComment, OffsetDateTime decidedAt, OffsetDateTime createdAt) {

		static OvertimeRequestDto of(OvertimeRequest r) {
			return new OvertimeRequestDto(r.getId(), r.getUserId(), r.getWorkDate(), r.getStartTime(), r.getEndTime(), r.getCreatedBy(), r.getHours(), r.getReason(),
					r.getStatus(), r.getAdminComment(), r.getDecidedAt(), r.getCreatedAt());
		}

	}

}
