import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can, possede } from '../../middleware/permissions';
import { success, created } from '../../lib/response';
import { createLog } from '../../lib/logger';
import { ErreurMetier } from '../../lib/rbac';
import { executerTache } from '../../lib/planificateur';
import * as svc from './ofacScreening.service';
import { reviser } from './revue.service';
import { etatListes, historiqueSynchronisations, synchroniserListe, synchroniserToutes } from './sanctionsSync.service';
import { depistagePortefeuilleListe } from './sanctionsTaches';

/**
 * API du contrôle de sanctions OFAC, montée sous /conformite :
 *   POST /screenings                      lancer un contrôle (fiche client/prospect, ou identité saisie)
 *   GET  /screenings                      file de revue et historique global (conformité)
 *   GET  /screenings/:id                  résultat d'un contrôle
 *   POST /screenings/:id/revue            décision humaine (agent habilité)
 *   GET  /clients/:clientId/historique    historique des contrôles d'un client
 *   GET  /prospects/:prospectId/historique
 *   GET  /sanctions/etat | /sanctions/synchronisations ; POST /sanctions/synchroniser | /sanctions/depistage-portefeuille
 *        (alias historiques : /ofac/...)
 */

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };
const pid = (req: Request, nom = 'id') => parseInt(req.params[nom], 10);

/** Qui peut lancer un contrôle : la conformité, et toute fonction qui crée ou instruit des clients. */
const LANCER = ['conformite:EXECUTE', 'conformite:VIEW', 'crm:CREATE', 'crm:UPDATE', 'kyc:CREATE', 'kyc:EXECUTE'];

/** Champ facultatif : absent ou vide = « non précisé » (undefined), pour ne jamais écraser ce que la fiche contient déjà. */
const optionnel = z.string().trim().max(200).nullish().transform((v) => v || undefined);
const demandeSchema = z.object({
  client_id: z.coerce.number().int().positive().optional(),
  prospect_id: z.coerce.number().int().positive().optional(),
  type_personne: z.enum(['physique', 'morale']).optional(),
  nom: z.string().trim().min(1).max(200).optional(),
  prenom: optionnel,
  alias: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  date_naissance: z.string().trim().min(8).max(10).nullish().transform((v) => v || undefined),
  pays: optionnel,
  entreprise: optionnel,
  numero_piece: z.string().trim().max(60).nullish().transform((v) => v || undefined),
}).refine((d) => !(d.client_id && d.prospect_id), 'Indiquez un client ou un prospect, pas les deux.')
  .refine((d) => d.client_id || d.prospect_id || d.nom, 'Indiquez un client, un prospect ou au moins un nom à contrôler.');

const revueSchema = z.object({
  decision: z.enum(['faux_positif', 'correspondance_confirmee', 'escalade']),
  commentaire: z.string().trim().min(1, 'Une justification est obligatoire'),
  entree_ids: z.array(z.number().int().positive()).max(25).optional(),
});

const router = Router();
router.use(authenticate);

const voitLeDetail = (req: Request) => possede(req, 'conformite:VIEW');

router.post('/screenings', can(...LANCER), wrap(async (req, res) => {
  const c = await svc.lancer(req.user!, demandeSchema.parse(req.body));
  return created(res, svc.presenter(c, await voitLeDetail(req)));
}));

router.get('/screenings/compteurs', can('conformite:VIEW'), wrap(async (_req, res) => success(res, await svc.compteurs())));

router.get('/screenings', can('conformite:VIEW'), wrap(async (req, res) => {
  const { items, meta } = await svc.lister(req.query as Record<string, unknown>);
  return success(res, items, 200, meta);
}));

router.get('/screenings/:id', can(...LANCER), wrap(async (req, res) => {
  const c = await svc.obtenir(pid(req));
  const detail = await voitLeDetail(req);
  if (!(await svc.accessible(req.user!, c, detail))) throw new ErreurMetier('Contrôle introuvable', 404);
  return success(res, svc.presenter(c, detail));
}));

router.post('/screenings/:id/revue', can('conformite:APPROVE'), wrap(async (req, res) => {
  const c = await reviser(req.user!, pid(req), revueSchema.parse(req.body));
  return success(res, svc.presenter(c, true));
}));

const historique = (cle: 'clientId' | 'prospectId', param: string) => wrap(async (req, res) => {
  const id = pid(req, param);
  const detail = await voitLeDetail(req);
  if (!detail && !(await svc.ficheAccessible(req.user!, { [cle]: id }))) throw new ErreurMetier('Fiche introuvable', 404);
  const items = await svc.historique({ [cle]: id });
  return success(res, items.map((c) => svc.presenter(c, detail)));
});
router.get('/clients/:clientId/historique', can(...LANCER), historique('clientId', 'clientId'));
router.get('/prospects/:prospectId/historique', can(...LANCER), historique('prospectId', 'prospectId'));

// ── Listes de sanctions (copie locale) ───────────────────────────────────────
// Chemins canoniques /sanctions/* ; /ofac/* reste servi (mêmes gestionnaires) pour les clients de la première version.
const CHEMINS = (fin: string) => [`/sanctions/${fin}`, `/ofac/${fin}`];
router.get(CHEMINS('etat'), can('conformite:VIEW'), wrap(async (_req, res) => success(res, await etatListes())));
router.get(CHEMINS('synchronisations'), can('conformite:VIEW'), wrap(async (req, res) => success(res, await historiqueSynchronisations(Number(req.query.limite) || 30))));

router.post(CHEMINS('synchroniser'), can('conformite:CONFIGURE'), wrap(async (req, res) => {
  const { forcer, liste } = z.object({ forcer: z.boolean().optional(), liste: z.enum(['sdn', 'non_sdn', 'onu', 'ue', 'locale']).optional() }).parse(req.body ?? {});
  const resultats = liste
    ? [await synchroniserListe(liste, { declencheur: 'manuel', declencheParId: req.user!.sub, forcer })]
    : await synchroniserToutes({ declencheur: 'manuel', declencheParId: req.user!.sub, forcer });
  return success(res, resultats.map(({ entreesChangees, ...r }) => ({ ...r, nb_changees: entreesChangees.length })));
}));

/** Lance en arrière-plan le contrôle de tout le portefeuille (ou contre une seule liste) ; le suivi se lit dans Paramètres > Système > Tâches. */
router.post(CHEMINS('depistage-portefeuille'), can('conformite:CONFIGURE'), wrap(async (req, res) => {
  const { liste } = z.object({ liste: z.enum(['sdn', 'non_sdn', 'onu', 'ue', 'locale']).optional() }).parse(req.body ?? {});
  if (liste) void depistagePortefeuilleListe(liste).catch((e) => console.error('[sanctions] contrôle du portefeuille', e));
  else void executerTache('sanctions_portefeuille', true);
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, module: 'conformite', action: 'DEPISTAGE_PORTEFEUILLE_SANCTIONS', entiteType: 'portefeuille', entiteId: 0, description: `Contrôle de sanctions de tout le portefeuille lancé${liste ? ` (liste ${liste})` : ''}` });
  return success(res, { lance: true, message: 'Contrôle du portefeuille lancé en arrière-plan. Les correspondances à examiner apparaîtront dans la file de revue.' }, 202);
}));

export default router;
