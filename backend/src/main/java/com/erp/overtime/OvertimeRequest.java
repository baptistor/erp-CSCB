package com.erp.overtime;

import java.math.BigDecimal;
import java.time.LocalDate;
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

/** Déclaration d'heures supplémentaires (spec §2). */
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

	OvertimeRequest(Long userId, LocalDate workDate, BigDecimal hours, String reason) {
		this.userId = userId;
		this.workDate = workDate;
		this.hours = hours;
		this.reason = reason;
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
