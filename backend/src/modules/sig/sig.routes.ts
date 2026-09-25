import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { authenticate, JwtPayload } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success } from '../../lib/response';
import { createLog } from '../../lib/logger';
import { ErreurMetier, rolesEffectifs } from '../../lib/rbac';
import { arrondi } from '../../lib/finance/grilleAnalyse';
import { parametreNombre } from '../../lib/parametres';
import { Point, coordonneesValides, distanceKm, kMoyennes, polygoneGeoJSON, centroide, surfaceGeoJSONKm2 } from '../../lib/geo';
import { viderCacheZones } from '../../lib/montants';

/**
 * SIG et territoire : couches cartographiques (GeoJSON), analyse de la couverture, densité,
 * pénétration et distribution, découpage automatique des zones.
 */

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };

const MAX_PAR_COUCHE = 2000;

/** Agence à laquelle l'acteur est limité ; undefined = tout le réseau. */
async function agenceAutorisee(actor: JwtPayload, demandee?: number): Promise<number | undefined> {
  const roles = await rolesEffectifs(actor.sub, actor.role);
  if (roles.has('R03') || roles.has('R13') || roles.has('R15')) return demandee;
  if (!actor.agenceId) throw new ErreurMetier("Aucune agence n'est associée à votre profil.", 403);
  if (demandee && demandee !== actor.agenceId) throw new ErreurMetier('Agence hors de votre périmètre.', 403);
  return actor.agenceId;
}

const point = (lat: unknown, lng: unknown): Point | null => {
  if (lat == null || lng == null) return null;
  const p = { lat: Number(lat), lng: Number(lng) };
  return coordonneesValides(p) ? p : null;
};
const feature = (p: Point, proprietes: Record<string, unknown>) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] }, properties: proprietes });
const collection = (features: unknown[], tronque = false) => ({ type: 'FeatureCollection' as const, features, tronque });
const nom = (p: { prenom?: string | null; nom: string }) => `${p.prenom ?? ''} ${p.nom}`.trim();

const COUCHES = ['agences', 'clients', 'prospects', 'domiciles', 'activites', 'credits', 'impayes', 'points_collecte', 'agents', 'zones'] as const;

async function couche(nomCouche: (typeof COUCHES)[number], agenceId: number | undefined, zoneId: number | undefined) {
  const coordonnees = { latitude: { not: null }, longitude: { not: null } } as const;
  const parAgence = agenceId ? { agenceId } : {};
  const parZone = zoneId ? { zoneId } : {};
  const take = MAX_PAR_COUCHE + 1;

  switch (nomCouche) {
    case 'agences': {
      const l = await prisma.agence.findMany({ where: { ...coordonnees, ...(agenceId ? { id: agenceId } : {}), actif: true }, select: { id: true, nom: true, ville: true, latitude: true, longitude: true } });
      return collection(l.map((a) => feature(point(a.latitude, a.longitude) as Point, { id: a.id, nom: a.nom, ville: a.ville })));
    }
    case 'clients':
    case 'domiciles': {
      const l = await prisma.client.findMany({ where: { ...coordonnees, ...parAgence, ...parZone }, select: { id: true, nom: true, prenom: true, statut: true, telephone: true, quartier: true, latitude: true, longitude: true, latitudeActivite: true, longitudeActivite: true }, take });
      const utiles = l.slice(0, MAX_PAR_COUCHE).map((c) => {
        const p = nomCouche === 'clients' ? (point(c.latitudeActivite, c.longitudeActivite) ?? point(c.latitude, c.longitude)) : point(c.latitude, c.longitude);
        return p ? feature(p, { id: c.id, nom: nom(c), statut: c.statut, telephone: c.telephone, quartier: c.quartier }) : null;
      }).filter(Boolean);
      return collection(utiles, l.length > MAX_PAR_COUCHE);
    }
    case 'activites': {
      const l = await prisma.client.findMany({ where: { latitudeActivite: { not: null }, longitudeActivite: { not: null }, ...parAgence, ...parZone }, select: { id: true, nom: true, prenom: true, secteurActivite: true, latitudeActivite: true, longitudeActivite: true }, take });
      return collection(l.slice(0, MAX_PAR_COUCHE).map((c) => { const p = point(c.latitudeActivite, c.longitudeActivite); return p ? feature(p, { id: c.id, nom: nom(c), activite: c.secteurActivite }) : null; }).filter(Boolean), l.length > MAX_PAR_COUCHE);
    }
    case 'prospects': {
      const l = await prisma.prospect.findMany({ where: { ...coordonnees, statut: { notIn: ['converti', 'perdu'] }, ...(agenceId ? { commercial: { agenceId } } : {}), ...parZone }, select: { id: true, nom: true, prenom: true, statut: true, telephone: true, latitude: true, longitude: true }, take });
      return collection(l.slice(0, MAX_PAR_COUCHE).map((c) => { const p = point(c.latitude, c.longitude); return p ? feature(p, { id: c.id, nom: nom(c), statut: c.statut, telephone: c.telephone }) : null; }).filter(Boolean), l.length > MAX_PAR_COUCHE);
    }
    case 'credits': {
      const l = await prisma.demandeCredit.findMany({
        where: { statut: 'decaissee', ...parAgence, ...parZone },
        select: { id: true, reference: true, montantAccorde: true, montantDemande: true, client: { select: { nom: true, prenom: true, latitude: true, longitude: true, latitudeActivite: true, longitudeActivite: true } } }, take,
      });
      return collection(l.slice(0, MAX_PAR_COUCHE).map((d) => {
        const p = point(d.client.latitudeActivite, d.client.longitudeActivite) ?? point(d.client.latitude, d.client.longitude);
        return p ? feature(p, { id: d.id, reference: d.reference, client: nom(d.client), montant: Number(d.montantAccorde ?? d.montantDemande) }) : null;
      }).filter(Boolean), l.length > MAX_PAR_COUCHE);
    }
    case 'impayes': {
      const l = await prisma.dossierRecouvrement.findMany({
        where: { statut: { notIn: ['regularise', 'irrecouvrable'] }, ...parAgence, ...parZone },
        select: { id: true, reference: true, joursRetard: true, montantImpaye: true, classe: true, statut: true, latitude: true, longitude: true, client: { select: { nom: true, prenom: true, latitude: true, longitude: true } } }, take,
      });
      return collection(l.slice(0, MAX_PAR_COUCHE).map((d) => {
        const p = point(d.latitude, d.longitude) ?? point(d.client.latitude, d.client.longitude);
        return p ? feature(p, { id: d.id, reference: d.reference, client: nom(d.client), jours: d.joursRetard, montant: Number(d.montantImpaye), classe: d.classe, statut: d.statut }) : null;
      }).filter(Boolean), l.length > MAX_PAR_COUCHE);
    }
    case 'points_collecte': {
      const l = await prisma.pointService.findMany({ where: { ...coordonnees, actif: true, ...parAgence }, select: { id: true, nom: true, code: true, latitude: true, longitude: true, agence: { select: { nom: true } } } });
      return collection(l.map((p) => feature(point(p.latitude, p.longitude) as Point, { id: p.id, nom: p.nom, code: p.code, agence: p.agence.nom })));
    }
    case 'agents': {
      const l = await prisma.agent.findMany({ where: { ...coordonnees, ...(agenceId ? { utilisateur: { agenceId } } : {}) }, select: { id: true, matricule: true, type: true, latitude: true, longitude: true, dernierePositionAt: true, utilisateur: { select: { prenom: true, nom: true } } } });
      const seuil = Date.now() - 2 * 3600_000;
      return collection(l.map((a) => { const p = point(a.latitude, a.longitude); return p ? feature(p, { id: a.id, nom: nom(a.utilisateur), matricule: a.matricule, type: a.type, en_activite: (a.dernierePositionAt?.getTime() ?? 0) > seuil, derniere_position: a.dernierePositionAt }) : null; }).filter(Boolean));
    }
    case 'zones': {
      const l = await prisma.zone.findMany({ where: { actif: true, geometrie: { not: Prisma.DbNull }, ...parAgence }, select: { id: true, nom: true, type: true, geometrie: true } });
      return collection(l.filter((z) => z.geometrie).map((z) => ({ type: 'Feature' as const, geometry: z.geometrie, properties: { id: z.id, nom: z.nom, type: z.type } })));
    }
  }
}

// ─── Analyse du territoire ────────────────────────────────────────────────────

export interface LigneTerritoire {
  zone_id: number; nom: string; type: string; agence: string | null; population: number | null; surface_km2: number | null;
  nb_clients: number; nb_prospects: number; nb_comptes: number; nb_credits: number; encours_credit: number; epargne: number; nb_agents: number;
  penetration_pct: number | null; densite_km2: number | null; potentiel_restant: number; statut: 'non_couverte' | 'sous_couverte' | 'fort_potentiel' | 'couverte';
}

/** Statut d'une zone : couverture d'abord, puis pénétration, puis potentiel. Fonction pure, testable. */
export function statutZone(l: { nb_agents: number; agence: string | null; penetration_pct: number | null; nb_clients: number; potentiel_restant: number }, seuilPenetration: number, seuilPotentiel: number): LigneTerritoire['statut'] {
  if (l.nb_agents === 0 || !l.agence) return 'non_couverte';
  if (l.penetration_pct !== null ? l.penetration_pct < seuilPenetration : l.nb_clients === 0) return l.potentiel_restant >= seuilPotentiel && seuilPotentiel > 0 ? 'fort_potentiel' : 'sous_couverte';
  return l.potentiel_restant >= seuilPotentiel && seuilPotentiel > 0 ? 'fort_potentiel' : 'couverte';
}

export async function analyserTerritoire(agenceId?: number): Promise<LigneTerritoire[]> {
  const zones = await prisma.zone.findMany({
    where: { actif: true, ...(agenceId ? { agenceId } : {}) },
    select: { id: true, nom: true, type: true, population: true, potentielEstime: true, geometrie: true, agence: { select: { nom: true } }, _count: { select: { agents: true } } },
  });
  if (zones.length === 0) return [];
  const ids = zones.map((z) => z.id);

  const [clients, prospects, epargne, encours] = await Promise.all([
    prisma.client.groupBy({ by: ['zoneId'], where: { zoneId: { in: ids }, statut: 'actif' }, _count: true }),
    prisma.prospect.groupBy({ by: ['zoneId'], where: { zoneId: { in: ids }, statut: { notIn: ['converti', 'perdu'] } }, _count: true }),
    prisma.$queryRaw<{ zone_id: number; nb: bigint; total: string }[]>`SELECT c.zone_id, COUNT(cc.id) AS nb, COALESCE(SUM(cc.solde), 0) AS total FROM comptes_clients cc JOIN clients c ON c.id = cc.client_id WHERE c.zone_id = ANY(${ids}) GROUP BY c.zone_id`,
    prisma.$queryRaw<{ zone_id: number; nb: bigint; total: string }[]>`SELECT d.zone_id, COUNT(DISTINCT d.id) AS nb, COALESCE(SUM(e.capital), 0) AS total FROM echeances e JOIN demandes_credit d ON d.id = e.demande_id WHERE d.statut = 'decaissee' AND e.statut <> 'payee' AND d.zone_id = ANY(${ids}) GROUP BY d.zone_id`,
  ]);
  const nbClients = new Map(clients.map((c) => [c.zoneId, c._count]));
  const nbProspects = new Map(prospects.map((c) => [c.zoneId, c._count]));
  const ep = new Map(epargne.map((r) => [r.zone_id, { nb: Number(r.nb), total: Number(r.total) }]));
  const en = new Map(encours.map((r) => [r.zone_id, { nb: Number(r.nb), total: Number(r.total) }]));

  const lignes = zones.map((z) => {
    const c = nbClients.get(z.id) ?? 0;
    const pop = z.population ?? (z.potentielEstime ? Number(z.potentielEstime) : null);
    const surface = z.geometrie ? arrondi(surfaceGeoJSONKm2(z.geometrie)) : null;
    return {
      zone_id: z.id, nom: z.nom, type: z.type, agence: z.agence?.nom ?? null, population: z.population, surface_km2: surface,
      nb_clients: c, nb_prospects: nbProspects.get(z.id) ?? 0, nb_comptes: ep.get(z.id)?.nb ?? 0, nb_credits: en.get(z.id)?.nb ?? 0,
      encours_credit: arrondi(en.get(z.id)?.total ?? 0), epargne: arrondi(ep.get(z.id)?.total ?? 0), nb_agents: z._count.agents,
      penetration_pct: pop && pop > 0 ? arrondi((c / pop) * 100) : null,
      densite_km2: surface && surface > 0 ? arrondi(c / surface) : null,
      potentiel_restant: Math.max(0, Math.round((pop ?? 0) - c)),
      statut: 'couverte' as LigneTerritoire['statut'],
    };
  });

  // « Fort potentiel » : le quart supérieur des potentiels restants parmi les zones qui en ont un.
  const potentiels = lignes.map((l) => l.potentiel_restant).filter((p) => p > 0).sort((a, b) => a - b);
  const seuilPotentiel = potentiels.length >= 4 ? potentiels[Math.floor(potentiels.length * 0.75)] : potentiels.length > 0 ? potentiels[potentiels.length - 1] : 0;
  const seuilPenetration = await parametreNombre('territoire.seuil_penetration_pct');
  for (const l of lignes) l.statut = statutZone(l, seuilPenetration, seuilPotentiel);
  return lignes.sort((a, b) => b.potentiel_restant - a.potentiel_restant);
}

/**
 * Potentiel de collecte par marché (compléments stratégiques, points 15-16 : intelligence
 * Bayam-Sellam). Indicateurs explicites, pas de score composite opaque : nombre de prospects non
 * convertis (opportunité de conversion), part de clients dormants (à relancer) et épargne déjà
 * collectée, pour situer chaque marché plutôt que le classer par une seule note.
 */
export interface LigneMarche {
  marche_id: number; nom: string; type: string; agence: string | null;
  nb_clients: number; nb_prospects_actifs: number; nb_collecteurs: number;
  epargne_collectee: number; nb_clients_dormants: number; potentiel_moyen_clients: number | null;
}

export async function analyserMarches(agenceId?: number): Promise<LigneMarche[]> {
  const marches = await prisma.marche.findMany({
    where: { actif: true, ...(agenceId ? { agenceId } : {}) },
    select: { id: true, nom: true, type: true, agence: { select: { nom: true } }, _count: { select: { agents: true } } },
  });
  if (marches.length === 0) return [];
  const ids = marches.map((m) => m.id);

  const [clients, prospects, epargne, scores] = await Promise.all([
    prisma.client.groupBy({ by: ['marcheId'], where: { marcheId: { in: ids }, statut: 'actif' }, _count: true }),
    prisma.prospect.groupBy({ by: ['marcheId'], where: { marcheId: { in: ids }, statut: { notIn: ['converti', 'perdu'] } }, _count: true }),
    prisma.$queryRaw<{ marche_id: number; total: string }[]>`SELECT c.marche_id, COALESCE(SUM(cc.solde), 0) AS total FROM comptes_clients cc JOIN clients c ON c.id = cc.client_id JOIN produits p ON p.id = cc.produit_id WHERE p.type = 'epargne' AND c.marche_id = ANY(${ids}) GROUP BY c.marche_id`,
    prisma.$queryRaw<{ marche_id: number; nb_dormants: bigint; moyenne_potentiel: string | null }[]>`SELECT c.marche_id, COUNT(*) FILTER (WHERE s.cycle_vie = 'dormant') AS nb_dormants, AVG(s.potentiel) AS moyenne_potentiel FROM clients c JOIN scores_clients s ON s.client_id = c.id WHERE c.marche_id = ANY(${ids}) GROUP BY c.marche_id`,
  ]);
  const nbClients = new Map(clients.map((c) => [c.marcheId, c._count]));
  const nbProspects = new Map(prospects.map((p) => [p.marcheId, p._count]));
  const ep = new Map(epargne.map((r) => [r.marche_id, Number(r.total)]));
  const sc = new Map(scores.map((r) => [r.marche_id, { dormants: Number(r.nb_dormants), potentiel: r.moyenne_potentiel ? arrondi(Number(r.moyenne_potentiel)) : null }]));

  return marches
    .map((m) => ({
      marche_id: m.id, nom: m.nom, type: m.type, agence: m.agence?.nom ?? null,
      nb_clients: nbClients.get(m.id) ?? 0, nb_prospects_actifs: nbProspects.get(m.id) ?? 0, nb_collecteurs: m._count.agents,
      epargne_collectee: arrondi(ep.get(m.id) ?? 0), nb_clients_dormants: sc.get(m.id)?.dormants ?? 0, potentiel_moyen_clients: sc.get(m.id)?.potentiel ?? null,
    }))
    .sort((a, b) => (b.nb_prospects_actifs + b.nb_clients_dormants) - (a.nb_prospects_actifs + a.nb_clients_dormants));
}

const router = Router();
router.use(authenticate);

router.get('/couches', can('sig:VIEW'), wrap(async (req, res) => {
  const agenceId = await agenceAutorisee(req.user!, req.query.agence_id ? parseInt(String(req.query.agence_id), 10) : undefined);
  const zoneId = req.query.zone_id ? parseInt(String(req.query.zone_id), 10) : undefined;
  const demandees = String(req.query.couches ?? 'agences,clients,agents').split(',').map((c) => c.trim()).filter((c): c is (typeof COUCHES)[number] => (COUCHES as readonly string[]).includes(c));
  const sortie: Record<string, unknown> = {};
  for (const c of demandees) sortie[c] = await couche(c, agenceId, zoneId);
  return success(res, sortie);
}));

router.get('/territoire/analyse', can('territoire:VIEW'), wrap(async (req, res) => {
  const agenceId = await agenceAutorisee(req.user!, req.query.agence_id ? parseInt(String(req.query.agence_id), 10) : undefined);
  const lignes = await analyserTerritoire(agenceId);
  if (req.query.format === 'csv') {
    if (!(await import('../../lib/rbac').then((m) => m.droitsEffectifs(req.user!.sub, req.user!.role))).has('territoire:EXPORT')) throw new ErreurMetier("Export non autorisé.", 403);
    const cols: (keyof LigneTerritoire)[] = ['zone_id', 'nom', 'type', 'agence', 'population', 'surface_km2', 'nb_clients', 'nb_prospects', 'nb_comptes', 'nb_credits', 'encours_credit', 'epargne', 'nb_agents', 'penetration_pct', 'densite_km2', 'potentiel_restant', 'statut'];
    const echapper = (v: unknown) => { const t = v == null ? '' : String(v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="analyse-territoire.csv"');
    return res.send('﻿' + [cols.join(';'), ...lignes.map((l) => cols.map((c) => echapper(l[c])).join(';'))].join('\n'));
  }
  return success(res, lignes);
}));

/** Potentiel de collecte par marché (compléments stratégiques, points 15-16). */
router.get('/marches/potentiel', can('territoire:VIEW'), wrap(async (req, res) => {
  const agenceId = await agenceAutorisee(req.user!, req.query.agence_id ? parseInt(String(req.query.agence_id), 10) : undefined);
  return success(res, await analyserMarches(agenceId));
}));

/** Couverture des agences : part des clients situés dans le rayon de leur agence. */
router.get('/territoire/couverture-agences', can('territoire:VIEW'), wrap(async (req, res) => {
  const agenceId = await agenceAutorisee(req.user!, req.query.agence_id ? parseInt(String(req.query.agence_id), 10) : undefined);
  const rayon = await parametreNombre('territoire.rayon_couverture_agence_km');
  const agences = await prisma.agence.findMany({ where: { actif: true, ...(agenceId ? { id: agenceId } : {}) }, select: { id: true, nom: true, latitude: true, longitude: true } });
  const sortie = [];
  for (const a of agences) {
    const centre = point(a.latitude, a.longitude);
    const clients = await prisma.client.findMany({ where: { agenceId: a.id, statut: 'actif', latitude: { not: null }, longitude: { not: null } }, select: { latitude: true, longitude: true } });
    const distances = centre ? clients.map((c) => point(c.latitude, c.longitude)).filter((p): p is Point => p !== null).map((p) => distanceKm(centre, p)) : [];
    const couverts = distances.filter((d) => d <= rayon).length;
    sortie.push({
      agence_id: a.id, nom: a.nom, localisee: centre !== null, rayon_km: rayon, clients_geolocalises: distances.length, clients_couverts: couverts, clients_hors_rayon: distances.length - couverts,
      taux_couverture_pct: distances.length ? arrondi((couverts / distances.length) * 100) : null, distance_moyenne_km: distances.length ? arrondi(distances.reduce((s, d) => s + d, 0) / distances.length) : null,
    });
  }
  return success(res, sortie);
}));

/** Découpage automatique : regroupe les points d'une agence en zones (aperçu, puis création sur confirmation). */
router.post('/territoire/decoupage', can('territoire:EXECUTE'), wrap(async (req, res) => {
  const b = z.object({
    agence_id: z.coerce.number().int().positive(), nb_zones: z.coerce.number().int().min(2).max(30), cible: z.enum(['clients', 'prospects', 'tous']).default('tous'),
    prefixe: z.string().min(1).max(20).default('Zone'), confirmer: z.boolean().default(false),
  }).parse(req.body);
  const agenceId = (await agenceAutorisee(req.user!, b.agence_id)) ?? b.agence_id;

  const sources: { id: number; kind: 'client' | 'prospect'; p: Point }[] = [];
  if (b.cible !== 'prospects') {
    for (const c of await prisma.client.findMany({ where: { agenceId, latitude: { not: null }, longitude: { not: null } }, select: { id: true, latitude: true, longitude: true } })) {
      const p = point(c.latitude, c.longitude); if (p) sources.push({ id: c.id, kind: 'client', p });
    }
  }
  if (b.cible !== 'clients') {
    for (const c of await prisma.prospect.findMany({ where: { commercial: { agenceId }, latitude: { not: null }, longitude: { not: null } }, select: { id: true, latitude: true, longitude: true } })) {
      const p = point(c.latitude, c.longitude); if (p) sources.push({ id: c.id, kind: 'prospect', p });
    }
  }
  if (sources.length < b.nb_zones * 3) throw new ErreurMetier(`Pas assez de points géolocalisés (${sources.length}) pour ${b.nb_zones} zones : il en faut au moins ${b.nb_zones * 3}.`, 422);

  const groupes = kMoyennes(sources.map((s) => s.p), b.nb_zones);
  const apercu = groupes.map((g, i) => {
    const pts = g.membres.map((m) => sources[m].p);
    return { nom: `${b.prefixe} ${i + 1}`, centre: centroide(pts), nb_points: pts.length, nb_clients: g.membres.filter((m) => sources[m].kind === 'client').length, geometrie: polygoneGeoJSON(pts), membres: g.membres };
  });

  if (!b.confirmer) return success(res, { apercu: apercu.map(({ membres, ...r }) => { void membres; return r; }), cree: false });

  const creees = await prisma.$transaction(async (tx) => {
    const sortie = [];
    for (const g of apercu) {
      const zone = await tx.zone.create({ data: { nom: g.nom, type: 'zone', agenceId, latitude: g.centre.lat, longitude: g.centre.lng, geometrie: (g.geometrie ?? undefined) as never } });
      const clientIds = g.membres.filter((m) => sources[m].kind === 'client').map((m) => sources[m].id);
      const prospectIds = g.membres.filter((m) => sources[m].kind === 'prospect').map((m) => sources[m].id);
      if (clientIds.length) await tx.client.updateMany({ where: { id: { in: clientIds } }, data: { zoneId: zone.id } });
      if (prospectIds.length) await tx.prospect.updateMany({ where: { id: { in: prospectIds } }, data: { zoneId: zone.id } });
      sortie.push({ id: zone.id, nom: zone.nom, nb_points: g.nb_points });
    }
    return sortie;
  });
  viderCacheZones();
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined, module: 'organisation', action: 'DECOUPAGE_AUTOMATIQUE', entiteType: 'agence', entiteId: agenceId, description: `Découpage automatique de l'agence #${agenceId} en ${creees.length} zone(s)` });
  return success(res, { cree: true, zones: creees });
}));

export default router;
