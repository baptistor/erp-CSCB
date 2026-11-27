package com.erp.schedule;

import java.time.LocalDate;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.erp.auth.AuthenticatedUser;
import com.erp.schedule.ScheduleDtos.SchoolHolidayCalendarDto;
import com.erp.schedule.ScheduleDtos.SchoolHolidayValidationInput;

import jakarta.validation.Valid;

/** Semaines de vacances scolaires (lecture : tous ; écriture : ADMIN) et validation du calendrier (ADMIN). */
@RestController
@RequestMapping("/api")
public class SchoolHolidayController {

	private final SchoolHolidayService service;

	public SchoolHolidayController(SchoolHolidayService service) {
		this.service = service;
	}

	@GetMapping("/school-holiday-weeks")
	@PreAuthorize("isAuthenticated()")
	public List<LocalDate> list() {
		return service.list();
	}

	@PutMapping("/school-holiday-weeks/{weekStart}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PreAuthorize("hasRole('ADMIN')")
	public void mark(@PathVariable LocalDate weekStart) {
		service.mark(weekStart);
	}

	@DeleteMapping("/school-holiday-weeks/{weekStart}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PreAuthorize("hasRole('ADMIN')")
	public void unmark(@PathVariable LocalDate weekStart) {
		service.unmark(weekStart);
	}

	@GetMapping("/school-holiday-calendar")
	@PreAuthorize("hasRole('ADMIN')")
	public SchoolHolidayCalendarDto validation() {
		return service.validation();
	}

	@PutMapping("/school-holiday-calendar")
	@PreAuthorize("hasRole('ADMIN')")
	public SchoolHolidayCalendarDto validate(@AuthenticationPrincipal AuthenticatedUser admin,
			@Valid @RequestBody SchoolHolidayValidationInput input) {
		return service.validate(admin, input.validatedUntil());
	}

}
