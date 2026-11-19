package com.erp.leave;

import java.math.BigDecimal;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.erp.auth.AuthenticatedUser;
import com.erp.common.Hours;
import com.erp.common.RequestStatus;
import com.erp.leave.LeaveDtos.AdjustmentInput;
import com.erp.leave.LeaveDtos.BalanceDto;
import com.erp.leave.LeaveDtos.MovementDto;
import com.erp.leave.LeaveDtos.MovementKind;
import com.erp.overtime.OvertimeRequestRepository;
import com.erp.user.AppUserRepository;

/** Solde d'heures sup (spec) : calculé à la demande à partir des demandes et des ajustements. */
@Service
public class BalanceService {

	private static final DateTimeFormatter DATE_FR = DateTimeFormatter.ofPattern("dd/MM/yyyy");

	private static final ZoneId PARIS = ZoneId.of("Europe/Paris");

	private final OvertimeRequestRepository overtimes;

	private final AbsenceRequestRepository absences;

	private final BalanceAdjustmentRepository adjustments;

	private final AppUserRepository users;

	public BalanceService(OvertimeRequestRepository overtimes, AbsenceRequestRepository absences,
			BalanceAdjustmentRepository adjustments, AppUserRepository users) {
		this.overtimes = overtimes;
		this.absences = absences;
		this.adjustments = adjustments;
		this.users = users;
	}

	/** Σ heures sup APPROVED − Σ récup APPROVED + Σ ajustements. */
	@Transactional(readOnly = true)
	public BigDecimal balance(Long userId) {
		return overtimes.sumHours(userId, RequestStatus.APPROVED)
			.subtract(absences.sumHours(userId, AbsenceType.RECUP_HEURES_SUP, RequestStatus.APPROVED))
			.add(adjustments.sumHours(userId));
	}

	/** Solde − Σ récup PENDING. */
	@Transactional(readOnly = true)
	public BigDecimal available(Long userId) {
		return balance(userId)
			.subtract(absences.sumHours(userId, AbsenceType.RECUP_HEURES_SUP, RequestStatus.PENDING));
	}

	@Transactional(readOnly = true)
	public BalanceDto details(Long userId) {
		requireUser(userId);
		List<MovementDto> movements = new ArrayList<>();
		overtimes.findByUserIdAndStatusOrderByWorkDateDesc(userId, RequestStatus.APPROVED)
			.forEach(o -> movements.add(new MovementDto(o.getWorkDate(), MovementKind.OVERTIME, o.getHours(),
					"Heures sup : " + o.getReason())));
		absences
			.findByUserIdAndTypeAndStatusOrderByStartDateDesc(userId, AbsenceType.RECUP_HEURES_SUP,
					RequestStatus.APPROVED)
			.forEach(a -> movements.add(new MovementDto(a.getStartDate(), MovementKind.RECUP, a.getHours().negate(),
					recupLabel(a))));
		adjustments.findByUserIdOrderByCreatedAtDesc(userId)
			.forEach(b -> movements.add(new MovementDto(b.getCreatedAt().atZoneSameInstant(PARIS).toLocalDate(),
					MovementKind.ADJUSTMENT, b.getHours(), "Ajustement : " + b.getReason())));
		movements.sort(Comparator.comparing(MovementDto::date).reversed());
		return new BalanceDto(balance(userId), available(userId), movements);
	}

	@Transactional
	public BalanceDto adjust(AuthenticatedUser admin, Long userId, AdjustmentInput input) {
		// même verrou que la création / l'approbation d'une récup : un ajustement négatif concurrent est sérialisé
		lock(userId);
		BigDecimal hours = input.hours();
		if (hours.signum() == 0 || hours.abs().compareTo(BigDecimal.valueOf(999)) > 0 || !Hours.isQuarter(hours)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"L'ajustement doit être non nul, au pas de 0,25 h (max ±999 h)");
		}
		adjustments.save(new BalanceAdjustment(userId, hours, input.reason().trim(), admin.id()));
		return details(userId);
	}

	private static String recupLabel(AbsenceRequest a) {
		if (!a.isFullDays()) {
			return "Récupération le " + a.getStartDate().format(DATE_FR) + " de " + a.getStartTime() + " à "
					+ a.getEndTime();
		}
		return a.getStartDate().equals(a.getEndDate()) ? "Récupération le " + a.getStartDate().format(DATE_FR)
				: "Récupération du " + a.getStartDate().format(DATE_FR) + " au " + a.getEndDate().format(DATE_FR);
	}

	/** Verrouille l'employé pour sérialiser les opérations qui dépendent de son solde. */
	void lock(Long userId) {
		users.lockById(userId)
			.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employé introuvable"));
	}

	private void requireUser(Long userId) {
		if (!users.existsById(userId)) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Employé introuvable");
		}
	}

}
