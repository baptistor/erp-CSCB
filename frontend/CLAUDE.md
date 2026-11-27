# Frontend — Angular 22

## Organisation
```
src/app
├── core/       auth, interceptor HTTP, guards (authGuard, adminGuard), layout
├── api/        client GÉNÉRÉ depuis api/openapi.yaml — ne jamais éditer à la main
├── features/
│   ├── planning/      planning de tout le monde : pose des absences / heures sup, horaires types
│   └── admin/         file de validation, gestion des plannings
└── shared/     composants réutilisables
```

## Conventions
- Composants standalone uniquement, `ChangeDetectionStrategy.OnPush`, zoneless.
- État avec signals (`signal`, `computed`, `resource`/`httpResource`) ; RxJS seulement si utile.
- Control flow natif (`@if`, `@for`, `@switch`), `inject()` plutôt que l'injection par constructeur.
- Routes lazy-loadées par feature ; la route `admin` protégée par `adminGuard`.
- UI : Angular Material ; pas d'autre librairie UI.
- Appels HTTP uniquement via les services générés dans `api/`.
- Textes de l'interface en français.

## Tests
- Tests unitaires sur les composants à logique (formulaires, calcul de jours).
- Vérifier visuellement les écrans modifiés via le MCP Playwright.
