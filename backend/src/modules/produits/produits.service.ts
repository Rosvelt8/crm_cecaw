import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';

const include = {
  groupe: { select: { id: true, nom: true, couleur: true } },
} as const;

export async function list(groupeId?: string, actif?: string, search?: string) {
  const where: Record<string, unknown> = {};
  if (groupeId) where.groupeId = parseInt(groupeId, 10);
  if (actif !== undefined) where.actif = actif === 'true';
  if (search) where.nom = { contains: search, mode: 'insensitive' };
  return prisma.produit.findMany({ where, include, orderBy: { nom: 'asc' } });
}

export async function getOne(id: number) {
  return prisma.produit.findUniqueOrThrow({ where: { id }, include });
}

export async function create(data: { nom: string; groupe_id: number; description?: string; actif?: boolean }, actor: JwtPayload) {
  const p = await prisma.produit.create({ data: { nom: data.nom, groupeId: data.groupe_id, description: data.description, actif: data.actif ?? true }, include });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'CREATE_PRODUIT', entiteType: 'produit', entiteId: p.id, description: `Création du produit ${p.nom}`, impact: '+1 produit' });
  return p;
}

export async function update(id: number, data: Partial<{ nom: string; groupe_id: number; description: string; actif: boolean }>, actor: JwtPayload) {
  const p = await prisma.produit.update({
    where: { id },
    data: {
      ...(data.nom !== undefined && { nom: data.nom }),
      ...(data.groupe_id !== undefined && { groupeId: data.groupe_id }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.actif !== undefined && { actif: data.actif }),
    },
    include,
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'UPDATE_PRODUIT', entiteType: 'produit', entiteId: id, description: `Modification du produit ${p.nom}` });
  return p;
}

export async function toggle(id: number, actor: JwtPayload) {
  const current = await prisma.produit.findUniqueOrThrow({ where: { id } });
  const p = await prisma.produit.update({ where: { id }, data: { actif: !current.actif } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'UPDATE_PRODUIT', entiteType: 'produit', entiteId: id, description: `Statut produit ${p.nom} → ${p.actif ? 'actif' : 'inactif'}` });
  return { id: p.id, actif: p.actif };
}

export async function remove(id: number, actor: JwtPayload) {
  const p = await prisma.produit.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { comptes: true, objectifs: true } } },
  });
  if (p._count.comptes > 0 || p._count.objectifs > 0) throw Object.assign(new Error('Impossible de supprimer : produit utilisé dans des comptes ou objectifs'), { status: 409 });
  await prisma.produit.delete({ where: { id } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'DELETE_PRODUIT', entiteType: 'produit', entiteId: id, description: `Suppression du produit ${p.nom}` });
}
