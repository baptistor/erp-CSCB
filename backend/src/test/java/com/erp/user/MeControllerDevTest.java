package com.erp.user;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import com.erp.TestcontainersConfiguration;

/** Profil dev : authentification simulée par le header X-Dev-User. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("dev")
@Import(TestcontainersConfiguration.class)
class MeControllerDevTest {

	@Autowired
	MockMvc mvc;

	@Test
	void sansHeader_401() throws Exception {
		mvc.perform(get("/api/me"))
			.andExpect(status().isUnauthorized())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
	}

	@Test
	void premierLogin_creeUnEmployee() throws Exception {
		mvc.perform(get("/api/me").header("X-Dev-User", "nouveau.dev@exemple.fr"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.email").value("nouveau.dev@exemple.fr"))
			.andExpect(jsonPath("$.role").value("EMPLOYEE"));
	}

	@Test
	void adminInitial_estAdmin() throws Exception {
		mvc.perform(get("/api/me").header("X-Dev-User", "Admin@Exemple.fr"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.role").value("ADMIN"));
	}

	@Test
	void emailHorsDomaine_401() throws Exception {
		mvc.perform(get("/api/me").header("X-Dev-User", "pirate@autre.fr")).andExpect(status().isUnauthorized());
	}

}
