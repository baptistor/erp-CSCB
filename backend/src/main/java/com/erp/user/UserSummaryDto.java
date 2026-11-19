package com.erp.user;

public record UserSummaryDto(Long id, String email, String firstName, String lastName) {

	static UserSummaryDto of(AppUser user) {
		return new UserSummaryDto(user.getId(), user.getEmail(), user.getFirstName(), user.getLastName());
	}

}
