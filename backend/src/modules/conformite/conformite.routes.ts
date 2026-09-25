import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success, created, noContent } from '../../lib/response';
import { createLog } from '../../lib/logger';
import { ErreurMetier } from '../../lib/rbac';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { analyserAnomalies, rechercherSurveillance } from '../../lib/conformite';

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };
const pid = (req: Request) => parseInt(req.params.id, 10);
const journal = (req: Request, action: string, type: string, id: number, description: string) =>
  createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined, module: 'conformite', action, entiteType: type, entiteId: id, description });

const router = Router();
router.use(authenticate);

// ── Alertes d'anomalies ─────────────────────────────────────────────────────
router.get('/resume', can('conformite:VIEW'), wrap(async (_req, res) => {
  const [parNiveau, parStatut, ouvertesCritiques] = await Promise.all([
    prisma.alerteConformite.groupBy({ by: ['niveau'], where: { statut: { in: ['ouverte', 'en_cours'] } }, _count: true }),
    prisma.alerteConformite.groupBy({ by: ['statut'], _count: true }),
    prisma.alerteConformite.count({ where: { niveau: 'critique', statut: { in: ['ouverte', 'en_cours'] } } }),
  ]);
  return success(res, { par_niveau: Object.fromEntries(parNiveau.map((r) => [r.niveau, r._count])), par_statut: Object.fromEntries(parStatut.map((r) => [r.statut, r._count])), critiques_ouvertes: ouvertesCritiques });
}));

router.get('/alertes', can('conformite:VIEW'), wrap(async (req, res) => {
  const { skip, take, page, perPage } = parsePagination(req.query as Record<string, unknown>);
  const where = { ...(req.query.statut ? { statut: req.query.statut as never } : { statut: { in: ['ouverte', 'en_cours'] as never[] } }), ...(req.query.niveau ? { niveau: req.query.niveau as never } : {}), ...(req.query.code ? { code: String(req.query.code) } : {}) };
  const [items, total] = await Promise.all([
    prisma.alerteConformite.findMany({ where, orderBy: [{ createdAt: 'desc' }], skip, take, include: { agence: { select: { id: true, nom: true } }, traitePar: { select: { prenom: true, nom: true } } } }),
    prisma.alerteConformite.count({ where }),
  ]);
  return success(res, items, 200, paginationMeta(page, perPage, total));
}));

router.post('/alertes/:id/traiter', can('conformite:EXECUTE'), wrap(async (req, res) => {
  const b = z.object({ statut: z.enum(['en_cours', 'traitee', 'fausse_alerte']), commentaire: z.string().optional() }).parse(req.body);
  if (b.statut !== 'en_cours' && (b.commentaire?.trim().length ?? 0) < 5) throw new ErreurMetier('Un commentaire justifiant le traitement est obligatoire.', 422);
  const a = await prisma.alerteConformite.findUnique({ where: { id: pid(req) } });
  if (!a) throw new ErreurMetier('Alerte introuvable', 404);
  if (['traitee', 'fausse_alerte'].includes(a.statut)) throw new ErreurMetier('Cette alerte est déjà clôturée.', 409);
  const maj = await prisma.alerteConformite.update({ where: { id: a.id }, data: { statut: b.statut, commentaireTraitement: b.commentaire ?? a.commentaireTraitement, traiteParId: req.user!.sub, traiteAt: b.statut === 'en_cours' ? null : new Date() } });
  await journal(req, 'TRAITEMENT_ALERTE', 'alerte', a.id, `Alerte « ${a.titre} » : ${b.statut}`);
  return success(res, maj);
}));

router.post('/analyse', can('conformite:EXECUTE'), wrap(async (req, res) => {
  const r = await analyserAnomalies();
  await journal(req, 'ANALYSE_ANOMALIES', 'analyse', 0, `Analyse manuelle : ${JSON.stringify(r)}`);
  return success(res, r);
}));

// ── Listes de surveillance ──────────────────────────────────────────────────
const entreeSchema = z.object({
  nom: z.string().min(1).max(150), prenom: z.string().max(150).nullish(), date_naissance: z.string().nullish(), numero_piece: z.string().max(60).nullish(),
  pays: z.string().max(80).nullish(), categorie: z.enum(['sanction', 'pep', 'interne']).default('interne'), source: z.string().max(150).nullish(), motif: z.string().nullish(), actif: z.boolean().optional(),
});
const versDonnees = (b: z.infer<typeof entreeSchema>) => ({ nom: b.nom, prenom: b.prenom ?? null, dateNaissance: b.date_naissance ? new Date(b.date_naissance) : null, numeroPiece: b.numero_piece ?? null, pays: b.pays ?? null, categorie: b.categorie, source: b.source ?? null, motif: b.motif ?? null, actif: b.actif ?? true });

router.get('/listes', can('conformite:VIEW'), wrap(async (req, res) => {
  const { skip, take, page, perPage } = parsePagination(req.query as Record<string, unknown>);
  const where = { ...(req.query.categorie ? { categorie: req.query.categorie as never } : {}), ...(req.query.search ? { nom: { contains: String(req.query.search), mode: 'insensitive' as const } } : {}) };
  const [items, total] = await Promise.all([prisma.entreeSurveillance.findMany({ where, orderBy: { nom: 'asc' }, skip, take }), prisma.entreeSurveillance.count({ where })]);
  return success(res, items, 200, paginationMeta(page, perPage, total));
}));

router.post('/listes', can('conformite:UPDATE', 'conformite:CONFIGURE'), wrap(async (req, res) => {
  const e = await prisma.entreeSurveillance.create({ data: versDonnees(entreeSchema.parse(req.body)) });
  await journal(req, 'CREATE_ENTREE_SURVEILLANCE', 'liste', e.id, `Entrée « ${e.nom} » ajoutée (${e.categorie})`);
  return created(res, e);
}));

router.put('/listes/:id', can('conformite:UPDATE', 'conformite:CONFIGURE'), wrap(async (req, res) => {
  const e = await prisma.entreeSurveillance.update({ where: { id: pid(req) }, data: versDonnees(entreeSchema.parse(req.body)) });
  await journal(req, 'UPDATE_ENTREE_SURVEILLANCE', 'liste', e.id, `Entrée « ${e.nom} » modifiée`);
  return success(res, e);
}));

router.delete('/listes/:id', can('conformite:UPDATE', 'conformite:CONFIGURE'), wrap(async (req, res) => {
  await prisma.entreeSurveillance.delete({ where: { id: pid(req) } });
  await journal(req, 'DELETE_ENTREE_SURVEILLANCE', 'liste', pid(req), `Entrée #${pid(req)} supprimée`);
  return noContent(res);
}));

/** Import en masse : « nom;prenom;numero_piece;pays;categorie;source ». Les lignes invalides sont rapportées, pas ignorées en silence. */
router.post('/listes/import', can('conformite:UPDATE', 'conformite:CONFIGURE'), wrap(async (req, res) => {
  const { csv } = z.object({ csv: z.string().min(3).max(2_000_000) }).parse(req.body);
  const lignes = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((l, i) => !(i === 0 && /^nom;/i.test(l)));
  const valides: ReturnType<typeof versDonnees>[] = [];
  const erreurs: { ligne: number; message: string }[] = [];
  lignes.forEach((l, i) => {
    const [nom, prenom, piece, pays, categorie, source] = l.split(';').map((x) => x.trim());
    const cat = (categorie || 'interne').toLowerCase();
    if (!nom) { erreurs.push({ ligne: i + 1, message: 'Nom manquant' }); return; }
    if (!['sanction', 'pep', 'interne'].includes(cat)) { erreurs.push({ ligne: i + 1, message: `Catégorie invalide : ${categorie}` }); return; }
    valides.push(versDonnees({ nom, prenom: prenom || null, numero_piece: piece || null, pays: pays || null, categorie: cat as 'sanction', source: source || 'Import', motif: null }));
  });
  if (valides.length > 0) await prisma.entreeSurveillance.createMany({ data: valides });
  await journal(req, 'IMPORT_LISTE_SURVEILLANCE', 'liste', 0, `${valides.length} entrée(s) importée(s), ${erreurs.length} rejet(s)`);
  return success(res, { importees: valides.length, rejetees: erreurs.length, erreurs: erreurs.slice(0, 50) });
}));

/** Vérification ponctuelle d'une personne, hors dossier KYC. */
router.post('/verification', can('conformite:VIEW', 'kyc:EXECUTE'), wrap(async (req, res) => {
  const b = z.object({ nom: z.string().min(1), prenom: z.string().optional(), numero_piece: z.string().optional() }).parse(req.body);
  const correspondances = await rechercherSurveillance({ nom: b.nom, prenom: b.prenom, numeroPiece: b.numero_piece });
  return success(res, { correspondances, conforme: correspondances.length === 0 });
}));

export default router;
