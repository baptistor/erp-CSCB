-- Spec §1 : planning d'un jour = journée spéciale si elle existe, sinon journée type.
-- Une plage horaire par employé et par jour ; start_time/end_time NULL = « non travaillé ».

ALTER TABLE app_user
    ADD COLUMN min_daily_hours NUMERIC(4,2) NOT NULL DEFAULT 8
        CONSTRAINT ck_app_user_min_hours CHECK (min_daily_hours > 0 AND min_daily_hours <= 24
                                                AND min_daily_hours * 4 = trunc(min_daily_hours * 4));

-- Journée type : par employé et par jour de semaine (1 = lundi … 7 = dimanche, ISO)
CREATE TABLE typical_day (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT   NOT NULL REFERENCES app_user (id),
    day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time   TIME,
    end_time     TIME,
    CONSTRAINT ux_typical_day UNIQUE (user_id, day_of_week),
    CONSTRAINT ck_typical_day_range CHECK (
        (start_time IS NULL AND end_time IS NULL)
        OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time))
);

-- Semaine par défaut des utilisateurs existants : lundi → vendredi 9h–17h, week-end non travaillé
INSERT INTO typical_day (user_id, day_of_week, start_time, end_time)
SELECT u.id, d.dow,
       CASE WHEN d.dow <= 5 THEN TIME '09:00' END,
       CASE WHEN d.dow <= 5 THEN TIME '17:00' END
FROM app_user u
CROSS JOIN generate_series(1, 7) AS d(dow);

-- Journée spéciale : remplace la journée type pour une date donnée
CREATE TABLE special_day (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES app_user (id),
    day_date    DATE        NOT NULL,
    start_time  TIME,
    end_time    TIME,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ux_special_day UNIQUE (user_id, day_date),
    CONSTRAINT ck_special_day_range CHECK (
        (start_time IS NULL AND end_time IS NULL)
        OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time))
);
CREATE INDEX ix_special_day_date ON special_day (day_date);

-- Les anciens créneaux libres deviennent des journées spéciales (une plage par jour : min début → max fin)
INSERT INTO special_day (user_id, day_date, start_time, end_time)
SELECT user_id, slot_date, min(start_time), max(end_time)
FROM work_slot
GROUP BY user_id, slot_date;

DROP TABLE work_slot;
