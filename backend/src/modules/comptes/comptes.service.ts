import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';
import { Prisma, StatutCompte } from '@prisma/client';
import { comptabiliser } from '../../lib/compta';
import { droitsEffectifs } from '../../lib/rbac';
import { verifierOperation } from '../../lib/conformite';
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

/**
 * Objectif d'épargne (compléments stratégiques, point 10) : purement déclaratif, n'affecte
 * aucun calcul financier. `null` efface l'objectif.
 */
export async function definirObjectifEpargne(id: number, montant: number | null, date: string | null, _actor: JwtPayload) {
  return prisma.compteClient.update({
    where: { id },
    data: { objectifEpargneMontant: montant, objectifEpargneDate: date ? new Date(date) : null },
    include: compteInclude,
  });
}

/** Régularité et progression de l'épargne (compléments stratégiques, point 10). */
export async function analyseEpargne(id: number) {
  const compte = await prisma.compteClient.findUniqueOrThrow({ where: { id }, select: { solde: true, dateOuverture: true, objectifEpargneMontant: true, objectifEpargneDate: true } });
  const versements = await prisma.transaction.findMany({
    where: { compteId: id, type: 'credit' },
    orderBy: { createdAt: 'asc' },
    select: { montant: true, createdAt: true },
  });
  const moisCouverts = new Set(versements.map((v) => `${v.createdAt.getUTCFullYear()}-${v.createdAt.getUTCMonth()}`));
  const ancienneteMois = Math.max(1, Math.round((Date.now() - compte.dateOuverture.getTime()) / (30 * 86_400_000)));
  const regulariteFraction = moisCouverts.size / Math.min(ancienneteMois, 24); // fenêtre glissante de 2 ans max
  const totalVerse = versements.reduce((s, v) => s + Number(v.montant), 0);
  const moyenneParVersement = versements.length > 0 ? totalVerse / versements.length : 0;
  return {
    solde: Number(compte.solde),
    objectif_montant: compte.objectifEpargneMontant ? Number(compte.objectifEpargneMontant) : null,
    objectif_date: compte.objectifEpargneDate,
    progression_pct: compte.objectifEpargneMontant && Number(compte.objectifEpargneMontant) > 0 ? Math.round((Number(compte.solde) / Number(compte.objectifEpargneMontant)) * 100) : null,
    nb_versements: versements.length,
    montant_moyen_versement: Math.round(moyenneParVersement),
    regularite_pct: Math.round(Math.min(1, regulariteFraction) * 100),
  };
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

/**
 * Enregistre un dépôt ou un retrait.
 *
 * - `client_uid` (fourni par le mobile) rend le rejeu hors connexion idempotent : rejouer la même
 *   opération renvoie l'écriture déjà enregistrée au lieu de créditer deux fois (TR-07).
 * - Les encaissements sont rattachés à la journée de collecte de l'agent, base du contrôle par le
 *   superviseur et du rapprochement avec la caisse.
 * - Un reçu numérique est numéroté, l'écriture comptable est générée et le seuil de vigilance contrôlé.
 */
export async function createTransaction(
  compteId: number,
  data: { type: 'credit' | 'debit'; montant: number; motif?: string; agent_id: number; client_uid?: string; effectue_le?: string },
  actor?: JwtPayload,
) {
  if (actor) {
    // Un agent n'enregistre que ses propres opérations ; seul un profil de caisse peut saisir pour autrui.
    const ag = await prisma.agent.findUnique({ where: { id: data.agent_id }, select: { utilisateurId: true } });
    if (!ag) throw Object.assign(new Error('Agent introuvable'), { status: 404 });
    if (ag.utilisateurId !== actor.sub && !(await droitsEffectifs(actor.sub, actor.role)).has('comptes:EXECUTE')) {
      throw Object.assign(new Error("Vous ne pouvez enregistrer que vos propres opérations."), { status: 403 });
    }
  }
  if (data.client_uid) {
    const deja = await prisma.transaction.findUnique({ where: { clientUid: data.client_uid }, include: { agent: { include: { utilisateur: { select: { prenom: true, nom: true } } } } } });
    if (deja) return deja;
  }

  const txn = await prisma.$transaction(async (tx) => {
    const compte = await tx.compteClient.findUniqueOrThrow({ where: { id: compteId } });
    if (compte.statut !== 'actif') throw Object.assign(new Error('Compte non actif'), { status: 422 });

    // Le solde est relu et mis à jour dans la même transaction, sous verrou de ligne, pour que deux
    // opérations simultanées ne partent pas du même solde.
    const [verrou] = await tx.$queryRaw<{ solde: Prisma.Decimal }[]>`SELECT solde FROM comptes_clients WHERE id = ${compteId} FOR UPDATE`;
    const soldeAvant = Number(verrou.solde);
    let soldeApres: number;

    if (data.type === 'debit') {
      if (data.montant > soldeAvant) throw Object.assign(new Error('Solde insuffisant'), { status: 422 });
      soldeApres = soldeAvant - data.montant;
    } else {
      soldeApres = soldeAvant + data.montant;
    }

    // Journée de collecte : celle de l'opération si elle est encore ouverte, sinon celle du jour.
    let journeeId: number | null = null;
    if (data.type === 'credit') {
      const jour = (d: Date) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
      const voulue = data.effectue_le && !Number.isNaN(new Date(data.effectue_le).getTime()) && Date.now() - new Date(data.effectue_le).getTime() < 7 * 86_400_000 ? jour(new Date(data.effectue_le)) : jour(new Date());
      let journee = await tx.journeeCollecte.findUnique({ where: { agentId_date: { agentId: data.agent_id, date: voulue } } });
      if (!journee || journee.statut !== 'ouverte') {
        const aujourdhui = jour(new Date());
        journee = await tx.journeeCollecte.findUnique({ where: { agentId_date: { agentId: data.agent_id, date: aujourdhui } } })
          ?? await tx.journeeCollecte.create({ data: { agentId: data.agent_id, date: aujourdhui } });
      }
      if (journee.statut === 'ouverte') {
        journeeId = journee.id;
        await tx.journeeCollecte.update({ where: { id: journee.id }, data: { totalCollecte: { increment: data.montant }, nbOperations: { increment: 1 } } });
      }
    }

    const cree = await tx.transaction.create({
      data: {
        compteId, type: data.type, montant: data.montant, soldeAvant, soldeApres, motif: data.motif, agentId: data.agent_id,
        journeeId, clientUid: data.client_uid ?? null,
      },
      include: { agent: { include: { utilisateur: { select: { prenom: true, nom: true } } } } },
    });
    const ymd = cree.createdAt.toISOString().slice(0, 10).replace(/-/g, '');
    const recuNumero = `REC-${ymd}-${String(cree.id).padStart(6, '0')}`;
    await tx.transaction.update({ where: { id: cree.id }, data: { recuNumero } });
    await tx.compteClient.update({ where: { id: compteId }, data: { solde: soldeApres } });
    return { ...cree, recuNumero };
  });

  const compte = await prisma.compteClient.findUnique({ where: { id: compteId }, select: { clientId: true, numero: true, client: { select: { agenceId: true } } } });
  const agenceId = compte?.client.agenceId ?? null;
  await comptabiliser.transactionCompte({
    id: txn.id, type: txn.type as 'credit' | 'debit', montant: Number(txn.montant), agenceId, acteurId: actor?.sub, date: txn.createdAt,
    libelle: `${txn.type === 'credit' ? 'Dépôt' : 'Retrait'} sur compte ${compte?.numero ?? compteId}`,
  });
  await verifierOperation({ montant: Number(txn.montant), type: txn.type, entiteType: 'transaction', entiteId: txn.id, agenceId, clientId: compte?.clientId, libelle: `${txn.type === 'credit' ? 'Dépôt' : 'Retrait'} sur compte ${compte?.numero ?? compteId}` });
  return txn;
}

/**
 * Suppression d'un compte.
 *
 * Refusee des qu'une ecriture existe : les transactions portent le solde avant
 * et apres, elles constituent la piste d'audit du compte et ne doivent jamais
 * devenir orphelines. Un compte a fermer se met au statut « cloture ».
 */
export async function remove(id: number, actor: JwtPayload) {
  const compte = await prisma.compteClient.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { transactions: true } } },
  });

  if (compte._count.transactions > 0) {
    throw Object.assign(
      new Error("Impossible de supprimer : le compte porte des transactions. Clôturez-le."),
      { status: 409 },
    );
  }
  if (Number(compte.solde) !== 0) {
    throw Object.assign(new Error("Impossible de supprimer : le solde n'est pas nul."), {
      status: 409,
    });
  }

  await prisma.compteClient.delete({ where: { id } });
  await createLog({
    utilisateurId: actor.sub,
    utilisateurLabel: actor.email,
    agenceId: actor.agenceId ?? undefined,
    module: 'collecte',
    action: 'DELETE_COMPTE',
    entiteType: 'compte',
    entiteId: id,
    description: `Suppression du compte ${compte.numero}`,
  });
}
