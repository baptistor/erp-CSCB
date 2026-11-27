package com.erp.leave;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.erp.auth.AuthenticatedUser;
import com.erp.leave.LeaveDtos.AbsenceRequestDto;
import com.erp.leave.LeaveDtos.AdjustmentInput;
import com.erp.leave.LeaveDtos.BalanceDto;
import com.erp.leave.LeaveDtos.DecisionInput;
import com.erp.leave.LeaveDtos.RequestsDto;
import com.erp.overtime.OvertimeDtos.OvertimeInput;
import com.erp.overtime.OvertimeDtos.OvertimeRequestDto;
import com.erp.overtime.OvertimeService;

import jakarta.validation.Valid;

/** Validation des demandes, heures sup saisies pour un employé et ajustements de solde — ADMIN uniquement. */
@RestController
@RequestMapping("/api/admin")
public class AdminRequestsController {

	private final OvertimeService overtimes;

	private final AbsenceService absences;

	private final BalanceService balances;

	public AdminRequestsController(OvertimeService overtimes, AbsenceService absences, BalanceService balances) {
		this.overtimes = overtimes;
		this.absences = absences;
		this.balances = balances;
	}

	@GetMapping("/pending-requests")
	@PreAuthorize("hasRole('ADMIN')")
	public RequestsDto pending() {
		return new RequestsDto(overtimes.pending(), absences.pending());
	}

	@PostMapping("/overtime-requests/{id}/decision")
	@PreAuthorize("hasRole('ADMIN')")
	public OvertimeRequestDto decideOvertime(@AuthenticationPrincipal AuthenticatedUser admin, @PathVariable Long id,
			@Valid @RequestBody DecisionInput input) {
		return overtimes.decide(admin, id, input.approved(), input.comment());
	}

	@PostMapping("/overtime-requests/{id}/cancel")
	@PreAuthorize("hasRole('ADMIN')")
	public OvertimeRequestDto cancelOvertime(@AuthenticationPrincipal AuthenticatedUser admin, @PathVariable Long id) {
		return overtimes.withdraw(admin, id);
	}

	@PostMapping("/users/{userId}/overtime-requests")
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasRole('ADMIN')")
	public OvertimeRequestDto declareOvertime(@AuthenticationPrincipal AuthenticatedUser admin,
			@PathVariable Long userId, @Valid @RequestBody OvertimeInput input) {
		return overtimes.createFor(admin, userId, input);
	}

	@PostMapping("/absence-requests/{id}/decision")
	@PreAuthorize("hasRole('ADMIN')")
	public AbsenceRequestDto decideAbsence(@AuthenticationPrincipal AuthenticatedUser admin, @PathVariable Long id,
			@Valid @RequestBody DecisionInput input) {
		return absences.decide(admin, id, input.approved(), input.comment());
	}

	@GetMapping("/users/{userId}/balance")
	@PreAuthorize("hasRole('ADMIN')")
	public BalanceDto balance(@PathVariable Long userId) {
		return balances.details(userId);
	}

	@PostMapping("/users/{userId}/balance-adjustments")
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasRole('ADMIN')")
	public BalanceDto adjust(@AuthenticationPrincipal AuthenticatedUser admin, @PathVariable Long userId,
			@Valid @RequestBody AdjustmentInput input) {
		return balances.adjust(admin, userId, input);
	}

}
