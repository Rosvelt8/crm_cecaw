import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { pointDansGeoJSON } from './geo';

/**
 * Convertit une saisie libre de montant (« 150 000 FCFA », « 150.000 », « 1 250,50 ») en nombre.
 * Renvoie null si la saisie n'est pas interprétable : mieux vaut ne rien déduire que se tromper.
 */
export function parseMontant(brut: string | null | undefined): number | null {
  if (!brut) return null;
  let t = brut.replace(/[^\d.,\s-]/g, '').replace(/\s+/g, '').trim();
  if (!t || !/\d/.test(t)) return null;
  // « 150.000 » ou « 1.250.000 » : le point sépare des milliers.
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  // « 1,250,000 » : la virgule sépare des milliers.
  else if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n < 1e13 ? n : null;
}

// ─── Zone d'un point ──────────────────────────────────────────────────────────

let cacheZones: { zones: { id: number; geometrie: unknown }[]; jusqua: number } | null = null;

async function zonesAvecGeometrie() {
  if (cacheZones && cacheZones.jusqua > Date.now()) return cacheZones.zones;
  const zones = await prisma.zone.findMany({ where: { actif: true, geometrie: { not: Prisma.DbNull } }, select: { id: true, geometrie: true, type: true } });
  // Les secteurs, plus fins que les zones, sont testés en premier.
  const triees = zones.filter((z) => z.geometrie).sort((a, b) => (a.type === b.type ? 0 : a.type === 'secteur' ? -1 : 1));
  cacheZones = { zones: triees, jusqua: Date.now() + 60_000 };
  return triees;
}

export function viderCacheZones() { cacheZones = null; }

/** Identifiant de la zone (ou du secteur) contenant le point, s'il en existe une. */
export async function zoneDuPoint(lat: number | null | undefined, lng: number | null | undefined): Promise<number | null> {
  if (lat == null || lng == null) return null;
  for (const z of await zonesAvecGeometrie()) {
    if (pointDansGeoJSON({ lat: Number(lat), lng: Number(lng) }, z.geometrie)) return z.id;
  }
  return null;
}

/**
 * Rattrapage au démarrage : convertit les revenus saisis en texte et rattache aux zones
 * les clients et prospects géolocalisés qui n'en ont pas. Idempotent, par lots.
 */
export async function rattraperDonnees(): Promise<{ revenus: number; zones: number }> {
  let revenus = 0;
  let zonesAffectees = 0;

  for (const modele of ['client', 'prospect'] as const) {
    const delegue = prisma[modele] as unknown as {
      findMany: (a: unknown) => Promise<{ id: number; revenuMensuel: string | null }[]>;
      update: (a: unknown) => Promise<unknown>;
    };
    let curseur = 0;
    for (;;) {
      const lot = await delegue.findMany({ where: { revenusMensuels: null, revenuMensuel: { not: null }, id: { gt: curseur } }, orderBy: { id: 'asc' }, take: 500, select: { id: true, revenuMensuel: true } });
      if (lot.length === 0) break;
      for (const r of lot) {
        const n = parseMontant(r.revenuMensuel);
        if (n !== null) { await delegue.update({ where: { id: r.id }, data: { revenusMensuels: n } }); revenus++; }
        curseur = r.id;
      }
    }
  }

  if ((await zonesAvecGeometrie()).length > 0) {
    for (const modele of ['client', 'prospect'] as const) {
      const delegue = prisma[modele] as unknown as {
        findMany: (a: unknown) => Promise<{ id: number; latitude: unknown; longitude: unknown }[]>;
        update: (a: unknown) => Promise<unknown>;
      };
      let curseur = 0;
      for (;;) {
        const lot = await delegue.findMany({ where: { zoneId: null, latitude: { not: null }, longitude: { not: null }, id: { gt: curseur } }, orderBy: { id: 'asc' }, take: 500, select: { id: true, latitude: true, longitude: true } });
        if (lot.length === 0) break;
        for (const r of lot) {
          const z = await zoneDuPoint(Number(r.latitude), Number(r.longitude));
          if (z) { await delegue.update({ where: { id: r.id }, data: { zoneId: z } }); zonesAffectees++; }
          curseur = r.id;
        }
      }
    }
  }
  return { revenus, zones: zonesAffectees };
}
