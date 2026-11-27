package com.erp.leave;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.assertj.core.groups.Tuple;
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
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.erp.TestcontainersConfiguration;
import com.erp.common.RequestStatus;
import com.erp.common.RequestStatusChanged;
import com.erp.common.TimeConfig;

/**
 * Heures sup (§2), absences posées sur le planning (§3), solde d'heures sup, workflow commun et droits.
 * Semaine type de référence : lundi → vendredi 9h–12h30 / 13h30–18h (8 h), week-end non travaillé. Lundi 4 janvier 2027.
 * Horloge fixée au dimanche 3 janvier 2027 23:30 UTC, soit lundi 4 janvier 00:30 à Paris : « aujourd'hui » = lundi.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("dev")
@RecordApplicationEvents
@Import(TestcontainersConfiguration.class)
class RequestsControllerTest {

	static final String ADMIN = "admin@exemple.fr";

	static final String ALICE = "alice.martin@exemple.fr";

	static final String BRUNO = "bruno.durand@exemple.fr";

	static final String PREVIOUS_SUN = "2027-01-03";

	/** Samedi 2 janvier 2027, non travaillé : toute plage d'heures sup y est possible. */
	static final String SAT_BEFORE = "2027-01-02";

	static final String MON = "2027-01-04";

	static final String TUE = "2027-01-05";

	static final String WED = "2027-01-06";

	static final String SAT = "2027-01-09";

	static final String SUN = "2027-01-10";

	@TestBean
	Clock clock;

	static Clock clock() {
		return Clock.fixed(Instant.parse("2027-01-03T23:30:00Z"), TimeConfig.PARIS);
	}

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	ApplicationEvents events;

	long aliceId;

	@BeforeEach
	void setUp() throws Exception {
		// comptes créés au premier login (pas de données de démo en base)
		for (String user : List.of(ADMIN, ALICE, BRUNO)) {
			mvc.perform(get("/api/me").header("X-Dev-User", user)).andExpect(status().isOk());
		}
		jdbc.update("delete from overtime_request");
		jdbc.update("delete from absence_request");
		jdbc.update("delete from balance_adjustment");
		jdbc.update("update app_user set weekly_hours = 35");
		jdbc.update("delete from school_holiday_week");
		jdbc.update("""
				update typical_day set morning_start = case when day_of_week <= 5 then time '09:00' end,
				                       morning_end   = case when day_of_week <= 5 then time '16:00' end,
				                       afternoon_start = null, afternoon_end = null
				where week_type = 'HOLIDAY'""");
		jdbc.update("""
				update typical_day set morning_start   = case when day_of_week <= 5 then time '09:00' end,
				                       morning_end     = case when day_of_week <= 5 then time '12:30' end,
				                       afternoon_start = case when day_of_week <= 5 then time '13:30' end,
				                       afternoon_end   = case when day_of_week <= 5 then time '18:00' end
				where week_type = 'CLASSIC'""");
		aliceId = jdbc.queryForObject("select id from app_user where email = ?", Long.class, ALICE);
	}

	// ---------- accès ----------

	@Test
	void anonyme_401() throws Exception {
		mvc.perform(get("/api/me/balance")).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/me/overtime-requests").contentType(MediaType.APPLICATION_JSON)
			.content(overtime(SAT_BEFORE, "2"))).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/me/absence-requests").contentType(MediaType.APPLICATION_JSON)
			.content(absenceBody("SANS_SOLDE", MON, MON, null, null))).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/admin/pending-requests")).andExpect(status().isUnauthorized());
	}

	@Test
	void employee_403_surLesEndpointsAdmin() throws Exception {
		long id = declare(ALICE, SAT_BEFORE, "2");
		mvc.perform(get("/api/admin/pending-requests").header("X-Dev-User", ALICE)).andExpect(status().isForbidden());
		json(post("/api/admin/overtime-requests/" + id + "/decision"), decision(true), ALICE)
			.andExpect(status().isForbidden());
		mvc.perform(get("/api/admin/users/" + aliceId + "/balance").header("X-Dev-User", ALICE))
			.andExpect(status().isForbidden());
		json(post("/api/admin/users/" + aliceId + "/balance-adjustments"), adjustment("50"), ALICE)
			.andExpect(status().isForbidden());
		assertThat(dbStatus(id, "overtime_request")).isEqualTo("PENDING");
	}

	@Test
	void annulerLaDemandeDUnAutre_403() throws Exception {
		long id = declare(ALICE, SAT_BEFORE, "2");
		mvc.perform(post("/api/me/overtime-requests/" + id + "/cancel").header("X-Dev-User", BRUNO))
			.andExpect(status().isForbidden());
		long absence = createdId(absence(ALICE, "SANS_SOLDE", MON, MON, null, null));
		mvc.perform(post("/api/me/absence-requests/" + absence + "/cancel").header("X-Dev-User", BRUNO))
			.andExpect(status().isForbidden());
	}

	@Test
	void monSolde_sansHistorique_reserveALAdmin() throws Exception {
		long id = declare(ALICE, SAT_BEFORE, "2");
		json(post("/api/admin/overtime-requests/" + id + "/decision"), decision(true), ADMIN).andExpect(status().isOk());
		mvc.perform(get("/api/me/balance").header("X-Dev-User", ALICE))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.balance").value(2))
			.andExpect(jsonPath("$.available").value(2))
			.andExpect(jsonPath("$.movements").isEmpty());
		mvc.perform(get("/api/admin/users/" + aliceId + "/balance").header("X-Dev-User", ADMIN))
			.andExpect(jsonPath("$.movements.length()").value(1));
	}

	@Test
	void employee_decisionSurUneAbsence_403() throws Exception {
		long id = createdId(absence(ALICE, "SANS_SOLDE", MON, MON, null, null));
		json(post("/api/admin/absence-requests/" + id + "/decision"), decision(true), ALICE)
			.andExpect(status().isForbidden());
		json(post("/api/admin/absence-requests/" + id + "/decision"), decision(true), BRUNO)
			.andExpect(status().isForbidden());
		assertThat(dbStatus(id, "absence_request")).isEqualTo("PENDING");
	}

	@Test
	void decision_absenceHorsPending_409_etIdInconnu_404() throws Exception {
		long id = createdId(absence(ALICE, "SANS_SOLDE", MON, MON, null, null));
		json(post("/api/admin/absence-requests/" + id + "/decision"), decision(true), ADMIN).andExpect(status().isOk());
		json(post("/api/admin/absence-requests/" + id + "/decision"), decision(false), ADMIN)
			.andExpect(status().isConflict());
		// une absence refusée ne peut pas être supprimée
		long rejected = createdId(absence(ALICE, "SANS_SOLDE", TUE, TUE, null, null));
		json(post("/api/admin/absence-requests/" + rejected + "/decision"), decision(false), ADMIN)
			.andExpect(status().isOk());
		mvc.perform(post("/api/me/absence-requests/" + rejected + "/cancel").header("X-Dev-User", ALICE))
			.andExpect(status().isConflict());
		json(post("/api/admin/absence-requests/999999/decision"), decision(true), ADMIN).andExpect(status().isNotFound());
		json(post("/api/admin/overtime-requests/999999/decision"), decision(true), ADMIN).andExpect(status().isNotFound());
		mvc.perform(post("/api/me/absence-requests/999999/cancel").header("X-Dev-User", ALICE))
			.andExpect(status().isNotFound());
	}

	/** Suppression par le demandeur et refus par l'admin au même instant : une seule transition gagne. */
	@Test
	void decisionsSimultanees_uneSeuleTransition() throws Exception {
		long id = createdId(absence(ALICE, "SANS_SOLDE", MON, MON, null, null));
		CountDownLatch start = new CountDownLatch(1);
		Callable<Integer> cancel = () -> {
			start.await();
			return mvc.perform(post("/api/me/absence-requests/" + id + "/cancel").header("X-Dev-User", ALICE))
				.andReturn()
				.getResponse()
				.getStatus();
		};
		Callable<Integer> approve = () -> {
			start.await();
			return json(post("/api/admin/absence-requests/" + id + "/decision"), decision(false), ADMIN).andReturn()
				.getResponse()
				.getStatus();
		};
		var pool = Executors.newFixedThreadPool(2);
		try {
			Future<Integer> a = pool.submit(cancel);
			Future<Integer> b = pool.submit(approve);
			start.countDown();
			assertThat(java.util.List.of(a.get(), b.get())).containsExactlyInAnyOrder(200, 409);
		}
		finally {
			pool.shutdown();
		}
		assertThat(dbStatus(id, "absence_request")).isIn("CANCELLED", "REJECTED");
		// une seule transition publiée en plus de la création
		assertThat(events.stream(RequestStatusChanged.class)
			.filter(e -> e.requestId() == id && e.status() != RequestStatus.PENDING)).hasSize(1);
	}

	// ---------- heures sup ----------

	@Test
	void heuresSup_approuvees_alimententLeSolde() throws Exception {
		long id = declare(ALICE, SAT_BEFORE, "4");
		balance(ALICE).andExpect(jsonPath("$.balance").value(0));

		json(post("/api/admin/overtime-requests/" + id + "/decision"), "{\"approved\": true, \"comment\": \"OK merci\"}",
				ADMIN)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("APPROVED"))
			.andExpect(jsonPath("$.adminComment").value("OK merci"));

		balance(ALICE).andExpect(jsonPath("$.balance").value(4)).andExpect(jsonPath("$.available").value(4));
		history().andExpect(jsonPath("$.movements[0].kind").value("OVERTIME"))
			.andExpect(jsonPath("$.movements[0].hours").value(4));
	}

	@Test
	void heuresSup_plageHoraire_heuresCalculees() throws Exception {
		json(post("/api/me/overtime-requests"), overtimeAt(SAT, "10:00", "12:15"), ALICE).andExpect(status().isCreated())
			.andExpect(jsonPath("$.hours").value(2.25))
			.andExpect(jsonPath("$.startTime").value("10:00"))
			.andExpect(jsonPath("$.endTime").value("12:15"))
			.andExpect(jsonPath("$.status").value("PENDING"));
		// avant / après la journée type (9h–12h30 / 13h30–18h), collées ou non
		json(post("/api/me/overtime-requests"), overtimeAt(MON, "07:00", "09:00"), ALICE).andExpect(status().isCreated());
		json(post("/api/me/overtime-requests"), overtimeAt(MON, "18:00", "19:00"), ALICE).andExpect(status().isCreated());
		json(post("/api/me/overtime-requests"), overtimeAt(MON, "20:00", "21:00"), ALICE).andExpect(status().isCreated());
	}

	@Test
	void heuresSup_jamaisSurLaJourneeTypeNiLaPause_400() throws Exception {
		for (String[] r : new String[][] { { "17:00", "19:00" }, { "08:00", "10:00" }, { "10:00", "11:00" } }) {
			json(post("/api/me/overtime-requests"), overtimeAt(MON, r[0], r[1]), ALICE).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail", containsString("journée type")));
		}
		for (String[] r : new String[][] { { "12:30", "13:30" }, { "12:00", "12:45" }, { "10:00", "16:00" } }) {
			json(post("/api/me/overtime-requests"), overtimeAt(SAT, r[0], r[1]), ALICE).andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.detail", containsString("pause de midi")));
		}
		assertThat(jdbc.queryForObject("select count(*) from overtime_request", Long.class)).isZero();
	}

	@Test
	void heuresSup_chevauchement_409_saufSiAnnuleeOuRefusee() throws Exception {
		long id = createdId(json(post("/api/me/overtime-requests"), overtimeAt(SAT, "10:00", "12:00"), ALICE));
		json(post("/api/me/overtime-requests"), overtimeAt(SAT, "11:00", "12:30"), ALICE).andExpect(status().isConflict());
		// collée : OK ; un autre employé n'est pas concerné
		json(post("/api/me/overtime-requests"), overtimeAt(SAT, "09:00", "10:00"), ALICE).andExpect(status().isCreated());
		json(post("/api/me/overtime-requests"), overtimeAt(SAT, "10:00", "12:00"), BRUNO).andExpect(status().isCreated());
		mvc.perform(post("/api/me/overtime-requests/" + id + "/cancel").header("X-Dev-User", ALICE))
			.andExpect(status().isOk());
		json(post("/api/me/overtime-requests"), overtimeAt(SAT, "11:00", "12:30"), ALICE).andExpect(status().isCreated());
	}

	@Test
	void heuresSup_deJMoins31AJPlus62() throws Exception {
		json(post("/api/me/overtime-requests"), overtimeAt("2026-12-04", "18:00", "19:00"), ALICE)
			.andExpect(status().isCreated());
		json(post("/api/me/overtime-requests"), overtimeAt("2026-12-03", "18:00", "19:00"), ALICE)
			.andExpect(status().isBadRequest());
		json(post("/api/me/overtime-requests"), overtimeAt("2027-03-06", "18:00", "19:00"), ALICE)
			.andExpect(status().isCreated());
		// J+62 tombe un dimanche : centre fermé
		json(post("/api/me/overtime-requests"), overtimeAt("2027-03-07", "18:00", "19:00"), ALICE)
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail").value("Le centre est fermé le dimanche"));
		json(post("/api/me/overtime-requests"), overtimeAt("2027-03-08", "18:00", "19:00"), ALICE)
			.andExpect(status().isBadRequest());
	}

	// ---------- heures sup saisies par l'admin pour un employé ----------

	@Test
	void admin_poseDesHeuresSupPourUnEmploye_accepteesDirectement() throws Exception {
		long adminId = jdbc.queryForObject("select id from app_user where email = ?", Long.class, ADMIN);
		json(post("/api/admin/users/" + aliceId + "/overtime-requests"), overtimeAt(TUE, "18:00", "20:30"), ADMIN)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.userId").value((int) aliceId))
			.andExpect(jsonPath("$.status").value("APPROVED"))
			.andExpect(jsonPath("$.createdBy").value((int) adminId))
			.andExpect(jsonPath("$.hours").value(2.5));
		balance(ALICE).andExpect(jsonPath("$.balance").value(2.5));
		history().andExpect(jsonPath("$.movements[0].label", containsString("saisies par l'admin")));
		mvc.perform(get("/api/planning").param("from", MON).param("to", "2027-01-11").header("X-Dev-User", BRUNO))
			.andExpect(jsonPath("$.overtimes[0].createdBy").value((int) adminId))
			.andExpect(jsonPath("$.overtimes[0].status").value("APPROVED"));
	}

	@Test
	void admin_heuresSupPourUnEmploye_memesRegles() throws Exception {
		// sur la journée type d'Alice (9h–12h30 / 13h30–18h), sur la pause : 400
		json(post("/api/admin/users/" + aliceId + "/overtime-requests"), overtimeAt(TUE, "17:00", "19:00"), ADMIN)
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("journée type")));
		json(post("/api/admin/users/" + aliceId + "/overtime-requests"), overtimeAt(SAT, "12:00", "13:00"), ADMIN)
			.andExpect(status().isBadRequest());
		// chevauche une demande d'Alice : 409
		json(post("/api/me/overtime-requests"), overtimeAt(TUE, "18:00", "19:00"), ALICE).andExpect(status().isCreated());
		json(post("/api/admin/users/" + aliceId + "/overtime-requests"), overtimeAt(TUE, "18:30", "20:00"), ADMIN)
			.andExpect(status().isConflict());
		json(post("/api/admin/users/999999/overtime-requests"), overtimeAt(TUE, "18:00", "19:00"), ADMIN)
			.andExpect(status().isNotFound());
	}

	@Test
	void admin_retireDesHeuresSup_memeAcceptees_soldeMisAJour() throws Exception {
		long approved = createdId(json(post("/api/admin/users/" + aliceId + "/overtime-requests"),
				overtimeAt(TUE, "18:00", "20:00"), ADMIN));
		long pending = declare(ALICE, SAT, "1");
		balance(ALICE).andExpect(jsonPath("$.balance").value(2));
		mvc.perform(post("/api/admin/overtime-requests/" + approved + "/cancel").header("X-Dev-User", ADMIN))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CANCELLED"));
		mvc.perform(post("/api/admin/overtime-requests/" + pending + "/cancel").header("X-Dev-User", ADMIN))
			.andExpect(status().isOk());
		balance(ALICE).andExpect(jsonPath("$.balance").value(0));
		// déjà retirée : 409 ; inconnue : 404
		mvc.perform(post("/api/admin/overtime-requests/" + approved + "/cancel").header("X-Dev-User", ADMIN))
			.andExpect(status().isConflict());
		mvc.perform(post("/api/admin/overtime-requests/999999/cancel").header("X-Dev-User", ADMIN))
			.andExpect(status().isNotFound());
	}

	@Test
	void admin_retrait_refuseSiLesHeuresSontDejaRecuperees() throws Exception {
		long approved = createdId(json(post("/api/admin/users/" + aliceId + "/overtime-requests"),
				overtimeAt(TUE, "18:00", "20:00"), ADMIN));
		// récup de 2 h en attente : le disponible tombe à 0
		absence(ALICE, "RECUP_HEURES_SUP", WED, WED, "14:00", "16:00").andExpect(status().isCreated());
		mvc.perform(post("/api/admin/overtime-requests/" + approved + "/cancel").header("X-Dev-User", ADMIN))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.detail", containsString("disponible passerait à -2 h")));
		assertThat(dbStatus(approved, "overtime_request")).isEqualTo("APPROVED");
	}

	@Test
	void admin_neSAjoutePasSesPropresHeuresSup_400() throws Exception {
		long adminId = jdbc.queryForObject("select id from app_user where email = ?", Long.class, ADMIN);
		json(post("/api/admin/users/" + adminId + "/overtime-requests"), overtimeAt(SAT, "10:00", "12:00"), ADMIN)
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("lui-même")));
	}

	@Test
	void employee_heuresSupPourAutrui_etRetrait_403() throws Exception {
		long brunoId = jdbc.queryForObject("select id from app_user where email = ?", Long.class, BRUNO);
		json(post("/api/admin/users/" + brunoId + "/overtime-requests"), overtimeAt(SAT, "10:00", "12:00"), ALICE)
			.andExpect(status().isForbidden());
		json(post("/api/admin/users/" + aliceId + "/overtime-requests"), overtimeAt(SAT, "10:00", "12:00"), ALICE)
			.andExpect(status().isForbidden());
		long id = declare(BRUNO, SAT, "2");
		mvc.perform(post("/api/admin/overtime-requests/" + id + "/cancel").header("X-Dev-User", ALICE))
			.andExpect(status().isForbidden());
		mvc.perform(post("/api/admin/overtime-requests/" + id + "/cancel").header("X-Dev-User", BRUNO))
			.andExpect(status().isForbidden());
		mvc.perform(post("/api/admin/overtime-requests/" + id + "/cancel")).andExpect(status().isUnauthorized());
		assertThat(dbStatus(id, "overtime_request")).isEqualTo("PENDING");
	}

	@Test
	void heuresSup_invalides_400() throws Exception {
		json(post("/api/me/overtime-requests"), overtimeAt(SAT, "10:10", "12:00"), ALICE).andExpect(status().isBadRequest());
		json(post("/api/me/overtime-requests"), overtimeAt(SAT, "12:00", "10:00"), ALICE).andExpect(status().isBadRequest());
		json(post("/api/me/overtime-requests"), overtimeAt(SAT, "10:00", "10:00"), ALICE).andExpect(status().isBadRequest());
		json(post("/api/me/overtime-requests"), """
				{"date": "%s", "startTime": "10:00", "endTime": "12:00", "reason": " "}""".formatted(SAT), ALICE)
			.andExpect(status().isBadRequest());
		json(post("/api/me/overtime-requests"), """
				{"date": "%s", "hours": 2, "reason": "ancien format"}""".formatted(SAT), ALICE)
			.andExpect(status().isBadRequest());
	}

	@Test
	void transitions_refuseesHorsPending_409() throws Exception {
		long id = declare(ALICE, SAT_BEFORE, "2");
		json(post("/api/admin/overtime-requests/" + id + "/decision"), decision(false), ADMIN)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("REJECTED"));
		json(post("/api/admin/overtime-requests/" + id + "/decision"), decision(true), ADMIN)
			.andExpect(status().isConflict());
		mvc.perform(post("/api/me/overtime-requests/" + id + "/cancel").header("X-Dev-User", ALICE))
			.andExpect(status().isConflict());
		balance(ALICE).andExpect(jsonPath("$.balance").value(0));
	}

	@Test
	void annulationParLeDemandeur() throws Exception {
		long id = declare(ALICE, SAT_BEFORE, "2");
		mvc.perform(post("/api/me/overtime-requests/" + id + "/cancel").header("X-Dev-User", ALICE))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CANCELLED"));
	}

	// ---------- absences : heures calculées depuis le planning ----------

	@Test
	void plageHoraire_heuresEgalesALaDuree() throws Exception {
		absence(ALICE, "SANS_SOLDE", MON, MON, "14:00", "16:30").andExpect(status().isCreated())
			.andExpect(jsonPath("$.hours").value(2.5))
			.andExpect(jsonPath("$.startTime").value("14:00"))
			.andExpect(jsonPath("$.endTime").value("16:30"));
	}

	@Test
	void journeesEntieres_heuresPrevuesDesJoursTravailles() throws Exception {
		// lundi → dimanche : 5 × 8 h, week-end non travaillé = 0 h
		absence(ALICE, "SANS_SOLDE", MON, SUN, null, null).andExpect(status().isCreated())
			.andExpect(jsonPath("$.hours").value(40));
	}

	@Test
	void absence_enjambeLaPauseDeMidi_nonComptee_maisNiDebutNiFinDedans() throws Exception {
		for (String[] r : new String[][] { { "12:30", "13:30" }, { "12:45", "15:00" }, { "12:30", "15:00" },
				{ "11:00", "13:00" }, { "11:00", "13:30" } }) {
			absence(ALICE, "SANS_SOLDE", TUE, TUE, r[0], r[1]).andExpect(status().isBadRequest());
		}
		absence(ALICE, "SANS_SOLDE", TUE, TUE, "11:00", "15:00").andExpect(status().isCreated())
			.andExpect(jsonPath("$.hours").value(3));
	}

	@Test
	void journeeEntiere_enVacances_heuresDeLaSemaineDeVacances() throws Exception {
		jdbc.update("insert into school_holiday_week values (?::date)", MON);
		jdbc.update("update typical_day set morning_start = '09:00', morning_end = '12:00' "
				+ "where user_id = ? and week_type = 'HOLIDAY' and day_of_week < 7", aliceId);
		absence(ALICE, "SANS_SOLDE", TUE, TUE, null, null).andExpect(status().isCreated())
			.andExpect(jsonPath("$.hours").value(3));
	}

	@Test
	void absence_uniquementSurLaJourneeType_pasSurLesHeuresSup() throws Exception {
		json(post("/api/me/overtime-requests"), overtimeAt(TUE, "19:00", "21:00"), ALICE).andExpect(status().isCreated());
		absence(ALICE, "SANS_SOLDE", TUE, TUE, "19:00", "20:00").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("(09:00–12:30, 13:30–18:00)")));
		absence(ALICE, "SANS_SOLDE", TUE, TUE, "16:00", "20:00").andExpect(status().isBadRequest());
		// journée entière : la journée type seulement
		absence(ALICE, "SANS_SOLDE", TUE, TUE, null, null).andExpect(status().isCreated())
			.andExpect(jsonPath("$.hours").value(8));
	}
	@Test
	void horairesNonAlignes_plageRogneeAuQuartDHeure_acceptee() throws Exception {
		jdbc.update("update typical_day set morning_start = '09:10', afternoon_end = '17:10' where user_id = ? and day_of_week = 2 and week_type = 'CLASSIC'",
				aliceId);
		// ce que le front envoie après rognage au quart d'heure à l'intérieur des horaires
		absence(ALICE, "SANS_SOLDE", TUE, TUE, "09:15", "17:00").andExpect(status().isCreated())
			.andExpect(jsonPath("$.hours").value(6.75));
	}

	@Test
	void absenceTropLongue_400_etPas500() throws Exception {
		// 6 jours travaillés de 00:00 à 23:45 sur 62 jours ≈ 1 200 h > 999 h (capacité de la colonne)
		jdbc.update("update typical_day set morning_start = '00:00', morning_end = '12:30', afternoon_start = '13:30', afternoon_end = '23:45' where user_id = ? and day_of_week < 7 and week_type = 'CLASSIC'", aliceId);
		absence(ALICE, "SANS_SOLDE", MON, "2027-03-06", null, null).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("ne peut pas dépasser 999 h")));
	}

	@Test
	void decisionSansChoix_400() throws Exception {
		long id = createdId(absence(ALICE, "SANS_SOLDE", MON, MON, null, null));
		json(post("/api/admin/absence-requests/" + id + "/decision"), "{\"comment\": \"?\"}", ADMIN)
			.andExpect(status().isBadRequest());
		assertThat(dbStatus(id, "absence_request")).isEqualTo("PENDING");
	}

	@Test
	void plage_horsDesHorairesPrevus_400() throws Exception {
		absence(ALICE, "SANS_SOLDE", MON, MON, "08:00", "10:00").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("pendant vos horaires du 04/01/2027 (09:00–12:30, 13:30–18:00)")));
		absence(ALICE, "SANS_SOLDE", MON, MON, "16:00", "19:00").andExpect(status().isBadRequest());
	}

	@Test
	void jourNonTravaille_400() throws Exception {
		absence(ALICE, "SANS_SOLDE", SAT, SAT, "10:00", "12:00").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("n'est pas un jour travaillé")));
		absence(ALICE, "SANS_SOLDE", SAT, SUN, null, null).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("Aucun jour travaillé")));
	}

	// ---------- suppression par l'employé (en attente ou acceptée) ----------

	@Test
	void employee_supprimeSaRecupAcceptee_soldeRestitue() throws Exception {
		grant("4");
		long id = createdId(absence(ALICE, "RECUP_HEURES_SUP", MON, MON, "14:00", "17:00"));
		json(post("/api/admin/absence-requests/" + id + "/decision"), decision(true), ADMIN).andExpect(status().isOk());
		balance(ALICE).andExpect(jsonPath("$.balance").value(1));

		mvc.perform(post("/api/me/absence-requests/" + id + "/cancel").header("X-Dev-User", ALICE))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CANCELLED"));
		balance(ALICE).andExpect(jsonPath("$.balance").value(4)).andExpect(jsonPath("$.available").value(4));
		mvc.perform(get("/api/planning").param("from", MON).param("to", "2027-01-11").header("X-Dev-User", BRUNO))
			.andExpect(jsonPath("$.absences").isEmpty());
		assertThat(events.stream(RequestStatusChanged.class)
			.filter(e -> e.requestId() == id)
			.map(RequestStatusChanged::status)).containsExactly(RequestStatus.PENDING, RequestStatus.APPROVED,
					RequestStatus.CANCELLED);
	}

	@Test
	void suppression_absenceDejaCommencee_400_maisAujourdhuiOk() throws Exception {
		// commencée le vendredi 1er janvier (aujourd'hui = lundi 4) : plus supprimable
		long started = jdbc.queryForObject(
				"insert into absence_request (user_id, type, start_date, end_date, hours, status) "
						+ "values (?, 'SANS_SOLDE', '2027-01-01', '2027-01-04', 16, 'APPROVED') returning id",
				Long.class, aliceId);
		mvc.perform(post("/api/me/absence-requests/" + started + "/cancel").header("X-Dev-User", ALICE))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail").value("Une absence déjà commencée ne peut plus être supprimée"));
		// commence aujourd'hui : encore supprimable
		long today = jdbc.queryForObject(
				"insert into absence_request (user_id, type, start_date, end_date, start_time, end_time, hours, status) "
						+ "values (?, 'SANS_SOLDE', ?::date, ?::date, '14:00', '16:00', 2, 'APPROVED') returning id",
				Long.class, aliceId, MON, MON);
		mvc.perform(post("/api/me/absence-requests/" + today + "/cancel").header("X-Dev-User", ALICE))
			.andExpect(status().isOk());
	}

	@Test
	void suppression_parUnAutre_403_adminCompris() throws Exception {
		long id = createdId(absence(ALICE, "SANS_SOLDE", MON, MON, null, null));
		json(post("/api/admin/absence-requests/" + id + "/decision"), decision(true), ADMIN).andExpect(status().isOk());
		mvc.perform(post("/api/me/absence-requests/" + id + "/cancel").header("X-Dev-User", ADMIN))
			.andExpect(status().isForbidden());
		mvc.perform(post("/api/me/absence-requests/" + id + "/cancel").header("X-Dev-User", BRUNO))
			.andExpect(status().isForbidden());
		assertThat(dbStatus(id, "absence_request")).isEqualTo("APPROVED");
	}

	@Test
	void aujourdhui_auFuseauDeParis() throws Exception {
		// à 23:30 UTC le dimanche, il est déjà lundi 00:30 à Paris : dimanche est passé, lundi est aujourd'hui
		absence(ALICE, "SANS_SOLDE", PREVIOUS_SUN, PREVIOUS_SUN, null, null)
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail").value("Une absence se pose à partir d'aujourd'hui"));
		absence(ALICE, "SANS_SOLDE", MON, MON, "09:00", "10:00").andExpect(status().isCreated());
	}

	@Test
	void absence_reglesDeSaisie_400() throws Exception {
		// dans le passé
		absence(ALICE, "SANS_SOLDE", "2020-01-06", "2020-01-06", null, null).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail").value("Une absence se pose à partir d'aujourd'hui"));
		// fin avant début
		absence(ALICE, "SANS_SOLDE", TUE, MON, null, null).andExpect(status().isBadRequest());
		// heure de fin sans heure de début
		absence(ALICE, "SANS_SOLDE", MON, MON, null, "12:00").andExpect(status().isBadRequest());
		// plage horaire sur plusieurs jours
		absence(ALICE, "SANS_SOLDE", MON, TUE, "10:00", "12:00").andExpect(status().isBadRequest());
		// fin ≤ début
		absence(ALICE, "SANS_SOLDE", MON, MON, "12:00", "12:00").andExpect(status().isBadRequest());
		// pas au quart d'heure
		absence(ALICE, "SANS_SOLDE", MON, MON, "10:10", "12:00").andExpect(status().isBadRequest());
	}

	@Test
	void chevauchement_auQuartDHeurePres() throws Exception {
		absence(ALICE, "SANS_SOLDE", MON, MON, "09:00", "12:00").andExpect(status().isCreated());
		// contiguë : OK
		absence(ALICE, "SANS_SOLDE", MON, MON, "12:00", "14:30").andExpect(status().isCreated());
		// chevauche 14:00–14:30
		absence(ALICE, "SANS_SOLDE", MON, MON, "14:00", "15:00").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("chevauche")));
		// journée entière sur un jour déjà partiellement pris
		absence(ALICE, "SANS_SOLDE", MON, TUE, null, null).andExpect(status().isBadRequest());
		// le mardi est libre
		absence(ALICE, "SANS_SOLDE", TUE, TUE, null, null).andExpect(status().isCreated());
		// plage dans une journée entière déjà posée
		absence(ALICE, "SANS_SOLDE", TUE, TUE, "10:00", "11:00").andExpect(status().isBadRequest());
		// un autre employé n'est pas concerné
		absence(BRUNO, "SANS_SOLDE", MON, MON, "09:00", "12:00").andExpect(status().isCreated());
	}

	@Test
	void absenceAnnulee_libereLaPlage() throws Exception {
		long id = createdId(absence(ALICE, "SANS_SOLDE", MON, MON, "14:00", "16:00"));
		mvc.perform(post("/api/me/absence-requests/" + id + "/cancel").header("X-Dev-User", ALICE))
			.andExpect(status().isOk());
		absence(ALICE, "SANS_SOLDE", MON, MON, "14:00", "16:00").andExpect(status().isCreated());
	}

	// ---------- récupération et solde ----------

	@Test
	void recup_refuseeSiSoldeDisponibleInsuffisant_enComptantLesPending() throws Exception {
		grant("4");
		// journée entière = 8 h > 4 h disponibles
		absence(ALICE, "RECUP_HEURES_SUP", MON, MON, null, null).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.detail", containsString("4 h disponibles")));

		absence(ALICE, "RECUP_HEURES_SUP", MON, MON, "14:00", "17:00").andExpect(status().isCreated());
		balance(ALICE).andExpect(jsonPath("$.balance").value(4)).andExpect(jsonPath("$.available").value(1));

		// 3 h déjà en attente : il ne reste qu'1 h disponible
		absence(ALICE, "RECUP_HEURES_SUP", TUE, TUE, "10:00", "12:00").andExpect(status().isBadRequest());
		absence(ALICE, "RECUP_HEURES_SUP", TUE, TUE, "10:00", "11:00").andExpect(status().isCreated());
	}

	@Test
	void recup_approuvee_consommeLeSolde_etApparaitAuPlanningDeTous() throws Exception {
		grant("4");
		long id = createdId(absence(ALICE, "RECUP_HEURES_SUP", MON, MON, "14:00", "17:00"));
		json(post("/api/admin/absence-requests/" + id + "/decision"), decision(true), ADMIN).andExpect(status().isOk());
		balance(ALICE).andExpect(jsonPath("$.balance").value(1));
		history().andExpect(jsonPath("$.movements[?(@.kind == 'RECUP')].label")
				.value("Récupération le 04/01/2027 de 14:00 à 17:00"));
		mvc.perform(get("/api/planning").param("from", MON).param("to", "2027-01-11").header("X-Dev-User", BRUNO))
			.andExpect(jsonPath("$.absences[0].id").value((int) id))
			.andExpect(jsonPath("$.absences[0].startTime").value("14:00"))
			.andExpect(jsonPath("$.absences[0].status").value("APPROVED"))
			.andExpect(jsonPath("$.absences[0].type").doesNotExist());
	}

	@Test
	void planning_absenceEnAttente_visibleParTous_sansTypeNiMotif() throws Exception {
		long id = createdId(absence(ALICE, "SANS_SOLDE", MON, MON, "14:00", "16:00"));
		for (String viewer : new String[] { ALICE, BRUNO, ADMIN }) {
			mvc.perform(get("/api/planning").param("from", MON).param("to", "2027-01-11").header("X-Dev-User", viewer))
				.andExpect(jsonPath("$.absences[0].id").value((int) id))
				.andExpect(jsonPath("$.absences[0].status").value("PENDING"))
				.andExpect(jsonPath("$.absences[0].type").doesNotExist())
				.andExpect(jsonPath("$.absences[0].comment").doesNotExist());
		}
		json(post("/api/admin/absence-requests/" + id + "/decision"), decision(false), ADMIN).andExpect(status().isOk());
		mvc.perform(get("/api/planning").param("from", MON).param("to", "2027-01-11").header("X-Dev-User", BRUNO))
			.andExpect(jsonPath("$.absences").isEmpty());
	}

	@Test
	void recup_approbationRefuseeSiLeSoldeABaisse_409() throws Exception {
		grant("4");
		long id = createdId(absence(ALICE, "RECUP_HEURES_SUP", MON, MON, "14:00", "17:00"));
		json(post("/api/admin/users/" + aliceId + "/balance-adjustments"), "{\"hours\": -2, \"reason\": \"correction\"}",
				ADMIN)
			.andExpect(status().isCreated());
		json(post("/api/admin/absence-requests/" + id + "/decision"), decision(true), ADMIN)
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.detail", containsString("Solde insuffisant")));
		assertThat(dbStatus(id, "absence_request")).isEqualTo("PENDING");
	}

	@Test
	void sansSolde_sansImpactSurLeSolde() throws Exception {
		long id = createdId(absence(ALICE, "SANS_SOLDE", MON, TUE, null, null));
		json(post("/api/admin/absence-requests/" + id + "/decision"), decision(true), ADMIN).andExpect(status().isOk());
		balance(ALICE).andExpect(jsonPath("$.balance").value(0)).andExpect(jsonPath("$.available").value(0));
	}

	// ---------- solde / ajustements / validation ----------

	@Test
	void ajustements_admin_etHistorique() throws Exception {
		json(post("/api/admin/users/" + aliceId + "/balance-adjustments"), adjustment("12.5"), ADMIN)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.balance").value(12.5))
			.andExpect(jsonPath("$.movements[0].kind").value("ADJUSTMENT"))
			.andExpect(jsonPath("$.movements[0].label").value("Ajustement : reprise du solde"));
		json(post("/api/admin/users/" + aliceId + "/balance-adjustments"), adjustment("0"), ADMIN)
			.andExpect(status().isBadRequest());
		json(post("/api/admin/users/999999/balance-adjustments"), adjustment("1"), ADMIN)
			.andExpect(status().isNotFound());
		mvc.perform(get("/api/admin/users/" + aliceId + "/balance").header("X-Dev-User", ADMIN))
			.andExpect(jsonPath("$.balance").value(12.5));
	}

	@Test
	void pending_listeLesDemandesEnAttenteDeTous() throws Exception {
		declare(ALICE, SAT_BEFORE, "2");
		long rejected = declare(BRUNO, SAT_BEFORE, "3");
		json(post("/api/admin/overtime-requests/" + rejected + "/decision"), decision(false), ADMIN);
		absence(BRUNO, "SANS_SOLDE", MON, MON, null, null);
		mvc.perform(get("/api/admin/pending-requests").header("X-Dev-User", ADMIN))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.overtimes.length()").value(1))
			.andExpect(jsonPath("$.absences.length()").value(1));
	}

	@Test
	void chaqueTransitionPublieUnEvenement() throws Exception {
		long id = declare(ALICE, SAT_BEFORE, "2");
		json(post("/api/admin/overtime-requests/" + id + "/decision"), "{\"approved\": false, \"comment\": \"non\"}",
				ADMIN);
		assertThat(events.stream(RequestStatusChanged.class))
			.extracting(RequestStatusChanged::status, RequestStatusChanged::adminComment)
			.containsExactly(Tuple.tuple(RequestStatus.PENDING, null), Tuple.tuple(RequestStatus.REJECTED, "non"));
	}

	// ---------- helpers ----------

	private ResultActions json(MockHttpServletRequestBuilder builder, String body, String user) throws Exception {
		return mvc.perform(builder.contentType(MediaType.APPLICATION_JSON).content(body).header("X-Dev-User", user));
	}

	private long createdId(ResultActions actions) throws Exception {
		actions.andExpect(status().isCreated());
		String body = actions.andReturn().getResponse().getContentAsString();
		return Long.parseLong(body.replaceAll("^\\{\"id\":(\\d+).*$", "$1"));
	}

	/** Déclare `hours` heures sup à partir de 8h (le samedi : jour non travaillé). */
	private long declare(String user, String date, String hours) throws Exception {
		return createdId(json(post("/api/me/overtime-requests"), overtime(date, hours), user));
	}

	private ResultActions absence(String user, String type, String start, String end, String startTime,
			String endTime) throws Exception {
		return json(post("/api/me/absence-requests"), absenceBody(type, start, end, startTime, endTime), user);
	}

	private static String absenceBody(String type, String start, String end, String startTime, String endTime) {
		return """
				{"type": "%s", "startDate": "%s", "endDate": "%s", "startTime": %s, "endTime": %s, "comment": "test"}"""
			.formatted(type, start, end, quoted(startTime), quoted(endTime));
	}

	private static String quoted(String value) {
		return value == null ? "null" : "\"" + value + "\"";
	}

	/** Crédite le solde d'Alice via un ajustement admin. */
	private void grant(String hours) throws Exception {
		json(post("/api/admin/users/" + aliceId + "/balance-adjustments"), adjustment(hours), ADMIN)
			.andExpect(status().isCreated());
	}

	/** Historique du solde d'Alice (réservé à l'admin). */
	private ResultActions history() throws Exception {
		return mvc.perform(get("/api/admin/users/" + aliceId + "/balance").header("X-Dev-User", ADMIN))
			.andExpect(status().isOk());
	}

	private ResultActions balance(String user) throws Exception {
		return mvc.perform(get("/api/me/balance").header("X-Dev-User", user)).andExpect(status().isOk());
	}

	private String dbStatus(long id, String table) {
		return jdbc.queryForObject("select status from " + table + " where id = ?", String.class, id);
	}

	private static String overtime(String date, String hours) {
		int minutes = (int) (Double.parseDouble(hours) * 60);
		return overtimeAt(date, "08:00", java.time.LocalTime.of(8, 0).plusMinutes(minutes).toString());
	}

	private static String overtimeAt(String date, String start, String end) {
		return """
				{"date": "%s", "startTime": "%s", "endTime": "%s", "reason": "réunion du soir"}""".formatted(date, start,
				end);
	}

	private static String decision(boolean approved) {
		return "{\"approved\": " + approved + "}";
	}

	private static String adjustment(String hours) {
		return """
				{"hours": %s, "reason": "reprise du solde"}""".formatted(hours);
	}

}
