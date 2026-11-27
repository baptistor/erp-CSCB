-- Schéma de l'ERP plannings / congés / heures sup (cf. docs/SPEC.md).
-- Les heures se comptent au pas de 0,25 h. Statut d'une demande : PENDING → APPROVED / REJECTED / CANCELLED.

-- Utilisateurs (créés au premier login SSO ; le premier admin vient de la configuration)
CREATE TABLE app_user (
    id           BIGSERIAL PRIMARY KEY,
    email        VARCHAR(255) NOT NULL,
    first_name   VARCHAR(100),
    last_name    VARCHAR(100),
    role         VARCHAR(20)  NOT NULL DEFAULT 'EMPLOYEE' CHECK (role IN ('EMPLOYEE', 'ADMIN')),
    weekly_hours NUMERIC(5,2) NOT NULL DEFAULT 35,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_app_user_weekly_hours CHECK (weekly_hours > 0 AND weekly_hours <= 168 AND weekly_hours * 4 = trunc(weekly_hours * 4))
);
CREATE UNIQUE INDEX ux_app_user_email ON app_user (lower(email));

-- Semaines type : une ligne par employé, type de semaine et jour (1 = lundi … 7 = dimanche, toujours fermé).
-- Classique : matin (fin ≤ 12h30) + après-midi (début ≥ 13h30). Vacances : une seule plage (morning_*), sans pause.
CREATE TABLE typical_day (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT      NOT NULL REFERENCES app_user (id),
    week_type       VARCHAR(10) NOT NULL CHECK (week_type IN ('CLASSIC', 'HOLIDAY')),
    day_of_week     SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    morning_start   TIME,
    morning_end     TIME,
    afternoon_start TIME,
    afternoon_end   TIME,
    CONSTRAINT ux_typical_day UNIQUE (user_id, week_type, day_of_week),
    CONSTRAINT ck_typical_day_morning CHECK (
        (morning_start IS NULL AND morning_end IS NULL)
        OR (morning_end > morning_start AND (week_type = 'HOLIDAY' OR morning_end <= TIME '12:30'))),
    CONSTRAINT ck_typical_day_afternoon CHECK (
        (afternoon_start IS NULL AND afternoon_end IS NULL)
        OR (week_type = 'CLASSIC' AND afternoon_end > afternoon_start AND afternoon_start >= TIME '13:30')),
    CONSTRAINT ck_typical_day_sunday CHECK (day_of_week <> 7 OR (morning_start IS NULL AND afternoon_start IS NULL))
);

-- Semaines de vacances scolaires (communes à tous), identifiées par leur lundi
CREATE TABLE school_holiday_week (
    week_start DATE PRIMARY KEY CHECK (EXTRACT(ISODOW FROM week_start) = 1)
);

-- Validation du calendrier des vacances : une seule ligne, null = jamais validé
CREATE TABLE school_holiday_calendar (
    id              SMALLINT PRIMARY KEY CHECK (id = 1),
    validated_until DATE,
    validated_by    BIGINT REFERENCES app_user (id),
    validated_at    TIMESTAMPTZ
);
INSERT INTO school_holiday_calendar (id) VALUES (1);

-- Heures sup posées sur le planning (plage d'un jour) ; created_by = admin qui les a saisies (acceptées d'office)
CREATE TABLE overtime_request (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT       NOT NULL REFERENCES app_user (id),
    work_date     DATE         NOT NULL,
    start_time    TIME         NOT NULL,
    end_time      TIME         NOT NULL,
    hours         NUMERIC(5,2) NOT NULL,
    reason        TEXT         NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    admin_comment TEXT,
    created_by    BIGINT REFERENCES app_user (id),
    decided_by    BIGINT REFERENCES app_user (id),
    decided_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_overtime_time_range CHECK (end_time > start_time),
    CONSTRAINT ck_overtime_hours CHECK (hours > 0 AND hours * 4 = trunc(hours * 4))
);
CREATE INDEX ix_overtime_user_status ON overtime_request (user_id, status);
CREATE INDEX ix_overtime_date ON overtime_request (work_date);

-- Absences : récup d'heures sup ou sans solde ; plage horaire sur un jour, ou journées entières (heures null)
CREATE TABLE absence_request (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT       NOT NULL REFERENCES app_user (id),
    type          VARCHAR(20)  NOT NULL CHECK (type IN ('RECUP_HEURES_SUP', 'SANS_SOLDE')),
    start_date    DATE         NOT NULL,
    end_date      DATE         NOT NULL,
    start_time    TIME,
    end_time      TIME,
    hours         NUMERIC(5,2) NOT NULL,
    comment       TEXT,
    status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    admin_comment TEXT,
    decided_by    BIGINT REFERENCES app_user (id),
    decided_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_absence_dates CHECK (end_date >= start_date),
    CONSTRAINT ck_absence_time_range CHECK (
        (start_time IS NULL AND end_time IS NULL)
        OR (end_time > start_time AND start_date = end_date)),
    CONSTRAINT ck_absence_hours CHECK (hours > 0 AND hours * 4 = trunc(hours * 4))
);
CREATE INDEX ix_absence_user_status ON absence_request (user_id, status);
CREATE INDEX ix_absence_dates ON absence_request (start_date, end_date);

-- Ajustements de solde saisis par un admin (+/− heures)
CREATE TABLE balance_adjustment (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES app_user (id),
    hours      NUMERIC(6,2) NOT NULL,
    reason     TEXT         NOT NULL,
    created_by BIGINT       NOT NULL REFERENCES app_user (id),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_adjustment_hours CHECK (hours <> 0 AND hours * 4 = trunc(hours * 4))
);
CREATE INDEX ix_adjustment_user ON balance_adjustment (user_id);

-- Premier admin (email fourni par la configuration : spring.flyway.placeholders.initialAdminEmail),
-- avec les semaines type par défaut (classique 9h–12h30 / 13h30–17h, vacances 9h–16h, du lundi au vendredi)
INSERT INTO app_user (email, first_name, last_name, role) VALUES ('${initialAdminEmail}', 'Admin', 'Initial', 'ADMIN');
INSERT INTO typical_day (user_id, week_type, day_of_week, morning_start, morning_end, afternoon_start, afternoon_end)
SELECT u.id, w.week_type, d,
       CASE WHEN d <= 5 THEN TIME '09:00' END,
       CASE WHEN d <= 5 THEN CASE w.week_type WHEN 'CLASSIC' THEN TIME '12:30' ELSE TIME '16:00' END END,
       CASE WHEN d <= 5 AND w.week_type = 'CLASSIC' THEN TIME '13:30' END,
       CASE WHEN d <= 5 AND w.week_type = 'CLASSIC' THEN TIME '17:00' END
FROM app_user u, (VALUES ('CLASSIC'), ('HOLIDAY')) AS w (week_type), generate_series(1, 7) AS d;
