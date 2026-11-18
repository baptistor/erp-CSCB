package com.erp.auth;

import java.io.IOException;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Authentification simulée — profil dev UNIQUEMENT (enregistré par {@link SecurityConfig}).
 * L'email passé dans le header {@code X-Dev-User} est traité comme un login SSO réussi.
 */
class DevAuthFilter extends OncePerRequestFilter {

	static final String HEADER = "X-Dev-User";

	private final CurrentUserService currentUsers;

	private final AuthenticationEntryPoint entryPoint;

	DevAuthFilter(CurrentUserService currentUsers, AuthenticationEntryPoint entryPoint) {
		this.currentUsers = currentUsers;
		this.entryPoint = entryPoint;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String email = request.getHeader(HEADER);
		if (email != null && !email.isBlank()) {
			try {
				AuthenticatedUser user = currentUsers.findOrCreate(email, null, null);
				SecurityContextHolder.getContext()
					.setAuthentication(
							UsernamePasswordAuthenticationToken.authenticated(user, null, user.authorities()));
			}
			catch (AuthenticationException ex) {
				SecurityContextHolder.clearContext();
				entryPoint.commence(request, response, ex);
				return;
			}
		}
		chain.doFilter(request, response);
	}

}
