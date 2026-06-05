import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';

const include = {
  _count: { select: { equipes: true, utilisateurs: true } },
} as const;

function fmt(a: Awaited<ReturnType<typeof prisma.agence.findMany>>[0] & {
  _count: { equipes: number; utilisateurs: number };
}) {
  return {
    id: a.id, nom: a.nom, ville: a.ville, adresse: a.adresse, actif: a.actif,
    nb_equipes: a._count.equipes,
    nb_utilisateurs: a._count.utilisateurs,
    created_at: a.createdAt,
  };
}

export async function list(actif?: string, search?: string) {
  const where: Record<string, unknown> = {};
  if (actif !== undefined) where.actif = actif === 'true';
  if (search) where.OR = [
    { nom: { contains: search, mode: 'insensitive' } },
    { ville: { contains: search, mode: 'insensitive' } },
  ];
  const items = await prisma.agence.findMany({ where, include, orderBy: { nom: 'asc' } });
  return items.map(fmt);
}

export async function getOne(id: number) {
  const a = await prisma.agence.findUniqueOrThrow({
    where: { id },
    include: {
      equipes: {
        include: { _count: { select: { membres: true } } },
      },
      _count: { select: { utilisateurs: true } },
    },
  });
  return {
    id: a.id, nom: a.nom, ville: a.ville, adresse: a.adresse, actif: a.actif,
    nb_utilisateurs: a._count.utilisateurs,
    equipes: a.equipes.map((e) => ({ id: e.id, nom: e.nom, nb_membres: e._count.membres })),
    created_at: a.createdAt,
  };
}

export async function create(data: { nom: string; ville: string; adresse?: string; actif?: boolean }, actor: JwtPayload) {
  const a = await prisma.agence.create({ data: { nom: data.nom, ville: data.ville, adresse: data.adresse, actif: data.actif ?? true } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'CREATE_AGENCE', entiteType: 'agence', entiteId: a.id, description: `Création de l'agence ${a.nom}`, impact: '+1 agence' });
  return a;
}

export async function update(id: number, data: Partial<{ nom: string; ville: string; adresse: string; actif: boolean }>, actor: JwtPayload) {
  const a = await prisma.agence.update({ where: { id }, data });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'UPDATE_AGENCE', entiteType: 'agence', entiteId: id, description: `Modification de l'agence ${a.nom}` });
  return a;
}

export async function remove(id: number, actor: JwtPayload) {
  const a = await prisma.agence.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { utilisateurs: true, equipes: true } } },
  });
  if (a._count.utilisateurs > 0) throw Object.assign(new Error(`Impossible de supprimer : ${a._count.utilisateurs} utilisateurs rattachés`), { status: 409 });
  if (a._count.equipes > 0) throw Object.assign(new Error(`Impossible de supprimer : ${a._count.equipes} équipes rattachées`), { status: 409 });
  await prisma.agence.delete({ where: { id } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'DELETE_AGENCE', entiteType: 'agence', entiteId: id, description: `Suppression de l'agence ${a.nom}` });
}
