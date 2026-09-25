/**
 * Géométrie du terrain : distances, polygones, regroupement de points et ordonnancement
 * de tournées. Fonctions pures, sans dépendance, testées dans scripts/verif-terrain.ts.
 */

export interface Point { lat: number; lng: number }

const RAYON_TERRE_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distance à vol d'oiseau (haversine), en kilomètres. */
export function distanceKm(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const distanceMetres = (a: Point, b: Point) => Math.round(distanceKm(a, b) * 1000);

export const coordonneesValides = (p: { lat?: number | null; lng?: number | null }): p is Point =>
  typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0);

// ─── Polygones ────────────────────────────────────────────────────────────────

/** Anneau extérieur d'un Polygon ou d'un MultiPolygon GeoJSON, en points {lat,lng}. */
export function anneauxGeoJSON(geo: unknown): Point[][] {
  const g = geo as { type?: string; coordinates?: unknown } | null;
  if (!g || !Array.isArray(g.coordinates)) return [];
  const versAnneau = (a: unknown): Point[] =>
    (a as number[][]).map(([lng, lat]) => ({ lat, lng })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (g.type === 'Polygon') return [versAnneau((g.coordinates as unknown[])[0])];
  if (g.type === 'MultiPolygon') return (g.coordinates as unknown[][]).map((poly) => versAnneau(poly[0]));
  return [];
}

/** Lancer de rayon : vrai si le point est à l'intérieur de l'anneau. */
export function pointDansAnneau(p: Point, anneau: Point[]): boolean {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const a = anneau[i];
    const b = anneau[j];
    const coupe = (a.lat > p.lat) !== (b.lat > p.lat) && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (coupe) dedans = !dedans;
  }
  return dedans;
}

export const pointDansGeoJSON = (p: Point, geo: unknown) => anneauxGeoJSON(geo).some((a) => pointDansAnneau(p, a));

/** Surface d'un anneau en km², par projection équirectangulaire locale (suffisant à l'échelle d'une zone). */
export function surfaceAnneauKm2(anneau: Point[]): number {
  if (anneau.length < 3) return 0;
  const lat0 = anneau.reduce((s, p) => s + p.lat, 0) / anneau.length;
  const kx = 111.320 * Math.cos(rad(lat0));
  const ky = 110.574;
  let somme = 0;
  for (let i = 0; i < anneau.length; i++) {
    const a = anneau[i];
    const b = anneau[(i + 1) % anneau.length];
    somme += a.lng * kx * (b.lat * ky) - b.lng * kx * (a.lat * ky);
  }
  return Math.abs(somme) / 2;
}

export const surfaceGeoJSONKm2 = (geo: unknown) => anneauxGeoJSON(geo).reduce((s, a) => s + surfaceAnneauKm2(a), 0);

/** Enveloppe convexe (chaîne monotone d'Andrew). */
export function enveloppeConvexe(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.lng - b.lng || a.lat - b.lat);
  const uniques = pts.filter((p, i) => i === 0 || p.lng !== pts[i - 1].lng || p.lat !== pts[i - 1].lat);
  if (uniques.length < 3) return uniques;
  const croix = (o: Point, a: Point, b: Point) => (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);
  const bas: Point[] = [];
  for (const p of uniques) {
    while (bas.length >= 2 && croix(bas[bas.length - 2], bas[bas.length - 1], p) <= 0) bas.pop();
    bas.push(p);
  }
  const haut: Point[] = [];
  for (const p of [...uniques].reverse()) {
    while (haut.length >= 2 && croix(haut[haut.length - 2], haut[haut.length - 1], p) <= 0) haut.pop();
    haut.push(p);
  }
  return [...bas.slice(0, -1), ...haut.slice(0, -1)];
}

export function polygoneGeoJSON(points: Point[]) {
  const enveloppe = enveloppeConvexe(points);
  if (enveloppe.length < 3) return null;
  const anneau = [...enveloppe, enveloppe[0]].map((p) => [p.lng, p.lat]);
  return { type: 'Polygon' as const, coordinates: [anneau] };
}

export function centroide(points: Point[]): Point {
  const n = points.length || 1;
  return { lat: points.reduce((s, p) => s + p.lat, 0) / n, lng: points.reduce((s, p) => s + p.lng, 0) / n };
}

// ─── Découpage automatique : k-moyennes déterministe ──────────────────────────

/**
 * Regroupe des points en `k` zones. L'initialisation est déterministe (points les plus
 * éloignés les uns des autres, à partir du premier) pour qu'un même jeu de données
 * donne toujours le même découpage.
 */
export function kMoyennes(points: Point[], k: number, iterations = 50): { centre: Point; membres: number[] }[] {
  const n = points.length;
  if (n === 0 || k <= 0) return [];
  k = Math.min(k, n);

  const centres: Point[] = [points[0]];
  while (centres.length < k) {
    let meilleur = -1;
    let meilleureDistance = -1;
    points.forEach((p, i) => {
      const d = Math.min(...centres.map((c) => distanceKm(p, c)));
      if (d > meilleureDistance) { meilleureDistance = d; meilleur = i; }
    });
    centres.push(points[meilleur]);
  }

  let affectation = new Array<number>(n).fill(-1);
  for (let it = 0; it < iterations; it++) {
    const nouvelle = points.map((p) => {
      let idx = 0;
      let dmin = Infinity;
      centres.forEach((c, i) => { const d = distanceKm(p, c); if (d < dmin) { dmin = d; idx = i; } });
      return idx;
    });
    const stable = nouvelle.every((v, i) => v === affectation[i]);
    affectation = nouvelle;
    if (stable) break;
    for (let c = 0; c < k; c++) {
      const membres = points.filter((_, i) => affectation[i] === c);
      if (membres.length > 0) centres[c] = centroide(membres);
    }
  }

  return centres
    .map((centre, c) => ({ centre, membres: affectation.map((a, i) => (a === c ? i : -1)).filter((i) => i >= 0) }))
    .filter((g) => g.membres.length > 0);
}

// ─── Tournées ─────────────────────────────────────────────────────────────────

export function longueurCircuitKm(depart: Point | null, ordre: Point[]): number {
  let total = 0;
  let courant = depart;
  for (const p of ordre) {
    if (courant) total += distanceKm(courant, p);
    courant = p;
  }
  return total;
}

/**
 * Ordonne des points : plus proche voisin depuis le départ, puis amélioration 2-opt.
 * Renvoie les indices dans le nouvel ordre. Le départ n'est pas un point à visiter.
 */
export function optimiserCircuit(depart: Point | null, points: Point[]): number[] {
  const n = points.length;
  if (n <= 2) return points.map((_, i) => i);

  const restants = new Set(points.map((_, i) => i));
  const ordre: number[] = [];
  let courant: Point | null = depart ?? points[0];
  if (!depart) { ordre.push(0); restants.delete(0); }
  while (restants.size > 0) {
    let choisi = -1;
    let dmin = Infinity;
    for (const i of restants) {
      const d = distanceKm(courant as Point, points[i]);
      if (d < dmin) { dmin = d; choisi = i; }
    }
    ordre.push(choisi);
    restants.delete(choisi);
    courant = points[choisi];
  }

  // 2-opt : inverse un segment tant que cela raccourcit le circuit (chemin ouvert).
  let ameliore = true;
  let passes = 0;
  while (ameliore && passes++ < 100) {
    ameliore = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const avant = i === 0 ? depart : points[ordre[i - 1]];
        const a = points[ordre[i]];
        const b = points[ordre[j]];
        const apres = j + 1 < n ? points[ordre[j + 1]] : null;
        const ancien = (avant ? distanceKm(avant, a) : 0) + (apres ? distanceKm(b, apres) : 0);
        const nouveau = (avant ? distanceKm(avant, b) : 0) + (apres ? distanceKm(a, apres) : 0);
        if (nouveau + 1e-9 < ancien) {
          ordre.splice(i, j - i + 1, ...ordre.slice(i, j + 1).reverse());
          ameliore = true;
        }
      }
    }
  }
  return ordre;
}

// ─── Arrêts détectés dans une trace GPS ───────────────────────────────────────

export interface PositionHorodatee extends Point { at: Date }
export interface Arret { lat: number; lng: number; debut: Date; fin: Date; dureeMin: number; nbPositions: number }

/**
 * Un arrêt est une suite de positions restées dans un rayon donné pendant au moins la durée minimale.
 * Le centre est ancré sur la première position de la suite, puis recalculé en moyenne.
 */
export function detecterArrets(positions: PositionHorodatee[], rayonM: number, dureeMinMinutes: number): Arret[] {
  const tri = [...positions].sort((a, b) => a.at.getTime() - b.at.getTime());
  const arrets: Arret[] = [];
  let i = 0;
  while (i < tri.length) {
    let j = i;
    while (j + 1 < tri.length && distanceMetres(tri[i], tri[j + 1]) <= rayonM) j++;
    const debut = tri[i].at;
    const fin = tri[j].at;
    const dureeMin = (fin.getTime() - debut.getTime()) / 60000;
    if (j > i && dureeMin >= dureeMinMinutes) {
      const c = centroide(tri.slice(i, j + 1));
      arrets.push({ lat: c.lat, lng: c.lng, debut, fin, dureeMin: Math.round(dureeMin), nbPositions: j - i + 1 });
      i = j + 1;
    } else {
      i++;
    }
  }
  return arrets;
}
