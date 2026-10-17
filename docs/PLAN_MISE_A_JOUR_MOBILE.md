# Plan de mise à jour du mobile (Cecaw Terrain) pour s'aligner sur le backoffice

Document de planification : aucun code n'a été modifié. Base : inspection du dossier `mobile/` (≈ 6 700 lignes, Expo 57 / React Native 0.86), du backend et du backoffice.
Les points marqués **(vérifié)** ont été relus dans le code ; les autres viennent des rapports d'exploration et sont à confirmer à l'implémentation.

## 1. Ce qui a été constaté

### Votre problème : « la date de naissance ne peut pas être remplie » (vérifié)
`DateField` ([mobile/src/components/FormFields.tsx](../mobile/src/components/FormFields.tsx)) affiche trois cases (JJ / MM / AAAA) calculées à partir de la valeur finale `AAAA-MM-JJ`, mais ne transmet une valeur que si les trois cases sont **complètes**. Taper « 1 » dans JJ ne change donc rien à l'état, et la case, pilotée par cet état, se vide aussitôt : **la saisie est impossible**. Le composant accepte en plus des dates impossibles (31/02). Tous les champs date de l'application sont concernés.

### Champs : ce qui se saisit et ce qui ne se saisit pas
| Écran mobile | Constat |
|---|---|
| Prospect (création et modification) | Tous les champs physique/morale sont saisissables **sauf la date** (bug ci-dessus). Mais plusieurs champs sont en texte libre là où le backoffice impose une liste fermée (ville, secteur, forme juridique, tranches de revenu) : les données saisies au mobile ne se regroupent pas comme celles du web. La campagne d'origine est absente. |
| Client | **Aucun champ saisissable** : la fiche est en lecture seule et n'affiche que 6 champs sur ~35. Pas de création, pas de modification, pas de conversion prospect → client. |
| Compte | Pas de création de compte ; l'écran ne montre même pas le solde. |
| Visite | Compte rendu, signature, photo, résultat saisissables ; verrouillés après clôture. |
| Profil / paramètres | Tout en lecture seule (aucun changement de mot de passe ou de code PIN). |
| Absents du mobile | Interactions, situation financière du client (revenus, charges, ancienneté, GPS de l'activité), photo du client et photos d'activité, dossier KYC, crédit, recouvrement, notifications, agenda, sanctions, campagnes. |

### Bugs de fond relevés (à corriger avant d'ajouter des écrans)
1. **(vérifié)** `compte/[id].tsx` : **toute** erreur est traitée comme « hors ligne » et mise en file, y compris les refus du serveur (solde insuffisant, compte inactif). La file ne dépasse jamais un refus : une seule opération refusée bloque toutes les suivantes, sans aucun moyen de la voir ni de la retirer.
2. Les positions rejouées après coupure n'ont **aucun horodatage** (le backend date tout à l'arrivée) : trajets et distance parcourue faussés.
3. Après 5 codes PIN faux, une déconnexion ou un refus de renouvellement de session, `purge()` **efface les opérations non transmises** (collectes comprises) sans prévenir.
4. Les opérations « terrain » sont **abandonnées** sur n'importe quelle réponse HTTP, y compris une erreur 5xx temporaire.
5. Aucun déclenchement automatique de synchronisation (pas de détection du réseau) ; le compteur des paramètres ignore la file terrain.
6. La « journée » est calculée en UTC (faux entre 00h et 01h au Cameroun).
7. **(vérifié)** Les erreurs de validation du serveur (422 avec champs) ne sont pas affichées champ par champ.
8. Le modèle local n'est pas chiffré (file de collectes et tournée en clair) ; l'adresse de repli en production est l'émulateur Android en HTTP.
9. Aucune notion de droits : l'application ne lit jamais `/rbac/me`, tous les boutons s'affichent.

### Anomalies côté backend à corriger en même temps
- **(vérifié)** `PUT /prospects/:id` **ignore** `employeur`, `secteur_activite`, `revenu_mensuel`, `referent_*` : ils ne s'enregistrent qu'à la création. Le web a le même défaut.
- `GET/PUT/DELETE` d'un prospect, d'un client ou de leurs pièces par identifiant **ne vérifient pas que la fiche appartient à l'agent** : un agent peut lire ou modifier la fiche d'un autre en devinant l'identifiant. **Point de sécurité à traiter en priorité.**
- `PATCH /agents/:id/position` : aucune vérification que l'agent est bien celui de la session, pas d'horodatage ni de lot. Les positions de tous les agents sont lisibles par tout utilisateur connecté.
- À la création, `canal_prefere` d'un client est ignoré ; les objectifs rattachés à une équipe, une agence ou l'institution sont invisibles pour l'agent ; l'agent n'a pas accès aux listes marché/secteur/métier (droit `organisation:VIEW` absent).
- `expires_in` renvoie 900 s même pour le mobile (durée réelle 12 h). Prospects, clients et interactions n'ont pas de clé d'idempotence (`client_uid`) : tout rejeu crée un doublon.
- Le mobile dit envoyer le code PIN « chiffré » au serveur ; le serveur le stocke en **hachage** (donc non récupérable). Incohérence à trancher.

## 2. Principe directeur : « tout champ du backoffice est saisissable sur le mobile »
Règles de conception proposées :
1. **Un seul référentiel de champs** : listes fermées (ville, secteur, forme juridique, tranches de revenu, situation familiale, genre…), libellés et règles (obligatoire, longueur, conditionnel physique/morale) repris à l'identique du backoffice dans un module partagé `src/lib/referentiels.ts`.
2. **Chaque champ affiché est saisissable** dès que le droit l'autorise ; sinon il est clairement marqué en lecture seule avec la raison (champ calculé, droit manquant, verrouillé après clôture).
3. **Vider un champ le vide réellement** (envoi de `null`, et non d'un champ omis), et changer le type de personne efface les champs de l'autre type.
4. Toute erreur serveur de validation s'affiche **sur le champ concerné**.

## 3. Phases

### Phase 0 : correctifs bloquants (à faire d'abord)
| # | Tâche | Taille |
|---|---|---|
| 0.1 | Refaire `DateField` : état local par case, valeur émise seulement si la date est valide, saisie partielle conservée, contrôle jour/mois/année et date future ou antérieure à 1900, accessibilité (étiquette par case). Option : sélecteur natif en complément | S |
| 0.2 | Distinguer **refus du serveur** et **absence de réseau** (comme déjà fait pour les tournées) : seules les coupures réseau et 5xx/408/429 sont mises en file ; un refus 4xx est affiché à l'agent | S |
| 0.3 | File transactions : plus de blocage en tête de file (isoler l'élément refusé, l'afficher dans un écran « À corriger / à abandonner »), reprise automatique, signalement des éléments en attente | M |
| 0.4 | Positions : envoyer l'horodatage de relevé (`releve_at`) et un lot ; **backend** : accepter `releve_at` borné, un endpoint en lot, et vérifier que l'agent est celui de la session | M |
| 0.5 | Ne jamais purger silencieusement : avertir avant la purge (PIN/déconnexion), conserver les opérations non transmises dans un espace chiffré ou exiger leur envoi | M |
| 0.6 | Synchronisation automatique (détection du réseau + retour au premier plan), compteur unique des trois files | M |
| 0.7 | Jour local (Africa/Douala) au lieu d'UTC ; adresse de production obligatoire (échec explicite plutôt que repli émulateur) | S |
| 0.8 | Affichage des erreurs de validation champ par champ (422) ; support des messages en liste | S |
| 0.9 | **Backend sécurité** : contrôle d'appartenance sur toutes les routes prospect/client/pièces par identifiant | M |

### Phase 1 : parité des champs (prospects et clients)
| # | Tâche | Taille |
|---|---|---|
| 1.1 | `referentiels.ts` aligné sur le web ; `ProspectForm` : listes fermées (ville, secteur, forme juridique, tranches de revenu et de chiffre d'affaires), champ « Campagne d'origine » (campagnes en cours ou terminées), effacement réel des champs, nettoyage au changement de type | M |
| 1.2 | **Backend** : `PUT /prospects` doit enregistrer employeur, secteur, revenu, référent ; à corriger aussi dans le web | S |
| 1.3 | **Fiche client complète** : afficher les ~35 champs (identité, adresse, activité, référent, notes, statut libellé) | M |
| 1.4 | **Modification du client** (même formulaire que le prospect + statut) ; création directe de client (agence prise du profil) ; conversion prospect → client (le statut « converti » le fait déjà côté serveur) ; compteur de comptes à jour | M |
| 1.5 | Profil territorial du client : marché, secteur, métier, canal préféré. **Backend** : lecture des référentiels ouverte à l'agent | M |
| 1.6 | Localisation : GPS modifiable (prospect et client), position de l'activité | S |
| 1.7 | Pièces jointes prospect/client (route `/…/pieces-jointes`, le web ne l'utilise pas non plus : bug existant à corriger côté web) | M |
| 1.8 | Compte : création de compte, affichage du solde, rafraîchissement après opération, objectif d'épargne | M |

### Phase 2 : capture terrain attendue par le backoffice
| # | Tâche | Taille |
|---|---|---|
| 2.1 | **Interactions** (appel, rendez-vous, visite…, résumé, engagement, prochaine action) + liste « mes prochaines actions » | M |
| 2.2 | **Situation financière** : sources de revenus, charges, ancienneté, GPS de l'activité ; photo du client ; photos d'activité géolocalisées | L |
| 2.3 | **Dossier KYC** : création, pièces d'identité (type, numéro, dates), documents, soumission | L |
| 2.4 | Objectifs personnels du client ; sanctions (statut seulement, message neutre) sur chaque fiche | S |
| 2.5 | Objectifs de l'agent : catégorie, unité, campagne ; **backend** : rendre visibles les objectifs d'équipe/agence | S |
| 2.6 | Clôture de la journée de collecte (le backend le prévoit, le mobile non), reçu numéroté | M |

### Phase 3 : droits, session et notifications
| # | Tâche | Taille |
|---|---|---|
| 3.1 | Charger `/rbac/me` ; masquer ou verrouiller écrans et boutons selon les droits ; revalider la session au démarrage | M |
| 3.2 | Identifiant d'agent : **backend** `/agents/me` (aujourd'hui trouvé par `GET /utilisateurs/:id`) ; durée de session mobile correcte | S |
| 3.3 | Mot de passe et code PIN modifiables dans les paramètres ; trancher l'incohérence « PIN chiffré / haché » | M |
| 3.4 | Centre de notifications (liste, non lues, marquer lu) ; **notifications poussées** : nécessitent un enregistrement de jeton côté backend (inexistant) | M à L |
| 3.5 | Calendrier personnel (`/agenda` : tournées, objectifs, relances, échéances) | M |

### Phase 4 : crédit, recouvrement et hors-ligne complet
| # | Tâche | Taille |
|---|---|---|
| 4.1 | **Crédit** : simulation, demande, garanties, garants, visite terrain avec photos (droits déjà accordés à l'agent) | L |
| 4.2 | **Recouvrement** : dossiers, relances (visite avec GPS), promesses, localisation. Le rôle de base `agent` n'y a pas droit (rôle R11) : décision à prendre | L |
| 4.3 | **Création hors ligne** de prospects, clients, interactions : cache local des listes, `client_uid` côté backend (idempotence), file de rejeu avec conflit lisible | L |
| 4.4 | Chiffrement des files et du cache, tests automatisés (champs, file, dates), accessibilité (étiquettes, rôles) | M |

## 4. Décisions à prendre avant de commencer
1. **Recouvrement sur mobile** : oui (donner le rôle R11 aux agents concernés) ou non ?
2. **Création de client** : directe par l'agent, ou uniquement par conversion d'un prospect ?
3. **Notifications poussées** : à faire (infrastructure Expo/FCM à prévoir) ou seulement un centre de notifications dans l'application ?
4. **Hors ligne** : jusqu'où ? Création de prospects/clients/interactions hors ligne seulement, ou toute la fiche client en lecture ?
5. **Code PIN sur le serveur** : on garde une copie de récupération (hachage non récupérable, donc à renommer) ou on la supprime ?

## 5. Vérification
- Mobile : `npm run typecheck`, `npx expo-doctor`, export Android ; tests automatisés ajoutés (champ date, file hors ligne, référentiels). **Tests sur appareil réel indispensables** (clavier, GPS, caméra, tâche de fond) : rien de ce plan ne peut être validé autrement que par compilation depuis ce poste.
- Backend : extension des tests d'intégration (appartenance des fiches, `PUT` prospect complet, position horodatée, idempotence).
- Parité des champs : une checklist générée à partir des formulaires du web, relue champ par champ sur le mobile (saisie, enregistrement, relecture, effacement).
- Recette terrain avec 2 agents : 1 journée complète en couverture normale, 1 en zone sans réseau.

## 6. Ordre recommandé
Phase 0 → 1 → 2 → 3 → 4, avec livraison intermédiaire après la phase 1 (c'est elle qui répond à « tous les champs du backoffice dans le mobile »). Les tâches 0.1, 0.2 et 0.9 (date, refus du serveur, appartenance des fiches) sont indépendantes et peuvent partir immédiatement.
Le volet **tournées, positions et carte** (section 7) est un chantier à part entière : sa première étape (positions fiables côté serveur, tâche 0.4 étendue) conditionne tout le reste et se fait en même temps que la phase 0.

## 7. Tournées, positions fiables et carte

### 7.1 État actuel
- **(vérifié)** Une position enregistrée = latitude, longitude et heure de réception par le serveur. Rien d'autre : ni précision, ni vitesse, ni cap, ni origine (GPS ou réseau), ni lien avec la tournée ou la visite.
- **(vérifié)** Le mobile suit en précision « haute », mais la position ponctuelle (envoi manuel, réponse au backoffice) est en précision « équilibrée ». Aucune précision n'est transmise, aucun filtre n'écarte un point douteux, aucune position simulée n'est détectée. La **preuve de présence** (cible à moins de 150 m) repose donc sur une coordonnée dont on ignore la fiabilité.
- Les positions rejouées après coupure sont datées de leur arrivée (tâche 0.4).
- Backoffice : la fiche d'une tournée affiche une carte (circuit prévu en pointillé, trajet GPS réalisé en trait plein) et des indicateurs de comparaison. **Il n'y a aucun tableau d'historique des positions.**
- Mobile : **aucune carte** ; la tournée est une simple liste de visites, sans lien vers le client, sans téléphone ni itinéraire.
- Les distances sont calculées à vol d'oiseau avec un coefficient (`terrain.facteur_detour`) et une vitesse fixe de 25 km/h : ni routes, ni durées réalistes.

### 7.2 Choix retenus
| Sujet | Décision |
|---|---|
| Carte | **MapLibre** sur fond **OpenFreeMap** (gratuit, sans clé ni compte) : composants **mapcn** sur le web, **MapLibre natif** (`@maplibre/maplibre-react-native`) sur le mobile, même style de carte. mapcn ne fonctionne pas dans React Native, d'où le moteur commun. Le mobile exige un build de développement (déjà prévu pour le suivi GPS). **Contrainte : aucune solution payante** ; si le fond ne charge pas ou si WebGL manque, repli sur l'ancienne carte (Leaflet / OpenStreetMap), ce qui est déjà en place sur le web |
| Marqueurs et fenêtres | Marqueurs en **SVG** par type (épingles numérotées pour les visites, agent, agence, client…) et fenêtres riches : bandeau coloré, badges d'état, lignes d'information illustrées, **boutons vers les pages de référence** (fiche client/prospect/agent, tournée, itinéraire). Livré sur le web ; sur le mobile, même contenu en feuille coulissante (bottom sheet) ouvrant les écrans correspondants |
| Itinéraires | Service routier **sans frais** : OSRM ou Valhalla **auto-hébergé** (logiciels libres, données OpenStreetMap, un petit serveur suffit pour le Cameroun), ou palier gratuit d'OpenRouteService s'il couvre le volume. Repli permanent sur le calcul actuel (vol d'oiseau) si le service est indisponible |
| Planification | L'agent choisit ses visites, optimise et réordonne depuis le mobile ; le superviseur garde génération, annulation et arbitrage sur le web |

Points à connaître : mapcn utilise par défaut les fonds CARTO, dont l'usage commercial est payant ; il a donc été **remplacé par OpenFreeMap** (vérifié : s'affiche sur les pages tournée, cartographie et agents). OpenFreeMap n'a pas de garantie de service : la clause de repli est indispensable. Le serveur public d'OSRM n'est pas destiné à la production. Les paquets de cartes **hors ligne** sur mobile sont à vérifier contre les conditions d'OpenFreeMap avant d'être promis.

### 7.3 Positions fiables (backend)
1. **Modèle** : ajouter à chaque position la précision (m), la vitesse, le cap, l'altitude, l'origine du fix, l'indicateur « position simulée », la source (suivi, arrivée, visite, manuel) et l'heure de réception en plus de l'heure de relevé fournie par l'appareil.
2. **Réception en lot** : `POST /agents/:id/positions` (liste de points horodatés, identifiant d'idempotence), refus si l'agent n'est pas celui de la session. L'heure de relevé est acceptée seulement si elle est plausible (pas dans le futur, pas plus ancienne que la fenêtre de rejeu) ; l'écart entre l'horloge du téléphone et celle du serveur est mesuré et consigné.
3. **Règles de qualité côté serveur** : point conservé mais marqué *douteux* si précision insuffisante, saut impossible (vitesse > 150 km/h entre deux points), doublon, ou position simulée. Les points douteux restent visibles dans l'historique mais n'entrent ni dans le trajet ni dans les kilomètres.
4. **Preuve de présence** : l'arrivée transmet la précision ; la présence n'est « validée » que si la précision est suffisante (par exemple ≤ 50 m) et que la distance à la cible tient dans le rayon ; sinon statut « à confirmer » et nouvelle tentative demandée à l'agent. La position simulée invalide la preuve.
5. **Visibilité** : restreindre la lecture des positions et trajets au droit `tracking:VIEW` (aujourd'hui ouverts à tout utilisateur connecté), avec durée de conservation et archivage au-delà de N mois.

### 7.4 Capture fiable (mobile)
- **Acquisition** : pendant une tournée active, précision maximale (navigation) ; sinon précision haute. Pour les actes importants (arrivée, photo de preuve, clôture), attendre un fix précis (≤ 30 m, jusqu'à 30 s) avant d'envoyer ; sinon prévenir l'agent et proposer de réessayer à découvert.
- **Filtrage à la source** : écarter les points de mauvaise précision ou aberrants, ne jamais envoyer de position simulée sans la signaler, lisser le tracé affiché.
- **Indicateur de qualité GPS** visible en permanence (barre de signal : bon / moyen / faible) avec la précision en mètres, et cercle de précision autour de la position sur la carte.
- **Intervalles adaptatifs** : fréquent en déplacement, espacé à l'arrêt, pour ménager la batterie.
- **Tenue en arrière-plan** : de nombreux téléphones (économiseurs de batterie des constructeurs) arrêtent le suivi ; ajouter un contrôle de santé, un guide d'autorisation au premier lancement et une alerte à l'agent et au superviseur en cas de silence (la détection de silence existe déjà côté web).
- Chaque point porte sa précision, sa vitesse, son cap, son heure de relevé et la tournée en cours ; lot envoyé à la reconnexion (tâche 0.4).

### 7.5 Historique des positions intégré à la gestion des tournées
**Web (fiche tournée et fiche agent)** : un composant « Historique des positions » synchronisé avec la carte :
- tableau paginé : heure, latitude/longitude, précision, vitesse, origine, qualité (bon / douteux / simulé), distance depuis le point précédent, visite associée ; filtres par qualité et plage horaire ; export CSV ;
- frise chronologique mêlant positions et événements (départ, arrivées, arrêts, clôtures, conflits) ; un clic sur une ligne centre la carte, un curseur rejoue le déplacement ;
- indicateurs de fiabilité : nombre de points, part de points précis, trous de couverture, vitesse maximale, points suspects.
**API** : `GET /tournees/:id/positions` (pagination, ou format GeoJSON simplifié pour la carte) et `GET /tournees/:id/chronologie`. Les arrêts réutilisent la détection existante (`/tournees/suivi/arrets`).
**Mobile** : même contenu dans la vue « Historique » de la tournée (version allégée de la frise et du tableau de la journée), consultable aussi hors ligne.

### 7.6 La tournée sur mobile : trois vues
L'écran **Tournée** devient le centre de gestion : **Liste | Carte | Historique** (pas de menu séparé), avec un bandeau de synthèse (visites faites / prévues, km parcourus / prévus, temps écoulé, prochaine visite).

**Carte (à la Google Maps)**
- fond clair ou satellite ; position de l'agent avec cercle de précision et cap ;
- points numérotés selon l'ordre de visite, colorés par statut (prévue, sur place, réalisée, manquée), icône par type de cible (client, prospect, dossier, point de collecte) ;
- itinéraire routier prévu (pointillé) et trajet réel (trait plein, dégradé selon la vitesse) ; arrêts détectés ;
- cercle de présence autour de la cible (rayon 150 m) : « Vous êtes à 80 m, présence validée » en direct ;
- feuille inférieure glissante avec la liste des visites, distance et durée estimée depuis la position courante ; appui sur une visite = zoom + fiche rapide (appeler, itinéraire, ouvrir la visite, collecter) ;
- bouton « Itinéraire » vers l'application de navigation du téléphone (Google Maps ou Waze) pour le guidage vocal : le guidage pas à pas intégré est hors périmètre ;
- recentrage, filtres, légende, regroupement des points quand ils sont nombreux, cartes téléchargeables hors ligne pour la zone de l'agent.

**Design très illustratif** (reprend l'identité du mobile : or `#B8860B`, fond sombre `#2d1e03`, icônes Feather) : marqueurs animés, anneau de progression de la journée, cartes d'indicateurs, états vides illustrés, couleurs de statut universelles (vert / ambre / rouge), mode clair et sombre de la carte, grandes cibles tactiles et étiquettes d'accessibilité.

**Fiche visite enrichie** : lien vers le client ou prospect (aujourd'hui absent), téléphone cliquable, heure prévue, distance et durée depuis la visite précédente, raccourci « Collecter » vers le compte, bilan prévu / réalisé affiché en fin de tournée (déjà calculé par le serveur).

### 7.7 Itinéraires routiers (backend)
- Service d'itinéraires interrogé à la génération et à l'optimisation : ordre des visites, tracé (polyligne), distance et durée de chaque étape, mémorisés sur la tournée pour que le web et le mobile affichent exactement le même circuit ; repli sur le calcul actuel si le service est indisponible.
- Nouvelles données : tracé de la tournée, durée par étape, heure prévue de chaque visite.

### 7.8 Planification par l'agent (mobile)
- Créer sa tournée : choisir sa date, ses visites (prospects, clients, points de collecte) depuis la liste ou la carte, « Optimiser » l'ordre, **réordonner à la main**, ajouter ou retirer une visite, annuler avec motif.
- **Backend** : nouvelle route de réordonnancement et d'édition des visites avant démarrage ; règles déjà en place conservées (pas de date passée, une tournée par agent, type et jour, droits `tournees:CREATE`).
- Le superviseur voit et corrige depuis le web ; les conflits de rejeu continuent d'être arbitrés par lui.

### 7.9 Phases de ce chantier
| # | Étape | Taille |
|---|---|---|
| T1 | Positions fiables côté serveur : modèle enrichi, lot, règles de qualité, preuve de présence, restriction d'accès | M |
| T2 | Capture fiable sur mobile : acquisition, filtrage, indicateur GPS, détection de position simulée, santé du suivi | M |
| T3 | Web : cartes en **mapcn** sur OpenFreeMap (**fait** : tournée, cartographie, territoire, agents en direct, avec repli Leaflet) ; reste : tableau et frise de l'historique, indicateurs de fiabilité, export | M |
| T4 | Service d'itinéraires routier (choix et hébergement du service, stockage des tracés) | M à L |
| T5 | Mobile : écran Tournée en trois vues (Liste, Carte, Historique), fiche visite enrichie | L |
| T6 | Planification et réordonnancement par l'agent | L |
| T7 | Cartes hors ligne, finitions de design, accessibilité, recette terrain | M |

### 7.10 Vérification propre à ce chantier
- Tests d'intégration backend : lot de positions, rejets et marquage des points douteux, horodatage, preuve de présence selon la précision, droits de lecture.
- Tests unitaires du filtrage mobile (précision, sauts, simulation).
- **Protocole de recette terrain** : parcourir une boucle connue avec un appareil de référence, comparer le tracé enregistré, mesurer la part de points précis, les trous de couverture et l'erreur de présence ; refaire en ville dense, en zone rurale et avec un téléphone d'entrée de gamme. Aucune de ces mesures n'est faisable depuis ce poste : le GPS réel est indispensable.
- Cartes : vérifier la licence du fond choisi, l'affichage hors ligne, et que web et mobile montrent le même circuit.

### 7.11 Décisions à confirmer
1. **Service d'itinéraires** gratuit : auto-héberger OSRM/Valhalla (un serveur à maintenir, responsable à désigner) ou accepter le repli au vol d'oiseau tant que ce n'est pas fait. Fond de carte : OpenFreeMap retenu.
2. **Seuils de fiabilité** : précision minimale pour valider une présence (proposé : 50 m), vitesse maximale plausible (proposé : 150 km/h), durée de conservation des positions.
3. **Position simulée** : refuser la preuve de présence (proposé) ou seulement alerter le superviseur.
4. ~~Remplacer Leaflet par mapcn~~ : fait sur tout le web, Leaflet conservé en repli automatique (`NEXT_PUBLIC_CARTE_MOTEUR=leaflet` pour le forcer).
