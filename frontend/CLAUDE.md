# Frontend — Angular 22

## Organisation
```
src/app
├── core/       auth, interceptor HTTP, guards (authGuard, adminGuard), layout
├── api/        client GÉNÉRÉ depuis api/openapi.yaml — ne jamais éditer à la main
├── features/
│   ├── planning/      vue planning de tout le monde (FullCalendar)
│   ├── my-requests/   mes congés + heures sup, formulaires, soldes
│   └── admin/         file de validation, gestion des plannings
└── shared/
└── components/    composants UI Zard UI générés (ne pas supprimer)
```

## Conventions Angular
- Composants standalone uniquement, `ChangeDetectionStrategy.OnPush`, zoneless.
- État avec signals (`signal`, `computed`, `resource`/`httpResource`) ; RxJS seulement si utile.
- Control flow natif (`@if`, `@for`, `@switch`), `inject()` plutôt que l'injection par constructeur.
- Routes lazy-loadées par feature ; la route `admin` protégée par `adminGuard`.
- Appels HTTP uniquement via les services générés dans `api/`.
- Textes de l'interface en français.

## UI & Design System (Zard UI + Tailwind CSS v4)
- **Zard UI uniquement** (`@/shared/components/...`) et **Tailwind CSS v4** pour toute l'interface. **Interdiction d'ajouter de nouveaux composants Angular Material** (migration en cours vers Zard UI).
- Avant de créer un composant UI (bouton, carte, modale, formulaire, tableau, badge, sélecteur, toast), vérifie `src/app/shared/components/` ou installe-le via `npx zard-cli@latest add <composant> --yes`.
- Pour personnaliser le style ou le comportement d'un composant Zard, modifie directement son code source dans `src/app/shared/components/`.
- **Tokens sémantiques obligatoires** : utilise exclusivement les variables Zard (`bg-background`, `text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`, `bg-primary`, `bg-destructive`). Interdiction d'utiliser des couleurs Tailwind brutes (`bg-blue-500`, `text-gray-600`, etc.).
- **Direction visuelle** : interface SaaS sobre et aérée (espacements généreux `gap-6`, `p-6`, bordures fines `border`, ombres légères `shadow-xs`), icônes Lucide via `ng-icons`.
- **FullCalendar** (`features/planning/`) : surcharger les variables CSS de FullCalendar (`--fc-border-color`, `--fc-button-bg-color`, etc.) avec les tokens Zard (`var(--border)`, `var(--primary)`, `var(--card)`) pour un rendu unifié.

## Tests & Validation
- Tests unitaires sur les composants à logique (formulaires, calcul de jours).
- Vérifier visuellement chaque écran migré via le **MCP Playwright** (desktop + mobile, états vides et modales) et s'assurer qu'aucune régression CSS n'apparaît tant que Material cohabite.
