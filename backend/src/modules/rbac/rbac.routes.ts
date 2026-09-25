import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success } from '../../lib/response';
import { createLog } from '../../lib/logger';
import { ErreurMetier, droitsEffectifs, rolesEffectifs, viderCacheDroits } from '../../lib/rbac';

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };

const log = (req: Request, action: string, type: string, id: number, description: string) =>
  createLog({
    utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined,
    module: 'securite', action, entiteType: type, entiteId: id, description,
  });

const router = Router();
router.use(authenticate);

/** Droits et rôles de l'utilisateur connecté : le frontend s'en sert pour bâtir menus et boutons. */
router.get('/me', wrap(async (req, res) => {
  const [droits, roles] = await Promise.all([
    droitsEffectifs(req.user!.sub, req.user!.role),
    rolesEffectifs(req.user!.sub, req.user!.role),
  ]);
  return success(res, { droits: [...droits].sort(), roles: [...roles].sort() });
}));

router.get('/roles', can('securite:VIEW', 'socle:VIEW'), wrap(async (_req, res) => {
  const roles = await prisma.role.findMany({
    orderBy: { code: 'asc' },
    include: { permissions: { include: { permission: { select: { code: true } } } }, _count: { select: { utilisateurs: true } } },
  });
  return success(res, roles.map((r) => ({
    id: r.id, code: r.code, nom: r.nom, description: r.description, systeme: r.systeme, actif: r.actif,
    nb_utilisateurs: r._count.utilisateurs, droits: r.permissions.map((p) => p.permission.code).sort(),
  })));
}));

router.get('/permissions', can('securite:VIEW', 'socle:VIEW'), wrap(async (_req, res) =>
  success(res, await prisma.permission.findMany({ orderBy: [{ domaine: 'asc' }, { verbe: 'asc' }] }))));

router.put('/roles/:id/permissions', can('securite:CONFIGURE'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { codes } = z.object({ codes: z.array(z.string()) }).parse(req.body);
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw new ErreurMetier('Rôle introuvable', 404);

  const perms = await prisma.permission.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
  const inconnus = codes.filter((c) => !perms.some((p) => p.code === c));
  if (inconnus.length > 0) throw new ErreurMetier(`Droits inconnus : ${inconnus.join(', ')}`, 422);

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: id } }),
    prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: id, permissionId: p.id })) }),
  ]);
  viderCacheDroits();
  await log(req, 'UPDATE_ROLE_PERMISSIONS', 'role', id, `Habilitations du rôle ${role.code} : ${perms.length} droit(s)`);
  return success(res, { role: role.code, nb_droits: perms.length });
}));

router.get('/utilisateurs/:id/roles', can('securite:VIEW', 'socle:VIEW'), wrap(async (req, res) => {
  const rows = await prisma.utilisateurRole.findMany({
    where: { utilisateurId: parseInt(req.params.id, 10) }, include: { role: { select: { id: true, code: true, nom: true } } },
  });
  return success(res, rows.map((r) => r.role));
}));

router.put('/utilisateurs/:id/roles', can('securite:CONFIGURE'), wrap(async (req, res) => {
  const utilisateurId = parseInt(req.params.id, 10);
  const { role_codes } = z.object({ role_codes: z.array(z.string()) }).parse(req.body);
  if (utilisateurId === req.user!.sub) throw new ErreurMetier('Vous ne pouvez pas modifier vos propres rôles.', 403);

  const roles = await prisma.role.findMany({ where: { code: { in: role_codes }, actif: true }, select: { id: true, code: true } });
  const inconnus = role_codes.filter((c) => !roles.some((r) => r.code === c));
  if (inconnus.length > 0) throw new ErreurMetier(`Rôles inconnus ou inactifs : ${inconnus.join(', ')}`, 422);

  await prisma.$transaction([
    prisma.utilisateurRole.deleteMany({ where: { utilisateurId } }),
    prisma.utilisateurRole.createMany({ data: roles.map((r) => ({ utilisateurId, roleId: r.id, assigneParId: req.user!.sub })) }),
  ]);
  viderCacheDroits(utilisateurId);
  await log(req, 'ASSIGN_ROLES', 'utilisateur', utilisateurId, `Rôles de l'utilisateur #${utilisateurId} : ${role_codes.join(', ') || 'aucun (repli sur le rôle historique)'}`);
  return success(res, { utilisateur_id: utilisateurId, roles: role_codes });
}));

router.get('/regles-separation', can('conformite:VIEW', 'socle:VIEW'), wrap(async (_req, res) =>
  success(res, await prisma.regleSeparation.findMany({ orderBy: { code: 'asc' } }))));

router.put('/regles-separation/:id', can('conformite:CONFIGURE'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { actif } = z.object({ actif: z.boolean() }).parse(req.body);
  const r = await prisma.regleSeparation.update({ where: { id }, data: { actif } });
  await log(req, 'UPDATE_REGLE_SEPARATION', 'regle_separation', id, `Règle ${r.code} ${actif ? 'activée' : 'désactivée'}`);
  return success(res, r);
}));

export default router;
