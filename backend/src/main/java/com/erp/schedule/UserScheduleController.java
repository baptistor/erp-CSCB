package com.erp.schedule;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.erp.auth.AuthenticatedUser;
import com.erp.schedule.ScheduleDtos.UserScheduleDto;

import jakarta.validation.Valid;

/** Semaines type + contrat d'un employé. Lecture : tous ; écriture : ADMIN, ou l'employé lui-même. */
@RestController
@RequestMapping("/api/users/{userId}/schedule")
public class UserScheduleController {

	private final ScheduleService service;

	public UserScheduleController(ScheduleService service) {
		this.service = service;
	}

	@GetMapping
	@PreAuthorize("isAuthenticated()")
	public UserScheduleDto get(@PathVariable Long userId) {
		return service.getSchedule(userId);
	}

	/** ADMIN : tout employé ; EMPLOYEE : ses propres semaines, sans changer son contrat (contrôlé dans le service). */
	@PutMapping
	@PreAuthorize("isAuthenticated()")
	public UserScheduleDto update(@AuthenticationPrincipal AuthenticatedUser actor, @PathVariable Long userId,
			@Valid @RequestBody UserScheduleDto input) {
		return service.updateSchedule(actor, userId, input);
	}

}
