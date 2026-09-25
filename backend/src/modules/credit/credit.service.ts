import prisma from '../../lib/prisma';
import { Prisma, StatutDemandeCredit, ModeAmortissement, PeriodiciteEcheance, TypeCredit, TypeGarantie, ModeReglement, TypeAvenant, SensDecision } from '@prisma/client';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { ErreurMetier, consignerActe, verifierSeparation, rolesEffectifs } from '../../lib/rbac';
import { droitsEffectifs } from '../../lib/rbac';
import { archiverSansBloquer } from '../../lib/archivage';
import { genererEcheancier, validerParametres } from '../../lib/finance/amortissement';
import { arrondi } from '../../lib/finance/grilleAnalyse';
import { parametre, parametreNombre } from '../../lib/parametres';
import { emettre } from '../../lib/notifier';
import { comptabiliser, ventiler } from '../../lib/compta';
import { verifierOperation } from '../../lib/conformite';
import { traiterDemande } from '../recouvrement/recouvrement.service';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes métier. Valeurs de départ, à faire valider par la direction du crédit.
// ─────────────────────────────────────────────────────────────────────────────

/** Les plafonds de délégation sont des paramètres système (`credit.seuil_agence`, `credit.seuil_comite`). */

/** Rôles autorisés à décider favorablement, par instance. */
const DECIDEURS: Record<'agence' | 'comite' | 'direction', string[]> = {
  agence: ['R04', 'R08', 'R03'],
  comite: ['R08', 'R03'],
  direction: ['R03'],
};

export async function instanceRequise(montant: number): Promise<'agence' | 'comite' | 'direction'> {
  if (montant <= (await parametreNombre('credit.seuil_agence'))) return 'agence';
  if (montant <= (await parametreNombre('credit.seuil_comite'))) return 'comite';
  return 'direction';
}

const ETATS_EDITABLES: StatutDemandeCredit[] = ['brouillon', 'soumise', 'kyc_en_cours', 'kyc_valide', 'analyse_en_cours'];

// ─────────────────────────────────────────────────────────────────────────────
// Périmètre d'accès (TR-04)
// ─────────────────────────────────────────────────────────────────────────────

const ROLES_GLOBAUX = ['R03', 'R14', 'R15'];
const ROLES_AGENCE = ['R04', 'R06', 'R07', 'R08', 'R09', 'R11'];

async function perimetre(actor: JwtPayload): Promise<Prisma.DemandeCreditWhereInput> {
  const roles = await rolesEffectifs(actor.sub, actor.role);
  if (ROLES_GLOBAUX.some((r) => roles.has(r))) return {};
  if (ROLES_AGENCE.some((r) => roles.has(r))) {
    return actor.agenceId ? { agenceId: actor.agenceId } : { id: -1 };
  }
  // Chargé de clientèle seul : uniquement les dossiers qu'il a montés.
  return { monteParId: actor.sub };
}

/** Charge une demande si elle est dans le périmètre de l'acteur, sinon 404. */
export async function demandeVisible<I extends Prisma.DemandeCreditInclude>(
  actor: JwtPayload,
  id: number,
  include?: I,
) {
  const d = await prisma.demandeCredit.findFirst({
    where: { id, ...(await perimetre(actor)) },
    include: include as I,
  });
  if (!d) throw new ErreurMetier('Demande de crédit introuvable', 404);
  return d as typeof d & { id: number; reference: string; statut: StatutDemandeCredit; clientId: number; montantDemande: Prisma.Decimal };
}

// ─────────────────────────────────────────────────────────────────────────────
// Références et paramétrage
// ─────────────────────────────────────────────────────────────────────────────

async function prochaineReference(prefixe: 'CR' | 'CT', table: 'demande' | 'contrat'): Promise<string> {
  const annee = new Date().getFullYear();
  const motif = `${prefixe}-${annee}-`;
  const derniere = table === 'demande'
    ? await prisma.demandeCredit.findFirst({ where: { reference: { startsWith: motif } }, orderBy: { reference: 'desc' }, select: { reference: true } })
    : await prisma.contratCredit.findFirst({ where: { numero: { startsWith: motif } }, orderBy: { numero: 'desc' }, select: { numero: true } });
  const ref = derniere ? ('reference' in derniere ? derniere.reference : derniere.numero) : null;
  const seq = ref ? parseInt(ref.split('-')[2], 10) + 1 : 1;
  return `${motif}${String(seq).padStart(5, '0')}`;
}

/** Paramétrage en vigueur d'un produit à une date donnée. */
export async function parametrageEnVigueur(produitId: number, date = new Date()) {
  return prisma.parametrageProduit.findFirst({
    where: { produitId, dateEffet: { lte: date }, OR: [{ dateFin: null }, { dateFin: { gte: date } }] },
    orderBy: { dateEffet: 'desc' },
  });
}

function fraisDeDossier(param: { fraisDossier: Prisma.Decimal | null; fraisDossierPct: Prisma.Decimal | null } | null, montant: number): number {
  if (!param) return 0;
  const fixe = Number(param.fraisDossier ?? 0);
  const pct = Number(param.fraisDossierPct ?? 0);
  return arrondi(fixe + (montant * pct) / 100);
}

/** Retourne les motifs d'inéligibilité ; liste vide = éligible. */
function verifierEligibilite(
  param: Awaited<ReturnType<typeof parametrageEnVigueur>>,
  client: { dateNaissance: Date | null; ancienneteActiviteMois: number | null },
  montant: number,
  dureeMois: number,
): string[] {
  if (!param) return ['Aucun paramétrage financier en vigueur pour ce produit.'];
  const motifs: string[] = [];
  if (param.montantMin && montant < Number(param.montantMin)) motifs.push(`Montant inférieur au minimum du produit (${Number(param.montantMin)}).`);
  if (param.montantMax && montant > Number(param.montantMax)) motifs.push(`Montant supérieur au maximum du produit (${Number(param.montantMax)}).`);
  if (param.dureeMinMois && dureeMois < param.dureeMinMois) motifs.push(`Durée inférieure au minimum du produit (${param.dureeMinMois} mois).`);
  if (param.dureeMaxMois && dureeMois > param.dureeMaxMois) motifs.push(`Durée supérieure au maximum du produit (${param.dureeMaxMois} mois).`);
  if (client.dateNaissance && (param.ageMin || param.ageMax)) {
    const age = Math.floor((Date.now() - client.dateNaissance.getTime()) / (365.25 * 24 * 3600 * 1000));
    if (param.ageMin && age < param.ageMin) motifs.push(`Âge inférieur au minimum requis (${param.ageMin} ans).`);
    if (param.ageMax && age > param.ageMax) motifs.push(`Âge supérieur au maximum autorisé (${param.ageMax} ans).`);
  }
  if (param.ancienneteActiviteMinMois && (client.ancienneteActiviteMois ?? 0) < param.ancienneteActiviteMinMois) {
    motifs.push(`Ancienneté d'activité inférieure au minimum requis (${param.ancienneteActiviteMinMois} mois).`);
  }
  return motifs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecture
// ─────────────────────────────────────────────────────────────────────────────

const inclureListe = {
  client: { select: { id: true, nom: true, prenom: true, typePersonne: true } },
  produit: { select: { id: true, nom: true } },
  agence: { select: { id: true, nom: true } },
  montePar: { select: { id: true, prenom: true, nom: true } },
} as const;

export async function lister(actor: JwtPayload, query: Record<string, unknown>) {
  const { skip, take, page, perPage } = parsePagination(query);
  const where: Prisma.DemandeCreditWhereInput = { ...(await perimetre(actor)) };
  if (query.statut) where.statut = query.statut as StatutDemandeCredit;
  if (query.client_id) where.clientId = parseInt(String(query.client_id), 10);
  if (query.agence_id) where.agenceId = parseInt(String(query.agence_id), 10);
  if (query.produit_id) where.produitId = parseInt(String(query.produit_id), 10);
  if (query.search) {
    const s = String(query.search);
    where.OR = [
      { reference: { contains: s, mode: 'insensitive' } },
      { client: { nom: { contains: s, mode: 'insensitive' } } },
      { client: { prenom: { contains: s, mode: 'insensitive' } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.demandeCredit.findMany({ where, include: inclureListe, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.demandeCredit.count({ where }),
  ]);
  return { items, meta: paginationMeta(page, perPage, total) };
}

export async function obtenir(actor: JwtPayload, id: number) {
  await demandeVisible(actor, id);
  await marquerRetards(id);
  const [demande, actes] = await Promise.all([
    prisma.demandeCredit.findUniqueOrThrow({
      where: { id },
      include: {
        client: true,
        produit: { select: { id: true, nom: true, type: true } },
        parametrage: true,
        agence: { select: { id: true, nom: true } },
        dossierKyc: { select: { id: true, reference: true, statut: true, niveauRisque: true } },
        montePar: { select: { id: true, prenom: true, nom: true } },
        analysePar: { select: { id: true, prenom: true, nom: true } },
        decidePar: { select: { id: true, prenom: true, nom: true } },
        garanties: true,
        garants: true,
        visites: { include: { visitePar: { select: { id: true, prenom: true, nom: true } }, photos: true }, orderBy: { dateVisite: 'desc' } },
        decisions: { include: { decidePar: { select: { id: true, prenom: true, nom: true } } }, orderBy: { createdAt: 'desc' } },
        contrat: true,
        echeances: { orderBy: { numero: 'asc' } },
        avenants: { orderBy: { createdAt: 'desc' } },
        piecesJointes: { where: { archiveAt: null } },
      },
    }),
    prisma.acteWorkflow.findMany({
      where: { entiteType: 'demande', entiteId: id },
      orderBy: { createdAt: 'asc' },
      include: { acteur: { select: { id: true, prenom: true, nom: true } } },
    }),
  ]);
  return { ...demande, actes, instance_requise: await instanceRequise(Number(demande.montantAccorde ?? demande.montantDemande)) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulation et montage
// ─────────────────────────────────────────────────────────────────────────────

export interface CorpsSimulation {
  produit_id: number;
  montant: number;
  duree_mois: number;
  periodicite: PeriodiciteEcheance;
  differe_mois?: number;
  client_id?: number;
}

export async function simuler(corps: CorpsSimulation) {
  const param = await parametrageEnVigueur(corps.produit_id);
  if (!param || param.tauxInteretAnnuel === null) {
    throw new ErreurMetier("Aucun taux n'est paramétré pour ce produit : la simulation est impossible.", 422);
  }
  const mode: ModeAmortissement = param.modeAmortissement ?? 'constant';
  const parametres = {
    montant: corps.montant,
    tauxAnnuel: Number(param.tauxInteretAnnuel),
    dureeMois: corps.duree_mois,
    periodicite: corps.periodicite,
    mode,
    differeMois: corps.differe_mois ?? 0,
    fraisDossier: fraisDeDossier(param, corps.montant),
    dateDebut: new Date(),
  };
  const erreurs = validerParametres(parametres);
  if (erreurs.length > 0) throw new ErreurMetier(erreurs.join(' '), 422);

  const client = corps.client_id
    ? await prisma.client.findUnique({ where: { id: corps.client_id }, select: { dateNaissance: true, ancienneteActiviteMois: true } })
    : null;
  const motifs = verifierEligibilite(param, client ?? { dateNaissance: null, ancienneteActiviteMois: null }, corps.montant, corps.duree_mois);
  // Sans client connu, âge et ancienneté ne sont pas évaluables : on ne les signale pas à tort.
  const eligibilite = client ? motifs : motifs.filter((m) => !/Âge|Ancienneté/.test(m));

  const echeancier = genererEcheancier(parametres);
  return {
    taux_annuel: parametres.tauxAnnuel,
    mode_amortissement: mode,
    frais_dossier: parametres.fraisDossier,
    eligible: eligibilite.length === 0,
    motifs_ineligibilite: eligibilite,
    ...echeancier,
  };
}

export interface CorpsDemande {
  client_id: number;
  produit_id: number;
  type_credit: TypeCredit;
  montant_demande: number;
  duree_mois: number;
  periodicite: PeriodiciteEcheance;
  differe_mois?: number;
  objet: string;
  latitude?: number | null;
  longitude?: number | null;
}

export async function creer(actor: JwtPayload, corps: CorpsDemande) {
  const client = await prisma.client.findUnique({ where: { id: corps.client_id } });
  if (!client) throw new ErreurMetier('Client introuvable', 404);

  const roles = await rolesEffectifs(actor.sub, actor.role);
  const global = ROLES_GLOBAUX.some((r) => roles.has(r));
  if (!global && actor.agenceId && client.agenceId !== actor.agenceId) {
    throw new ErreurMetier("Ce client appartient à une autre agence.", 403);
  }
  if (client.statut === 'blackliste') throw new ErreurMetier('Ce client est blacklisté : aucun crédit ne peut être monté.', 422);

  const produit = await prisma.produit.findUnique({ where: { id: corps.produit_id } });
  if (!produit || !produit.actif) throw new ErreurMetier('Produit introuvable ou inactif', 404);
  if (produit.type !== 'credit') throw new ErreurMetier("Ce produit n'est pas un produit de crédit.", 422);

  const param = await parametrageEnVigueur(produit.id);
  if (!param || param.tauxInteretAnnuel === null) {
    throw new ErreurMetier("Aucun paramétrage financier en vigueur pour ce produit. L'administrateur fonctionnel doit le renseigner.", 422);
  }
  const erreurs = validerParametres({
    montant: corps.montant_demande, tauxAnnuel: Number(param.tauxInteretAnnuel), dureeMois: corps.duree_mois,
    periodicite: corps.periodicite, mode: param.modeAmortissement ?? 'constant', differeMois: corps.differe_mois ?? 0, dateDebut: new Date(),
  });
  if (erreurs.length > 0) throw new ErreurMetier(erreurs.join(' '), 422);

  const kyc = await prisma.dossierKyc.findFirst({
    where: { clientId: client.id, statut: 'valide' },
    orderBy: { valideAt: 'desc' },
    select: { id: true },
  });

  const reference = await prochaineReference('CR', 'demande');
  const demande = await prisma.$transaction(async (tx) => {
    const d = await tx.demandeCredit.create({
      data: {
        reference,
        clientId: client.id,
        produitId: produit.id,
        parametrageId: param.id,
        dossierKycId: kyc?.id ?? null,
        agenceId: client.agenceId,
        zoneId: client.zoneId,
        typeCredit: corps.type_credit,
        montantDemande: corps.montant_demande,
        dureeMois: corps.duree_mois,
        periodicite: corps.periodicite,
        differeMois: corps.differe_mois ?? 0,
        objet: corps.objet,
        tauxApplique: param.tauxInteretAnnuel,
        latitude: corps.latitude ?? null,
        longitude: corps.longitude ?? null,
        monteParId: actor.sub,
      },
    });
    await consignerActe('demande', d.id, 'montage', actor.sub, undefined, tx);
    return d;
  });

  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'credit', action: 'CREATE_DEMANDE', entiteType: 'demande_credit', entiteId: demande.id,
    description: `Montage de la demande ${reference} (${corps.montant_demande})`, impact: '+1 demande',
  });
  return demande;
}

export async function modifier(actor: JwtPayload, id: number, corps: Partial<CorpsDemande>) {
  const d = await demandeVisible(actor, id);
  if (d.statut !== 'brouillon') throw new ErreurMetier('Seule une demande en brouillon peut être modifiée.', 409);
  const data: Prisma.DemandeCreditUpdateInput = {};
  if (corps.type_credit) data.typeCredit = corps.type_credit;
  if (corps.montant_demande !== undefined) data.montantDemande = corps.montant_demande;
  if (corps.duree_mois !== undefined) data.dureeMois = corps.duree_mois;
  if (corps.periodicite) data.periodicite = corps.periodicite;
  if (corps.differe_mois !== undefined) data.differeMois = corps.differe_mois;
  if (corps.objet !== undefined) data.objet = corps.objet;
  if (corps.latitude !== undefined) data.latitude = corps.latitude;
  if (corps.longitude !== undefined) data.longitude = corps.longitude;
  const maj = await prisma.demandeCredit.update({ where: { id }, data });
  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'credit', action: 'UPDATE_DEMANDE', entiteType: 'demande_credit', entiteId: id, description: `Modification de la demande ${d.reference}`,
  });
  return maj;
}

export async function soumettre(actor: JwtPayload, id: number) {
  const d = await demandeVisible(actor, id, { client: true, parametrage: true });
  if (d.statut !== 'brouillon') throw new ErreurMetier('Cette demande a déjà été soumise.', 409);
  const dem = d as any;

  const motifs = verifierEligibilite(
    dem.parametrage, dem.client, Number(dem.montantDemande), dem.dureeMois,
  );
  if (motifs.length > 0) throw new ErreurMetier(`Demande non éligible : ${motifs.join(' ')}`, 422);

  const kyc = await prisma.dossierKyc.findFirst({
    where: { clientId: dem.clientId, statut: 'valide' },
    orderBy: { valideAt: 'desc' },
    select: { id: true },
  });
  const statut: StatutDemandeCredit = kyc ? 'kyc_valide' : 'kyc_en_cours';

  await prisma.$transaction(async (tx) => {
    await tx.demandeCredit.update({
      where: { id },
      data: { statut, dossierKycId: kyc?.id ?? dem.dossierKycId, dateSoumission: new Date() },
    });
    await consignerActe('demande', id, 'soumission', actor.sub, undefined, tx);
  });

  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'credit', action: 'SUBMIT_DEMANDE', entiteType: 'demande_credit', entiteId: id,
    description: `Soumission de ${d.reference} : ${kyc ? 'KYC déjà validé' : 'en attente de validation KYC'}`,
  });
  return { statut };
}

export async function annuler(actor: JwtPayload, id: number, motif: string) {
  const d = await demandeVisible(actor, id);
  if (!ETATS_EDITABLES.includes(d.statut)) throw new ErreurMetier("Ce dossier n'est plus annulable.", 409);
  await prisma.$transaction(async (tx) => {
    await tx.demandeCredit.update({ where: { id }, data: { statut: 'annulee', motifDecision: motif } });
    await consignerActe('demande', id, 'annulation', actor.sub, motif, tx);
  });
  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'credit', action: 'CANCEL_DEMANDE', entiteType: 'demande_credit', entiteId: id, description: `Annulation de ${d.reference} : ${motif}`,
  });
  return { statut: 'annulee' };
}

/**
 * Appelée à la validation d'un KYC : les demandes du client qui attendaient ce
 * contrôle peuvent alors passer à l'analyse.
 */
export async function debloquerDemandesEnAttenteKyc(clientId: number, dossierKycId: number) {
  await prisma.demandeCredit.updateMany({
    where: { clientId, statut: 'kyc_en_cours' },
    data: { statut: 'kyc_valide', dossierKycId },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Garanties, garants, visites
// ─────────────────────────────────────────────────────────────────────────────

async function demandeEditable(actor: JwtPayload, id: number) {
  const d = await demandeVisible(actor, id);
  if (!ETATS_EDITABLES.includes(d.statut)) {
    throw new ErreurMetier(`Le dossier est au statut « ${d.statut} » : il n'est plus modifiable.`, 409);
  }
  return d;
}

export async function ajouterGarantie(actor: JwtPayload, id: number, c: { type: TypeGarantie; description: string; valeur_estimee: number; valeur_retenue?: number; reference?: string }) {
  await demandeEditable(actor, id);
  const decotes = await parametre<Record<string, number>>('credit.decote_garanties');
  const retenue = c.valeur_retenue ?? arrondi(c.valeur_estimee * (1 - Number(decotes[c.type] ?? 0.5)));
  return prisma.garantie.create({
    data: { demandeId: id, type: c.type, description: c.description, valeurEstimee: c.valeur_estimee, valeurRetenue: retenue, reference: c.reference ?? null },
  });
}

export async function supprimerGarantie(actor: JwtPayload, id: number, garantieId: number) {
  await demandeEditable(actor, id);
  await prisma.garantie.deleteMany({ where: { id: garantieId, demandeId: id } });
}

export async function ajouterGarant(actor: JwtPayload, id: number, c: { nom: string; prenom?: string; telephone: string; numero_cni?: string; profession?: string; revenu_mensuel?: number; lien_parente?: string; adresse?: string }) {
  await demandeEditable(actor, id);
  return prisma.garant.create({
    data: {
      demandeId: id, nom: c.nom, prenom: c.prenom ?? null, telephone: c.telephone, numeroCni: c.numero_cni ?? null,
      profession: c.profession ?? null, revenuMensuel: c.revenu_mensuel ?? null, lienParente: c.lien_parente ?? null, adresse: c.adresse ?? null,
    },
  });
}

export async function supprimerGarant(actor: JwtPayload, id: number, garantId: number) {
  await demandeEditable(actor, id);
  await prisma.garant.deleteMany({ where: { id: garantId, demandeId: id } });
}

export async function enregistrerVisite(
  actor: JwtPayload, id: number,
  c: { date_visite: string; compte_rendu: string; latitude?: number; longitude?: number },
  photos: Express.Multer.File[],
) {
  await demandeEditable(actor, id);
  return prisma.$transaction(async (tx) => {
    const v = await tx.visiteTerrain.create({
      data: {
        demandeId: id, visiteParId: actor.sub, dateVisite: new Date(c.date_visite), compteRendu: c.compte_rendu,
        latitude: c.latitude ?? null, longitude: c.longitude ?? null,
      },
    });
    for (const f of photos) {
      await tx.pieceJointe.create({
        data: {
          intitule: `Visite du ${new Date(c.date_visite).toLocaleDateString('fr-FR')}`, nomFichier: f.originalname, typeMime: f.mimetype,
          taille: f.size, url: `/uploads/${f.filename}`, categorie: 'photo_visite', visiteId: v.id, demandeCreditId: id,
        },
      });
    }
    return tx.visiteTerrain.findUniqueOrThrow({ where: { id: v.id }, include: { photos: true } });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Décision
// ─────────────────────────────────────────────────────────────────────────────

export interface CorpsDecision {
  sens: SensDecision;
  montant_accorde?: number;
  duree_accordee_mois?: number;
  taux_accorde?: number;
  conditions?: string;
  motif?: string;
}

export async function decider(actor: JwtPayload, id: number, c: CorpsDecision) {
  const d = await demandeVisible(actor, id);
  if (d.statut !== 'comite_en_attente') throw new ErreurMetier("Ce dossier n'est pas en attente de décision.", 409);

  const droits = await droitsEffectifs(actor.sub, actor.role);
  if (c.sens === 'favorable' && !droits.has('credit:APPROVE')) throw new ErreurMetier("Vous n'avez pas le droit d'approuver un crédit.", 403);
  if (c.sens !== 'favorable' && !droits.has('credit:REJECT') && !droits.has('credit:APPROVE')) {
    throw new ErreurMetier("Vous n'avez pas le droit de rejeter ou d'ajourner un crédit.", 403);
  }
  if (c.sens !== 'favorable' && !c.motif?.trim()) throw new ErreurMetier('Un motif est obligatoire pour un rejet ou un ajournement.', 422);

  // Séparation des fonctions : ni le monteur ni l'analyste ne décident.
  await verifierSeparation('demande', id, 'decision', actor.sub);

  const montant = c.montant_accorde ?? Number(d.montantDemande);
  const instance = await instanceRequise(montant);

  if (c.sens === 'favorable') {
    const roles = await rolesEffectifs(actor.sub, actor.role);
    if (!DECIDEURS[instance].some((r) => roles.has(r))) {
      throw new ErreurMetier(
        `Un montant de ${montant} relève de l'instance « ${instance} » (délégations : ${DECIDEURS[instance].join(', ')}).`, 403,
      );
    }
    if (montant > Number(d.montantDemande)) throw new ErreurMetier('Le montant accordé ne peut pas dépasser le montant demandé.', 422);
  }

  const brut = d as any;
  await prisma.$transaction(async (tx) => {
    await tx.decisionCredit.create({
      data: {
        demandeId: id, sens: c.sens, instance, decideParId: actor.sub, conditions: c.conditions ?? null, motif: c.motif ?? null,
        montantAccorde: c.sens === 'favorable' ? montant : null,
        dureeAccordeeMois: c.sens === 'favorable' ? (c.duree_accordee_mois ?? brut.dureeMois) : null,
        tauxAccorde: c.sens === 'favorable' ? (c.taux_accorde ?? null) : null,
      },
    });
    const statut: StatutDemandeCredit = c.sens === 'favorable' ? 'approuvee' : c.sens === 'defavorable' ? 'rejetee' : 'analyse_en_cours';
    await tx.demandeCredit.update({
      where: { id },
      data: {
        statut, decideParId: actor.sub, dateDecision: new Date(), motifDecision: c.motif ?? null,
        ...(c.sens === 'favorable' && {
          montantAccorde: montant,
          dureeAccordeeMois: c.duree_accordee_mois ?? brut.dureeMois,
          ...(c.taux_accorde !== undefined && { tauxApplique: c.taux_accorde }),
        }),
      },
    });
    await consignerActe('demande', id, 'decision', actor.sub, `${c.sens}${c.motif ? ` : ${c.motif}` : ''}`, tx);
  });

  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'credit', action: 'DECISION_CREDIT', entiteType: 'demande_credit', entiteId: id,
    description: `Décision ${c.sens} sur ${d.reference} (instance ${instance})`,
  });
  await archiverSansBloquer('demande_credit', id, actor.sub, `Décision ${c.sens}`);
  void emettre('credit.decide', { entiteType: 'demande_credit', entiteId: id, agenceId: d.agenceId as number, acteurId: actor.sub, donnees: { reference: d.reference, client: '', decision: c.sens, monteParId: (brut as { monteParId: number }).monteParId, lien: `/dashboard/credits/${id}` } });
  return { statut: c.sens === 'favorable' ? 'approuvee' : c.sens === 'defavorable' ? 'rejetee' : 'analyse_en_cours', instance };
}

// ─────────────────────────────────────────────────────────────────────────────
// Contrat, décaissement, échéancier
// ─────────────────────────────────────────────────────────────────────────────

export async function editerContrat(actor: JwtPayload, id: number) {
  const d = await demandeVisible(actor, id, { parametrage: true });
  if (d.statut !== 'approuvee') throw new ErreurMetier("Le contrat ne peut être édité que pour un crédit approuvé.", 409);
  const dem = d as any;
  const montant = Number(dem.montantAccorde);
  const numero = await prochaineReference('CT', 'contrat');

  await prisma.$transaction(async (tx) => {
    await tx.contratCredit.create({
      data: {
        demandeId: id, numero, montant, taux: dem.tauxApplique ?? dem.parametrage?.tauxInteretAnnuel ?? 0,
        dureeMois: dem.dureeAccordeeMois ?? dem.dureeMois, fraisDossier: fraisDeDossier(dem.parametrage, montant),
      },
    });
    await tx.demandeCredit.update({ where: { id }, data: { statut: 'contrat_edite' } });
    await consignerActe('demande', id, 'contrat', actor.sub, numero, tx);
  });
  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'credit', action: 'EDIT_CONTRAT', entiteType: 'demande_credit', entiteId: id, description: `Contrat ${numero} édité pour ${d.reference}`,
  });
  return prisma.contratCredit.findUniqueOrThrow({ where: { demandeId: id } });
}

export async function signerContrat(actor: JwtPayload, id: number) {
  const d = await demandeVisible(actor, id, { contrat: true });
  if (d.statut !== 'contrat_edite' || !(d as any).contrat) throw new ErreurMetier("Aucun contrat en attente de signature.", 409);
  const c = await prisma.contratCredit.update({ where: { demandeId: id }, data: { signeParClient: true, dateSignature: new Date() } });
  await consignerActe('demande', id, 'signature_contrat', actor.sub);
  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'credit', action: 'SIGN_CONTRAT', entiteType: 'demande_credit', entiteId: id, description: `Contrat de ${d.reference} signé`,
  });
  return c;
}

async function agentDeLActeur(utilisateurId: number) {
  return prisma.agent.findUnique({ where: { utilisateurId }, select: { id: true } });
}

export async function decaisser(
  actor: JwtPayload, id: number,
  c: { mode: ModeReglement; compte_id?: number; reference?: string; deduire_frais?: boolean },
) {
  const d = await demandeVisible(actor, id, { contrat: true, parametrage: true, client: true });
  const dem = d as any;
  if (d.statut !== 'contrat_edite' || !dem.contrat) throw new ErreurMetier("Le crédit n'est pas prêt à être décaissé.", 409);
  if (!dem.contrat.signeParClient) throw new ErreurMetier('Le contrat doit être signé avant le décaissement.', 422);

  await verifierSeparation('demande', id, 'decaissement', actor.sub);

  const montant = Number(dem.contrat.montant);
  const frais = Number(dem.contrat.fraisDossier);
  const net = c.deduire_frais === false ? montant : arrondi(montant - frais);

  const mode: ModeAmortissement = dem.parametrage?.modeAmortissement ?? 'constant';
  const echeancier = genererEcheancier({
    montant, tauxAnnuel: Number(dem.contrat.taux), dureeMois: dem.contrat.dureeMois, periodicite: dem.periodicite,
    mode, differeMois: dem.differeMois, fraisDossier: frais, dateDebut: new Date(),
  });

  let agent: { id: number } | null = null;
  if (c.mode === 'compte') {
    if (!c.compte_id) throw new ErreurMetier('Le compte de destination est obligatoire pour un décaissement sur compte.', 422);
    agent = await agentDeLActeur(actor.sub);
    if (!agent) throw new ErreurMetier("Un décaissement sur compte requiert un agent de caisse rattaché à votre profil.", 422);
  }

  await prisma.$transaction(async (tx) => {
    if (c.mode === 'compte' && c.compte_id && agent) {
      const compte = await tx.compteClient.findFirst({ where: { id: c.compte_id, clientId: d.clientId, statut: 'actif' } });
      if (!compte) throw new ErreurMetier("Compte introuvable, inactif ou n'appartenant pas au client.", 422);
      const avant = Number(compte.solde);
      const apres = arrondi(avant + net);
      await tx.compteClient.update({ where: { id: compte.id }, data: { solde: apres } });
      await tx.transaction.create({
        data: { compteId: compte.id, type: 'credit', montant: net, soldeAvant: avant, soldeApres: apres, motif: `Décaissement crédit ${d.reference}`, agentId: agent.id },
      });
    }

    await tx.echeance.createMany({
      data: echeancier.lignes.map((l) => ({
        demandeId: id, numero: l.numero, dateEcheance: l.dateEcheance, capital: l.capital, interet: l.interet,
        montantTotal: l.montantTotal, capitalRestantDu: l.capitalRestantDu,
      })),
    });
    await tx.contratCredit.update({ where: { demandeId: id }, data: { dateDeblocage: new Date() } });
    await tx.demandeCredit.update({
      where: { id },
      data: { statut: 'decaissee', dateDecaissement: new Date(), compteDecaissementId: c.compte_id ?? null },
    });
    await consignerActe('demande', id, 'decaissement', actor.sub, `${c.mode} — net ${net}`, tx);
  });

  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'credit', action: 'DECAISSEMENT', entiteType: 'demande_credit', entiteId: id,
    description: `Décaissement de ${d.reference} : ${montant} (net ${net}) par ${c.mode}`, impact: `${montant}`,
  });
  await archiverSansBloquer('demande_credit', id, actor.sub, 'Décaissement');
  await comptabiliser.decaissement({ demandeId: id, reference: d.reference, montant, fraisDeduits: c.deduire_frais === false ? 0 : frais, mode: c.mode, agenceId: dem.agenceId, acteurId: actor.sub });
  await verifierOperation({ montant, type: 'decaissement', entiteType: 'demande_credit', entiteId: id, agenceId: dem.agenceId, clientId: d.clientId, libelle: `Décaissement ${d.reference}` });
  void emettre('credit.decaisse', { entiteType: 'demande_credit', entiteId: id, agenceId: dem.agenceId, acteurId: actor.sub, donnees: { reference: d.reference, montant: Math.round(montant), premiere_echeance: Math.round(echeancier.premiereEcheance), telephone: dem.client.telephone } });
  return { statut: 'decaissee', montant, frais_dossier: frais, montant_net: net, nb_echeances: echeancier.lignes.length, premiere_echeance: echeancier.premiereEcheance };
}

/** Marque en retard les échéances échues et non soldées. Idempotent, appelé à la lecture. */
export async function marquerRetards(demandeId?: number) {
  const aujourdhui = new Date();
  aujourdhui.setUTCHours(0, 0, 0, 0);
  await prisma.echeance.updateMany({
    where: {
      ...(demandeId ? { demandeId } : {}),
      statut: { in: ['a_echoir', 'partiellement_payee'] },
      dateEcheance: { lt: aujourdhui },
    },
    data: { statut: 'en_retard' },
  });
}

export async function enregistrerRemboursement(
  actor: JwtPayload, id: number,
  c: { montant: number; mode: ModeReglement; compte_id?: number; echeance_id?: number; reference?: string; date_paiement?: string },
) {
  const d = await demandeVisible(actor, id, { client: true });
  if (d.statut !== 'decaissee') throw new ErreurMetier("Aucun remboursement n'est attendu sur ce dossier.", 409);

  await marquerRetards(id);
  const restantes = await prisma.echeance.findMany({
    where: { demandeId: id, statut: { not: 'payee' } },
    orderBy: { numero: 'asc' },
  });
  const du = (e: (typeof restantes)[number]) => arrondi(Number(e.montantTotal) + Number(e.penalite) - Number(e.montantPaye));
  const totalDu = arrondi(restantes.reduce((s, e) => s + du(e), 0));
  if (c.montant > totalDu) throw new ErreurMetier(`Le montant dépasse le solde dû (${totalDu}).`, 422);

  const file = c.echeance_id
    ? [...restantes.filter((e) => e.id === c.echeance_id), ...restantes.filter((e) => e.id !== c.echeance_id)]
    : restantes;

  let agent: { id: number } | null = null;
  if (c.mode === 'compte') {
    if (!c.compte_id) throw new ErreurMetier('Le compte à débiter est obligatoire.', 422);
    agent = await agentDeLActeur(actor.sub);
    if (!agent) throw new ErreurMetier('Un prélèvement sur compte requiert un agent rattaché à votre profil.', 422);
  }

  const date = c.date_paiement ? new Date(c.date_paiement) : new Date();
  const imputations: { echeance: number; montant: number }[] = [];
  const ventilation = { capital: 0, interets: 0, penalites: 0 };
  let remboursementId = 0;

  const cloture = await prisma.$transaction(async (tx) => {
    if (c.mode === 'compte' && c.compte_id && agent) {
      const compte = await tx.compteClient.findFirst({ where: { id: c.compte_id, clientId: d.clientId, statut: 'actif' } });
      if (!compte) throw new ErreurMetier("Compte introuvable, inactif ou n'appartenant pas au client.", 422);
      if (Number(compte.solde) < c.montant) throw new ErreurMetier('Solde du compte insuffisant.', 422);
      const avant = Number(compte.solde);
      const apres = arrondi(avant - c.montant);
      await tx.compteClient.update({ where: { id: compte.id }, data: { solde: apres } });
      await tx.transaction.create({
        data: { compteId: compte.id, type: 'debit', montant: c.montant, soldeAvant: avant, soldeApres: apres, motif: `Remboursement crédit ${d.reference}`, agentId: agent.id },
      });
    }

    let reste = c.montant;
    for (const e of file) {
      if (reste <= 0) break;
      const a_payer = Math.min(reste, du(e));
      const paye = arrondi(Number(e.montantPaye) + a_payer);
      const solde = paye >= arrondi(Number(e.montantTotal) + Number(e.penalite));
      await tx.echeance.update({
        where: { id: e.id },
        data: { montantPaye: paye, statut: solde ? 'payee' : 'partiellement_payee', datePaiement: solde ? date : null },
      });
      imputations.push({ echeance: e.numero, montant: a_payer });
      const v = ventiler({ capital: Number(e.capital), interet: Number(e.interet), frais: Number(e.frais), penalite: Number(e.penalite) }, Number(e.montantPaye), a_payer);
      ventilation.capital += v.capital; ventilation.interets += v.interets; ventilation.penalites += v.penalites;
      reste = arrondi(reste - a_payer);
    }

    const rb = await tx.remboursement.create({
      data: {
        demandeId: id, echeanceId: file[0]?.id ?? null, compteId: c.compte_id ?? null, montant: c.montant, mode: c.mode,
        reference: c.reference ?? null, datePaiement: date, recuParId: actor.sub,
      },
    });
    remboursementId = rb.id;

    const encore = await tx.echeance.count({ where: { demandeId: id, statut: { not: 'payee' } } });
    if (encore === 0) await tx.demandeCredit.update({ where: { id }, data: { statut: 'cloturee' } });
    return encore === 0;
  });

  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'credit', action: 'REMBOURSEMENT', entiteType: 'demande_credit', entiteId: id,
    description: `Remboursement de ${c.montant} sur ${d.reference}`, impact: `${c.montant}`,
  });
  const dem2 = d as any;
  await comptabiliser.remboursement({ id: remboursementId, demandeId: id, reference: d.reference, mode: c.mode, capital: arrondi(ventilation.capital), interets: arrondi(ventilation.interets), penalites: arrondi(ventilation.penalites), agenceId: dem2.agenceId, acteurId: actor.sub, date });
  await verifierOperation({ montant: c.montant, type: 'remboursement', entiteType: 'remboursement', entiteId: remboursementId, agenceId: dem2.agenceId, clientId: d.clientId, libelle: `Remboursement ${d.reference}` });
  void emettre('credit.remboursement', { entiteType: 'demande_credit', entiteId: id, agenceId: dem2.agenceId, acteurId: actor.sub, donnees: { reference: d.reference, montant: Math.round(c.montant), reste: Math.round(arrondi(totalDu - c.montant)), telephone: dem2.client.telephone } });
  // Reflète aussitôt la régularisation (ou l'allégement) sur le dossier de recouvrement éventuel.
  await traiterDemande(id).catch(() => undefined);
  if (cloture) {
    await consignerActe('demande', id, 'cloture', actor.sub);
    await archiverSansBloquer('demande_credit', id, actor.sub, 'Clôture : crédit soldé');
  }
  return { montant: c.montant, remboursement_id: remboursementId, imputations, solde_restant: arrondi(totalDu - c.montant), cloture };
}

export async function listerEcheances(actor: JwtPayload, id: number) {
  await demandeVisible(actor, id);
  await marquerRetards(id);
  const [echeances, remboursements] = await Promise.all([
    prisma.echeance.findMany({ where: { demandeId: id }, orderBy: { numero: 'asc' } }),
    prisma.remboursement.findMany({ where: { demandeId: id }, orderBy: { datePaiement: 'desc' }, include: { recuPar: { select: { id: true, prenom: true, nom: true } } } }),
  ]);
  return { echeances, remboursements };
}

// ─────────────────────────────────────────────────────────────────────────────
// Avenants : restructuration, rééchelonnement, refinancement
// ─────────────────────────────────────────────────────────────────────────────

export async function creerAvenant(
  actor: JwtPayload, id: number,
  c: { type: TypeAvenant; motif: string; nouvelle_duree_mois: number; nouveau_taux?: number; nouveau_montant?: number; date_effet?: string },
) {
  const d = await demandeVisible(actor, id, { parametrage: true, contrat: true });
  const dem = d as any;
  if (d.statut !== 'decaissee') throw new ErreurMetier('Seul un crédit en cours de remboursement peut faire l\'objet d\'un avenant.', 409);

  await marquerRetards(id);
  const echeances = await prisma.echeance.findMany({ where: { demandeId: id }, orderBy: { numero: 'asc' } });
  const payees = echeances.filter((e) => e.statut === 'payee');
  const nonPayees = echeances.filter((e) => e.statut !== 'payee');
  if (nonPayees.length === 0) throw new ErreurMetier('Toutes les échéances sont soldées.', 409);

  // Capital restant dû : celui de la dernière échéance soldée, diminué de la part
  // de capital déjà versée sur une échéance partiellement payée.
  const base = payees.length > 0 ? Number(payees[payees.length - 1].capitalRestantDu) : Number(dem.contrat.montant);
  const partielCapital = nonPayees.reduce((s, e) => s + Math.max(0, Number(e.montantPaye) - Number(e.interet) - Number(e.frais)), 0);
  const restant = arrondi(Math.max(0, base - partielCapital));
  const nouveauMontant = c.nouveau_montant ?? restant;

  if (c.type !== 'refinancement' && nouveauMontant > restant) {
    throw new ErreurMetier("Seul un refinancement peut porter le capital au-delà du capital restant dû.", 422);
  }

  const taux = c.nouveau_taux ?? Number(dem.contrat.taux);
  const mode: ModeAmortissement = dem.parametrage?.modeAmortissement ?? 'constant';
  const dateEffet = c.date_effet ? new Date(c.date_effet) : new Date();
  const nouvelEcheancier = genererEcheancier({
    montant: nouveauMontant, tauxAnnuel: taux, dureeMois: c.nouvelle_duree_mois, periodicite: dem.periodicite, mode, dateDebut: dateEffet,
  });
  const dernierNumero = payees.length > 0 ? payees[payees.length - 1].numero : 0;

  await prisma.$transaction(async (tx) => {
    await tx.avenantCredit.create({
      data: {
        demandeId: id, type: c.type, motif: c.motif, ancienMontant: restant, nouveauMontant,
        ancienneDureeMois: dem.dureeAccordeeMois ?? dem.dureeMois, nouvelleDureeMois: c.nouvelle_duree_mois,
        nouveauTaux: c.nouveau_taux ?? null, dateEffet, valideParId: actor.sub,
      },
    });
    await tx.echeance.deleteMany({ where: { demandeId: id, statut: { not: 'payee' } } });
    await tx.echeance.createMany({
      data: nouvelEcheancier.lignes.map((l) => ({
        demandeId: id, numero: dernierNumero + l.numero, dateEcheance: l.dateEcheance, capital: l.capital, interet: l.interet,
        montantTotal: l.montantTotal, capitalRestantDu: l.capitalRestantDu,
      })),
    });
    await tx.demandeCredit.update({ where: { id }, data: { tauxApplique: taux } });
    await consignerActe('demande', id, `avenant_${c.type}`, actor.sub, c.motif, tx);
  });

  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'credit', action: `AVENANT_${c.type.toUpperCase()}`, entiteType: 'demande_credit', entiteId: id,
    description: `${c.type} de ${d.reference} : capital ${restant} -> ${nouveauMontant}, ${c.nouvelle_duree_mois} mois`,
  });
  await archiverSansBloquer('demande_credit', id, actor.sub, `Avenant ${c.type}`);
  return { type: c.type, capital_restant_du: restant, nouveau_capital: nouveauMontant, nb_echeances: nouvelEcheancier.lignes.length };
}
