import { XMLParser } from 'fast-xml-parser';

/** Lecture XML commune (ONU, UE). Les valeurs restent des chaînes : pas de conversion numérique (« 007 » reste « 007 »). */

export type NoeudXml = { [k: string]: unknown };

export function lireXml(contenu: string, tableaux: string[]): NoeudXml {
  const parseur = new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, parseAttributeValue: false, trimValues: true, processEntities: true,
    isArray: (nom) => tableaux.includes(nom),
  });
  return parseur.parse(contenu) as NoeudXml;
}

/** Texte d'un nœud (chaîne, ou objet portant `#text`), espaces et retours à la ligne ramenés à un seul espace. */
export function texte(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object' && '#text' in (v as NoeudXml)) return texte((v as NoeudXml)['#text']);
  return '';
}

/** Un nœud, ou la liste de ses occurrences, toujours sous forme de tableau. */
export const liste = <T = NoeudXml>(v: unknown): T[] => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? (v as T[]) : [v as T]);

/** Un nœud est-il bien un élément (et non un texte vide) ? */
export const estNoeud = (v: unknown): v is NoeudXml => typeof v === 'object' && v !== null && !Array.isArray(v);
