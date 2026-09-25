import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { arrondi } from './finance/grilleAnalyse';

/**
 * Moteur comptable (COMPTABILITÉ / FINANCE).
 *
 * Chaque événement financier (dépôt, retrait, décaissement, remboursement, écart de caisse)
 * génère une écriture équilibrée en partie double, idempotente grâce à sa clé : rejouer
 * l'événement ne crée jamais de doublon. La comptabilité ne bloque jamais l'opération
 * métier : un échec de comptabilisation est signalé par une alerte de conformité.
 *
 * Le plan ci-dessous est un plan MINIMAL de départ, à aligner sur le plan comptable officiel
 * de CECAW (comptes ajoutables et modifiables depuis l'administration comptable).
 */

export const PLAN_COMPTABLE: { numero: string; libelle: string; classe: number; sensNormal: 'debit' | 'credit' }[] = [
  { numero: '1011', libelle: 'Fonds propres et report à nouveau', classe: 1, sensNormal: 'credit' },
  { numero: '3111', libelle: 'Crédits à la clientèle (encours)', classe: 3, sensNormal: 'debit' },
  { numero: '3711', libelle: "Dépôts et épargne de la clientèle", classe: 3, sensNormal: 'credit' },
  { numero: '4711', libelle: 'Écarts de caisse et créances sur agents', classe: 4, sensNormal: 'debit' },
  { numero: '5211', libelle: 'Banques', classe: 5, sensNormal: 'debit' },
  { numero: '5711', libelle: 'Caisse', classe: 5, sensNormal: 'debit' },
  { numero: '6111', libelle: 'Pertes sur créances irrécouvrables', classe: 6, sensNormal: 'debit' },
  { numero: '7111', libelle: 'Intérêts sur crédits', classe: 7, sensNormal: 'credit' },
  { numero: '7211', libelle: 'Frais de dossier et commissions', classe: 7, sensNormal: 'credit' },
  { numero: '7311', libelle: 'Pénalités de retard', classe: 7, sensNormal: 'credit' },
];

export async function synchroniserPlanComptable() {
  for (const c of PLAN_COMPTABLE) {
    await prisma.compteComptable.upsert({ where: { numero: c.numero }, create: c, update: {} });
  }
}

export interface LigneSaisie { compte: string; sens: 'debit' | 'credit'; montant: number; libelle?: string }

export interface EcritureSaisie {
  cle: string;
  journal: 'caisse' | 'banque' | 'operations_diverses';
  libelle: string;
  evenement: string;
  entiteType?: string;
  entiteId?: number;
  agenceId?: number | null;
  date?: Date;
  acteurId?: number | null;
  lignes: LigneSaisie[];
}

export const periodeDe = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Contrôle d'équilibre : la somme des débits égale celle des crédits, au centime. */
export function verifierEquilibre(lignes: LigneSaisie[]): { debit: number; credit: number; equilibre: boolean } {
  const debit = arrondi(lignes.filter((l) => l.sens === 'debit').reduce((s, l) => s + l.montant, 0));
  const credit = arrondi(lignes.filter((l) => l.sens === 'credit').reduce((s, l) => s + l.montant, 0));
  return { debit, credit, equilibre: Math.abs(debit - credit) < 0.005 && debit > 0 };
}

export async function poster(e: EcritureSaisie) {
  const lignes = e.lignes.filter((l) => l.montant > 0);
  const eq = verifierEquilibre(lignes);
  if (!eq.equilibre) throw new Error(`Écriture ${e.cle} déséquilibrée : débit ${eq.debit}, crédit ${eq.credit}`);

  const existante = await prisma.ecritureComptable.findUnique({ where: { cle: e.cle }, select: { id: true } });
  if (existante) return existante;

  const date = e.date ?? new Date();
  const periode = periodeDe(date);
  const p = await prisma.periodeComptable.findUnique({ where: { periode } });
  if (p?.cloturee) throw new Error(`La période ${periode} est clôturée : écriture ${e.cle} refusée.`);

  const comptes = await prisma.compteComptable.findMany({ where: { numero: { in: lignes.map((l) => l.compte) } }, select: { id: true, numero: true } });
  const idParNumero = new Map(comptes.map((c) => [c.numero, c.id]));
  const inconnu = lignes.find((l) => !idParNumero.has(l.compte));
  if (inconnu) throw new Error(`Compte comptable inconnu : ${inconnu.compte}`);

  try {
    return await prisma.$transaction(async (tx) => {
      const ecr = await tx.ecritureComptable.create({
        data: {
          cle: e.cle, journal: e.journal, numeroPiece: 'PROV', dateOperation: date, periode, libelle: e.libelle.slice(0, 255),
          evenement: e.evenement, entiteType: e.entiteType ?? null, entiteId: e.entiteId ?? null, agenceId: e.agenceId ?? null,
          creeParId: e.acteurId ?? null,
          lignes: { create: lignes.map((l) => ({ compteId: idParNumero.get(l.compte) as number, sens: l.sens, montant: l.montant, libelle: l.libelle ?? null })) },
        },
      });
      const prefixe = e.journal === 'caisse' ? 'CA' : e.journal === 'banque' ? 'BQ' : 'OD';
      return tx.ecritureComptable.update({ where: { id: ecr.id }, data: { numeroPiece: `${prefixe}-${periode.replace('-', '')}-${String(ecr.id).padStart(6, '0')}` }, select: { id: true } });
    });
  } catch (err) {
    // Deux événements simultanés portant la même clé : le second retrouve l'écriture du premier.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const r = await prisma.ecritureComptable.findUnique({ where: { cle: e.cle }, select: { id: true } });
      if (r) return r;
    }
    throw err;
  }
}

/** Comptabilise sans jamais faire échouer l'appelant ; l'échec devient une alerte à régulariser. */
export async function posterSansBloquer(e: EcritureSaisie) {
  try {
    return await poster(e);
  } catch (err) {
    console.error(`[compta] ${e.cle}`, err);
    try {
      await prisma.alerteConformite.upsert({
        where: { empreinte: `compta:${e.cle}` },
        create: {
          code: 'ecriture_non_generee', niveau: 'eleve', titre: 'Écriture comptable non générée',
          description: `${e.libelle} : ${(err as Error).message}`, entiteType: e.entiteType ?? null, entiteId: e.entiteId ?? null,
          agenceId: e.agenceId ?? null, empreinte: `compta:${e.cle}`,
        },
        update: {},
      });
    } catch { /* rien de plus à tenter */ }
    return null;
  }
}

const contrepartie = (mode: string) => (mode === 'especes' ? '5711' : mode === 'compte' ? '3711' : '5211');
const journalDe = (mode: string): 'caisse' | 'banque' | 'operations_diverses' => (mode === 'especes' ? 'caisse' : mode === 'compte' ? 'operations_diverses' : 'banque');

export const comptabiliser = {
  transactionCompte: (t: { id: number; type: 'credit' | 'debit'; montant: number; agenceId?: number | null; acteurId?: number | null; date?: Date; libelle: string }) =>
    posterSansBloquer({
      cle: `tx:${t.id}`, journal: 'caisse', libelle: t.libelle, evenement: t.type === 'credit' ? 'compte.depot' : 'compte.retrait',
      entiteType: 'transaction', entiteId: t.id, agenceId: t.agenceId, acteurId: t.acteurId, date: t.date,
      lignes: t.type === 'credit'
        ? [{ compte: '5711', sens: 'debit', montant: t.montant }, { compte: '3711', sens: 'credit', montant: t.montant }]
        : [{ compte: '3711', sens: 'debit', montant: t.montant }, { compte: '5711', sens: 'credit', montant: t.montant }],
    }),

  decaissement: (d: { demandeId: number; reference: string; montant: number; fraisDeduits: number; mode: string; agenceId: number; acteurId: number }) =>
    posterSansBloquer({
      cle: `dec:${d.demandeId}`, journal: journalDe(d.mode), libelle: `Décaissement crédit ${d.reference}`, evenement: 'credit.decaissement',
      entiteType: 'demande_credit', entiteId: d.demandeId, agenceId: d.agenceId, acteurId: d.acteurId,
      lignes: [
        { compte: '3111', sens: 'debit', montant: d.montant },
        { compte: contrepartie(d.mode), sens: 'credit', montant: arrondi(d.montant - d.fraisDeduits) },
        { compte: '7211', sens: 'credit', montant: d.fraisDeduits, libelle: 'Frais de dossier' },
      ],
    }),

  remboursement: (r: { id: number; demandeId: number; reference: string; mode: string; capital: number; interets: number; penalites: number; agenceId: number; acteurId: number; date?: Date }) =>
    posterSansBloquer({
      cle: `rbt:${r.id}`, journal: journalDe(r.mode), libelle: `Remboursement crédit ${r.reference}`, evenement: 'credit.remboursement',
      entiteType: 'remboursement', entiteId: r.id, agenceId: r.agenceId, acteurId: r.acteurId, date: r.date,
      lignes: [
        { compte: contrepartie(r.mode), sens: 'debit', montant: arrondi(r.capital + r.interets + r.penalites) },
        { compte: '3111', sens: 'credit', montant: r.capital },
        { compte: '7111', sens: 'credit', montant: r.interets, libelle: 'Intérêts' },
        { compte: '7311', sens: 'credit', montant: r.penalites, libelle: 'Pénalités' },
      ],
    }),

  /** Écart entre le total collecté et la somme versée en caisse : négatif = manquant à la charge de l'agent. */
  ecartCollecte: (e: { journeeId: number; ecart: number; agentLibelle: string; date: Date; acteurId: number }) =>
    e.ecart === 0 ? Promise.resolve(null) : posterSansBloquer({
      cle: `ecart:${e.journeeId}`, journal: 'caisse', libelle: `Écart de collecte ${e.agentLibelle}`, evenement: 'collecte.ecart',
      entiteType: 'journee_collecte', entiteId: e.journeeId, acteurId: e.acteurId, date: e.date,
      lignes: e.ecart < 0
        ? [{ compte: '4711', sens: 'debit', montant: Math.abs(e.ecart) }, { compte: '5711', sens: 'credit', montant: Math.abs(e.ecart) }]
        : [{ compte: '5711', sens: 'debit', montant: e.ecart }, { compte: '4711', sens: 'credit', montant: e.ecart }],
    }),
};

/**
 * Ventile un règlement sur une échéance : pénalités, puis intérêts et frais, puis capital.
 * `dejaPaye` est ce qui avait déjà été versé sur l'échéance avant ce règlement.
 */
export function ventiler(e: { capital: number; interet: number; frais: number; penalite: number }, dejaPaye: number, versement: number) {
  const cumul = { penalites: 0, interets: 0, capital: 0 };
  const ordre: [keyof typeof cumul, number][] = [['penalites', e.penalite], ['interets', e.interet + e.frais], ['capital', e.capital]];
  let passe = dejaPaye;
  let reste = versement;
  for (const [cle, du] of ordre) {
    const dejaSurCeRang = Math.min(passe, du);
    passe -= dejaSurCeRang;
    const dispo = du - dejaSurCeRang;
    const part = Math.min(reste, dispo);
    cumul[cle] += part;
    reste -= part;
  }
  return { penalites: arrondi(cumul.penalites), interets: arrondi(cumul.interets), capital: arrondi(cumul.capital), excedent: arrondi(reste) };
}
