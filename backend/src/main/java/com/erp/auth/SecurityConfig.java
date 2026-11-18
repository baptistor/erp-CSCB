package com.erp.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;

import jakarta.servlet.DispatcherType;

/**
 * API stateless. Prod : JWT Entra ID (OAuth2 Resource Server). Dev : header {@code X-Dev-User}.
 * Le contrôle de rôle fin se fait par {@code @PreAuthorize} sur chaque méthode de controller.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

	@Bean
	@Profile("!dev")
	SecurityFilterChain jwtFilterChain(HttpSecurity http, CurrentUserService currentUsers) throws Exception {
		base(http).oauth2ResourceServer(oauth -> oauth
			.authenticationEntryPoint(problemEntryPoint())
			.jwt(jwt -> jwt.jwtAuthenticationConverter(source -> toAuthentication(source, currentUsers))));
		return http.build();
	}

	@Bean
	@Profile("dev")
	SecurityFilterChain devFilterChain(HttpSecurity http, CurrentUserService currentUsers) throws Exception {
		base(http).addFilterBefore(new DevAuthFilter(currentUsers, problemEntryPoint()),
				AnonymousAuthenticationFilter.class);
		return http.build();
	}

	private static HttpSecurity base(HttpSecurity http) throws Exception {
		return http.csrf(csrf -> csrf.disable())
			.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.authorizeHttpRequests(auth -> auth.dispatcherTypeMatchers(DispatcherType.ERROR)
				.permitAll()
				.anyRequest()
				.authenticated())
			.exceptionHandling(ex -> ex.authenticationEntryPoint(problemEntryPoint()));
	}

	private static UsernamePasswordAuthenticationToken toAuthentication(Jwt jwt, CurrentUserService currentUsers) {
		String email = firstNonBlank(jwt.getClaimAsString("email"), jwt.getClaimAsString("preferred_username"),
				jwt.getClaimAsString("upn"));
		AuthenticatedUser user = currentUsers.findOrCreate(email, jwt.getClaimAsString("given_name"),
				jwt.getClaimAsString("family_name"));
		return UsernamePasswordAuthenticationToken.authenticated(user, jwt, user.authorities());
	}

	private static String firstNonBlank(String... values) {
		for (String value : values) {
			if (value != null && !value.isBlank()) {
				return value;
			}
		}
		return null;
	}

	static AuthenticationEntryPoint problemEntryPoint() {
		return (request, response, ex) -> {
			response.setStatus(HttpStatus.UNAUTHORIZED.value());
			response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
			response.setCharacterEncoding("UTF-8");
			response.getWriter()
				.write("{\"type\":\"about:blank\",\"title\":\"Unauthorized\",\"status\":401,"
						+ "\"detail\":\"Authentification requise\"}");
		};
	}

}
