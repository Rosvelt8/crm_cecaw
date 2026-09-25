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
  organisation: 'Organisation (agences, points de service, zones)',
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
const tous = (domaine: string) => d(domaine, ...VERBES);
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
      ...tous('securite'),
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
      ...tous('organisation'),
      ...tous('produits'),
      ...tous('objectifs'),
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
      ...d('comptes', 'VIEW', 'CREATE', 'UPDATE', 'EXECUTE'),
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
      ...d('comptes', 'VIEW', 'AUDIT'),
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

export function catalogue(): { code: string; domaine: string; verbe: VerbePermission; libelle: string }[] {
  return Object.entries(DOMAINES).flatMap(([domaine, libelleDomaine]) =>
    VERBES.map((verbe) => ({
      code: `${domaine}:${verbe}`,
      domaine,
      verbe,
      libelle: `${libelleDomaine} — ${verbe}`,
    })),
  );
}
