# Audit CECAW Finance 360 — état des lieux et plan de réalisation

Référentiel : `CECAW_FINANCE_360_Specifications_Fonctionnelles_Roles.docx`
(240 fonctionnalités, 26 domaines, 17 rôles, 10 exigences transverses)

Code audité : `backend/` (Express + Prisma + PostgreSQL), `frontend/` (Next.js 15 App Router),
`mobile/` (Expo / React Native).

---

## 1. Synthèse

| Statut | Nombre | Part |
|---|---:|---:|
| Réalisé et exploitable | 54 | 22,5 % |
| Partiel (socle présent, fonction incomplète) | 33 | 13,8 % |
| Absent | 153 | 63,7 % |

**Avancement pondéré (partiel compté pour moitié) : environ 29 %.**

Le produit existant n'est pas un « CRM Finance » au sens de la spécification : c'est un
**CRM commercial terrain + suivi GPS + épargne simple**, très solide sur son périmètre,
mais sans aucun des métiers financiers structurants (crédit, recouvrement, territoire,
paiements, comptabilité, application client).

### Les quatre écarts structurants

1. **Modèle de rôles incompatible.** Le schéma Prisma définit 4 rôles
   (`admin | manager | backoffice | agent`, [schema.prisma:14-19](backend/prisma/schema.prisma#L14-L19)) ;
   la spécification en exige 17 avec 10 verbes de droit (VIEW, CREATE, UPDATE, SUBMIT,
   APPROVE, REJECT, EXECUTE, EXPORT, CONFIGURE, AUDIT). Le middleware
   [rbac.ts](backend/src/middleware/rbac.ts) ne sait vérifier qu'un rôle, jamais une permission.
   **Tout le reste du plan dépend de cette refonte** : le workflow crédit, la séparation
   des fonctions (TR-03) et les critères de recette du §8 sont inatteignables sans elle.
2. **Aucune entité territoriale.** Ni `Institution`, ni `PointService`, ni `Zone`.
   `Agent.secteur` est un `VarChar(200)` libre ([schema.prisma:189](backend/prisma/schema.prisma#L189)).
   Les domaines TERRITOIRE (12), TOURNÉES (9) et la moitié de SIG en dépendent.
3. **Aucun métier crédit ni recouvrement.** 36 fonctionnalités (CRÉDIT 22 + RECOUVREMENT 14)
   sans la moindre table. Le frontend expose des maquettes alimentées par un tableau en
   mémoire ([creditService.ts:3](frontend/src/services/creditService.ts#L3)) — aucune persistance.
4. **Dette de prototype dans le frontend.** Des pages complètes existent hors navigation
   et appellent des routes API inexistantes (`/epargne/*`, `/reporting/*`) ou des mocks :
   `credits/`, `epargne/`, `reporting/`, `notifications/`, `prospects/`, `clients/`,
   `utilisateurs/`, `produits/`, `geolocalisation/`. La `Sidebar` n'expose que Marketing,
   Collecte, Statistiques, Journal et Paramètres ([Sidebar.tsx:28-81](frontend/src/components/layout/Sidebar.tsx#L28-L81)).
   Ces pages sont des maquettes à reprendre ou à supprimer, pas des acquis.

---

## 2. Ce qui est réellement acquis

### Socle technique — solide
- Authentification JWT access/refresh avec rotation, distinction « session expirée » vs
  « coupure réseau » côté mobile ([client.ts](mobile/src/api/client.ts)), code PIN hors ligne
  avec empreinte bcrypt serveur (`Utilisateur.pinHash`).
- **Piste d'audit réelle** : modèle `Log` + `createLog` appelé dans agences, agents, auth,
  clients, comptes, objectifs, produits, prospects, utilisateurs. Couvre TR-01.
- **Cloisonnement par périmètre** fonctionnel : `agenceFilter` par rôle dans chaque service
  ([prospects.service.ts:24-33](backend/src/modules/prospects/prospects.service.ts#L24-L33)),
  y compris le périmètre d'équipe via `getResponsableEquipeIds`. Couvre partiellement TR-04.
- 15 modules REST cohérents, pagination normalisée, OpenAPI, Socket.io, mailer transactionnel.

### Métier — acquis nets
- **CRM prospects/clients** : CRUD complet, personne physique et morale, pièces jointes,
  machine à états du pipeline avec transitions validées
  ([prospects.service.ts:9-16](backend/src/modules/prospects/prospects.service.ts#L9-L16)),
  conversion prospect vers client, affectation commercial et agence.
- **Comptes et transactions** : ouverture, solde avant/après tracé, historique.
- **Objectifs** : cible, périodicité, assignation équipe ou agents, réalisé, taux d'atteinte.
- **Tracking terrain** — le point le plus mature du produit : historisation des positions
  (`AgentPosition` indexée `[agentId, releveAt]`), temps réel au premier plan avec garde-fous
  (heures de service, anti-rafale, mise en file), tâche d'arrière-plan, reconstitution de
  trajet, **kilométrage haversine** ([agents.service.ts:220](backend/src/modules/agents/agents.service.ts#L220)),
  **mode hors connexion** avec file bornée pour les positions et file non destructive pour
  les encaissements ([queue.ts](mobile/src/lib/queue.ts)).
- **Analytique commerciale** : KPI, performances individuelles et par équipe, transactions
  par mois, prospects par statut, avec filtrage par périmètre.
- Cartographie Leaflet/OSM opérationnelle pour les agents en activité.

> À noter : le « Mode hors connexion » est marqué *À faire* dans la matrice source alors qu'il
> est **implémenté**. La matrice source est antérieure au code sur ce point.

---

## 3. Audit détaillé par domaine

Légende : **OK** réalisé · **~** partiel · **–** absent

### SOCLE — 4 OK / 3 ~ / 0 –
| # | Fonctionnalité | Statut | Constat |
|---|---|---|---|
| 1 | Architecture générale CECAW 360 | ~ | CRM + mobile présents ; SIG et Application Client absents |
| 2 | Gestion multi-agences | OK | `Agence` + filtrage de périmètre dans tous les services |
| 3 | Gestion des utilisateurs | OK | CRUD, activation, reset mot de passe, mail |
| 4 | Profils et rôles | ~ | 4 rôles contre 17 attendus |
| 5 | RBAC / droits d'accès | ~ | Contrôle par rôle uniquement ; aucun verbe de droit |
| 6 | Journalisation / traçabilité | OK | `Log` + `createLog` largement diffusé |
| 7 | Tableau de bord général | OK | Module `dashboard` scopé |

### ORGANISATION — 2 OK / 1 ~ / 4 –
| # | Fonctionnalité | Statut | Constat |
|---|---|---|---|
| 1 | Institution / réseau | – | Pas d'entité faîtière |
| 2 | Agences | OK | |
| 3 | Points de service | – | |
| 4 | Zones / secteurs | – | `Agent.secteur` = texte libre, non structurant |
| 5 | Agents / commerciaux | OK | `Agent` + matricule |
| 6 | Agents de collecte | ~ | Pas de typologie d'agent |
| 7 | Agents de recouvrement | – | |

### CRM — 4 OK / 1 ~ / 5 –
| # | Fonctionnalité | Statut | Constat |
|---|---|---|---|
| 1 | Prospects | OK | CRUD + pipeline + pièces jointes |
| 2 | Clients | OK | |
| 3 | Fiches clients 360° | ~ | Fiche riche, mais sans crédits, interactions ni encours |
| 4 | Segmentation clients | – | |
| 5 | Historique des interactions | – | Aucune entité `Interaction` |
| 6 | Appels / rendez-vous / visites | – | |
| 7 | Relances commerciales | – | |
| 8 | Campagnes commerciales | – | |
| 9 | Affectation prospect vers agent | OK | `commercialId` |
| 10 | Affectation client vers agence | OK | `agenceId` |

### KYC — 7 OK / 2 ~ / 10 –
| # | Fonctionnalité | Statut | Constat |
|---|---|---|---|
| 1 | Création dossier KYC | – | Données éparpillées sur `Client`, pas de dossier ni de cycle de vie |
| 2 | Identification personne physique | OK | nom, genre, naissance, CNI, nationalité |
| 3 | Identification entreprise | OK | forme juridique, RCCM, NUI, capital, sigle |
| 4 | Pièce d'identité | ~ | Numéro + pièce jointe ; ni type, ni validité, ni délivrance |
| 5 | OCR des documents | – | |
| 6 | Photo client | – | Pas de champ dédié |
| 7 | Adresse complète | OK | adresse, quartier, ville |
| 8 | Géolocalisation du domicile | OK | `latitude`/`longitude` sur `Client` |
| 9 | Localisation activité professionnelle | – | Un seul couple de coordonnées |
| 10 | Situation familiale | OK | |
| 11 | Profession / activité | OK | |
| 12 | Revenus | ~ | `revenuMensuel` en `VarChar(50)` : non calculable |
| 13 | Charges | – | |
| 14 | Sources de revenus | – | |
| 15 | Documents justificatifs | OK | `PieceJointe` |
| 16 | Contrôles KYC | – | |
| 17 | LCB-FT / conformité | – | |
| 18 | Niveau de risque client | – | |
| 19 | Validation KYC | – | Pas de validation par un acteur distinct (viole TR-03) |

### COMPTES — 3 OK / 2 ~ / 1 –
| # | Fonctionnalité | Statut | Constat |
|---|---|---|---|
| 1 | Ouverture de compte | OK | |
| 2 | Types de comptes | ~ | Dérivé du produit, sans typologie épargne/courant/crédit |
| 3 | Comptes épargne | ~ | Ni taux, ni intérêts, ni capitalisation |
| 4 | Historique des opérations | OK | |
| 5 | Solde / mouvements | OK | Solde avant/après tracé |
| 6 | Relevé de compte | – | Aucune génération PDF |

### PRODUITS — 1 OK / 1 ~ / 5 –
| # | Fonctionnalité | Statut | Constat |
|---|---|---|---|
| 1 | Catalogue des produits financiers | OK | `Produit` + `GroupeProduit` |
| 2 | Produits d'épargne | ~ | Produit générique sans paramètres financiers |
| 3 | Produits de crédit | – | |
| 4 | Paramétrage taux | – | Aucun champ taux |
| 5 | Frais / commissions | – | |
| 6 | Pénalités | – | |
| 7 | Conditions d'éligibilité | – | |

### CRÉDIT — 0 OK / 4 ~ / 18 –
Aucune table. Les 4 partiels sont des maquettes frontend non persistées
([credits/nouveau](frontend/src/app/dashboard/credits/nouveau/page.tsx),
[credits/[id]](frontend/src/app/dashboard/credits/%5Bid%5D/page.tsx)).

| Statut | Fonctionnalités |
|---|---|
| ~ maquette | Demande de crédit · Montant / durée · Objet du crédit · Garanties |
| – | Simulation · Capacité de remboursement · Analyse revenus/charges · Garants · Visite terrain · Photos domicile/activité · Géolocalisation du demandeur · Scoring · Workflow d'instruction · Comité de crédit · Validation · Contrat · Décaissement · Échéancier · Remboursements · Restructuration · Rééchelonnement · Refinancement |

### COLLECTE — 3 OK / 3 ~ / 3 –
| # | Fonctionnalité | Statut | Constat |
|---|---|---|---|
| 1 | Portefeuille de collecte | ~ | Déduit de `commercialId`, pas de portefeuille explicite |
| 2 | Affectation clients vers collecteur | ~ | Idem ; pas de rôle collecteur distinct |
| 3 | Collecte journalière | ~ | Transactions au fil de l'eau, sans notion de journée de collecte |
| 4 | Encaissement terrain | OK | Mobile + file hors connexion |
| 5 | Reçu numérique | – | |
| 6 | Historique collecte | OK | |
| 7 | Contrôle des collectes | – | Aucune validation par le superviseur |
| 8 | Rapprochement collecte | – | |
| 9 | Objectifs collecteurs | OK | |

### RECOUVREMENT — 0 OK / 0 ~ / 14 –
Domaine entièrement absent : impayés, classification des retards, relances 1 à 4,
affectation, localisation débiteur, visite, promesse, plan de régularisation, historique,
escalade précontentieuse, contentieux. Dépend intégralement du domaine CRÉDIT (échéancier).

### OBJECTIFS — 7 OK / 0 ~ / 6 –
| # | Fonctionnalité | Statut |
|---|---|---|
| 1 | Objectifs institutionnels | – |
| 2 | Objectifs par agence | – (équipe/agents uniquement) |
| 3 | Objectifs par commercial | OK |
| 4 | Objectifs par collecteur | OK |
| 5 | Objectifs par produit | OK |
| 6 | Objectifs par zone | – |
| 7 | Objectifs de crédit | – |
| 8 | Objectifs de collecte | OK |
| 9 | Objectifs de recouvrement | – |
| 10 | Objectifs nouveaux clients | OK |
| 11 | Réalisé vs objectif | OK |
| 12 | Taux d'atteinte | OK |
| 13 | Alertes sur écarts | – |

### SIG — 3 OK / 3 ~ / 5 –
| # | Fonctionnalité | Statut | Constat |
|---|---|---|---|
| 1 | Carte interactive | OK | Leaflet ([terrain-map-inner.tsx](frontend/src/components/collecte/terrain-map-inner.tsx)) |
| 2 | OpenStreetMap | OK | |
| 3 | Agences sur carte | – | `Agence` n'a pas de coordonnées |
| 4 | Clients sur carte | ~ | Données présentes, couche absente |
| 5 | Prospects sur carte | ~ | Idem |
| 6 | Domiciles clients | ~ | Idem |
| 7 | Activités professionnelles | – | |
| 8 | Crédits sur carte | – | |
| 9 | Impayés sur carte | – | |
| 10 | Points de collecte | – | |
| 11 | Agents en activité | OK | `/agents/terrain` + temps réel |

### TERRITOIRE — 0 OK / 0 ~ / 12 –
Domaine entièrement absent : découpage automatique, secteurs, affectation zone vers agence et
zone vers agent, couverture, zones non/sous-couvertes, fort potentiel, densité, pénétration,
distribution numérique et en valeur.

### TOURNÉES — 1 OK / 1 ~ / 7 –
| # | Fonctionnalité | Statut | Constat |
|---|---|---|---|
| 1-6 | Planification, génération auto, optimisation, tournées collecte/recouvrement, priorisation | – | |
| 7 | Calcul distances | OK | Haversine côté backend |
| 8 | Temps de déplacement | – | |
| 9 | Circuit prévu / réalisé | ~ | Réalisé seulement ; aucun circuit prévu à comparer |

### TRACKING MOBILE — 8 OK / 0 ~ / 7 –
| # | Fonctionnalité | Statut |
|---|---|---|
| 1 | Application Android terrain | OK |
| 2 | GPS temps réel | OK |
| 3 | Historique des déplacements | OK |
| 4 | Trajet réalisé | OK |
| 5 | Kilométrage | OK |
| 6 | Arrêts | – |
| 7 | Géofencing | – |
| 8 | Preuve de présence | – |
| 9 | Horodatage | OK |
| 10 | Visite géolocalisée | – |
| 11 | Photo géolocalisée | – |
| 12 | Signature électronique | – |
| 13 | Compte rendu terrain | – |
| 14 | Synchronisation CRM / mobile | OK |
| 15 | Mode hors connexion | OK (marqué *À faire* dans la matrice source : à corriger) |

### ANALYTIQUE — 3 OK / 3 ~ / 7 –
| # | Fonctionnalité | Statut |
|---|---|---|
| 1 | Tableau de bord commercial | OK |
| 2 | Tableau de bord crédit | – |
| 3 | Tableau de bord collecte | OK |
| 4 | Tableau de bord recouvrement | – |
| 5 | Tableau de bord SIG | ~ |
| 6 | Performance agence | ~ (par équipe, filtrable par agence) |
| 7 | Performance agent | OK |
| 8 | Performance produit | ~ |
| 9 | Performance zone | – |
| 10-13 | Encours · Taux de remboursement · Taux de retard · Portefeuille à risque | – |

### COMMUNICATION — 0 OK / 1 ~ / 4 –
SMS automatiques – · Notifications clients – · Rappels échéances – · Relances impayés – ·
Notifications agents ~ (Socket.io branché et mails transactionnels, mais pas de centre de
notifications persisté ; la page frontend est un tableau statique).

### PAIEMENTS — 0 OK / 0 ~ / 5 –
Mobile Money, Orange Money, MTN MoMo, paiement électronique, rapprochement automatique :
aucun.

### COMPTABILITÉ / FINANCE — 0 OK / 1 ~ / 4 –
Journal des opérations ~ (`Transaction` et `Log` existent mais ne constituent pas un journal
comptable : ni compte comptable, ni sens, ni période, ni clôture). Export comptable,
rapprochement bancaire, états financiers, intégration : absents.

### DOCUMENTAIRE — 0 OK / 2 ~ / 5 –
GED ~ et dossier client numérique ~ via `PieceJointe` et upload disque
([upload.ts](backend/src/middleware/upload.ts)), sans classement ni métadonnées de dossier.
Dossier crédit, OCR, signature électronique, archivage, versioning : absents (viole TR-05).

### CONFORMITÉ — 2 OK / 1 ~ / 3 –
Piste d'audit OK · Journal des actions OK · Contrôle des accès ~ (rôle seulement) ·
Séparation des fonctions – · Alertes anomalies – · LCB-FT –.

### IA — 0 OK / 0 ~ / 10 –
Aucune brique : assistant commercial, scoring prospects, scoring crédit, détection risque,
prévision recouvrement, priorisation visites, optimisation tournées, analyse portefeuille,
détection anomalies, assistant décisionnel.

### API / INTÉGRATION — 1 OK / 1 ~ / 6 –
API CRM / Tracking OK (le mobile consomme l'API REST) · Webhooks et événements ~ (Socket.io
entrant, pas de webhook sortant ni de journal d'échange, TR-09 non couvert) ·
API CRM-SIG, SIG-Tracking, KYC, Mobile Money, SMS, comptabilité : absents.

### SÉCURITÉ — 2 OK / 2 ~ / 3 –
Authentification forte ~ (JWT + bcrypt + PIN mobile, pas de politique de mot de passe ni de
verrouillage) · MFA – · Chiffrement ~ (transport et SecureStore mobile ; rien au repos) ·
Gestion des sessions OK · Journalisation OK · Sauvegardes – · Reprise après incident –.

### APPLICATION CLIENT — 0 OK / 0 ~ / 6 –
Application inexistante : consultation compte, solde, historique, demande de crédit mobile,
notifications, paiement mobile.

### ADMINISTRATION — 3 OK / 1 ~ / 3 –
Paramétrage général ~ · produits OK · agences OK · zones – · workflows – · objectifs OK ·
règles d'IA –.

---

## 4. Conformité aux exigences transverses

| ID | Exigence | Statut | Écart |
|---|---|---|---|
| TR-01 | Traçabilité | OK | Couverte par `Log` |
| TR-02 | RBAC | – | Rôle sans permission fine ; 13 rôles manquants |
| TR-03 | Séparation des fonctions | – | Aucun workflow à acteurs distincts |
| TR-04 | Périmètre | ~ | Institution/agence/équipe OK ; zone et portefeuille absents |
| TR-05 | Documents | – | Ni versioning, ni archivage |
| TR-06 | Terrain | ~ | GPS et horodatage OK ; preuve (photo/signature) absente |
| TR-07 | Hors connexion | ~ | File et rejeu OK ; pas de gestion de conflit |
| TR-08 | Notifications | – | Pas de moteur d'événements |
| TR-09 | Intégrations | – | Aucun journal technique d'échange |
| TR-10 | Sécurité | ~ | Sessions et chiffrement transport OK ; MFA, sauvegardes, PRA absents |

Sur les 9 critères de recette du §8, **2 sont atteignables en l'état** (opérations terrain
rattachées à l'agent ; tableaux de bord respectant le périmètre).

---

## 5. Plan de réalisation

Le plan est ordonné par **dépendance technique**, pas par domaine. Chaque lot livre un
incrément vérifiable contre les critères de recette du §8.

### Lot 0 — Assainissement (préalable, 1 semaine)
Objectif : ne plus confondre maquette et fonctionnalité.
- Supprimer ou isoler derrière un flag les pages frontend orphelines qui appellent des routes
  inexistantes : `credits/`, `epargne/` (transactions mock), `reporting/`, `notifications/`,
  ainsi que les doublons `prospects/`, `clients/`, `utilisateurs/`, `produits/` que la
  `Sidebar` n'expose pas.
- Retirer `mockCreditsStore` et `MOCK_EPARGNE` du bundle de production.
- Purger les rôles *legacy* de [rbac.ts](frontend/src/lib/rbac.ts) : ils annoncent 13 rôles
  que le backend ne connaît pas et donnent une fausse impression de couverture RBAC.
- Mettre à jour la matrice source : « Mode hors connexion » est réalisé.

### Lot 1 — Refonte RBAC et organisation (fondation, 3 à 4 semaines)
**Rien d'autre ne peut être conforme avant ce lot.**
- Schéma : `Role` (les 17 codes R01 à R17), `Permission` (`domaine:verbe` sur les 10 verbes),
  `RolePermission`, `UtilisateurRole` (un utilisateur peut cumuler des rôles).
  Conserver `RoleUtilisateur` en colonne dérivée le temps de la migration.
- Middleware `requirePermission('credit:APPROVE')` remplaçant `requireRole`, appliqué route
  par route sur les 15 modules existants.
- Règles de séparation des fonctions déclaratives : une table `RegleSeparation`
  (étape A / étape B / portée) vérifiée au moment de la validation, jamais dans l'UI seule.
- Entités : `Institution`, `PointService`, `Zone` (géométrie GeoJSON), rattachements
  zone vers agence et zone vers agent, typologie d'agent (commercial / collecteur / recouvrement).
- Étendre le filtrage de périmètre existant à la zone et au portefeuille.
- Recette : « un droit refusé ne peut pas être contourné par URL ou API » testé sur chaque route.
- Couvre : SOCLE 4-5, ORGANISATION 1-7, CONFORMITÉ 3-4, ADMINISTRATION 4, TR-02/03/04.

### Lot 2 — KYC et référentiel produit (4 semaines)
- `DossierKyc` (client, statut, niveau de risque, acteur de validation, date) avec cycle de
  vie création, pièces, contrôles, risque, validation, archivage — **la validation étant
  interdite au créateur** (TR-03).
- `PieceIdentite` (type, numéro, délivrance, validité), photo client, seconde géolocalisation
  pour l'activité professionnelle.
- Migrer `revenuMensuel` de `VarChar` vers `Decimal`, ajouter `Charge` et `SourceRevenu`
  (indispensables au calcul de capacité de remboursement du lot 3).
- Enrichir `Produit` : type (épargne / crédit), taux, frais, pénalités, conditions
  d'éligibilité, versionné avec date d'effet. Le paramétrage est une action tracée
  réservée à R02.
- GED : classement par dossier, versioning, archivage (TR-05).
- Couvre : KYC 1-19, PRODUITS 2-7, DOCUMENTAIRE 1-2 et 6-7, COMPTES 2-3.

### Lot 3 — Crédit (6 à 8 semaines, le plus gros lot)
- Schéma : `DemandeCredit`, `Garantie`, `Garant`, `VisiteTerrain`, `Score`, `DecisionCredit`,
  `ContratCredit`, `Echeance`, `Remboursement`, `AvenantCredit` (restructuration,
  rééchelonnement, refinancement).
- Workflow d'instruction à états et acteurs imposés :
  montage (R05), KYC (R06), analyse (R07), comité (R08), contrat, décaissement (R09),
  chaque transition tracée et contrôlée par permission, avec délégation par montant.
- Simulation et échéancier : moteur de calcul isolé et testé unitairement (amortissement,
  frais, pénalités), réutilisé par la simulation et par la génération du contrat.
- Relevé de compte PDF (COMPTES 6) mutualisé avec le contrat et l'échéancier.
- Couvre : CRÉDIT 1-22, COMPTES 6, ANALYTIQUE 2 et 10-11.

### Lot 4 — Recouvrement (3 à 4 semaines)
Directement bâti sur `Echeance` du lot 3.
- Détection automatique des impayés (tâche planifiée), classification par tranche de retard,
  `DossierRecouvrement`, affectation à R11, relances graduées 1 à 4, `PromessePaiement`,
  `PlanRegularisation`, escalade précontentieuse et contentieux.
- Tableau de bord recouvrement, taux de retard, portefeuille à risque.
- Couvre : RECOUVREMENT 1-14, ANALYTIQUE 4 et 12-13, OBJECTIFS 9.

### Lot 5 — Terrain, SIG et tournées (4 à 5 semaines)
Bâti sur `Zone` (lot 1) et les dossiers des lots 3 et 4.
- `Tournee` et `Visite` (prévu vs réalisé), génération de tournée à partir du portefeuille,
  optimisation de circuit, priorisation.
- Mobile : visite géolocalisée, photo géolocalisée, signature électronique, compte rendu,
  détection d'arrêts, géofencing, preuve de présence. Étendre la file hors connexion
  existante à ces objets et **ajouter la résolution de conflit** manquante (TR-07).
- Reçu numérique de collecte, journée de collecte, contrôle par le superviseur, rapprochement.
- SIG : couches clients, prospects, activités, crédits, impayés, points de collecte, agences
  (ajouter les coordonnées à `Agence`) ; analyse de couverture, densité, pénétration,
  distribution numérique et en valeur.
- Couvre : TOURNÉES 1-9, TRACKING MOBILE 6-13, COLLECTE 1-3, 5, 7-8, SIG 3-10,
  TERRITOIRE 1-12, ANALYTIQUE 9, OBJECTIFS 6.

### Lot 6 — Paiements, communication et comptabilité (4 à 5 semaines)
- Passerelle de paiement abstraite (une interface, deux adaptateurs Orange Money et MTN MoMo),
  `TransactionPaiement` avec référence externe, statut, journal technique d'échange et
  rapprochement automatique (TR-09).
- Moteur de notifications : `Notification` persistée, `EvenementMetier`, déclencheurs
  paramétrables, canaux SMS / push / in-app. Alimente rappels d'échéance, relances impayés,
  alertes sur écarts d'objectif (OBJECTIFS 13) et alertes d'anomalie (CONFORMITÉ 5).
- Comptabilité : plan comptable minimal, `EcritureComptable` générée par événement financier,
  export normalisé, rapprochement bancaire, états financiers.
- Couvre : PAIEMENTS 1-5, COMMUNICATION 1-5, COMPTABILITÉ 1-5, API 5-8, OBJECTIFS 13.

### Lot 7 — Application client (3 à 4 semaines)
Application mobile distincte réutilisant l'infrastructure Expo existante : consultation de
compte, solde, historique, demande de crédit, notifications, paiement mobile — adossée au
lot 6 pour le paiement et au lot 3 pour la demande.
- Couvre : APPLICATION CLIENT 1-6.

### Lot 8 — Sécurité, conformité et IA (3 à 4 semaines, parallélisable dès le lot 4)
- MFA (TOTP), politique de mot de passe, verrouillage après échecs, chiffrement au repos des
  données sensibles, sauvegardes automatisées, procédure de reprise documentée et testée.
- LCB-FT : listes de surveillance, seuils, alertes d'anomalie, contrôles automatisés.
- IA, par ordre de rentabilité : scoring crédit (modèle sur historique de remboursement),
  détection d'anomalies, priorisation des visites, optimisation des tournées,
  prévision de recouvrement, assistants conversationnels. Chaque règle paramétrable
  (ADMINISTRATION 7) et chaque décision assistée tracée.
- Couvre : SÉCURITÉ 1-7, CONFORMITÉ 5-6, IA 1-10, ADMINISTRATION 7.

### Chemin critique

```
Lot 0 -> Lot 1 -+-> Lot 2 -> Lot 3 -+-> Lot 4 -> Lot 5
                |                   +-> Lot 6 -> Lot 7
                +-> Lot 8 (dès le lot 4)
```

Durée cumulée, une équipe : **31 à 42 semaines**. Avec deux flux parallèles à partir du
lot 3 (métier financier / terrain et intégrations) : **22 à 28 semaines**.

### Progression attendue

| Jalon | Fonctionnalités couvertes | Avancement |
|---|---:|---:|
| Aujourd'hui | 54 OK / 33 partielles | 29 % |
| Fin lot 1 | +23 | 41 % |
| Fin lot 2 | +30 | 54 % |
| Fin lot 3 | +25 | 65 % |
| Fin lot 4 | +18 | 73 % |
| Fin lot 5 | +47 | 90 % |
| Fin lot 6 | +19 | 97 % |
| Fin lots 7 et 8 | +24 | 100 % |

---

## 6. Points d'attention

- **Ne pas commencer par le crédit.** C'est le domaine le plus visible et le plus demandé,
  mais son workflow est inconstructible sans les 17 rôles et les permissions fines du lot 1 :
  le construire avant obligerait à le réécrire.
- **`revenuMensuel` et `capitalSocial` en `VarChar`** doivent être migrés en `Decimal` avant
  le lot 3 ; toute analyse de capacité de remboursement en dépend. Prévoir une migration de
  données avec normalisation des valeurs existantes.
- **Le cumul de rôles est nécessaire** : en agence, la même personne exerce souvent plusieurs
  fonctions. Un utilisateur doit pouvoir porter plusieurs rôles, la règle de séparation
  s'appliquant alors au niveau de l'acte et non du compte.
- **`teamScope` est la bonne base** pour le périmètre : l'étendre plutôt que le remplacer.
- **Uploads sur disque local** ([upload.ts](backend/src/middleware/upload.ts)) : à migrer vers
  un stockage objet avant le lot 2, sans quoi le versioning et l'archivage documentaires
  (TR-05) seront à refaire.
- **La matrice source est en retard sur le code** sur au moins un point (mode hors connexion).
  Après chaque lot, le statut final de la matrice doit être renseigné : il est aujourd'hui
  vide pour les 240 lignes.

---

## 7. Périmètre retenu et état d'implémentation (mise à jour du 21/09/2026)

**Exclus du produit** : module IA, application client, paiement mobile (Mobile Money, Orange Money, MTN MoMo,
paiement électronique). Le rôle R16 (Client) n'est pas provisionné. Le lot 7 est supprimé ; les lots 6 et 8 sont
réduits à leurs parties hors IA et hors paiement.

**Réalisé dans cette itération** (lots 1, 2 et 3 du plan, plus l'archivage) :

| Lot | Contenu | Où |
|---|---|---|
| 1 | 16 rôles, 10 verbes de droit, catalogue de 150 droits, `requirePermission`, cumul de rôles, règles de séparation des fonctions | `backend/src/lib/permissions.ts`, `lib/rbac.ts`, `middleware/permissions.ts`, `modules/rbac` |
| 1 | Institutions, points de service, zones hiérarchiques (GeoJSON), affectation zone → agents, type d'agent | `modules/organisation` |
| 2 | Dossier KYC, contrôles, pièces d'identité, versioning des justificatifs, niveau de risque à règles, validation par un acteur distinct | `modules/kyc` |
| 2 | Paramétrage financier versionné par date d'effet (taux, frais, pénalités, éligibilité) | `modules/parametrages` |
| 3 | Demande, simulation, garanties, garants, visites, **grille d'analyse et bilan**, scoring à règles, décision avec délégation par montant, contrat, décaissement, échéancier, remboursements, avenants | `modules/credit`, `lib/finance` |
| — | Archivage : instantanés figés scellés SHA-256, automatiques aux jalons, vérifiables | `lib/archivage.ts`, `modules/archives` |

**Réalisé ensuite** (état final de cette livraison) :

| Lot | Contenu | Où |
|---|---|---|
| 0 | Assainissement : pages et données fictives supprimées, anciens contrôles de rôle remplacés | `frontend/src`, `backend/src/middleware` |
| 4 | Recouvrement : portefeuilles d'impayés, relances, promesses, escalade, restructuration, contentieux, provisions | `modules/recouvrement` |
| 5 | Tournées (génération par priorité, optimisation plus proche voisin + 2-opt, comparaison prévu/réalisé), preuve de présence GPS, photos géolocalisées, signature, rejeu hors ligne idempotent avec conflits arbitrés, arrêts et sorties de zone | `modules/tournees`, `modules/sig`, `lib/geo.ts`, `mobile/app/(tabs)/tournee.tsx`, `mobile/app/visite/[id].tsx` |
| 5 | Collecte : journées, reçus numérotés, clôture, contrôle, rapprochement, portefeuilles ; mobile : `client_uid` sur chaque opération | `modules/collecte`, `modules/comptes`, `mobile/src/lib/queue.ts` |
| 6 | Notifications par déclencheurs configurables, SMS avec reprise sur échec, webhooks signés HMAC, journal des échanges, comptabilité en partie double idempotente, exports | `lib/notifier.ts`, `lib/sms.ts`, `modules/communication`, `modules/comptabilite` |
| 6 | Objectifs par catégorie et portée (institution, agence, zone, équipe), calcul automatique, alertes d'écart, page de pilotage | `modules/objectifs`, `frontend/.../objectifs` |
| 8 | Conformité (LCB-FT, plafonds, gel), MFA TOTP, verrouillage, politique de mot de passe, sauvegardes chiffrées et restauration vérifiée, tâches planifiées, PRA | `modules/conformite`, `modules/auth`, `lib/sauvegarde.ts`, `docs/RUNBOOK_REPRISE.md` |
| — | Tous les modules migrés vers `requirePermission` (`middleware/rbac.ts` supprimé), interface filtrée par droits | `backend/src/modules`, `frontend/src/hooks/useCan.ts` |

**Exclus, donc non réalisés volontairement** : IA (10 fonctionnalités), application client (6), paiements mobile (5).
Le lot 7 est supprimé.

**Écarts et hypothèses à valider par la direction**
- Seuils de délégation de décision (2 M et 20 M FCFA), décotes de garanties, barèmes de score et de risque : valeurs de départ, paramétrables.
- Pénalité de retard : taux annuel appliqué au dû, proratisé sur 365 jours. TEG approximé.
- Plan comptable minimal, numérotation non officielle : à remplacer par celui de l'institution.
- SMS via une passerelle HTTP JSON générique (SMS_API_URL) : l'adaptation au fournisseur réel reste à faire.
- R03 conserve VIEW/APPROVE/REJECT sur le crédit pour l'arbitrage (écart à la matrice de la spécification).
- Les pages Objectifs (collecte) et Géolocalisation antérieures sont conservées.

**Vérifications effectuées**
- Backend : compilation TypeScript propre ; 3 suites d'intégration (crédit 64, terrain 66, transverse 67 contrôles) passées sur une base PostgreSQL de test jetable.
- Frontend : compilation TypeScript propre.
- Mobile : `tsc --noEmit` propre. NON testé sur appareil ni émulateur : caméra, GPS, signature tactile et rejeu hors ligne restent à valider en conditions réelles. `expo-image-picker` a été ajouté : un nouveau build natif est nécessaire.
- Non vérifié : `pg_dump` / `pg_restore` réels (absents du poste, seul le chiffrement de fichier est testé), envoi SMS réel, export comptable réel, lint des nouvelles pages frontend.

---

## 8. Compléments stratégiques (demande du 25/09/2026)

20 points transmis par l'utilisateur pour transformer les données existantes en « intelligence
client, commerciale, territoriale et financière ». Décisions de cadrage actées avec l'utilisateur
avant cette analyse :

- **« Agent IA »** (points 4, 14, 17, 20) = **moteur de recommandation à règles déterministes**,
  dans la continuité du scoring crédit déjà livré (grille à barème, pas de modèle statistique ni
  d'appel à un service d'IA générative). Aucune exclusion levée : toujours aucun appel LLM/OpenAI/
  Anthropic dans le produit (confirmé absent du code à ce jour).
- **Messagerie** (point 17) : SMS reste le canal principal actuel. **WhatsApp** est à construire,
  activable/désactivable **depuis l'administration** une fois les identifiants Meta Business
  fournis par CECAW. **Telegram n'est pas retenu.**

Légende : **Absent** (rien en base ni en code) · **Partiel** (des briques exploitables existent,
il manque l'assemblage ou une partie du périmètre) · **Développé** (déjà couvert par les lots 1-8).

| # | Point | Statut | Constat |
|---|---|---|---|
| 1 | Segmentation & scoring client 360° | Absent | `Client.segment` est un simple champ texte libre ([schema.prisma:842](backend/prisma/schema.prisma#L842)) ; aucune table de critères dynamiques, aucun score distinct du scoring crédit (`GrilleAnalyse`/`BilanAnalyse`). |
| 2 | Historique des interactions 360° | Absent | Aucun modèle `Interaction`. Seuls des champs `notes` libres existent sur `Prospect`/`Client` ; le seul journal structuré (`VisiteTournee`) est lié à une tournée planifiée, pas à un contact libre. |
| 3 | Appels, rendez-vous & visites | Partiel | Les visites de tournée sont structurées (compte rendu, GPS, signature) mais seulement dans le cadre d'une tournée planifiée : pas de saisie rapide d'un appel ou d'un rendez-vous ad hoc. |
| 4 | Relances commerciales intelligentes | Absent | Le moteur de déclencheurs (`modules/communication`) est générique et opérationnel, mais aucune règle « crédit en retard / échéance proche / client dormant » n'y est câblée pour le volet commercial. |
| 5 | Campagnes commerciales 360° | Absent | Aucun modèle de campagne ; dépend de la segmentation (1) et du calendrier (6). |
| 6 | Calendrier camerounais | Absent | Aucun modèle calendrier/jour férié ni côté backend ni frontend. |
| 7 | OCR intelligent des documents | Absent | Confirmé absent (déjà signalé dans la matrice, ligne KYC #5 et DOCUMENTAIRE #4). Nécessite un choix de moteur avant chiffrage (voir Lot 14). |
| 8 | Localisation & activité professionnelle | Développé / Partiel | Géolocalisation de l'activité déjà livrée (`ClientFinances` : `latitude_activite`/`longitude_activite`, profession, ancienneté). Reste un référentiel structuré secteur/métier/employeur : aujourd'hui texte libre. |
| 9 | Photographie de l'activité professionnelle | Partiel | La photo du client existe (`kyc.client.ts`) ; pas de type de pièce dédié « photo de l'enseigne/du lieu d'activité » distinct, avec géolocalisation et horodatage propres. |
| 10 | Comptes épargne & intelligence épargne | Partiel | `CompteClient`/`Transaction` permettent de recalculer un historique de solde, mais sans objectif d'épargne ni indicateur de régularité précalculé ([schema.prisma:975-1020](backend/prisma/schema.prisma#L975-L1020)). |
| 11 | Synthèse crédit dans la fiche client | Partiel | `ClientCreditsKyc.tsx` affiche la liste des crédits (référence, montant, statut) mais ni échéances à venir, ni impayés, ni jours de retard — alors que ces données existent déjà (`Echeance`, `DossierRecouvrement`) : c'est un défaut d'assemblage, pas un manque de données. |
| 12 | Recouvrement client 360° | Partiel | Même constat que le point 11 : le module recouvrement existe pleinement, mais rien n'est agrégé sur la fiche client. |
| 13 | Objectifs client 360° | Absent | `Objectif` couvre institution/agence/zone/équipe/agent, jamais un objectif personnel du client (ex. épargner pour un projet). |
| 14 | Agent (moteur) des objectifs | Partiel | `objectifs.calcul.ts` détecte déjà l'écart avancement attendu/réel et alerte ([objectifs.calcul.ts:94-129](backend/src/modules/objectifs/objectifs.calcul.ts#L94-L129)) ; aucune projection de tendance ni proposition de réajustement chiffrée. |
| 15 | Territoire & marchés 360° | Absent | Seuls `PointService` et `Zone` existent ; aucune notion de « marché » (grand/moyen/petit) distincte. |
| 16 | Intelligence Bayam-Sellam & collecte | Absent | Dépend entièrement du point 15 (aucun modèle marché à qualifier). |
| 17 | Messagerie client automatisée | Absent | `notifier.ts` ne gère que deux canaux câblés en dur (`sms`, `in_app`) ([notifier.ts:93-105](backend/src/lib/notifier.ts#L93-L105)), sans registre extensible ; aucun webhook entrant pour recevoir des messages WhatsApp/Telegram. |
| 18 | Notifications clients intelligentes | Partiel | Le choix du canal par déclencheur existe déjà ; il manque une préférence de canal par client et le routage automatique selon cette préférence. |
| 19 | Orchestration transverse | — | Exigence d'architecture, pas une fonctionnalité isolée : satisfaite par construction si chaque lot ci-dessous alimente la même fiche client et le même score. |
| 20 | Principe directeur | — | Cadrage stratégique. Traduit en livrable concret : un tableau de bord « intelligence client » agrégeant segmentation, score, historique, crédit, recouvrement, épargne et objectifs sur une vue unique, entièrement basé sur des règles explicites et traçables. |

---

## 9. Plan de réalisation des compléments stratégiques

Plan ordonné par dépendance, dans la continuité des lots 0 à 8. Chaque lot est vérifiable par un
enrichissement concret et visible de la fiche client ou du tableau de bord.

### Lot 9 — Fondations de la donnée client (3 à 4 semaines)
- `Interaction` (type appel/rendez-vous/visite/réclamation/document/engagement, canal, auteur,
  client ou prospect, date, résumé, prochaine action) + API de saisie rapide + composant de
  chronologie sur la fiche client. Couvre les points 2 et 3.
- `Marche` (nom, type grand/moyen/petit marché, zone de rattachement, coordonnées) et
  rattachement client/prospect/agent à un marché. Couvre le point 15.
- Référentiel structuré `Secteur`/`Metier` en remplacement du texte libre actuel. Complète le
  point 8.
- Type de pièce jointe dédié « photo d'activité » (géolocalisée, horodatée), extension mineure du
  modèle `PieceJointe` existant. Couvre le point 9.
- `Client.segment` remplacé par un modèle de critères (encours, ancienneté, régularité de
  paiement, dernier contact) et un job de calcul de score client (cycle de vie : nouveau / actif /
  dormant / à risque / premium). Couvre le point 1.

### Lot 10 — Fiche client 360° assemblée (2 à 3 semaines)
Assemblage principalement : les données existent déjà pour l'essentiel (crédit, recouvrement),
seule leur agrégation sur la fiche manque.
- Bloc « Synthèse crédit » sur la fiche client : échéances à venir, montant en retard, jours de
  retard (point 11).
- Bloc « Recouvrement » sur la fiche client : statut, ancienneté du retard, promesses, dernière
  et prochaine action (point 12).
- `ObjectifClient` (financier / professionnel / personnel), rattachable à un compte épargne
  (point 13).
- Objectif d'épargne sur `CompteClient` (montant cible, date cible) et job d'analyse de
  régularité des versements (point 10).
- Tableau de bord « intelligence client » consolidant segmentation, score, historique,
  crédit, recouvrement, épargne, objectifs sur une vue unique (points 19 et 20).

### Lot 11 — Automatisation commerciale à règles (2 semaines)
Dépend du Lot 9 (segmentation, marché).
- Moteur de relances commerciales : évalue chaque client/prospect (crédit en retard, échéance
  proche, client dormant détecté via le score, opportunité de conversion) et génère des tâches de
  relance priorisées pour le commercial, en réutilisant le moteur de déclencheurs existant
  (point 4).
- Extension d'`objectifs.calcul.ts` : projection de tendance (extrapolation simple sur les
  dernières périodes) et proposition chiffrée de réajustement de cible, **soumise à validation
  humaine, jamais appliquée automatiquement** (point 14).
- Qualification du potentiel de collecte par marché (densité de clients + activité), construite
  sur le modèle `Marche` du Lot 9 (point 16).

### Lot 12 — Calendrier et campagnes (2 semaines)
Dépend du Lot 9 (segmentation) pour le ciblage.
- Modèle calendrier + données de référence : fêtes nationales fixes (Jeunesse 11/02, Travail
  01/05, Fête Nationale 20/05, Noël 25/12, Nouvel An 01/01), fêtes chrétiennes mobiles (Vendredi
  Saint, Pâques, Ascension, Pentecôte, Assomption, Toussaint), fêtes musulmanes mobiles (Ramadan,
  Tabaski/Eid al-Adha, Maouloud), rentrée/vacances scolaires. **Hypothèse à valider chaque année** :
  les dates musulmanes suivent le calendrier lunaire et ne peuvent pas être calculées
  arithmétiquement à long terme ; je fournirai un jeu 2025-2027 indicatif à confirmer par CECAW.
  Les événements commerciaux propres à CECAW restent à définir par la direction.
- `Campagne` (nom, segment cible, canal, période, gabarit de message, statut) reliée au calendrier
  et au moteur de déclencheurs, avec suivi de diffusion (point 5).

### Lot 13 — Messagerie multicanal (2 à 3 semaines, parallélisable)
Indépendant des lots 9 à 12.
- `notifier.ts` : remplacement des deux branches câblées en dur par un registre de canaux
  (interface `CanalMessagerie`), sans changer le comportement SMS/in-app actuel.
- Canal WhatsApp (Meta Cloud API) : envoi et réception (webhook entrant, absent aujourd'hui),
  activable depuis Paramètres > Communication une fois les identifiants renseignés par CECAW
  (compte Meta Business vérifié, numéro dédié). **Dépendance externe : CECAW doit obtenir ce
  compte ; le canal reste désactivé tant qu'il n'est pas configuré.**
- Préférence de canal par client (SMS/WhatsApp), routage automatique du moteur de déclencheurs
  selon cette préférence et la disponibilité du canal (point 18).
- Pas de Telegram (décision actée).

### Lot 14 — OCR documentaire (2 à 3 semaines, parallélisable)
Le plus incertain à chiffrer : nécessite un choix de moteur avant de démarrer.
- **Décision à prendre avec CECAW** : moteur auto-hébergé (Tesseract, gratuit, précision plus
  limitée sur les CNI camerounaises) ou service cloud payant (plus fiable, coût à l'usage et
  dépendance externe).
- Extraction des champs (nom, numéro de pièce, date de naissance), classification du type de
  document, contrôle de cohérence entre la valeur extraite et la valeur saisie par l'agent
  (point 7).

### Chemin critique

```
Lot 9 -+-> Lot 10 -+-> Lot 11 -> Lot 12
       |
       +-> Lot 13 (parallélisable)
       +-> Lot 14 (parallélisable, décision OCR préalable)
```

Durée cumulée, chemin séquentiel : **11 à 15 semaines**. Avec Lots 13 et 14 en parallèle du reste :
**9 à 12 semaines**.

### Décisions ouvertes avant réalisation

1. **Calendrier des fêtes mobiles** : jeu de données 2025-2027 à valider par CECAW chaque année.
2. **Moteur OCR** : auto-hébergé (gratuit, moins précis) ou service cloud (payant, plus fiable).
3. **Compte WhatsApp Business** : à obtenir par CECAW (Meta Business Manager, numéro dédié) avant
   que le canal ne soit activable en production ; le code sera livré prêt à l'emploi dès
   réception des identifiants.
4. **Événements commerciaux du calendrier** (hors fêtes officielles) : à définir par la direction
   CECAW (soldes, lancement produit, etc.).

### État d'implémentation (mise à jour du 25/09/2026)

**Lot 9 réalisé** : `Interaction` (`modules/interactions`), `Marche`/`MarcheAgent`, `Secteur`/`Metier`
avec référentiel de départ camerounais (seed), `ScoreClient` avec moteur de règles pur et testé
(`lib/segmentation.ts`, `scripts/verif-segmentation.ts`), tâche planifiée quotidienne
`score_clients`. Photo d'activité (point 9) via `PieceJointe` catégorie `photo_activite`
(`POST /kyc/clients/:id/photos-activite`). Frontend : page Paramètres > Marchés et activités
(marchés + secteurs/métiers), bloc « Profil territorial » éditable sur la fiche client.

**Lot 10 réalisé pour l'essentiel** : synthèse crédit et recouvrement assemblées sur la fiche
client (`GET /clients/:id/synthese`, composant `ClientSynthese360`), `ObjectifClient` (point 13)
avec CRUD complet, objectif d'épargne déclaratif sur `CompteClient` avec analyse de régularité
(`GET /comptes/:id/analyse-epargne`). Non fait dans ce lot : le tableau de bord dédié qui
agrégerait explicitement segmentation + score + historique + crédit + recouvrement + épargne +
objectifs sur un seul écran de synthèse (point 20) — les blocs existent tous sur la fiche client,
mais pas encore sous forme de vue de synthèse unique séparée.

**Lots 11 à 14 non commencés** : moteur de relances à règles, projection/réajustement
d'objectifs, potentiel de collecte par marché, calendrier camerounais et campagnes, canal
WhatsApp (le registre de canaux dans `notifier.ts` reste à construire), OCR.

**Vérifications effectuées** : suite d'intégration `scripts/it/04-strategique.ts` (24 contrôles),
aucune régression sur les 3 suites précédentes (64 + 66 + 67 contrôles). Frontend : `tsc --noEmit`
propre, lint sans régression par rapport à la référence des fichiers existants.
