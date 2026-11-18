-- Données de démo, chargées UNIQUEMENT en profil dev (spring.flyway.locations).
INSERT INTO app_user (email, first_name, last_name, role) VALUES
    ('alice.martin@exemple.fr',  'Alice',  'Martin',  'EMPLOYEE'),
    ('bruno.durand@exemple.fr',  'Bruno',  'Durand',  'EMPLOYEE'),
    ('chloe.bernard@exemple.fr', 'Chloé',  'Bernard', 'EMPLOYEE')
ON CONFLICT DO NOTHING;
