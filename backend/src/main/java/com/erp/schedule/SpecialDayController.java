package com.erp.schedule;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.erp.auth.AuthenticatedUser;
import com.erp.schedule.ScheduleDtos.SpecialDayDto;
import com.erp.schedule.ScheduleDtos.SpecialDayInput;

import jakarta.validation.Valid;

/**
 * Horaires modifiés d'un jour (ressource technique « special-days »). Droits contrôlés dans le service : ADMIN pour tous ; EMPLOYEE pour ses propres
 * journées, à partir d'aujourd'hui.
 */
@RestController
@RequestMapping("/api/special-days")
public class SpecialDayController {

	private final ScheduleService service;

	public SpecialDayController(ScheduleService service) {
		this.service = service;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("isAuthenticated()")
	public SpecialDayDto create(@AuthenticationPrincipal AuthenticatedUser actor, @Valid @RequestBody SpecialDayInput input) {
		return service.createSpecialDay(actor, input);
	}

	@PutMapping("/{id}")
	@PreAuthorize("isAuthenticated()")
	public SpecialDayDto update(@AuthenticationPrincipal AuthenticatedUser actor, @PathVariable Long id, @Valid @RequestBody SpecialDayInput input) {
		return service.updateSpecialDay(actor, id, input);
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PreAuthorize("isAuthenticated()")
	public void delete(@AuthenticationPrincipal AuthenticatedUser actor, @PathVariable Long id) {
		service.deleteSpecialDay(actor, id);
	}

}
