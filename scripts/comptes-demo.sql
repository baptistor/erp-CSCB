-- Comptes de démo (dev uniquement) : l'admin + 9 employés, avec leurs semaines type (35 h).
-- À lancer à la main, après le démarrage du back (le schéma Flyway doit exister) :
--   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < scripts/comptes-demo.sql
-- Idempotent : un compte déjà présent n'est ni dupliqué ni modifié.

BEGIN;

-- Admin (déjà créé par la migration si initialAdminEmail = admin@exemple.fr)
INSERT INTO app_user (email, first_name, last_name, role)
SELECT 'admin@exemple.fr', 'Admin', 'Initial', 'ADMIN'
WHERE NOT EXISTS (SELECT 1 FROM app_user WHERE lower(email) = 'admin@exemple.fr');

-- Employés, insérés dans l'ordre (l'ordre des id fixe les couleurs du planning)
INSERT INTO app_user (email, first_name, last_name, role)
SELECT v.email, v.first_name, v.last_name, 'EMPLOYEE'
FROM (VALUES
    (1, 'alice.martin@exemple.fr',  'Alice',  'Martin'),
    (2, 'bruno.durand@exemple.fr',  'Bruno',  'Durand'),
    (3, 'chloe.bernard@exemple.fr', 'Chloé',  'Bernard'),
    (4, 'david.petit@exemple.fr',   'David',  'Petit'),
    (5, 'emma.robert@exemple.fr',   'Emma',   'Robert'),
    (6, 'farid.benali@exemple.fr',  'Farid',  'Benali'),
    (7, 'gaelle.moreau@exemple.fr', 'Gaëlle', 'Moreau'),
    (8, 'hugo.lefevre@exemple.fr',  'Hugo',   'Lefèvre'),
    (9, 'ines.garcia@exemple.fr',   'Inès',   'Garcia')
) AS v (pos, email, first_name, last_name)
WHERE NOT EXISTS (SELECT 1 FROM app_user u WHERE lower(u.email) = v.email)
ORDER BY v.pos;

-- Semaines type, lundi → vendredi (samedi et dimanche non travaillés), pour les comptes qui n'en ont pas encore :
--   classique : début–12h30 / 13h30–fin ; vacances scolaires : une plage début–(fin − 1 h), sans pause.
-- Par défaut 9h–17h ; quelques horaires décalés pour un planning moins uniforme.
INSERT INTO typical_day (user_id, week_type, day_of_week, morning_start, morning_end, afternoon_start, afternoon_end)
SELECT u.id, w.week_type, d,
       CASE WHEN d <= 5 THEN h.start_time END,
       CASE WHEN d <= 5 THEN CASE w.week_type WHEN 'CLASSIC' THEN TIME '12:30' ELSE h.end_time - INTERVAL '1 hour' END END,
       CASE WHEN d <= 5 AND w.week_type = 'CLASSIC' THEN TIME '13:30' END,
       CASE WHEN d <= 5 AND w.week_type = 'CLASSIC' THEN h.end_time END
FROM app_user u
CROSS JOIN LATERAL (
    SELECT coalesce(v.start_time, TIME '09:00') AS start_time, coalesce(v.end_time, TIME '17:00') AS end_time
    FROM (SELECT 1) AS one
    LEFT JOIN (VALUES
        ('david.petit@exemple.fr',  TIME '08:00', TIME '16:00'),
        ('farid.benali@exemple.fr', TIME '10:00', TIME '18:00'),
        ('hugo.lefevre@exemple.fr', TIME '11:00', TIME '19:00')
    ) AS v (email, start_time, end_time) ON v.email = lower(u.email)
) AS h
CROSS JOIN (VALUES ('CLASSIC'), ('HOLIDAY')) AS w (week_type)
CROSS JOIN generate_series(1, 7) AS d
WHERE lower(u.email) LIKE '%@exemple.fr'
ON CONFLICT (user_id, week_type, day_of_week) DO NOTHING;

COMMIT;
