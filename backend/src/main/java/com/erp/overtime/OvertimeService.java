package com.erp.overtime;

import java.util.List;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.erp.auth.AuthenticatedUser;
import com.erp.common.Hours;
import com.erp.common.RequestStatus;
import com.erp.common.RequestStatusChanged;
import com.erp.overtime.OvertimeDtos.OvertimeInput;
import com.erp.overtime.OvertimeDtos.OvertimeRequestDto;

/** Déclarations d'heures sup (spec §2) : une fois APPROVED, elles alimentent le solde. */
@Service
public class OvertimeService {

	private final OvertimeRequestRepository requests;

	private final ApplicationEventPublisher events;

	public OvertimeService(OvertimeRequestRepository requests, ApplicationEventPublisher events) {
		this.requests = requests;
		this.events = events;
	}

	@Transactional
	public OvertimeRequestDto create(AuthenticatedUser actor, OvertimeInput input) {
		Hours.requirePositive(input.hours(), 24);
		OvertimeRequest request = requests
			.save(new OvertimeRequest(actor.id(), input.date(), input.hours(), input.reason().trim()));
		publish(request);
		return OvertimeRequestDto.of(request);
	}

	@Transactional(readOnly = true)
	public List<OvertimeRequestDto> mine(Long userId) {
		return requests.findByUserIdOrderByWorkDateDesc(userId).stream().map(OvertimeRequestDto::of).toList();
	}

	@Transactional(readOnly = true)
	public List<OvertimeRequestDto> pending() {
		return requests.findByStatusOrderByCreatedAt(RequestStatus.PENDING)
			.stream()
			.map(OvertimeRequestDto::of)
			.toList();
	}

	/** Annulation par le demandeur uniquement. */
	@Transactional
	public OvertimeRequestDto cancel(AuthenticatedUser actor, Long id) {
		OvertimeRequest request = lockRequest(id);
		if (!request.getUserId().equals(actor.id())) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Vous ne pouvez annuler que vos propres demandes");
		}
		return transition(request, RequestStatus.CANCELLED, actor, null);
	}

	/** Décision d'un admin (droit vérifié par le controller). */
	@Transactional
	public OvertimeRequestDto decide(AuthenticatedUser admin, Long id, boolean approved, String comment) {
		return transition(lockRequest(id), approved ? RequestStatus.APPROVED : RequestStatus.REJECTED, admin, comment);
	}

	/** Seule méthode qui change le statut d'une déclaration d'heures sup. */
	private OvertimeRequestDto transition(OvertimeRequest request, RequestStatus target, AuthenticatedUser actor,
			String comment) {
		request.transition(target, actor.id(), blankToNull(comment));
		publish(request);
		return OvertimeRequestDto.of(request);
	}

	private void publish(OvertimeRequest request) {
		events.publishEvent(new RequestStatusChanged(RequestStatusChanged.Kind.OVERTIME, request.getId(),
				request.getUserId(), request.getStatus(), request.getAdminComment()));
	}

	/** Verrouille la demande avant toute transition (décisions simultanées sérialisées, la seconde → 409). */
	private OvertimeRequest lockRequest(Long id) {
		return requests.lockById(id)
			.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande introuvable"));
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

}
