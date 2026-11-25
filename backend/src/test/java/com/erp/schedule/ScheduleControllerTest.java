package com.erp.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
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
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.erp.TestcontainersConfiguration;
import com.erp.common.TimeConfig;

/** Journées types, contrat hebdomadaire, heures ajoutées et planning calculé (spec §1). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("dev")
@Import(TestcontainersConfiguration.class)
class ScheduleControllerTest {

	static final String ADMIN = "admin@exemple.fr";

	static final String EMPLOYEE = "alice.martin@exemple.fr";

	/** Semaine du lundi 1er mars 2027 (dans le futur). */
	static final String MONDAY = "2027-03-01";

	/** « Aujourd'hui » = vendredi 1er janvier 2027 : mars 2027 est à venir, 2020 est passé. */
	@TestBean
	java.time.Clock clock;

	static java.time.Clock clock() {
		return java.time.Clock.fixed(java.time.Instant.parse("2027-01-01T09:00:00Z"), TimeConfig.PARIS);
	}

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	long aliceId;

	@BeforeEach
	void setUp() {
		jdbc.update("delete from special_day");
		jdbc.update("delete from absence_request");
		jdbc.update("update app_user set weekly_hours = 35");
		jdbc.update("delete from school_holiday_week");
		jdbc.update("delete from typical_day where week_type = 'HOLIDAY'");
		jdbc.update("""
				update typical_day set morning_start   = case when day_of_week <= 5 then time '09:00' end,
				                       morning_end     = case when day_of_week <= 5 then time '12:30' end,
				                       afternoon_start = case when day_of_week <= 5 then time '13:30' end,
				                       afternoon_end   = case when day_of_week <= 5 then time '17:00' end""");
		aliceId = jdbc.queryForObject("select id from app_user where email = ?", Long.class, EMPLOYEE);
	}

	// ---------- accès ----------

	@Test
	void anonyme_401_partout() throws Exception {
		mvc.perform(get("/api/planning").param("from", MONDAY).param("to", "2027-03-08"))
			.andExpect(status().isUnauthorized());
		mvc.perform(get("/api/users/" + aliceId + "/schedule")).andExpect(status().isUnauthorized());
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("35", "09:00", "17:00")))
			.andExpect(status().isUnauthorized());
		mvc.perform(json(post("/api/special-days"), special(aliceId, "2027-03-03", "18:00", "20:00")))
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
	void employee_gereSesPropresHeuresAjoutees() throws Exception {
		mvc.perform(json(post("/api/special-days"), special(aliceId, "2027-03-03", "18:00", "20:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isCreated());
		long id = jdbc.queryForObject("select id from special_day", Long.class);
		mvc.perform(json(put("/api/special-days/" + id), special(aliceId, "2027-03-03", "18:30", "20:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isOk());
		mvc.perform(delete("/api/special-days/" + id).header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isNoContent());
	}

	@Test
	void employee_heuresAjouteesDUnAutre_403() throws Exception {
		long adminId = adminId();
		mvc.perform(json(post("/api/special-days"), special(adminId, "2027-03-03", "18:00", "20:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isForbidden());

		long adminDay = insertSpecial(adminId, "2027-03-03", "18:00", "20:00");
		mvc.perform(json(put("/api/special-days/" + adminDay), special(adminId, "2027-03-03", "18:00", "21:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isForbidden());
		// ni en s'attribuant la journée d'un autre
		mvc.perform(json(put("/api/special-days/" + adminDay), special(aliceId, "2027-03-03", "18:00", "21:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isForbidden());
		mvc.perform(delete("/api/special-days/" + adminDay).header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isForbidden());
		// ni en attribuant sa journée à un autre
		long own = insertSpecial(aliceId, "2027-03-04", "18:00", "20:00");
		mvc.perform(json(put("/api/special-days/" + own), special(adminId, "2027-03-04", "18:00", "20:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isForbidden());
	}

	@Test
	void employee_jourPasse_400_maisAdminOk() throws Exception {
		mvc.perform(json(post("/api/special-days"), special(aliceId, "2020-01-06", "18:00", "20:00"))
			.header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail").value("Les jours passés ne sont plus modifiables"));
		long past = insertSpecial(aliceId, "2020-01-07", "18:00", "20:00");
		mvc.perform(delete("/api/special-days/" + past).header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isBadRequest());
		// déplacer une journée future vers le passé : refusé aussi
		long future = insertSpecial(aliceId, "2027-03-04", "18:00", "20:00");
		mvc.perform(json(put("/api/special-days/" + future), special(aliceId, "2020-01-08", "18:00", "20:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isBadRequest());

		mvc.perform(json(post("/api/special-days"), special(aliceId, "2020-01-06", "18:00", "20:00"))
			.header("X-Dev-User", ADMIN)).andExpect(status().isCreated());
	}

	@Test
	void employee_semaineDoitResterAuContrat() throws Exception {
		// la semaine type doit rester au contrat : 5 × 6 h = 30 h ≠ 35 h
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("35", "09:00", "16:00")).header("X-Dev-User",
				EMPLOYEE))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("il manque 5 h")));
	}

	@Test
	void employee_modifieSaSemaine_maisPasSonContrat() throws Exception {
		// 5 × 7 h = 35 h : contrat respecté
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("35", "08:00", "16:00")).header("X-Dev-User",
				EMPLOYEE))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.days[0].morningStart").value("08:00"));

		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("40", "08:00", "17:00")).header("X-Dev-User",
				EMPLOYEE))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.detail").value("Seul un admin peut modifier le contrat hebdomadaire"));
		assertThat(jdbc.queryForObject("select weekly_hours from app_user where id = ?", Integer.class, aliceId))
			.isEqualTo(35);
	}

	@Test
	void employee_semaineDUnAutre_403() throws Exception {
		mvc.perform(json(put("/api/users/" + adminId() + "/schedule"), week("35", "08:00", "16:00")).header("X-Dev-User",
				EMPLOYEE))
			.andExpect(status().isForbidden());
	}

	// ---------- semaine type + contrat hebdomadaire ----------

	@Test
	void premierLogin_semaineParDefaut_35h() throws Exception {
		mvc.perform(get("/api/me").header("X-Dev-User", "nouvelle.recrue@exemple.fr")).andExpect(status().isOk());
		long id = jdbc.queryForObject("select id from app_user where email = 'nouvelle.recrue@exemple.fr'",
				Long.class);
		mvc.perform(get("/api/users/" + id + "/schedule").header("X-Dev-User", ADMIN))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.weeklyHours").value(35))
			.andExpect(jsonPath("$.days.length()").value(7))
			.andExpect(jsonPath("$.days[0].dayOfWeek").value(1))
			.andExpect(jsonPath("$.days[0].morningStart").value("09:00"))
			.andExpect(jsonPath("$.days[4].afternoonEnd").value("17:00"))
			.andExpect(jsonPath("$.days[5].morningStart").doesNotExist())
			.andExpect(jsonPath("$.days[6].afternoonStart").doesNotExist());
	}

	@Test
	void admin_modifieSemaineEtContrat() throws Exception {
		// 5 × 7,5 h = 37,5 h pour un contrat de 37,5 h
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("37.5", "08:30", "17:00")).header("X-Dev-User",
				ADMIN))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.weeklyHours").value(37.5))
			.andExpect(jsonPath("$.days[0].morningStart").value("08:30"));
	}

	@Test
	void semaine_sousLeContrat_400() throws Exception {
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("35", "09:00", "16:00")).header("X-Dev-User",
				ADMIN))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail").value("Semaine classique : 30 h pour un contrat de 35 h — il manque 5 h"));
	}

	@Test
	void semaine_auDessusDuContrat_400_heuresSupADeclarer() throws Exception {
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("35", "09:00", "18:00")).header("X-Dev-User",
				ADMIN))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("40 h pour un contrat de 35 h — 5 h de trop")))
			.andExpect(jsonPath("$.detail", containsString("déclaration d'heures supplémentaires")));
		// rien n'a été enregistré
		assertThat(jdbc.queryForObject("select afternoon_end::text from typical_day where user_id = ? and day_of_week = 1",
				String.class, aliceId)).isEqualTo("17:00:00");
	}

	@Test
	void semaine_invalide_400() throws Exception {
		// contrat pas au pas de 0,25
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("35.1", "09:00", "17:00")).header("X-Dev-User",
				ADMIN)).andExpect(status().isBadRequest());
		// fin avant début
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), week("35", "16:00", "09:00")).header("X-Dev-User",
				ADMIN)).andExpect(status().isBadRequest());
		// 6 jours seulement
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), """
				{"weeklyHours": 35, "days": [%s]}""".formatted(String.join(",",
				java.util.stream.IntStream.rangeClosed(1, 6).mapToObj(d -> day(d, "09:00", "17:00")).toList())))
			.header("X-Dev-User", ADMIN)).andExpect(status().isBadRequest());
	}

	// ---------- heures ajoutées à un jour (journée type : 9h–12h30 / 13h30–17h) ----------

	@Test
	void heuresAjoutees_avantApres_avecCoupure_etJourNonTravaille() throws Exception {
		add("2027-03-03", "07:00", "09:00").andExpect(status().isCreated()); // collée avant
		add("2027-03-03", "17:00", "18:00").andExpect(status().isCreated()); // collée après
		add("2027-03-03", "19:00", "20:00").andExpect(status().isCreated()); // coupure
		add("2027-03-06", "10:00", "12:00").andExpect(status().isCreated()); // samedi
	}

	@Test
	void heuresAjoutees_nEmpietentJamaisSurLaJourneeType_400() throws Exception {
		for (String[] r : new String[][] { { "16:00", "18:00" }, { "08:00", "10:00" }, { "10:00", "12:00" },
				{ "13:30", "17:00" } }) {
			add("2027-03-03", r[0], r[1]).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail", containsString("ne doivent pas empiéter sur la journée type")));
			// même règle pour l'admin
			mvc.perform(json(post("/api/special-days"), special(aliceId, "2027-03-03", r[0], r[1])).header("X-Dev-User",
					ADMIN))
				.andExpect(status().isBadRequest());
		}
		long id = insertSpecial("2027-03-03", "18:00", "20:00");
		mvc.perform(json(put("/api/special-days/" + id), special(aliceId, "2027-03-03", "16:00", "20:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isBadRequest());
		assertThat(jdbc.queryForObject("select count(*) from special_day", Long.class)).isEqualTo(1);
	}

	@Test
	void heuresAjoutees_neSeChevauchentPas_409() throws Exception {
		long id = insertSpecial("2027-03-03", "18:00", "20:00");
		add("2027-03-03", "19:00", "21:00").andExpect(status().isConflict());
		// modifier la plage elle-même reste possible
		mvc.perform(json(put("/api/special-days/" + id), special(aliceId, "2027-03-03", "18:30", "20:00"))
			.header("X-Dev-User", EMPLOYEE)).andExpect(status().isOk());
	}

	@Test
	void heuresAjoutees_invalides() throws Exception {
		add("2027-03-03", "20:00", "18:00").andExpect(status().isBadRequest());
		add("2027-03-03", "18:00", null).andExpect(status().isBadRequest());
		add("2027-03-03", null, null).andExpect(status().isBadRequest()); // plus de « non travaillé »
		mvc.perform(json(post("/api/special-days"), special(999_999, "2027-03-03", "18:00", "19:00"))
			.header("X-Dev-User", ADMIN)).andExpect(status().isNotFound());
		mvc.perform(delete("/api/special-days/999999").header("X-Dev-User", ADMIN)).andExpect(status().isNotFound());
	}

	@Test
	void admin_ajouteModifieRetirePourUnEmploye() throws Exception {
		mvc.perform(json(post("/api/special-days"), special(aliceId, "2027-03-03", "18:00", "20:00"))
			.header("X-Dev-User", ADMIN)).andExpect(status().isCreated()).andExpect(jsonPath("$.startTime").value("18:00"));
		long id = jdbc.queryForObject("select id from special_day", Long.class);
		mvc.perform(json(put("/api/special-days/" + id), special(aliceId, "2027-03-03", "18:00", "21:00"))
			.header("X-Dev-User", ADMIN)).andExpect(status().isOk());
		mvc.perform(delete("/api/special-days/" + id).header("X-Dev-User", ADMIN)).andExpect(status().isNoContent());
	}

	// ---------- pause de midi (12h30–13h30) ----------

	@Test
	void pause_interditeDansLaSemaineType_400() throws Exception {
		String ok = days("09:00", "17:00");
		for (String bad : new String[] { ok.replaceFirst("12:30", "12:45"), ok.replaceFirst("13:30", "13:15") }) {
			mvc.perform(json(put("/api/users/" + aliceId + "/schedule"),
					"{\"weeklyHours\": 35, \"days\": [" + bad + "]}").header("X-Dev-User", ADMIN))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail", containsString("pause de midi obligatoire")));
		}
	}

	@Test
	void pause_interditeAuxHeuresAjoutees_memeUnJourNonTravaille_400() throws Exception {
		for (String[] r : new String[][] { { "12:30", "13:30" }, { "12:00", "12:45" }, { "13:00", "14:00" },
				{ "10:00", "16:00" } }) {
			add("2027-03-06", r[0], r[1]).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail", containsString("pause de midi")));
		}
		add("2027-03-06", "10:00", "12:30").andExpect(status().isCreated());
		add("2027-03-06", "13:30", "16:00").andExpect(status().isCreated());
	}

	// ---------- semaines de vacances scolaires ----------

	@Test
	void vacances_marquageReserveAuxAdmins() throws Exception {
		String url = "/api/school-holiday-weeks/" + MONDAY;
		mvc.perform(get("/api/school-holiday-weeks")).andExpect(status().isUnauthorized());
		mvc.perform(put(url)).andExpect(status().isUnauthorized());
		mvc.perform(put(url).header("X-Dev-User", EMPLOYEE)).andExpect(status().isForbidden());
		mvc.perform(delete(url).header("X-Dev-User", EMPLOYEE)).andExpect(status().isForbidden());

		mvc.perform(put(url).header("X-Dev-User", ADMIN)).andExpect(status().isNoContent());
		mvc.perform(put(url).header("X-Dev-User", ADMIN)).andExpect(status().isNoContent()); // idempotent
		mvc.perform(get("/api/school-holiday-weeks").header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$", contains(MONDAY)));
		mvc.perform(delete(url).header("X-Dev-User", ADMIN)).andExpect(status().isNoContent());
		mvc.perform(delete(url).header("X-Dev-User", ADMIN)).andExpect(status().isNoContent());
		mvc.perform(get("/api/school-holiday-weeks").header("X-Dev-User", EMPLOYEE))
			.andExpect(jsonPath("$").isEmpty());
	}

	@Test
	void vacances_uniquementUnLundiAVenir_400() throws Exception {
		// mardi, semaine en cours (aujourd'hui = vendredi 1er janvier 2027), passé
		for (String date : new String[] { "2027-03-02", "2026-12-28", "2020-01-06" }) {
			mvc.perform(put("/api/school-holiday-weeks/" + date).header("X-Dev-User", ADMIN))
				.andExpect(status().isBadRequest());
			mvc.perform(delete("/api/school-holiday-weeks/" + date).header("X-Dev-User", ADMIN))
				.andExpect(status().isBadRequest());
		}
	}

	@Test
	void vacances_planningUtiliseLaSemaineDeVacances_sinonLaClassique() throws Exception {
		mvc.perform(put("/api/school-holiday-weeks/" + MONDAY).header("X-Dev-User", ADMIN));
		// semaine de vacances pas encore remplie : reprend la classique
		planningOfMonday().andExpect(jsonPath("$.holidayWeeks", contains(MONDAY)))
			.andExpect(jsonPath(aliceOn(MONDAY) + ".startTime", contains("09:00", "13:30")));

		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), weeks(days("09:00", "17:00"), days("08:00", "16:00")))
			.header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.days[0].morningStart").value("09:00"))
			.andExpect(jsonPath("$.holidayDays[0].morningStart").value("08:00"));
		planningOfMonday().andExpect(jsonPath(aliceOn(MONDAY) + ".startTime", contains("08:00", "13:30")))
			.andExpect(jsonPath(aliceOn(MONDAY) + ".endTime", contains("12:30", "16:00")))
			// la semaine suivante reste classique
			.andExpect(jsonPath(aliceOn("2027-03-08") + ".startTime", contains("09:00", "13:30")));
		// les heures ajoutées se comparent à la journée de vacances
		add(MONDAY, "08:00", "09:00").andExpect(status().isBadRequest());
		add(MONDAY, "16:00", "17:00").andExpect(status().isCreated());
	}

	@Test
	void vacances_semaineHorsContrat_400_rienEnregistre() throws Exception {
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), weeks(days("08:00", "16:00"), days("09:00", "16:00")))
			.header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("Semaine de vacances : 30 h")));
		mvc.perform(get("/api/users/" + aliceId + "/schedule").header("X-Dev-User", EMPLOYEE))
			.andExpect(jsonPath("$.days[0].morningStart").value("09:00"))
			.andExpect(jsonPath("$.holidayDays").doesNotExist());
	}

	// ---------- planning calculé ----------

	@Test
	void planning_journeeTypePlusHeuresAjoutees() throws Exception {
		insertSpecial("2027-03-03", "18:00", "20:00");
		insertSpecial("2027-03-03", "07:00", "08:00");
		insertSpecial("2027-03-04", "08:00", "12:00");
		insertSpecial("2027-03-04", "15:00", "18:00"); // la semaine type a changé depuis : seul le dépassement compte
		long approved = insertAbsence("2027-03-05", "APPROVED");
		long pending = insertAbsence("2027-03-05", "PENDING");

		String alice = "$.days[?(@.userId == " + aliceId + " && @.date == '";
		// vu par un autre employé : les absences en attente d'Alice sont visibles, sans type ni motif (spec §3)
		mvc.perform(get("/api/planning").param("from", MONDAY).param("to", "2027-03-08").header("X-Dev-User",
				"bruno.durand@exemple.fr"))
			.andExpect(status().isOk())
			.andExpect(jsonPath(alice + "2027-03-01')].startTime", contains("09:00", "13:30")))
			.andExpect(jsonPath(alice + "2027-03-03')].startTime", contains("09:00", "13:30", "07:00", "18:00")))
			.andExpect(jsonPath(alice + "2027-03-04')].startTime", contains("09:00", "13:30", "08:00", "17:00")))
			.andExpect(jsonPath(alice + "2027-03-04')].endTime", contains("12:30", "17:00", "09:00", "18:00")))
			.andExpect(jsonPath(alice + "2027-03-06')]").isEmpty())
			.andExpect(jsonPath("$.absences[*].id").value(hasItem((int) approved)))
			.andExpect(jsonPath("$.absences[*].id").value(hasItem((int) pending)))
			.andExpect(jsonPath("$.absences[*].comment").isEmpty())
			.andExpect(jsonPath("$.absences[*].type").isEmpty());
	}

	@Test
	void planning_periodeInvalide_400() throws Exception {
		mvc.perform(get("/api/planning").param("from", "2027-01-01").param("to", "2027-06-01").header("X-Dev-User",
				EMPLOYEE)).andExpect(status().isBadRequest());
	}

	// ---------- helpers ----------

	private ResultActions planningOfMonday() throws Exception {
		return mvc.perform(get("/api/planning").param("from", MONDAY).param("to", "2027-03-15").header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isOk());
	}

	private String aliceOn(String date) {
		return "$.days[?(@.userId == " + aliceId + " && @.date == '" + date + "')]";
	}

	private ResultActions add(String date, String start, String end) throws Exception {
		return mvc.perform(json(post("/api/special-days"), special(aliceId, date, start, end)).header("X-Dev-User", EMPLOYEE));
	}

	private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
		return builder.contentType(MediaType.APPLICATION_JSON).content(body);
	}

	private static String time(String value) {
		return value == null ? "null" : "\"" + value + "\"";
	}

	private static String day(int dow, String start, String end) {
		return """
				{"dayOfWeek": %d, "morningStart": %s, "morningEnd": %s, "afternoonStart": %s, "afternoonEnd": %s}"""
			.formatted(dow, time(start), time(start == null ? null : "12:30"), time(end == null ? null : "13:30"),
					time(end));
	}

	/** Semaine lundi→vendredi start–12:30 / 13:30–end, week-end non travaillé. */
	private static String week(String contract, String start, String end) {
		return """
				{"weeklyHours": %s, "days": [%s]}""".formatted(contract, days(start, end));
	}

	private static String weeks(String days, String holidayDays) {
		return """
				{"weeklyHours": 35, "days": [%s], "holidayDays": [%s]}""".formatted(days, holidayDays);
	}

	private static String days(String start, String end) {
		var days = java.util.stream.IntStream.rangeClosed(1, 7)
			.mapToObj(d -> d <= 5 ? day(d, start, end) : day(d, null, null))
			.toList();
		return String.join(",", days);
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
