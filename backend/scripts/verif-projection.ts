import assert from 'node:assert/strict';
import { projeterAvancement } from '../src/modules/objectifs/objectifs.calcul';

const debut = new Date('2026-01-01T00:00:00Z');
const fin = new Date('2026-01-31T00:00:00Z'); // période de 31 jours

// ── Rythme constant, exactement au rythme nécessaire pour atteindre la cible ────
{
  // 15 jours écoulés sur 31 : au rythme exact nécessaire, le réalisé est 1 000 000 * 15 / 31.
  const maintenant = new Date('2026-01-16T00:00:00Z');
  const p = projeterAvancement(debut, fin, 1_000_000, 1_000_000 * (15 / 31), maintenant);
  assert.ok(Math.abs(p.ecart_projete_pct as number) < 1, `écart quasi nul attendu, obtenu ${p.ecart_projete_pct}`);
  assert.equal(p.cible_suggeree, null, 'pas de suggestion quand la trajectoire correspond déjà à la cible');
}

// ── Rythme insuffisant : la projection tombe nettement sous la cible ────────────
{
  const maintenant = new Date('2026-01-16T00:00:00Z'); // 15 jours écoulés
  const p = projeterAvancement(debut, fin, 1_000_000, 200_000, maintenant); // rythme ~13 333/jour
  assert.ok((p.ecart_projete_pct as number) < -10, `écart projeté fortement négatif attendu, obtenu ${p.ecart_projete_pct}`);
  assert.ok(p.cible_suggeree !== null && p.cible_suggeree < 1_000_000, 'une cible réajustée à la baisse est suggérée');
}

// ── Moins de 7 jours écoulés : trop tôt pour une tendance fiable ────────────────
{
  const maintenant = new Date('2026-01-03T00:00:00Z'); // 2 jours écoulés
  const p = projeterAvancement(debut, fin, 1_000_000, 50_000, maintenant);
  assert.equal(p.ecart_projete_pct, null, 'aucune projection avant une semaine de recul');
  assert.equal(p.cible_suggeree, null);
}

// ── Rythme excellent : au-delà de la cible, une suggestion à la hausse est proposée ──
{
  const maintenant = new Date('2026-01-16T00:00:00Z');
  const p = projeterAvancement(debut, fin, 1_000_000, 800_000, maintenant); // rythme ~53 333/jour
  assert.ok((p.ecart_projete_pct as number) > 10);
  assert.ok(p.cible_suggeree !== null && p.cible_suggeree > 1_000_000, 'une cible réajustée à la hausse est suggérée en cas de surperformance');
}

console.log('projection OK');
