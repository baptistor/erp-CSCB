package com.erp.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.erp.TestcontainersConfiguration;

/** Journées types, journées spéciales, minimum d'heures et planning calculé (spec §1). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("dev")
@Import(TestcontainersConfiguration.class)
class ScheduleControllerTest {

	static final String ADMIN = "admin@exemple.fr";

	static final String EMPLOYEE = "alice.martin@exemple.fr";

	/** Semaine du lundi 1er mars 2027 (dans le futur : soumise au contrôle du minimum). */
	static final String MONDAY = "2027-03-01";

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	long aliceId;

	@BeforeEach
	void setUp() {
		jdbc.update("delete from special_day");
		jdbc.update("delete from absence_request");
		jdbc.update("update app_user set min_daily_hours = 8");
		jdbc.update("""
				update typical_day set start_time = case when day_of_week <= 5 then time '09:00' end,
				                       end_time   = case when day_of_week <= 5 then time '17:00' end""");
		aliceId = jdbc.queryForObject("select id from app_user where email = ?", Long.class, EMPLOYEE);
	}

	// ---------- accès ----------

	@Test
	void anonyme_401_partout() throws Exception {
		mvc.perform(get("/api/planning").param("from", MONDAY).param("to", "2027-03-08"))
			.andExpect(status().isUnauthorized());
		mvc.perform(get("/api/users/" + aliceId + "/schedule")).andExpect(status().isUnauthorized());
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("8", "09:00", "17:00")))
			.andExpect(status().isUnauthorized());
		mvc.perform(json(post("/api/special-days"), special(aliceId, "2027-03-03", "08:00", "18:00")))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void employee_litLesHorairesDeTous() throws Exception {
		mvc.perform(get("/api/users/" + adminId() + "/schedule").header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isOk());
		mvc.perform(get("/api/planning").param("from", MONDAY).param("to", "2027-03-08").header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isOk());
	}

	// ---------- employé : ses propres journées uniquement ----------

	@Test
	void employee_gereSesPropresJourneesSpeciales() throws Exception {
		mvc.perform(json(post("/api/special-days"), special(aliceId, "2027-03-03", "08:00", "18:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isCreated());
		long id = jdbc.queryForObject("select id from special_day", Long.class);
		mvc.perform(json(put("/api/special-days/" + id), special(aliceId, "2027-03-03", "08:30", "18:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isOk());
		mvc.perform(delete("/api/special-days/" + id).header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isNoContent());
	}

	@Test
	void employee_journeeSpecialeDUnAutre_403() throws Exception {
		long adminId = adminId();
		mvc.perform(json(post("/api/special-days"), special(adminId, "2027-03-03", "08:00", "18:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isForbidden());

		long adminDay = insertSpecial(adminId, "2027-03-03", "08:00", "18:00");
		mvc.perform(json(put("/api/special-days/" + adminDay), special(adminId, "2027-03-03", "08:00", "19:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isForbidden());
		// ni en s'attribuant la journée d'un autre
		mvc.perform(json(put("/api/special-days/" + adminDay), special(aliceId, "2027-03-03", "08:00", "19:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isForbidden());
		mvc.perform(delete("/api/special-days/" + adminDay).header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isForbidden());
		// ni en attribuant sa journée à un autre
		long own = insertSpecial(aliceId, "2027-03-04", "08:00", "18:00");
		mvc.perform(json(put("/api/special-days/" + own), special(adminId, "2027-03-04", "08:00", "18:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isForbidden());
	}

	@Test
	void employee_jourPasse_400_maisAdminOk() throws Exception {
		mvc.perform(json(post("/api/special-days"), special(aliceId, "2020-01-06", "08:00", "18:00"))
			.header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail").value("Les jours passés ne sont plus modifiables"));
		long past = insertSpecial(aliceId, "2020-01-07", "08:00", "18:00");
		mvc.perform(delete("/api/special-days/" + past).header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isBadRequest());
		// déplacer une journée future vers le passé : refusé aussi
		long future = insertSpecial(aliceId, "2027-03-04", "08:00", "18:00");
		mvc.perform(json(put("/api/special-days/" + future), special(aliceId, "2020-01-08", "08:00", "18:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isBadRequest());

		mvc.perform(json(post("/api/special-days"), special(aliceId, "2020-01-06", "08:00", "18:00"))
			.header("X-Dev-User", ADMIN)).andExpect(status().isCreated());
	}

	@Test
	void employee_sousSonMinimum_400() throws Exception {
		mvc.perform(json(post("/api/special-days"), special(aliceId, "2027-03-03", "09:00", "16:00"))
			.header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("7 h < minimum de 8 h")));
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("8", "09:00", "16:00")).header("X-Dev-User",
				EMPLOYEE))
			.andExpect(status().isBadRequest());
	}

	@Test
	void employee_modifieSaSemaine_maisPasSonMinimum() throws Exception {
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("8", "08:00", "16:00")).header("X-Dev-User",
				EMPLOYEE))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.days[0].startTime").value("08:00"));

		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("7", "08:00", "15:00")).header("X-Dev-User",
				EMPLOYEE))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.detail").value("Seul un admin peut modifier le minimum d'heures"));
		assertThat(jdbc.queryForObject("select min_daily_hours from app_user where id = ?", Integer.class, aliceId))
			.isEqualTo(8);
	}

	@Test
	void employee_semaineDUnAutre_403() throws Exception {
		mvc.perform(json(put("/api/users/" + adminId() + "/schedule"), week("8", "08:00", "16:00")).header("X-Dev-User",
				EMPLOYEE))
			.andExpect(status().isForbidden());
	}

	// ---------- semaine type + minimum ----------

	@Test
	void premierLogin_semaineParDefaut() throws Exception {
		mvc.perform(get("/api/me").header("X-Dev-User", "nouvelle.recrue@exemple.fr")).andExpect(status().isOk());
		long id = jdbc.queryForObject("select id from app_user where email = 'nouvelle.recrue@exemple.fr'",
				Long.class);
		mvc.perform(get("/api/users/" + id + "/schedule").header("X-Dev-User", ADMIN))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.minDailyHours").value(8))
			.andExpect(jsonPath("$.days.length()").value(7))
			.andExpect(jsonPath("$.days[0].dayOfWeek").value(1))
			.andExpect(jsonPath("$.days[0].startTime").value("09:00"))
			.andExpect(jsonPath("$.days[4].endTime").value("17:00"))
			.andExpect(jsonPath("$.days[5].startTime").doesNotExist())
			.andExpect(jsonPath("$.days[6].startTime").doesNotExist());
	}

	@Test
	void admin_modifieSemaineEtMinimum() throws Exception {
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("7.5", "08:30", "16:00")).header("X-Dev-User",
				ADMIN))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.minDailyHours").value(7.5))
			.andExpect(jsonPath("$.days[0].startTime").value("08:30"));
	}

	@Test
	void semaine_sousLeMinimum_400_avecMessageClair() throws Exception {
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("8", "09:00", "16:00")).header("X-Dev-User",
				ADMIN))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("Lundi : 7 h < minimum de 8 h")));
	}

	@Test
	void hausseDuMinimum_refuseeSiJourneeSpecialeFutureTropCourte() throws Exception {
		insertSpecial("2027-03-03", "09:00", "17:00"); // 8 h
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("9", "08:00", "17:00")).header("X-Dev-User",
				ADMIN))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("Journée spéciale du 03/03/2027")));
	}

	@Test
	void semaine_invalide_400() throws Exception {
		// minimum pas au pas de 0,25
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("7.1", "08:00", "17:00")).header("X-Dev-User",
				ADMIN)).andExpect(status().isBadRequest());
		// fin avant début
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("1", "17:00", "09:00")).header("X-Dev-User",
				ADMIN)).andExpect(status().isBadRequest());
		// 6 jours seulement
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), """
				{"minDailyHours": 8, "days": [%s]}""".formatted(String.join(",",
				java.util.stream.IntStream.rangeClosed(1, 6).mapToObj(d -> day(d, "09:00", "17:00")).toList())))
			.header("X-Dev-User", ADMIN)).andExpect(status().isBadRequest());
	}

	// ---------- journées spéciales ----------

	@Test
	void admin_creeModifieSupprimeJourneeSpeciale() throws Exception {
		mvc.perform(json(post("/api/special-days"), special(aliceId, "2027-03-03", "08:00", "18:00"))
			.header("X-Dev-User", ADMIN))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.startTime").value("08:00"));
		long id = jdbc.queryForObject("select id from special_day", Long.class);

		// doublon même employé / même date
		mvc.perform(json(post("/api/special-days"), special(aliceId, "2027-03-03", null, null))
			.header("X-Dev-User", ADMIN)).andExpect(status().isConflict());

		// passage en « non travaillé » (pas soumis au minimum)
		mvc.perform(json(put("/api/special-days/" + id), special(aliceId, "2027-03-03", null, null))
			.header("X-Dev-User", ADMIN))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.startTime").doesNotExist());

		mvc.perform(delete("/api/special-days/" + id).header("X-Dev-User", ADMIN)).andExpect(status().isNoContent());
		assertThat(jdbc.queryForObject("select count(*) from special_day", Long.class)).isZero();
	}

	@Test
	void journeeSpeciale_invalide() throws Exception {
		mvc.perform(json(post("/api/special-days"), special(aliceId, "2027-03-03", "09:00", "16:00"))
			.header("X-Dev-User", ADMIN))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("7 h < minimum de 8 h")));
		mvc.perform(json(post("/api/special-days"), special(aliceId, "2027-03-03", "18:00", "08:00"))
			.header("X-Dev-User", ADMIN)).andExpect(status().isBadRequest());
		mvc.perform(json(post("/api/special-days"), special(aliceId, "2027-03-03", "08:00", null))
			.header("X-Dev-User", ADMIN)).andExpect(status().isBadRequest());
		mvc.perform(json(post("/api/special-days"), special(999_999, "2027-03-03", "08:00", "18:00"))
			.header("X-Dev-User", ADMIN)).andExpect(status().isNotFound());
		mvc.perform(delete("/api/special-days/999999").header("X-Dev-User", ADMIN)).andExpect(status().isNotFound());
	}

	// ---------- planning calculé ----------

	@Test
	void planning_speciale_sinon_type() throws Exception {
		long wednesday = insertSpecial("2027-03-03", "08:00", "18:00"); // remplace 9h–17h
		long thursday = insertSpecial("2027-03-04", null, null); // non travaillé
		long approved = insertAbsence("2027-03-05", "APPROVED");
		long pending = insertAbsence("2027-03-05", "PENDING");

		String alice = "$.days[?(@.userId == " + aliceId + ")]";
		mvc.perform(get("/api/planning").param("from", MONDAY).param("to", "2027-03-08").header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isOk())
			// lundi : journée type
			.andExpect(jsonPath(alice + "[?(@.date == '2027-03-01')].startTime").value("09:00"))
			.andExpect(jsonPath(alice + "[?(@.date == '2027-03-01')].specialDayId").value(hasItem((Object) null)))
			// mercredi : journée spéciale
			.andExpect(jsonPath(alice + "[?(@.date == '2027-03-03')].startTime").value("08:00"))
			.andExpect(jsonPath(alice + "[?(@.date == '2027-03-03')].specialDayId").value((int) wednesday))
			// jeudi : spéciale non travaillée, renvoyée sans horaires
			.andExpect(jsonPath(alice + "[?(@.date == '2027-03-04')].specialDayId").value((int) thursday))
			.andExpect(jsonPath(alice + "[?(@.date == '2027-03-04')].startTime").value(hasItem((Object) null)))
			// week-end : rien
			.andExpect(jsonPath(alice + "[?(@.date == '2027-03-06')]").isEmpty())
			.andExpect(jsonPath("$.absences[*].id").value(hasItem((int) approved)))
			.andExpect(jsonPath("$.absences[*].id").value(not(hasItem((int) pending))));
	}

	@Test
	void planning_periodeInvalide_400() throws Exception {
		mvc.perform(get("/api/planning").param("from", "2027-01-01").param("to", "2027-06-01").header("X-Dev-User",
				EMPLOYEE)).andExpect(status().isBadRequest());
	}

	// ---------- helpers ----------

	private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
		return builder.contentType(MediaType.APPLICATION_JSON).content(body);
	}

	private static String time(String value) {
		return value == null ? "null" : "\"" + value + "\"";
	}

	private static String day(int dow, String start, String end) {
		return """
				{"dayOfWeek": %d, "startTime": %s, "endTime": %s}""".formatted(dow, time(start), time(end));
	}

	/** Semaine lundi→vendredi start–end, week-end non travaillé. */
	private static String week(String min, String start, String end) {
		var days = java.util.stream.IntStream.rangeClosed(1, 7)
			.mapToObj(d -> d <= 5 ? day(d, start, end) : day(d, null, null))
			.toList();
		return """
				{"minDailyHours": %s, "days": [%s]}""".formatted(min, String.join(",", days));
	}

	private static String special(long userId, String date, String start, String end) {
		return """
				{"userId": %d, "date": "%s", "startTime": %s, "endTime": %s}""".formatted(userId, date, time(start),
				time(end));
	}

	private long insertSpecial(String date, String start, String end) {
		return insertSpecial(aliceId, date, start, end);
	}

	private long insertSpecial(long userId, String date, String start, String end) {
		return jdbc.queryForObject(
				"insert into special_day (user_id, day_date, start_time, end_time) values (?, ?::date, ?::time, ?::time) returning id",
				Long.class, userId, date, start, end);
	}

	private long adminId() {
		return jdbc.queryForObject("select id from app_user where email = ?", Long.class, ADMIN);
	}

	private long insertAbsence(String date, String status) {
		return jdbc.queryForObject("""
				insert into absence_request (user_id, type, start_date, end_date, hours, comment, status)
				values (?, 'SANS_SOLDE', ?::date, ?::date, 7, 'secret', ?) returning id""", Long.class, aliceId, date,
				date, status);
	}

}
