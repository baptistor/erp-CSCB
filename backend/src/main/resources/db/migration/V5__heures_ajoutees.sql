-- Spec §1 : on ne modifie plus les horaires d'un jour, on AJOUTE des plages en dehors de la journée type.
-- special_day (nom technique) = une plage ajoutée ; plusieurs par employé et par jour possibles.
-- Reprise : on garde ce qui dépassait de la journée type (avant / après) ; un jour raccourci ou « non travaillé »
-- revient à la journée type.

ALTER TABLE special_day DROP CONSTRAINT ux_special_day;

CREATE TEMPORARY TABLE extra_part ON COMMIT DROP AS
WITH day AS (
    SELECT s.user_id, s.day_date, s.start_time AS s_start, s.end_time AS s_end, s.created_at,
           t.start_time AS t_start, t.end_time AS t_end
    FROM special_day s
    LEFT JOIN typical_day t ON t.user_id = s.user_id AND t.day_of_week = EXTRACT(ISODOW FROM s.day_date)
    WHERE s.start_time IS NOT NULL
)
SELECT user_id, day_date, s_start AS start_time, s_end AS end_time, created_at FROM day WHERE t_start IS NULL
UNION ALL
SELECT user_id, day_date, s_start, LEAST(s_end, t_start), created_at FROM day WHERE s_start < t_start
UNION ALL
SELECT user_id, day_date, GREATEST(s_start, t_end), s_end, created_at FROM day WHERE s_end > t_end;

DELETE FROM special_day;
INSERT INTO special_day (user_id, day_date, start_time, end_time, created_at)
SELECT user_id, day_date, start_time, end_time, created_at FROM extra_part;

ALTER TABLE special_day ALTER COLUMN start_time SET NOT NULL, ALTER COLUMN end_time SET NOT NULL;
CREATE INDEX ix_special_day_user_date ON special_day (user_id, day_date);
