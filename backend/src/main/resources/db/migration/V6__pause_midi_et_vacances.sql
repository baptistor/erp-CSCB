-- Spec §1 : pause de midi obligatoire 12h30–13h30 (jamais comptée), journée type = matin + après-midi,
-- deux semaines type par employé (classique / vacances scolaires) et semaines de vacances marquées par l'admin.

ALTER TABLE typical_day
    ADD COLUMN week_type VARCHAR(10) NOT NULL DEFAULT 'CLASSIC' CHECK (week_type IN ('CLASSIC', 'HOLIDAY')),
    ADD COLUMN morning_start TIME,
    ADD COLUMN morning_end TIME,
    ADD COLUMN afternoon_start TIME,
    ADD COLUMN afternoon_end TIME;

-- Reprise à durée égale : ce qui tombait dans la pause est reporté en fin de journée (9h–16h → 9h–12h30 / 13h30–17h)
UPDATE typical_day SET morning_start = start_time, morning_end = LEAST(end_time, TIME '12:30')
WHERE start_time < TIME '12:30';

UPDATE typical_day
SET afternoon_start = GREATEST(start_time, TIME '13:30'),
    afternoon_end = LEAST(
        GREATEST(start_time, TIME '13:30') - TIME '00:00'
            + (end_time - start_time) - COALESCE(morning_end - morning_start, INTERVAL '0'),
        INTERVAL '23:59')::time
WHERE end_time > TIME '12:30';

ALTER TABLE typical_day
    DROP CONSTRAINT ck_typical_day_range,
    DROP CONSTRAINT ux_typical_day,
    DROP COLUMN start_time,
    DROP COLUMN end_time,
    ADD CONSTRAINT ux_typical_day UNIQUE (user_id, week_type, day_of_week),
    ADD CONSTRAINT ck_typical_day_morning CHECK (
        (morning_start IS NULL AND morning_end IS NULL)
        OR (morning_start IS NOT NULL AND morning_end IS NOT NULL
            AND morning_end > morning_start AND morning_end <= TIME '12:30')),
    ADD CONSTRAINT ck_typical_day_afternoon CHECK (
        (afternoon_start IS NULL AND afternoon_end IS NULL)
        OR (afternoon_start IS NOT NULL AND afternoon_end IS NOT NULL
            AND afternoon_end > afternoon_start AND afternoon_start >= TIME '13:30'));

-- Heures ajoutées : coupées autour de la pause
INSERT INTO special_day (user_id, day_date, start_time, end_time, created_at)
SELECT user_id, day_date, TIME '13:30', end_time, created_at
FROM special_day WHERE start_time < TIME '12:30' AND end_time > TIME '13:30';
UPDATE special_day SET end_time = TIME '12:30' WHERE start_time < TIME '12:30' AND end_time > TIME '12:30';
DELETE FROM special_day WHERE start_time >= TIME '12:30' AND end_time <= TIME '13:30';
UPDATE special_day SET start_time = TIME '13:30' WHERE start_time >= TIME '12:30' AND start_time < TIME '13:30';
ALTER TABLE special_day ADD CONSTRAINT ck_special_day_break
    CHECK (end_time <= TIME '12:30' OR start_time >= TIME '13:30');

-- Semaines de vacances scolaires, communes à tous (identifiées par leur lundi)
CREATE TABLE school_holiday_week (
    week_start DATE PRIMARY KEY CHECK (EXTRACT(ISODOW FROM week_start) = 1)
);
