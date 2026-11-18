package com.erp.user;

public record CurrentUserDto(Long id, String email, String firstName, String lastName, Role role) {
}
