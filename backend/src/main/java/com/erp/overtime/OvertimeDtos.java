package com.erp.overtime;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

import com.erp.common.RequestStatus;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class OvertimeDtos {

	private OvertimeDtos() {
	}

	public record OvertimeInput(@NotNull LocalDate date, @NotNull BigDecimal hours, @NotBlank String reason) {
	}

	public record OvertimeRequestDto(Long id, Long userId, LocalDate date, BigDecimal hours, String reason,
			RequestStatus status, String adminComment, OffsetDateTime decidedAt, OffsetDateTime createdAt) {

		static OvertimeRequestDto of(OvertimeRequest r) {
			return new OvertimeRequestDto(r.getId(), r.getUserId(), r.getWorkDate(), r.getHours(), r.getReason(),
					r.getStatus(), r.getAdminComment(), r.getDecidedAt(), r.getCreatedAt());
		}

	}

}
