package com.erp.leave;

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

/** Demande d'absence (spec §3) : plage horaire d'un jour, ou journées entières. */
@Entity
@Table(name = "absence_request")
public class AbsenceRequest {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false)
	private Long userId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private AbsenceType type;

	@Column(nullable = false)
	private LocalDate startDate;

	@Column(nullable = false)
	private LocalDate endDate;

	/** Plage horaire d'un seul jour ; null (avec endTime) = journées entières. */
	private LocalTime startTime;

	private LocalTime endTime;

	@Column(nullable = false)
	private BigDecimal hours;

	private String comment;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private RequestStatus status = RequestStatus.PENDING;

	private String adminComment;

	private Long decidedBy;

	private OffsetDateTime decidedAt;

	@Column(nullable = false, updatable = false)
	private OffsetDateTime createdAt = OffsetDateTime.now();

	protected AbsenceRequest() {
	}

	AbsenceRequest(Long userId, AbsenceType type, LocalDate startDate, LocalDate endDate, LocalTime startTime,
			LocalTime endTime, BigDecimal hours, String comment) {
		this.userId = userId;
		this.type = type;
		this.startDate = startDate;
		this.endDate = endDate;
		this.startTime = startTime;
		this.endTime = endTime;
		this.hours = hours;
		this.comment = comment;
	}

	/** Transition depuis PENDING uniquement (409 sinon). */
	/**
	 * Transitions autorisées : PENDING → APPROVED | REJECTED | CANCELLED ; APPROVED → CANCELLED (suppression par le
	 * demandeur, spec §3). 409 sinon.
	 */
	void transition(RequestStatus target, Long actorId, String adminComment) {
		boolean allowed = status == RequestStatus.PENDING
				|| (status == RequestStatus.APPROVED && target == RequestStatus.CANCELLED);
		if (!allowed) {
			throw new ResponseStatusException(HttpStatus.CONFLICT,
					target == RequestStatus.CANCELLED ? "Cette absence ne peut plus être supprimée"
							: "Cette demande n'est plus en attente");
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

	public AbsenceType getType() {
		return type;
	}

	public LocalDate getStartDate() {
		return startDate;
	}

	public LocalDate getEndDate() {
		return endDate;
	}

	public LocalTime getStartTime() {
		return startTime;
	}

	public LocalTime getEndTime() {
		return endTime;
	}

	/** Journées entières (pas de plage horaire). */
	public boolean isFullDays() {
		return startTime == null;
	}

	public BigDecimal getHours() {
		return hours;
	}

	public String getComment() {
		return comment;
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
