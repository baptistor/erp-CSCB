package com.erp.overtime;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.erp.auth.AuthenticatedUser;
import com.erp.leave.BalanceService;
import com.erp.common.Hours;
import com.erp.common.RequestStatus;
import com.erp.common.RequestStatusChanged;
import com.erp.overtime.OvertimeDtos.OvertimeInput;
import com.erp.overtime.OvertimeDtos.OvertimeRequestDto;
import com.erp.schedule.ScheduleService;
import com.erp.schedule.TimeRange;
import com.erp.user.AppUserRepository;

/** Heures sup posées sur le planning (spec §2) : chaque plage est une demande ; une fois APPROVED, elle alimente le solde. */
@Service
public class OvertimeService {

	static final int PAST_DAYS = 31;

	static final int FUTURE_DAYS = 62;

	private static final Set<RequestStatus> ACTIVE = Set.of(RequestStatus.PENDING, RequestStatus.APPROVED);

	private static final DateTimeFormatter DATE_FR = DateTimeFormatter.ofPattern("dd/MM/yyyy");

	private final OvertimeRequestRepository requests;

	private final ScheduleService schedules;

	private final AppUserRepository users;

	private final Clock clock;

	private final ApplicationEventPublisher events;

	private final BalanceService balances;

	public OvertimeService(OvertimeRequestRepository requests, ScheduleService schedules, AppUserRepository users,
			ApplicationEventPublisher events, Clock clock, BalanceService balances) {
		this.balances = balances;
		this.schedules = schedules;
		this.users = users;
		this.clock = clock;
		this.requests = requests;
		this.events = events;
	}

	/**
	 * Heures sup posées sur le planning (spec §2) : plage au quart d'heure, de J−31 à J+62, jamais sur la journée type
	 * ni sur la pause de midi (400), ni sur une autre heure sup en attente / acceptée de l'employé (409). L'employé est
	 * verrouillé pour que deux demandes simultanées ne se chevauchent pas.
	 */
	@Transactional
	public OvertimeRequestDto create(AuthenticatedUser actor, OvertimeInput input) {
		return save(actor.id(), input, null);
	}

	/** ADMIN : heures sup posées pour un employé, mêmes règles, acceptées directement (droit vérifié par le controller). */
	@Transactional
	public OvertimeRequestDto createFor(AuthenticatedUser admin, Long userId, OvertimeInput input) {
		if (userId.equals(admin.id())) {
			throw badRequest("Un admin ne s'ajoute pas lui-même des heures sup acceptées : posez une demande");
		}
		return save(userId, input, admin.id());
	}

	private OvertimeRequestDto save(Long userId, OvertimeInput input, Long adminId) {
		LocalDate date = input.date();
		TimeRange range = new TimeRange(input.startTime(), input.endTime());
		LocalDate today = LocalDate.now(clock);
		if (date.isBefore(today.minusDays(PAST_DAYS)) || date.isAfter(today.plusDays(FUTURE_DAYS))) {
			throw badRequest("Les heures sup se posent de " + PAST_DAYS + " jours en arrière à " + FUTURE_DAYS
					+ " jours à l'avance");
		}
		if (!range.end().isAfter(range.start())) {
			throw badRequest("L'heure de fin doit être après l'heure de début");
		}
		if (!onQuarter(range.start()) || !onQuarter(range.end())) {
			throw badRequest("Les heures sup se posent au quart d'heure (ex. 18:00, 18:15…)");
		}
		if (date.getDayOfWeek() == DayOfWeek.SUNDAY) {
			throw badRequest("Le centre est fermé le dimanche");
		}
		if (range.overlaps(TimeRange.BREAK) && schedules.hasBreak(date)) {
			throw badRequest("Les heures sup ne doivent pas empiéter sur la pause de midi (12:30–13:30)");
		}
		users.lockById(userId)
			.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employé introuvable"));
		for (TimeRange typical : schedules.typicalRanges(userId, date)) {
			if (range.overlaps(typical)) {
				throw badRequest("Les heures sup ne doivent pas empiéter sur la journée type du "
						+ date.format(DATE_FR) + " (" + typical.start() + "–" + typical.end() + ")");
			}
		}
		for (OvertimeRequest other : requests.findPlaced(userId, date, ACTIVE)) {
			if (range.overlaps(new TimeRange(other.getStartTime(), other.getEndTime()))) {
				throw new ResponseStatusException(HttpStatus.CONFLICT, "Ces heures chevauchent une autre demande "
						+ "d'heures sup (" + other.getStartTime() + "–" + other.getEndTime() + ")");
			}
		}
		BigDecimal hours = Hours.ofMinutes(range.minutes());
		String reason = input.reason().trim();
		OvertimeRequest request = requests.save(adminId == null
				? new OvertimeRequest(userId, date, range.start(), range.end(), hours, reason)
				: OvertimeRequest.approvedBy(adminId, userId, date, range.start(), range.end(), hours, reason));
		publish(request);
		return OvertimeRequestDto.of(request);
	}

	private static boolean onQuarter(LocalTime time) {
		return time.getMinute() % 15 == 0 && time.getSecond() == 0 && time.getNano() == 0;
	}

	private static ResponseStatusException badRequest(String message) {
		return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
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

	/**
	 * Retrait par un admin (droit vérifié par le controller) : heures sup en attente ou acceptées → CANCELLED. L'employé
	 * est verrouillé (comme pour une récup) ; refusé (409) si le disponible de l'employé deviendrait négatif.
	 */
	@Transactional
	public OvertimeRequestDto withdraw(AuthenticatedUser admin, Long id) {
		Long userId = requests.findById(id)
			.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande introuvable"))
			.getUserId();
		users.lockById(userId);
		OvertimeRequest request = lockRequest(id);
		if (request.getStatus() == RequestStatus.APPROVED) {
			BigDecimal after = balances.available(userId).subtract(request.getHours());
			if (after.signum() < 0) {
				throw new ResponseStatusException(HttpStatus.CONFLICT, "Retrait impossible : ces heures sont déjà "
						+ "utilisées en récupération (le disponible passerait à " + after.stripTrailingZeros().toPlainString()
						+ " h)");
			}
		}
		request.withdraw(admin.id());
		publish(request);
		return OvertimeRequestDto.of(request);
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
