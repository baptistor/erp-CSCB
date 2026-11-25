package com.erp.leave;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.erp.auth.AuthenticatedUser;
import com.erp.common.Hours;
import com.erp.common.RequestStatus;
import com.erp.common.RequestStatusChanged;
import com.erp.leave.LeaveDtos.AbsenceInput;
import com.erp.leave.LeaveDtos.AbsenceRequestDto;
import com.erp.schedule.ScheduleService;
import com.erp.schedule.TimeRange;

/**
 * Absences (spec §3), posées sur le planning : plage horaire d'un jour, ou journées entières. Le nombre d'heures est
 * calculé à partir du planning de l'employé. RECUP_HEURES_SUP consomme le solde, SANS_SOLDE est neutre.
 */
@Service
public class AbsenceService {

	private static final Set<RequestStatus> ACTIVE = Set.of(RequestStatus.PENDING, RequestStatus.APPROVED);

	private static final int MAX_DAYS = 62;

	private static final int WHOLE_DAY_END = 24 * 60;

	/** Capacité de la colonne absence_request.hours (NUMERIC(5,2)). */
	private static final BigDecimal MAX_HOURS = BigDecimal.valueOf(999);

	private static final DateTimeFormatter DATE_FR = DateTimeFormatter.ofPattern("dd/MM/yyyy");

	private final AbsenceRequestRepository requests;

	private final BalanceService balances;

	private final ScheduleService schedules;

	private final ApplicationEventPublisher events;

	private final Clock clock;

	public AbsenceService(AbsenceRequestRepository requests, BalanceService balances, ScheduleService schedules,
			ApplicationEventPublisher events, Clock clock) {
		this.clock = clock;
		this.requests = requests;
		this.balances = balances;
		this.schedules = schedules;
		this.events = events;
	}

	/** Intervalle occupé un jour donné, en minutes depuis minuit [start, end[. */
	private record Interval(int start, int end) {

		boolean overlaps(Interval other) {
			return start < other.end && other.start < end;
		}

		static Interval of(LocalTime start, LocalTime end) {
			return new Interval(start.toSecondOfDay() / 60, end.toSecondOfDay() / 60);
		}

	}

	@Transactional
	public AbsenceRequestDto create(AuthenticatedUser actor, AbsenceInput input) {
		Long userId = actor.id();
		LocalDate start = input.startDate();
		LocalDate end = input.endDate() == null ? start : input.endDate();
		if (start.isBefore(LocalDate.now(clock))) {
			throw badRequest("Une absence se pose à partir d'aujourd'hui");
		}
		if (end.isBefore(start)) {
			throw badRequest("La date de fin doit être égale ou postérieure à la date de début");
		}
		if ((input.startTime() == null) != (input.endTime() == null)) {
			throw badRequest("Renseignez l'heure de début et l'heure de fin, ou aucune (journées entières)");
		}

		// Intervalles demandés par jour + nombre d'heures, calculés depuis le planning de l'employé
		Map<LocalDate, Interval> wanted = new LinkedHashMap<>();
		long minutes;
		if (input.startTime() != null) {
			minutes = timedRange(userId, start, end, input.startTime(), input.endTime());
			wanted.put(start, Interval.of(input.startTime(), input.endTime()));
		}
		else {
			if (ChronoUnit.DAYS.between(start, end) >= MAX_DAYS) {
				throw badRequest("Une absence couvre au plus " + MAX_DAYS + " jours");
			}
			minutes = 0;
			for (LocalDate day = start; !day.isAfter(end); day = day.plusDays(1)) {
				minutes += schedules.plannedRanges(userId, day).stream().mapToLong(TimeRange::minutes).sum();
				wanted.put(day, new Interval(0, WHOLE_DAY_END));
			}
			if (minutes == 0) {
				throw badRequest("Aucun jour travaillé sur cette période");
			}
		}
		BigDecimal hours = toQuarterHours(minutes);
		if (hours.compareTo(MAX_HOURS) > 0) {
			throw badRequest("Une absence ne peut pas dépasser " + Hours.format(MAX_HOURS) + " (" + Hours.format(hours)
					+ " sur cette période) : découpez-la en plusieurs demandes");
		}

		balances.lock(userId);
		for (AbsenceRequest existing : requests.findOverlapping(userId, start, end, ACTIVE)) {
			for (LocalDate day = existing.getStartDate(); !day.isAfter(existing.getEndDate()); day = day.plusDays(1)) {
				Interval mine = wanted.get(day);
				Interval other = existing.isFullDays() ? new Interval(0, WHOLE_DAY_END)
						: Interval.of(existing.getStartTime(), existing.getEndTime());
				if (mine != null && mine.overlaps(other)) {
					throw badRequest("Cette absence chevauche une autre absence en attente ou approuvée le "
							+ day.format(DATE_FR));
				}
			}
		}
		if (input.type() == AbsenceType.RECUP_HEURES_SUP) {
			BigDecimal available = balances.available(userId);
			if (hours.compareTo(available) > 0) {
				throw badRequest("Solde insuffisant : " + Hours.format(available) + " disponibles (solde moins les"
						+ " récupérations en attente), " + Hours.format(hours) + " demandées");
			}
		}
		AbsenceRequest request = requests.save(new AbsenceRequest(userId, input.type(), start, end,
				input.startTime(), input.endTime(), hours, blankToNull(input.comment())));
		publish(request);
		return AbsenceRequestDto.of(request);
	}

	/**
	 * Plage d'un seul jour, au quart d'heure, qui commence et finit pendant les heures prévues ; renvoie les minutes
	 * travaillées qu'elle couvre (pause de midi et coupures non comptées).
	 */
	private long timedRange(Long userId, LocalDate start, LocalDate end, LocalTime from, LocalTime to) {
		if (!end.equals(start)) {
			throw badRequest("Une absence avec horaires porte sur un seul jour");
		}
		if (!to.isAfter(from)) {
			throw badRequest("L'heure de fin doit être après l'heure de début");
		}
		if (!onQuarter(from) || !onQuarter(to)) {
			throw badRequest("Les horaires d'absence se posent au quart d'heure (ex. 14:00, 14:15…)");
		}
		List<TimeRange> planned = schedules.plannedRanges(userId, start);
		if (planned.isEmpty()) {
			throw badRequest("Le " + start.format(DATE_FR) + " n'est pas un jour travaillé");
		}
		if (planned.stream().noneMatch(r -> r.canStartAt(from)) || planned.stream().noneMatch(r -> r.canEndAt(to))) {
			throw badRequest("L'absence doit commencer et finir pendant vos horaires du " + start.format(DATE_FR) + " ("
					+ planned.stream().map(r -> r.start() + "–" + r.end()).collect(Collectors.joining(", ")) + ")");
		}
		return planned.stream().mapToLong(r -> r.minutesWithin(from, to)).sum();
	}

	private static boolean onQuarter(LocalTime time) {
		return time.getMinute() % 15 == 0 && time.getSecond() == 0 && time.getNano() == 0;
	}

	/** Minutes → heures arrondies au quart d'heure le plus proche (règle « pas de 0,25 »). */
	static BigDecimal toQuarterHours(long minutes) {
		long quarters = Math.round(minutes / 15.0);
		return BigDecimal.valueOf(quarters).divide(BigDecimal.valueOf(4), 2, RoundingMode.UNNECESSARY);
	}

	@Transactional(readOnly = true)
	public List<AbsenceRequestDto> mine(Long userId) {
		return requests.findByUserIdOrderByStartDateDesc(userId).stream().map(AbsenceRequestDto::of).toList();
	}

	@Transactional(readOnly = true)
	public List<AbsenceRequestDto> pending() {
		return requests.findByStatusOrderByCreatedAt(RequestStatus.PENDING)
			.stream()
			.map(AbsenceRequestDto::of)
			.toList();
	}

	/**
	 * Suppression par le demandeur uniquement (spec §3) : absence en attente ou acceptée, pas encore commencée.
	 * Passage au statut CANCELLED (historique conservé) ; une récup acceptée rend ainsi ses heures au solde.
	 */
	@Transactional
	public AbsenceRequestDto cancel(AuthenticatedUser actor, Long id) {
		AbsenceRequest request = lockRequest(id);
		if (!request.getUserId().equals(actor.id())) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Vous ne pouvez supprimer que vos propres absences");
		}
		if (request.getStartDate().isBefore(LocalDate.now(clock))) {
			throw badRequest("Une absence déjà commencée ne peut plus être supprimée");
		}
		return transition(request, RequestStatus.CANCELLED, actor, null);
	}

	/**
	 * Décision d'un admin (droit vérifié par le controller). Une récup n'est approuvée que si le solde (hors
	 * demandes en attente) la couvre encore — il a pu baisser depuis la création (ajustement négatif).
	 */
	@Transactional
	public AbsenceRequestDto decide(AuthenticatedUser admin, Long id, boolean approved, String comment) {
		AbsenceRequest request = lockRequest(id);
		if (approved && request.getType() == AbsenceType.RECUP_HEURES_SUP
				&& request.getStatus() == RequestStatus.PENDING) {
			balances.lock(request.getUserId());
			BigDecimal balance = balances.balance(request.getUserId());
			if (request.getHours().compareTo(balance) > 0) {
				throw new ResponseStatusException(HttpStatus.CONFLICT, "Solde insuffisant pour approuver : "
						+ Hours.format(balance) + " au solde, " + Hours.format(request.getHours()) + " demandées");
			}
		}
		return transition(request, approved ? RequestStatus.APPROVED : RequestStatus.REJECTED, admin, comment);
	}

	/** Seule méthode qui change le statut d'une absence. */
	private AbsenceRequestDto transition(AbsenceRequest request, RequestStatus target, AuthenticatedUser actor,
			String comment) {
		request.transition(target, actor.id(), blankToNull(comment));
		publish(request);
		return AbsenceRequestDto.of(request);
	}

	private void publish(AbsenceRequest request) {
		events.publishEvent(new RequestStatusChanged(RequestStatusChanged.Kind.ABSENCE, request.getId(),
				request.getUserId(), request.getStatus(), request.getAdminComment()));
	}

	/**
	 * Verrouille la demande (SELECT … FOR UPDATE) avant toute transition : deux décisions simultanées (annulation
	 * par le demandeur et approbation par l'admin) sont sérialisées, la seconde reçoit un 409.
	 */
	private AbsenceRequest lockRequest(Long id) {
		return requests.lockById(id)
			.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Demande introuvable"));
	}

	private static ResponseStatusException badRequest(String message) {
		return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

}
