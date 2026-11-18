package com.erp.user;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.erp.TestcontainersConfiguration;

/**
 * Hors profil dev : seul un Bearer JWT est accepté. Le décodeur est simulé, mais toute la chaîne
 * (filtre bearer → converter → contrôle de domaine → rôle en base) est exercée.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class MeControllerJwtTest {

	@Autowired
	MockMvc mvc;

	@MockitoBean
	JwtDecoder jwtDecoder;

	@Test
	void premierLogin_creeEmployeeAvecNom() throws Exception {
		token("t-jean", Map.of("preferred_username", "jean.sso@exemple.fr", "given_name", "Jean", "family_name",
				"Sso"));
		mvc.perform(get("/api/me").header("Authorization", "Bearer t-jean"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.email").value("jean.sso@exemple.fr"))
			.andExpect(jsonPath("$.firstName").value("Jean"))
			.andExpect(jsonPath("$.role").value("EMPLOYEE"));
	}

	@Test
	void adminInitial_roleLuEnBase() throws Exception {
		token("t-admin", Map.of("email", "admin@exemple.fr"));
		mvc.perform(get("/api/me").header("Authorization", "Bearer t-admin"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.role").value("ADMIN"));
	}

	@Test
	void emailHorsDomaine_401() throws Exception {
		token("t-pirate", Map.of("email", "pirate@autre.fr"));
		mvc.perform(get("/api/me").header("Authorization", "Bearer t-pirate")).andExpect(status().isUnauthorized());
	}

	@Test
	void sansToken_401() throws Exception {
		mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
	}

	@Test
	void headerDevIgnoreHorsProfilDev_401() throws Exception {
		mvc.perform(get("/api/me").header("X-Dev-User", "admin@exemple.fr")).andExpect(status().isUnauthorized());
	}

	private void token(String value, Map<String, Object> claims) {
		Jwt jwt = Jwt.withTokenValue(value)
			.header("alg", "none")
			.subject(value)
			.issuedAt(Instant.now())
			.expiresAt(Instant.now().plusSeconds(300))
			.claims(c -> c.putAll(claims))
			.build();
		given(jwtDecoder.decode(value)).willReturn(jwt);
	}

}
