import { createHash } from 'crypto';
import { Prisma, TypeTournee } from '@prisma/client';
import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';
import { ErreurMetier, rolesEffectifs, droitsEffectifs } from '../../lib/rbac';
import { arrondi } from '../../lib/finance/grilleAnalyse';
import { parametreNombre } from '../../lib/parametres';
import { emettre } from '../../lib/notifier';
import { Point, coordonneesValides, distanceKm, distanceMetres, longueurCircuitKm, optimiserCircuit, detecterArrets, pointDansGeoJSON } from '../../lib/geo';

const JOUR_MS = 86_400_000;
const debutJour = (d: Date | string) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
const versPoint = (lat: unknown, lng: unknown): Point | null => {
  const p = { lat: Number(lat), lng: Number(lng) };
  return lat == null || lng == null || !coordonneesValides(p) ? null : p;
};

// ─────────────────────────────────────────────────────────────────────────────
// Périmètre
// ─────────────────────────────────────────────────────────────────────────────

async function perimetre(actor: JwtPayload): Promise<Prisma.TourneeWhereInput> {
  const roles = await rolesEffectifs(actor.sub, actor.role);
  if (roles.has('R03') || roles.has('R13')) return {};
  if (roles.has('R12') || roles.has('R04')) return actor.agenceId ? { agenceId: actor.agenceId } : { id: -1 };
  return { agent: { utilisateurId: actor.sub } };
}

const inclureTournee = {
  agent: { select: { id: true, matricule: true, utilisateurId: true, latitude: true, longitude: true, utilisateur: { select: { prenom: true, nom: true } } } },
  zone: { select: { id: true, nom: true } },
  _count: { select: { visites: true } },
} as const;

async function tourneeVisible(actor: JwtPayload, id: number) {
  const t = await prisma.tournee.findFirst({ where: { id, ...(await perimetre(actor)) }, include: inclureTournee });
  if (!t) throw new ErreurMetier('Tournée introuvable', 404);
  return t;
}

async function visiteVisible(actor: JwtPayload, id: number) {
  const v = await prisma.visiteTournee.findFirst({ where: { id, tournee: await perimetre(actor) }, include: { tournee: { include: { agent: { select: { utilisateurId: true, utilisateur: { select: { prenom: true, nom: true } } } } } }, photos: true } });
  if (!v) throw new ErreurMetier('Visite introuvable', 404);
  return v;
}

/** L'exécution (arrivée, photo, clôture) revient à l'agent de la tournée, ou à un superviseur habilité. */
async function verifierExecutant(actor: JwtPayload, agentUtilisateurId: number) {
  if (agentUtilisateurId === actor.sub) return;
  if (!(await droitsEffectifs(actor.sub, actor.role)).has('tournees:APPROVE')) throw new ErreurMetier("Cette tournée est celle d'un autre agent.", 403);
}

// ─────────────────────────────────────────────────────────────────────────────
// Planification
// ─────────────────────────────────────────────────────────────────────────────

interface Cible {
  cibleType: 'client' | 'prospect' | 'dossier_recouvrement';
  clientId?: number; prospectId?: number; dossierId?: number;
  libelle: string; adresse: string | null; point: Point | null; priorite: number; motif: string;
}

/** Score de priorité (0 à 100) : plus il est élevé, plus la visite est urgente. */
export const priorites = {
  prospect: (statut: string, ageJours: number) => Math.min(100, ({ negocie: 85, interesse: 70, contacte: 50, nouveau: 35 } as Record<string, number>)[statut] + Math.min(15, Math.floor(ageJours / 2)) ),
  collecte: (joursSansCollecte: number) => Math.min(100, 30 + joursSansCollecte * 5),
  recouvrement: (jours: number, montant: number, niveau: number) => Math.min(100, Math.round(20 + jours / 2 + niveau * 6 + (montant >= 1_000_000 ? 15 : montant >= 200_000 ? 8 : 0))),
};

async function chargerCibles(type: TypeTournee, agent: { id: number; utilisateurId: number }, zoneId?: number): Promise<Cible[]> {
  const aujourdhui = debutJour(new Date());
  const ilYa7j = new Date(aujourdhui.getTime() - 7 * JOUR_MS);

  if (type === 'commerciale') {
    const prospects = await prisma.prospect.findMany({
      where: {
        commercialId: agent.utilisateurId, statut: { in: ['nouveau', 'contacte', 'interesse', 'negocie'] }, ...(zoneId ? { zoneId } : {}),
        visitesTournee: { none: { statut: 'realisee', arriveeAt: { gte: ilYa7j } } },
      },
      select: { id: true, nom: true, prenom: true, adresse: true, quartier: true, latitude: true, longitude: true, statut: true, createdAt: true },
    });
    return prospects.map((p) => ({
      cibleType: 'prospect' as const, prospectId: p.id, libelle: `${p.prenom ?? ''} ${p.nom}`.trim(), adresse: [p.quartier, p.adresse].filter(Boolean).join(' - ') || null,
      point: versPoint(p.latitude, p.longitude), priorite: priorites.prospect(p.statut, Math.floor((aujourdhui.getTime() - p.createdAt.getTime()) / JOUR_MS)), motif: `Prospect ${p.statut}`,
    }));
  }

  if (type === 'collecte') {
    const portefeuille = await prisma.portefeuilleCollecte.findMany({
      where: { agentId: agent.id, actif: true, ...(zoneId ? { client: { zoneId } } : {}) },
      select: { client: { select: { id: true, nom: true, prenom: true, adresse: true, quartier: true, latitude: true, longitude: true, latitudeActivite: true, longitudeActivite: true, comptes: { select: { transactions: { where: { type: 'credit' }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } } } } } },
    });
    const cibles: Cible[] = [];
    for (const { client: c } of portefeuille) {
      const derniere = c.comptes.flatMap((k) => k.transactions).map((t) => t.createdAt).sort((a, b) => b.getTime() - a.getTime())[0];
      // Déjà collecté aujourd'hui : inutile de repasser.
      if (derniere && derniere >= aujourdhui) continue;
      const jours = derniere ? Math.floor((aujourdhui.getTime() - derniere.getTime()) / JOUR_MS) : 30;
      cibles.push({
        cibleType: 'client', clientId: c.id, libelle: `${c.prenom ?? ''} ${c.nom}`.trim(), adresse: [c.quartier, c.adresse].filter(Boolean).join(' - ') || null,
        point: versPoint(c.latitudeActivite ?? c.latitude, c.longitudeActivite ?? c.longitude), priorite: priorites.collecte(jours), motif: derniere ? `${jours} j sans collecte` : 'Jamais collecté',
      });
    }
    return cibles;
  }

  const dossiers = await prisma.dossierRecouvrement.findMany({
    where: { agentId: agent.utilisateurId, statut: { notIn: ['regularise', 'irrecouvrable', 'contentieux'] }, ...(zoneId ? { zoneId } : {}) },
    select: { id: true, joursRetard: true, montantImpaye: true, niveauAtteint: true, latitude: true, longitude: true, clientId: true, client: { select: { nom: true, prenom: true, adresse: true, quartier: true, latitude: true, longitude: true } } },
  });
  return dossiers.map((d) => ({
    cibleType: 'dossier_recouvrement' as const, dossierId: d.id, clientId: d.clientId, libelle: `${d.client.prenom ?? ''} ${d.client.nom}`.trim(),
    adresse: [d.client.quartier, d.client.adresse].filter(Boolean).join(' - ') || null, point: versPoint(d.latitude ?? d.client.latitude, d.longitude ?? d.client.longitude),
    priorite: priorites.recouvrement(d.joursRetard, Number(d.montantImpaye), d.niveauAtteint), motif: `${d.joursRetard} j de retard, ${Math.round(Number(d.montantImpaye))} impayés`,
  }));
}

async function prochaineReference(): Promise<string> {
  const motif = `TR-${new Date().getFullYear()}-`;
  const d = await prisma.tournee.findFirst({ where: { reference: { startsWith: motif } }, orderBy: { reference: 'desc' }, select: { reference: true } });
  return `${motif}${String((d ? parseInt(d.reference.split('-')[2], 10) : 0) + 1).padStart(5, '0')}`;
}

/** Ordonne les cibles (départ, plus proche voisin, 2-opt) et chiffre distance et durée. */
export async function ordonner(cibles: Cible[], depart: Point | null, optimiser: boolean) {
  const positionnees = cibles.filter((c) => c.point);
  const sansPosition = cibles.filter((c) => !c.point);
  const ordre = optimiser ? optimiserCircuit(depart, positionnees.map((c) => c.point as Point)) : positionnees.map((_, i) => i);
  const rangees = [...ordre.map((i) => positionnees[i]), ...sansPosition];

  const detour = await parametreNombre('terrain.facteur_detour');
  const vitesse = await parametreNombre('terrain.vitesse_kmh');
  const dureeVisite = await parametreNombre('terrain.duree_visite_min');

  let courant = depart;
  let total = 0;
  const jalons = rangees.map((c) => {
    const d = c.point && courant ? distanceKm(courant, c.point) * detour : 0;
    if (c.point) courant = c.point;
    total += d;
    return { cible: c, distance: arrondi(d) };
  });
  const dureeMin = Math.round((total / Math.max(vitesse, 1)) * 60 + rangees.length * dureeVisite);
  return { jalons, distanceKm: arrondi(total), dureeMin, sansPosition: sansPosition.length, dureeVisite, vitesse, detour };
}

async function departDe(agent: { latitude: unknown; longitude: unknown }, agenceId: number): Promise<Point | null> {
  const p = versPoint(agent.latitude, agent.longitude);
  if (p) return p;
  const a = await prisma.agence.findUnique({ where: { id: agenceId }, select: { latitude: true, longitude: true } });
  return versPoint(a?.latitude, a?.longitude);
}

async function creerTournee(actor: JwtPayload, p: { type: TypeTournee; agentId: number; date: Date; zoneId?: number; cibles: Cible[]; optimiser: boolean; auto: boolean }) {
  const agent = await prisma.agent.findUnique({ where: { id: p.agentId }, include: { utilisateur: { select: { agenceId: true, prenom: true, nom: true } } } });
  if (!agent) throw new ErreurMetier('Agent introuvable', 404);
  if (!agent.utilisateur.agenceId) throw new ErreurMetier("L'agent n'est rattaché à aucune agence.", 422);

  const existante = await prisma.tournee.findFirst({ where: { agentId: p.agentId, type: p.type, date: p.date, statut: { not: 'annulee' } }, select: { reference: true } });
  if (existante) throw new ErreurMetier(`L'agent a déjà une tournée ${p.type} ce jour-là (${existante.reference}).`, 409);
  if (p.cibles.length === 0) throw new ErreurMetier('Aucune cible à visiter : rien à planifier.', 422);

  const depart = await departDe(agent, agent.utilisateur.agenceId);
  const plan = await ordonner(p.cibles, depart, p.optimiser);
  const debutMs = p.date.getTime() + 7 * 3600_000; // 08:00 heure locale (UTC+1)

  let cumulMin = 0;
  const visites = plan.jalons.map((j, i) => {
    cumulMin += (j.distance / Math.max(plan.vitesse, 1)) * 60;
    const heure = new Date(debutMs + cumulMin * 60_000);
    cumulMin += plan.dureeVisite;
    return {
      ordre: i + 1, cibleType: j.cible.cibleType, clientId: j.cible.clientId ?? null, prospectId: j.cible.prospectId ?? null, dossierId: j.cible.dossierId ?? null,
      libelle: j.cible.libelle.slice(0, 200), adresse: j.cible.adresse, latitude: j.cible.point?.lat ?? null, longitude: j.cible.point?.lng ?? null,
      priorite: j.cible.priorite, motifPriorite: j.cible.motif.slice(0, 200), heurePrevue: heure, distanceDepuisPrecedenteKm: j.distance,
    };
  });

  const tournee = await prisma.tournee.create({
    data: {
      reference: await prochaineReference(), type: p.type, date: p.date, agentId: p.agentId, agenceId: agent.utilisateur.agenceId, zoneId: p.zoneId ?? null,
      planifieParId: actor.sub, genereeAuto: p.auto, optimisee: p.optimiser, departLatitude: depart?.lat ?? null, departLongitude: depart?.lng ?? null,
      distancePrevueKm: plan.distanceKm, dureePrevueMin: plan.dureeMin, visites: { create: visites },
    },
    include: { visites: { orderBy: { ordre: 'asc' } } },
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'terrain', action: p.auto ? 'GENERATION_TOURNEE' : 'PLANIFICATION_TOURNEE', entiteType: 'tournee', entiteId: tournee.id, description: `Tournée ${tournee.reference} (${p.type}) de ${agent.utilisateur.prenom} ${agent.utilisateur.nom} : ${visites.length} visite(s), ${plan.distanceKm} km` });
  return { ...tournee, sans_position: plan.sansPosition };
}

async function verifierPlanificateur(actor: JwtPayload, agentUtilisateurId: number) {
  if (agentUtilisateurId === actor.sub) return;
  if (!(await droitsEffectifs(actor.sub, actor.role)).has('tournees:UPDATE') && !(await droitsEffectifs(actor.sub, actor.role)).has('tournees:APPROVE')) {
    throw new ErreurMetier("Vous ne pouvez planifier que vos propres tournées.", 403);
  }
}

export async function generer(actor: JwtPayload, c: { type: TypeTournee; agent_id: number; date: string; zone_id?: number; max_visites?: number; optimiser?: boolean }) {
  const agent = await prisma.agent.findUnique({ where: { id: c.agent_id }, select: { id: true, utilisateurId: true } });
  if (!agent) throw new ErreurMetier('Agent introuvable', 404);
  await verifierPlanificateur(actor, agent.utilisateurId);
  const date = debutJour(c.date);
  if (date.getTime() < debutJour(new Date()).getTime()) throw new ErreurMetier('Impossible de planifier une tournée dans le passé.', 422);

  const toutes = await chargerCibles(c.type, agent, c.zone_id);
  const max = Math.min(40, Math.max(1, c.max_visites ?? 15));
  const retenues = [...toutes].sort((a, b) => b.priorite - a.priorite).slice(0, max);
  const t = await creerTournee(actor, { type: c.type, agentId: c.agent_id, date, zoneId: c.zone_id, cibles: retenues, optimiser: c.optimiser !== false, auto: true });
  return { ...t, candidats: toutes.length, retenus: retenues.length };
}

export async function planifier(actor: JwtPayload, c: { type: TypeTournee; agent_id: number; date: string; zone_id?: number; cibles: { type: 'client' | 'prospect' | 'dossier'; id: number }[]; optimiser?: boolean }) {
  const agent = await prisma.agent.findUnique({ where: { id: c.agent_id }, select: { id: true, utilisateurId: true } });
  if (!agent) throw new ErreurMetier('Agent introuvable', 404);
  await verifierPlanificateur(actor, agent.utilisateurId);
  const date = debutJour(c.date);
  if (date.getTime() < debutJour(new Date()).getTime()) throw new ErreurMetier('Impossible de planifier une tournée dans le passé.', 422);

  const cibles: Cible[] = [];
  for (const x of c.cibles) {
    if (x.type === 'client') {
      const k = await prisma.client.findUnique({ where: { id: x.id } });
      if (k) cibles.push({ cibleType: 'client', clientId: k.id, libelle: `${k.prenom ?? ''} ${k.nom}`.trim(), adresse: k.adresse, point: versPoint(k.latitudeActivite ?? k.latitude, k.longitudeActivite ?? k.longitude), priorite: 50, motif: 'Choix manuel' });
    } else if (x.type === 'prospect') {
      const k = await prisma.prospect.findUnique({ where: { id: x.id } });
      if (k) cibles.push({ cibleType: 'prospect', prospectId: k.id, libelle: `${k.prenom ?? ''} ${k.nom}`.trim(), adresse: k.adresse, point: versPoint(k.latitude, k.longitude), priorite: 50, motif: 'Choix manuel' });
    } else {
      const k = await prisma.dossierRecouvrement.findUnique({ where: { id: x.id }, include: { client: true } });
      if (k) cibles.push({ cibleType: 'dossier_recouvrement', dossierId: k.id, clientId: k.clientId, libelle: `${k.client.prenom ?? ''} ${k.client.nom}`.trim(), adresse: k.client.adresse, point: versPoint(k.latitude ?? k.client.latitude, k.longitude ?? k.client.longitude), priorite: 50, motif: 'Choix manuel' });
    }
  }
  return creerTournee(actor, { type: c.type, agentId: c.agent_id, date, zoneId: c.zone_id, cibles, optimiser: c.optimiser !== false, auto: false });
}

/** Recalcule l'ordre et les distances d'une tournée encore planifiée. */
export async function reoptimiser(actor: JwtPayload, id: number) {
  const t = await tourneeVisible(actor, id);
  if (t.statut !== 'planifiee') throw new ErreurMetier('Seule une tournée planifiée peut être réoptimisée.', 409);
  await verifierPlanificateur(actor, t.agent.utilisateurId);
  const visites = await prisma.visiteTournee.findMany({ where: { tourneeId: id }, orderBy: { ordre: 'asc' } });
  const cibles: Cible[] = visites.map((v) => ({ cibleType: v.cibleType as Cible['cibleType'], clientId: v.clientId ?? undefined, prospectId: v.prospectId ?? undefined, dossierId: v.dossierId ?? undefined, libelle: v.libelle, adresse: v.adresse, point: versPoint(v.latitude, v.longitude), priorite: v.priorite, motif: v.motifPriorite ?? '' }));
  const depart = versPoint(t.departLatitude, t.departLongitude) ?? (await departDe(t.agent, t.agenceId));
  // Même unité que la distance prévue : vol d'oiseau majoré du coefficient de détour.
  const avant = longueurCircuitKm(depart, visites.filter((v) => versPoint(v.latitude, v.longitude)).map((v) => ({ lat: Number(v.latitude), lng: Number(v.longitude) }))) * (await parametreNombre('terrain.facteur_detour'));
  const plan = await ordonner(cibles, depart, true);

  await prisma.$transaction([
    ...plan.jalons.map((j, i) => {
      const original = visites.find((v) => v.libelle === j.cible.libelle && v.clientId === (j.cible.clientId ?? null) && v.prospectId === (j.cible.prospectId ?? null) && v.dossierId === (j.cible.dossierId ?? null)) as (typeof visites)[number];
      return prisma.visiteTournee.update({ where: { id: original.id }, data: { ordre: i + 1, distanceDepuisPrecedenteKm: j.distance } });
    }),
    prisma.tournee.update({ where: { id }, data: { optimisee: true, distancePrevueKm: plan.distanceKm, dureePrevueMin: plan.dureeMin } }),
  ]);
  return { distance_avant_km: arrondi(avant), distance_apres_km: plan.distanceKm, duree_min: plan.dureeMin };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecture
// ─────────────────────────────────────────────────────────────────────────────

export async function lister(actor: JwtPayload, q: Record<string, unknown>) {
  const where: Prisma.TourneeWhereInput = { ...(await perimetre(actor)) };
  if (q.type) where.type = q.type as TypeTournee;
  if (q.statut) where.statut = q.statut as never;
  if (q.agent_id) where.agentId = parseInt(String(q.agent_id), 10);
  if (q.date) where.date = debutJour(String(q.date));
  else if (q.date_debut || q.date_fin) where.date = { ...(q.date_debut ? { gte: debutJour(String(q.date_debut)) } : {}), ...(q.date_fin ? { lte: debutJour(String(q.date_fin)) } : {}) };
  return prisma.tournee.findMany({ where, include: inclureTournee, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 200 });
}

export async function obtenir(actor: JwtPayload, id: number) {
  await tourneeVisible(actor, id);
  return prisma.tournee.findUniqueOrThrow({
    where: { id },
    include: { ...inclureTournee, visites: { orderBy: { ordre: 'asc' }, include: { photos: { select: { id: true, url: true, latitude: true, longitude: true, prisAt: true } } } } },
  });
}

/** Tournées de l'agent connecté pour un jour donné (application mobile). */
export async function mesTournees(actor: JwtPayload, date?: string) {
  const agent = await prisma.agent.findUnique({ where: { utilisateurId: actor.sub }, select: { id: true } });
  if (!agent) return [];
  return prisma.tournee.findMany({
    where: { agentId: agent.id, date: debutJour(date ?? new Date()), statut: { not: 'annulee' } },
    include: { visites: { orderBy: { ordre: 'asc' }, include: { photos: { select: { id: true } } } }, zone: { select: { id: true, nom: true } } },
    orderBy: { id: 'asc' },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Exécution terrain
// ─────────────────────────────────────────────────────────────────────────────

export async function demarrer(actor: JwtPayload, id: number) {
  const t = await tourneeVisible(actor, id);
  await verifierExecutant(actor, t.agent.utilisateurId);
  if (t.statut === 'en_cours') return { statut: 'en_cours' }; // idempotent : un rejeu hors connexion ne casse rien
  if (t.statut !== 'planifiee') throw new ErreurMetier(`Cette tournée est ${t.statut}.`, 409);
  if (debutJour(t.date).getTime() > debutJour(new Date()).getTime()) throw new ErreurMetier("Cette tournée est prévue pour un autre jour.", 409);
  await prisma.tournee.update({ where: { id }, data: { statut: 'en_cours', debutAt: new Date() } });
  return { statut: 'en_cours' };
}

/** Distance réellement parcourue, d'après les positions relevées pendant la tournée. */
async function trajetRealise(agentId: number, debut: Date, fin: Date) {
  const positions = await prisma.agentPosition.findMany({ where: { agentId, releveAt: { gte: debut, lte: fin } }, orderBy: { releveAt: 'asc' }, select: { latitude: true, longitude: true, releveAt: true } });
  const points = positions.map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude), at: p.releveAt }));
  return { points, distanceKm: arrondi(longueurCircuitKm(null, points)) };
}

export async function terminer(actor: JwtPayload, id: number) {
  const t = await tourneeVisible(actor, id);
  await verifierExecutant(actor, t.agent.utilisateurId);
  if (t.statut === 'terminee') return { statut: 'terminee' };
  if (t.statut !== 'en_cours') throw new ErreurMetier("Seule une tournée démarrée peut être terminée.", 409);
  const fin = new Date();
  const debut = t.debutAt ?? fin;
  const { distanceKm: realise } = await trajetRealise(t.agentId, debut, fin);
  await prisma.$transaction([
    // Ce qui n'a pas été visité est marqué manqué : c'est l'écart que le superviseur doit traiter.
    prisma.visiteTournee.updateMany({ where: { tourneeId: id, statut: { in: ['prevue', 'en_cours'] } }, data: { statut: 'manquee' } }),
    prisma.tournee.update({ where: { id }, data: { statut: 'terminee', finAt: fin, distanceRealiseeKm: realise, dureeRealiseeMin: Math.round((fin.getTime() - debut.getTime()) / 60_000) } }),
  ]);
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'terrain', action: 'FIN_TOURNEE', entiteType: 'tournee', entiteId: id, description: `Tournée ${t.reference} terminée : ${realise} km parcourus` });
  return { statut: 'terminee', distance_realisee_km: realise };
}

export async function annuler(actor: JwtPayload, id: number, motif: string) {
  const t = await tourneeVisible(actor, id);
  if (!['planifiee', 'en_cours'].includes(t.statut)) throw new ErreurMetier('Cette tournée ne peut plus être annulée.', 409);
  await verifierPlanificateur(actor, t.agent.utilisateurId);
  await prisma.$transaction([
    prisma.visiteTournee.updateMany({ where: { tourneeId: id, statut: { in: ['prevue', 'en_cours'] } }, data: { statut: 'annulee', version: { increment: 1 } } }),
    prisma.tournee.update({ where: { id }, data: { statut: 'annulee', notes: motif } }),
  ]);
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'terrain', action: 'ANNULATION_TOURNEE', entiteType: 'tournee', entiteId: id, description: `Tournée ${t.reference} annulée : ${motif}` });
  return { statut: 'annulee' };
}

/**
 * Arrivée sur place. La position déclarée est comparée à celle de la cible : c'est la preuve de
 * présence (horodatée côté appareil et côté serveur). La première arrivée enregistrée fait foi.
 */
export async function arrivee(actor: JwtPayload, id: number, c: { latitude: number; longitude: number; effectue_le?: string }) {
  const v = await visiteVisible(actor, id);
  await verifierExecutant(actor, v.tournee.agent.utilisateurId);
  if (v.arriveeAt) return { deja_enregistree: true, distance_cible_m: v.distanceCibleM, presence_validee: v.presenceValidee };
  if (v.statut === 'annulee') {
    // Arrivée saisie hors connexion sur une visite annulée entre-temps : conflit à arbitrer, pas une erreur.
    await prisma.visiteTournee.update({
      where: { id },
      data: { conflitDetecte: true, conflitDetail: { serveur: { statut: v.statut, version: v.version }, appareil: { arrivee: { latitude: c.latitude, longitude: c.longitude, effectue_le: c.effectue_le } } } as never },
    });
    void emettre('terrain.conflit', { entiteType: 'visite_tournee', entiteId: id, agenceId: v.tournee.agenceId, donnees: { libelle: v.libelle, agent: `${v.tournee.agent.utilisateur.prenom} ${v.tournee.agent.utilisateur.nom}`, lien: `/dashboard/terrain/tournees/${v.tourneeId}` } });
    return { deja_enregistree: false, conflit: true, presence_validee: false, distance_cible_m: null };
  }
  if (!['en_cours', 'planifiee'].includes(v.tournee.statut)) throw new ErreurMetier("La tournée n'est pas démarrée.", 409);

  const pos = { lat: c.latitude, lng: c.longitude };
  const cible = versPoint(v.latitude, v.longitude);
  const distance = cible ? distanceMetres(pos, cible) : null;
  const rayon = await parametreNombre('terrain.rayon_presence_m');
  const validee = distance !== null && distance <= rayon;

  // L'heure de l'appareil est retenue si elle est plausible (hors connexion), sinon celle du serveur.
  let quand = new Date();
  if (c.effectue_le) { const d = new Date(c.effectue_le); if (!Number.isNaN(d.getTime()) && d.getTime() <= Date.now() + 60_000 && Date.now() - d.getTime() < 2 * JOUR_MS) quand = d; }

  await prisma.visiteTournee.update({
    where: { id }, data: { arriveeAt: quand, latitudeArrivee: c.latitude, longitudeArrivee: c.longitude, distanceCibleM: distance, presenceValidee: validee, statut: 'en_cours', version: { increment: 1 } },
  });
  return { deja_enregistree: false, distance_cible_m: distance, presence_validee: validee, rayon_m: rayon, cible_localisee: cible !== null };
}

export async function ajouterPhoto(actor: JwtPayload, id: number, f: Express.Multer.File, c: { latitude?: number; longitude?: number; pris_le?: string }) {
  const v = await visiteVisible(actor, id);
  await verifierExecutant(actor, v.tournee.agent.utilisateurId);
  if (!/^image\//.test(f.mimetype)) throw new ErreurMetier('Une image est attendue.', 422);
  if (c.latitude === undefined || c.longitude === undefined) throw new ErreurMetier('Une photo de terrain doit être géolocalisée.', 422);
  const prisLe = c.pris_le && !Number.isNaN(new Date(c.pris_le).getTime()) ? new Date(c.pris_le) : new Date();

  // Rejeu hors connexion : la même photo (même instant de prise de vue) n'est enregistrée qu'une fois.
  const doublon = v.photos.find((p) => p.prisAt && Math.abs(p.prisAt.getTime() - prisLe.getTime()) < 1000 && p.nomFichier === f.originalname);
  if (doublon) return { id: doublon.id, doublon: true };

  const pj = await prisma.pieceJointe.create({
    data: { intitule: `Photo de visite : ${v.libelle}`, nomFichier: f.originalname, typeMime: f.mimetype, taille: f.size, url: `/uploads/${f.filename}`, categorie: 'photo_visite', visiteTourneeId: id, latitude: c.latitude, longitude: c.longitude, prisAt: prisLe },
  });
  return { id: pj.id, doublon: false };
}

export interface CorpsCloture {
  resultat: 'realisee' | 'manquee';
  compte_rendu?: string;
  signature?: { points: number[][][]; nom: string; largeur: number; hauteur: number };
  latitude?: number; longitude?: number;
  client_uid?: string;
  /** Version de la visite connue de l'appareil au moment de la saisie. */
  base_version?: number;
  effectue_le?: string;
}

export async function cloturerVisite(actor: JwtPayload, id: number, c: CorpsCloture) {
  const v = await visiteVisible(actor, id);
  await verifierExecutant(actor, v.tournee.agent.utilisateurId);

  // Événement déjà appliqué : le rejeu est inoffensif.
  if (c.client_uid && v.clientUid === c.client_uid) return { applique: true, conflit: false, deja_applique: true, version: v.version };
  if (c.resultat === 'realisee' && !c.compte_rendu?.trim()) throw new ErreurMetier('Le compte rendu est obligatoire pour une visite réalisée.', 422);

  // Règles de fusion hors connexion (TR-07) :
  //  - visite annulée par le superviseur : décision du serveur conservée, saisie de l'agent mise de côté ;
  //  - visite déjà réalisée avec un autre compte rendu : idem, arbitrage nécessaire ;
  //  - visite marquée manquée à la fin de tournée : la saisie de l'agent (vérité terrain) est appliquée
  //    mais signalée au superviseur.
  const dejaRealiseeDifferemment = v.statut === 'realisee' && (c.compte_rendu ?? '').trim() !== (v.compteRendu ?? '').trim();
  const conflit = v.statut === 'annulee' || dejaRealiseeDifferemment;
  const rattrapage = v.statut === 'manquee' && c.resultat === 'realisee';

  if (conflit) {
    // Ce que l'agent avait saisi est mis de côté pour arbitrage par le superviseur.
    await prisma.visiteTournee.update({
      where: { id },
      data: { conflitDetecte: true, conflitDetail: { serveur: { statut: v.statut, compte_rendu: v.compteRendu, version: v.version }, appareil: { resultat: c.resultat, compte_rendu: c.compte_rendu, effectue_le: c.effectue_le, base_version: c.base_version } } as never },
    });
    void emettre('terrain.conflit', { entiteType: 'visite_tournee', entiteId: id, agenceId: v.tournee.agenceId, donnees: { libelle: v.libelle, agent: `${v.tournee.agent.utilisateur.prenom} ${v.tournee.agent.utilisateur.nom}`, lien: `/dashboard/terrain/tournees/${v.tourneeId}` } });
    return { applique: false, conflit: true, version: v.version, etat_serveur: v.statut };
  }
  // Hors conflit, une visite réalisée exige la preuve de présence enregistrée à l'arrivée.
  if (c.resultat === 'realisee' && !v.arriveeAt) throw new ErreurMetier("Enregistrez d'abord l'arrivée sur place (preuve de présence).", 422);
  if (rattrapage) {
    void emettre('terrain.conflit', { entiteType: 'visite_tournee', entiteId: id, agenceId: v.tournee.agenceId, donnees: { libelle: `${v.libelle} (saisie tardive appliquée)`, agent: `${v.tournee.agent.utilisateur.prenom} ${v.tournee.agent.utilisateur.nom}`, lien: `/dashboard/terrain/tournees/${v.tourneeId}` } });
  }

  const empreinte = c.signature ? createHash('sha256').update(JSON.stringify({ points: c.signature.points, nom: c.signature.nom, visite: id, at: c.effectue_le ?? '' })).digest('hex') : null;
  await prisma.visiteTournee.update({
    where: { id },
    data: {
      statut: c.resultat, compteRendu: c.compte_rendu ?? v.compteRendu, departAt: new Date(), clientUid: c.client_uid ?? null, version: { increment: 1 },
      ...(c.signature ? { signatureJson: { points: c.signature.points, largeur: c.signature.largeur, hauteur: c.signature.hauteur } as never, signatureNom: c.signature.nom, signatureHash: empreinte, signatureAt: new Date() } : {}),
    },
  });
  return { applique: true, conflit: false, version: v.version + 1, signature_hash: empreinte };
}

/** Le superviseur arbitre un conflit : conserver l'état du serveur ou appliquer la saisie de l'agent. */
export async function arbitrerConflit(actor: JwtPayload, id: number, choix: 'serveur' | 'appareil') {
  const v = await visiteVisible(actor, id);
  if (!(await droitsEffectifs(actor.sub, actor.role)).has('tournees:APPROVE')) throw new ErreurMetier('Arbitrage réservé au superviseur.', 403);
  if (!v.conflitDetecte) throw new ErreurMetier('Aucun conflit sur cette visite.', 409);
  const detail = v.conflitDetail as { appareil?: { resultat?: string; compte_rendu?: string } } | null;
  await prisma.visiteTournee.update({
    where: { id },
    data: {
      conflitDetecte: false, version: { increment: 1 },
      ...(choix === 'appareil' && detail?.appareil ? { statut: (detail.appareil.resultat as 'realisee' | 'manquee') ?? v.statut, compteRendu: detail.appareil.compte_rendu ?? v.compteRendu } : {}),
    },
  });
  await createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'terrain', action: 'ARBITRAGE_CONFLIT', entiteType: 'visite_tournee', entiteId: id, description: `Conflit de la visite « ${v.libelle} » : ${choix} retenu` });
  return { choix };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suivi : prévu / réalisé, arrêts, geofencing
// ─────────────────────────────────────────────────────────────────────────────

export async function comparaison(actor: JwtPayload, id: number) {
  const t = await obtenir(actor, id);
  const prevu = t.visites.map((v) => versPoint(v.latitude, v.longitude)).filter((p): p is Point => p !== null);
  const depart = versPoint(t.departLatitude, t.departLongitude);
  const debut = t.debutAt ?? new Date(t.date);
  const fin = t.finAt ?? new Date();
  const realise = await trajetRealise(t.agentId, debut, t.statut === 'planifiee' ? debut : fin);

  // Ordre réel de passage comparé à l'ordre prévu : nombre de paires inversées.
  const reelles = t.visites.filter((v) => v.arriveeAt).sort((a, b) => (a.arriveeAt as Date).getTime() - (b.arriveeAt as Date).getTime()).map((v) => v.ordre);
  let inversions = 0;
  for (let i = 0; i < reelles.length; i++) for (let j = i + 1; j < reelles.length; j++) if (reelles[i] > reelles[j]) inversions++;

  const nbPrevues = t.visites.length;
  const nbRealisees = t.visites.filter((v) => v.statut === 'realisee').length;
  const detour = await parametreNombre('terrain.facteur_detour');
  return {
    prevu: { depart, points: prevu, distance_km: Number(t.distancePrevueKm), duree_min: t.dureePrevueMin, distance_vol_oiseau_km: arrondi(longueurCircuitKm(depart, prevu)), facteur_detour: detour },
    realise: { points: realise.points.map((p) => ({ lat: p.lat, lng: p.lng, at: p.at })), distance_km: t.distanceRealiseeKm != null ? Number(t.distanceRealiseeKm) : realise.distanceKm, duree_min: t.dureeRealiseeMin },
    ecart_distance_km: arrondi((t.distanceRealiseeKm != null ? Number(t.distanceRealiseeKm) : realise.distanceKm) - Number(t.distancePrevueKm)),
    visites: { prevues: nbPrevues, realisees: nbRealisees, manquees: t.visites.filter((v) => v.statut === 'manquee').length, presence_validee: t.visites.filter((v) => v.presenceValidee).length, taux_realisation: nbPrevues ? arrondi((nbRealisees / nbPrevues) * 100) : 0 },
    inversions_ordre: inversions,
  };
}

export async function arrets(actor: JwtPayload, agentId: number, date: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { utilisateurId: true, utilisateur: { select: { agenceId: true } } } });
  if (!agent) throw new ErreurMetier('Agent introuvable', 404);
  const p = await perimetre(actor);
  const acces = await prisma.tournee.findFirst({ where: { ...p, agentId }, select: { id: true } });
  const roles = await rolesEffectifs(actor.sub, actor.role);
  if (!acces && agent.utilisateurId !== actor.sub && !roles.has('R03') && !roles.has('R13') && !(actor.agenceId && agent.utilisateur.agenceId === actor.agenceId && (roles.has('R12') || roles.has('R04')))) {
    throw new ErreurMetier('Agent hors de votre périmètre.', 403);
  }
  const jour = debutJour(date);
  const positions = await prisma.agentPosition.findMany({ where: { agentId, releveAt: { gte: jour, lt: new Date(jour.getTime() + JOUR_MS) } }, orderBy: { releveAt: 'asc' }, select: { latitude: true, longitude: true, releveAt: true } });
  const trouves = detecterArrets(positions.map((x) => ({ lat: Number(x.latitude), lng: Number(x.longitude), at: x.releveAt })), await parametreNombre('terrain.arret_rayon_m'), await parametreNombre('terrain.arret_min_minutes'));
  return { agent_id: agentId, date: jour.toISOString().slice(0, 10), nb_positions: positions.length, arrets: trouves, temps_a_l_arret_min: trouves.reduce((s, a) => s + a.dureeMin, 0) };
}

/** Agents dont la dernière position est hors de toutes leurs zones affectées (geofencing). */
export async function agentsHorsZone(actor: JwtPayload) {
  const roles = await rolesEffectifs(actor.sub, actor.role);
  const agenceId = roles.has('R03') || roles.has('R13') ? undefined : actor.agenceId ?? -1;
  const agents = await prisma.agent.findMany({
    where: { latitude: { not: null }, longitude: { not: null }, zones: { some: {} }, ...(agenceId !== undefined ? { utilisateur: { agenceId } } : {}) },
    select: { id: true, matricule: true, latitude: true, longitude: true, dernierePositionAt: true, utilisateur: { select: { prenom: true, nom: true } }, zones: { select: { zone: { select: { id: true, nom: true, geometrie: true, latitude: true, longitude: true } } } } },
  });
  const maintenant = Date.now();
  const resultat = [];
  for (const a of agents) {
    const zonesAvecPolygone = a.zones.map((z) => z.zone).filter((z) => z.geometrie);
    if (zonesAvecPolygone.length === 0) continue;
    // Position trop ancienne : l'agent n'est pas en service, pas hors zone.
    if (!a.dernierePositionAt || maintenant - a.dernierePositionAt.getTime() > 2 * 3600_000) continue;
    const p = { lat: Number(a.latitude), lng: Number(a.longitude) };
    if (!zonesAvecPolygone.some((z) => pointDansGeoJSON(p, z.geometrie))) {
      resultat.push({ agent_id: a.id, matricule: a.matricule, nom: `${a.utilisateur.prenom} ${a.utilisateur.nom}`, latitude: p.lat, longitude: p.lng, derniere_position: a.dernierePositionAt, zones: zonesAvecPolygone.map((z) => z.nom) });
    }
  }
  return resultat;
}
