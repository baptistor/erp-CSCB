-- Spec §1 : la semaine type respecte un contrat hebdomadaire (35 h par défaut) et non plus un minimum par jour.

ALTER TABLE app_user
    ADD COLUMN weekly_hours NUMERIC(5,2) NOT NULL DEFAULT 35
        CONSTRAINT ck_app_user_weekly_hours CHECK (weekly_hours > 0 AND weekly_hours <= 168
                                                   AND weekly_hours * 4 = trunc(weekly_hours * 4));

ALTER TABLE app_user DROP COLUMN min_daily_hours;

-- Nouvelle semaine type par défaut pour tous : lundi → vendredi 9h–16h (5 × 7 h = 35 h), week-end non travaillé
UPDATE typical_day
SET start_time = CASE WHEN day_of_week <= 5 THEN TIME '09:00' END,
    end_time   = CASE WHEN day_of_week <= 5 THEN TIME '16:00' END;
