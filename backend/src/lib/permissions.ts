import { RoleUtilisateur, VerbePermission } from '@prisma/client';

/**
 * Catalogue des droits et matrice des dix-sept rôles du référentiel CECAW 360.
 *
 * Cette matrice est la source de vérité initiale : elle alimente la base au
 * démarrage (`synchroniserReferentiel`) et sert de repli quand la base n'a pas
 * encore été synchronisée. Ensuite, l'administrateur fonctionnel peut ajuster
 * les habilitations depuis la table `roles_permissions`.
 *
 * Volontairement absents : IA, application client, paiement mobile. Ces trois
 * périmètres sont exclus du produit.
 */

export const VERBES: VerbePermission[] = [
  'VIEW', 'CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'REJECT', 'EXECUTE', 'EXPORT', 'CONFIGURE', 'AUDIT',
];

/** Domaine → libellé, pour générer un catalogue lisible. */
export const DOMAINES: Record<string, string> = {
  socle: 'Socle et administration technique',
  organisation: 'Organisation (agences, points de service, zones, marchés, secteurs et métiers)',
  crm: 'CRM (prospects et clients)',
  kyc: 'KYC et conformité client',
  comptes: 'Comptes et opérations',
  produits: 'Produits et paramétrage financier',
  credit: 'Crédit (demandes, décision, décaissement)',
  analyse: "Grille d'analyse (compte d'exploitation et bilan)",
  collecte: 'Collecte terrain',
  recouvrement: 'Recouvrement',
  objectifs: 'Objectifs',
  sig: 'SIG (cartographie)',
  territoire: 'Territoire (couverture, potentiel, distribution)',
  tournees: 'Tournées',
  tracking: 'Tracking mobile',
  analytique: 'Tableaux de bord et reporting',
  communication: 'Communication (notifications, SMS)',
  comptabilite: 'Comptabilité et finance',
  documentaire: 'Documents et archivage',
  conformite: "Piste d'audit et conformité",
  integration: 'API et intégrations',
  securite: 'Sécurité',
  administration: 'Paramétrage général',
};

export interface RoleReferentiel {
  code: string;
  nom: string;
  description: string;
  /** Codes `domaine:VERBE`. */
  droits: string[];
}

const d = (domaine: string, ...verbes: VerbePermission[]) => verbes.map((v) => `${domaine}:${v}`);
const lecture = (...domaines: string[]) => domaines.flatMap((x) => d(x, 'VIEW'));

/**
 * Habilitations par rôle, alignées sur la matrice du §6 de la spécification : un domaine n'est
 * accordé à un rôle que si la matrice le marque. Les verbes précisent ce que le rôle y fait.
 * Deux écarts assumés : la direction générale garde la lecture du crédit et l'arbitrage
 * (APPROVE/REJECT) au-delà du seuil du comité ; le chef d'équipe hérite de R12 et R07.
 */
export const ROLES_REFERENTIEL: RoleReferentiel[] = [
  {
    code: 'R01',
    nom: 'Administrateur système',
    description: 'Administration technique, sécurité, utilisateurs et paramètres généraux.',
    droits: [
      ...d('socle', 'VIEW', 'CREATE', 'UPDATE', 'EXECUTE', 'CONFIGURE', 'AUDIT'),
      ...d('organisation', 'VIEW', 'CREATE', 'UPDATE'),
      ...d('securite', 'VIEW', 'CONFIGURE'),
      ...d('conformite', 'VIEW', 'AUDIT'),
      ...d('integration', 'VIEW', 'CONFIGURE'),
      ...d('administration', 'VIEW', 'CONFIGURE'),
    ],
  },
  {
    code: 'R02',
    nom: 'Administrateur fonctionnel',
    description: 'Paramétrage métier : produits, agences, zones, workflows, objectifs et règles.',
    droits: [
      ...lecture('socle'),
      ...d('organisation', 'VIEW', 'CREATE', 'UPDATE'),
      ...d('produits', 'VIEW', 'CONFIGURE'),
      ...d('objectifs', 'VIEW', 'CREATE', 'UPDATE', 'CONFIGURE'),
      ...d('communication', 'VIEW', 'CONFIGURE'),
      ...d('conformite', 'VIEW', 'CONFIGURE'),
      ...d('integration', 'VIEW', 'CONFIGURE'),
      ...d('administration', 'VIEW', 'CONFIGURE'),
    ],
  },
  {
    code: 'R03',
    nom: 'Direction générale',
    description: 'Pilotage institutionnel, objectifs, indicateurs et arbitrages.',
    droits: [
      ...lecture('socle', 'organisation', 'comptes', 'produits', 'credit', 'analyse', 'kyc', 'sig', 'territoire'),
      ...d('credit', 'APPROVE', 'REJECT'),
      ...d('objectifs', 'VIEW', 'CREATE', 'UPDATE', 'CONFIGURE'),
      ...d('sig', 'EXPORT'),
      ...d('analytique', 'VIEW', 'EXPORT'),
      ...d('comptabilite', 'VIEW', 'EXPORT'),
      ...d('administration', 'VIEW'),
    ],
  },
  {
    code: 'R04',
    nom: "Responsable d'agence",
    description: "Pilotage d'agence, portefeuilles, équipes et objectifs.",
    droits: [
      ...d('socle', 'VIEW', 'EXECUTE'),
      ...d('organisation', 'VIEW', 'UPDATE'),
      ...d('crm', 'VIEW', 'CREATE', 'UPDATE', 'EXPORT'),
      ...d('kyc', 'VIEW'),
      ...d('comptes', 'VIEW', 'CREATE', 'UPDATE', 'EXECUTE', 'EXPORT'),
      ...d('credit', 'VIEW', 'CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'REJECT', 'EXPORT'),
      ...d('analyse', 'VIEW'),
      ...d('collecte', 'VIEW', 'UPDATE', 'APPROVE', 'REJECT', 'EXPORT'),
      ...d('recouvrement', 'VIEW', 'UPDATE', 'EXECUTE', 'APPROVE', 'EXPORT'),
      ...d('objectifs', 'VIEW', 'CREATE', 'UPDATE'),
      ...d('sig', 'VIEW', 'EXPORT'),
      ...d('territoire', 'VIEW'),
      ...d('tournees', 'VIEW', 'CREATE', 'UPDATE'),
      ...d('analytique', 'VIEW', 'EXPORT'),
      ...d('communication', 'VIEW'),
    ],
  },
  {
    code: 'R05',
    nom: 'Chargé clientèle / Commercial',
    description: 'Prospection, CRM, KYC initial, relation client et montage crédit.',
    droits: [
      ...d('crm', 'VIEW', 'CREATE', 'UPDATE'),
      ...d('kyc', 'VIEW', 'CREATE', 'UPDATE', 'SUBMIT'),
      ...d('credit', 'VIEW', 'CREATE', 'UPDATE', 'SUBMIT'),
      ...d('analyse', 'VIEW'),
      ...d('sig', 'VIEW'),
      ...d('tournees', 'VIEW', 'CREATE', 'EXECUTE'),
      ...d('tracking', 'VIEW', 'EXECUTE'),
      ...d('communication', 'VIEW'),
      ...d('documentaire', 'VIEW', 'CREATE'),
      ...d('objectifs', 'VIEW'),
    ],
  },
  {
    code: 'R06',
    nom: 'Agent KYC / Conformité',
    description: 'Contrôle documentaire, KYC, LCB-FT, risque et validation conformité.',
    droits: [
      ...d('crm', 'VIEW'),
      ...d('kyc', 'VIEW', 'UPDATE', 'EXECUTE', 'APPROVE', 'REJECT', 'AUDIT'),
      ...d('credit', 'VIEW'),
      ...d('communication', 'VIEW'),
      ...d('documentaire', 'VIEW', 'CREATE'),
      ...d('conformite', 'VIEW', 'UPDATE', 'EXECUTE', 'AUDIT'),
    ],
  },
  {
    code: 'R07',
    nom: 'Analyste crédit',
    description: 'Analyse financière, capacité, garanties, scoring et instruction.',
    droits: [
      ...d('crm', 'VIEW'),
      ...d('kyc', 'VIEW'),
      ...d('credit', 'VIEW', 'UPDATE'),
      ...d('analyse', 'VIEW', 'CREATE', 'UPDATE', 'SUBMIT', 'EXPORT'),
      ...d('analytique', 'VIEW'),
      ...d('documentaire', 'VIEW', 'CREATE'),
    ],
  },
  {
    code: 'R08',
    nom: 'Comité de crédit / Décideur',
    description: 'Décision des dossiers selon les délégations.',
    droits: [
      ...d('credit', 'VIEW', 'APPROVE', 'REJECT'),
      ...d('analyse', 'VIEW'),
      ...d('kyc', 'VIEW'),
      ...d('documentaire', 'VIEW'),
    ],
  },
  {
    code: 'R09',
    nom: 'Agent de caisse / Opérations',
    description: 'Opérations de comptes, encaissements, décaissements et rapprochements autorisés.',
    droits: [
      ...d('comptes', 'VIEW', 'CREATE', 'UPDATE', 'EXECUTE'),
      ...d('credit', 'VIEW', 'EXECUTE'),
      ...d('collecte', 'VIEW', 'CREATE', 'EXECUTE'),
      ...d('documentaire', 'VIEW'),
    ],
  },
  {
    code: 'R10',
    nom: 'Agent collecteur',
    description: 'Collecte terrain, reçus, visites et portefeuille de collecte.',
    droits: [
      ...d('collecte', 'VIEW', 'CREATE', 'EXECUTE'),
      ...d('crm', 'VIEW'),
      ...d('sig', 'VIEW'),
      ...d('tournees', 'VIEW', 'EXECUTE'),
      ...d('tracking', 'VIEW', 'EXECUTE'),
      ...d('analytique', 'VIEW'),
      ...d('communication', 'VIEW'),
      ...d('documentaire', 'VIEW', 'CREATE'),
    ],
  },
  {
    code: 'R11',
    nom: 'Agent recouvrement',
    description: 'Relances, visites, promesses, plans et escalade.',
    droits: [
      ...d('crm', 'VIEW'),
      ...d('credit', 'VIEW'),
      ...d('recouvrement', 'VIEW', 'CREATE', 'UPDATE', 'EXECUTE'),
      ...d('sig', 'VIEW'),
      ...d('tournees', 'VIEW', 'EXECUTE'),
      ...d('tracking', 'VIEW', 'EXECUTE'),
      ...d('analytique', 'VIEW'),
      ...d('communication', 'VIEW'),
      ...d('documentaire', 'VIEW', 'CREATE'),
    ],
  },
  {
    code: 'R12',
    nom: 'Superviseur terrain',
    description: 'Supervision des équipes, tournées, GPS et contrôle terrain.',
    droits: [
      ...d('collecte', 'VIEW', 'UPDATE', 'APPROVE', 'REJECT'),
      ...d('recouvrement', 'VIEW', 'UPDATE', 'EXECUTE'),
      ...d('crm', 'VIEW'),
      ...d('objectifs', 'VIEW'),
      ...d('sig', 'VIEW'),
      ...d('tournees', 'VIEW', 'CREATE', 'UPDATE', 'EXECUTE', 'APPROVE'),
      ...d('tracking', 'VIEW', 'AUDIT'),
    ],
  },
  {
    code: 'R13',
    nom: 'Gestionnaire SIG / Territoire',
    description: 'Cartographie, zones, couverture, potentiel et distribution.',
    droits: [
      ...d('organisation', 'VIEW', 'CREATE', 'UPDATE'),
      ...d('objectifs', 'VIEW', 'CREATE', 'UPDATE'),
      ...d('crm', 'VIEW'),
      ...d('sig', 'VIEW', 'EXPORT', 'CONFIGURE'),
      ...d('territoire', 'VIEW', 'CREATE', 'UPDATE', 'EXECUTE', 'EXPORT'),
      ...d('tournees', 'VIEW', 'CREATE', 'UPDATE'),
      ...d('tracking', 'VIEW'),
      ...d('analytique', 'VIEW', 'EXPORT'),
    ],
  },
  {
    code: 'R14',
    nom: 'Comptable / Finance',
    description: 'Journaux, rapprochements, exports et intégration comptable.',
    droits: [
      ...d('produits', 'VIEW'),
      ...d('comptes', 'VIEW', 'EXPORT'),
      ...d('collecte', 'VIEW', 'EXPORT'),
      ...d('recouvrement', 'VIEW', 'EXPORT'),
      ...d('analytique', 'VIEW', 'EXPORT'),
      ...d('comptabilite', 'VIEW', 'CREATE', 'UPDATE', 'EXECUTE', 'APPROVE', 'EXPORT'),
      ...d('documentaire', 'VIEW'),
    ],
  },
  {
    code: 'R15',
    nom: 'Auditeur / Contrôle interne',
    description: 'Audit, journaux, contrôles et anomalies, sans modification métier.',
    droits: [
      ...d('socle', 'VIEW', 'AUDIT'),
      ...d('kyc', 'VIEW', 'AUDIT'),
      ...d('comptes', 'VIEW', 'AUDIT', 'EXPORT'),
      ...d('produits', 'VIEW', 'AUDIT'),
      ...d('credit', 'VIEW', 'AUDIT', 'EXPORT'),
      ...d('analyse', 'VIEW', 'AUDIT'),
      ...d('collecte', 'VIEW', 'AUDIT'),
      ...d('recouvrement', 'VIEW', 'AUDIT', 'EXPORT'),
      ...d('analytique', 'VIEW', 'EXPORT'),
      ...d('comptabilite', 'VIEW', 'AUDIT', 'EXPORT'),
      ...d('documentaire', 'VIEW', 'AUDIT'),
      ...d('conformite', 'VIEW', 'AUDIT', 'EXPORT'),
      ...d('integration', 'VIEW', 'AUDIT'),
      ...d('securite', 'VIEW', 'AUDIT'),
    ],
  },
  {
    code: 'R17',
    nom: 'Agent support / Back-office',
    description: 'Assistance aux utilisateurs et tâches administratives limitées.',
    droits: [
      ...d('crm', 'VIEW', 'UPDATE'),
    ],
  },
];

/**
 * R16 (Client) n'est volontairement pas provisionné : il relève de l'application
 * client, exclue du périmètre.
 */

/** Règles de séparation des fonctions du §2.1, exprimées en étapes de workflow. */
export const REGLES_SEPARATION = [
  {
    code: 'SEP-CREDIT-MONTAGE-DECISION',
    libelle: "Le créateur d'une demande de crédit ne peut pas en être le décideur",
    etapeA: 'montage', etapeB: 'decision', portee: 'dossier' as const,
    message: "Vous avez monté ce dossier : la décision doit être prise par un autre acteur.",
  },
  {
    code: 'SEP-CREDIT-ANALYSE-DECISION',
    libelle: "L'analyste d'un dossier ne peut pas en être le décideur",
    etapeA: 'analyse', etapeB: 'decision', portee: 'dossier' as const,
    message: "Vous avez instruit ce dossier : la décision doit être prise par un autre acteur.",
  },
  {
    code: 'SEP-CREDIT-MONTAGE-ANALYSE',
    libelle: "Le montage et l'analyse d'un dossier sont exécutés par des acteurs distincts",
    etapeA: 'montage', etapeB: 'analyse', portee: 'dossier' as const,
    message: "Vous avez monté ce dossier : l'analyse doit être réalisée par un autre acteur.",
  },
  {
    code: 'SEP-CREDIT-DECISION-DECAISSEMENT',
    libelle: 'Le décideur ne peut pas exécuter le décaissement',
    etapeA: 'decision', etapeB: 'decaissement', portee: 'dossier' as const,
    message: "Vous avez décidé ce dossier : le décaissement doit être exécuté par un autre acteur.",
  },
  {
    code: 'SEP-KYC-CREATION-VALIDATION',
    libelle: "La validation KYC est distincte de l'instruction commerciale",
    etapeA: 'kyc_creation', etapeB: 'kyc_validation', portee: 'dossier' as const,
    message: "Vous avez constitué ce dossier KYC : sa validation doit être faite par un autre acteur.",
  },
];

/**
 * Rôle du référentiel correspondant à chaque rôle historique tant qu'un
 * utilisateur n'a reçu aucune affectation explicite. Garantit qu'aucun compte
 * existant ne perd ses accès à la bascule.
 */
export const REPLI_ROLE_HISTORIQUE: Record<RoleUtilisateur, string[] | '*'> = {
  admin: '*',
  manager: ['R04'],
  backoffice: ['R12', 'R07'],
  agent: ['R05', 'R10'],
};

/**
 * Catalogue réel des droits, domaine par domaine : seuls les couples domaine:VERBE qui
 * correspondent à une fonctionnalité effective (vérifiée par une route ou accordée à un rôle du
 * référentiel) y figurent, avec un libellé qui décrit l'action plutôt que de répéter le verbe brut.
 * Tenu à jour par `scripts/audit-permissions.ts`, qui compare ce catalogue à l'usage réel des
 * middlewares `can(...)` dans les modules et aux droits accordés dans `ROLES_REFERENTIEL`.
 */
const CATALOGUE_DOMAINE: Record<string, Partial<Record<VerbePermission, string>>> = {
  socle: {
    VIEW: 'Consulter les comptes utilisateurs',
    CREATE: 'Créer un compte utilisateur',
    UPDATE: 'Modifier ou suspendre un compte utilisateur',
    EXECUTE: "Réinitialiser le mot de passe d'un utilisateur",
    CONFIGURE: 'Exécuter des opérations techniques avancées (maintenance, jeux de test)',
    AUDIT: "Consulter le journal d'activité",
  },
  organisation: {
    VIEW: 'Consulter agences, équipes, zones, marchés, secteurs et métiers',
    CREATE: 'Créer une agence, équipe, zone, marché, secteur ou métier',
    UPDATE: "Modifier l'organisation (agences, équipes, zones, marchés, affectations)",
  },
  crm: {
    VIEW: 'Consulter les prospects et clients',
    CREATE: 'Créer un prospect ou un client',
    UPDATE: 'Modifier un prospect ou un client, ses interactions et pièces jointes',
    EXPORT: 'Exporter la liste des prospects et clients',
  },
  kyc: {
    VIEW: 'Consulter les dossiers KYC',
    CREATE: 'Créer un dossier KYC et y joindre des pièces',
    UPDATE: 'Modifier un dossier KYC',
    SUBMIT: 'Soumettre un dossier KYC pour validation',
    APPROVE: 'Valider un dossier KYC',
    REJECT: 'Rejeter un dossier KYC',
    EXECUTE: 'Évaluer un contrôle KYC ou vérifier une liste de sanctions',
    AUDIT: 'Auditer les dossiers KYC',
  },
  comptes: {
    VIEW: 'Consulter les comptes clients et leurs transactions',
    CREATE: 'Ouvrir un compte client',
    UPDATE: 'Modifier le statut d’un compte ou le supprimer',
    EXECUTE: 'Enregistrer une transaction sur un compte',
    EXPORT: 'Exporter un relevé de compte',
    AUDIT: 'Auditer les comptes clients',
  },
  produits: {
    VIEW: 'Consulter le catalogue et le paramétrage des produits',
    CONFIGURE: 'Créer, modifier ou paramétrer un produit ou un groupe de produits',
    AUDIT: 'Auditer le paramétrage des produits',
  },
  credit: {
    VIEW: 'Consulter les demandes de crédit et leurs échéances',
    CREATE: 'Monter un dossier de crédit (garanties, garants, visites)',
    UPDATE: 'Modifier un dossier de crédit ou l’annuler',
    SUBMIT: 'Soumettre un dossier de crédit pour décision',
    APPROVE: 'Approuver un dossier de crédit ou un avenant',
    REJECT: 'Rejeter un dossier de crédit',
    EXECUTE: 'Éditer le contrat, décaisser ou enregistrer un remboursement',
    EXPORT: "Exporter l'échéancier ou le contrat de crédit",
    AUDIT: 'Auditer les dossiers de crédit',
  },
  analyse: {
    VIEW: "Consulter la grille d'analyse (compte d'exploitation et bilan)",
    CREATE: "Créer une grille d'analyse",
    UPDATE: "Modifier une grille d'analyse",
    SUBMIT: 'Terminer et soumettre une analyse financière',
    EXPORT: "Exporter une grille d'analyse",
    AUDIT: "Auditer les grilles d'analyse",
  },
  collecte: {
    VIEW: 'Consulter les journées de collecte, portefeuilles et reçus',
    CREATE: 'Enregistrer une opération de collecte terrain',
    UPDATE: 'Modifier un portefeuille de collecte ou rouvrir une journée',
    EXECUTE: 'Clôturer une journée de collecte ou son rapprochement',
    APPROVE: 'Valider le contrôle d’une journée de collecte',
    REJECT: 'Rejeter le contrôle d’une journée de collecte',
    EXPORT: 'Exporter les données de collecte',
    AUDIT: 'Auditer les journées de collecte',
  },
  recouvrement: {
    VIEW: 'Consulter les dossiers de recouvrement',
    CREATE: 'Créer un dossier de recouvrement',
    UPDATE: 'Réaffecter un dossier ou mettre à jour sa localisation',
    EXECUTE: 'Relancer un client, créer une promesse ou un plan de paiement',
    APPROVE: 'Valider un plan de paiement ou une escalade',
    EXPORT: 'Exporter les données de recouvrement',
    AUDIT: 'Auditer les dossiers de recouvrement',
  },
  objectifs: {
    VIEW: 'Consulter les objectifs',
    CREATE: 'Créer un objectif',
    UPDATE: 'Modifier ou recalculer un objectif',
    CONFIGURE: 'Paramétrer le cadre des objectifs',
  },
  sig: {
    VIEW: 'Consulter la cartographie et les couches SIG',
    CONFIGURE: 'Configurer les couches cartographiques',
    EXPORT: 'Exporter des données cartographiques',
  },
  territoire: {
    VIEW: 'Consulter la couverture et le potentiel du territoire',
    CREATE: 'Créer un découpage territorial',
    UPDATE: 'Modifier un découpage territorial',
    EXECUTE: 'Recalculer le découpage territorial',
    EXPORT: 'Exporter les données de territoire',
  },
  tournees: {
    VIEW: 'Consulter les tournées et leurs visites',
    CREATE: 'Générer ou planifier une tournée',
    UPDATE: 'Réoptimiser ou annuler une tournée',
    EXECUTE: 'Démarrer, terminer une tournée ou enregistrer une visite',
    APPROVE: 'Arbitrer une visite contestée',
  },
  tracking: {
    VIEW: 'Consulter la position et le suivi terrain des agents',
    EXECUTE: 'Exécuter le suivi terrain (tournées en cours)',
    AUDIT: 'Auditer le suivi terrain',
  },
  analytique: {
    VIEW: 'Consulter les tableaux de bord et indicateurs',
    EXPORT: 'Exporter les indicateurs et statistiques',
  },
  communication: {
    VIEW: 'Consulter les campagnes, le calendrier et les déclencheurs de communication',
    CONFIGURE: 'Créer ou paramétrer campagnes, déclencheurs, SMS/WhatsApp et calendrier',
  },
  comptabilite: {
    VIEW: 'Consulter le plan comptable, journal et états financiers',
    CREATE: 'Créer une écriture comptable ou un compte du plan',
    UPDATE: 'Rapprocher un relevé bancaire',
    EXECUTE: "Pousser un export vers l'intégration comptable",
    APPROVE: 'Annuler une écriture ou clôturer/rouvrir une période',
    EXPORT: 'Exporter les états comptables',
    AUDIT: 'Auditer la comptabilité',
  },
  documentaire: {
    VIEW: 'Consulter les archives documentaires',
    CREATE: 'Archiver un document',
    AUDIT: "Vérifier l'intégrité d'une archive",
  },
  conformite: {
    VIEW: 'Consulter le résumé, les alertes et les listes de conformité',
    UPDATE: 'Gérer les listes de sanctions et de vigilance',
    EXECUTE: 'Traiter une alerte ou lancer une analyse de conformité',
    CONFIGURE: 'Paramétrer les listes et règles de conformité',
    AUDIT: 'Auditer la conformité et les règles de séparation des fonctions',
    EXPORT: 'Exporter les données de conformité',
  },
  integration: {
    VIEW: 'Consulter les webhooks et le journal d’échanges',
    CONFIGURE: 'Créer, modifier ou tester un webhook',
    AUDIT: 'Auditer le journal des échanges API',
  },
  securite: {
    VIEW: 'Consulter l’état de sécurité et les sauvegardes',
    CONFIGURE: 'Débloquer un utilisateur, réinitialiser un MFA ou créer une sauvegarde',
    AUDIT: 'Auditer la sécurité du système',
  },
  administration: {
    VIEW: 'Consulter les paramètres système et l’état des tâches planifiées',
    CONFIGURE: 'Modifier un paramètre système ou exécuter une tâche planifiée',
  },
};

export function catalogue(): { code: string; domaine: string; verbe: VerbePermission; libelle: string }[] {
  return Object.entries(CATALOGUE_DOMAINE).flatMap(([domaine, verbes]) =>
    (Object.entries(verbes) as [VerbePermission, string][]).map(([verbe, libelle]) => ({
      code: `${domaine}:${verbe}`,
      domaine,
      verbe,
      libelle,
    })),
  );
}
