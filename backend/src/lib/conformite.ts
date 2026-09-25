import prisma from './prisma';
import { NiveauAlerte } from '@prisma/client';
import { emettre } from './notifier';
import { parametreNombre } from './parametres';

/**
 * Conformité : filtrage sur listes de surveillance (LCB-FT) et alertes d'anomalies.
 * Les règles sont déterministes et lisibles ; chaque alerte porte une empreinte qui
 * évite de la signaler deux fois pour la même situation.
 */

// ─── Listes de surveillance ───────────────────────────────────────────────────

export function normaliserNom(s: string | null | undefined): string[] {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter((t) => t.length > 1).sort();
}

/** Similarité de jeu de mots (Jaccard) : insensible à l'ordre nom / prénom, aux accents et à la casse. */
export function similarite(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const B = new Set(b);
  const inter = a.filter((t) => B.has(t)).length;
  return inter / new Set([...a, ...b]).size;
}

export interface CorrespondanceSurveillance {
  entreeId: number; nom: string; categorie: string; source: string | null; motif: string | null; score: number; raison: 'piece' | 'nom';
}

export async function rechercherSurveillance(p: { nom?: string | null; prenom?: string | null; numeroPiece?: string | null; seuil?: number }): Promise<CorrespondanceSurveillance[]> {
  const seuil = p.seuil ?? 0.75;
  const cible = normaliserNom(`${p.prenom ?? ''} ${p.nom ?? ''}`);
  const piece = (p.numeroPiece ?? '').replace(/\s+/g, '').toUpperCase();
  const entrees = await prisma.entreeSurveillance.findMany({ where: { actif: true } });
  const hits: CorrespondanceSurveillance[] = [];
  for (const e of entrees) {
    const libelle = `${e.prenom ?? ''} ${e.nom}`.trim();
    if (piece && e.numeroPiece && e.numeroPiece.replace(/\s+/g, '').toUpperCase() === piece) {
      hits.push({ entreeId: e.id, nom: libelle, categorie: e.categorie, source: e.source, motif: e.motif, score: 1, raison: 'piece' });
      continue;
    }
    const score = similarite(cible, normaliserNom(libelle));
    if (score >= seuil) hits.push({ entreeId: e.id, nom: libelle, categorie: e.categorie, source: e.source, motif: e.motif, score: Math.round(score * 100) / 100, raison: 'nom' });
  }
  return hits.sort((a, b) => b.score - a.score);
}

// ─── Alertes ──────────────────────────────────────────────────────────────────

export async function alerter(a: {
  code: string; niveau: NiveauAlerte; titre: string; description?: string; empreinte: string;
  entiteType?: string; entiteId?: number; agenceId?: number | null; utilisateurId?: number | null; donnees?: Record<string, unknown>;
}): Promise<boolean> {
  const existante = await prisma.alerteConformite.findUnique({ where: { empreinte: a.empreinte }, select: { id: true } });
  if (existante) return false;
  try {
    await prisma.alerteConformite.create({
      data: {
        code: a.code, niveau: a.niveau, titre: a.titre, description: a.description ?? null, empreinte: a.empreinte,
        entiteType: a.entiteType ?? null, entiteId: a.entiteId ?? null, agenceId: a.agenceId ?? null, utilisateurId: a.utilisateurId ?? null,
        donnees: (a.donnees ?? undefined) as never,
      },
    });
  } catch {
    return false; // course avec une autre instance : l'alerte existe déjà
  }
  void emettre('conformite.alerte', {
    entiteType: a.entiteType, entiteId: a.entiteId, agenceId: a.agenceId,
    donnees: { titreAlerte: a.titre, description: a.description ?? a.titre, lien: '/dashboard/conformite' },
  });
  return true;
}

/** Contrôle immédiat d'une opération financière au-dessus du seuil déclaratif. */
export async function verifierOperation(o: { montant: number; type: string; entiteType: string; entiteId: number; agenceId?: number | null; clientId?: number; libelle: string }) {
  try {
    const seuil = await parametreNombre('conformite.seuil_operation_elevee');
    if (o.montant >= seuil) {
      await alerter({
        code: 'montant_eleve', niveau: o.montant >= seuil * 4 ? 'critique' : 'eleve',
        titre: `Opération élevée : ${o.montant} FCFA`, description: `${o.libelle} (${o.type}) atteint le seuil de vigilance de ${seuil} FCFA.`,
        empreinte: `montant:${o.entiteType}:${o.entiteId}`, entiteType: o.entiteType, entiteId: o.entiteId, agenceId: o.agenceId,
        donnees: { montant: o.montant, seuil, clientId: o.clientId },
      });
    }
  } catch (e) {
    console.error('[conformite] verifierOperation', e);
  }
}

/** Analyse quotidienne des anomalies des dernières 24 heures. Renvoie le nombre d'alertes créées. */
export async function analyserAnomalies(): Promise<{ fractionnement: number; clientsBloques: number; piecesExpirees: number; ecartsCollecte: number }> {
  const res = { fractionnement: 0, clientsBloques: 0, piecesExpirees: 0, ecartsCollecte: 0 };
  const depuis = new Date(Date.now() - 24 * 3600 * 1000);
  const jour = new Date().toISOString().slice(0, 10);

  // Fractionnement : plusieurs opérations rapprochées sur un même client, dont le cumul franchit le seuil.
  const seuilFrac = await parametreNombre('conformite.seuil_fractionnement');
  const seuilUnitaire = await parametreNombre('conformite.seuil_operation_elevee');
  const ops = await prisma.transaction.findMany({
    where: { createdAt: { gte: depuis } },
    select: { montant: true, compte: { select: { clientId: true, client: { select: { agenceId: true, nom: true, prenom: true } } } } },
  });
  const parClient = new Map<number, { total: number; nb: number; agenceId: number; nom: string; max: number }>();
  for (const o of ops) {
    const c = parClient.get(o.compte.clientId) ?? { total: 0, nb: 0, agenceId: o.compte.client.agenceId, nom: `${o.compte.client.prenom ?? ''} ${o.compte.client.nom}`.trim(), max: 0 };
    c.total += Number(o.montant); c.nb += 1; c.max = Math.max(c.max, Number(o.montant));
    parClient.set(o.compte.clientId, c);
  }
  for (const [clientId, c] of parClient) {
    // Si une opération isolée dépasse déjà le seuil, elle a sa propre alerte : on ne double pas.
    if (c.nb >= 3 && c.total >= seuilFrac && c.max < seuilUnitaire) {
      if (await alerter({
        code: 'fractionnement', niveau: 'eleve', titre: `Fractionnement suspecté : ${c.nom}`,
        description: `${c.nb} opérations pour ${Math.round(c.total)} FCFA en 24 h, chacune sous le seuil de ${seuilUnitaire} FCFA.`,
        empreinte: `fract:${clientId}:${jour}`, entiteType: 'client', entiteId: clientId, agenceId: c.agenceId, donnees: { total: c.total, nb: c.nb },
      })) res.fractionnement++;
    }
  }

  // Client blacklisté portant un crédit vivant.
  const bloques = await prisma.demandeCredit.findMany({
    where: { statut: { in: ['decaissee', 'approuvee', 'contrat_edite'] }, client: { statut: 'blackliste' } },
    select: { id: true, reference: true, agenceId: true, clientId: true },
  });
  for (const d of bloques) {
    if (await alerter({
      code: 'client_blackliste', niveau: 'eleve', titre: `Crédit actif sur client blacklisté : ${d.reference}`,
      empreinte: `blackliste:${d.id}`, entiteType: 'demande_credit', entiteId: d.id, agenceId: d.agenceId,
    })) res.clientsBloques++;
  }

  // Pièce d'identité expirée sur un client au crédit vivant.
  const expirees = await prisma.pieceIdentite.findMany({
    where: { dateExpiration: { lt: new Date() }, dossier: { client: { demandesCredit: { some: { statut: 'decaissee' } } } } },
    select: { id: true, numero: true, dossier: { select: { id: true, client: { select: { id: true, agenceId: true, nom: true } } } } },
  });
  for (const p of expirees) {
    if (await alerter({
      code: 'piece_expiree', niveau: 'moyen', titre: `Pièce d'identité expirée : ${p.dossier.client?.nom ?? ''}`,
      description: `La pièce n° ${p.numero} est expirée alors que le client a un crédit en cours.`,
      empreinte: `piece:${p.id}`, entiteType: 'dossier_kyc', entiteId: p.dossier.id, agenceId: p.dossier.client?.agenceId,
    })) res.piecesExpirees++;
  }

  // Journées de collecte clôturées avec écart non traité depuis plus de 24 h.
  const ecarts = await prisma.journeeCollecte.findMany({
    where: { ecart: { not: 0 }, statut: 'rapprochee', rapprocheAt: { gte: depuis } },
    select: { id: true, ecart: true, date: true, agent: { select: { utilisateur: { select: { agenceId: true, prenom: true, nom: true } } } } },
  });
  for (const j of ecarts) {
    if (await alerter({
      code: 'ecart_collecte', niveau: Math.abs(Number(j.ecart)) >= seuilUnitaire / 10 ? 'eleve' : 'moyen',
      titre: `Écart de collecte de ${Number(j.ecart)} FCFA`, description: `Journée du ${j.date.toISOString().slice(0, 10)} de ${j.agent.utilisateur.prenom} ${j.agent.utilisateur.nom}.`,
      empreinte: `ecart:${j.id}`, entiteType: 'journee_collecte', entiteId: j.id, agenceId: j.agent.utilisateur.agenceId,
    })) res.ecartsCollecte++;
  }
  return res;
}
