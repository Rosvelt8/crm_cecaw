import assert from 'node:assert/strict';
import { calculerGrille, calculerBilan } from '../src/lib/finance/grilleAnalyse';
import { genererEcheancier, mensualiteEquivalente } from '../src/lib/finance/amortissement';
import { ventiler } from '../src/lib/compta';

// ── Grille : cas calculé à la main ────────────────────────────────────────────
// CA haute 1 000 000 / basse 800 000, retenue basse => (A) = 800 000
// achats 480 000 + transport 20 000 => marge brute 300 000, taux 37,5 %
// charges fixes 30 000 + 10 000 + 50 000 + 15 000 + 5 000 + 10 000 = 120 000
// (B) = 480 000 + 20 000 + 120 000 = 620 000 ; (C) = 180 000
// (D) = 40 000 + 60 000 = 100 000
// échéances 15 000 + 5 000 = 20 000 ; autres revenus 10 000
// capacité = 180 000 − 100 000 − 20 000 + 10 000 = 70 000
const g = calculerGrille({
  caHypotheseHaute: 1_000_000, caHypotheseBasse: 800_000, hypotheseRetenue: 'basse',
  achatsMarchandises: 480_000, transportApprovisionnement: 20_000,
  loyerLocal: 30_000, impotsTaxes: 10_000, salaires: 50_000, eauElectricite: 15_000,
  reparationsMaintenance: 5_000, autresDepensesActivite: 10_000,
  loyerDomicile: 40_000, autresDepensesFamiliales: 60_000,
  echeancesCecaw: 15_000, echeancesAutresEmf: 5_000, autresRevenusNets: 10_000,
  mensualiteProposee: 50_000,
});
assert.equal(g.caRetenu, 800_000);
assert.equal(g.margeBrute, 300_000);
assert.equal(g.tauxMarge, 37.5);
assert.equal(g.chargesFixes, 120_000);
assert.equal(g.totalDepenses, 620_000);
assert.equal(g.cashFlow, 180_000);
assert.equal(g.totalHorsActivite, 100_000);
assert.equal(g.capaciteRemboursement, 70_000);
assert.equal(g.tauxCouverture, 1.4);
assert.equal(g.ratioEndettement, 71.43);
// Hypothèse moyenne
assert.equal(calculerGrille({ ...{} as any, caHypotheseHaute: 1000, caHypotheseBasse: 500, hypotheseRetenue: 'moyenne' } as any).caRetenu, 750);
// Entrées vides ou invalides : pas de NaN
const vide = calculerGrille({} as any);
assert.ok(Object.values(vide).every((v) => v === null || Array.isArray(v) || Number.isFinite(v as number)));
console.log('grille OK');

// ── Bilan ────────────────────────────────────────────────────────────────────
const b = calculerBilan({ localTerrain: 5_000_000, equipement: 1_500_000, stockMarchandises: 800_000, creancesClients: 200_000, liquidites: 100_000, autresActifs: 0, dettes: 2_000_000 });
assert.equal(b.totalFondsCommerce, 7_600_000);
assert.equal(b.fondsPropres, 5_600_000);
assert.equal(b.totalPassif, b.totalFondsCommerce, 'le passif doit égaler l\'actif');
console.log('bilan OK');

// ── Échéancier ───────────────────────────────────────────────────────────────
const debut = new Date(Date.UTC(2026, 0, 31));
for (const mode of ['constant', 'degressif', 'in_fine'] as const) {
  for (const taux of [0, 18]) {
    const e = genererEcheancier({ montant: 1_000_000, tauxAnnuel: taux, dureeMois: 12, periodicite: 'mensuel', mode, dateDebut: debut });
    const capital = e.lignes.reduce((s, l) => s + l.capital, 0);
    assert.equal(Math.round(capital * 100) / 100, 1_000_000, `capital ${mode} ${taux}%`);
    assert.equal(e.lignes.at(-1)!.capitalRestantDu, 0, `solde final ${mode} ${taux}%`);
    assert.equal(e.lignes.length, 12);
  }
}
// Annuité constante 12 mois à 18 % : mensualité connue ≈ 91 679,99
const c = genererEcheancier({ montant: 1_000_000, tauxAnnuel: 18, dureeMois: 12, periodicite: 'mensuel', mode: 'constant', dateDebut: debut });
assert.ok(Math.abs(c.lignes[0].montantTotal - 91_679.98) < 1, `mensualité ${c.lignes[0].montantTotal}`);
// Fin de mois : 31 janvier + 1 mois => 28 février
assert.equal(c.lignes[0].dateEcheance.toISOString().slice(0, 10), '2026-02-28');
// Différé de 3 mois : intérêts seuls puis amortissement
const d = genererEcheancier({ montant: 1_000_000, tauxAnnuel: 12, dureeMois: 12, periodicite: 'mensuel', mode: 'constant', differeMois: 3, dateDebut: debut });
assert.deepEqual(d.lignes.slice(0, 3).map((l) => l.capital), [0, 0, 0]);
assert.equal(d.lignes.at(-1)!.capitalRestantDu, 0);
// Trimestriel
const t = genererEcheancier({ montant: 900_000, tauxAnnuel: 12, dureeMois: 12, periodicite: 'trimestriel', mode: 'degressif', dateDebut: debut });
assert.equal(t.lignes.length, 4);
// Paramètres invalides
assert.throws(() => genererEcheancier({ montant: 1000, tauxAnnuel: 10, dureeMois: 10, periodicite: 'trimestriel', mode: 'constant', dateDebut: debut }));
assert.ok(mensualiteEquivalente(c, 'mensuel') > 0);
console.log('echeancier OK');

// ── TVA ──────────────────────────────────────────────────────────────────────
{
  const sans = genererEcheancier({ montant: 1_000_000, tauxAnnuel: 18, dureeMois: 12, periodicite: 'mensuel', mode: 'constant', fraisDossier: 20_000, dateDebut: debut });
  assert.equal(sans.totalTva, 0, 'sans taux : aucune TVA');
  assert.equal(sans.lignes[0].montantTotal, c.lignes[0].montantTotal, 'sans taux, échéance inchangée');
  const tva = genererEcheancier({ montant: 1_000_000, tauxAnnuel: 18, dureeMois: 12, periodicite: 'mensuel', mode: 'constant', fraisDossier: 20_000, tauxTva: 19.25, dateDebut: debut });
  // 1re échéance : intérêts 15 000 × 19,25 % = 2 887,50 de TVA
  assert.equal(tva.lignes[0].interet, 15_000);
  assert.equal(tva.lignes[0].tva, 2_887.5, 'TVA de la 1re échéance');
  assert.equal(Math.round((tva.lignes[0].montantTotal - tva.lignes[0].capital - tva.lignes[0].interet) * 100) / 100, 2_887.5, 'échéance = capital + intérêts + TVA');
  assert.equal(Math.round(tva.totalTva * 100) / 100, Math.round(tva.lignes.reduce((s, l) => s + l.tva, 0) * 100) / 100, 'total TVA = somme des lignes');
  assert.ok(Math.abs(tva.totalTva - tva.totalInterets * 0.1925) < 0.5 * tva.lignes.length, 'TVA ≈ 19,25 % des intérêts (arrondis par ligne)');
  assert.equal(tva.tvaFraisDossier, 3_850, 'TVA sur frais de dossier : 20 000 × 19,25 %');
  assert.equal(tva.lignes.at(-1)!.capitalRestantDu, 0, 'le capital reste soldé avec TVA');
  assert.equal(Math.round(tva.lignes.reduce((s, l) => s + l.capital, 0)), 1_000_000, 'la TVA ne touche pas le capital');
  assert.ok(tva.coutTotal > sans.coutTotal && tva.teg > sans.teg, 'le coût et le TEG intègrent la TVA');
  const seulementFrais = genererEcheancier({ montant: 1_000_000, tauxAnnuel: 18, dureeMois: 12, periodicite: 'mensuel', mode: 'constant', fraisDossier: 20_000, tauxTva: 19.25, tvaSurInterets: false, dateDebut: debut });
  assert.equal(seulementFrais.totalTva, 0, 'TVA sur intérêts désactivée');
  assert.equal(seulementFrais.tvaFraisDossier, 3_850, 'TVA sur frais seuls');
  const seulementInterets = genererEcheancier({ montant: 1_000_000, tauxAnnuel: 18, dureeMois: 12, periodicite: 'mensuel', mode: 'constant', fraisDossier: 20_000, tauxTva: 19.25, tvaSurFrais: false, dateDebut: debut });
  assert.equal(seulementInterets.tvaFraisDossier, 0, 'TVA sur frais désactivée');
  // Ventilation d'un règlement : pénalités, intérêts, TVA, puis capital
  const v = ventiler({ capital: 70_000, interet: 15_000, frais: 0, penalite: 1_000, tva: 2_887.5 }, 0, 19_000);
  assert.deepEqual([v.penalites, v.interets, v.tva, v.capital], [1_000, 15_000, 2_887.5, 112.5], 'ventilation avec TVA');
  console.log('tva OK');
}
