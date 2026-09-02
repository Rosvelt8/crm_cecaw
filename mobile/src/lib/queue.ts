import { getJson, setJson } from './storage';
import { sendPosition } from '../api/agents';
import { createTransaction } from '../api/comptes';
import type { QueuedPosition, QueuedTransaction } from '../types';

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
      });
      sent += 1;
    } catch {
      break;
    }
  }

  await setJson('queueTransactions', queue.slice(sent));
  return sent;
}
