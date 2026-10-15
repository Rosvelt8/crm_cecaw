import { createHash } from 'crypto';
import type { AliasSanction, EntreeAnalysee, IdentifiantSanction } from '../ofac.parse';
import { formePays } from '../ofac.parse';

/** Assemblage commun aux sources qui publient des champs déjà structurés (ONU, UE, listes locales). */

export type EntreeSansEmpreinte = Omit<EntreeAnalysee, 'empreinte'>;

/** L'empreinte couvre tous les champs publiés : elle change si, et seulement si, l'inscription change. */
export function avecEmpreinte(e: EntreeSansEmpreinte): EntreeAnalysee {
  return { ...e, empreinte: createHash('sha256').update(JSON.stringify(e)).digest('hex') };
}

/** Pays distincts, sous leur forme comparable (minuscules, sans accent). */
export function paysDistincts(valeurs: (string | null | undefined)[]): string[] {
  const s = new Set<string>();
  for (const v of valeurs) { const f = formePays(v ?? ''); if (f && f !== 'undetermined') s.add(f); }
  return [...s].sort();
}

/** Alias distincts (insensible à la casse), sans le nom principal ; en cas de doublon, la qualité « faible » ne l'emporte pas sur une qualité normale. */
export function aliasDistincts(alias: AliasSanction[], nomPrincipal: string): AliasSanction[] {
  const m = new Map<string, AliasSanction>();
  for (const a of alias) {
    const cle = a.nom.toLowerCase();
    const existant = m.get(cle);
    if (!existant || (existant.type === 'faible' && a.type !== 'faible')) m.set(cle, a);
  }
  m.delete(nomPrincipal.toLowerCase());
  return [...m.values()].sort((x, y) => x.nom.localeCompare(y.nom));
}

export const identifiantValide = (i: IdentifiantSanction) => i.normalise.length >= 6;
