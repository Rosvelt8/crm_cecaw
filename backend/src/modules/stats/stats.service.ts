import prisma from '../../lib/prisma';
import { JwtPayload } from '../../middleware/auth';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { getResponsableEquipeIds } from '../../lib/teamScope';

function periodFilter(periode?: string): { gte?: Date } {
  const now = new Date();
  const map: Record<string, () => Date> = {
    '7j': () => new Date(now.getTime() - 7 * 24 * 3600 * 1000),
    '30j': () => new Date(now.getTime() - 30 * 24 * 3600 * 1000),
    mois: () => new Date(now.getFullYear(), now.getMonth(), 1),
    trimestre: () => new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1),
    annee: () => new Date(now.getFullYear(), 0, 1),
    tout: () => new Date(0),
  };
  if (!periode || !map[periode]) return {};
  return { gte: map[periode]() };
}

function agenceWhere(actor: JwtPayload, agenceIdQ?: string) {
  if (actor.role === 'admin' && agenceIdQ) return { agenceId: parseInt(agenceIdQ, 10) };
  if (actor.role !== 'admin' && actor.agenceId) return { agenceId: actor.agenceId };
  return {};
}

export async function getKpis(actor: JwtPayload, query: Record<string, unknown>) {
  const agence = agenceWhere(actor, query.agence_id as string | undefined);
  const dateFilter = periodFilter(query.periode as string | undefined);

  const [prospects, convertis, clients, objectifs, collecte] = await Promise.all([
    prisma.prospect.count({ where: { ...agence, createdAt: dateFilter } }),
    prisma.prospect.count({ where: { ...agence, statut: 'converti', createdAt: dateFilter } }),
    prisma.client.count({ where: { ...agence, createdAt: dateFilter } }),
    prisma.objectif.groupBy({ by: ['statut'], _count: true }),
    prisma.transaction.aggregate({
      _sum: { montant: true },
      where: { compte: { client: agence }, type: 'credit', createdAt: dateFilter },
    }),
  ]);

  const objectifsAtteints = objectifs.find((o) => o.statut === 'atteint')?._count ?? 0;
  const objectifsTotal = objectifs.reduce((s, o) => s + o._count, 0);

  return {
    prospects,
    convertis,
    clients,
    collecte_total: Number(collecte._sum.montant ?? 0),
    taux_conversion: prospects > 0 ? Math.round((convertis / prospects) * 1000) / 10 : 0,
    objectifs_atteints: objectifsAtteints,
    objectifs_total: objectifsTotal,
  };
}

export async function getPerformancesIndividuelles(actor: JwtPayload, query: Record<string, unknown>) {
  const { skip, take, page, perPage } = parsePagination(query);
  const dateFilter = periodFilter(query.periode as string | undefined);
  const agenceId = actor.role !== 'admin' ? actor.agenceId : (query.agence_id ? parseInt(query.agence_id as string, 10) : undefined);

  const agents = await prisma.agent.findMany({
    where: agenceId ? { utilisateur: { agenceId } } : {},
    include: {
      utilisateur: {
        select: {
          prenom: true, nom: true,
          agence: { select: { nom: true } },
          equipe: { select: { nom: true } },
          prospects: { where: { createdAt: dateFilter }, select: { id: true, statut: true } },
          clients: { where: { createdAt: dateFilter }, select: { id: true } },
        },
      },
      transactions: {
        where: { type: 'credit', createdAt: dateFilter },
        select: { montant: true },
      },
      objectifs: {
        include: { objectif: { select: { statut: true } } },
      },
    },
    skip,
    take,
  });

  const total = await prisma.agent.count({ where: agenceId ? { utilisateur: { agenceId } } : {} });

  const items = agents.map((a) => {
    const prospects = a.utilisateur.prospects.length;
    const convertis = a.utilisateur.prospects.filter((p) => p.statut === 'converti').length;
    const clients = a.utilisateur.clients.length;
    const collecte = a.transactions.reduce((s, t) => s + Number(t.montant), 0);
    const objectifsAtteints = a.objectifs.filter((o) => ['atteint', 'depasse'].includes(o.objectif.statut)).length;
    return {
      agent_id: a.id,
      matricule: a.matricule,
      nom: `${a.utilisateur.prenom} ${a.utilisateur.nom}`,
      agence: a.utilisateur.agence?.nom ?? '',
      equipe: a.utilisateur.equipe?.nom ?? '',
      prospects,
      convertis,
      clients,
      collecte,
      taux_conversion: prospects > 0 ? Math.round((convertis / prospects) * 1000) / 10 : 0,
      objectifs_atteints: objectifsAtteints,
      objectifs_total: a.objectifs.length,
    };
  });

  // Sort
  const sort = (query.sort as string) ?? 'collecte';
  const dir = query.dir === 'asc' ? 1 : -1;
  items.sort((a, b) => {
    const va = (a as Record<string, unknown>)[sort] as number;
    const vb = (b as Record<string, unknown>)[sort] as number;
    return (va - vb) * dir;
  });

  return { items, meta: paginationMeta(page, perPage, total) };
}

export async function getPerformancesEquipes(actor: JwtPayload, query: Record<string, unknown>) {
  const { skip, take, page, perPage } = parsePagination(query);
  const dateFilter = periodFilter(query.periode as string | undefined);

  let where: Record<string, unknown>;
  if (actor.role === 'backoffice') {
    // Un chef d'équipe ne voit que la (les) équipe(s) dont il est responsable.
    const equipeIds = await getResponsableEquipeIds(actor.sub);
    where = { id: { in: equipeIds.length > 0 ? equipeIds : [-1] } };
  } else {
    const agenceId = actor.role !== 'admin' ? actor.agenceId : (query.agence_id ? parseInt(query.agence_id as string, 10) : undefined);
    where = agenceId ? { agenceId } : {};
  }

  const equipes = await prisma.equipe.findMany({
    where,
    include: {
      agence: { select: { nom: true } },
      _count: { select: { membres: true } },
      membres: {
        include: {
          prospects: { where: { createdAt: dateFilter }, select: { statut: true } },
          clients: { where: { createdAt: dateFilter }, select: { id: true } },
          agent: {
            include: {
              transactions: { where: { type: 'credit', createdAt: dateFilter }, select: { montant: true } },
              objectifs: { include: { objectif: { select: { statut: true } } } },
            },
          },
        },
      },
    },
    skip,
    take,
  });

  const total = await prisma.equipe.count({ where });

  const items = equipes.map((e) => {
    let prospects = 0, convertis = 0, clients = 0, collecte = 0, objectifsAtteints = 0, objectifsTotal = 0;
    for (const m of e.membres) {
      prospects += m.prospects.length;
      convertis += m.prospects.filter((p) => p.statut === 'converti').length;
      clients += m.clients.length;
      if (m.agent) {
        collecte += m.agent.transactions.reduce((s, t) => s + Number(t.montant), 0);
        objectifsAtteints += m.agent.objectifs.filter((o) => ['atteint', 'depasse'].includes(o.objectif.statut)).length;
        objectifsTotal += m.agent.objectifs.length;
      }
    }
    return {
      equipe_id: e.id,
      nom: e.nom,
      agence: e.agence.nom,
      nb_agents: e._count.membres,
      prospects, convertis, clients, collecte,
      taux_conversion: prospects > 0 ? Math.round((convertis / prospects) * 1000) / 10 : 0,
      objectifs_atteints: objectifsAtteints,
      objectifs_total: objectifsTotal,
    };
  });

  return { items, meta: paginationMeta(page, perPage, total) };
}

export async function getTransactionsParMois(actor: JwtPayload, query: Record<string, unknown>) {
  const nbMois = parseInt((query.nb_mois as string) ?? '6', 10);
  const agenceId = actor.role !== 'admin' ? actor.agenceId : (query.agence_id ? parseInt(query.agence_id as string, 10) : undefined);

  const results = [];
  const now = new Date();

  for (let i = nbMois - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

    const [credits, debits] = await Promise.all([
      prisma.transaction.aggregate({
        _sum: { montant: true },
        where: { type: 'credit', createdAt: { gte: start, lte: end }, ...(agenceId ? { compte: { client: { agenceId } } } : {}) },
      }),
      prisma.transaction.aggregate({
        _sum: { montant: true },
        where: { type: 'debit', createdAt: { gte: start, lte: end }, ...(agenceId ? { compte: { client: { agenceId } } } : {}) },
      }),
    ]);

    const LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    results.push({
      mois: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: LABELS[d.getMonth()],
      credits: Number(credits._sum.montant ?? 0),
      debits: Number(debits._sum.montant ?? 0),
    });
  }

  return results;
}

export async function getProspectsParStatut(actor: JwtPayload, query: Record<string, unknown>) {
  const agence = agenceWhere(actor, query.agence_id as string | undefined);

  const STATUTS = [
    { statut: 'nouveau', label: 'Nouveau', couleur: '#94a3b8' },
    { statut: 'contacte', label: 'Contacté', couleur: '#60a5fa' },
    { statut: 'interesse', label: 'Intéressé', couleur: '#f59e0b' },
    { statut: 'negocie', label: 'Négocié', couleur: '#a78bfa' },
    { statut: 'converti', label: 'Converti', couleur: '#10b981' },
    { statut: 'perdu', label: 'Perdu', couleur: '#ef4444' },
  ];

  return Promise.all(
    STATUTS.map(async (s) => ({
      ...s,
      count: await prisma.prospect.count({ where: { ...agence, statut: s.statut as never } }),
    })),
  );
}
