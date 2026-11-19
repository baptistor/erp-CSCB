package com.erp.auth;

import java.util.Locale;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.erp.schedule.ScheduleService;
import com.erp.user.AppUser;
import com.erp.user.AppUserRepository;

@Service
public class CurrentUserService {

	private final AppUserRepository users;

	private final ScheduleService schedules;

	private final String allowedSuffix;

	public CurrentUserService(AppUserRepository users, ScheduleService schedules, AuthProperties properties) {
		this.users = users;
		this.schedules = schedules;
		this.allowedSuffix = "@" + properties.allowedDomain().toLowerCase(Locale.ROOT);
	}

	/**
	 * Retrouve l'utilisateur par email, ou le crée en EMPLOYEE au premier login.
	 * @throws BadCredentialsException si l'email est absent ou hors du domaine autorisé
	 */
	@Transactional
	public AuthenticatedUser findOrCreate(String email, String firstName, String lastName) {
		if (email == null || email.isBlank()) {
			throw new BadCredentialsException("Email absent");
		}
		String normalized = email.trim().toLowerCase(Locale.ROOT);
		if (!normalized.endsWith(allowedSuffix)) {
			throw new BadCredentialsException("Domaine email non autorisé");
		}
		AppUser user = users.findByEmailIgnoreCase(normalized)
			.orElseGet(() -> createUser(normalized, firstName, lastName));
		user.fillNamesIfMissing(firstName, lastName);
		return AuthenticatedUser.of(user);
	}

	/** Premier login : EMPLOYEE avec la semaine type par défaut (spec §1). */
	private AppUser createUser(String email, String firstName, String lastName) {
		AppUser user = users.save(new AppUser(email, firstName, lastName));
		schedules.createDefaultWeek(user.getId());
		return user;
	}

}
