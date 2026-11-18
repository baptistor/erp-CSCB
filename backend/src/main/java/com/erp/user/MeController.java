package com.erp.user;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.erp.auth.AuthenticatedUser;

@RestController
@RequestMapping("/api/me")
public class MeController {

	private final AppUserRepository users;

	public MeController(AppUserRepository users) {
		this.users = users;
	}

	@GetMapping
	@PreAuthorize("isAuthenticated()")
	public CurrentUserDto me(@AuthenticationPrincipal AuthenticatedUser principal) {
		AppUser user = users.findById(principal.id()).orElseThrow();
		return new CurrentUserDto(user.getId(), user.getEmail(), user.getFirstName(), user.getLastName(),
				user.getRole());
	}

}
