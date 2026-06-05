import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';

export async function list() {
  const items = await prisma.groupeProduit.findMany({
    include: { _count: { select: { produits: true } } },
    orderBy: { nom: 'asc' },
  });
  return items.map((g) => ({
    id: g.id, nom: g.nom, description: g.description, couleur: g.couleur,
    nb_produits: g._count.produits, created_at: g.createdAt,
  }));
}

export async function getOne(id: number) {
  return prisma.groupeProduit.findUniqueOrThrow({
    where: { id },
    include: { produits: { select: { id: true, nom: true, actif: true } } },
  });
}

export async function create(data: { nom: string; description?: string; couleur?: string }, actor: JwtPayload) {
  const g = await prisma.groupeProduit.create({ data: { nom: data.nom, description: data.description, couleur: data.couleur ?? '#10b981' } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'CREATE_GROUPE_PRODUIT', entiteType: 'groupe_produit', entiteId: g.id, description: `Création du groupe ${g.nom}`, impact: '+1 groupe' });
  return g;
}

export async function update(id: number, data: Partial<{ nom: string; description: string; couleur: string }>, actor: JwtPayload) {
  const g = await prisma.groupeProduit.update({ where: { id }, data });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'UPDATE_GROUPE_PRODUIT', entiteType: 'groupe_produit', entiteId: id, description: `Modification du groupe ${g.nom}` });
  return g;
}

export async function remove(id: number, actor: JwtPayload) {
  const g = await prisma.groupeProduit.findUniqueOrThrow({ where: { id }, include: { _count: { select: { produits: true } } } });
  if (g._count.produits > 0) throw Object.assign(new Error(`Impossible de supprimer : ${g._count.produits} produits rattachés`), { status: 409 });
  await prisma.groupeProduit.delete({ where: { id } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'parametres', action: 'DELETE_GROUPE_PRODUIT', entiteType: 'groupe_produit', entiteId: id, description: `Suppression du groupe ${g.nom}` });
}
