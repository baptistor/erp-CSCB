-- Données de démo, chargées UNIQUEMENT en profil dev (spring.flyway.locations).
-- Migration répétable : rejouée à chaque modification, donc idempotente.
INSERT INTO app_user (email, first_name, last_name, role) VALUES
    ('alice.martin@exemple.fr',  'Alice',  'Martin',  'EMPLOYEE'),
    ('bruno.durand@exemple.fr',  'Bruno',  'Durand',  'EMPLOYEE'),
    ('chloe.bernard@exemple.fr', 'Chloé',  'Bernard', 'EMPLOYEE')
ON CONFLICT DO NOTHING;

-- Semaine type par défaut (lun → ven 9h–17h) pour tout utilisateur qui n'en a pas encore
INSERT INTO typical_day (user_id, day_of_week, start_time, end_time)
SELECT u.id, d.dow,
       CASE WHEN d.dow <= 5 THEN TIME '09:00' END,
       CASE WHEN d.dow <= 5 THEN TIME '17:00' END
FROM app_user u
CROSS JOIN generate_series(1, 7) AS d(dow)
ON CONFLICT DO NOTHING;
