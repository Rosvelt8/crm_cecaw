import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { StatutObjectif } from '@prisma/client';

function calcStatut(cible: number, realise: number, dateFin: Date): StatutObjectif {
  if (realise >= cible * 1.1) return 'depasse';
  if (realise >= cible) return 'atteint';
  if (new Date() > dateFin && realise < cible) return 'echec';
  return 'en_cours';
}

const include = {
  produit: { select: { id: true, nom: true } },
  equipe: { select: { id: true, nom: true } },
  createdBy: { select: { id: true, prenom: true, nom: true } },
  agents: { include: { agent: { include: { utilisateur: { select: { prenom: true, nom: true } } } } } },
} as const;

export async function list(actor: JwtPayload, query: Record<string, unknown>) {
  const { skip, take, page, perPage } = parsePagination(query);
  const where: Record<string, unknown> = {};

  if (actor.role === 'agent') {
    // Agent sees only their own objectives
    const agentRec = await prisma.agent.findFirst({ where: { utilisateurId: actor.sub } });
    if (agentRec) where.agents = { some: { agentId: agentRec.id } };
    else where.id = -1; // No results
  } else {
    if (query.equipe_id) where.equipeId = parseInt(query.equipe_id as string, 10);
    if (query.agent_id) where.agents = { some: { agentId: parseInt(query.agent_id as string, 10) } };
  }

  if (query.statut) where.statut = query.statut;
  if (query.assignation_type) where.assignationType = query.assignation_type;

  const [items, total] = await Promise.all([
    prisma.objectif.findMany({ where, include, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.objectif.count({ where }),
  ]);

  return {
    items: items.map((o) => ({
      ...o,
      pourcentage: o.cible ? Math.round((Number(o.realise) / Number(o.cible)) * 1000) / 10 : 0,
      agents: o.agents.map((oa) => ({
        id: oa.agent.id,
        matricule: oa.agent.matricule,
        nom: `${oa.agent.utilisateur.prenom} ${oa.agent.utilisateur.nom}`,
      })),
    })),
    meta: paginationMeta(page, perPage, total),
  };
}

export async function getOne(id: number) {
  return prisma.objectif.findUniqueOrThrow({ where: { id }, include });
}

export async function create(data: {
  titre: string; produit_id: number; cible: number; unite: string;
  periodicite: string; date_debut: string; date_fin: string;
  assignation_type: string; equipe_id?: number; agent_ids?: number[];
}, actor: JwtPayload) {
  const o = await prisma.objectif.create({
    data: {
      titre: data.titre,
      produitId: data.produit_id,
      cible: data.cible,
      unite: data.unite as never,
      periodicite: data.periodicite as never,
      dateDebut: new Date(data.date_debut),
      dateFin: new Date(data.date_fin),
      assignationType: data.assignation_type as never,
      equipeId: data.equipe_id ?? null,
      createdById: actor.sub,
      agents: data.agent_ids?.length
        ? { create: data.agent_ids.map((id) => ({ agentId: id })) }
        : undefined,
    },
    include,
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'collecte', action: 'CREATE_OBJECTIF', entiteType: 'objectif', entiteId: o.id, description: `Création de l'objectif "${o.titre}"`, impact: '+1 objectif' });
  return o;
}

export async function update(id: number, data: Record<string, unknown>, actor: JwtPayload) {
  const o = await prisma.objectif.update({
    where: { id },
    data: {
      ...(data.titre !== undefined && { titre: data.titre as string }),
      ...(data.cible !== undefined && { cible: data.cible as number }),
      ...(data.date_debut !== undefined && { dateDebut: new Date(data.date_debut as string) }),
      ...(data.date_fin !== undefined && { dateFin: new Date(data.date_fin as string) }),
    },
    include,
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'collecte', action: 'UPDATE_OBJECTIF', entiteType: 'objectif', entiteId: id, description: `Modification de l'objectif "${o.titre}"` });
  return o;
}

export async function updateRealise(id: number, realise: number, actor: JwtPayload) {
  const o = await prisma.objectif.findUniqueOrThrow({ where: { id } });
  const statut = calcStatut(Number(o.cible), realise, o.dateFin);
  const updated = await prisma.objectif.update({
    where: { id }, data: { realise, statut }, include,
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'collecte', action: 'UPDATE_REALISE', entiteType: 'objectif', entiteId: id, description: `Avancement objectif "${o.titre}" → ${realise}` });
  return updated;
}

export async function remove(id: number, actor: JwtPayload) {
  const o = await prisma.objectif.findUniqueOrThrow({ where: { id } });
  await prisma.objectif.delete({ where: { id } });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'collecte', action: 'DELETE_OBJECTIF', entiteType: 'objectif', entiteId: id, description: `Suppression de l'objectif "${o.titre}"` });
}
