/** Modèle commun aux deux moteurs de carte (MapLibre/mapcn et Leaflet de repli). */

export type IconeCarte = 'agence' | 'client' | 'prospect' | 'credit' | 'impaye' | 'agent' | 'collecte' | 'depart' | 'visite' | 'activite' | 'domicile' | 'arrivee' | 'autre';
export type TonCarte = 'bon' | 'alerte' | 'mauvais' | 'info' | 'neutre';
export type IconeInfo = 'telephone' | 'adresse' | 'heure' | 'montant' | 'personne' | 'agence' | 'distance' | 'document' | 'photo' | 'signature' | 'priorite' | 'activite' | 'zone';
export type IconeAction = 'voir' | 'itineraire' | 'appeler' | 'tournee' | 'fiche';

export interface BadgeCarte { label: string; ton?: TonCarte }
export interface InfoCarte { icone?: IconeInfo; label: string; valeur: string }
/** Bouton d'une fenêtre d'information : page de référence (interne) ou lien externe (ex. itinéraire). */
export interface ActionCarte { label: string; href: string; externe?: boolean; icone?: IconeAction; principale?: boolean }

export interface PopupCarte {
  titre: string;
  sousTitre?: string;
  badges?: BadgeCarte[];
  infos?: InfoCarte[];
  texte?: string;
  actions?: ActionCarte[];
}

export interface CartePoint {
  lat: number; lng: number; couleur: string;
  rayon?: number; titre?: string; detail?: string; groupe?: string;
  /** Pictogramme du marqueur ; sans lui, un simple point coloré. */
  icone?: IconeCarte;
  /** Numéro affiché à la place du pictogramme (ordre de visite). */
  numero?: number;
  /** Halo animé (agent en activité, visite en cours). */
  pulse?: boolean;
  popup?: PopupCarte;
}
export interface CarteLigne { points: [number, number][]; couleur: string; pointille?: boolean; epaisseur?: number; titre?: string }
export interface CartePolygone { anneau: [number, number][]; couleur: string; titre?: string; popup?: PopupCarte }

/** Résumé en texte d'un popup, pour le moteur de repli qui n'affiche que du texte. */
export function texteDuPopup(p?: PopupCarte): { titre?: string; detail?: string } {
  if (!p) return {};
  return { titre: p.titre, detail: [p.sousTitre, ...(p.infos ?? []).map((i) => `${i.label} : ${i.valeur}`)].filter(Boolean).join(' · ') };
}
