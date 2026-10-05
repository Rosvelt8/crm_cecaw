import assert from 'node:assert/strict';
import { calculerAppetenceProduit, type ClientAppetenceRef, type ProduitAppetenceRef } from '../src/lib/appetence';

const PRODUIT_EPARGNE: ProduitAppetenceRef = { id: 1, groupeId: 1, type: 'epargne', ageMin: null, ageMax: null, ancienneteActiviteMinMois: null, montantMax: null };
const PRODUIT_CREDIT_A: ProduitAppetenceRef = { id: 2, groupeId: 3, type: 'credit', ageMin: 21, ageMax: 65, ancienneteActiviteMinMois: 12, montantMax: 500_000 };
const PRODUIT_CREDIT_B: ProduitAppetenceRef = { id: 3, groupeId: 3, type: 'credit', ageMin: 21, ageMax: 65, ancienneteActiviteMinMois: 12, montantMax: 2_000_000 };

const clientDe = (overrides: Partial<ClientAppetenceRef>): ClientAppetenceRef => ({
  statut: 'actif', dateNaissance: new Date('1990-01-01'), ancienneteActiviteMois: 36,
  cycleVie: 'actif', score: 60, montantImpaye: 0, nombreIncidents90j: 0, encoursCredit: 0,
  produitsDetenusIds: new Set(), groupesDetenus: new Map(), ...overrides,
});

// ── Produit déjà détenu : aucune opportunité ────────────────────────────────────
{
  const client = clientDe({ produitsDetenusIds: new Set([1]) });
  const r = calculerAppetenceProduit(client, PRODUIT_EPARGNE);
  assert.equal(r.detenu, true);
  assert.equal(r.typeOpportunite, null);
}

// ── Client blacklisté : aucune proposition même sur un produit sans conditions ──
{
  const client = clientDe({ statut: 'blackliste' });
  const r = calculerAppetenceProduit(client, PRODUIT_EPARGNE);
  assert.equal(r.eligible, false);
}

// ── Client trop jeune pour le crédit : inéligible ───────────────────────────────
{
  const client = clientDe({ dateNaissance: new Date('2010-01-01') });
  const r = calculerAppetenceProduit(client, PRODUIT_CREDIT_A);
  assert.equal(r.eligible, false, 'âge inférieur au minimum requis');
}

// ── Ancienneté d'activité insuffisante : inéligible ─────────────────────────────
{
  const client = clientDe({ ancienneteActiviteMois: 2 });
  const r = calculerAppetenceProduit(client, PRODUIT_CREDIT_A);
  assert.equal(r.eligible, false, 'ancienneté d\'activité insuffisante');
}

// ── Client éligible, aucun produit détenu de cette famille : cross-sell ────────
{
  const client = clientDe({});
  const r = calculerAppetenceProduit(client, PRODUIT_CREDIT_A);
  assert.equal(r.eligible, true);
  assert.equal(r.typeOpportunite, 'cross_sell');
  assert.ok(r.score > 0 && r.score <= 100);
}

// ── Client détenant déjà un crédit proche de son plafond : up-sell vers un plafond supérieur ──
{
  const client = clientDe({
    produitsDetenusIds: new Set([2]), encoursCredit: 450_000,
    groupesDetenus: new Map([[3, { montantMaxDetenu: 500_000 }]]),
  });
  const r = calculerAppetenceProduit(client, PRODUIT_CREDIT_B);
  assert.equal(r.eligible, true);
  assert.equal(r.typeOpportunite, 'up_sell', 'encours à 90% du plafond actuel, produit candidat à plafond supérieur');
}

// ── Incident récent : pénalité sur un produit d'épargne, qui reste proposable ───
{
  const sain = calculerAppetenceProduit(clientDe({}), PRODUIT_EPARGNE);
  const avecIncident = calculerAppetenceProduit(clientDe({ nombreIncidents90j: 1 }), PRODUIT_EPARGNE);
  assert.equal(avecIncident.eligible, true);
  assert.ok(avecIncident.score < sain.score, 'un incident récent doit abaisser le score');
}

// ── Impayé : aucun crédit proposé (le commercial ne contourne pas le risque) ────
{
  const r = calculerAppetenceProduit(clientDe({ montantImpaye: 50_000 }), PRODUIT_CREDIT_A);
  assert.equal(r.eligible, false, 'pas de proposition de crédit à un client en impayé');
}

// ── Crédit en cours loin du plafond : pas de second crédit concurrent ───────────
{
  const client = clientDe({ produitsDetenusIds: new Set([2]), encoursCredit: 50_000, groupesDetenus: new Map([[3, { montantMaxDetenu: 500_000 }]]) });
  const r = calculerAppetenceProduit(client, PRODUIT_CREDIT_B);
  assert.equal(r.eligible, false, 'un crédit déjà en cours exclut un second crédit hors palier supérieur');
}

// ── Up-sell réservé au crédit : un encours de crédit ne se compare pas au plafond d'une épargne ──
{
  const EPARGNE_A: ProduitAppetenceRef = { ...PRODUIT_EPARGNE, id: 10, montantMax: 100_000 };
  const EPARGNE_B: ProduitAppetenceRef = { ...PRODUIT_EPARGNE, id: 11, montantMax: 5_000_000 };
  const client = clientDe({ produitsDetenusIds: new Set([10]), encoursCredit: 900_000, groupesDetenus: new Map([[1, { montantMaxDetenu: EPARGNE_A.montantMax }]]) });
  const r = calculerAppetenceProduit(client, EPARGNE_B);
  assert.equal(r.typeOpportunite, 'cross_sell', 'pas d\'up-sell sur un produit d\'épargne');
}

console.log('appetence OK');
