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
- Affiche : horaires de travail + absences et heures sup **en attente et acceptées** de tous (cf. §2, §3),
  une couleur par personne avec son nom et prénom.
- **Heures sup en vert fluo**, une seule couleur pour tout le monde (dans la colonne de l'employé en vue Semaine ;
  en vue Mois, voir ci-dessous) : acceptées = plein, en attente = hachurées ; refusées / annulées =
  n'apparaissent plus.
- **Emplois du temps affichés** : dans le **menu de gauche** (écran Planning uniquement), comme Google Agenda : une
  **barre de recherche** (nom ou prénom, sans tenir compte des accents ni des majuscules) et une **liste à cocher** des
  collaborateurs, chacun à sa couleur. Soi-même en premier, toujours affiché. Bouton « Tout le monde » / « Seulement moi »
  (agit sur tous, pas seulement sur les résultats de la recherche). Le choix est mémorisé sur le navigateur.
  La liste peut être repliée (repliée par défaut sur petit écran). Couleurs distinctes jusqu'à 12 personnes.
- **Le centre est fermé le dimanche** : pas de colonne dimanche en vue Semaine, pas de dimanche dans les semaines type,
  aucune heure sup le dimanche (la vue Mois reste inchangée).
- **Vue Semaine** (par défaut) : grille horaire du lundi au samedi, comme Google Agenda. Chaque jour est découpé en
  **une colonne par employé affiché** (le sien en premier, puis toujours le même ordre), à la couleur de l'employé.
  Les horaires de travail occupent la colonne de l'employé ; ses absences s'affichent **par-dessus**, dans la même
  colonne (superposition), pour voir d'un coup d'œil sur quelle période il est absent. Une ligne « Toute la journée »
  en haut accueille les absences de journées entières ; une absence à la journée **barre aussi toute la colonne** de
  l'employé ce jour-là (hachures grises neutres, quel que soit l'employé), pour être immédiatement repérable.
  La hauteur des heures s'adapte à l'écran pour voir la journée presque entière. La colonne des heures reste visible pendant le défilement horizontal.
- **Vue Mois** : vue d'ensemble, **en lecture seule** (on n'y pose, modifie ni annule rien). Une ligne par employé
  affiché qui travaille ce jour-là (journée type ou heures sup), avec **prénom nom et heures de travail** (heures sup
  ajoutées à la suite). La couleur de la ligne résume la journée : **blanc** = jour normal ; **rayé gris** = absence
  dans la journée (en attente ou acceptée) ; **vert fluo** = heures sup (en attente ou acceptées) ; **vert fluo rayé**
  = les deux. Liseré gauche à la couleur de l'employé. « + N autres » au-delà de 6 lignes.
- Navigation : en vue Semaine, **grandes flèches fines de part et d'autre de la grille** (semaine précédente / suivante),
  bouton « Aujourd'hui » à côté du titre de la semaine ; vue Mois : précédent, suivant, aujourd'hui.
- **Pas de mode Lecture / Édition** : on agit directement, **uniquement sur son propre emploi du temps** (admin
  compris). Les horaires types des autres se modifient dans `/admin/plannings` (admin).
- **Poser une demande (vue Semaine)** : un clic dans un jour est interprété selon **ses propres horaires** à l'heure
  cliquée (n'importe où dans le jour ; la plage se range toujours dans sa colonne) :
  - sur une heure de sa **journée type** → une **plage d'absence** (1 h, dans ses horaires) apparaît (§3) ;
  - sur une heure **hors journée type et hors pause** → une **plage d'heures sup** (1 h, vert fluo) apparaît (§2) ;
  - dans la pause de midi (semaines classiques) → rien.
  La plage apparue se **déplace** (glisser le bloc) et se **redimensionne** (poignées haut / bas), au quart d'heure ;
  elle passe au rouge, avec la raison, si elle n'est pas valable. **✓** la valide et ouvre la fenêtre de confirmation,
  **✕** ou Échap l'abandonne. Appuyer puis glisser crée directement la plage sélectionnée.
- Journées entières d'absence : glisser sur la ligne « Toute la journée ».
- **ADMIN : heures sup pour un employé** : un sélecteur « Pour : » (réservé à l'admin, à côté de Semaine / Mois)
  permet de choisir un employé (« Moi » par défaut). Les clics suivent alors **les horaires de cet employé** et la
  plage apparaît dans sa colonne (affichée automatiquement) ; seules des heures sup se posent dans ce mode (rien sur
  sa journée type, pas d'absence pour autrui). Un bandeau rappelle pour qui on agit. Mêmes règles qu'au §2, sur la
  journée type de l'employé ; motif obligatoire. Ces heures sup sont **acceptées directement** (pas de validation,
  ajoutées au solde) et marquées « saisies par l'admin ».
- **ADMIN : retirer des heures sup** : clic sur une heure sup de n'importe quel employé (en attente ou acceptée) →
  « Retirer » (statut CANCELLED ; une heure sup acceptée sort du solde). Refusé si ces heures ont déjà été utilisées
  en récupération (le disponible de l'employé deviendrait négatif).
- Clic sur une de ses heures sup **en attente** → « Annuler la demande ». Croix de suppression d'une de ses absences
  (au survol), cf. §3.
- Tout se fait en vue Semaine ; la vue Mois est en lecture seule.

Le planning d'un jour donné = la journée type (selon le type de semaine) + les heures sup posées ce jour-là.

- **Pause de midi obligatoire : 12h30 – 13h30** en **semaine classique**, pour tous. Aucun horaire, heure sup ou absence
  ne peut y commencer ni y finir, et elle n'est **jamais comptée** comme du temps de travail. Sur le planning : bande
  neutre, non sélectionnable. **Pas de pause en semaine de vacances scolaires.**
- **Journée type** (par employé et par jour, lundi → samedi ; dimanche toujours non travaillé) :
  - semaine classique : une période **matin** (fin ≤ 12h30) et une période **après-midi** (début ≥ 13h30), chacune
    facultative. Ni l'une ni l'autre = « non travaillé » ;
  - semaine de vacances : **une seule plage** (début → fin, sans pause), facultative.
- **Deux semaines type par employé** : semaine **classique** et semaine de **vacances scolaires**. Même contrat, seuls les
  horaires changent ; chacune respecte les mêmes règles (total = contrat, indicateur vert / rouge / orange).
- **Semaines de vacances scolaires** : l'ADMIN les marque à l'avance (semaines entières, lundi → dimanche, communes à tous
  les employés). Seules les semaines à venir (pas encore commencées) peuvent être marquées ou démarquées. Le planning d'un
  jour utilise la semaine type correspondante ; ces semaines portent un repère « Vacances scolaires » (Semaine et Mois).
- **Validation du calendrier des vacances** : l'ADMIN valide le calendrier des vacances scolaires **jusqu'à une date**
  (au plus 1 an à l'avance ; la date validée ne peut qu'avancer). On garde qui a validé et quand.
  - Il doit toujours être validé **au moins 6 mois à l'avance** (date validée ≥ aujourd'hui + 6 mois). Sinon, l'admin
    est averti : bandeau en haut du planning et de l'onglet « Vacances scolaires » (avec lien / bouton pour valider),
    pastille sur « Plannings » dans le menu, et mail (§4).
  - Une semaine déjà validée reste modifiable, mais une confirmation prévient que des absences / heures sup peuvent déjà
    y être posées (avec leur nombre) et que leurs heures ne sont pas recalculées.
  - Les employés ne sont pas concernés (aucune restriction de pose liée à la validation).
- **Contrat hebdomadaire** : nombre d'heures de travail par semaine, par employé, **35 h par défaut**
  (pas de 0,25 h, entre 0,25 et 168 h).
- **Semaines type par défaut** à la création d'un employé : samedi et dimanche non travaillés ;
  - classique : lundi → vendredi **9h00 – 12h30 / 13h30 – 17h00** (5 × 7 h = 35 h) ;
  - vacances scolaires : lundi → vendredi **9h00 – 16h00**, sans pause (5 × 7 h = 35 h).
- **Chaque semaine type doit totaliser exactement le contrat hebdomadaire** (ni plus, ni moins), sinon l'enregistrement
  est refusé avec un message clair. Pendant la modification, un indicateur permanent affiche le total :
  - vert : total = contrat, contrat respecté ;
  - rouge : il manque des heures (ex. « il manque 2 h ») ;
  - orange : heures en trop ; message : la semaine type doit rester au contrat, les heures en plus se posent
    **sur le planning**, au jour concerné, comme **heures supplémentaires** (§2).
  L'enregistrement n'est possible qu'au vert.
- Règles : heure de fin > heure de début ; pas de plage à cheval sur minuit .
- ADMIN : modifie les journées types et le contrat hebdomadaire d'un employé ; marque les semaines de vacances scolaires.
- EMPLOYEE : consulte ses horaires et ceux des autres ; peut aussi **modifier ses propres journées**,
  sans validation d'un admin, à condition de respecter les règles ci-dessus : ses deux semaines type (qui doivent rester à son
  contrat).
  Il ne peut pas modifier son contrat hebdomadaire ni les horaires d'un autre employé.

Tout se compte en HEURES (pas de jours, pas de CP/RTT).

Workflow commun à toutes les demandes :
PENDING → APPROVED | REJECTED (par un admin, commentaire optionnel) ; PENDING → CANCELLED (par le demandeur).
Heures sup saisies par un admin pour un employé : créées directement APPROVED ; un admin peut retirer une heure sup
PENDING ou APPROVED (→ CANCELLED).
Pour les absences uniquement : APPROVED → CANCELLED aussi, par le demandeur (cf. §3).


### 2. Déclarer des heures supplémentaires (alimente le solde)
- **Posées directement sur le planning** (§1) : une plage d'heures sup **est** la demande d'heures sup à l'admin.
- Champs : date, plage horaire (au quart d'heure), **motif obligatoire** (saisi dans la fenêtre de confirmation) ;
  **nombre d'heures calculé** = durée de la plage.
- Règles : fin > début ; jamais le dimanche, ni sur la journée type, ni sur la pause de midi (semaines classiques), ni
  sur une autre heure sup en attente
  ou acceptée de l'employé ; plusieurs plages par jour possibles, avant ou après la journée type, collées ou non ;
  jour non travaillé : n'importe quelle plage. Date de J−31 (déclaration après coup) à J+62 (à l'avance).
- Visibles par tous sur le planning (en vert fluo), sans le motif.
- Annulation par le demandeur tant qu'elle est en attente (clic sur sa plage). Une fois APPROVED, les heures sont
  ajoutées au solde de l'employé ; seul un admin peut encore la retirer (§1).
- L'admin peut aussi poser des heures sup pour un employé, acceptées directement (§1) — jamais pour lui-même (il fait
  alors une demande comme tout le monde).
- Si la semaine type change ensuite, la demande n'est pas modifiée (heures figées à la demande).

### 3. Poser une absence (2 types)
- Se pose **directement sur le planning** (§1), uniquement sur sa **journée type** (pas sur ses heures sup).
- **Absence de quelques heures** : en vue Semaine, clic (ou appui + glisser) sur une heure de sa journée type → plage
  à placer (§1). Une sélection qui déborde de ses horaires est rognée à ses horaires.
- **Absence d'une ou plusieurs journées entières** : sélection sur la ligne « Toute la journée » (vue Semaine).
- **À la validation (✓) ou au relâchement sur la ligne « Toute la journée », une fenêtre s'ouvre** : récapitulatif (date(s), plage, nombre d'heures), type
  (RECUP_HEURES_SUP | SANS_SOLDE), **motif facultatif**, solde disponible ; boutons « Envoyer la demande » / « Annuler ».
  La demande (PENDING) est créée à l'envoi.
- **Nombre d'heures calculé automatiquement** (plus de saisie) :
  plage horaire → les heures réellement travaillées qu'elle couvre (hors pause et coupures) ; journées entières → somme des heures de la journée type de l'employé ces jours-là
  (jours non travaillés = 0 h).
- RECUP_HEURES_SUP : consomme le solde d'heures sup.
  À la création, refuser si nombre d'heures > solde disponible
  (solde disponible = solde − heures des demandes de récup PENDING).
- SANS_SOLDE : aucun impact sur le solde.
- Règles :
  - uniquement sur ses propres horaires : une plage horaire doit commencer et finir pendant sa journée type ce
    jour-là ; elle peut enjamber la pause (11h–15h = 1h30 + 1h30 = 3 h), pas un jour non travaillé ; une sélection de journées entières doit contenir au moins un jour travaillé ;
  - à partir d'aujourd'hui (pas d'absence dans le passé) ;
  - pas de chevauchement avec une autre absence PENDING/APPROVED de l'employé (au quart d'heure près).
- Affichage sur le planning : absences PENDING (hachurées) et APPROVED **visibles par tous**, sans le type ni le motif.
  Les heures d'une absence sont figées à la demande. Une absence refusée ou annulée n'apparaît plus.
- **Suppression par l'employé** : l'employé peut supprimer sa propre absence, **en attente ou acceptée**, directement
  sur le planning (croix sur l'absence, au survol). Une confirmation est demandée pour une absence acceptée.
  - Uniquement le demandeur : l'admin ne peut pas supprimer l'absence d'un employé.
  - Uniquement une absence **pas encore commencée** (date de début ≥ aujourd'hui) : on ne réécrit pas le passé.
  - Suppression « douce » : l'absence passe au statut CANCELLED (historique conservé) et disparaît du planning.
  - Une récupération acceptée puis supprimée **rend ses heures au solde**.

### Solde d'heures sup
- Solde = Σ heures sup APPROVED − Σ récup APPROVED + ajustements admin.
- L'admin peut saisir un ajustement (+/− heures, motif), ex. reprise du solde existant au démarrage.
- Solde et historique des mouvements (heures sup, récup, ajustements) consultables **uniquement par l'admin**
  (`/admin/plannings`, onglet Soldes). L'employé voit son disponible pour une récup dans la fenêtre de demande d'absence.

### 4. Notifications email (à implémenter : module mail pas encore développé)
- Demande créée → mail aux admins.
- Demande approuvée / refusée → mail au demandeur (avec le commentaire).
- Calendrier des vacances scolaires validé moins de 6 mois à l'avance → mail de rappel aux admins (au plus une fois
  par semaine tant que ce n'est pas réglé).
- En dev : Mailpit. En prod : SMTP du fournisseur (à configurer).

## Écrans
- `/planning` — planning (page d'accueil) : choix des emplois du temps affichés (menu de gauche), vues Semaine / Mois,
  pose des absences et des heures sup ; onglet « Mes horaires types » (classique / vacances scolaires)
- `/admin/validations` — demandes PENDING (avec la plage horaire des heures sup), accepter/refuser
- `/admin/plannings` — semaines type (classique / vacances), semaines de vacances scolaires (calendrier annuel, clic
  ou Maj + clic pour une période, validation du calendrier), contrat de chaque employé, ajustements de solde
  et historique des soldes (pas de calendrier éditable dans cet écran)
