package com.erp.user;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "app_user")
public class AppUser {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false)
	private String email;

	private String firstName;

	private String lastName;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private Role role = Role.EMPLOYEE;

	/** Contrat hebdomadaire (heures) : total exact de la semaine type. */
	@Column(nullable = false)
	private BigDecimal weeklyHours = new BigDecimal("35");

	@Column(nullable = false, insertable = false, updatable = false)
	private OffsetDateTime createdAt;

	protected AppUser() {
	}

	public AppUser(String email, String firstName, String lastName) {
		this.email = email;
		this.firstName = firstName;
		this.lastName = lastName;
	}

	public Long getId() {
		return id;
	}

	public String getEmail() {
		return email;
	}

	public String getFirstName() {
		return firstName;
	}

	public String getLastName() {
		return lastName;
	}

	public Role getRole() {
		return role;
	}

	public BigDecimal getWeeklyHours() {
		return weeklyHours;
	}

	public void setWeeklyHours(BigDecimal weeklyHours) {
		this.weeklyHours = weeklyHours;
	}

	/** Complète le nom si le fournisseur d'identité le fournit et qu'il manque en base. */
	public void fillNamesIfMissing(String firstName, String lastName) {
		if (this.firstName == null && firstName != null) {
			this.firstName = firstName;
		}
		if (this.lastName == null && lastName != null) {
			this.lastName = lastName;
		}
	}

}
