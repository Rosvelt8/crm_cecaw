import prisma from './prisma';

/**
 * Paramètres système : valeurs métier modifiables sans redéploiement (ADMINISTRATION 1).
 *
 * Chaque clé a une valeur par défaut dans `DEFAUTS`, si bien que l'application
 * fonctionne sur une base vierge ; la table ne stocke que ce que l'administrateur
 * a explicitement changé. Lecture mise en cache quelques secondes.
 */

export interface DefinitionParametre {
  valeur: unknown;
  categorie: string;
  description: string;
}

export const DEFAUTS: Record<string, DefinitionParametre> = {
  'credit.seuil_agence': { valeur: 2_000_000, categorie: 'credit', description: "Montant maximal décidable au niveau de l'agence (FCFA)" },
  'credit.seuil_comite': { valeur: 20_000_000, categorie: 'credit', description: 'Montant maximal décidable par le comité de crédit (FCFA) ; au-delà, la direction décide' },
  'credit.decote_garanties': {
    valeur: { salaire: 0, depot_garantie: 0, tiers_garant: 0.2, immobilier: 0.3, nantissement: 0.4, materiel: 0.5, autre: 0.5 },
    categorie: 'credit', description: 'Décote appliquée à chaque type de garantie pour obtenir la valeur retenue',
  },
  'recouvrement.niveaux_jours': { valeur: [1, 8, 31, 61], categorie: 'recouvrement', description: 'Jours de retard déclenchant les relances de niveau 1, 2, 3 et 4' },
  'recouvrement.seuil_precontentieux_jours': { valeur: 90, categorie: 'recouvrement', description: 'Retard à partir duquel une escalade précontentieuse est recommandée' },
  'recouvrement.seuil_contentieux_jours': { valeur: 180, categorie: 'recouvrement', description: 'Retard à partir duquel le contentieux est recommandé' },
  'recouvrement.sms_automatique': { valeur: true, categorie: 'recouvrement', description: 'Envoyer automatiquement un SMS au client à chaque nouveau niveau de relance' },
  'communication.rappel_echeance_jours': { valeur: 3, categorie: 'communication', description: "Nombre de jours avant l'échéance où un SMS de rappel est envoyé (0 pour désactiver)" },
  'communication.whatsapp_actif': { valeur: false, categorie: 'communication', description: 'Activer le canal WhatsApp (nécessite WHATSAPP_TOKEN et WHATSAPP_PHONE_NUMBER_ID renseignés côté serveur)' },
  'terrain.rayon_presence_m': { valeur: 150, categorie: 'terrain', description: "Distance maximale (m) entre l'agent et la cible pour valider sa présence" },
  'terrain.vitesse_kmh': { valeur: 25, categorie: 'terrain', description: 'Vitesse moyenne de déplacement (km/h) pour estimer les temps de trajet' },
  'terrain.facteur_detour': { valeur: 1.3, categorie: 'terrain', description: 'Coefficient appliqué à la distance à vol d\'oiseau pour approcher la distance routière' },
  'terrain.duree_visite_min': { valeur: 15, categorie: 'terrain', description: 'Durée moyenne d\'une visite (minutes) pour estimer la durée d\'une tournée' },
  'terrain.arret_min_minutes': { valeur: 10, categorie: 'terrain', description: 'Durée minimale (minutes) au même endroit pour qu\'un arrêt soit détecté' },
  'terrain.arret_rayon_m': { valeur: 60, categorie: 'terrain', description: 'Rayon (m) dans lequel les positions sont considérées comme un même arrêt' },
  'territoire.seuil_penetration_pct': { valeur: 2, categorie: 'territoire', description: 'Taux de pénétration (% de la population) sous lequel une zone est sous-couverte' },
  'territoire.rayon_couverture_agence_km': { valeur: 5, categorie: 'territoire', description: "Distance maximale (km) d'un client à son agence pour être considéré couvert" },
  'conformite.seuil_operation_elevee': { valeur: 5_000_000, categorie: 'conformite', description: 'Montant à partir duquel une opération génère une alerte de conformité (FCFA)' },
  'conformite.seuil_fractionnement': { valeur: 5_000_000, categorie: 'conformite', description: 'Cumul sur 24 h, en au moins 3 opérations, au-delà duquel un fractionnement est suspecté (FCFA)' },
  'objectifs.tolerance_ecart_pct': { valeur: 15, categorie: 'objectifs', description: "Écart (points de %) entre l'avancement attendu et réalisé déclenchant une alerte" },
  'securite.mfa_obligatoire': { valeur: false, categorie: 'securite', description: "Inviter tout utilisateur à activer l'authentification à deux facteurs" },
  'securite.echecs_avant_blocage': { valeur: 5, categorie: 'securite', description: 'Échecs de connexion consécutifs avant blocage du compte' },
  'securite.duree_blocage_min': { valeur: 15, categorie: 'securite', description: 'Durée du blocage du compte (minutes)' },
  'securite.retention_sauvegardes_jours': { valeur: 30, categorie: 'securite', description: 'Durée de conservation des sauvegardes (jours)' },
  'segmentation.dormant_jours_contact': { valeur: 180, categorie: 'segmentation', description: "Jours sans interaction ni transaction au-delà desquels un client est considéré dormant" },
  'segmentation.premium_score_min': { valeur: 80, categorie: 'segmentation', description: 'Score minimal (sur 100) pour classer un client en cycle de vie « premium »' },
  'commercial.relance_cooldown_jours': { valeur: 14, categorie: 'commercial', description: 'Jours minimum entre deux relances suggérées pour le même client ou prospect' },
  'commercial.potentiel_score_min': { valeur: 70, categorie: 'commercial', description: 'Score de potentiel (sur 100) à partir duquel un client est signalé comme opportunité commerciale' },
  'commercial.prospect_stagnant_jours': { valeur: 21, categorie: 'commercial', description: 'Jours sans contact au-delà desquels un prospect non converti est signalé comme stagnant' },
};

const TTL_MS = 30_000;
let cache: { map: Map<string, unknown>; jusqua: number } | null = null;

export function viderCacheParametres() { cache = null; }

async function charger(): Promise<Map<string, unknown>> {
  if (cache && cache.jusqua > Date.now()) return cache.map;
  const lignes = await prisma.parametreSysteme.findMany({ select: { cle: true, valeur: true } });
  const map = new Map<string, unknown>(lignes.map((l) => [l.cle, l.valeur]));
  cache = { map, jusqua: Date.now() + TTL_MS };
  return map;
}

export async function parametre<T = unknown>(cle: string): Promise<T> {
  const map = await charger();
  if (map.has(cle)) return map.get(cle) as T;
  const def = DEFAUTS[cle];
  if (!def) throw new Error(`Paramètre système inconnu : ${cle}`);
  return def.valeur as T;
}

/** Variante numérique tolérante : une valeur corrompue retombe sur le défaut. */
export async function parametreNombre(cle: string): Promise<number> {
  const v = Number(await parametre(cle));
  return Number.isFinite(v) ? v : Number(DEFAUTS[cle].valeur);
}

export async function tousLesParametres() {
  const map = await charger();
  return Object.entries(DEFAUTS).map(([cle, def]) => ({
    cle, categorie: def.categorie, description: def.description,
    defaut: def.valeur, valeur: map.has(cle) ? map.get(cle) : def.valeur, modifie: map.has(cle),
  }));
}

/** Vérifie la forme d'une valeur avant de l'enregistrer : un seuil négatif ou du texte casserait les calculs. */
export function validerValeur(cle: string, valeur: unknown): string | null {
  const def = DEFAUTS[cle];
  if (!def) return `Paramètre inconnu : ${cle}`;
  const modele = def.valeur;
  if (typeof modele === 'number') {
    if (typeof valeur !== 'number' || !Number.isFinite(valeur) || valeur < 0) return 'Une valeur numérique positive est attendue.';
  } else if (typeof modele === 'boolean') {
    if (typeof valeur !== 'boolean') return 'Une valeur booléenne est attendue.';
  } else if (Array.isArray(modele)) {
    if (!Array.isArray(valeur) || valeur.length !== modele.length || valeur.some((x) => typeof x !== 'number' || x < 0)) {
      return `Une liste de ${modele.length} nombres positifs est attendue.`;
    }
    if (cle === 'recouvrement.niveaux_jours' && (valeur as number[]).some((x, i, a) => i > 0 && x <= a[i - 1])) return 'Les seuils doivent être strictement croissants.';
  } else if (typeof modele === 'object' && modele !== null) {
    if (typeof valeur !== 'object' || valeur === null || Array.isArray(valeur)) return 'Un objet est attendu.';
    for (const k of Object.keys(modele)) {
      const v = (valeur as Record<string, unknown>)[k];
      if (typeof v !== 'number' || v < 0 || v > 1) return `« ${k} » doit être un nombre entre 0 et 1.`;
    }
  }
  return null;
}

export async function definirParametre(cle: string, valeur: unknown, acteurId: number) {
  const erreur = validerValeur(cle, valeur);
  if (erreur) throw Object.assign(new Error(erreur), { status: 422 });

  // Cohérence des seuils de délégation : l'agence ne peut pas décider plus que le comité.
  if (cle === 'credit.seuil_agence' && Number(valeur) > (await parametreNombre('credit.seuil_comite'))) {
    throw Object.assign(new Error('Le seuil agence ne peut pas dépasser le seuil du comité.'), { status: 422 });
  }
  if (cle === 'credit.seuil_comite' && Number(valeur) < (await parametreNombre('credit.seuil_agence'))) {
    throw Object.assign(new Error("Le seuil du comité ne peut pas être inférieur au seuil de l'agence."), { status: 422 });
  }

  const def = DEFAUTS[cle];
  const r = await prisma.parametreSysteme.upsert({
    where: { cle },
    create: { cle, valeur: valeur as never, categorie: def.categorie, description: def.description, modifieParId: acteurId },
    update: { valeur: valeur as never, modifieParId: acteurId },
  });
  viderCacheParametres();
  return r;
}

export async function reinitialiserParametre(cle: string) {
  await prisma.parametreSysteme.deleteMany({ where: { cle } });
  viderCacheParametres();
}
