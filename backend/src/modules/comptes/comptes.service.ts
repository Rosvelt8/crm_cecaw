import prisma from '../../lib/prisma';
import { JwtPayload } from '../../middleware/auth';
import { StatutCompte } from '@prisma/client';
import { parsePagination, paginationMeta } from '../../lib/pagination';

async function generateNumero(): Promise<string> {
  const year = new Date().getFullYear();
  const last = await prisma.compteClient.findFirst({
    where: { numero: { startsWith: `CC-${year}-` } },
    orderBy: { numero: 'desc' },
  });
  let seq = 1;
  if (last) {
    const parts = last.numero.split('-');
    seq = parseInt(parts[2], 10) + 1;
  }
  return `CC-${year}-${String(seq).padStart(5, '0')}`;
}

const compteInclude = {
  produit: {
    include: { groupe: { select: { id: true, nom: true } } },
  },
} as const;

export async function listByClient(clientId: number) {
  return prisma.compteClient.findMany({
    where: { clientId },
    include: compteInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function getOne(id: number) {
  const compte = await prisma.compteClient.findUniqueOrThrow({
    where: { id },
    include: {
      ...compteInclude,
      client: { select: { id: true, nom: true, prenom: true } },
      transactions: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          agent: {
            include: { utilisateur: { select: { prenom: true, nom: true } } },
          },
        },
      },
    },
  });
  return compte;
}

export async function create(clientId: number, data: { produit_id: number; solde_initial?: number; date_ouverture?: string }, _actor: JwtPayload) {
  const numero = await generateNumero();
  return prisma.compteClient.create({
    data: {
      numero,
      clientId,
      produitId: data.produit_id,
      solde: data.solde_initial ?? 0,
      dateOuverture: data.date_ouverture ? new Date(data.date_ouverture) : new Date(),
    },
    include: compteInclude,
  });
}

export async function updateStatut(id: number, statut: StatutCompte, _actor: JwtPayload) {
  return prisma.compteClient.update({ where: { id }, data: { statut }, include: compteInclude });
}

export async function listTransactions(compteId: number, query: Record<string, unknown>) {
  const { skip, take, page, perPage } = parsePagination(query);
  const where: Record<string, unknown> = { compteId };
  if (query.type) where.type = query.type;
  if (query.date_debut || query.date_fin) {
    where.createdAt = {};
    if (query.date_debut) (where.createdAt as Record<string, unknown>).gte = new Date(query.date_debut as string);
    if (query.date_fin) (where.createdAt as Record<string, unknown>).lte = new Date(query.date_fin as string);
  }
  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where, skip, take,
      orderBy: { createdAt: 'desc' },
      include: { agent: { include: { utilisateur: { select: { prenom: true, nom: true } } } } },
    }),
    prisma.transaction.count({ where }),
  ]);
  return { items, meta: paginationMeta(page, perPage, total) };
}

export async function createTransaction(compteId: number, data: { type: 'credit' | 'debit'; montant: number; motif?: string; agent_id: number }) {
  return prisma.$transaction(async (tx) => {
    const compte = await tx.compteClient.findUniqueOrThrow({ where: { id: compteId } });
    if (compte.statut !== 'actif') throw Object.assign(new Error('Compte non actif'), { status: 422 });

    const soldeAvant = Number(compte.solde);
    let soldeApres: number;

    if (data.type === 'debit') {
      if (data.montant > soldeAvant) throw Object.assign(new Error('Solde insuffisant'), { status: 422 });
      soldeApres = soldeAvant - data.montant;
    } else {
      soldeApres = soldeAvant + data.montant;
    }

    const txn = await tx.transaction.create({
      data: {
        compteId, type: data.type, montant: data.montant,
        soldeAvant, soldeApres, motif: data.motif, agentId: data.agent_id,
      },
      include: { agent: { include: { utilisateur: { select: { prenom: true, nom: true } } } } },
    });

    await tx.compteClient.update({ where: { id: compteId }, data: { solde: soldeApres } });
    return txn;
  });
}
