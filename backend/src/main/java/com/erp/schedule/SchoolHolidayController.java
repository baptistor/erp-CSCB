package com.erp.schedule;

import java.time.LocalDate;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Semaines de vacances scolaires. Lecture : tous ; écriture : ADMIN. */
@RestController
@RequestMapping("/api/school-holiday-weeks")
public class SchoolHolidayController {

	private final SchoolHolidayService service;

	public SchoolHolidayController(SchoolHolidayService service) {
		this.service = service;
	}

	@GetMapping
	@PreAuthorize("isAuthenticated()")
	public List<LocalDate> list() {
		return service.list();
	}

	@PutMapping("/{weekStart}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PreAuthorize("hasRole('ADMIN')")
	public void mark(@PathVariable LocalDate weekStart) {
		service.mark(weekStart);
	}

	@DeleteMapping("/{weekStart}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PreAuthorize("hasRole('ADMIN')")
	public void unmark(@PathVariable LocalDate weekStart) {
		service.unmark(weekStart);
	}

}
