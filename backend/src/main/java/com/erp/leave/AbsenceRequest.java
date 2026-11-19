package com.erp.leave;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Demande d'absence. Pour l'instant mappée en lecture seule (affichage planning) :
 * les autres colonnes et le workflow viendront avec la feature « Poser une absence ».
 */
@Entity
@Table(name = "absence_request")
public class AbsenceRequest {

	@Id
	private Long id;

	@Column(nullable = false)
	private Long userId;

	@Column(nullable = false)
	private LocalDate startDate;

	@Column(nullable = false)
	private LocalDate endDate;

	@Column(nullable = false)
	private String status;

	protected AbsenceRequest() {
	}

	public Long getId() {
		return id;
	}

	public Long getUserId() {
		return userId;
	}

	public LocalDate getStartDate() {
		return startDate;
	}

	public LocalDate getEndDate() {
		return endDate;
	}

}
