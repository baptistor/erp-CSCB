package com.erp.schedule;

import java.time.LocalDate;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.erp.auth.AuthenticatedUser;
import com.erp.schedule.ScheduleDtos.PlanningDto;

@RestController
@RequestMapping("/api/planning")
public class PlanningController {

	private final ScheduleService service;

	public PlanningController(ScheduleService service) {
		this.service = service;
	}

	@GetMapping
	@PreAuthorize("isAuthenticated()")
	public PlanningDto planning(@AuthenticationPrincipal AuthenticatedUser viewer, @RequestParam LocalDate from,
			@RequestParam LocalDate to) {
		return service.planning(viewer, from, to);
	}

}
