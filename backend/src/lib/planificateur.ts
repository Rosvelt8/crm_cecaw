import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { traiterFileSms } from './sms';
import { analyserAnomalies } from './conformite';
import { emettre } from './notifier';
import { parametreNombre } from './parametres';
import { sauvegarder } from './sauvegarde';
import { detecterImpayes } from '../modules/recouvrement/recouvrement.service';
import { recalculerObjectifs } from '../modules/objectifs/objectifs.calcul';
import { recalculerScoresClients } from './segmentation';
import { genererRelancesCommerciales } from './relancesCommerciales';

/**
 * Planificateur de tâches. Les tâches quotidiennes sont verrouillées en base : la ligne
 * (nom, jour, occurrence) est insérée avant l'exécution, si bien que deux instances du serveur
 * ne lancent jamais la même tâche le même jour. Les tâches périodiques sont idempotentes et
 * n'ont pas besoin de verrou.
 */

interface Tache {
  nom: string;
  libelle: string;
  /** Heure UTC à partir de laquelle la tâche quotidienne peut partir ; absent pour une tâche périodique. */
  heureUtc?: number;
  intervalMin?: number;
  actif?: () => boolean;
  executer: () => Promise<unknown>;
}

/** Rappels d'échéance : un SMS aux clients dont une échéance arrive dans N jours. */
export async function rappelsEcheance(): Promise<{ envoyes: number }> {
  const jours = await parametreNombre('communication.rappel_echeance_jours');
  if (jours <= 0) return { envoyes: 0 };
  const cible = new Date(); cible.setUTCHours(0, 0, 0, 0); cible.setUTCDate(cible.getUTCDate() + jours);
  const echeances = await prisma.echeance.findMany({
    where: { dateEcheance: cible, statut: { in: ['a_echoir', 'partiellement_payee'] }, demande: { statut: 'decaissee' } },
    select: { id: true, montantTotal: true, montantPaye: true, dateEcheance: true, demande: { select: { reference: true, agenceId: true, client: { select: { telephone: true } } } } },
  });
  let envoyes = 0;
  const debutJour = new Date(); debutJour.setUTCHours(0, 0, 0, 0);
  for (const e of echeances) {
    // Une relance manuelle de la tâche le même jour ne renvoie pas le SMS deux fois.
    const deja = await prisma.evenementMetier.findFirst({ where: { code: 'credit.rappel_echeance', entiteId: e.id, createdAt: { gte: debutJour } }, select: { id: true } });
    if (deja) continue;
    await emettre('credit.rappel_echeance', {
      entiteType: 'echeance', entiteId: e.id, agenceId: e.demande.agenceId,
      donnees: { reference: e.demande.reference, montant: Math.round(Number(e.montantTotal) - Number(e.montantPaye)), date: e.dateEcheance.toISOString().slice(0, 10), telephone: e.demande.client.telephone },
    });
    envoyes++;
  }
  return { envoyes };
}

export const TACHES: Tache[] = [
  { nom: 'detection_impayes', libelle: 'Détection des impayés, pénalités et relances automatiques', heureUtc: 3, executer: detecterImpayes },
  { nom: 'rappels_echeance', libelle: "SMS de rappel avant échéance", heureUtc: 6, executer: rappelsEcheance },
  { nom: 'analyse_anomalies', libelle: "Analyse des anomalies de conformité", heureUtc: 4, executer: analyserAnomalies },
  { nom: 'objectifs', libelle: 'Recalcul des objectifs et alertes sur écarts', heureUtc: 5, executer: recalculerObjectifs },
  { nom: 'score_clients', libelle: 'Recalcul du score et du cycle de vie des clients', heureUtc: 1, executer: recalculerScoresClients },
  { nom: 'relances_commerciales', libelle: 'Suggestions de relance pour les commerciaux (clients dormants, opportunités, prospects stagnants)', heureUtc: 2, executer: genererRelancesCommerciales },
  { nom: 'sauvegarde', libelle: 'Sauvegarde chiffrée de la base', heureUtc: 2, actif: () => process.env.BACKUP_ENABLED === 'true', executer: sauvegarder },
  { nom: 'file_sms', libelle: "Envoi des SMS en attente", intervalMin: 2, executer: () => traiterFileSms() },
];

const aujourdhui = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

/** Exécute une tâche. `forcer` la relance même si elle a déjà tourné aujourd'hui (occurrence suivante). */
export async function executerTache(nom: string, forcer = false): Promise<{ execute: boolean; resultat?: unknown; raison?: string }> {
  const tache = TACHES.find((t) => t.nom === nom);
  if (!tache) throw Object.assign(new Error(`Tâche inconnue : ${nom}`), { status: 404 });

  if (tache.intervalMin) {
    try { return { execute: true, resultat: await tache.executer() }; }
    catch (e) { console.error(`[planificateur] ${nom}`, e); return { execute: true, raison: (e as Error).message }; }
  }

  const jour = aujourdhui();
  let occurrence = 0;
  if (forcer) {
    const derniere = await prisma.tacheExecution.findFirst({ where: { nom, jour }, orderBy: { occurrence: 'desc' }, select: { occurrence: true } });
    occurrence = (derniere?.occurrence ?? -1) + 1;
  }
  let ligne;
  try {
    ligne = await prisma.tacheExecution.create({ data: { nom, jour, occurrence, statut: 'en_cours' } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { execute: false, raison: 'Déjà exécutée aujourd\'hui.' };
    throw e;
  }
  try {
    const resultat = await tache.executer();
    await prisma.tacheExecution.update({ where: { id: ligne.id }, data: { statut: 'ok', finAt: new Date(), resultat: resultat as never } });
    return { execute: true, resultat };
  } catch (e) {
    console.error(`[planificateur] ${nom}`, e);
    await prisma.tacheExecution.update({ where: { id: ligne.id }, data: { statut: 'echec', finAt: new Date(), erreur: (e as Error).message.slice(0, 1000) } });
    return { execute: true, raison: (e as Error).message };
  }
}

export async function etatTaches() {
  const dernieres = await prisma.tacheExecution.findMany({ orderBy: { debutAt: 'desc' }, take: 100 });
  return TACHES.map((t) => {
    const l = dernieres.find((d) => d.nom === t.nom);
    return { nom: t.nom, libelle: t.libelle, planification: t.intervalMin ? `toutes les ${t.intervalMin} min` : `chaque jour à ${String(t.heureUtc).padStart(2, '0')}h UTC`, active: t.actif ? t.actif() : true, derniere_execution: l?.debutAt ?? null, dernier_statut: l?.statut ?? null, derniere_erreur: l?.erreur ?? null };
  });
}

let minuterie: NodeJS.Timeout | null = null;
const dernierPassage = new Map<string, number>();
const dejaLanceAujourdhui = new Map<string, string>();

export function demarrerPlanificateur() {
  if (process.env.JOBS_ENABLED === 'false' || minuterie) return;
  const cycle = async () => {
    const maintenant = new Date();
    const cle = maintenant.toISOString().slice(0, 10);
    for (const t of TACHES) {
      if (t.actif && !t.actif()) continue;
      if (t.intervalMin) {
        if (Date.now() - (dernierPassage.get(t.nom) ?? 0) < t.intervalMin * 60_000) continue;
        dernierPassage.set(t.nom, Date.now());
        await executerTache(t.nom).catch(() => undefined);
      } else if (maintenant.getUTCHours() >= (t.heureUtc ?? 0) && dejaLanceAujourdhui.get(t.nom) !== cle) {
        dejaLanceAujourdhui.set(t.nom, cle);
        await executerTache(t.nom).catch(() => undefined);
      }
    }
  };
  // Premier passage différé : laisse le serveur finir son démarrage avant de charger la base.
  setTimeout(() => { void cycle(); }, 30_000).unref();
  minuterie = setInterval(() => { void cycle(); }, 60_000);
  minuterie.unref();
  console.log('[planificateur] démarré');
}
