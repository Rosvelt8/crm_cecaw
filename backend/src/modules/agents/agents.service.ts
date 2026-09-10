import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { getIO } from '../../lib/socket';

const utilisateurSelect = {
  id: true, prenom: true, nom: true, email: true,
  agence: { select: { id: true, nom: true } },
  equipe: { select: { id: true, nom: true } },
} as const;

function isOnline(dernierePositionAt: Date | null) {
  if (!dernierePositionAt) return false;
  return Date.now() - dernierePositionAt.getTime() < 60 * 60 * 1000;
}

export async function list(actor: JwtPayload, query: Record<string, unknown>) {
  const { skip, take, page, perPage } = parsePagination(query);
  const where: Record<string, unknown> = {};

  if (actor.role !== 'admin' && actor.agenceId) {
    where.utilisateur = { agenceId: actor.agenceId };
  } else if (query.agence_id) {
    where.utilisateur = { agenceId: parseInt(query.agence_id as string, 10) };
  }
  if (query.search) {
    where.OR = [
      { matricule: { contains: query.search as string, mode: 'insensitive' } },
      { utilisateur: { nom: { contains: query.search as string, mode: 'insensitive' } } },
    ];
  }

  let items = await prisma.agent.findMany({
    where, skip, take,
    orderBy: { createdAt: 'asc' },
    include: { utilisateur: { select: utilisateurSelect } },
  });

  if (query.statut_gps === 'online') items = items.filter((a) => isOnline(a.dernierePositionAt));
  if (query.statut_gps === 'offline') items = items.filter((a) => !isOnline(a.dernierePositionAt));

  const total = await prisma.agent.count({ where });
  return {
    items: items.map((a) => ({ ...a, en_ligne: isOnline(a.dernierePositionAt) })),
    meta: paginationMeta(page, perPage, total),
  };
}

export async function getOne(id: number) {
  const a = await prisma.agent.findUniqueOrThrow({
    where: { id },
    include: {
      utilisateur: { select: utilisateurSelect },
      transactions: {
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { compte: { select: { numero: true, client: { select: { nom: true, prenom: true } } } } },
      },
      objectifs: {
        include: { objectif: { select: { id: true, titre: true, statut: true, cible: true, realise: true } } },
      },
    },
  });
  return { ...a, en_ligne: isOnline(a.dernierePositionAt) };
}

export async function create(data: { utilisateur_id: number; matricule: string; secteur?: string }, actor: JwtPayload) {
  const a = await prisma.agent.create({
    data: { utilisateurId: data.utilisateur_id, matricule: data.matricule, secteur: data.secteur },
    include: { utilisateur: { select: utilisateurSelect } },
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'collecte', action: 'CREATE_AGENT', entiteType: 'agent', entiteId: a.id, description: `Création de l'agent ${a.matricule}`, impact: '+1 agent' });
  return a;
}

export async function update(id: number, data: Partial<{ matricule: string; secteur: string }>, actor: JwtPayload) {
  const a = await prisma.agent.update({ where: { id }, data, include: { utilisateur: { select: utilisateurSelect } } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'collecte', action: 'UPDATE_AGENT', entiteType: 'agent', entiteId: id, description: `Modification de l'agent ${a.matricule}` });
  return a;
}

export async function updatePosition(id: number, latitude: number, longitude: number, actor: JwtPayload) {
  const releveAt = new Date();

  // La fiche agent ne porte que la derniere position ; l'historique separe
  // permet de reconstituer le trajet de la journee. Les deux ecritures sont
  // liees : une position affichee sans trace correspondante serait un trou.
  const [a] = await prisma.$transaction([
    prisma.agent.update({
      where: { id },
      data: { latitude, longitude, dernierePositionAt: releveAt },
    }),
    prisma.agentPosition.create({
      data: { agentId: id, latitude, longitude, releveAt },
    }),
  ]);

  // Broadcast GPS update to connected terrain monitors
  try {
    getIO()?.to('terrain').emit('agent:position', {
      agent_id: id, latitude, longitude,
      derniere_position_at: a.dernierePositionAt,
      en_ligne: true,
    });
  } catch { /* socket optional */ }

  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'collecte', action: 'UPDATE_POSITION', entiteType: 'agent', entiteId: id, description: `Position mise à jour pour l'agent #${id}` });
  return { id: a.id, latitude: a.latitude, longitude: a.longitude, derniere_position_at: a.dernierePositionAt };
}

/**
 * Trajet parcouru par un agent sur une journee.
 *
 * `date` est attendue au format YYYY-MM-DD et interpretee dans le fuseau du
 * serveur. Sans date, on renvoie la journee en cours.
 */
export async function getTrajet(id: number, date?: string) {
  const jour = date ? new Date(`${date}T00:00:00`) : new Date();
  if (Number.isNaN(jour.getTime())) {
    throw Object.assign(new Error('Date invalide'), { status: 400 });
  }

  const debut = new Date(jour);
  debut.setHours(0, 0, 0, 0);
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);

  const points = await prisma.agentPosition.findMany({
    where: { agentId: id, releveAt: { gte: debut, lt: fin } },
    orderBy: { releveAt: 'asc' },
    select: { latitude: true, longitude: true, releveAt: true },
  });

  const coords = points.map((p: { latitude: unknown; longitude: unknown; releveAt: Date }) => ({
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    releve_at: p.releveAt,
  }));

  return {
    agent_id: id,
    date: debut.toISOString().slice(0, 10),
    nb_points: coords.length,
    distance_km: Math.round(totalDistanceKm(coords) * 100) / 100,
    premier_point: coords[0]?.releve_at ?? null,
    dernier_point: coords[coords.length - 1]?.releve_at ?? null,
    points: coords,
  };
}

/** Distance cumulee entre points successifs, formule de haversine. */
function totalDistanceKm(points: { latitude: number; longitude: number }[]): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dLat = rad(b.latitude - a.latitude);
    const dLon = rad(b.longitude - a.longitude);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    total += 2 * R * Math.asin(Math.sqrt(h));
  }
  return total;
}

export async function getTerrainAgents(agenceId?: string) {
  const where: Record<string, unknown> = { latitude: { not: null } };
  if (agenceId) where.utilisateur = { agenceId: parseInt(agenceId, 10) };

  const agents = await prisma.agent.findMany({
    where,
    include: {
      utilisateur: {
        select: {
          prenom: true, nom: true,
          agence: { select: { id: true } },
          equipe: { select: { nom: true } },
        },
      },
    },
  });

  return agents.map((a) => {
    const minutesSince = a.dernierePositionAt
      ? Math.floor((Date.now() - a.dernierePositionAt.getTime()) / 60000)
      : null;
    return {
      id: a.id,
      matricule: a.matricule,
      secteur: a.secteur,
      latitude: a.latitude,
      longitude: a.longitude,
      derniere_position_at: a.dernierePositionAt,
      en_ligne: isOnline(a.dernierePositionAt),
      minutes_depuis_position: minutesSince,
      initiales: `${a.utilisateur.prenom[0]}${a.utilisateur.nom[0]}`,
      nom: `${a.utilisateur.prenom} ${a.utilisateur.nom}`,
      equipe: a.utilisateur.equipe?.nom ?? null,
      agence_id: a.utilisateur.agence?.id ?? null,
    };
  });
}

export async function remove(id: number, actor: JwtPayload) {
  const a = await prisma.agent.findUniqueOrThrow({ where: { id }, include: { _count: { select: { transactions: true } } } });
  if (a._count.transactions > 0) throw Object.assign(new Error('Impossible de supprimer : l\'agent a des transactions'), { status: 409 });
  await prisma.agent.delete({ where: { id } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'collecte', action: 'DELETE_AGENT', entiteType: 'agent', entiteId: id, description: `Suppression de l'agent ${a.matricule}` });
}
