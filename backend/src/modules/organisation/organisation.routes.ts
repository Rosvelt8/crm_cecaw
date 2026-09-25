import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success, created, noContent } from '../../lib/response';
import { createLog } from '../../lib/logger';
import { ErreurMetier } from '../../lib/rbac';

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };
const pid = (req: Request) => parseInt(req.params.id, 10);
const coord = (max: number) => z.coerce.number().min(-max).max(max).nullish();

const log = (req: Request, action: string, type: string, id: number, description: string) =>
  createLog({
    utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined,
    module: 'organisation', action, entiteType: type, entiteId: id, description,
  });

const institutionSchema = z.object({
  nom: z.string().min(1).max(200), sigle: z.string().max(50).nullish(), description: z.string().nullish(),
  telephone: z.string().max(30).nullish(), email: z.string().email().nullish(), adresse: z.string().nullish(), actif: z.boolean().optional(),
});
const pointSchema = z.object({
  nom: z.string().min(1).max(150), code: z.string().max(20).nullish(), agenceId: z.coerce.number().int().positive(),
  adresse: z.string().nullish(), latitude: coord(90), longitude: coord(180), actif: z.boolean().optional(),
});
const zoneSchema = z.object({
  nom: z.string().min(1).max(150), code: z.string().max(20).nullish(), type: z.enum(['zone', 'secteur']).default('zone'),
  parentId: z.coerce.number().int().positive().nullish(), agenceId: z.coerce.number().int().positive().nullish(),
  geometrie: z.unknown().nullish(), latitude: coord(90), longitude: coord(180),
  population: z.coerce.number().int().nonnegative().nullish(), potentielEstime: z.coerce.number().nonnegative().nullish(), actif: z.boolean().optional(),
});
const marcheSchema = z.object({
  nom: z.string().min(1).max(150), type: z.enum(['grand', 'moyen', 'petit']).default('petit'),
  zoneId: z.coerce.number().int().positive().nullish(), agenceId: z.coerce.number().int().positive().nullish(),
  latitude: coord(90), longitude: coord(180), actif: z.boolean().optional(),
});
const secteurSchema = z.object({ nom: z.string().min(1).max(150), actif: z.boolean().optional() });
const metierSchema = z.object({ nom: z.string().min(1).max(150), secteurId: z.coerce.number().int().positive(), actif: z.boolean().optional() });

/** Un GeoJSON de zone doit être un Polygon ou MultiPolygon aux coordonnées plausibles. */
function verifierGeometrie(g: unknown) {
  if (g == null) return;
  const geo = g as { type?: string; coordinates?: unknown };
  if (geo.type !== 'Polygon' && geo.type !== 'MultiPolygon') throw new ErreurMetier('La géométrie doit être un Polygon ou un MultiPolygon GeoJSON.', 422);
  if (!Array.isArray(geo.coordinates) || geo.coordinates.length === 0) throw new ErreurMetier('La géométrie ne contient aucune coordonnée.', 422);
}

/** Refuse un rattachement qui ferait de la zone son propre ancêtre. */
async function verifierParent(zoneId: number | null, parentId: number | null | undefined) {
  if (!parentId) return;
  if (zoneId !== null && parentId === zoneId) throw new ErreurMetier('Une zone ne peut pas être son propre parent.', 422);
  let courant: number | null = parentId;
  for (let i = 0; i < 20 && courant; i++) {
    const z: { parentId: number | null } | null = await prisma.zone.findUnique({ where: { id: courant }, select: { parentId: true } });
    if (!z) throw new ErreurMetier('Zone parente introuvable.', 404);
    if (zoneId !== null && z.parentId === zoneId) throw new ErreurMetier('Ce rattachement créerait une boucle dans la hiérarchie.', 422);
    courant = z.parentId;
  }
}

const router = Router();
router.use(authenticate);

// ── Institutions ───────────────────────────────────────────────────────────
router.get('/institutions', can('organisation:VIEW'), wrap(async (_req, res) => success(res, await prisma.institution.findMany({ orderBy: { nom: 'asc' } }))));
router.post('/institutions', can('organisation:CREATE'), wrap(async (req, res) => {
  const i = await prisma.institution.create({ data: institutionSchema.parse(req.body) as never });
  await log(req, 'CREATE_INSTITUTION', 'institution', i.id, `Création de l'institution ${i.nom}`);
  return created(res, i);
}));
router.put('/institutions/:id', can('organisation:UPDATE'), wrap(async (req, res) => {
  const i = await prisma.institution.update({ where: { id: pid(req) }, data: institutionSchema.partial().parse(req.body) as never });
  await log(req, 'UPDATE_INSTITUTION', 'institution', i.id, `Modification de l'institution ${i.nom}`);
  return success(res, i);
}));

// ── Points de service ──────────────────────────────────────────────────────
router.get('/points-service', can('organisation:VIEW'), wrap(async (req, res) => {
  const agenceId = req.query.agence_id ? parseInt(String(req.query.agence_id), 10) : undefined;
  return success(res, await prisma.pointService.findMany({ where: { agenceId }, orderBy: { nom: 'asc' }, include: { agence: { select: { id: true, nom: true } } } }));
}));
router.post('/points-service', can('organisation:CREATE'), wrap(async (req, res) => {
  const p = await prisma.pointService.create({ data: pointSchema.parse(req.body) as never });
  await log(req, 'CREATE_POINT_SERVICE', 'point_service', p.id, `Création du point de service ${p.nom}`);
  return created(res, p);
}));
router.put('/points-service/:id', can('organisation:UPDATE'), wrap(async (req, res) => {
  const p = await prisma.pointService.update({ where: { id: pid(req) }, data: pointSchema.partial().parse(req.body) as never });
  await log(req, 'UPDATE_POINT_SERVICE', 'point_service', p.id, `Modification du point de service ${p.nom}`);
  return success(res, p);
}));
router.delete('/points-service/:id', can('organisation:UPDATE'), wrap(async (req, res) => {
  const p = await prisma.pointService.delete({ where: { id: pid(req) } });
  await log(req, 'DELETE_POINT_SERVICE', 'point_service', p.id, `Suppression du point de service ${p.nom}`);
  return noContent(res);
}));

// ── Zones et secteurs ──────────────────────────────────────────────────────
router.get('/zones', can('organisation:VIEW'), wrap(async (req, res) => {
  const agenceId = req.query.agence_id ? parseInt(String(req.query.agence_id), 10) : undefined;
  return success(res, await prisma.zone.findMany({
    where: { agenceId },
    orderBy: [{ type: 'asc' }, { nom: 'asc' }],
    include: {
      agence: { select: { id: true, nom: true } },
      agents: { include: { agent: { select: { id: true, matricule: true, utilisateur: { select: { prenom: true, nom: true } } } } } },
      _count: { select: { clients: true, prospects: true, enfants: true } },
    },
  }));
}));
router.get('/zones/:id', can('organisation:VIEW'), wrap(async (req, res) => {
  const z = await prisma.zone.findUnique({
    where: { id: pid(req) },
    include: { agence: true, parent: true, enfants: true, agents: { include: { agent: { include: { utilisateur: { select: { prenom: true, nom: true } } } } } } },
  });
  if (!z) throw new ErreurMetier('Zone introuvable', 404);
  return success(res, z);
}));
router.post('/zones', can('organisation:CREATE'), wrap(async (req, res) => {
  const b = zoneSchema.parse(req.body);
  verifierGeometrie(b.geometrie);
  await verifierParent(null, b.parentId);
  const zone = await prisma.zone.create({ data: b as never });
  await log(req, 'CREATE_ZONE', 'zone', zone.id, `Création de la ${zone.type} ${zone.nom}`);
  return created(res, zone);
}));
router.put('/zones/:id', can('organisation:UPDATE'), wrap(async (req, res) => {
  const b = zoneSchema.partial().parse(req.body);
  verifierGeometrie(b.geometrie);
  await verifierParent(pid(req), b.parentId);
  const zone = await prisma.zone.update({ where: { id: pid(req) }, data: b as never });
  await log(req, 'UPDATE_ZONE', 'zone', zone.id, `Modification de la ${zone.type} ${zone.nom}`);
  return success(res, zone);
}));
router.delete('/zones/:id', can('organisation:UPDATE'), wrap(async (req, res) => {
  const utilisee = await prisma.zone.findUnique({ where: { id: pid(req) }, select: { _count: { select: { clients: true, prospects: true, enfants: true } } } });
  if (utilisee && (utilisee._count.clients + utilisee._count.prospects + utilisee._count.enfants) > 0) {
    throw new ErreurMetier('Cette zone contient des clients, prospects ou sous-secteurs : réaffectez-les avant de la supprimer.', 409);
  }
  const zone = await prisma.zone.delete({ where: { id: pid(req) } });
  await log(req, 'DELETE_ZONE', 'zone', zone.id, `Suppression de la zone ${zone.nom}`);
  return noContent(res);
}));

// Affectation zone -> agents : remplace l'ensemble des affectations de la zone.
router.put('/zones/:id/agents', can('organisation:UPDATE'), wrap(async (req, res) => {
  const b = z.object({
    agents: z.array(z.object({ agent_id: z.coerce.number().int().positive(), principal: z.boolean().optional() })),
  }).parse(req.body);
  const zoneId = pid(req);
  await prisma.$transaction([
    prisma.zoneAgent.deleteMany({ where: { zoneId } }),
    prisma.zoneAgent.createMany({ data: b.agents.map((a) => ({ zoneId, agentId: a.agent_id, principal: a.principal ?? false })), skipDuplicates: true }),
  ]);
  await log(req, 'ASSIGN_ZONE_AGENTS', 'zone', zoneId, `Affectation de ${b.agents.length} agent(s) à la zone #${zoneId}`);
  return success(res, { zone_id: zoneId, nb_agents: b.agents.length });
}));

// ── Marchés (compléments stratégiques, points 15-16) ──────────────────────
router.get('/marches', can('organisation:VIEW'), wrap(async (req, res) => {
  const agenceId = req.query.agence_id ? parseInt(String(req.query.agence_id), 10) : undefined;
  const zoneId = req.query.zone_id ? parseInt(String(req.query.zone_id), 10) : undefined;
  return success(res, await prisma.marche.findMany({
    where: { agenceId, zoneId },
    orderBy: [{ type: 'asc' }, { nom: 'asc' }],
    include: {
      zone: { select: { id: true, nom: true } }, agence: { select: { id: true, nom: true } },
      agents: { include: { agent: { select: { id: true, matricule: true, utilisateur: { select: { prenom: true, nom: true } } } } } },
      _count: { select: { clients: true, prospects: true } },
    },
  }));
}));
router.get('/marches/:id', can('organisation:VIEW'), wrap(async (req, res) => {
  const m = await prisma.marche.findUnique({
    where: { id: pid(req) },
    include: { zone: true, agence: true, agents: { include: { agent: { include: { utilisateur: { select: { prenom: true, nom: true } } } } } }, _count: { select: { clients: true, prospects: true } } },
  });
  if (!m) throw new ErreurMetier('Marché introuvable', 404);
  return success(res, m);
}));
router.post('/marches', can('organisation:CREATE'), wrap(async (req, res) => {
  const m = await prisma.marche.create({ data: marcheSchema.parse(req.body) as never });
  await log(req, 'CREATE_MARCHE', 'marche', m.id, `Création du marché ${m.nom}`);
  return created(res, m);
}));
router.put('/marches/:id', can('organisation:UPDATE'), wrap(async (req, res) => {
  const m = await prisma.marche.update({ where: { id: pid(req) }, data: marcheSchema.partial().parse(req.body) as never });
  await log(req, 'UPDATE_MARCHE', 'marche', m.id, `Modification du marché ${m.nom}`);
  return success(res, m);
}));
router.delete('/marches/:id', can('organisation:UPDATE'), wrap(async (req, res) => {
  const utilise = await prisma.marche.findUnique({ where: { id: pid(req) }, select: { _count: { select: { clients: true, prospects: true } } } });
  if (utilise && (utilise._count.clients + utilise._count.prospects) > 0) {
    throw new ErreurMetier('Ce marché est rattaché à des clients ou prospects : réaffectez-les avant de le supprimer.', 409);
  }
  const m = await prisma.marche.delete({ where: { id: pid(req) } });
  await log(req, 'DELETE_MARCHE', 'marche', m.id, `Suppression du marché ${m.nom}`);
  return noContent(res);
}));
// Affectation marché -> agents (collecteurs) : remplace l'ensemble des affectations du marché.
router.put('/marches/:id/agents', can('organisation:UPDATE'), wrap(async (req, res) => {
  const b = z.object({ agents: z.array(z.object({ agent_id: z.coerce.number().int().positive(), principal: z.boolean().optional() })) }).parse(req.body);
  const marcheId = pid(req);
  await prisma.$transaction([
    prisma.marcheAgent.deleteMany({ where: { marcheId } }),
    prisma.marcheAgent.createMany({ data: b.agents.map((a) => ({ marcheId, agentId: a.agent_id, principal: a.principal ?? false })), skipDuplicates: true }),
  ]);
  await log(req, 'ASSIGN_MARCHE_AGENTS', 'marche', marcheId, `Affectation de ${b.agents.length} agent(s) au marché #${marcheId}`);
  return success(res, { marche_id: marcheId, nb_agents: b.agents.length });
}));

// ── Référentiel secteurs / métiers (compléments stratégiques, point 8) ────
router.get('/secteurs', can('organisation:VIEW'), wrap(async (_req, res) =>
  success(res, await prisma.secteur.findMany({ orderBy: { nom: 'asc' }, include: { metiers: { where: { actif: true }, orderBy: { nom: 'asc' } } } }))));
router.post('/secteurs', can('organisation:CREATE'), wrap(async (req, res) => {
  const s = await prisma.secteur.create({ data: secteurSchema.parse(req.body) as never });
  await log(req, 'CREATE_SECTEUR', 'secteur', s.id, `Création du secteur ${s.nom}`);
  return created(res, s);
}));
router.put('/secteurs/:id', can('organisation:UPDATE'), wrap(async (req, res) => {
  const s = await prisma.secteur.update({ where: { id: pid(req) }, data: secteurSchema.partial().parse(req.body) as never });
  await log(req, 'UPDATE_SECTEUR', 'secteur', s.id, `Modification du secteur ${s.nom}`);
  return success(res, s);
}));
router.post('/metiers', can('organisation:CREATE'), wrap(async (req, res) => {
  const m = await prisma.metier.create({ data: metierSchema.parse(req.body) as never });
  await log(req, 'CREATE_METIER', 'metier', m.id, `Création du métier ${m.nom}`);
  return created(res, m);
}));
router.put('/metiers/:id', can('organisation:UPDATE'), wrap(async (req, res) => {
  const m = await prisma.metier.update({ where: { id: pid(req) }, data: metierSchema.partial().parse(req.body) as never });
  await log(req, 'UPDATE_METIER', 'metier', m.id, `Modification du métier ${m.nom}`);
  return success(res, m);
}));

export default router;
