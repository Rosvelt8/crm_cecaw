import { arrondi } from './grilleAnalyse';

/**
 * Moteur d'échéancier. Fonctions pures, partagées par la simulation (sans
 * persistance) et la génération de l'échéancier du contrat.
 */

export type ModeAmortissement = 'constant' | 'degressif' | 'in_fine';
export type Periodicite = 'mensuel' | 'bimensuel' | 'trimestriel' | 'semestriel';

/** Nombre de mois couverts par une période. */
const MOIS_PAR_PERIODE: Record<Periodicite, number> = {
  mensuel: 1,
  bimensuel: 2,
  trimestriel: 3,
  semestriel: 6,
};

export interface ParametresEcheancier {
  montant: number;
  /** Taux annuel en pourcentage (ex. 18 pour 18 %). */
  tauxAnnuel: number;
  dureeMois: number;
  periodicite: Periodicite;
  mode: ModeAmortissement;
  /** Nombre de mois de différé : seuls les intérêts sont dus. */
  differeMois?: number;
  /** Frais de dossier, en montant, perçus au décaissement (hors échéancier). */
  fraisDossier?: number;
  dateDebut: Date;
}

export interface LigneEcheance {
  numero: number;
  dateEcheance: Date;
  capital: number;
  interet: number;
  montantTotal: number;
  capitalRestantDu: number;
}

export interface Echeancier {
  lignes: LigneEcheance[];
  totalInterets: number;
  totalARembourser: number;
  premiereEcheance: number;
  /** Coût total du crédit : intérêts + frais de dossier. */
  coutTotal: number;
  /** Taux effectif annuel approché, en pourcentage. */
  teg: number;
}

function ajouterMois(date: Date, mois: number): Date {
  const d = new Date(date.getTime());
  const jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + mois);
  // Ramène au dernier jour du mois quand le jour d'origine n'existe pas (31 → 30, 29 février).
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernier));
  return d;
}

export function validerParametres(p: ParametresEcheancier): string[] {
  const erreurs: string[] = [];
  if (!(p.montant > 0)) erreurs.push('Le montant doit être strictement positif.');
  if (p.tauxAnnuel < 0) erreurs.push('Le taux ne peut pas être négatif.');
  if (!Number.isInteger(p.dureeMois) || p.dureeMois < 1) erreurs.push('La durée doit être un nombre entier de mois.');
  const pas = MOIS_PAR_PERIODE[p.periodicite];
  if (p.dureeMois % pas !== 0) erreurs.push(`La durée doit être un multiple de ${pas} mois pour une périodicité ${p.periodicite}.`);
  const differe = p.differeMois ?? 0;
  if (differe < 0 || differe >= p.dureeMois) erreurs.push('Le différé doit être inférieur à la durée.');
  if (differe % pas !== 0) erreurs.push(`Le différé doit être un multiple de ${pas} mois.`);
  return erreurs;
}

export function genererEcheancier(p: ParametresEcheancier): Echeancier {
  const erreurs = validerParametres(p);
  if (erreurs.length > 0) throw new Error(erreurs.join(' '));

  const pas = MOIS_PAR_PERIODE[p.periodicite];
  const nbPeriodes = p.dureeMois / pas;
  const nbDiffere = (p.differeMois ?? 0) / pas;
  const nbAmortissement = nbPeriodes - nbDiffere;
  const tauxPeriode = p.tauxAnnuel / 100 / (12 / pas);

  const lignes: LigneEcheance[] = [];
  let restant = p.montant;

  // Annuité constante : a = C·i / (1 − (1+i)^−n). Sans intérêt, capital réparti à parts égales.
  const annuite =
    p.mode === 'constant'
      ? tauxPeriode === 0
        ? p.montant / nbAmortissement
        : (p.montant * tauxPeriode) / (1 - Math.pow(1 + tauxPeriode, -nbAmortissement))
      : 0;

  for (let n = 1; n <= nbPeriodes; n++) {
    const interet = arrondi(restant * tauxPeriode);
    let capital: number;

    if (n <= nbDiffere) {
      capital = 0;
    } else if (p.mode === 'in_fine') {
      capital = n === nbPeriodes ? restant : 0;
    } else if (p.mode === 'degressif') {
      capital = n === nbPeriodes ? restant : arrondi(p.montant / nbAmortissement);
    } else {
      capital = n === nbPeriodes ? restant : arrondi(annuite - interet);
    }

    // La dernière ligne absorbe le cumul des arrondis : le capital remboursé
    // vaut exactement le montant décaissé.
    if (n === nbPeriodes) capital = arrondi(restant);
    capital = Math.min(capital, restant);
    restant = arrondi(restant - capital);

    lignes.push({
      numero: n,
      dateEcheance: ajouterMois(p.dateDebut, n * pas),
      capital: arrondi(capital),
      interet,
      montantTotal: arrondi(capital + interet),
      capitalRestantDu: restant,
    });
  }

  const totalInterets = arrondi(lignes.reduce((s, l) => s + l.interet, 0));
  const frais = p.fraisDossier ?? 0;
  const coutTotal = arrondi(totalInterets + frais);

  // Approximation du TEG : coût total rapporté au capital moyen immobilisé, annualisé.
  const capitalMoyen = lignes.reduce((s, l, i) => s + (i === 0 ? p.montant : lignes[i - 1].capitalRestantDu), 0) / lignes.length;
  const teg = capitalMoyen > 0 ? arrondi((coutTotal / capitalMoyen / (p.dureeMois / 12)) * 100) : 0;

  return {
    lignes,
    totalInterets,
    totalARembourser: arrondi(p.montant + totalInterets),
    premiereEcheance: lignes[0].montantTotal,
    coutTotal,
    teg,
  };
}

/**
 * Mensualité de référence servant aux ratios de la grille d'analyse : la
 * première échéance hors différé, ramenée au mois pour rester comparable à la
 * capacité de remboursement mensuelle.
 */
export function mensualiteEquivalente(e: Echeancier, periodicite: Periodicite): number {
  const pas = MOIS_PAR_PERIODE[periodicite];
  const premiereAmortie = e.lignes.find((l) => l.capital > 0) ?? e.lignes[0];
  return arrondi(premiereAmortie.montantTotal / pas);
}
