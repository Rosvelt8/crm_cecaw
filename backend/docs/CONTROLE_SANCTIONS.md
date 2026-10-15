# Contrôle des sanctions (OFAC, ONU, UE, listes locales)

Les agents n'ont plus à ouvrir les sites officiels : le CRM tient une copie locale des listes de sanctions, la met
à jour **toutes les 6 heures** et compare chaque client ou prospect (nom, alias, date de naissance, pays, employeur,
pièces d'identité). Un seul contrôle interroge toutes les sources, avec une seule file de revue.

## Sources

| Source | Origine | Configuration |
|---|---|---|
| OFAC SDN et non-SDN | Sanctions List Service (CSV) | aucune |
| ONU | Liste consolidée du Conseil de sécurité (XML) | aucune (`UN_LIST_URL` pour surcharger) |
| UE | Financial Sanctions Files, XML v1.1 | **`EU_SANCTIONS_URL`** : lien à jeton à générer depuis un compte EU Login. Sans lui, la source est ignorée et l'écran l'indique |
| Listes locales | Conformité > Listes de surveillance | aucune |

Remarques sur les sources :
- **ONU** : l'adresse historique redirige vers un stockage à signature temporaire (~1 h) ; la redirection est suivie à chaque
  téléchargement. Le fichier s'appelle « Legacy » : si l'ONU le retire, la synchronisation échoue et une alerte le signale.
- **UE** : le lecteur est écrit d'après la structure documentée du format et testé sur un fichier d'exemple, **pas encore
  sur le fichier officiel**. À valider dès que le lien est disponible (un écart de format se verrait comme une erreur de
  synchronisation ou un nombre d'inscriptions anormal).
- **Cameroun / CEMAC** : aucun flux téléchargeable n'a pu être confirmé (commission nationale de gel, plateforme de
  diffusion évoquée sans détail). Les notifications nationales (ANIF, commission nationale consultative sur le gel
  administratif) se **saisissent dans les listes de surveillance** : catégorie « sanction », provenance dans « Source »
  (ex. « ANIF — notification n°… du … »), date de naissance, pays, alias, pièce. Une saisie est répercutée aussitôt dans la
  copie locale et recherchée dans le portefeuille sans attendre le cycle de 6 h. Ce que cela **ne** donne **pas** :
  téléchargement automatique, preuve de provenance par fichier, alerte « liste nationale non mise à jour ».
- Les textes du GABAC/CEMAC (règlement 04/24 sur les sanctions financières ciblées) ne sont pas une liste de noms : leur
  veille reste une procédure interne.

## Mise en service

1. Déployer, puis migrer la base (`scripts/migrer-prod.sh`). Ajouts uniquement ; `ALTER TYPE … ADD VALUE` (nouvelles
   valeurs de l'énumération des listes) est signalé « à relire » par le script, sans être bloqué.
2. Redémarrer le backend (le droit `conformite:APPROVE`, décision de revue, est accordé au rôle R06). Le serveur doit pouvoir joindre
   `sanctionslistservice.ofac.treas.gov` et `scsanctions.un.org` (+ `webgate.ec.europa.eu` pour l'UE).
3. Conformité > **Sanctions** > « Tout mettre à jour » (première charge, ~1 min).
4. Même écran > « Contrôler le portefeuille » (par liste, ou la tâche `sanctions_portefeuille`) : contrôle les clients et
   prospects existants. Les correspondances arrivent dans la file « À revoir ».
5. (UE) renseigner `EU_SANCTIONS_URL`, redémarrer, puis « Mettre à jour » sur la carte UE.

Ensuite tout est automatique : la tâche `sanctions_synchronisation` tourne toutes les 6 h et ne contrôle que les
inscriptions nouvelles ou modifiées (surveillance continue). Une liste **ajoutée après coup** ne contrôle pas d'office le
portefeuille (pour que la conformité choisisse le moment de recevoir les alertes) : utiliser « Contrôler le portefeuille »
sur sa carte. Tout nouveau client ou prospect est contrôlé à sa création.

## Règles de conception

- Résultats : aucune correspondance, correspondance potentielle, correspondance confirmée, erreur technique. **Seul un
  humain habilité** (`conformite:APPROVE`) peut confirmer. Le logiciel ne bloque jamais un client : la procédure interne s'applique.
- Sans liste chargée, le contrôle échoue en erreur technique, jamais en « aucune correspondance ».
- Une synchronisation défaillante (fichier tronqué, page d'erreur, réseau) laisse la liste précédente intacte et crée une
  alerte de conformité ; un avertissement apparaît si les listes ont plus d'un jour. Les jetons et signatures d'adresses ne
  figurent jamais dans les erreurs, alertes ou journaux.
- Les commerciaux voient le statut seulement ; scores, noms listés et décisions sont réservés à la conformité.
- Une même personne listée par plusieurs autorités ressort plusieurs fois dans **un seul** contrôle ; un faux positif les
  écarte toutes ensemble et ne ré-alerte plus tant que ni la fiche client ni les inscriptions ne changent.
- Un rapprochement obtenu sur un alias que la source juge peu fiable (ONU « Low », UE non « strong ») reste de confiance faible.
- L'indice « pays différent » n'est affirmé que si les deux pays sont reconnus ; sinon « non comparable ».

## Paramètres (Paramètres > Système)

| Clé | Défaut | Rôle |
|---|---|---|
| `conformite.ofac_listes` | sdn, non_sdn, onu, ue, locale | Listes utilisées (une liste non configurée est ignorée). Les clés `conformite.ofac_*` gardent leur nom historique mais valent pour toutes les sources |
| `conformite.ofac_seuil` | 85 | Ressemblance de nom minimale (60-100) |
| `conformite.ofac_confiance_min` | faible | Confiance minimale pour déclencher une revue (faible, moyenne, forte) |
| `conformite.ofac_age_max_jours` | 1 | Âge au-delà duquel un avertissement s'affiche |
| `conformite.ofac_depistage_auto` | oui | Contrôle automatique à la création |

Le réglage par défaut fait **tout** revoir. Les noms très répandus (Ibrahim, Mohamed, Ali…) produisent des correspondances
de confiance faible : si le volume pèse, passer `ofac_confiance_min` à `moyenne` après observation.

## API

`POST /conformite/screenings`, `GET /conformite/screenings[/:id]`, `POST /conformite/screenings/:id/revue`,
`GET /conformite/clients/:id/historique`, `GET /conformite/sanctions/{etat,synchronisations}`,
`POST /conformite/sanctions/{synchroniser,depistage-portefeuille}` (corps facultatif `{ "liste": "onu" }`).
Les chemins `/conformite/ofac/...` restent servis (alias).

## Limites connues

- Rapprochement textuel (noms latins). Les noms en écriture non latine (arabe, cyrillique, coréen…) ne sont pas comparés.
- Les navires et aéronefs sont ignorés. Les listes nationales d'autres pays ne sont pas couvertes.
- Deux moteurs coexistent : l'onglet « Vérifier une personne » (listes de surveillance seules, ancien moteur) et le contrôle de
  sanctions. À unifier plus tard.
- Une modification de la fiche client ne relance pas de contrôle (le bouton « Recontrôler » existe sur la fiche).
- Vérifier avec le responsable conformité que ce dispositif répond à la réglementation applicable à CECAW (règlement CEMAC 04/24,
  attentes du GAFI) : ce document n'en juge pas.
