import prisma from './prisma';
import { emettre } from './notifier';
import { parametreNombre } from './parametres';

/**
 * Moteur de relances commerciales (compléments stratégiques, point 4). Règles déterministes,
 * pas de modèle statistique : chaque relance suggérée est explicable par la donnée qui l'a
 * déclenchée. Exécuté chaque nuit par la tâche planifiée `relances_commerciales` ; un
 * refroidissement (cooldown) évite de renotifier le même commercial pour le même client/prospect
 * à chaque exécution.
 */

async function dejaNotifie(code: string, entiteType: string, entiteId: number, cooldownJours: number): Promise<boolean> {
  const depuis = new Date(Date.now() - cooldownJours * 86_400_000);
  const e = await prisma.evenementMetier.findFirst({ where: { code, entiteType, entiteId, createdAt: { gte: depuis } }, select: { id: true } });
  return Boolean(e);
}

export async function genererRelancesCommerciales(): Promise<{ dormants: number; opportunites: number; prospects_stagnants: number }> {
  const cooldownJours = await parametreNombre('commercial.relance_cooldown_jours');
  const seuilPotentiel = await parametreNombre('commercial.potentiel_score_min');
  const seuilProspectJours = await parametreNombre('commercial.prospect_stagnant_jours');

  let dormants = 0, opportunites = 0, prospectsStagnants = 0;

  // ── Clients dormants ou à fort potentiel, vus via leur score déjà calculé (lib/segmentation.ts) ──
  const scores = await prisma.scoreClient.findMany({
    where: { OR: [{ cycleVie: 'dormant' }, { potentiel: { gte: seuilPotentiel } }] },
    include: { client: { select: { id: true, nom: true, prenom: true, commercialId: true, agenceId: true } } },
  });
  for (const s of scores) {
    const c = s.client;
    if (s.cycleVie === 'dormant') {
      if (await dejaNotifie('commercial.client_dormant', 'client', c.id, cooldownJours)) continue;
      await emettre('commercial.client_dormant', {
        entiteType: 'client', entiteId: c.id, agenceId: c.agenceId, acteurId: c.commercialId,
        donnees: { client: `${c.prenom ?? ''} ${c.nom}`.trim(), jours: s.joursDepuisDernierContact ?? s.joursDepuisDerniereTransaction ?? '?' },
      });
      dormants++;
    } else if (s.potentiel >= seuilPotentiel && Number(s.encoursCredit) === 0) {
      if (await dejaNotifie('commercial.opportunite', 'client', c.id, cooldownJours)) continue;
      await emettre('commercial.opportunite', {
        entiteType: 'client', entiteId: c.id, agenceId: c.agenceId, acteurId: c.commercialId,
        donnees: { client: `${c.prenom ?? ''} ${c.nom}`.trim() },
      });
      opportunites++;
    }
  }

  // ── Prospects sans suite ──────────────────────────────────────────────────────────────────
  const limite = new Date(Date.now() - seuilProspectJours * 86_400_000);
  const prospects = await prisma.prospect.findMany({
    where: { statut: { notIn: ['converti', 'perdu'] }, updatedAt: { lte: limite } },
    select: { id: true, nom: true, prenom: true, statut: true, commercialId: true, zoneId: true, updatedAt: true, interactions: { orderBy: { dateInteraction: 'desc' }, take: 1, select: { dateInteraction: true } } },
  });
  for (const p of prospects) {
    const dernierContact = p.interactions[0]?.dateInteraction ?? p.updatedAt;
    if (dernierContact > limite) continue; // une interaction récente retire le prospect de la liste
    if (await dejaNotifie('commercial.prospect_stagnant', 'prospect', p.id, cooldownJours)) continue;
    const jours = Math.floor((Date.now() - dernierContact.getTime()) / 86_400_000);
    await emettre('commercial.prospect_stagnant', {
      entiteType: 'prospect', entiteId: p.id, acteurId: p.commercialId,
      donnees: { prospect: `${p.prenom ?? ''} ${p.nom}`.trim(), statut: p.statut, jours },
    });
    prospectsStagnants++;
  }

  return { dormants, opportunites, prospects_stagnants: prospectsStagnants };
}
