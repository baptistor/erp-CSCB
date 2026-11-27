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

/** Journées types, contrat hebdomadaire, heures sup au planning et planning calculé (spec §1). */
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
	void setUp() throws Exception {
		// comptes créés au premier login (pas de données de démo en base)
		for (String user : java.util.List.of(ADMIN, EMPLOYEE)) {
			mvc.perform(get("/api/me").header("X-Dev-User", user)).andExpect(status().isOk());
		}
		jdbc.update("delete from overtime_request");
		jdbc.update("delete from absence_request");
		jdbc.update("update app_user set weekly_hours = 35");
		jdbc.update("delete from school_holiday_week");
		jdbc.update("update school_holiday_calendar set validated_until = null, validated_by = null, validated_at = null");
		jdbc.update("""
				update typical_day set morning_start = case when day_of_week <= 5 then time '09:00' end,
				                       morning_end   = case when day_of_week <= 5 then time '16:00' end,
				                       afternoon_start = null, afternoon_end = null
				where week_type = 'HOLIDAY'""");
		jdbc.update("""
				update typical_day set morning_start   = case when day_of_week <= 5 then time '09:00' end,
				                       morning_end     = case when day_of_week <= 5 then time '12:30' end,
				                       afternoon_start = case when day_of_week <= 5 then time '13:30' end,
				                       afternoon_end   = case when day_of_week <= 5 then time '17:00' end
				where week_type = 'CLASSIC'""");
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
			.andExpect(jsonPath("$.days[6].afternoonStart").doesNotExist())
			// vacances : 9h–16h sans pause, du lundi au vendredi
			.andExpect(jsonPath("$.holidayDays[0].morningStart").value("09:00"))
			.andExpect(jsonPath("$.holidayDays[0].morningEnd").value("16:00"))
			.andExpect(jsonPath("$.holidayDays[0].afternoonStart").doesNotExist())
			.andExpect(jsonPath("$.holidayDays[5].morningStart").doesNotExist());
	}

	@Test
	void dimanche_ferme_400() throws Exception {
		String sunday = days("09:00", "16:00").replace(day(7, null, null), day(7, "09:00", "12:00"));
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), weeks(sunday, holidayDays("09:00", "16:00")))
			.header("X-Dev-User", ADMIN))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("Dimanche : le centre est fermé")));
		overtime("2027-01-10", "09:00", "10:00").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail").value("Le centre est fermé le dimanche"));
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
			.andExpect(jsonPath("$.detail", containsString("demande d'heures supplémentaires")));
		// rien n'a été enregistré
		assertThat(jdbc.queryForObject("select afternoon_end::text from typical_day where user_id = ? and day_of_week = 1 and week_type = 'CLASSIC'",
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

	// ---------- pause de midi (12h30–13h30) ----------

	@Test
	void pause_interditeDansLaSemaineType_400() throws Exception {
		String ok = days("09:00", "17:00");
		for (String bad : new String[] { ok.replaceFirst("12:30", "12:45"), ok.replaceFirst("13:30", "13:15") }) {
			mvc.perform(json(put("/api/users/" + aliceId + "/schedule"),
					weeks(bad, holidayDays("09:00", "16:00"))).header("X-Dev-User", ADMIN))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail", containsString("pause de midi obligatoire")));
		}
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

	// ---------- validation du calendrier des vacances ----------

	private ResultActions validateCalendar(String user, String until) throws Exception {
		MockHttpServletRequestBuilder req = put("/api/school-holiday-calendar").contentType(MediaType.APPLICATION_JSON)
			.content("{\"validatedUntil\":\"" + until + "\"}");
		return mvc.perform(user == null ? req : req.header("X-Dev-User", user));
	}

	@Test
	void calendrierVacances_reserveAuxAdmins() throws Exception {
		mvc.perform(get("/api/school-holiday-calendar")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/school-holiday-calendar").header("X-Dev-User", EMPLOYEE)).andExpect(status().isForbidden());
		validateCalendar(null, "2027-08-31").andExpect(status().isUnauthorized());
		validateCalendar(EMPLOYEE, "2027-08-31").andExpect(status().isForbidden());
	}

	@Test
	void calendrierVacances_enRetardTantQueNonValideA6Mois() throws Exception {
		long adminId = jdbc.queryForObject("select id from app_user where email = ?", Long.class, ADMIN);
		// jamais validé : en retard, à valider jusqu'au 1er juillet 2027 (aujourd'hui + 6 mois)
		mvc.perform(get("/api/school-holiday-calendar").header("X-Dev-User", ADMIN))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.validatedUntil").isEmpty())
			.andExpect(jsonPath("$.requiredUntil").value("2027-07-01"))
			.andExpect(jsonPath("$.late").value(true));
		// validé trop court : toujours en retard
		validateCalendar(ADMIN, "2027-05-31").andExpect(status().isOk())
			.andExpect(jsonPath("$.validatedUntil").value("2027-05-31"))
			.andExpect(jsonPath("$.validatedBy").value(adminId))
			.andExpect(jsonPath("$.validatedAt").value("2027-01-01T09:00:00Z"))
			.andExpect(jsonPath("$.late").value(true));
		// 6 mois atteints : plus en retard
		validateCalendar(ADMIN, "2027-07-01").andExpect(status().isOk()).andExpect(jsonPath("$.late").value(false));
		mvc.perform(get("/api/school-holiday-calendar").header("X-Dev-User", ADMIN))
			.andExpect(jsonPath("$.validatedUntil").value("2027-07-01"))
			.andExpect(jsonPath("$.late").value(false));
	}

	@Test
	void calendrierVacances_dateInvalide_400() throws Exception {
		validateCalendar(ADMIN, "2026-12-31").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail").value(containsString("passé")));
		validateCalendar(ADMIN, "2028-01-02").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail").value(containsString("1 an")));
		validateCalendar(ADMIN, "2027-09-30").andExpect(status().isOk());
		validateCalendar(ADMIN, "2027-08-31").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail").value(containsString("30 septembre 2027")));
		validateCalendar(ADMIN, "2027-09-30").andExpect(status().isOk()); // même date : accepté
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
	void vacances_planningUtiliseLaSemaineDeVacances() throws Exception {
		mvc.perform(put("/api/school-holiday-weeks/" + MONDAY).header("X-Dev-User", ADMIN));
		// semaine de vacances par défaut : 9h–16h sans pause
		planningOfMonday().andExpect(jsonPath("$.holidayWeeks", contains(MONDAY)))
			.andExpect(jsonPath(aliceOn(MONDAY) + ".startTime", contains("09:00")))
			.andExpect(jsonPath(aliceOn(MONDAY) + ".endTime", contains("16:00")));

		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), weeks(days("09:00", "17:00"), holidayDays("08:00", "15:00")))
			.header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.days[0].morningStart").value("09:00"))
			.andExpect(jsonPath("$.holidayDays[0].morningStart").value("08:00"))
			.andExpect(jsonPath("$.holidayDays[0].morningEnd").value("15:00"));
		// vacances : une seule plage, sans pause
		planningOfMonday().andExpect(jsonPath(aliceOn(MONDAY) + ".startTime", contains("08:00")))
			.andExpect(jsonPath(aliceOn(MONDAY) + ".endTime", contains("15:00")))
			// la semaine suivante reste classique
			.andExpect(jsonPath(aliceOn("2027-03-08") + ".startTime", contains("09:00", "13:30")));
		// les heures sup se comparent à la journée de vacances
		overtime(MONDAY, "07:00", "08:15").andExpect(status().isBadRequest());
		overtime(MONDAY, "15:00", "16:00").andExpect(status().isCreated());
		// pas de pause en vacances (samedi non travaillé) ; la pause reste en semaine classique
		mvc.perform(put("/api/school-holiday-weeks/2027-02-22").header("X-Dev-User", ADMIN));
		overtime("2027-02-27", "12:00", "14:00").andExpect(status().isCreated());
		overtime("2027-02-20", "12:00", "14:00").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("pause de midi")));
	}

	@Test
	void vacances_semaineHorsContrat_400_rienEnregistre() throws Exception {
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), weeks(days("08:00", "16:00"), holidayDays("09:00", "15:00")))
			.header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("Semaine de vacances : 30 h")));
		mvc.perform(get("/api/users/" + aliceId + "/schedule").header("X-Dev-User", EMPLOYEE))
			.andExpect(jsonPath("$.days[0].morningStart").value("09:00"))
			.andExpect(jsonPath("$.holidayDays[0].morningEnd").value("16:00"));
	}

	@Test
	void semaineDeVacances_obligatoire_400() throws Exception {
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), "{\"weeklyHours\": 35, \"days\": [" + days("09:00", "17:00") + "]}")
			.header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isBadRequest());
	}

	// ---------- planning calculé ----------

	@Test
	void planning_journeeTypeHeuresSupEtAbsencesDeTous() throws Exception {
		long approvedOvertime = insertOvertime("2027-03-03", "18:00", "20:00", "APPROVED");
		long pendingOvertime = insertOvertime("2027-03-03", "07:00", "08:00", "PENDING");
		insertOvertime("2027-03-04", "18:00", "19:00", "REJECTED");
		insertOvertime("2027-03-04", "19:00", "20:00", "CANCELLED");
		long approved = insertAbsence("2027-03-05", "APPROVED");
		long pending = insertAbsence("2027-03-05", "PENDING");

		String alice = "$.days[?(@.userId == " + aliceId + " && @.date == '";
		// vu par un autre employé : les absences en attente d'Alice sont visibles, sans type ni motif (spec §3)
		mvc.perform(get("/api/planning").param("from", MONDAY).param("to", "2027-03-08").header("X-Dev-User",
				"bruno.durand@exemple.fr"))
			.andExpect(status().isOk())
			.andExpect(jsonPath(alice + "2027-03-01')].startTime", contains("09:00", "13:30")))
			// days = journée type seulement
			.andExpect(jsonPath(alice + "2027-03-03')].startTime", contains("09:00", "13:30")))
			.andExpect(jsonPath("$.overtimes[*].id", contains((int) pendingOvertime, (int) approvedOvertime)))
			.andExpect(jsonPath("$.overtimes[0].startTime").value("07:00"))
			.andExpect(jsonPath("$.overtimes[0].status").value("PENDING"))
			.andExpect(jsonPath("$.overtimes[*].reason").isEmpty())
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

	private ResultActions overtime(String date, String start, String end) throws Exception {
		return mvc.perform(json(post("/api/me/overtime-requests"), """
				{"date": "%s", "startTime": "%s", "endTime": "%s", "reason": "réunion"}""".formatted(date, start, end))
			.header("X-Dev-User", EMPLOYEE));
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
		// semaine de vacances de même durée : une plage sans la pause d'1 h
		String holidayEnd = java.time.LocalTime.parse(end).minusHours(1).toString();
		return """
				{"weeklyHours": %s, "days": [%s], "holidayDays": [%s]}""".formatted(contract, days(start, end),
				holidayDays(start, holidayEnd));
	}

	private static String weeks(String days, String holidayDays) {
		return """
				{"weeklyHours": 35, "days": [%s], "holidayDays": [%s]}""".formatted(days, holidayDays);
	}

	/** Semaine de vacances : lundi→vendredi une seule plage start–end, week-end non travaillé. */
	private static String holidayDays(String start, String end) {
		var days = java.util.stream.IntStream.rangeClosed(1, 7)
			.mapToObj(d -> "{\"dayOfWeek\": " + d + ", \"morningStart\": " + time(d <= 5 ? start : null)
					+ ", \"morningEnd\": " + time(d <= 5 ? end : null) + "}")
			.toList();
		return String.join(",", days);
	}

	@Test
	void vacances_unePlageParJour_400() throws Exception {
		mvc.perform(json(put("/api/users/" + aliceId + "/schedule"), weeks(days("09:00", "17:00"), days("09:00", "17:00")))
			.header("X-Dev-User", EMPLOYEE))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("une seule plage par jour")));
	}

	private static String days(String start, String end) {
		var days = java.util.stream.IntStream.rangeClosed(1, 7)
			.mapToObj(d -> d <= 5 ? day(d, start, end) : day(d, null, null))
			.toList();
		return String.join(",", days);
	}

	private long insertOvertime(String date, String start, String end, String status) {
		return jdbc.queryForObject("""
				insert into overtime_request (user_id, work_date, start_time, end_time, hours, reason, status)
				values (?, ?::date, ?::time, ?::time, 1, 'secret', ?) returning id""", Long.class, aliceId, date, start,
				end, status);
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
