import prisma from '../../lib/prisma';
import { Prisma, CanalRelance, ClasseRetard, StatutRecouvrement } from '@prisma/client';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { ErreurMetier, rolesEffectifs } from '../../lib/rbac';
import { arrondi } from '../../lib/finance/grilleAnalyse';
import { parametre, parametreNombre } from '../../lib/parametres';
import { emettre } from '../../lib/notifier';
import { archiverSansBloquer } from '../../lib/archivage';
import { marquerRetards } from '../credit/credit.service';

const JOUR_MS = 86_400_000;
const ETATS_CLOS: StatutRecouvrement[] = ['regularise', 'irrecouvrable'];

export const debutJour = (d = new Date()) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };

export function classeDe(jours: number): ClasseRetard {
  if (jours <= 30) return 'r1_30';
  if (jours <= 60) return 'r31_60';
  if (jours <= 90) return 'r61_90';
  if (jours <= 180) return 'r91_180';
  return 'r180_plus';
}

/** Niveau de relance (1 à 4) imposé par le retard, selon les seuils paramétrés. */
export function niveauRequis(jours: number, seuils: number[]): number {
  let n = 0;
  seuils.forEach((s, i) => { if (jours >= s) n = i + 1; });
  return jours > 0 ? Math.max(1, n) : 0;
}

/** Pénalité de retard : taux annuel appliqué au dû, au prorata des jours (base 365). */
export const calculerPenalite = (base: number, tauxAnnuelPct: number, jours: number) => (tauxAnnuelPct > 0 && jours > 0 && base > 0 ? arrondi((base * tauxAnnuelPct * jours) / 100 / 365) : 0);

// ─────────────────────────────────────────────────────────────────────────────
// Détection des impayés
// ─────────────────────────────────────────────────────────────────────────────

async function prochaineReference(): Promise<string> {
  const motif = `RC-${new Date().getFullYear()}-`;
  const d = await prisma.dossierRecouvrement.findFirst({ where: { reference: { startsWith: motif } }, orderBy: { reference: 'desc' }, select: { reference: true } });
  return `${motif}${String((d ? parseInt(d.reference.split('-')[2], 10) : 0) + 1).padStart(5, '0')}`;
}

/** Agent recouvrement (R11) de l'agence ayant le moins de dossiers ouverts. */
async function choisirAgent(agenceId: number): Promise<number | null> {
  const candidats = await prisma.utilisateur.findMany({ where: { actif: true, agenceId, roles: { some: { role: { code: 'R11' } } } }, select: { id: true } });
  if (candidats.length === 0) return null;
  const charges = await prisma.dossierRecouvrement.groupBy({
    by: ['agentId'], where: { agentId: { in: candidats.map((c) => c.id) }, statut: { notIn: ETATS_CLOS } }, _count: true,
  });
  const nb = new Map(charges.map((c) => [c.agentId, c._count]));
  return candidats.sort((a, b) => (nb.get(a.id) ?? 0) - (nb.get(b.id) ?? 0))[0].id;
}

/**
 * Met à jour (ou ouvre, ou clôt) le dossier de recouvrement d'un crédit. Idempotent : appelée
 * par la détection quotidienne et à chaque remboursement pour refléter la régularisation aussitôt.
 */
export async function traiterDemande(demandeId: number): Promise<'ouvert' | 'mis_a_jour' | 'regularise' | 'rien'> {
  const demande = await prisma.demandeCredit.findUnique({
    where: { id: demandeId },
    include: { echeances: { orderBy: { numero: 'asc' } }, parametrage: true, client: true, produit: { select: { nom: true } } },
  });
  if (!demande || demande.statut !== 'decaissee') return 'rien';

  const aujourdhui = debutJour();
  const tauxPen = Number(demande.parametrage?.tauxPenaliteRetard ?? 0);
  const enRetard = demande.echeances.filter((e) => e.statut !== 'payee' && e.dateEcheance < aujourdhui);

  const dossier = await prisma.dossierRecouvrement.findFirst({ where: { demandeId, statut: { notIn: ETATS_CLOS } }, orderBy: { id: 'desc' } });

  if (enRetard.length === 0) {
    if (dossier) {
      const recouvre = await prisma.remboursement.aggregate({ _sum: { montant: true }, where: { demandeId, datePaiement: { gte: dossier.ouvertAt } } });
      await prisma.dossierRecouvrement.update({
        where: { id: dossier.id },
        data: { statut: 'regularise', clotureAt: new Date(), motifCloture: 'Toutes les échéances échues sont soldées.', montantImpaye: 0, penalites: 0, joursRetard: 0, montantRecouvre: Number(recouvre._sum.montant ?? 0) },
      });
      await prisma.promessePaiement.updateMany({ where: { dossierId: dossier.id, statut: 'en_cours' }, data: { statut: 'tenue', traiteAt: new Date() } });
      await prisma.planRegularisation.updateMany({ where: { dossierId: dossier.id, statut: 'actif' }, data: { statut: 'termine' } });
      return 'regularise';
    }
    return 'rien';
  }

  // Pénalités recalculées échéance par échéance sur le reste dû hors pénalité.
  let montantImpaye = 0;
  let penalitesTotales = 0;
  let plusAncienne = enRetard[0].dateEcheance;
  for (const e of enRetard) {
    const jours = Math.floor((aujourdhui.getTime() - e.dateEcheance.getTime()) / JOUR_MS);
    const base = Math.max(0, Number(e.montantTotal) - Number(e.montantPaye));
    const penalite = calculerPenalite(base, tauxPen, jours);
    if (Math.abs(penalite - Number(e.penalite)) > 0.004) await prisma.echeance.update({ where: { id: e.id }, data: { penalite } });
    montantImpaye += base;
    penalitesTotales += penalite;
    if (e.dateEcheance < plusAncienne) plusAncienne = e.dateEcheance;
  }
  const joursRetard = Math.floor((aujourdhui.getTime() - plusAncienne.getTime()) / JOUR_MS);
  const capitalRestantDu = demande.echeances.filter((e) => e.statut !== 'payee').reduce((s, e) => s + Number(e.capital), 0);
  const seuils = (await parametre<number[]>('recouvrement.niveaux_jours')).map(Number);
  const requis = niveauRequis(joursRetard, seuils);

  const donneesCommunes = {
    montantImpaye: arrondi(montantImpaye), penalites: arrondi(penalitesTotales), capitalRestantDu: arrondi(capitalRestantDu),
    joursRetard, nbEcheancesImpayees: enRetard.length, classe: classeDe(joursRetard), niveauRequis: requis,
  };

  const nomClient = `${demande.client.prenom ?? ''} ${demande.client.nom}`.trim();

  if (!dossier) {
    const lat = demande.client.latitudeActivite ?? demande.client.latitude;
    const lng = demande.client.longitudeActivite ?? demande.client.longitude;
    const agentId = await choisirAgent(demande.agenceId);
    const cree = await prisma.dossierRecouvrement.create({
      data: {
        reference: await prochaineReference(), demandeId, clientId: demande.clientId, agenceId: demande.agenceId, zoneId: demande.zoneId,
        agentId, latitude: lat, longitude: lng, sourceLocalisation: lat ? (demande.client.latitudeActivite ? 'activite' : 'domicile') : null,
        prochaineActionAt: new Date(), ...donneesCommunes,
      },
    });
    void emettre('recouvrement.nouveau_dossier', {
      entiteType: 'dossier_recouvrement', entiteId: cree.id, agenceId: cree.agenceId,
      donnees: { reference: cree.reference, client: nomClient, jours: joursRetard, montant: Math.round(montantImpaye), agentId: agentId ?? 0, lien: `/dashboard/recouvrement/${cree.id}` },
    });
    await appliquerRelanceAutomatique(cree.id, requis, 0, { client: nomClient, jours: joursRetard, montant: Math.round(montantImpaye), telephone: demande.client.telephone, agenceId: cree.agenceId });
    return 'ouvert';
  }

  await prisma.dossierRecouvrement.update({ where: { id: dossier.id }, data: donneesCommunes });
  await appliquerRelanceAutomatique(dossier.id, requis, dossier.niveauAtteint, { client: nomClient, jours: joursRetard, montant: Math.round(montantImpaye), telephone: demande.client.telephone, agenceId: dossier.agenceId });
  return 'mis_a_jour';
}

/** Envoie l'avis automatique du niveau atteint par le retard, une seule fois par niveau. */
async function appliquerRelanceAutomatique(dossierId: number, requis: number, atteint: number, ctx: { client: string; jours: number; montant: number; telephone: string; agenceId: number }) {
  if (requis <= atteint || requis < 1) return;
  const auto = await parametre<boolean>('recouvrement.sms_automatique');
  await prisma.$transaction([
    prisma.relanceRecouvrement.create({
      data: { dossierId, niveau: requis, canal: auto ? 'sms' : 'appel', automatique: true, message: auto ? `Avis automatique de niveau ${requis} envoyé au client.` : `Niveau ${requis} atteint : relance à effectuer.` },
    }),
    prisma.dossierRecouvrement.update({ where: { id: dossierId }, data: { niveauAtteint: requis, derniereRelanceAt: new Date(), statut: 'en_relance' } }),
  ]).catch(() => undefined);
  if (auto) {
    void emettre(`recouvrement.niveau_${Math.min(requis, 4)}`, { entiteType: 'dossier_recouvrement', entiteId: dossierId, agenceId: ctx.agenceId, donnees: { jours: ctx.jours, montant: ctx.montant, telephone: ctx.telephone } });
  }
}

/** Suivi des promesses échues et des plans : promesse non tenue, plan rompu ou terminé. */
export async function traiterPromessesEtPlans(): Promise<{ promessesRompues: number; plansRompus: number; plansTermines: number }> {
  const res = { promessesRompues: 0, plansRompus: 0, plansTermines: 0 };
  const aujourdhui = debutJour();

  const echues = await prisma.promessePaiement.findMany({
    where: { statut: 'en_cours', datePromise: { lt: aujourdhui }, dossier: { statut: { notIn: ETATS_CLOS } } },
    include: { dossier: { select: { id: true, reference: true, agenceId: true, agentId: true, statut: true } } },
  });
  for (const p of echues) {
    await prisma.$transaction([
      prisma.promessePaiement.update({ where: { id: p.id }, data: { statut: 'rompue', traiteAt: new Date() } }),
      ...(p.dossier.statut === 'promesse' ? [prisma.dossierRecouvrement.update({ where: { id: p.dossierId }, data: { statut: 'en_relance' } })] : []),
    ]);
    void emettre('recouvrement.promesse_rompue', { entiteType: 'dossier_recouvrement', entiteId: p.dossierId, agenceId: p.dossier.agenceId, donnees: { reference: p.dossier.reference, montant: Number(p.montant), agentId: p.dossier.agentId ?? 0, lien: `/dashboard/recouvrement/${p.dossierId}` } });
    res.promessesRompues++;
  }

  const plans = await prisma.planRegularisation.findMany({ where: { statut: 'actif' }, include: { lignes: { orderBy: { numero: 'asc' } }, dossier: { select: { id: true, demandeId: true, agenceId: true, reference: true, agentId: true } } } });
  for (const plan of plans) {
    const verse = await prisma.remboursement.aggregate({ _sum: { montant: true }, where: { demandeId: plan.dossier.demandeId, datePaiement: { gte: plan.valideAt ?? plan.createdAt } } });
    let disponible = Number(verse._sum.montant ?? 0);
    let tout = true;
    let rompu = false;
    for (const l of plan.lignes) {
      const paye = Math.min(disponible, Number(l.montant));
      disponible -= paye;
      const solde = paye >= Number(l.montant) - 0.005;
      const statut = solde ? 'payee' : l.dateEcheance < aujourdhui ? 'en_retard' : paye > 0 ? 'partiellement_payee' : 'a_echoir';
      if (!solde) tout = false;
      // Tolérance de 7 jours avant de considérer le plan rompu.
      if (!solde && aujourdhui.getTime() - l.dateEcheance.getTime() > 7 * JOUR_MS) rompu = true;
      if (Number(l.montantPaye) !== paye || l.statut !== statut) await prisma.planEcheance.update({ where: { id: l.id }, data: { montantPaye: paye, statut } });
    }
    if (tout) {
      await prisma.planRegularisation.update({ where: { id: plan.id }, data: { statut: 'termine' } });
      res.plansTermines++;
    } else if (rompu) {
      await prisma.$transaction([
        prisma.planRegularisation.update({ where: { id: plan.id }, data: { statut: 'rompu' } }),
        prisma.dossierRecouvrement.update({ where: { id: plan.dossierId }, data: { statut: 'en_relance' } }),
      ]);
      void emettre('recouvrement.promesse_rompue', { entiteType: 'dossier_recouvrement', entiteId: plan.dossierId, agenceId: plan.dossier.agenceId, donnees: { reference: plan.dossier.reference, montant: Number(plan.montantTotal), agentId: plan.dossier.agentId ?? 0, lien: `/dashboard/recouvrement/${plan.dossierId}` } });
      res.plansRompus++;
    }
  }
  return res;
}

/** Détection quotidienne : ouvre, met à jour et clôt les dossiers, puis suit promesses et plans. */
export async function detecterImpayes() {
  await marquerRetards();
  const candidats = await prisma.demandeCredit.findMany({
    where: { statut: 'decaissee' },
    select: { id: true, echeances: { where: { statut: { not: 'payee' }, dateEcheance: { lt: debutJour() } }, select: { id: true }, take: 1 } },
  });
  const ouverts = await prisma.dossierRecouvrement.findMany({ where: { statut: { notIn: ETATS_CLOS } }, select: { demandeId: true } });
  const ids = new Set<number>([...candidats.filter((c) => c.echeances.length > 0).map((c) => c.id), ...ouverts.map((o) => o.demandeId)]);

  const bilan = { ouverts: 0, misAJour: 0, regularises: 0 };
  for (const id of ids) {
    const r = await traiterDemande(id);
    if (r === 'ouvert') bilan.ouverts++;
    else if (r === 'mis_a_jour') bilan.misAJour++;
    else if (r === 'regularise') bilan.regularises++;
  }
  const suivi = await traiterPromessesEtPlans();
  return { ...bilan, ...suivi };
}

// ─────────────────────────────────────────────────────────────────────────────
// Périmètre
// ─────────────────────────────────────────────────────────────────────────────

async function perimetre(actor: JwtPayload): Promise<Prisma.DossierRecouvrementWhereInput> {
  const roles = await rolesEffectifs(actor.sub, actor.role);
  if (['R03', 'R14', 'R15'].some((r) => roles.has(r))) return {};
  if (['R04', 'R12'].some((r) => roles.has(r))) return actor.agenceId ? { agenceId: actor.agenceId } : { id: -1 };
  return { agentId: actor.sub };
}

async function dossierVisible(actor: JwtPayload, id: number) {
  const d = await prisma.dossierRecouvrement.findFirst({ where: { id, ...(await perimetre(actor)) } });
  if (!d) throw new ErreurMetier('Dossier de recouvrement introuvable', 404);
  return d;
}

const inclureListe = {
  client: { select: { id: true, nom: true, prenom: true, telephone: true } },
  demande: { select: { id: true, reference: true, produit: { select: { nom: true } } } },
  agence: { select: { id: true, nom: true } },
  agent: { select: { id: true, prenom: true, nom: true } },
} as const;

export async function lister(actor: JwtPayload, q: Record<string, unknown>) {
  const { skip, take, page, perPage } = parsePagination(q);
  const where: Prisma.DossierRecouvrementWhereInput = { ...(await perimetre(actor)) };
  if (q.statut) where.statut = q.statut as StatutRecouvrement;
  else if (q.actifs !== 'false') where.statut = { notIn: ETATS_CLOS };
  if (q.classe) where.classe = q.classe as ClasseRetard;
  if (q.agent_id) where.agentId = parseInt(String(q.agent_id), 10);
  if (q.non_assignes === 'true') where.agentId = null;
  if (q.search) {
    const s = String(q.search);
    where.OR = [{ reference: { contains: s, mode: 'insensitive' } }, { client: { nom: { contains: s, mode: 'insensitive' } } }, { client: { prenom: { contains: s, mode: 'insensitive' } } }];
  }
  const [items, total] = await Promise.all([
    prisma.dossierRecouvrement.findMany({ where, include: inclureListe, skip, take, orderBy: [{ joursRetard: 'desc' }, { id: 'asc' }] }),
    prisma.dossierRecouvrement.count({ where }),
  ]);
  return { items, meta: paginationMeta(page, perPage, total) };
}

export async function obtenir(actor: JwtPayload, id: number) {
  await dossierVisible(actor, id);
  const d = await prisma.dossierRecouvrement.findUniqueOrThrow({
    where: { id },
    include: {
      ...inclureListe,
      client: true,
      relances: { orderBy: { relanceAt: 'desc' }, include: { agent: { select: { prenom: true, nom: true } } } },
      promesses: { orderBy: { createdAt: 'desc' }, include: { creePar: { select: { prenom: true, nom: true } } } },
      plans: { orderBy: { createdAt: 'desc' }, include: { lignes: { orderBy: { numero: 'asc' } }, creePar: { select: { prenom: true, nom: true } }, valideePar: { select: { prenom: true, nom: true } } } },
    },
  });
  const echeances = await prisma.echeance.findMany({ where: { demandeId: d.demandeId, statut: { not: 'payee' } }, orderBy: { numero: 'asc' } });
  return { ...d, echeances_impayees: echeances.filter((e) => e.dateEcheance < debutJour()), seuils: await parametre<number[]>('recouvrement.niveaux_jours') };
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

const journal = (actor: JwtPayload, action: string, id: number, description: string) =>
  createLog({ utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'recouvrement', action, entiteType: 'dossier_recouvrement', entiteId: id, description });

export async function assigner(actor: JwtPayload, id: number, agentId: number) {
  const d = await dossierVisible(actor, id);
  if (ETATS_CLOS.includes(d.statut)) throw new ErreurMetier('Ce dossier est clos.', 409);
  const u = await prisma.utilisateur.findFirst({ where: { id: agentId, actif: true } });
  if (!u) throw new ErreurMetier('Agent introuvable ou inactif', 404);
  if (u.agenceId !== d.agenceId) throw new ErreurMetier("L'agent doit appartenir à l'agence du dossier.", 422);
  await prisma.dossierRecouvrement.update({ where: { id }, data: { agentId } });
  await journal(actor, 'ASSIGN_RECOUVREMENT', id, `Dossier ${d.reference} assigné à ${u.prenom} ${u.nom}`);
  void emettre('recouvrement.nouveau_dossier', { entiteType: 'dossier_recouvrement', entiteId: id, agenceId: d.agenceId, donnees: { reference: d.reference, client: '', jours: d.joursRetard, montant: Number(d.montantImpaye), agentId, lien: `/dashboard/recouvrement/${id}` } });
  return { agent_id: agentId };
}

export async function relancer(actor: JwtPayload, id: number, c: { canal: CanalRelance; message?: string; resultat?: string; niveau?: number; latitude?: number; longitude?: number }) {
  const d = await dossierVisible(actor, id);
  if (ETATS_CLOS.includes(d.statut)) throw new ErreurMetier('Ce dossier est clos.', 409);
  const niveau = Math.min(4, Math.max(1, c.niveau ?? Math.max(d.niveauRequis, 1)));
  if (c.canal === 'visite' && (c.latitude === undefined || c.longitude === undefined)) {
    throw new ErreurMetier('Une visite de recouvrement doit être géolocalisée.', 422);
  }
  await prisma.$transaction([
    prisma.relanceRecouvrement.create({
      data: { dossierId: id, niveau, canal: c.canal, message: c.message ?? null, resultat: c.resultat ?? null, agentId: actor.sub, latitude: c.latitude ?? null, longitude: c.longitude ?? null },
    }),
    prisma.dossierRecouvrement.update({
      where: { id },
      data: {
        niveauAtteint: Math.max(d.niveauAtteint, niveau), derniereRelanceAt: new Date(),
        statut: d.statut === 'ouvert' ? 'en_relance' : d.statut,
        // Une visite sur place confirme la position du débiteur.
        ...(c.canal === 'visite' && c.latitude !== undefined ? { latitude: c.latitude, longitude: c.longitude, sourceLocalisation: 'terrain' } : {}),
      },
    }),
  ]);
  await journal(actor, 'RELANCE', id, `Relance niveau ${niveau} (${c.canal}) sur ${d.reference}`);
  return { niveau };
}

export async function creerPromesse(actor: JwtPayload, id: number, c: { montant: number; date_promise: string; commentaire?: string }) {
  const d = await dossierVisible(actor, id);
  if (ETATS_CLOS.includes(d.statut) || d.statut === 'contentieux') throw new ErreurMetier('Aucune promesse ne peut être enregistrée sur ce dossier.', 409);
  const date = new Date(c.date_promise);
  if (Number.isNaN(date.getTime()) || date < debutJour()) throw new ErreurMetier('La date promise doit être aujourd\'hui ou dans le futur.', 422);
  if (date.getTime() - debutJour().getTime() > 60 * JOUR_MS) throw new ErreurMetier('Une promesse ne peut pas dépasser 60 jours.', 422);
  const dû = Number(d.montantImpaye) + Number(d.penalites);
  if (c.montant > dû + 0.005) throw new ErreurMetier(`Le montant promis dépasse le dû (${dû}).`, 422);

  const p = await prisma.$transaction(async (tx) => {
    await tx.promessePaiement.updateMany({ where: { dossierId: id, statut: 'en_cours' }, data: { statut: 'annulee', traiteAt: new Date() } });
    const cree = await tx.promessePaiement.create({ data: { dossierId: id, montant: c.montant, datePromise: date, commentaire: c.commentaire ?? null, creeParId: actor.sub } });
    if (d.statut !== 'precontentieux') await tx.dossierRecouvrement.update({ where: { id }, data: { statut: 'promesse', prochaineActionAt: date } });
    return cree;
  });
  await journal(actor, 'PROMESSE', id, `Promesse de ${c.montant} pour le ${c.date_promise} sur ${d.reference}`);
  return p;
}

export async function traiterPromesse(actor: JwtPayload, id: number, promesseId: number, c: { statut: 'tenue' | 'rompue' | 'annulee'; montant_recu?: number }) {
  const d = await dossierVisible(actor, id);
  const r = await prisma.promessePaiement.updateMany({ where: { id: promesseId, dossierId: id, statut: 'en_cours' }, data: { statut: c.statut, montantRecu: c.montant_recu ?? null, traiteAt: new Date() } });
  if (r.count === 0) throw new ErreurMetier('Promesse introuvable ou déjà traitée.', 404);
  if (c.statut !== 'tenue' && d.statut === 'promesse') await prisma.dossierRecouvrement.update({ where: { id }, data: { statut: 'en_relance' } });
  await journal(actor, 'PROMESSE_TRAITEE', id, `Promesse ${promesseId} : ${c.statut}`);
  return { statut: c.statut };
}

export async function creerPlan(actor: JwtPayload, id: number, c: { nb_echeances: number; premiere_date: string; montant_total?: number }) {
  const d = await dossierVisible(actor, id);
  if (ETATS_CLOS.includes(d.statut) || d.statut === 'contentieux') throw new ErreurMetier('Aucun plan ne peut être proposé sur ce dossier.', 409);
  const ouvert = await prisma.planRegularisation.findFirst({ where: { dossierId: id, statut: { in: ['propose', 'actif'] } }, select: { id: true } });
  if (ouvert) throw new ErreurMetier('Un plan est déjà en cours pour ce dossier.', 409);
  const dû = arrondi(Number(d.montantImpaye) + Number(d.penalites));
  const total = c.montant_total ?? dû;
  if (total < dû - 0.005) throw new ErreurMetier(`Le plan doit couvrir au moins le dû (${dû}).`, 422);
  const debut = new Date(c.premiere_date);
  if (Number.isNaN(debut.getTime()) || debut < debutJour()) throw new ErreurMetier('La première échéance doit être dans le futur.', 422);

  const part = arrondi(total / c.nb_echeances);
  const lignes = Array.from({ length: c.nb_echeances }, (_, i) => {
    const date = new Date(debut);
    date.setUTCMonth(date.getUTCMonth() + i);
    // Dernière ligne : absorbe l'arrondi pour que la somme égale exactement le total.
    return { numero: i + 1, dateEcheance: date, montant: i === c.nb_echeances - 1 ? arrondi(total - part * (c.nb_echeances - 1)) : part };
  });
  const plan = await prisma.planRegularisation.create({ data: { dossierId: id, montantTotal: total, creeParId: actor.sub, lignes: { create: lignes } }, include: { lignes: true } });
  await journal(actor, 'PLAN_PROPOSE', id, `Plan de régularisation de ${total} en ${c.nb_echeances} échéance(s) sur ${d.reference}`);
  return plan;
}

/** Validation d'un plan : distincte de sa proposition (séparation des fonctions). */
export async function validerPlan(actor: JwtPayload, id: number, planId: number) {
  const d = await dossierVisible(actor, id);
  const plan = await prisma.planRegularisation.findFirst({ where: { id: planId, dossierId: id } });
  if (!plan || plan.statut !== 'propose') throw new ErreurMetier('Plan introuvable ou déjà traité.', 404);
  if (plan.creeParId === actor.sub) throw new ErreurMetier('Vous avez proposé ce plan : sa validation doit être faite par un autre acteur.', 403);
  await prisma.$transaction([
    prisma.planRegularisation.update({ where: { id: planId }, data: { statut: 'actif', valideParId: actor.sub, valideAt: new Date() } }),
    prisma.dossierRecouvrement.update({ where: { id }, data: { statut: 'plan_regularisation' } }),
  ]);
  await journal(actor, 'PLAN_VALIDE', id, `Plan ${planId} validé sur ${d.reference}`);
  return { statut: 'actif' };
}

export async function escalader(actor: JwtPayload, id: number, c: { vers: 'precontentieux' | 'contentieux' | 'irrecouvrable'; motif: string }) {
  const d = await dossierVisible(actor, id);
  if (ETATS_CLOS.includes(d.statut)) throw new ErreurMetier('Ce dossier est clos.', 409);
  const seuilPre = await parametreNombre('recouvrement.seuil_precontentieux_jours');
  const seuilCont = await parametreNombre('recouvrement.seuil_contentieux_jours');

  if (c.vers === 'precontentieux') {
    if (d.statut === 'precontentieux' || d.statut === 'contentieux') throw new ErreurMetier('Le dossier est déjà escaladé.', 409);
    if (d.joursRetard < seuilPre && d.niveauAtteint < 4) throw new ErreurMetier(`Escalade précontentieuse possible à partir de ${seuilPre} jours de retard ou après la relance de niveau 4.`, 422);
  } else if (c.vers === 'contentieux') {
    if (d.statut !== 'precontentieux') throw new ErreurMetier('Le contentieux exige une phase précontentieuse préalable.', 422);
    if (d.joursRetard < seuilCont && d.niveauAtteint < 4) throw new ErreurMetier(`Contentieux possible à partir de ${seuilCont} jours de retard.`, 422);
  } else if (d.statut !== 'contentieux') {
    throw new ErreurMetier("Seul un dossier en contentieux peut être classé irrécouvrable.", 422);
  }

  const maintenant = new Date();
  await prisma.dossierRecouvrement.update({
    where: { id },
    data: {
      statut: c.vers, motifEscalade: c.motif,
      ...(c.vers === 'precontentieux' ? { precontentieuxAt: maintenant } : c.vers === 'contentieux' ? { contentieuxAt: maintenant } : { clotureAt: maintenant, motifCloture: c.motif }),
    },
  });
  // Un plan ou une promesse encore ouverts n'ont plus de sens une fois le dossier escaladé.
  await prisma.promessePaiement.updateMany({ where: { dossierId: id, statut: 'en_cours' }, data: { statut: 'annulee', traiteAt: maintenant } });
  await prisma.planRegularisation.updateMany({ where: { dossierId: id, statut: { in: ['propose', 'actif'] } }, data: { statut: 'rompu' } });
  await journal(actor, `ESCALADE_${c.vers.toUpperCase()}`, id, `${d.reference} : ${c.vers}. ${c.motif}`);
  void emettre('recouvrement.escalade', { entiteType: 'dossier_recouvrement', entiteId: id, agenceId: d.agenceId, acteurId: actor.sub, donnees: { reference: d.reference, client: '', statut: c.vers, lien: `/dashboard/recouvrement/${id}` } });
  await archiverSansBloquer('demande_credit', d.demandeId, actor.sub, `Recouvrement : ${c.vers}`);
  return { statut: c.vers };
}

export async function localiser(actor: JwtPayload, id: number, lat: number, lng: number) {
  const d = await dossierVisible(actor, id);
  await prisma.dossierRecouvrement.update({ where: { id }, data: { latitude: lat, longitude: lng, sourceLocalisation: 'terrain' } });
  await journal(actor, 'LOCALISATION', id, `Localisation du débiteur de ${d.reference} mise à jour`);
  return { latitude: lat, longitude: lng };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tableau de bord
// ─────────────────────────────────────────────────────────────────────────────

export async function tableauDeBord(actor: JwtPayload, agenceId?: number) {
  const scope = await perimetre(actor);
  const where: Prisma.DossierRecouvrementWhereInput = { ...scope, ...(agenceId ? { agenceId } : {}) };
  const actifs = { ...where, statut: { notIn: ETATS_CLOS } };

  const [parClasse, parStatut, agg, recouvre, clos] = await Promise.all([
    prisma.dossierRecouvrement.groupBy({ by: ['classe'], where: actifs, _count: true, _sum: { montantImpaye: true, capitalRestantDu: true } }),
    prisma.dossierRecouvrement.groupBy({ by: ['statut'], where: actifs, _count: true, _sum: { montantImpaye: true } }),
    prisma.dossierRecouvrement.aggregate({ where: actifs, _count: true, _sum: { montantImpaye: true, penalites: true, capitalRestantDu: true } }),
    prisma.dossierRecouvrement.aggregate({ where, _sum: { montantRecouvre: true } }),
    prisma.dossierRecouvrement.count({ where: { ...where, statut: 'regularise' } }),
  ]);

  const demandeWhere: Prisma.DemandeCreditWhereInput = { statut: 'decaissee', ...(agenceId ? { agenceId } : {}) };
  const encours = await prisma.echeance.aggregate({ _sum: { capital: true }, where: { demande: demandeWhere, statut: { not: 'payee' } } });
  const encoursTotal = Number(encours._sum.capital ?? 0);
  const echus = await prisma.echeance.count({ where: { demande: demandeWhere, dateEcheance: { lt: debutJour() } } });
  const echusEnRetard = await prisma.echeance.count({ where: { demande: demandeWhere, dateEcheance: { lt: debutJour() }, statut: { not: 'payee' } } });

  // Portefeuille à risque : capital restant dû des crédits dont le retard dépasse N jours, rapporté à l'encours.
  const par = async (jours: number) => {
    const r = await prisma.dossierRecouvrement.aggregate({ where: { ...actifs, joursRetard: { gt: jours } }, _sum: { capitalRestantDu: true } });
    return encoursTotal > 0 ? arrondi((Number(r._sum.capitalRestantDu ?? 0) / encoursTotal) * 100) : 0;
  };

  const impaye = Number(agg._sum.montantImpaye ?? 0);
  const deja = Number(recouvre._sum.montantRecouvre ?? 0);
  return {
    dossiers_actifs: agg._count, montant_impaye: impaye, penalites: Number(agg._sum.penalites ?? 0), capital_en_risque: Number(agg._sum.capitalRestantDu ?? 0),
    encours_total: encoursTotal, dossiers_regularises: clos, montant_recouvre: deja,
    taux_recouvrement: impaye + deja > 0 ? arrondi((deja / (impaye + deja)) * 100) : 0,
    taux_retard: echus > 0 ? arrondi((echusEnRetard / echus) * 100) : 0,
    par1: await par(0), par30: await par(30), par90: await par(90),
    par_classe: parClasse.map((c) => ({ classe: c.classe, nb: c._count, montant: Number(c._sum.montantImpaye ?? 0), capital: Number(c._sum.capitalRestantDu ?? 0) })),
    par_statut: parStatut.map((c) => ({ statut: c.statut, nb: c._count, montant: Number(c._sum.montantImpaye ?? 0) })),
  };
}
