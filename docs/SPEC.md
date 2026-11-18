# Spec V1 — ERP Plannings / Congés / Heures sup

Objectif V1 : un outil utilisable par l'équipe, le plus vite possible. Tout ce qui n'est
pas listé ici est HORS V1.

## Rôles
- **EMPLOYEE** : voit le planning de tous, gère ses propres demandes.
- **ADMIN** : tout ce que fait EMPLOYEE + valide/refuse les demandes + édite les plannings.
Le rôle est stocké en base (table `app_user`). Le premier admin est inséré par migration.

## Authentification
- SSO OIDC avec l'adresse mail pro (fournisseur : Microsoft Entra ID ).
- Seuls les emails du domaine `@[DOMAINE]` sont acceptés.
- Premier login → création automatique du user en EMPLOYEE.
- Profil `dev` : login simulé, sans SSO.

## Fonctionnalités V1
### 1. Planning (tous)
- Vue semaine / mois de tous les employés (FullCalendar, une couleur par personne avec son nom prénom apparent).
- Affiche : créneaux de travail + congés approuvés.
- ADMIN : crée / modifie / supprime des créneaux (date, début, fin).

Tout se compte en HEURES (pas de jours).
Workflow commun à toutes les demandes : PENDING → APPROVED | REJECTED (par un admin, commentaire optionnel) ; PENDING → CANCELLED (par le demandeur).


### 2. Déclarer des heures supplémentaires (alimente le solde)
- Champs : date, nombre d'heures (pas de 0,25), motif.
- Une fois APPROVED, les heures sont ajoutées au solde de l'employé.

### 3. Poser une absence (2 types)
- Champs : type (RECUP_HEURES_SUP | SANS_SOLDE), date début, date fin, nombre d'heures (pas de 0,25), commentaire.
- RECUP_HEURES_SUP : consomme le solde d'heures sup.
  À la création, refuser si nombre d'heures > solde disponible
  (solde disponible = solde − heures des demandes de récup PENDING).
- SANS_SOLDE : aucun impact sur le solde.
- Règles : date fin ≥ date début ; pas de chevauchement avec une autre absence PENDING/APPROVED.

### Solde d'heures sup
- Solde = Σ heures sup APPROVED − Σ récup APPROVED + ajustements admin.
- L'admin peut saisir un ajustement (+/− heures, motif), ex. reprise du solde existant au démarrage.
- Vue perso : solde actuel + historique des mouvements (heures sup, récup, ajustements).

### 4. Notifications email
- Demande créée → mail aux admins.
- Demande approuvée / refusée → mail au demandeur (avec le commentaire).
- En dev : Mailpit. En prod : SMTP du fournisseur (à configurer).

## Écrans
- `/planning` — planning de tous (page d'accueil)
- `/mes-demandes` — mes heures sup + absences, solde d'heures et historique, boutons « Déclarer des heures » / « Poser une absence »
- `/admin/validations` — demandes PENDING, accepter/refuser
- `/admin/plannings` — édition des créneaux + ajustements de solde
