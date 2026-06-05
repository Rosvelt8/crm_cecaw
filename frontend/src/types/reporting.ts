export type FormatExport = 'pdf' | 'excel' | 'csv';
export type TypeRapport =
  | 'portefeuille_credit'
  | 'collecte_epargne'
  | 'performance_agents'
  | 'impayés'
  | 'bilan_agence'
  | 'pipeline_crm'
  | 'objectifs'
  | 'activite_terrain';

export interface FiltreRapport {
  type: TypeRapport;
  date_debut?: string;
  date_fin?: string;
  agence_id?: number;
  agent_id?: number;
  equipe_id?: number;
  format?: FormatExport;
  [key: string]: string | number | boolean | undefined;
}

export interface RapportGenere {
  id: number;
  type: TypeRapport;
  format: FormatExport;
  url: string;
  nom_fichier: string;
  genere_par: number;
  filtre: FiltreRapport;
  created_at: string;
}
