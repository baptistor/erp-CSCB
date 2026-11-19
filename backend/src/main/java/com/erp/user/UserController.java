package com.erp.user;

import java.util.List;

import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class UserController {

	private final AppUserRepository users;

	public UserController(AppUserRepository users) {
		this.users = users;
	}

	@GetMapping
	@PreAuthorize("isAuthenticated()")
	public List<UserSummaryDto> list() {
		return users.findAll(Sort.by("lastName", "firstName", "email")).stream().map(UserSummaryDto::of).toList();
	}

}
