package com.erp.schedule;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

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

	/** Journée type ; startTime/endTime null = non travaillé. */
	public record TypicalDayDto(@NotNull @Min(1) @Max(7) Integer dayOfWeek,
			@JsonFormat(pattern = "HH:mm") LocalTime startTime, @JsonFormat(pattern = "HH:mm") LocalTime endTime) {
	}

	public record UserScheduleDto(@NotNull BigDecimal minDailyHours,
			@NotNull @Size(min = 7, max = 7) List<@Valid @NotNull TypicalDayDto> days) {
	}

	/** Journée spéciale ; startTime/endTime null = non travaillé. */
	public record SpecialDayInput(@NotNull Long userId, @NotNull LocalDate date, LocalTime startTime,
			LocalTime endTime) {
	}

	public record SpecialDayDto(Long id, Long userId, LocalDate date, @JsonFormat(pattern = "HH:mm") LocalTime startTime,
			@JsonFormat(pattern = "HH:mm") LocalTime endTime) {

		static SpecialDayDto of(SpecialDay day) {
			TimeRange range = day.range();
			return new SpecialDayDto(day.getId(), day.getUserId(), day.getDayDate(), range.start(), range.end());
		}

	}

	/**
	 * Journée calculée d'un employé. Les journées types non travaillées ne sont pas renvoyées ; les
	 * journées spéciales le sont toujours (specialDayId non null), y compris « non travaillé ».
	 */
	public record PlanningDayDto(Long userId, LocalDate date, @JsonFormat(pattern = "HH:mm") LocalTime startTime,
			@JsonFormat(pattern = "HH:mm") LocalTime endTime, Long specialDayId) {
	}

	/** Absence approuvée, sans type ni commentaire (visible par tous). */
	public record PlanningAbsenceDto(Long id, Long userId, LocalDate startDate, LocalDate endDate) {
	}

	public record PlanningDto(List<PlanningDayDto> days, List<PlanningAbsenceDto> absences) {
	}

}
