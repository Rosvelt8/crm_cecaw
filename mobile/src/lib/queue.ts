import { getJson, setJson } from './storage';
import { sendPosition } from '../api/agents';
import { createTransaction } from '../api/comptes';
import { arriveeVisite, clotureVisite, demarrerTournee, photoVisite, terminerTournee } from '../api/tournees';
import type { OperationTerrain, QueuedPosition, QueuedTransaction } from '../types';

/**
 * Un agent de collecte travaille souvent hors couverture. Tout ce qui part vers
 * le serveur est donc mis en file en cas d'echec reseau, puis rejoue plus tard.
 * La file des positions est bornee : au-dela, les plus anciennes sont perimees.
 */
const MAX_POSITIONS = 500;

export async function queuePosition(item: QueuedPosition): Promise<void> {
  const queue = (await getJson<QueuedPosition[]>('queuePositions')) ?? [];
  queue.push(item);
  await setJson('queuePositions', queue.slice(-MAX_POSITIONS));
}

export async function queuedPositionCount(): Promise<number> {
  return ((await getJson<QueuedPosition[]>('queuePositions')) ?? []).length;
}

/**
 * Rejoue les positions en attente, de la plus ancienne a la plus recente.
 * On s'arrete au premier echec pour ne pas vider la file dans le vide.
 */
export async function flushPositions(agentId: number): Promise<number> {
  const queue = (await getJson<QueuedPosition[]>('queuePositions')) ?? [];
  if (queue.length === 0) return 0;

  let sent = 0;
  for (const item of queue) {
    try {
      await sendPosition(agentId, item.latitude, item.longitude);
      sent += 1;
    } catch {
      break;
    }
  }

  await setJson('queuePositions', queue.slice(sent));
  return sent;
}

export async function queueTransaction(item: QueuedTransaction): Promise<void> {
  const queue = (await getJson<QueuedTransaction[]>('queueTransactions')) ?? [];
  queue.push(item);
  await setJson('queueTransactions', queue);
}

export async function queuedTransactionCount(): Promise<number> {
  return ((await getJson<QueuedTransaction[]>('queueTransactions')) ?? []).length;
}

/**
 * Rejoue les operations de collecte en attente. Contrairement aux positions,
 * une transaction perdue est un manque a gagner : on ne la retire de la file
 * qu'une fois acceptee par le serveur.
 */
export async function flushTransactions(): Promise<number> {
  const queue = (await getJson<QueuedTransaction[]>('queueTransactions')) ?? [];
  if (queue.length === 0) return 0;

  let sent = 0;
  for (const item of queue) {
    try {
      await createTransaction(item.compteId, {
        type: item.type,
        montant: item.montant,
        motif: item.motif,
        agent_id: item.agentId,
        client_uid: item.uid,
        effectue_le: item.uid ? item.at : undefined,
      });
      sent += 1;
    } catch {
      break;
    }
  }

  await setJson('queueTransactions', queue.slice(sent));
  return sent;
}

// Operations de terrain (tournees) ---------------------------------------------------------------

/** Ajoute une operation de tournee a la file ; elles sont rejouees dans l'ordre de saisie. */
export async function queueTerrain(op: OperationTerrain): Promise<void> {
  const queue = (await getJson<OperationTerrain[]>('queueTerrain')) ?? [];
  queue.push(op);
  await setJson('queueTerrain', queue);
}

export async function queuedTerrainCount(): Promise<number> {
  return ((await getJson<OperationTerrain[]>('queueTerrain')) ?? []).length;
}

/** Une erreur avec reponse HTTP est un refus metier ; sans reponse, c'est le reseau qui manque. */
const estRefus = (e: unknown) => Boolean((e as { response?: { status?: number } })?.response?.status);

export async function executerOperation(op: OperationTerrain): Promise<{ conflit: boolean }> {
  switch (op.kind) {
    case 'demarrer': await demarrerTournee(op.tourneeId); return { conflit: false };
    case 'terminer': await terminerTournee(op.tourneeId); return { conflit: false };
    case 'arrivee': { const r = await arriveeVisite(op.visiteId, op.latitude, op.longitude, op.effectueLe); return { conflit: Boolean(r?.conflit) }; }
    case 'photo': await photoVisite(op.visiteId, op.uri, op.prisLe, op.latitude, op.longitude); return { conflit: false };
    case 'cloture': { const r = await clotureVisite(op.visiteId, op.corps); return { conflit: Boolean(r?.conflit) }; }
  }
}

export interface BilanSynchro { envoyees: number; conflits: number; refusees: number; restantes: number }

/**
 * Rejoue la file terrain. Arret au premier echec reseau (l'ordre compte : l'arrivee precede la cloture).
 * Un refus du serveur (visite annulee, droit retire...) retire l'operation, sinon elle bloquerait toute la
 * file a jamais ; le decompte `refusees` permet de l'afficher a l'agent. Un conflit est deja consigne cote
 * serveur pour arbitrage par le superviseur : l'operation est consideree comme livree.
 */
export async function flushTerrain(): Promise<BilanSynchro> {
  const queue = (await getJson<OperationTerrain[]>('queueTerrain')) ?? [];
  const bilan: BilanSynchro = { envoyees: 0, conflits: 0, refusees: 0, restantes: 0 };
  let i = 0;
  for (; i < queue.length; i++) {
    try {
      const r = await executerOperation(queue[i]);
      bilan.envoyees += 1;
      if (r.conflit) bilan.conflits += 1;
    } catch (e) {
      if (!estRefus(e)) break;
      bilan.refusees += 1;
    }
  }
  const reste = queue.slice(i);
  bilan.restantes = reste.length;
  await setJson('queueTerrain', reste);
  return bilan;
}
