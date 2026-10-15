import type { Confiance, CorrespondanceOfac, DecisionRevue, ListeSanction, RevueStatut, StatutScreening } from '@/services/screeningService';

/** Libellés et tons du contrôle de sanctions (OFAC, ONU, UE, listes locales). */

export const STATUT_CONTROLE: Record<StatutScreening, { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline' }> = {
  aucune_correspondance: { label: 'Aucune correspondance', variant: 'success' },
  correspondance_potentielle: { label: 'Correspondance potentielle', variant: 'warning' },
  correspondance_confirmee: { label: 'Correspondance confirmée', variant: 'destructive' },
  erreur_technique: { label: 'Erreur technique', variant: 'outline' },
};

export const REVUE_LABEL: Record<RevueStatut, string> = { non_requise: 'Sans revue', a_revoir: 'À revoir', escaladee: 'Escaladé', revue: 'Examiné' };
export const DECISION_LABEL: Record<DecisionRevue, string> = { faux_positif: 'Faux positif', correspondance_confirmee: 'Correspondance confirmée', escalade: 'Escaladé' };
export const CONFIANCE: Record<Confiance, { label: string; variant: 'destructive' | 'warning' | 'secondary' }> = {
  forte: { label: 'Confiance forte', variant: 'destructive' }, moyenne: { label: 'Confiance moyenne', variant: 'warning' }, faible: { label: 'Confiance faible', variant: 'secondary' },
};
export const DECLENCHEUR_LABEL: Record<string, string> = { manuel: 'Contrôle manuel', automatique: 'À la création de la fiche', surveillance_continue: 'Surveillance continue (liste mise à jour)' };

/** Nom court d'une liste, pour les badges. */
export const LISTE_LABEL: Record<ListeSanction, string> = { sdn: 'OFAC — SDN', non_sdn: 'OFAC — non-SDN', onu: 'ONU', ue: 'Union européenne', locale: 'Liste locale' };
export const LISTE_ORDRE: ListeSanction[] = ['onu', 'sdn', 'non_sdn', 'ue', 'locale'];

export const INDICE_NAISSANCE: Record<string, { label: string; ton: 'bon' | 'neutre' | 'mauvais' }> = {
  exacte: { label: 'Date de naissance identique', ton: 'mauvais' }, annee: { label: 'Même année de naissance', ton: 'mauvais' }, proche: { label: 'Année de naissance voisine (±1 an)', ton: 'neutre' },
  incompatible: { label: 'Date de naissance incompatible', ton: 'bon' }, inconnue: { label: 'Date de naissance non comparable', ton: 'neutre' },
};
export const INDICE_PAYS: Record<string, { label: string; ton: 'bon' | 'neutre' | 'mauvais' }> = {
  concordant: { label: 'Pays concordant', ton: 'mauvais' }, different: { label: 'Pays différent', ton: 'bon' }, inconnu: { label: 'Pays non comparable', ton: 'neutre' },
};

/**
 * Lien vers la source officielle d'une inscription, pour vérification par un humain. L'OFAC publie une fiche par
 * inscription ; l'ONU et l'UE n'offrent pas d'adresse de fiche stable : on renvoie à la liste officielle, la
 * référence affichée (ex. QDi.217) permet de retrouver l'inscription. Les listes locales n'ont pas de page externe.
 */
export function lienSource(c: Pick<CorrespondanceOfac, 'liste' | 'uid'>): { url: string; libelle: string } | null {
  switch (c.liste) {
    case 'sdn': case 'non_sdn': return { url: `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=${c.uid}`, libelle: `Fiche officielle de l'inscription (OFAC n° ${c.uid})` };
    case 'onu': return { url: 'https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list', libelle: 'Liste consolidée du Conseil de sécurité (ONU)' };
    case 'ue': return { url: 'https://webgate.ec.europa.eu/fsd/fsf', libelle: 'Liste consolidée des sanctions financières (UE)' };
    default: return null;
  }
}
