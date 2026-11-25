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
- Affiche : horaires de travail + absences **en attente et acceptées** de tous (cf. §3),
  une couleur par personne avec son nom et prénom.
- **Emplois du temps affichés** : dans le **menu de gauche** (écran Planning uniquement), comme Google Agenda : une
  **barre de recherche** (nom ou prénom, sans tenir compte des accents ni des majuscules) et une **liste à cocher** des
  collaborateurs, chacun à sa couleur. Soi-même en premier, toujours affiché. Bouton « Tout le monde » / « Seulement moi »
  (agit sur tous, pas seulement sur les résultats de la recherche). Le choix est mémorisé sur le navigateur.
  La liste peut être repliée (repliée par défaut sur petit écran). Couleurs distinctes jusqu'à 12 personnes.
- **Vue Semaine** (par défaut) : grille horaire du lundi au dimanche, comme Google Agenda. Chaque jour est découpé en
  **une colonne par employé affiché** (le sien en premier, puis toujours le même ordre), à la couleur de l'employé.
  Les horaires de travail occupent la colonne de l'employé ; ses absences s'affichent **par-dessus**, dans la même
  colonne (superposition), pour voir d'un coup d'œil sur quelle période il est absent. Une ligne « Toute la journée »
  en haut accueille les absences de journées entières ; une absence à la journée **barre aussi toute la colonne** de
  l'employé ce jour-là (hachures grises neutres, quel que soit l'employé), pour être immédiatement repérable.
  La hauteur des heures s'adapte à l'écran pour voir la journée presque entière. La colonne des heures reste visible pendant le défilement horizontal.
- **Vue Mois** : une ligne par employé affiché et par jour, puis « + N autres » au-delà de 6 lignes.
- Navigation : précédent, suivant, aujourd'hui.
- **Modes** : boutons « Lecture » et « Modifier » (icône + texte), à côté de Semaine / Mois. En mode Édition, le fond
  du planning change de couleur ; les actions, l'aide et le solde disponible n'apparaissent que dans ce mode.
- **Mode Lecture** (par défaut) : consultation seule, aucune interaction de modification.
- **Mode Édition** : barre d'outils au-dessus de la grille avec deux actions :
  - **Poser une absence** (par défaut) : voir §3 ;
  - **Ajouter des heures** : sélection à la souris sur un jour, en dehors de sa journée type → fenêtre de
    confirmation ; clic sur des heures ajoutées → les modifier ou les retirer (règles ci-dessous).
- **Depuis le planning, chacun n'agit que sur son propre emploi du temps**, admin compris ; seules ses propres
  absences en attente sont cliquables. Les horaires des autres employés se modifient dans `/admin/plannings` (admin).

Le planning d'un jour donné = la journée type + les heures ajoutées ce jour-là.

- **Pause de midi obligatoire : 12h30 – 13h30**, tous les jours et pour tous. Aucun horaire, ajout d'heures ou absence ne
  peut y commencer ni y finir, et elle n'est **jamais comptée** comme du temps de travail. Sur le planning : bande neutre,
  non sélectionnable.
- **Journée type** (par employé et par jour de la semaine, lundi → dimanche) : une période **matin** (fin ≤ 12h30) et une
  période **après-midi** (début ≥ 13h30), chacune facultative. Ni l'une ni l'autre = « non travaillé ».
- **Deux semaines type par employé** : semaine **classique** et semaine de **vacances scolaires**. Même contrat, seuls les
  horaires changent ; chacune respecte les mêmes règles (total = contrat, indicateur vert / rouge / orange).
  Tant que la semaine de vacances n'a pas été enregistrée, elle reprend la semaine classique et un rappel « À compléter »
  s'affiche dans les horaires types.
- **Semaines de vacances scolaires** : l'ADMIN les marque à l'avance (semaines entières, lundi → dimanche, communes à tous
  les employés). Seules les semaines à venir (pas encore commencées) peuvent être marquées ou démarquées. Le planning d'un
  jour utilise la semaine type correspondante ; ces semaines portent un repère « Vacances scolaires » (Semaine et Mois).
- **Contrat hebdomadaire** : nombre d'heures de travail par semaine, par employé, **35 h par défaut**
  (pas de 0,25 h, entre 0,25 et 168 h).
- **Semaine type par défaut** à la création d'un employé : lundi → vendredi **9h00 – 12h30 / 13h30 – 17h00** (5 × 7 h = 35 h),
  samedi et dimanche non travaillés.
- **Chaque semaine type doit totaliser exactement le contrat hebdomadaire** (ni plus, ni moins), sinon l'enregistrement
  est refusé avec un message clair. Pendant la modification, un indicateur permanent affiche le total :
  - vert : total = contrat, contrat respecté ;
  - rouge : il manque des heures (ex. « il manque 2 h ») ;
  - orange : heures en trop ; message : la semaine type doit rester au contrat, les heures en plus se déclarent
    **sur le planning** (heures ajoutées au jour concerné), puis par une **déclaration d'heures supplémentaires**
    (« Mes demandes »).
  L'enregistrement n'est possible qu'au vert.
- **Heures ajoutées à un jour** (par employé et pour une date précise) : on peut uniquement **ajouter** des heures, en
  une ou plusieurs plages, avant ou après la journée type, collées ou avec une coupure (ex. 18h–20h).
  - Une plage ajoutée **n'empiète jamais sur la journée type**, ni sur la pause de midi, ni sur une autre plage ajoutée.
  - Jour non travaillé dans la semaine type : n'importe quelle plage.
  - On ne peut ni raccourcir, ni décaler, ni annuler la journée type : pour travailler moins, on pose une absence.
  - Pas de marque particulière sur le planning. Elles n'alimentent pas le solde : elles se déclarent (§2).
  - Si la semaine type change ensuite (ou si la semaine est marquée « vacances »), seule la partie qui n'empiète pas dessus est prise en compte.
- Règles : heure de fin > heure de début ; pas de plage à cheval sur minuit .
- ADMIN : modifie les journées types et le contrat hebdomadaire d'un employé, et ajoute / modifie / retire des
  heures à n'importe quel jour d'un employé (mêmes règles) ; marque les semaines de vacances scolaires.
- EMPLOYEE : consulte ses horaires et ceux des autres ; peut aussi **modifier ses propres journées**,
  sans validation d'un admin, à condition de respecter les règles ci-dessus : ses deux semaines type (qui doivent rester à son
  contrat), et les heures ajoutées à ses jours à partir d'aujourd'hui (les jours passés ne sont plus modifiables par
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
  plage horaire → les heures réellement travaillées qu'elle couvre (hors pause et coupures) ; journées entières → somme des heures prévues au planning de l'employé ces jours-là
  (journée type + heures ajoutées ; jours non travaillés = 0 h).
- RECUP_HEURES_SUP : consomme le solde d'heures sup.
  À la création, refuser si nombre d'heures > solde disponible
  (solde disponible = solde − heures des demandes de récup PENDING).
- SANS_SOLDE : aucun impact sur le solde.
- Règles :
  - uniquement sur ses propres horaires : une plage horaire doit commencer et finir pendant ses heures prévues ce
    jour-là ; elle peut enjamber la pause ou une coupure (11h–15h = 1h30 + 1h30 = 3 h), pas un jour non travaillé ; une sélection de journées entières doit contenir au moins un jour travaillé ;
  - à partir d'aujourd'hui (pas d'absence dans le passé) ;
  - pas de chevauchement avec une autre absence PENDING/APPROVED de l'employé (au quart d'heure près).
- Affichage sur le planning : absences PENDING (hachurées) et APPROVED **visibles par tous**, sans le type ni le motif.
  Les heures d'une absence sont figées à la demande. Une absence refusée ou annulée n'apparaît plus.
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
- `/planning` — planning (page d'accueil) : choix des emplois du temps affichés (menu de gauche), vues Semaine / Mois,
  modes Lecture / Édition, pose des absences ; onglet « Mes horaires types » (classique / vacances scolaires)
- `/mes-demandes` — **heures supplémentaires uniquement** : bouton « Déclarer des heures », liste de mes déclarations,
  solde d'heures sup et historique des mouvements (heures sup, récup, ajustements)
- `/admin/validations` — demandes PENDING, accepter/refuser
- `/admin/plannings` — semaines type (classique / vacances), semaines de vacances scolaires, contrat et heures ajoutées à venir de chaque employé, ajustements de solde
  (pas de calendrier éditable dans cet écran)
