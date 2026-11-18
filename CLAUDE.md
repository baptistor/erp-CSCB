# ERP Plannings / Congés / Heures sup — V1

Spec fonctionnelle : `docs/SPEC.md` — à relire avant toute nouvelle feature.
Contrat d'API : `api/openapi.yaml` — source de vérité entre back et front.

## Stack (versions imposées — ne pas rétrograder)
- Back : Java 25, Spring Boot 4 (Spring Framework 7, Jackson 3), Maven wrapper, PostgreSQL, Flyway
- Front : Angular 22 (standalone, signals, zoneless), Angular Material, FullCalendar
- Infra locale : `docker compose up -d` (PostgreSQL + Mailpit)

Ces versions sont récentes : en cas de doute sur une API, consulter la doc à jour
via le MCP context7 plutôt que de supposer. Ne jamais utiliser de syntaxe dépréciée
(NgModules, `*ngIf`/`*ngFor`, `WebSecurityConfigurerAdapter`, `javax.*`).

## Commandes
- Infra : `docker compose up -d`
- Back : `cd backend && ./mvnw spring-boot:run` | tests : `./mvnw verify`
- Front : `cd frontend && npm start` | tests : `npm test` | build : `npm run build`
- Client API : `cd frontend && npm run generate:api` (après toute modif de openapi.yaml)
- Mails en dev : http://localhost:8025 (Mailpit)

## Règles de travail
1. Une feature = une tranche verticale : openapi.yaml → back + tests → front → test e2e manuel.
2. Toute modif d'API commence par `api/openapi.yaml`, puis régénérer le client Angular.
3. Ne pas terminer une tâche si `./mvnw verify` ou `npm run build` échoue.
4. Migrations : toujours un NOUVEAU fichier Flyway, jamais modifier une migration existante.
5. Sécurité : chaque endpoint a son contrôle de rôle côté serveur, couvert par un test.
6. Pas de nouvelle dépendance sans le signaler dans le résumé.
7. V1 = vitesse : pas d'abstraction prématurée, pas de feature hors `docs/SPEC.md`.
8. Fin de tâche : résumé court (fichiers touchés, comment tester) + proposer un message de commit.
