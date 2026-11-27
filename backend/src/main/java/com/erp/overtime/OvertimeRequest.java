package com.erp.overtime;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.erp.common.RequestStatus;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Demande d'heures supplémentaires, posée sur le planning avec sa plage horaire (spec §2). */
@Entity
@Table(name = "overtime_request")
public class OvertimeRequest {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false)
	private Long userId;

	@Column(nullable = false)
	private LocalDate workDate;

	@Column(nullable = false)
	private BigDecimal hours;

	@Column(nullable = false)
	private String reason;

	/** Null pour les anciennes déclarations sans plage horaire. */
	private LocalTime startTime;

	private LocalTime endTime;

	/** Admin qui a saisi ces heures pour l'employé ; null = demandées par l'employé lui-même. */
	private Long createdBy;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private RequestStatus status = RequestStatus.PENDING;

	private String adminComment;

	private Long decidedBy;

	private OffsetDateTime decidedAt;

	@Column(nullable = false, updatable = false)
	private OffsetDateTime createdAt = OffsetDateTime.now();

	protected OvertimeRequest() {
	}

	OvertimeRequest(Long userId, LocalDate workDate, LocalTime startTime, LocalTime endTime, BigDecimal hours,
			String reason) {
		this.userId = userId;
		this.workDate = workDate;
		this.startTime = startTime;
		this.endTime = endTime;
		this.hours = hours;
		this.reason = reason;
	}

	/** Heures sup saisies par un admin pour un employé : acceptées directement (spec §1). */
	static OvertimeRequest approvedBy(Long adminId, Long userId, LocalDate workDate, LocalTime startTime,
			LocalTime endTime, BigDecimal hours, String reason) {
		OvertimeRequest request = new OvertimeRequest(userId, workDate, startTime, endTime, hours, reason);
		request.createdBy = adminId;
		request.status = RequestStatus.APPROVED;
		request.decidedBy = adminId;
		request.decidedAt = OffsetDateTime.now();
		return request;
	}

	/** Retrait par un admin : depuis PENDING ou APPROVED (409 sinon) ; une heure sup acceptée sort du solde. */
	void withdraw(Long adminId) {
		if (status != RequestStatus.PENDING && status != RequestStatus.APPROVED) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "Ces heures sup sont déjà refusées ou annulées");
		}
		this.status = RequestStatus.CANCELLED;
		this.decidedBy = adminId;
		this.decidedAt = OffsetDateTime.now();
	}

	/** Transition depuis PENDING uniquement (409 sinon). */
	void transition(RequestStatus target, Long actorId, String adminComment) {
		if (status != RequestStatus.PENDING) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "Cette demande n'est plus en attente");
		}
		this.status = target;
		if (target != RequestStatus.CANCELLED) {
			this.adminComment = adminComment;
			this.decidedBy = actorId;
			this.decidedAt = OffsetDateTime.now();
		}
	}

	public Long getId() {
		return id;
	}

	public Long getUserId() {
		return userId;
	}

	public LocalDate getWorkDate() {
		return workDate;
	}

	public LocalTime getStartTime() {
		return startTime;
	}

	public LocalTime getEndTime() {
		return endTime;
	}

	public Long getCreatedBy() {
		return createdBy;
	}

	public BigDecimal getHours() {
		return hours;
	}

	public String getReason() {
		return reason;
	}

	public RequestStatus getStatus() {
		return status;
	}

	public String getAdminComment() {
		return adminComment;
	}

	public OffsetDateTime getDecidedAt() {
		return decidedAt;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

}
