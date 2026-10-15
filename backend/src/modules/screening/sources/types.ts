import type { ListeSanction } from '@prisma/client';
import type { EntreeAnalysee } from '../ofac.parse';

/**
 * Une source de sanctions (OFAC, ONU, UE, listes locales…). Le service de synchronisation ne connaît
 * que cette interface : télécharger, analyser, puis appliquer la différence en base de façon identique
 * pour toutes les sources (ajouts, modifications, retraits, garde-fous, alerte d'échec).
 */
export interface SourceSanctions {
  liste: ListeSanction;
  libelle: string;
  /** Autorité émettrice, pour l'affichage. */
  autorite: string;
  /** Page publique de la liste officielle, proposée au vérificateur. */
  pageOfficielle: string;
  /** Nombre minimal d'inscriptions attendu : en deçà, le fichier est jugé tronqué et refusé. */
  minimum: number;
  /** Source saisie par des humains (listes locales) : une suppression massive est légitime, pas un fichier tronqué. */
  sansGardeFous?: boolean;
  /** Faux si la source exige une configuration absente (ex. lien à jeton de l'UE) : elle est alors ignorée. */
  configuree(): boolean;
  /** Aide affichée quand la source n'est pas configurée. */
  aideConfiguration?: string;
  /** Récupère le(s) fichier(s) bruts. Ne doit jamais inclure de secret (jeton, mot de passe) dans ses erreurs. */
  recuperer(): Promise<string[]>;
  /** Transforme les fichiers récupérés en inscriptions normalisées. */
  analyser(contenus: string[]): { entrees: EntreeAnalysee[]; ignorees: number };
  /** Lien vers la fiche d'une inscription sur le site de la source, si elle en publie une. */
  lienFiche?(e: { uid: number; reference: string | null }): string | null;
}
