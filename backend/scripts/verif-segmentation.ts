import assert from 'node:assert/strict';
import { calculerScoreClient } from '../src/lib/segmentation';

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

console.log('segmentation OK');
