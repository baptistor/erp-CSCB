-- Données de démo, chargées UNIQUEMENT en profil dev (spring.flyway.locations).
-- Migration répétable : rejouée à chaque modification, donc idempotente.
-- (NOT EXISTS plutôt que ON CONFLICT : ne consomme pas d'id, donc pas de couleur du planning, à chaque passage)
INSERT INTO app_user (email, first_name, last_name, role)
SELECT v.email, v.first_name, v.last_name, 'EMPLOYEE'
FROM (VALUES
    (1, 'alice.martin@exemple.fr',    'Alice',   'Martin'),
    (2, 'bruno.durand@exemple.fr',    'Bruno',   'Durand'),
    (3, 'chloe.bernard@exemple.fr',   'Chloé',   'Bernard'),
    (4, 'david.petit@exemple.fr',     'David',   'Petit'),
    (5, 'emma.robert@exemple.fr',     'Emma',    'Robert'),
    (6, 'farid.benali@exemple.fr',    'Farid',   'Benali'),
    (7, 'gaelle.moreau@exemple.fr',   'Gaëlle',  'Moreau'),
    (8, 'hugo.lefevre@exemple.fr',    'Hugo',    'Lefèvre'),
    (9, 'ines.garcia@exemple.fr',     'Inès',    'Garcia')
) AS v (pos, email, first_name, last_name)
WHERE NOT EXISTS (SELECT 1 FROM app_user u WHERE lower(u.email) = v.email)
ORDER BY v.pos;

-- Quelques horaires différents (35 h), pour un planning de démo moins uniforme
INSERT INTO typical_day (user_id, day_of_week, morning_start, morning_end, afternoon_start, afternoon_end)
SELECT u.id, d.dow,
       CASE WHEN d.dow <= 5 THEN v.morning END, CASE WHEN d.dow <= 5 THEN TIME '12:30' END,
       CASE WHEN d.dow <= 5 THEN TIME '13:30' END, CASE WHEN d.dow <= 5 THEN v.evening END
FROM (VALUES
    ('david.petit@exemple.fr',   TIME '08:00', TIME '16:00'),
    ('farid.benali@exemple.fr',  TIME '10:00', TIME '18:00'),
    ('hugo.lefevre@exemple.fr',  TIME '11:00', TIME '19:00')
) AS v (email, morning, evening)
JOIN app_user u ON lower(u.email) = v.email
CROSS JOIN generate_series(1, 7) AS d(dow)
ON CONFLICT DO NOTHING;

-- Semaine type classique par défaut (lun → ven 9h–12h30 / 13h30–17h, 35 h) pour tout utilisateur qui n'en a pas encore
INSERT INTO typical_day (user_id, day_of_week, morning_start, morning_end, afternoon_start, afternoon_end)
SELECT u.id, d.dow,
       CASE WHEN d.dow <= 5 THEN TIME '09:00' END,
       CASE WHEN d.dow <= 5 THEN TIME '12:30' END,
       CASE WHEN d.dow <= 5 THEN TIME '13:30' END,
       CASE WHEN d.dow <= 5 THEN TIME '17:00' END
FROM app_user u
CROSS JOIN generate_series(1, 7) AS d(dow)
ON CONFLICT DO NOTHING;
