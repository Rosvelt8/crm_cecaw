import { getJson, setJson } from './storage';
import { mesTournees } from '../api/tournees';
import type { TourneeJour, VisiteTournee } from '../types';

/**
 * Copie locale des tournees du jour : l'agent doit pouvoir ouvrir sa tournee et saisir ses visites
 * sans reseau, meme apres avoir ferme l'application. Elle est remplacee a chaque lecture reussie.
 */
interface Cache {
  jour: string;
  tournees: TourneeJour[];
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export async function lireCache(): Promise<TourneeJour[]> {
  const c = await getJson<Cache>('tourneesCache');
  return c && c.jour === aujourdhui() ? c.tournees : [];
}

async function ecrireCache(tournees: TourneeJour[]) {
  const c: Cache = { jour: aujourdhui(), tournees };
  await setJson('tourneesCache', c);
}

/** Lit depuis le serveur ; hors reseau, retombe sur la copie locale (`horsLigne` vrai). */
export async function chargerTournees(): Promise<{ tournees: TourneeJour[]; horsLigne: boolean }> {
  try {
    const tournees = await mesTournees(aujourdhui());
    await ecrireCache(tournees);
    return { tournees, horsLigne: false };
  } catch {
    return { tournees: await lireCache(), horsLigne: true };
  }
}

/** Applique localement un changement saisi hors ligne, pour que l'ecran reflete deja l'action. */
export async function modifierVisiteCache(visiteId: number, patch: Partial<VisiteTournee>) {
  const tournees = await lireCache();
  for (const t of tournees) for (const v of t.visites) if (v.id === visiteId) Object.assign(v, patch);
  await ecrireCache(tournees);
}

export async function modifierStatutTournee(id: number, statut: string) {
  const tournees = await lireCache();
  for (const t of tournees) if (t.id === id) t.statut = statut;
  await ecrireCache(tournees);
}

/** Retrouve une visite dans la copie locale (l'ecran de detail s'ouvre sans reseau). */
export async function trouverVisite(visiteId: number): Promise<VisiteTournee | null> {
  for (const t of await lireCache()) {
    const v = t.visites.find((x) => x.id === visiteId);
    if (v) return v;
  }
  return null;
}
