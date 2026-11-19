-- Spec §3 : une absence est posée sur le planning, soit sur une plage horaire d'un jour, soit sur des journées entières.
-- start_time / end_time NULL = journées entières ; renseignés = plage d'un seul jour (fin > début).
-- Le nombre d'heures (colonne hours) est désormais calculé par le serveur.

ALTER TABLE absence_request
    ADD COLUMN start_time TIME,
    ADD COLUMN end_time   TIME,
    ADD CONSTRAINT ck_absence_time_range CHECK (
        (start_time IS NULL AND end_time IS NULL)
        OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time AND start_date = end_date));
