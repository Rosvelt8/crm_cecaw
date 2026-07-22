import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';

const include = {
  agence: { select: { id: true, nom: true } },
  responsable: { select: { id: true, prenom: true, nom: true } },
  _count: { select: { membres: true } },
} as const;

export async function list(actor: JwtPayload, agenceId?: string) {
  // Un non-admin ne voit que les équipes de sa propre agence.
  const scopedAgenceId = actor.role !== 'admin' && actor.agenceId ? actor.agenceId : (agenceId ? parseInt(agenceId, 10) : undefined);
  const where = scopedAgenceId ? { agenceId: scopedAgenceId } : {};
  const items = await prisma.equipe.findMany({ where, include, orderBy: { nom: 'asc' } });
  return items.map((e) => ({
    id: e.id, nom: e.nom, agence: e.agence, responsable: e.responsable,
    nb_membres: e._count.membres, created_at: e.createdAt,
  }));
}

export async function getOne(id: number) {
  return prisma.equipe.findUniqueOrThrow({
    where: { id },
    include: {
      agence: { select: { id: true, nom: true } },
      responsable: { select: { id: true, prenom: true, nom: true } },
      membres: { select: { id: true, prenom: true, nom: true, role: true, fonction: true } },
    },
  });
}

export async function create(data: { nom: string; agence_id: number; responsable_id?: number | null }, actor: JwtPayload) {
  const e = await prisma.equipe.create({
    data: { nom: data.nom, agenceId: data.agence_id, responsableId: data.responsable_id },
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'CREATE_EQUIPE', entiteType: 'equipe', entiteId: e.id, description: `Création de l'équipe ${e.nom}`, impact: '+1 équipe' });
  return e;
}

export async function update(id: number, data: Partial<{ nom: string; agence_id: number; responsable_id: number | null }>, actor: JwtPayload) {
  const e = await prisma.equipe.update({
    where: { id },
    data: {
      ...(data.nom !== undefined && { nom: data.nom }),
      ...(data.agence_id !== undefined && { agenceId: data.agence_id }),
      ...(data.responsable_id !== undefined && { responsableId: data.responsable_id }),
    },
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'UPDATE_EQUIPE', entiteType: 'equipe', entiteId: id, description: `Modification de l'équipe ${e.nom}` });
  return e;
}

export async function remove(id: number, actor: JwtPayload) {
  const e = await prisma.equipe.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { membres: true } } },
  });
  if (e._count.membres > 0) throw Object.assign(new Error(`Impossible de supprimer : ${e._count.membres} membres rattachés`), { status: 409 });
  await prisma.equipe.delete({ where: { id } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'DELETE_EQUIPE', entiteType: 'equipe', entiteId: id, description: `Suppression de l'équipe ${e.nom}` });
}
