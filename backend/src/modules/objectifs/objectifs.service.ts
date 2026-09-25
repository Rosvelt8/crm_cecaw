import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { StatutObjectif } from '@prisma/client';

export function calcStatut(cible: number, realise: number, dateFin: Date): StatutObjectif {
  if (realise >= cible * 1.1) return 'depasse';
  if (realise >= cible) return 'atteint';
  if (new Date() > dateFin && realise < cible) return 'echec';
  return 'en_cours';
}

const include = {
  produit: { select: { id: true, nom: true } },
  agence: { select: { id: true, nom: true } },
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

/**
 * Un objectif doit désigner sa portée : institution entière, une agence, une zone, une équipe
 * ou des agents. Une catégorie automatique (crédit, recouvrement…) ne se rattache pas à un produit.
 */
function verifierCoherence(d: { titre?: string; produit_id?: number | null; categorie?: string; assignation_type?: string; equipe_id?: number; agent_ids?: number[]; agence_id?: number | null; zone_id?: number | null }) {
  const a = d.assignation_type;
  const manque = (a === 'agence' && !d.agence_id) || (a === 'zone' && !d.zone_id) || (a === 'equipe' && !d.equipe_id) || (a === 'agents' && !(d.agent_ids?.length));
  if (manque) throw Object.assign(new Error(`Précisez ${a === 'agence' ? "l'agence" : a === 'zone' ? 'la zone' : a === 'equipe' ? "l'équipe" : 'les agents'} concernés par cet objectif.`), { status: 422 });
  if ((d.categorie ?? 'produit') === 'produit' && !d.produit_id) throw Object.assign(new Error('Un objectif par produit doit indiquer le produit.'), { status: 422 });
}

export async function create(data: {
  titre: string; produit_id?: number | null; cible: number; unite: string;
  periodicite: string; date_debut: string; date_fin: string;
  assignation_type: string; equipe_id?: number; agent_ids?: number[];
  categorie?: string; agence_id?: number | null; zone_id?: number | null;
}, actor: JwtPayload) {
  verifierCoherence(data);
  const o = await prisma.objectif.create({
    data: {
      titre: data.titre,
      produitId: data.produit_id ?? null,
      categorie: (data.categorie ?? 'produit') as never,
      agenceId: data.assignation_type === 'agence' ? (data.agence_id ?? null) : null,
      zoneId: data.assignation_type === 'zone' ? (data.zone_id ?? null) : null,
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
  const current = await prisma.objectif.findUniqueOrThrow({ where: { id } });

  const assignation = data.assignation_type as 'equipe' | 'agents' | 'institution' | 'agence' | 'zone' | undefined;
  const agentIds = Array.isArray(data.agent_ids) ? (data.agent_ids as number[]) : undefined;

  const fields: Record<string, unknown> = {
    ...(data.titre !== undefined && { titre: data.titre as string }),
    ...(data.produit_id !== undefined && { produitId: data.produit_id as number }),
    ...(data.cible !== undefined && { cible: data.cible as number }),
    ...(data.unite !== undefined && { unite: data.unite as never }),
    ...(data.periodicite !== undefined && { periodicite: data.periodicite as never }),
    ...(data.date_debut !== undefined && { dateDebut: new Date(data.date_debut as string) }),
    ...(data.date_fin !== undefined && { dateFin: new Date(data.date_fin as string) }),
    ...(assignation !== undefined && { assignationType: assignation as never }),
    ...(data.categorie !== undefined && { categorie: data.categorie as never }),
    ...(data.agence_id !== undefined && { agenceId: data.agence_id as number | null }),
    ...(data.zone_id !== undefined && { zoneId: data.zone_id as number | null }),
  };

  // Une cible revue a la hausse ou une echeance repoussee change le verdict :
  // sans ce recalcul, un objectif reste affiche « atteint » apres coup.
  if (data.cible !== undefined || data.date_fin !== undefined) {
    const cible = data.cible !== undefined ? Number(data.cible) : Number(current.cible);
    const dateFin = data.date_fin !== undefined ? new Date(data.date_fin as string) : current.dateFin;
    fields.statut = calcStatut(cible, Number(current.realise), dateFin);
  }

  // Les deux modes d'assignation s'excluent : basculer vers l'un doit vider
  // l'autre, sinon l'objectif garde une equipe fantome ou d'anciens agents.
  if (assignation === 'equipe') {
    fields.equipeId = (data.equipe_id as number | undefined) ?? current.equipeId;
  } else if (assignation === 'agents' || assignation === 'institution' || assignation === 'agence' || assignation === 'zone') {
    fields.equipeId = null;
    if (assignation !== 'agence') fields.agenceId = null;
    if (assignation !== 'zone') fields.zoneId = null;
  } else if (data.equipe_id !== undefined) {
    fields.equipeId = data.equipe_id as number;
  }

  // On remplace la liste des agents des qu'elle est fournie, ou que l'objectif
  // bascule sur une equipe (auquel cas elle doit disparaitre).
  const replaceAgents = (assignation !== undefined && assignation !== 'agents') || agentIds !== undefined;

  const o = await prisma.$transaction(async (tx) => {
    if (replaceAgents) {
      await tx.objectifAgent.deleteMany({ where: { objectifId: id } });
      const next = assignation !== undefined && assignation !== 'agents' ? [] : (agentIds ?? []);
      if (next.length > 0) {
        await tx.objectifAgent.createMany({
          data: next.map((agentId) => ({ objectifId: id, agentId })),
        });
      }
    }
    return tx.objectif.update({ where: { id }, data: fields, include });
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
