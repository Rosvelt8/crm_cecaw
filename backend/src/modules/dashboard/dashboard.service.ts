import prisma from '../../lib/prisma';
import { JwtPayload } from '../../middleware/auth';
import { getTransactionsParMois, getProspectsParStatut } from '../stats/stats.service';

export async function getDashboard(actor: JwtPayload) {
  const agenceFilter = actor.role !== 'admin' && actor.agenceId ? { agenceId: actor.agenceId } : {};
  const clientFilter = agenceFilter;

  const [
    clientsActifs,
    clientsTotal,
    prospectsEnCours,
    prospectsConvertis,
    comptesActifs,
    transactions,
    transactionsParMois,
    prospectsParStatut,
  ] = await Promise.all([
    prisma.client.count({ where: { ...clientFilter, statut: 'actif' } }),
    prisma.client.count({ where: clientFilter }),
    prisma.prospect.count({ where: { statut: { notIn: ['converti', 'perdu'] } } }),
    prisma.prospect.count({ where: { statut: 'converti' } }),
    prisma.compteClient.aggregate({
      _sum: { solde: true },
      _count: { id: true },
      where: { statut: 'actif', client: clientFilter },
    }),
    prisma.transaction.groupBy({
      by: ['type'],
      _count: true,
      where: { compte: { client: clientFilter } },
    }),
    getTransactionsParMois(actor, { nb_mois: '6' }),
    getProspectsParStatut(actor, {}),
  ]);

  const nbCredits = transactions.find((t) => t.type === 'credit')?._count ?? 0;
  const nbDebits = transactions.find((t) => t.type === 'debit')?._count ?? 0;

  return {
    kpis: {
      clients_actifs: clientsActifs,
      clients_total: clientsTotal,
      prospects_en_cours: prospectsEnCours,
      prospects_convertis: prospectsConvertis,
      solde_comptes_actifs: Number(comptesActifs._sum.solde ?? 0),
      nb_comptes_actifs: comptesActifs._count.id,
      total_transactions: nbCredits + nbDebits,
      nb_credits: nbCredits,
      nb_debits: nbDebits,
    },
    transactions_par_mois: transactionsParMois,
    prospects_par_statut: prospectsParStatut,
  };
}
