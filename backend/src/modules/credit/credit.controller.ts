import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as svc from './credit.service';
import * as analyse from './analyse.service';
import { success, created, noContent } from '../../lib/response';

const id = (req: Request) => parseInt(req.params.id, 10);
const montant = z.coerce.number().nonnegative();
const periodicite = z.enum(['mensuel', 'bimensuel', 'trimestriel', 'semestriel']);

const simulationSchema = z.object({
  produit_id: z.coerce.number().int().positive(),
  montant: z.coerce.number().positive(),
  duree_mois: z.coerce.number().int().positive(),
  periodicite: periodicite.default('mensuel'),
  differe_mois: z.coerce.number().int().nonnegative().optional(),
  client_id: z.coerce.number().int().positive().optional(),
});

const demandeSchema = z.object({
  client_id: z.coerce.number().int().positive(),
  produit_id: z.coerce.number().int().positive(),
  type_credit: z.enum(['individuel', 'solidaire', 'pme', 'agricole']).default('individuel'),
  montant_demande: z.coerce.number().positive(),
  duree_mois: z.coerce.number().int().positive(),
  periodicite: periodicite.default('mensuel'),
  differe_mois: z.coerce.number().int().nonnegative().optional(),
  objet: z.string().min(3, "L'objet du crédit est obligatoire"),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
});

const garantieSchema = z.object({
  type: z.enum(['salaire', 'immobilier', 'materiel', 'nantissement', 'depot_garantie', 'tiers_garant', 'autre']),
  description: z.string().min(1),
  valeur_estimee: z.coerce.number().positive(),
  valeur_retenue: z.coerce.number().nonnegative().optional(),
  reference: z.string().optional(),
});

const garantSchema = z.object({
  nom: z.string().min(1),
  prenom: z.string().optional(),
  telephone: z.string().min(6),
  numero_cni: z.string().optional(),
  profession: z.string().optional(),
  revenu_mensuel: z.coerce.number().nonnegative().optional(),
  lien_parente: z.string().optional(),
  adresse: z.string().optional(),
});

const visiteSchema = z.object({
  date_visite: z.string().min(1),
  compte_rendu: z.string().min(3, 'Le compte rendu est obligatoire'),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

/** Grille d'analyse : tous les montants sont des nombres positifs, 0 par défaut. */
const grilleSchema = z.object({
  moisAnnee: z.string().min(1),
  caHypotheseHaute: montant.default(0),
  caHypotheseBasse: montant.default(0),
  hypotheseRetenue: z.enum(['haute', 'basse', 'moyenne']).default('basse'),
  caCommentaire: z.string().nullish(),
  achatsMarchandises: montant.default(0),
  transportApprovisionnement: montant.default(0),
  loyerLocal: montant.default(0),
  impotsTaxes: montant.default(0),
  salaires: montant.default(0),
  eauElectricite: montant.default(0),
  reparationsMaintenance: montant.default(0),
  autresDepensesActivite: montant.default(0),
  loyerDomicile: montant.default(0),
  autresDepensesFamiliales: montant.default(0),
  echeancesCecaw: montant.default(0),
  echeancesAutresEmf: montant.default(0),
  detteAutresEmf: montant.default(0),
  autresRevenusNets: montant.default(0),
  detailCalculs: z.string().nullish(),
  bilan: z.object({
    localTerrain: montant.default(0),
    equipement: montant.default(0),
    stockMarchandises: montant.default(0),
    creancesClients: montant.default(0),
    liquidites: montant.default(0),
    autresActifs: montant.default(0),
    dettes: montant.default(0),
    actifCommentaire: z.string().nullish(),
    passifCommentaire: z.string().nullish(),
  }),
});

const decisionSchema = z.object({
  sens: z.enum(['favorable', 'defavorable', 'ajourne']),
  montant_accorde: z.coerce.number().positive().optional(),
  duree_accordee_mois: z.coerce.number().int().positive().optional(),
  taux_accorde: z.coerce.number().nonnegative().optional(),
  conditions: z.string().optional(),
  motif: z.string().optional(),
});

const decaissementSchema = z.object({
  mode: z.enum(['especes', 'virement', 'compte', 'cheque']),
  compte_id: z.coerce.number().int().positive().optional(),
  reference: z.string().optional(),
  deduire_frais: z.boolean().optional(),
});

const remboursementSchema = z.object({
  montant: z.coerce.number().positive(),
  mode: z.enum(['especes', 'virement', 'compte', 'cheque']).default('especes'),
  compte_id: z.coerce.number().int().positive().optional(),
  echeance_id: z.coerce.number().int().positive().optional(),
  reference: z.string().optional(),
  date_paiement: z.string().optional(),
});

const avenantSchema = z.object({
  type: z.enum(['restructuration', 'reechelonnement', 'refinancement']),
  motif: z.string().min(5, 'Le motif est obligatoire'),
  nouvelle_duree_mois: z.coerce.number().int().positive(),
  nouveau_taux: z.coerce.number().nonnegative().optional(),
  nouveau_montant: z.coerce.number().positive().optional(),
  date_effet: z.string().optional(),
});

type H = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: H) => async (req: Request, res: Response, next: NextFunction) => {
  try { return await fn(req, res); } catch (e) { return next(e); }
};

export const lister = wrap(async (req, res) => {
  const { items, meta } = await svc.lister(req.user!, req.query as Record<string, unknown>);
  return success(res, items, 200, meta);
});
export const obtenir = wrap(async (req, res) => success(res, await svc.obtenir(req.user!, id(req))));
export const simuler = wrap(async (req, res) => success(res, await svc.simuler(simulationSchema.parse(req.body))));
export const creer = wrap(async (req, res) => created(res, await svc.creer(req.user!, demandeSchema.parse(req.body))));
export const modifier = wrap(async (req, res) => success(res, await svc.modifier(req.user!, id(req), demandeSchema.partial().omit({ client_id: true, produit_id: true }).parse(req.body))));
export const soumettre = wrap(async (req, res) => success(res, await svc.soumettre(req.user!, id(req))));
export const annuler = wrap(async (req, res) => success(res, await svc.annuler(req.user!, id(req), z.object({ motif: z.string().min(3) }).parse(req.body).motif)));

export const ajouterGarantie = wrap(async (req, res) => created(res, await svc.ajouterGarantie(req.user!, id(req), garantieSchema.parse(req.body))));
export const supprimerGarantie = wrap(async (req, res) => { await svc.supprimerGarantie(req.user!, id(req), parseInt(req.params.gid, 10)); return noContent(res); });
export const ajouterGarant = wrap(async (req, res) => created(res, await svc.ajouterGarant(req.user!, id(req), garantSchema.parse(req.body))));
export const supprimerGarant = wrap(async (req, res) => { await svc.supprimerGarant(req.user!, id(req), parseInt(req.params.gid, 10)); return noContent(res); });
export const enregistrerVisite = wrap(async (req, res) =>
  created(res, await svc.enregistrerVisite(req.user!, id(req), visiteSchema.parse(req.body), (req.files as Express.Multer.File[] | undefined) ?? [])));

export const obtenirGrille = wrap(async (req, res) => success(res, await analyse.obtenir(req.user!, id(req))));
export const sauvegarderGrille = wrap(async (req, res) => success(res, await analyse.sauvegarder(req.user!, id(req), grilleSchema.parse(req.body))));
export const apercuGrille = wrap(async (req, res) => {
  const { demande_id, ...corps } = req.body as Record<string, unknown>;
  const demandeId = demande_id ? Number(demande_id) : undefined;
  return success(res, await analyse.apercu(req.user!, grilleSchema.parse(corps), demandeId));
});
export const terminerAnalyse = wrap(async (req, res) => success(res, await analyse.terminer(req.user!, id(req))));

export const decider = wrap(async (req, res) => success(res, await svc.decider(req.user!, id(req), decisionSchema.parse(req.body))));
export const editerContrat = wrap(async (req, res) => created(res, await svc.editerContrat(req.user!, id(req))));
export const signerContrat = wrap(async (req, res) => success(res, await svc.signerContrat(req.user!, id(req))));
export const decaisser = wrap(async (req, res) => success(res, await svc.decaisser(req.user!, id(req), decaissementSchema.parse(req.body))));
export const listerEcheances = wrap(async (req, res) => success(res, await svc.listerEcheances(req.user!, id(req))));
export const enregistrerRemboursement = wrap(async (req, res) => created(res, await svc.enregistrerRemboursement(req.user!, id(req), remboursementSchema.parse(req.body))));
export const creerAvenant = wrap(async (req, res) => created(res, await svc.creerAvenant(req.user!, id(req), avenantSchema.parse(req.body))));
