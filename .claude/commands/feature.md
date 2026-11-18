Implémente la feature suivante en tranche verticale : $ARGUMENTS

1. Relis `docs/SPEC.md` et les CLAUDE.md concernés. Si la feature n'est pas dans la spec, arrête-toi et demande.
2. Propose un plan court (fichiers à créer/modifier) et attends ma validation.
3. Mets à jour `api/openapi.yaml` si l'API change, puis `npm run generate:api` dans frontend.
4. Back : migration Flyway si besoin, entité, service, controller, tests (accès autorisé ET refusé).
5. Lance `./mvnw verify` et corrige jusqu'à ce que ça passe.
6. Front : écran(s) et appels via le client généré. Lance `npm run build` et `npm test`.
7. Vérifie l'écran avec le MCP Playwright (back et front lancés, profil dev).
8. Termine par : résumé, comment tester à la main, message de commit proposé.
