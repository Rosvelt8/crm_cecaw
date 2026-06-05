import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { StatutClient } from '@prisma/client';

const include = {
  agence: { select: { id: true, nom: true } },
  commercial: { select: { id: true, prenom: true, nom: true } },
  _count: { select: { comptes: true } },
} as const;

function agenceFilter(actor: JwtPayload) {
  if (actor.role === 'admin') return {};
  if (actor.role === 'agent') return { commercialId: actor.sub };
  return { agenceId: actor.agenceId };
}

export async function list(actor: JwtPayload, query: Record<string, unknown>) {
  const { skip, take, page, perPage } = parsePagination(query);
  const where: Record<string, unknown> = { ...agenceFilter(actor) };

  if (query.statut) where.statut = query.statut;
  if (query.agence_id && actor.role === 'admin') where.agenceId = parseInt(query.agence_id as string, 10);
  if (query.commercial_id) where.commercialId = parseInt(query.commercial_id as string, 10);
  if (query.search) {
    where.OR = [
      { nom: { contains: query.search, mode: 'insensitive' } },
      { prenom: { contains: query.search, mode: 'insensitive' } },
      { telephone: { contains: query.search } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.client.findMany({ where, include, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.client.count({ where }),
  ]);
  return { items: items.map((c) => ({ ...c, nb_comptes: c._count.comptes })), meta: paginationMeta(page, perPage, total) };
}

export async function getOne(id: number) {
  return prisma.client.findUniqueOrThrow({
    where: { id },
    include: {
      agence: { select: { id: true, nom: true } },
      commercial: { select: { id: true, prenom: true, nom: true } },
      comptes: {
        include: { produit: { select: { id: true, nom: true, groupe: { select: { id: true, nom: true } } } } },
      },
      piecesJointes: true,
    },
  });
}

export async function create(data: Record<string, unknown>, actor: JwtPayload) {
  const c = await prisma.client.create({
    data: {
      nom: data.nom as string, prenom: data.prenom as string,
      genre: (data.genre as never) ?? 'VIDE',
      dateNaissance: data.date_naissance ? new Date(data.date_naissance as string) : null,
      telephone: data.telephone as string,
      email: (data.email as string) ?? '',
      adresse: (data.adresse as string) ?? '',
      ville: data.ville as string | undefined,
      agenceId: (data.agence_id as number),
      commercialId: (data.commercial_id as number) ?? actor.sub,
      statut: (data.statut as StatutClient) ?? 'actif',
      prospectId: data.prospect_id as number | null | undefined,
      notes: data.notes as string | undefined,
    },
    include,
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'marketing', action: 'CREATE_CLIENT', entiteType: 'client', entiteId: c.id, description: `Création du client ${c.prenom} ${c.nom}`, impact: '+1 client' });
  return c;
}

export async function update(id: number, data: Record<string, unknown>, actor: JwtPayload) {
  const c = await prisma.client.update({
    where: { id },
    data: {
      ...(data.nom !== undefined && { nom: data.nom as string }),
      ...(data.prenom !== undefined && { prenom: data.prenom as string }),
      ...(data.telephone !== undefined && { telephone: data.telephone as string }),
      ...(data.email !== undefined && { email: data.email as string }),
      ...(data.adresse !== undefined && { adresse: data.adresse as string }),
      ...(data.ville !== undefined && { ville: data.ville as string }),
      ...(data.statut !== undefined && { statut: data.statut as StatutClient }),
      ...(data.notes !== undefined && { notes: data.notes as string }),
    },
    include,
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'marketing', action: 'UPDATE_CLIENT', entiteType: 'client', entiteId: id, description: `Modification du client ${c.prenom} ${c.nom}` });
  return c;
}

export async function updateStatut(id: number, statut: StatutClient, actor: JwtPayload) {
  const c = await prisma.client.update({ where: { id }, data: { statut }, include });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'marketing', action: 'UPDATE_CLIENT', entiteType: 'client', entiteId: id, description: `Statut client ${c.prenom} ${c.nom} → ${statut}` });
  return c;
}

export async function remove(id: number, actor: JwtPayload) {
  const c = await prisma.client.findUniqueOrThrow({
    where: { id },
    include: { comptes: { where: { statut: 'actif' }, select: { id: true } } },
  });
  if (c.comptes.length > 0) throw Object.assign(new Error('Impossible de supprimer : le client a des comptes actifs'), { status: 409 });
  await prisma.client.delete({ where: { id } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'marketing', action: 'DELETE_CLIENT', entiteType: 'client', entiteId: id, description: `Suppression du client ${c.prenom} ${c.nom}` });
}
