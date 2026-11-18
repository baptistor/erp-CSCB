package com.erp.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.BadCredentialsException;

import com.erp.TestcontainersConfiguration;
import com.erp.user.AppUserRepository;
import com.erp.user.Role;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class CurrentUserServiceTest {

	@Autowired
	CurrentUserService service;

	@Autowired
	AppUserRepository users;

	@Test
	void premierLogin_creeEmployee_puisPasDeDoublon() {
		AuthenticatedUser first = service.findOrCreate("Marie.Curie@Exemple.fr", "Marie", "Curie");
		AuthenticatedUser second = service.findOrCreate("marie.curie@exemple.fr", null, null);

		assertThat(first.role()).isEqualTo(Role.EMPLOYEE);
		assertThat(first.email()).isEqualTo("marie.curie@exemple.fr");
		assertThat(second.id()).isEqualTo(first.id());
		assertThat(users.findByEmailIgnoreCase("marie.curie@exemple.fr")).get()
			.extracting("firstName")
			.isEqualTo("Marie");
	}

	@Test
	void domaineNonAutorise_refuse() {
		assertThatThrownBy(() -> service.findOrCreate("x@autre.fr", null, null))
			.isInstanceOf(BadCredentialsException.class);
		// sous-domaine piège : "@exemple.fr" doit être le suffixe exact
		assertThatThrownBy(() -> service.findOrCreate("x@evil-exemple.fr", null, null))
			.isInstanceOf(BadCredentialsException.class);
		assertThat(users.findByEmailIgnoreCase("x@autre.fr")).isEmpty();
	}

	@Test
	void emailAbsent_refuse() {
		assertThatThrownBy(() -> service.findOrCreate(" ", null, null)).isInstanceOf(BadCredentialsException.class);
	}

}
