import assert from 'node:assert/strict';
import { calculerScoreClient, calculerScoresEtendus } from '../src/lib/segmentation';

const SEUIL_DORMANT = 180;
const SEUIL_PREMIUM = 80;

// ── Client nouveau (moins de 3 mois), aucune donnée ───────────────────────────
{
  const r = calculerScoreClient(
    { ancienneteMois: 1, encoursCredit: 0, soldeEpargne: 0, montantImpaye: 0, dossierRecouvrementOuvert: false, joursDepuisDernierContact: null, joursDepuisDerniereTransaction: null },
    SEUIL_DORMANT, SEUIL_PREMIUM,
  );
  assert.equal(r.cycleVie, 'nouveau', 'moins de 3 mois => nouveau');
  assert.equal(r.score, 50, 'score de base sans autre signal');
}

// ── Client à risque : un dossier de recouvrement ouvert prime sur tout le reste ──
{
  const r = calculerScoreClient(
    { ancienneteMois: 36, encoursCredit: 500_000, soldeEpargne: 1_000_000, montantImpaye: 50_000, dossierRecouvrementOuvert: true, joursDepuisDernierContact: 5, joursDepuisDerniereTransaction: 5 },
    SEUIL_DORMANT, SEUIL_PREMIUM,
  );
  assert.equal(r.cycleVie, 'a_risque', 'dossier de recouvrement ouvert => à risque, même avec une épargne confortable');
}

// ── Client dormant : ni contact ni transaction depuis plus de 180 jours ──────────
{
  const r = calculerScoreClient(
    { ancienneteMois: 24, encoursCredit: 0, soldeEpargne: 200_000, montantImpaye: 0, dossierRecouvrementOuvert: false, joursDepuisDernierContact: 400, joursDepuisDerniereTransaction: 400 },
    SEUIL_DORMANT, SEUIL_PREMIUM,
  );
  assert.equal(r.cycleVie, 'dormant');
}

// ── Un contact récent malgré une transaction ancienne n'est PAS dormant ──────────
{
  const r = calculerScoreClient(
    { ancienneteMois: 24, encoursCredit: 0, soldeEpargne: 200_000, montantImpaye: 0, dossierRecouvrementOuvert: false, joursDepuisDernierContact: 10, joursDepuisDerniereTransaction: 400 },
    SEUIL_DORMANT, SEUIL_PREMIUM,
  );
  assert.notEqual(r.cycleVie, 'dormant', 'un contact récent suffit à exclure le statut dormant');
}

// ── Client premium : ancienneté, épargne confortable, aucun impayé, contact récent ──
{
  const r = calculerScoreClient(
    { ancienneteMois: 60, encoursCredit: 300_000, soldeEpargne: 2_000_000, montantImpaye: 0, dossierRecouvrementOuvert: false, joursDepuisDernierContact: 15, joursDepuisDerniereTransaction: 15 },
    SEUIL_DORMANT, SEUIL_PREMIUM,
  );
  assert.ok(r.score >= SEUIL_PREMIUM, `score attendu >= ${SEUIL_PREMIUM}, obtenu ${r.score}`);
  assert.equal(r.cycleVie, 'premium');
}

// ── Potentiel : épargne + pas de crédit + ancienneté + dossier propre = opportunité maximale ──
{
  const r = calculerScoreClient(
    { ancienneteMois: 12, encoursCredit: 0, soldeEpargne: 300_000, montantImpaye: 0, dossierRecouvrementOuvert: false, joursDepuisDernierContact: 20, joursDepuisDerniereTransaction: 20 },
    SEUIL_DORMANT, SEUIL_PREMIUM,
  );
  assert.equal(r.potentiel, 100, 'épargne + sans crédit + ancienneté suffisante + aucun impayé => potentiel maximal');
}

// ── Bornes : le score et le potentiel restent dans [0, 100] même sur des cas extrêmes ──
{
  const r = calculerScoreClient(
    { ancienneteMois: 0, encoursCredit: 0, soldeEpargne: 0, montantImpaye: 10_000_000, dossierRecouvrementOuvert: true, joursDepuisDernierContact: 9999, joursDepuisDerniereTransaction: 9999 },
    SEUIL_DORMANT, SEUIL_PREMIUM,
  );
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(r.potentiel >= 0 && r.potentiel <= 100);
}

// ── Jamais contacté ni transacté depuis 2 ans : dormant, pas « actif » ────────────
{
  const r = calculerScoreClient(
    { ancienneteMois: 24, encoursCredit: 0, soldeEpargne: 0, montantImpaye: 0, dossierRecouvrementOuvert: false, joursDepuisDernierContact: null, joursDepuisDerniereTransaction: null },
    SEUIL_DORMANT, SEUIL_PREMIUM,
  );
  assert.equal(r.cycleVie, 'dormant', 'jamais contacté depuis l\'entrée en relation = inactif depuis l\'ancienneté');
}

// ── Lot 15 : perdu / à réactiver ─────────────────────────────────────────────────
const SEUIL_PERDU = 540, SEUIL_REACTIVATION = 7;
const FAITS = { nombreIncidents90j: 0, nombreInteractions90j: 0, derniereDemandeScoreValeur: null, nombreProduitsDistincts: 1, cycleVieAnterieur: null };
{
  const d = { ancienneteMois: 24, encoursCredit: 0, soldeEpargne: 10_000, montantImpaye: 0, dossierRecouvrementOuvert: false, joursDepuisDernierContact: 600, joursDepuisDerniereTransaction: 600 };
  assert.equal(calculerScoresEtendus(d, FAITS, SEUIL_DORMANT, SEUIL_PREMIUM, SEUIL_PERDU, SEUIL_REACTIVATION).cycleVie, 'perdu');
  // Même inactivité mais un crédit en cours : on ne le considère pas perdu.
  assert.equal(calculerScoresEtendus({ ...d, encoursCredit: 100_000 }, FAITS, SEUIL_DORMANT, SEUIL_PREMIUM, SEUIL_PERDU, SEUIL_REACTIVATION).cycleVie, 'dormant');
  // 400 jours : dormant, pas encore perdu.
  assert.equal(calculerScoresEtendus({ ...d, joursDepuisDernierContact: 400, joursDepuisDerniereTransaction: 400 }, FAITS, SEUIL_DORMANT, SEUIL_PREMIUM, SEUIL_PERDU, SEUIL_REACTIVATION).cycleVie, 'dormant');
}
{
  // Était perdu, recontacté il y a 2 jours : fenêtre de réactivation (le moteur de base dit « actif »).
  const d = { ancienneteMois: 24, encoursCredit: 0, soldeEpargne: 10_000, montantImpaye: 0, dossierRecouvrementOuvert: false, joursDepuisDernierContact: 2, joursDepuisDerniereTransaction: 600 };
  assert.equal(calculerScoresEtendus(d, { ...FAITS, cycleVieAnterieur: 'perdu' }, SEUIL_DORMANT, SEUIL_PREMIUM, SEUIL_PERDU, SEUIL_REACTIVATION).cycleVie, 'a_reactiver');
  // Passé la fenêtre, il retombe sur son cycle normal.
  assert.equal(calculerScoresEtendus({ ...d, joursDepuisDernierContact: 20 }, { ...FAITS, cycleVieAnterieur: 'a_reactiver' }, SEUIL_DORMANT, SEUIL_PREMIUM, SEUIL_PERDU, SEUIL_REACTIVATION).cycleVie, 'actif');
  // Un client déjà actif recontacté n'est pas « à réactiver ».
  assert.equal(calculerScoresEtendus(d, { ...FAITS, cycleVieAnterieur: 'actif' }, SEUIL_DORMANT, SEUIL_PREMIUM, SEUIL_PERDU, SEUIL_REACTIVATION).cycleVie, 'actif');
}

// ── Lot 15 : toutes les familles restent dans [0, 100] ──────────────────────────
{
  const extremes = [
    { ancienneteMois: 0, encoursCredit: 0, soldeEpargne: 0, montantImpaye: 9e9, dossierRecouvrementOuvert: true, joursDepuisDernierContact: null, joursDepuisDerniereTransaction: null },
    { ancienneteMois: 600, encoursCredit: 9e9, soldeEpargne: 9e9, montantImpaye: 0, dossierRecouvrementOuvert: false, joursDepuisDernierContact: 0, joursDepuisDerniereTransaction: 0 },
  ];
  for (const d of extremes) {
    const r = calculerScoresEtendus(d, { ...FAITS, nombreIncidents90j: 50, nombreInteractions90j: 500, nombreProduitsDistincts: 0 }, SEUIL_DORMANT, SEUIL_PREMIUM, SEUIL_PERDU, SEUIL_REACTIVATION);
    for (const k of ['scoreCredit', 'scoreRisque', 'scoreRelationnel', 'scoreStrategique', 'scoreCroissance', 'scoreAttrition'] as const) {
      assert.ok(r[k] >= 0 && r[k] <= 100 && Number.isInteger(r[k]), `${k} borné et entier (${r[k]})`);
    }
  }
}

console.log('segmentation OK');
