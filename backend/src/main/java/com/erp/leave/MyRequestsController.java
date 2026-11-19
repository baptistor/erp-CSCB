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
import com.erp.leave.LeaveDtos.AbsenceInput;
import com.erp.leave.LeaveDtos.AbsenceRequestDto;
import com.erp.leave.LeaveDtos.BalanceDto;
import com.erp.leave.LeaveDtos.RequestsDto;
import com.erp.overtime.OvertimeDtos.OvertimeInput;
import com.erp.overtime.OvertimeDtos.OvertimeRequestDto;
import com.erp.overtime.OvertimeService;

import jakarta.validation.Valid;

/** Demandes et solde de l'utilisateur connecté (écran /mes-demandes). */
@RestController
@RequestMapping("/api/me")
public class MyRequestsController {

	private final OvertimeService overtimes;

	private final AbsenceService absences;

	private final BalanceService balances;

	public MyRequestsController(OvertimeService overtimes, AbsenceService absences, BalanceService balances) {
		this.overtimes = overtimes;
		this.absences = absences;
		this.balances = balances;
	}

	@GetMapping("/requests")
	@PreAuthorize("isAuthenticated()")
	public RequestsDto requests(@AuthenticationPrincipal AuthenticatedUser me) {
		return new RequestsDto(overtimes.mine(me.id()), absences.mine(me.id()));
	}

	@GetMapping("/balance")
	@PreAuthorize("isAuthenticated()")
	public BalanceDto balance(@AuthenticationPrincipal AuthenticatedUser me) {
		return balances.details(me.id());
	}

	@PostMapping("/overtime-requests")
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("isAuthenticated()")
	public OvertimeRequestDto declareOvertime(@AuthenticationPrincipal AuthenticatedUser me,
			@Valid @RequestBody OvertimeInput input) {
		return overtimes.create(me, input);
	}

	@PostMapping("/overtime-requests/{id}/cancel")
	@PreAuthorize("isAuthenticated()")
	public OvertimeRequestDto cancelOvertime(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable Long id) {
		return overtimes.cancel(me, id);
	}

	@PostMapping("/absence-requests")
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("isAuthenticated()")
	public AbsenceRequestDto requestAbsence(@AuthenticationPrincipal AuthenticatedUser me,
			@Valid @RequestBody AbsenceInput input) {
		return absences.create(me, input);
	}

	@PostMapping("/absence-requests/{id}/cancel")
	@PreAuthorize("isAuthenticated()")
	public AbsenceRequestDto cancelAbsence(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable Long id) {
		return absences.cancel(me, id);
	}

}
