package com.erp.leave;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;

import com.erp.common.RequestStatus;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.erp.overtime.OvertimeDtos.OvertimeRequestDto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class LeaveDtos {

	private LeaveDtos() {
	}

	/**
	 * Absence posée sur le planning : plage horaire d'un jour (startTime + endTime) ou journées entières
	 * (sans heures ; endDate facultative = startDate). Le nombre d'heures est calculé par le serveur.
	 */
	public record AbsenceInput(@NotNull AbsenceType type, @NotNull LocalDate startDate, LocalDate endDate,
			LocalTime startTime, LocalTime endTime, String comment) {
	}

	public record AbsenceRequestDto(Long id, Long userId, AbsenceType type, LocalDate startDate, LocalDate endDate,
			@JsonFormat(pattern = "HH:mm") LocalTime startTime, @JsonFormat(pattern = "HH:mm") LocalTime endTime,
			BigDecimal hours, String comment, RequestStatus status, String adminComment, OffsetDateTime decidedAt,
			OffsetDateTime createdAt) {

		static AbsenceRequestDto of(AbsenceRequest r) {
			return new AbsenceRequestDto(r.getId(), r.getUserId(), r.getType(), r.getStartDate(), r.getEndDate(),
					r.getStartTime(), r.getEndTime(), r.getHours(), r.getComment(), r.getStatus(),
					r.getAdminComment(), r.getDecidedAt(), r.getCreatedAt());
		}

	}

	/** Demandes d'un employé, ou demandes PENDING de tous (écran de validation). */
	public record RequestsDto(List<OvertimeRequestDto> overtimes, List<AbsenceRequestDto> absences) {
	}

	public record DecisionInput(@NotNull Boolean approved, String comment) {
	}

	public record AdjustmentInput(@NotNull BigDecimal hours, @NotBlank String reason) {
	}

	public enum MovementKind {

		OVERTIME, RECUP, ADJUSTMENT

	}

	/** Mouvement du solde : heures signées (+ heures sup / ajustement positif, − récup / ajustement négatif). */
	public record MovementDto(LocalDate date, MovementKind kind, BigDecimal hours, String label) {
	}

	/** solde = Σ heures sup APPROVED − Σ récup APPROVED + Σ ajustements ; disponible = solde − Σ récup PENDING. */
	public record BalanceDto(BigDecimal balance, BigDecimal available, List<MovementDto> movements) {
	}

}
