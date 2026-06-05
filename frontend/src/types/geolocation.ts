export interface Coordonnees {
  latitude: number;
  longitude: number;
  precision?: number;
  altitude?: number;
}

export interface GeolocalisationAgent {
  agent_id: number;
  agent_nom?: string;
  agent_photo?: string;
  coordonnees: Coordonnees;
  vitesse?: number;
  cap?: number;
  statut: 'actif' | 'inactif' | 'pause' | 'hors_ligne';
  derniere_maj: string;
  agence_id?: number;
}

export interface PointPassage {
  id: number;
  agent_id: number;
  coordonnees: Coordonnees;
  adresse_aproximative?: string;
  duree_arret?: number; // minutes
  timestamp: string;
}

export interface ItineraireJournalier {
  id: number;
  agent_id: number;
  date: string;
  points: PointPassage[];
  distance_totale?: number; // km
  duree_totale?: number; // minutes
  nb_clients_visites?: number;
}

export interface ZoneGeographique {
  id: number;
  nom: string;
  type: 'agence' | 'zone_collecte' | 'zone_prospect';
  geojson: object;
  agent_id?: number;
  agence_id?: number;
  couleur?: string;
}

export interface HeatmapPoint {
  lat: number;
  lng: number;
  intensity: number;
}
