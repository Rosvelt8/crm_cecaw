import apiClient from '@/lib/axios';

export type TypeInteraction = 'appel' | 'rendez_vous' | 'visite' | 'reclamation' | 'document' | 'engagement' | 'autre';
export type CanalContact = 'presentiel' | 'telephone' | 'sms' | 'whatsapp' | 'email' | 'autre';

export interface Interaction {
  id: number;
  type: TypeInteraction;
  canal: CanalContact | null;
  clientId: number | null;
  prospectId: number | null;
  resume: string;
  engagement: string | null;
  prochaineActionAt: string | null;
  dateInteraction: string;
  auteur: { id: number; prenom: string; nom: string };
}

/** Historique des interactions (compléments stratégiques, points 2-3) : appels, rendez-vous,
 * visites, réclamations, documents et engagements, en dehors du cadre d'une tournée planifiée. */
export const interactionService = {
  list: async (cible: { client_id?: number; prospect_id?: number }, params: { type?: TypeInteraction; per_page?: number } = {}) => {
    const { data: body } = await apiClient.get('/interactions', { params: { ...cible, ...params } });
    return { data: (body.data ?? []) as Interaction[], meta: body.meta };
  },

  creer: async (payload: {
    type: TypeInteraction; canal?: CanalContact | null; client_id?: number; prospect_id?: number;
    resume: string; engagement?: string | null; prochaine_action_at?: string | null; date_interaction?: string;
  }) => {
    const { data: body } = await apiClient.post('/interactions', payload);
    return body.data as Interaction;
  },

  mesActions: async () => {
    const { data: body } = await apiClient.get('/interactions/mes-actions');
    return (body.data ?? []) as Interaction[];
  },
};
