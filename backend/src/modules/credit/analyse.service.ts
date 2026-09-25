import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';
import { ErreurMetier, consignerActe, verifierSeparation } from '../../lib/rbac';
import {
  calculerGrille, calculerBilan, arrondi,
  EntreeGrille, EntreeBilan, HypotheseRetenue,
} from '../../lib/finance/grilleAnalyse';
import { genererEcheancier, mensualiteEquivalente } from '../../lib/finance/amortissement';
import { demandeVisible } from './credit.service';
import { emettre } from '../../lib/notifier';

/** Corps accepté pour la grille et le bilan, en nombres (le contrôleur a déjà validé). */
export interface CorpsGrille extends Omit<EntreeGrille, 'mensualiteProposee'> {
  moisAnnee: string;
  caCommentaire?: string | null;
  autresDepensesFamilialesDetail?: string | null;
  detteAutresEmf: number;
  detailCalculs?: string | null;
  bilan: EntreeBilan & { actifCommentaire?: string | null; passifCommentaire?: string | null };
}

const ETATS_ANALYSABLES = ['kyc_valide', 'analyse_en_cours'] as const;

/** Mensualité mensuelle équivalente du crédit demandé, base des ratios de la grille. */
async function mensualiteDeLaDemande(demandeId: number): Promise<number | null> {
  const d = await prisma.demandeCredit.findUniqueOrThrow({
    where: { id: demandeId },
    include: { parametrage: true },
  });
  const taux = Number(d.tauxApplique ?? d.parametrage?.tauxInteretAnnuel ?? 0);
  const mode = d.parametrage?.modeAmortissement ?? 'constant';
  try {
    const e = genererEcheancier({
      montant: Number(d.montantAccorde ?? d.montantDemande),
      tauxAnnuel: taux,
      dureeMois: d.dureeAccordeeMois ?? d.dureeMois,
      periodicite: d.periodicite,
      mode,
      differeMois: d.differeMois,
      dateDebut: new Date(),
    });
    return mensualiteEquivalente(e, d.periodicite);
  } catch {
    // Paramètres incohérents (ex. durée non multiple de la périodicité) :
    // la grille reste calculable, sans les ratios liés à la mensualité.
    return null;
  }
}

/** Aperçu sans écriture : mêmes formules que la sauvegarde, pour l'affichage en direct. */
export async function apercu(actor: JwtPayload, corps: CorpsGrille, demandeId?: number) {
  // La mensualité vient du dossier : on ne la révèle qu'à qui peut le consulter.
  if (demandeId) await demandeVisible(actor, demandeId);
  const mensualite = demandeId ? await mensualiteDeLaDemande(demandeId) : null;
  const grille = calculerGrille({ ...corps, mensualiteProposee: mensualite });
  const bilan = calculerBilan(corps.bilan);
  return { grille, bilan, mensualite_proposee: mensualite };
}

/** Dernière grille validée du même client, servant de colonne « demande précédente ». */
async function demandePrecedente(demandeId: number, clientId: number) {
  return prisma.demandeCredit.findFirst({
    where: {
      clientId,
      id: { not: demandeId },
      grille: { isNot: null },
      statut: { in: ['decaissee', 'cloturee'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, reference: true },
  });
}

const versNombres = (g: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v !== null && typeof v === 'object' && 'toNumber' in (v as object) ? Number(v) : v]));

export async function obtenir(actor: JwtPayload, demandeId: number) {
  const demande = await demandeVisible(actor, demandeId, { client: { select: { id: true, nom: true, prenom: true } } });
  const grille = await prisma.grilleAnalyse.findUnique({
    where: { demandeId },
    include: { bilan: true, analysePar: { select: { id: true, prenom: true, nom: true } } },
  });

  const precedenteRef = grille?.demandePrecedenteId
    ?? (await demandePrecedente(demandeId, demande.clientId))?.id
    ?? null;
  const precedente = precedenteRef
    ? await prisma.grilleAnalyse.findUnique({
        where: { demandeId: precedenteRef },
        include: { bilan: true, demande: { select: { id: true, reference: true } } },
      })
    : null;

  const alertes = grille
    ? [
        ...calculerGrille({ ...(versNombres(grille) as unknown as EntreeGrille), mensualiteProposee: grille.mensualiteProposee ? Number(grille.mensualiteProposee) : null }).alertes,
        ...(grille.bilan ? calculerBilan(versNombres(grille.bilan) as unknown as EntreeBilan).alertes : []),
      ]
    : [];

  return {
    demande: { id: demande.id, reference: demande.reference, statut: demande.statut, client: (demande as any).client },
    grille,
    precedente,
    alertes,
  };
}

export async function sauvegarder(actor: JwtPayload, demandeId: number, corps: CorpsGrille) {
  const demande = await demandeVisible(actor, demandeId);

  if (!(ETATS_ANALYSABLES as readonly string[]).includes(demande.statut)) {
    throw new ErreurMetier(
      demande.statut === 'brouillon' || demande.statut === 'soumise' || demande.statut === 'kyc_en_cours'
        ? "L'analyse ne peut commencer qu'une fois le KYC du client validé."
        : `La grille n'est plus modifiable : le dossier est au statut « ${demande.statut} ».`,
      409,
    );
  }

  // Le montage et l'analyse doivent être le fait d'acteurs distincts (TR-03).
  await verifierSeparation('demande', demandeId, 'analyse', actor.sub);

  const mensualite = await mensualiteDeLaDemande(demandeId);
  const c = calculerGrille({ ...corps, mensualiteProposee: mensualite });
  const b = calculerBilan(corps.bilan);
  const precedente = await demandePrecedente(demandeId, demande.clientId);

  const donnees = {
    moisAnnee: new Date(corps.moisAnnee),
    demandePrecedenteId: precedente?.id ?? null,
    caHypotheseHaute: corps.caHypotheseHaute,
    caHypotheseBasse: corps.caHypotheseBasse,
    hypotheseRetenue: corps.hypotheseRetenue as HypotheseRetenue,
    caRetenu: c.caRetenu,
    caCommentaire: corps.caCommentaire ?? null,
    achatsMarchandises: corps.achatsMarchandises,
    transportApprovisionnement: corps.transportApprovisionnement,
    margeBrute: c.margeBrute,
    tauxMarge: c.tauxMarge,
    loyerLocal: corps.loyerLocal,
    impotsTaxes: corps.impotsTaxes,
    salaires: corps.salaires,
    eauElectricite: corps.eauElectricite,
    reparationsMaintenance: corps.reparationsMaintenance,
    autresDepensesActivite: corps.autresDepensesActivite,
    totalDepenses: c.totalDepenses,
    cashFlow: c.cashFlow,
    loyerDomicile: corps.loyerDomicile,
    autresDepensesFamiliales: corps.autresDepensesFamiliales,
    totalHorsActivite: c.totalHorsActivite,
    echeancesCecaw: corps.echeancesCecaw,
    echeancesAutresEmf: corps.echeancesAutresEmf,
    detteAutresEmf: corps.detteAutresEmf,
    autresRevenusNets: corps.autresRevenusNets,
    capaciteRemboursement: c.capaciteRemboursement,
    mensualiteProposee: mensualite,
    tauxCouverture: c.tauxCouverture,
    ratioEndettement: c.ratioEndettement,
    detailCalculs: corps.detailCalculs ?? null,
    analyseParId: actor.sub,
  };
  const donneesBilan = {
    localTerrain: corps.bilan.localTerrain,
    equipement: corps.bilan.equipement,
    stockMarchandises: corps.bilan.stockMarchandises,
    creancesClients: corps.bilan.creancesClients,
    liquidites: corps.bilan.liquidites,
    autresActifs: corps.bilan.autresActifs,
    totalFondsCommerce: b.totalFondsCommerce,
    actifCommentaire: corps.bilan.actifCommentaire ?? null,
    dettes: b.dettes,
    fondsPropres: b.fondsPropres,
    totalPassif: b.totalPassif,
    passifCommentaire: corps.bilan.passifCommentaire ?? null,
  };

  const grille = await prisma.$transaction(async (tx) => {
    const g = await tx.grilleAnalyse.upsert({
      where: { demandeId },
      create: { demandeId, ...donnees, bilan: { create: donneesBilan } },
      update: { ...donnees, bilan: { upsert: { create: donneesBilan, update: donneesBilan } } },
      include: { bilan: true },
    });
    if (demande.statut === 'kyc_valide') {
      await tx.demandeCredit.update({
        where: { id: demandeId },
        data: { statut: 'analyse_en_cours', analyseParId: actor.sub },
      });
      await consignerActe('demande', demandeId, 'analyse', actor.sub, 'Début de l\'analyse', tx);
    }
    return g;
  });

  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'credit', action: 'UPDATE_GRILLE_ANALYSE', entiteType: 'demande_credit', entiteId: demandeId,
    description: `Grille d'analyse ${demande.reference} : capacité ${c.capaciteRemboursement}`,
  });

  return { grille, calcul: c, bilanCalcul: b };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring à règles. Indicatif : éclaire la décision, ne la prend jamais.
// Les barèmes ci-dessous sont des valeurs de départ à valider par la direction
// du crédit ; ils vivent ici, isolés, pour être ajustés sans toucher au reste.
// ─────────────────────────────────────────────────────────────────────────────

export interface DetailScore { critere: string; points: number; max: number; detail: string }

export function calculerScore(p: {
  tauxCouverture: number | null;
  tauxMarge: number;
  fondsPropres: number;
  totalActif: number;
  couvertureGaranties: number;
  ancienneteMois: number | null;
  creditsSoldesAvecCecaw: number;
}): { valeur: number; classe: string; detail: DetailScore[] } {
  const detail: DetailScore[] = [];
  const ajouter = (critere: string, points: number, max: number, texte: string) =>
    detail.push({ critere, points, max, detail: texte });

  const cov = p.tauxCouverture ?? 0;
  ajouter('Capacité de remboursement', cov >= 2 ? 30 : cov >= 1.5 ? 24 : cov >= 1.2 ? 16 : cov >= 1 ? 8 : 0, 30,
    `Capacité / mensualité = ${cov}`);

  ajouter('Marge brute', p.tauxMarge >= 30 ? 15 : p.tauxMarge >= 20 ? 10 : p.tauxMarge >= 10 ? 5 : 0, 15,
    `Taux de marge ${p.tauxMarge} %`);

  const ratioFP = p.totalActif > 0 ? p.fondsPropres / p.totalActif : 0;
  ajouter('Structure financière', ratioFP >= 0.5 ? 15 : ratioFP >= 0.3 ? 10 : ratioFP >= 0.1 ? 5 : 0, 15,
    `Fonds propres = ${arrondi(ratioFP * 100)} % des actifs`);

  const g = p.couvertureGaranties;
  ajouter('Garanties', g >= 1.5 ? 20 : g >= 1 ? 14 : g >= 0.5 ? 7 : 0, 20, `Garanties retenues = ${arrondi(g * 100)} % du montant`);

  const anc = p.ancienneteMois ?? 0;
  ajouter("Ancienneté de l'activité", anc >= 36 ? 10 : anc >= 12 ? 6 : anc >= 6 ? 3 : 0, 10, `${anc} mois d'activité`);

  ajouter('Historique CECAW', p.creditsSoldesAvecCecaw > 0 ? 10 : 0, 10,
    `${p.creditsSoldesAvecCecaw} crédit(s) précédent(s) soldé(s)`);

  const valeur = detail.reduce((s, d) => s + d.points, 0);
  const classe = valeur >= 75 ? 'A' : valeur >= 60 ? 'B' : valeur >= 45 ? 'C' : 'D';
  return { valeur, classe, detail };
}

export async function terminer(actor: JwtPayload, demandeId: number) {
  const demande = await demandeVisible(actor, demandeId, { garanties: true, client: true });
  if (demande.statut !== 'analyse_en_cours') {
    throw new ErreurMetier("Seul un dossier en cours d'analyse peut être transmis au comité.", 409);
  }
  const grille = await prisma.grilleAnalyse.findUnique({ where: { demandeId }, include: { bilan: true } });
  if (!grille || !grille.bilan) {
    throw new ErreurMetier("La grille d'analyse et le bilan doivent être renseignés avant la transmission au comité.", 422);
  }
  await verifierSeparation('demande', demandeId, 'analyse', actor.sub);

  const montant = Number((demande as any).montantAccorde ?? demande.montantDemande);
  const garanties = (demande as any).garanties as { valeurRetenue: unknown; valeurEstimee: unknown }[];
  const valeurGaranties = garanties.reduce((s, x) => s + Number(x.valeurRetenue ?? x.valeurEstimee), 0);
  const soldes = await prisma.demandeCredit.count({ where: { clientId: demande.clientId, statut: 'cloturee' } });

  const score = calculerScore({
    tauxCouverture: grille.tauxCouverture ? Number(grille.tauxCouverture) : null,
    tauxMarge: Number(grille.tauxMarge),
    fondsPropres: Number(grille.bilan.fondsPropres),
    totalActif: Number(grille.bilan.totalFondsCommerce),
    couvertureGaranties: montant > 0 ? valeurGaranties / montant : 0,
    ancienneteMois: (demande as any).client?.ancienneteActiviteMois ?? null,
    creditsSoldesAvecCecaw: soldes,
  });

  await prisma.$transaction(async (tx) => {
    await tx.demandeCredit.update({
      where: { id: demandeId },
      data: { statut: 'comite_en_attente', analyseParId: actor.sub, scoreValeur: score.valeur, scoreClasse: score.classe },
    });
    await consignerActe('demande', demandeId, 'analyse_terminee', actor.sub, `Score ${score.valeur}/100 (${score.classe})`, tx);
  });

  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'credit', action: 'TRANSMETTRE_COMITE', entiteType: 'demande_credit', entiteId: demandeId,
    description: `Dossier ${demande.reference} transmis au comité, score ${score.valeur}/100`,
  });

  void emettre('credit.analyse_terminee', { entiteType: 'demande_credit', entiteId: demandeId, agenceId: (demande as { agenceId?: number }).agenceId, acteurId: actor.sub, donnees: { reference: demande.reference, client: `${(demande as any).client?.prenom ?? ''} ${(demande as any).client?.nom ?? ''}`.trim(), montant: Math.round(montant), lien: `/dashboard/credits/${demandeId}` } });
  return { statut: 'comite_en_attente', score };
}
