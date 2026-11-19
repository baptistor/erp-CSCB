# Backend — Spring Boot 4 / Java 25

## Organisation (package par feature)
```
com.erp
├── auth/        sécurité, utilisateur courant, rôles
├── user/
├── schedule/    planning
├── leave/       demandes de congés + soldes
├── overtime/    heures supplémentaires
├── notification/ envoi des mails
└── common/      erreurs, audit
```
Dans chaque feature : `XxxController`, `XxxService`, `XxxRepository`, entité JPA, DTO.

## Conventions
- DTO en `record` Java ; jamais exposer une entité JPA dans un controller.
- Logique métier dans les services (ex : transitions de statut), pas dans les controllers.
- Statuts de demande : PENDING → APPROVED | REJECTED, PENDING → CANCELLED (par le demandeur).
  Toute transition passe par une seule méthode de service qui publie un événement
  (`ApplicationEventPublisher`) ; le module notification écoute et envoie le mail
  avec `@TransactionalEventListener(phase = AFTER_COMMIT)` (jamais `@EventListener` : pas de mail si la transaction échoue).
- Sécurité : OAuth2 Resource Server (JWT). `@PreAuthorize` sur chaque méthode de controller.
  Profil `dev` : authentification simulée (header `X-Dev-User: email`) pour développer sans SSO.
- Erreurs : `@RestControllerAdvice` + `ProblemDetail`.
- Dates : `LocalDate` / `LocalTime`, fuseau Europe/Paris.

## Tests
- Services : JUnit 5 + AssertJ.
- Controllers + sécurité : `@SpringBootTest` + MockMvc, tester un accès autorisé ET refusé.
- Base : Testcontainers PostgreSQL (pas de H2).
