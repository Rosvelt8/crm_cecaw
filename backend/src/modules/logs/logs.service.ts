import prisma from '../../lib/prisma';
import { JwtPayload } from '../../middleware/auth';
import { parsePagination, paginationMeta } from '../../lib/pagination';

export async function list(actor: JwtPayload, query: Record<string, unknown>) {
  const { skip, take, page, perPage } = parsePagination(query);
  const where: Record<string, unknown> = {};

  if (actor.role !== 'admin' && actor.agenceId) where.agenceId = actor.agenceId;
  if (query.agence_id && actor.role === 'admin') where.agenceId = parseInt(query.agence_id as string, 10);
  if (query.utilisateur_id) where.utilisateurId = parseInt(query.utilisateur_id as string, 10);
  if (query.module) where.module = query.module;
  if (query.action_type) where.action = { startsWith: query.action_type };
  if (query.date_debut || query.date_fin) {
    where.timestamp = {};
    if (query.date_debut) (where.timestamp as Record<string, unknown>).gte = new Date(query.date_debut as string);
    if (query.date_fin) (where.timestamp as Record<string, unknown>).lte = new Date(query.date_fin as string);
  }

  const [items, total] = await Promise.all([
    prisma.log.findMany({
      where, skip, take,
      orderBy: { timestamp: 'desc' },
      include: {
        utilisateur: { select: { id: true, prenom: true, nom: true } },
        agence: { select: { id: true, nom: true } },
      },
    }),
    prisma.log.count({ where }),
  ]);

  return {
    items: items.map((l) => ({
      ...l,
      action_type: l.action.split('_')[0],
      utilisateur: l.utilisateur
        ? { ...l.utilisateur, initiales: `${l.utilisateur.prenom[0]}${l.utilisateur.nom[0]}` }
        : null,
    })),
    meta: paginationMeta(page, perPage, total),
  };
}
