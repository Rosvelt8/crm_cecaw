import { api } from './client';
import type { Transaction } from '../types';

export async function listTransactions(compteId: number): Promise<Transaction[]> {
  const { data: body } = await api.get(`/comptes/${compteId}/transactions`, {
    params: { per_page: 100 },
  });
  return body?.data ?? [];
}

export interface TransactionPayload {
  type: 'credit' | 'debit';
  montant: number;
  motif?: string;
  /** Identifiant de la fiche agent, pas celui de l'utilisateur. */
  agent_id: number;
}

export async function createTransaction(
  compteId: number,
  payload: TransactionPayload,
): Promise<Transaction> {
  const { data: body } = await api.post(`/comptes/${compteId}/transactions`, payload);
  return body?.data;
}
