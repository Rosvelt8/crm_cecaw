import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success, created, noContent } from '../../lib/response';
import { createLog } from '../../lib/logger';
import { ErreurMetier } from '../../lib/rbac';
import { criteresCibleSchema, resoudreCiblesClient, type CriteresCible } from '../../lib/cibleClient';
import { agenceFilter } from '../clients/clients.service';

/**
 * Forfaits commerciaux (Lot 15, doc "Customer Value Growth" §6) : bundles de produits ciblant un
 * segment de clients (mêmes critères que les campagnes, résolus par `lib/cibleClient.ts`). Le
 * score d'un forfait pour un client donné est la moyenne des appétences (`AppetenceProduit`) sur
 * les produits du forfait qu'il ne détient pas encore ; un client détenant déjà tous les produits
 * du forfait n'est pas une opportunité et n'apparaît pas dans la liste des clients éligibles.
 */

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };
const pid = (req: Request) => parseInt(req.params.id, 10);

const schema = z.object({
  nom: z.string().min(1).max(150),
  description: z.string().optional().nullable(),
  criteres: criteresCibleSchema,
  produit_ids: z.array(z.number().int().positive()).min(1),
  actif: z.boolean().optional(),
});

/** Dédoublonne et vérifie que chaque produit existe et est actif (sinon 422 plutôt qu'une erreur SQL). */
async function produitsValides(ids: number[]): Promise<number[]> {
  const uniques = [...new Set(ids)];
  const trouves = await prisma.produit.findMany({ where: { id: { in: uniques }, actif: true }, select: { id: true } });
  const manquants = uniques.filter((id) => !trouves.some((p) => p.id === id));
  if (manquants.length > 0) throw new ErreurMetier(`Produit(s) introuvable(s) ou inactif(s) : ${manquants.join(', ')}`, 422);
  return uniques;
}

const include = {
  produits: { include: { produit: { select: { id: true, nom: true, groupeId: true, type: true } } } },
} as const;

const router = Router();
router.use(authenticate);

router.get('/', can('produits:VIEW'), wrap(async (_req, res) => {
  const forfaits = await prisma.forfait.findMany({ include, orderBy: { nom: 'asc' } });
  return success(res, forfaits);
}));

router.get('/:id', can('produits:VIEW'), wrap(async (req, res) => {
  const f = await prisma.forfait.findUnique({ where: { id: pid(req) }, include });
  if (!f) throw new ErreurMetier('Forfait introuvable', 404);
  return success(res, f);
}));

router.post('/', can('produits:CONFIGURE'), wrap(async (req, res) => {
  const b = schema.parse(req.body);
  const produitIds = await produitsValides(b.produit_ids);
  const f = await prisma.forfait.create({
    data: {
      nom: b.nom, description: b.description ?? null, criteres: b.criteres as never, actif: b.actif ?? true,
      produits: { create: produitIds.map((produitId) => ({ produitId })) },
    },
    include,
  });
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, module: 'parametres', action: 'CREATE_FORFAIT', entiteType: 'forfait', entiteId: f.id, description: `Forfait « ${f.nom} » créé (${produitIds.length} produit(s))` });
  return created(res, f);
}));

router.put('/:id', can('produits:CONFIGURE'), wrap(async (req, res) => {
  const b = schema.partial().parse(req.body);
  const id = pid(req);
  if (!(await prisma.forfait.findUnique({ where: { id }, select: { id: true } }))) throw new ErreurMetier('Forfait introuvable', 404);
  const produitIds = b.produit_ids ? await produitsValides(b.produit_ids) : null;
  const f = await prisma.$transaction(async (tx) => {
    if (produitIds) {
      await tx.forfaitProduit.deleteMany({ where: { forfaitId: id } });
      await tx.forfaitProduit.createMany({ data: produitIds.map((produitId) => ({ forfaitId: id, produitId })) });
    }
    return tx.forfait.update({
      where: { id },
      data: {
        ...(b.nom !== undefined && { nom: b.nom }),
        ...(b.description !== undefined && { description: b.description }),
        ...(b.criteres !== undefined && { criteres: b.criteres as never }),
        ...(b.actif !== undefined && { actif: b.actif }),
      },
      include,
    });
  });
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, module: 'parametres', action: 'UPDATE_FORFAIT', entiteType: 'forfait', entiteId: f.id, description: `Forfait « ${f.nom} » modifié` });
  return success(res, f);
}));

router.delete('/:id', can('produits:CONFIGURE'), wrap(async (req, res) => {
  const id = pid(req);
  const f = await prisma.forfait.findUnique({ where: { id } });
  if (!f) throw new ErreurMetier('Forfait introuvable', 404);
  await prisma.forfait.delete({ where: { id } });
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, module: 'parametres', action: 'DELETE_FORFAIT', entiteType: 'forfait', entiteId: id, description: `Forfait « ${f.nom} » supprimé` });
  return noContent(res);
}));

router.get('/:id/clients-eligibles', can('crm:VIEW'), wrap(async (req, res) => {
  const forfait = await prisma.forfait.findUnique({ where: { id: pid(req) }, include: { produits: true } });
  if (!forfait) throw new ErreurMetier('Forfait introuvable', 404);
  const produitIds = forfait.produits.map((p) => p.produitId);

  // Le ciblage du forfait est restreint au périmètre de l'acteur, comme toute liste de clients.
  const clients = await prisma.client.findMany({
    where: { AND: [resoudreCiblesClient(forfait.criteres as CriteresCible), (await agenceFilter(req.user!)) as Prisma.ClientWhereInput] },
    select: {
      id: true, nom: true, prenom: true, telephone: true,
      appetences: { where: { produitId: { in: produitIds } }, select: { produitId: true, detenu: true, score: true, produit: { select: { nom: true } } } },
    },
  });

  const opportunites = clients
    .map((c) => {
      const nonDetenus = c.appetences.filter((a) => !a.detenu);
      if (nonDetenus.length === 0) return null; // tous les produits du forfait déjà détenus
      const score = Math.round(nonDetenus.reduce((s, a) => s + a.score, 0) / nonDetenus.length);
      return { client: { id: c.id, nom: c.nom, prenom: c.prenom, telephone: c.telephone }, score_forfait: score, produits_manquants: nonDetenus.map((a) => a.produit.nom) };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null)
    .sort((a, b) => b.score_forfait - a.score_forfait);

  return success(res, opportunites);
}));

export default router;
