package com.erp.schedule;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import com.erp.common.RequestStatus;
import com.fasterxml.jackson.annotation.JsonFormat;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** DTO du module planning (records regroupés pour rester compact en V1). */
public final class ScheduleDtos {

	private ScheduleDtos() {
	}

	/** Journée type : matin et après-midi, chacun facultatif (null). */
	public record TypicalDayDto(@NotNull @Min(1) @Max(7) Integer dayOfWeek,
			@JsonFormat(pattern = "HH:mm") LocalTime morningStart, @JsonFormat(pattern = "HH:mm") LocalTime morningEnd,
			@JsonFormat(pattern = "HH:mm") LocalTime afternoonStart,
			@JsonFormat(pattern = "HH:mm") LocalTime afternoonEnd) {

		static TypicalDayDto of(TypicalDay day) {
			TimeRange morning = day.morning();
			TimeRange afternoon = day.afternoon();
			return new TypicalDayDto(day.getDayOfWeek(), morning.start(), morning.end(), afternoon.start(),
					afternoon.end());
		}

	}

	/** days = semaine classique ; holidayDays = semaine de vacances, null = à compléter (reprend la classique). */
	public record UserScheduleDto(@NotNull BigDecimal weeklyHours,
			@NotNull @Size(min = 7, max = 7) List<@Valid @NotNull TypicalDayDto> days,
			@Size(min = 7, max = 7) List<@Valid @NotNull TypicalDayDto> holidayDays) {
	}

	/** Plage d'heures ajoutée à un jour, en dehors de la journée type. */
	public record SpecialDayInput(@NotNull Long userId, @NotNull LocalDate date, @NotNull LocalTime startTime,
			@NotNull LocalTime endTime) {
	}

	public record SpecialDayDto(Long id, Long userId, LocalDate date, @JsonFormat(pattern = "HH:mm") LocalTime startTime,
			@JsonFormat(pattern = "HH:mm") LocalTime endTime) {

		static SpecialDayDto of(SpecialDay day) {
			TimeRange range = day.range();
			return new SpecialDayDto(day.getId(), day.getUserId(), day.getDayDate(), range.start(), range.end());
		}

	}

	/**
	 * Plage travaillée d'un employé : journée type (specialDayId null, matin et après-midi) ou heures ajoutées
	 * (specialDayId renseigné, plusieurs possibles).
	 */
	public record PlanningDayDto(Long userId, LocalDate date, @JsonFormat(pattern = "HH:mm") LocalTime startTime,
			@JsonFormat(pattern = "HH:mm") LocalTime endTime, Long specialDayId) {
	}

	/**
	 * Absence affichée au planning, sans type ni commentaire : PENDING ou APPROVED, visible par tous.
	 * startTime/endTime null = journées entières.
	 */
	public record PlanningAbsenceDto(Long id, Long userId, LocalDate startDate, LocalDate endDate,
			@JsonFormat(pattern = "HH:mm") LocalTime startTime, @JsonFormat(pattern = "HH:mm") LocalTime endTime,
			RequestStatus status) {
	}

	/** holidayWeeks : lundis des semaines de vacances scolaires touchant la période. */
	public record PlanningDto(List<PlanningDayDto> days, List<PlanningAbsenceDto> absences,
			List<LocalDate> holidayWeeks) {
	}

}
