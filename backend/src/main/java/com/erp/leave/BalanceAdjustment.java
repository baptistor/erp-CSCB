package com.erp.leave;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Ajustement du solde d'heures sup saisi par un admin (+/− heures, motif). */
@Entity
@Table(name = "balance_adjustment")
public class BalanceAdjustment {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false)
	private Long userId;

	@Column(nullable = false)
	private BigDecimal hours;

	@Column(nullable = false)
	private String reason;

	@Column(nullable = false)
	private Long createdBy;

	@Column(nullable = false, updatable = false)
	private OffsetDateTime createdAt = OffsetDateTime.now();

	protected BalanceAdjustment() {
	}

	BalanceAdjustment(Long userId, BigDecimal hours, String reason, Long createdBy) {
		this.userId = userId;
		this.hours = hours;
		this.reason = reason;
		this.createdBy = createdBy;
	}

	public Long getId() {
		return id;
	}

	public BigDecimal getHours() {
		return hours;
	}

	public String getReason() {
		return reason;
	}

	public OffsetDateTime getCreatedAt() {
		return createdAt;
	}

}
