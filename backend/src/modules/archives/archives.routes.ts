import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success, created } from '../../lib/response';
import { archiverEntite, verifierArchive, EntiteArchivable } from '../../lib/archivage';
import { ErreurMetier } from '../../lib/rbac';
import { createLog } from '../../lib/logger';
import { demandeVisible } from '../credit/credit.service';

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };

const TYPES = ['demande_credit', 'dossier_kyc'] as const;

/** Vérifie que l'acteur a accès au dossier sous-jacent avant de lui montrer son archive. */
async function autoriserEntite(req: Request, type: string, id: number) {
  if (type === 'demande_credit') await demandeVisible(req.user!, id);
  else if (type !== 'dossier_kyc') throw new ErreurMetier("Type d'entité archivable inconnu", 422);
}

const router = Router();
router.use(authenticate);

router.get('/', can('documentaire:VIEW'), wrap(async (req, res) => {
  const { entite_type, entite_id } = z.object({
    entite_type: z.enum(TYPES), entite_id: z.coerce.number().int().positive(),
  }).parse(req.query);
  await autoriserEntite(req, entite_type, entite_id);
  const items = await prisma.archive.findMany({
    where: { entiteType: entite_type, entiteId: entite_id },
    orderBy: { version: 'desc' },
    select: { id: true, reference: true, version: true, hash: true, motif: true, archiveAt: true, archivePar: { select: { id: true, prenom: true, nom: true } } },
  });
  return success(res, items);
}));

router.post('/', can('documentaire:CREATE'), wrap(async (req, res) => {
  const b = z.object({ entite_type: z.enum(TYPES), entite_id: z.coerce.number().int().positive(), motif: z.string().optional() }).parse(req.body);
  await autoriserEntite(req, b.entite_type, b.entite_id);
  const a = await archiverEntite(b.entite_type as EntiteArchivable, b.entite_id, req.user!.sub, b.motif ?? 'Archivage manuel');
  await createLog({
    utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined,
    module: 'conformite', action: 'ARCHIVE', entiteType: b.entite_type, entiteId: b.entite_id, description: `Archive ${a.reference} v${a.version}`,
  });
  return created(res, { id: a.id, reference: a.reference, version: a.version, hash: a.hash, archive_at: a.archiveAt });
}));

router.get('/:id', can('documentaire:VIEW'), wrap(async (req, res) => {
  const a = await prisma.archive.findUnique({ where: { id: parseInt(req.params.id, 10) } });
  if (!a) throw new ErreurMetier('Archive introuvable', 404);
  await autoriserEntite(req, a.entiteType, a.entiteId);
  return success(res, a);
}));

router.get('/:id/verifier', can('documentaire:VIEW', 'documentaire:AUDIT'), wrap(async (req, res) => {
  const a = await prisma.archive.findUnique({ where: { id: parseInt(req.params.id, 10) }, select: { entiteType: true, entiteId: true } });
  if (!a) throw new ErreurMetier('Archive introuvable', 404);
  await autoriserEntite(req, a.entiteType, a.entiteId);
  return success(res, await verifierArchive(parseInt(req.params.id, 10)));
}));

export default router;
