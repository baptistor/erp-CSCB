package com.erp.auth;

import java.util.List;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import com.erp.user.AppUser;
import com.erp.user.Role;

/** Principal de sécurité commun aux profils dev et prod. */
public record AuthenticatedUser(Long id, String email, Role role) {

	public static AuthenticatedUser of(AppUser user) {
		return new AuthenticatedUser(user.getId(), user.getEmail(), user.getRole());
	}

	public List<GrantedAuthority> authorities() {
		return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
	}

}
