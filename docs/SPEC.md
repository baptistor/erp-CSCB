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
- Affiche : horaires de travail + absences approuvées (+ ses propres absences en attente, cf. §3),
  une couleur par personne avec son nom et prénom.
- **Emplois du temps affichés** : par défaut, uniquement le sien. Au-dessus du planning, un bouton « Tout le monde »
  et une case à cocher par collaborateur (à sa couleur) pour afficher / masquer son emploi du temps.
  Le choix est mémorisé sur le navigateur.
- **Vue Semaine** (par défaut) : grille horaire du lundi au dimanche, comme Google Agenda. Chaque jour est découpé en
  **une colonne par employé affiché** (le sien en premier, puis toujours le même ordre), à la couleur de l'employé.
  Les horaires de travail occupent la colonne de l'employé ; ses absences s'affichent **par-dessus**, dans la même
  colonne (superposition), pour voir d'un coup d'œil sur quelle période il est absent. Une ligne « Toute la journée »
  en haut accueille les absences de journées entières ; une absence à la journée **barre aussi toute la colonne** de
  l'employé ce jour-là (hachures grises neutres, quel que soit l'employé), pour être immédiatement repérable.
- **Vue Mois** : vue en lignes, limitée aux employés affichés.
- Navigation : précédent, suivant, aujourd'hui.
- **Mode Lecture** (par défaut) : consultation seule, aucune interaction de modification.
- **Mode Édition** (bouton au-dessus du planning) : barre d'outils au-dessus de la grille avec deux actions :
  - **Poser une absence** (par défaut) : voir §3 ;
  - **Modifier mes horaires** : clic sur une de ses journées, ou sélection à la souris sur un jour → fenêtre de
    modification des horaires de ce jour (plage ou « non travaillé », ou retour aux horaires habituels ;
    règles ci-dessous).
    Pas de déplacement / étirement direct des blocs.
- **Depuis le planning, chacun n'agit que sur son propre emploi du temps**, admin compris ; seules ses propres
  absences en attente sont cliquables. Les horaires des autres employés se modifient dans `/admin/plannings` (admin).

Le planning d'un jour donné = les horaires de ce jour s'ils ont été modifiés, sinon ceux de la semaine type.

- **Journée type** (par employé et par jour de la semaine, lundi → dimanche) :
  plage horaire début / fin, ou « non travaillé ».
- **Contrat hebdomadaire** : nombre d'heures de travail par semaine, par employé, **35 h par défaut**
  (pas de 0,25 h, entre 0,25 et 168 h).
- **Semaine type par défaut** à la création d'un employé : lundi → vendredi **9h00 – 16h00** (5 × 7 h = 35 h),
  samedi et dimanche non travaillés.
- **La semaine type doit totaliser exactement le contrat hebdomadaire** (ni plus, ni moins), sinon l'enregistrement
  est refusé avec un message clair. Pendant la modification, un indicateur permanent affiche le total :
  - vert : total = contrat, contrat respecté ;
  - rouge : il manque des heures (ex. « il manque 2 h ») ;
  - orange : heures en trop ; message : la semaine type doit rester au contrat, les heures en plus se déclarent
    **sur le planning** (en modifiant les horaires du jour concerné), puis par une **déclaration d'heures
    supplémentaires**
    (« Mes demandes »).
  L'enregistrement n'est possible qu'au vert.
- **Horaires d'un jour** (par employé et pour une date précise) : on peut modifier les horaires d'un jour donné
  (autre plage horaire, ou « non travaillé »), sans contrainte de durée ; c'est ainsi que passent les heures en plus
  ou en moins d'une semaine donnée. **Aucune distinction** n'est faite avec les autres jours : pas de notion de
  « journée spéciale », pas de marque particulière sur le planning ; un jour modifié s'affiche comme n'importe quel
  jour. On peut remettre les horaires habituels de ce jour (ceux de la semaine type).
- Règles : heure de fin > heure de début ; pas de plage à cheval sur minuit ; pas de pause déduite (V1).
- ADMIN : modifie les journées types et le contrat hebdomadaire d'un employé, ainsi que les horaires de n'importe quel
  jour d'un employé.
- EMPLOYEE : consulte ses horaires et ceux des autres ; peut aussi **modifier ses propres journées**,
  sans validation d'un admin, à condition de respecter les règles ci-dessus : sa semaine type (qui doit rester à son
  contrat), et les horaires de ses jours à partir d'aujourd'hui (les jours passés ne sont plus modifiables par
  l'employé).
  Il ne peut pas modifier son contrat hebdomadaire ni les horaires d'un autre employé.

Tout se compte en HEURES (pas de jours, pas de CP/RTT).

Workflow commun à toutes les demandes :
PENDING → APPROVED | REJECTED (par un admin, commentaire optionnel) ; PENDING → CANCELLED (par le demandeur).
Pour les absences uniquement : APPROVED → CANCELLED aussi, par le demandeur (cf. §3).


### 2. Déclarer des heures supplémentaires (alimente le solde)
- Champs : date, nombre d'heures (pas de 0,25), motif.
- Une fois APPROVED, les heures sont ajoutées au solde de l'employé.

### 3. Poser une absence (2 types)
- Se pose **directement sur le planning**, en mode Édition (§1).
- **Absence de quelques heures** : en vue Semaine, l'employé glisse la souris **sur la colonne du jour** (n'importe
  où dans le jour, pas de 15 min), comme dans Google Agenda. L'absence est toujours la sienne et se range dans sa
  colonne. Si la sélection déborde de ses horaires du jour, elle est rognée à ses horaires.
- **Absence d'une ou plusieurs journées entières** : sélection sur la ligne « Toute la journée » (ou en vue Mois).
- **Au relâchement de la souris, une fenêtre s'ouvre** : récapitulatif (date(s), plage, nombre d'heures), type
  (RECUP_HEURES_SUP | SANS_SOLDE), **motif facultatif**, solde disponible ; boutons « Envoyer la demande » / « Annuler ».
  La demande (PENDING) est créée à l'envoi.
- **Nombre d'heures calculé automatiquement** (plus de saisie) :
  plage horaire → sa durée ; journées entières → somme des heures prévues au planning de l'employé ces jours-là
  (horaires du jour, modifiés ou non ; jours non travaillés = 0 h).
- RECUP_HEURES_SUP : consomme le solde d'heures sup.
  À la création, refuser si nombre d'heures > solde disponible
  (solde disponible = solde − heures des demandes de récup PENDING).
- SANS_SOLDE : aucun impact sur le solde.
- Règles :
  - uniquement sur ses propres horaires : une plage horaire doit être comprise dans sa journée prévue ce jour-là,
    et pas sur un jour non travaillé ; une sélection de journées entières doit contenir au moins un jour travaillé ;
  - à partir d'aujourd'hui (pas d'absence dans le passé) ;
  - pas de chevauchement avec une autre absence PENDING/APPROVED de l'employé (au quart d'heure près).
- Affichage sur le planning : absences APPROVED visibles par tous ; ses propres absences PENDING visibles par
  l'intéressé uniquement (hachurées). Une absence refusée ou annulée n'apparaît plus.
- **Suppression par l'employé** : l'employé peut supprimer sa propre absence, **en attente ou acceptée**, directement
  sur le planning (mode Édition, croix sur l'absence). Une confirmation est demandée pour une absence acceptée.
  - Uniquement le demandeur : l'admin ne peut pas supprimer l'absence d'un employé.
  - Uniquement une absence **pas encore commencée** (date de début ≥ aujourd'hui) : on ne réécrit pas le passé.
  - Suppression « douce » : l'absence passe au statut CANCELLED (historique conservé) et disparaît du planning.
  - Une récupération acceptée puis supprimée **rend ses heures au solde**.

### Solde d'heures sup
- Solde = Σ heures sup APPROVED − Σ récup APPROVED + ajustements admin.
- L'admin peut saisir un ajustement (+/− heures, motif), ex. reprise du solde existant au démarrage.
- Vue perso : solde actuel + historique des mouvements (heures sup, récup, ajustements).

### 4. Notifications email
- Demande créée → mail aux admins.
- Demande approuvée / refusée → mail au demandeur (avec le commentaire).
- En dev : Mailpit. En prod : SMTP du fournisseur (à configurer).

## Écrans
- `/planning` — planning (page d'accueil) : choix des emplois du temps affichés, vues Semaine / Mois,
  modes Lecture / Édition, pose des absences ; onglet « Mes horaires types »
- `/mes-demandes` — **heures supplémentaires uniquement** : bouton « Déclarer des heures », liste de mes déclarations,
  solde d'heures sup et historique des mouvements (heures sup, récup, ajustements)
- `/admin/validations` — demandes PENDING, accepter/refuser
- `/admin/plannings` — semaine type, contrat et horaires modifiés à venir de chaque employé, ajustements de solde
  (pas de calendrier éditable dans cet écran)
