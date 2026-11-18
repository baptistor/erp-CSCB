# Spec V1 — ERP Plannings / Congés / Heures sup

Objectif V1 : un outil utilisable par l'équipe, le plus vite possible. Tout ce qui n'est
pas listé ici est HORS V1.

## Rôles
- **EMPLOYEE** : voit le planning de tous, gère ses propres demandes.
- **ADMIN** : tout ce que fait EMPLOYEE + valide/refuse les demandes + édite les plannings.
Le rôle est stocké en base (table `app_user`). Le premier admin est inséré par migration.

## Authentification
- SSO OIDC avec l'adresse mail pro (fournisseur : [Microsoft Entra ID | Google Workspace] — À CHOISIR).
- Seuls les emails du domaine `@[DOMAINE]` sont acceptés.
- Premier login → création automatique du user en EMPLOYEE.
- Profil `dev` : login simulé, sans SSO.

## Fonctionnalités V1
### 1. Planning (tous)
- Vue semaine / mois de tous les employés (FullCalendar, une ligne ou une couleur par personne).
- Affiche : créneaux de travail + congés approuvés.
- ADMIN : crée / modifie / supprime des créneaux (date, début, fin, type : BUREAU | TELETRAVAIL).

### 2. Demandes de congés
- Champs : type (CP | RTT | SANS_SOLDE), date début, date fin, demi-journée début/fin, commentaire.
- Statuts : PENDING → APPROVED | REJECTED (par un admin, commentaire optionnel) ; PENDING → CANCELLED (par le demandeur).
- Règles : date fin ≥ date début ; pas de chevauchement avec une autre demande PENDING/APPROVED ;
  nombre de jours ouvrés calculé (hors week-ends et jours fériés français).
- Solde CP / RTT par employé et par année, saisi par l'admin, décrémenté à l'approbation.

### 3. Heures supplémentaires
- Champs : date, nombre d'heures (pas de 0,25), motif.
- Même workflow de statuts que les congés.
- Vue perso : total d'heures approuvées par mois.

### 4. Notifications email
- Demande créée → mail aux admins.
- Demande approuvée / refusée → mail au demandeur (avec le commentaire).
- En dev : Mailpit. En prod : SMTP du fournisseur (à configurer).

## Écrans
- `/planning` — planning de tous (page d'accueil)
- `/mes-demandes` — mes congés + heures sup, soldes, boutons « Nouvelle demande »
- `/admin/validations` — demandes PENDING, accepter/refuser
- `/admin/plannings` — édition des créneaux et des soldes

## Hors V1 (plus tard)
Export Excel/paie, fichier .ics, multi-équipes / managers par équipe, demi-journées dans le planning,
historique d'audit détaillé, application mobile.
