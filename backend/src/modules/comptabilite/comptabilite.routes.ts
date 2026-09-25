import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { success, created } from '../../lib/response';
import { createLog } from '../../lib/logger';
import { ErreurMetier } from '../../lib/rbac';
import { parsePagination, paginationMeta } from '../../lib/pagination';
import { arrondi } from '../../lib/finance/grilleAnalyse';
import { poster, periodeDe, verifierEquilibre } from '../../lib/compta';
import { appelerSysteme } from '../../lib/echanges';

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };
const pid = (req: Request) => parseInt(req.params.id, 10);
const journal = (req: Request, action: string, type: string, id: number, description: string) =>
  createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined, module: 'comptabilite', action, entiteType: type, entiteId: id, description });

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');
const finDeJour = (d: string) => new Date(`${d}T23:59:59.999Z`);
const debutDeJour = (d: string) => new Date(`${d}T00:00:00.000Z`);

function bornes(q: Record<string, unknown>): Prisma.EcritureComptableWhereInput {
  const du = q.du ? dateSchema.parse(q.du) : undefined;
  const au = q.au ? dateSchema.parse(q.au) : undefined;
  return { statut: 'validee', ...(du || au ? { dateOperation: { ...(du ? { gte: debutDeJour(du) } : {}), ...(au ? { lte: finDeJour(au) } : {}) } } : {}) };
}

/** Solde d'un compte selon son sens normal : positif quand il est dans son sens habituel. */
const solde = (sens: 'debit' | 'credit', debit: number, credit: number) => arrondi(sens === 'debit' ? debit - credit : credit - debit);

async function totauxParCompte(where: Prisma.EcritureComptableWhereInput) {
  const lignes = await prisma.ligneEcriture.groupBy({ by: ['compteId', 'sens'], where: { ecriture: where }, _sum: { montant: true } });
  const comptes = await prisma.compteComptable.findMany({ orderBy: { numero: 'asc' } });
  const map = new Map<number, { debit: number; credit: number }>();
  for (const l of lignes) {
    const c = map.get(l.compteId) ?? { debit: 0, credit: 0 };
    c[l.sens] += Number(l._sum.montant ?? 0);
    map.set(l.compteId, c);
  }
  return comptes.map((c) => {
    const t = map.get(c.id) ?? { debit: 0, credit: 0 };
    return { ...c, debit: arrondi(t.debit), credit: arrondi(t.credit), solde: solde(c.sensNormal, t.debit, t.credit), net_debit: arrondi(t.debit - t.credit) };
  });
}

const csv = (lignes: (string | number | null)[][]) =>
  '﻿' + lignes.map((l) => l.map((v) => { const t = v == null ? '' : String(v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(';')).join('\n');

const router = Router();
router.use(authenticate);

// ── Plan comptable ──────────────────────────────────────────────────────────
router.get('/plan', can('comptabilite:VIEW'), wrap(async (_req, res) => success(res, await prisma.compteComptable.findMany({ orderBy: { numero: 'asc' } }))));

router.post('/plan', can('comptabilite:CREATE'), wrap(async (req, res) => {
  const b = z.object({ numero: z.string().regex(/^\d{3,10}$/, 'Numéro de 3 à 10 chiffres'), libelle: z.string().min(3).max(200), sens_normal: z.enum(['debit', 'credit']) }).parse(req.body);
  const classe = parseInt(b.numero[0], 10);
  if (classe < 1 || classe > 9) throw new ErreurMetier('La classe (premier chiffre) doit être comprise entre 1 et 9.', 422);
  const c = await prisma.compteComptable.create({ data: { numero: b.numero, libelle: b.libelle, classe, sensNormal: b.sens_normal } });
  await journal(req, 'CREATE_COMPTE_COMPTABLE', 'compte_comptable', c.id, `Compte ${c.numero} ${c.libelle} créé`);
  return created(res, c);
}));

// ── Journal, grand livre, balance, états ────────────────────────────────────
router.get('/journal', can('comptabilite:VIEW'), wrap(async (req, res) => {
  const { skip, take, page, perPage } = parsePagination(req.query as Record<string, unknown>);
  const where = { ...bornes(req.query as Record<string, unknown>), ...(req.query.journal ? { journal: req.query.journal as never } : {}), ...(req.query.evenement ? { evenement: String(req.query.evenement) } : {}) };
  const [items, total] = await Promise.all([
    prisma.ecritureComptable.findMany({ where, orderBy: [{ dateOperation: 'desc' }, { id: 'desc' }], skip, take, include: { lignes: { include: { compte: { select: { numero: true, libelle: true } } } } } }),
    prisma.ecritureComptable.count({ where }),
  ]);
  return success(res, items, 200, paginationMeta(page, perPage, total));
}));

router.get('/grand-livre', can('comptabilite:VIEW'), wrap(async (req, res) => {
  const numero = z.string().min(3).parse(req.query.compte);
  const compte = await prisma.compteComptable.findUnique({ where: { numero } });
  if (!compte) throw new ErreurMetier('Compte introuvable', 404);
  const lignes = await prisma.ligneEcriture.findMany({ where: { compteId: compte.id, ecriture: bornes(req.query as Record<string, unknown>) }, orderBy: [{ ecriture: { dateOperation: 'asc' } }, { id: 'asc' }], include: { ecriture: { select: { numeroPiece: true, dateOperation: true, libelle: true } } }, take: 5000 });
  let cumul = 0;
  const detail = lignes.map((l) => {
    const m = Number(l.montant);
    cumul += (l.sens === compte.sensNormal ? m : -m);
    return { date: l.ecriture.dateOperation, piece: l.ecriture.numeroPiece, libelle: l.libelle ?? l.ecriture.libelle, debit: l.sens === 'debit' ? m : 0, credit: l.sens === 'credit' ? m : 0, solde: arrondi(cumul) };
  });
  return success(res, { compte, lignes: detail, solde_final: arrondi(cumul) });
}));

router.get('/balance', can('comptabilite:VIEW'), wrap(async (req, res) => {
  const comptes = (await totauxParCompte(bornes(req.query as Record<string, unknown>))).filter((c) => c.debit !== 0 || c.credit !== 0);
  const totalDebit = arrondi(comptes.reduce((s, c) => s + c.debit, 0));
  const totalCredit = arrondi(comptes.reduce((s, c) => s + c.credit, 0));
  return success(res, { comptes, total_debit: totalDebit, total_credit: totalCredit, equilibree: Math.abs(totalDebit - totalCredit) < 0.005 });
}));

router.get('/etats', can('comptabilite:VIEW'), wrap(async (req, res) => {
  const au = req.query.au ? dateSchema.parse(req.query.au) : new Date().toISOString().slice(0, 10);
  const du = req.query.du ? dateSchema.parse(req.query.du) : `${au.slice(0, 4)}-01-01`;

  // Compte de résultat sur la période demandée.
  const periode = (await totauxParCompte(bornes({ du, au }))).filter((c) => c.classe === 6 || c.classe === 7);
  const charges = periode.filter((c) => c.classe === 6).map((c) => ({ numero: c.numero, libelle: c.libelle, montant: c.solde }));
  const produits = periode.filter((c) => c.classe === 7).map((c) => ({ numero: c.numero, libelle: c.libelle, montant: c.solde }));
  const totalCharges = arrondi(charges.reduce((s, c) => s + c.montant, 0));
  const totalProduits = arrondi(produits.reduce((s, c) => s + c.montant, 0));

  // Bilan au jour demandé, cumulé depuis l'origine (pas de clôture d'exercice) : le résultat cumulé le boucle.
  const cumul = await totauxParCompte(bornes({ au }));
  const bilan = cumul.filter((c) => c.classe >= 1 && c.classe <= 5 && (c.debit !== 0 || c.credit !== 0));
  const actif = bilan.filter((c) => c.net_debit > 0).map((c) => ({ numero: c.numero, libelle: c.libelle, montant: c.net_debit }));
  const passif = bilan.filter((c) => c.net_debit < 0).map((c) => ({ numero: c.numero, libelle: c.libelle, montant: arrondi(-c.net_debit) }));
  const resultatCumule = arrondi(cumul.filter((c) => c.classe === 7).reduce((s, c) => s + c.solde, 0) - cumul.filter((c) => c.classe === 6).reduce((s, c) => s + c.solde, 0));
  if (resultatCumule >= 0) passif.push({ numero: '—', libelle: 'Résultat cumulé (bénéfice)', montant: resultatCumule });
  else actif.push({ numero: '—', libelle: 'Résultat cumulé (perte)', montant: arrondi(-resultatCumule) });
  const totalActif = arrondi(actif.reduce((s, l) => s + l.montant, 0));
  const totalPassif = arrondi(passif.reduce((s, l) => s + l.montant, 0));

  return success(res, {
    periode: { du, au },
    compte_de_resultat: { produits, charges, total_produits: totalProduits, total_charges: totalCharges, resultat: arrondi(totalProduits - totalCharges) },
    bilan: { actif, passif, total_actif: totalActif, total_passif: totalPassif, equilibre: Math.abs(totalActif - totalPassif) < 0.005 },
    avertissement: 'États établis sur le plan comptable minimal ; à valider avant tout usage réglementaire.',
  });
}));

// ── Écritures manuelles et annulation ───────────────────────────────────────
router.post('/ecritures', can('comptabilite:CREATE'), wrap(async (req, res) => {
  const b = z.object({
    date: dateSchema, libelle: z.string().min(3).max(255), journal: z.enum(['caisse', 'banque', 'operations_diverses']).default('operations_diverses'),
    lignes: z.array(z.object({ compte: z.string().min(3), sens: z.enum(['debit', 'credit']), montant: z.coerce.number().positive(), libelle: z.string().optional() })).min(2),
  }).parse(req.body);
  const eq = verifierEquilibre(b.lignes);
  if (!eq.equilibre) throw new ErreurMetier(`Écriture déséquilibrée : débit ${eq.debit}, crédit ${eq.credit}.`, 422);
  const e = await poster({ cle: `man:${randomUUID()}`, journal: b.journal, libelle: b.libelle, evenement: 'manuelle', date: debutDeJour(b.date), acteurId: req.user!.sub, lignes: b.lignes });
  await journal(req, 'ECRITURE_MANUELLE', 'ecriture', e.id, `Écriture manuelle « ${b.libelle} » (${eq.debit})`);
  return created(res, e);
}));

router.post('/ecritures/:id/annuler', can('comptabilite:APPROVE'), wrap(async (req, res) => {
  const { motif } = z.object({ motif: z.string().min(5) }).parse(req.body);
  const e = await prisma.ecritureComptable.findUnique({ where: { id: pid(req) } });
  if (!e) throw new ErreurMetier('Écriture introuvable', 404);
  if (e.statut === 'annulee') throw new ErreurMetier('Écriture déjà annulée.', 409);
  const periode = await prisma.periodeComptable.findUnique({ where: { periode: e.periode } });
  if (periode?.cloturee) throw new ErreurMetier(`La période ${e.periode} est clôturée.`, 409);
  await prisma.ecritureComptable.update({ where: { id: e.id }, data: { statut: 'annulee', libelle: `${e.libelle} [ANNULÉE : ${motif}]`.slice(0, 255) } });
  await journal(req, 'ANNULATION_ECRITURE', 'ecriture', e.id, `Écriture ${e.numeroPiece} annulée : ${motif}`);
  return success(res, { statut: 'annulee' });
}));

// ── Périodes ────────────────────────────────────────────────────────────────
router.get('/periodes', can('comptabilite:VIEW'), wrap(async (_req, res) => {
  const [periodes, usage] = await Promise.all([
    prisma.periodeComptable.findMany({ orderBy: { periode: 'desc' } }),
    prisma.ecritureComptable.groupBy({ by: ['periode'], where: { statut: 'validee' }, _count: true, orderBy: { periode: 'desc' } }),
  ]);
  const clotures = new Map(periodes.map((p) => [p.periode, p]));
  return success(res, usage.map((u) => ({ periode: u.periode, nb_ecritures: u._count, cloturee: clotures.get(u.periode)?.cloturee ?? false, cloture_at: clotures.get(u.periode)?.clotureAt ?? null })));
}));

router.post('/periodes/:periode/cloturer', can('comptabilite:APPROVE'), wrap(async (req, res) => {
  const periode = z.string().regex(/^\d{4}-\d{2}$/).parse(req.params.periode);
  if (periode >= periodeDe(new Date())) throw new ErreurMetier("Seule une période échue peut être clôturée.", 422);
  const [debut, fin] = [new Date(`${periode}-01T00:00:00Z`), new Date(new Date(`${periode}-01T00:00:00Z`).setUTCMonth(new Date(`${periode}-01T00:00:00Z`).getUTCMonth() + 1))];
  const eq = await totauxParCompte({ statut: 'validee', dateOperation: { gte: debut, lt: fin } });
  const d = eq.reduce((s, c) => s + c.debit, 0); const c = eq.reduce((s, x) => s + x.credit, 0);
  if (Math.abs(d - c) > 0.005) throw new ErreurMetier(`La période n'est pas équilibrée (débit ${arrondi(d)}, crédit ${arrondi(c)}).`, 409);
  await prisma.periodeComptable.upsert({ where: { periode }, create: { periode, cloturee: true, clotureParId: req.user!.sub, clotureAt: new Date() }, update: { cloturee: true, clotureParId: req.user!.sub, clotureAt: new Date() } });
  await journal(req, 'CLOTURE_PERIODE', 'periode', 0, `Période ${periode} clôturée`);
  return success(res, { periode, cloturee: true });
}));

router.post('/periodes/:periode/rouvrir', can('comptabilite:APPROVE'), wrap(async (req, res) => {
  const periode = z.string().regex(/^\d{4}-\d{2}$/).parse(req.params.periode);
  const { motif } = z.object({ motif: z.string().min(5) }).parse(req.body);
  await prisma.periodeComptable.updateMany({ where: { periode }, data: { cloturee: false, clotureAt: null } });
  await journal(req, 'REOUVERTURE_PERIODE', 'periode', 0, `Période ${periode} rouverte : ${motif}`);
  return success(res, { periode, cloturee: false });
}));

// ── Export et intégration ───────────────────────────────────────────────────
async function lignesExport(where: Prisma.EcritureComptableWhereInput) {
  const ecritures = await prisma.ecritureComptable.findMany({ where, orderBy: [{ dateOperation: 'asc' }, { id: 'asc' }], include: { lignes: { include: { compte: { select: { numero: true } } } } }, take: 20000 });
  return ecritures.flatMap((e) => e.lignes.map((l) => ({
    journal: e.journal, date: e.dateOperation.toISOString().slice(0, 10), piece: e.numeroPiece, compte: l.compte.numero, libelle: l.libelle ?? e.libelle,
    debit: l.sens === 'debit' ? Number(l.montant).toFixed(2) : '', credit: l.sens === 'credit' ? Number(l.montant).toFixed(2) : '', evenement: e.evenement,
  })));
}

router.get('/export', can('comptabilite:EXPORT'), wrap(async (req, res) => {
  const lignes = await lignesExport(bornes(req.query as Record<string, unknown>));
  await journal(req, 'EXPORT_COMPTABLE', 'export', 0, `Export comptable de ${lignes.length} ligne(s)`);
  if (req.query.format === 'json') return success(res, lignes);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="export-comptable.csv"');
  return res.send(csv([['journal', 'date', 'piece', 'compte', 'libelle', 'debit', 'credit', 'evenement'], ...lignes.map((l) => [l.journal, l.date, l.piece, l.compte, l.libelle, l.debit, l.credit, l.evenement])]));
}));

/** Transmet au système comptable externe les écritures pas encore exportées (lot de 500 au plus). */
router.post('/export/pousser', can('comptabilite:EXECUTE'), wrap(async (req, res) => {
  const url = process.env.COMPTA_EXPORT_URL;
  if (!url) throw new ErreurMetier("Aucun système comptable n'est configuré (variable COMPTA_EXPORT_URL).", 422);
  const ecritures = await prisma.ecritureComptable.findMany({ where: { statut: 'validee', exporteAt: null }, orderBy: { id: 'asc' }, take: 500, include: { lignes: { include: { compte: { select: { numero: true } } } } } });
  if (ecritures.length === 0) return success(res, { transmises: 0 });
  const corps = JSON.stringify({ source: 'CECAW Finance 360', ecritures: ecritures.map((e) => ({ piece: e.numeroPiece, journal: e.journal, date: e.dateOperation.toISOString().slice(0, 10), libelle: e.libelle, lignes: e.lignes.map((l) => ({ compte: l.compte.numero, sens: l.sens, montant: Number(l.montant) })) })) });
  const r = await appelerSysteme('comptabilite', url, { headers: { 'Content-Type': 'application/json', ...(process.env.COMPTA_EXPORT_KEY ? { Authorization: `Bearer ${process.env.COMPTA_EXPORT_KEY}` } : {}) }, corps, reference: `export:${ecritures[0].id}-${ecritures[ecritures.length - 1].id}`, delaiMs: 30_000 });
  if (!r.ok) throw new ErreurMetier(`Le système comptable a refusé le lot : ${r.erreur ?? `HTTP ${r.statut}`}`, 502);
  await prisma.ecritureComptable.updateMany({ where: { id: { in: ecritures.map((e) => e.id) } }, data: { exporteAt: new Date() } });
  await journal(req, 'EXPORT_COMPTABLE_PUSH', 'export', 0, `${ecritures.length} écriture(s) transmises`);
  return success(res, { transmises: ecritures.length });
}));

// ── Rapprochement bancaire ──────────────────────────────────────────────────
function parserCsv(texte: string) {
  return texte.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((l, i) => !(i === 0 && /date/i.test(l))).map((l) => {
    const [date, libelle, montant, reference] = l.split(';').map((x) => x.trim());
    const m = Number((montant ?? '').replace(/\s/g, '').replace(',', '.'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !libelle || !Number.isFinite(m)) throw new ErreurMetier(`Ligne de relevé invalide : « ${l} » (format attendu : AAAA-MM-JJ;libellé;montant;référence).`, 422);
    return { date, libelle, montant: m, reference: reference || undefined };
  });
}

router.post('/releves', can('comptabilite:UPDATE'), wrap(async (req, res) => {
  const b = z.object({
    banque: z.string().min(2).max(150), compte: z.string().max(60).optional(), csv: z.string().optional(),
    lignes: z.array(z.object({ date: dateSchema, libelle: z.string().min(1).max(255), montant: z.coerce.number(), reference: z.string().optional() })).optional(),
  }).parse(req.body);
  const lignes = b.lignes ?? (b.csv ? parserCsv(b.csv) : []);
  if (lignes.length === 0) throw new ErreurMetier('Le relevé ne contient aucune ligne.', 422);
  if (lignes.length > 5000) throw new ErreurMetier('Un relevé ne peut pas dépasser 5000 lignes.', 422);
  const dates = lignes.map((l) => l.date).sort();
  const r = await prisma.releveBancaire.create({
    data: { banque: b.banque, compte: b.compte ?? null, dateDebut: debutDeJour(dates[0]), dateFin: debutDeJour(dates[dates.length - 1]), importParId: req.user!.sub, lignes: { create: lignes.map((l) => ({ dateOperation: debutDeJour(l.date), libelle: l.libelle, montant: l.montant, reference: l.reference ?? null })) } },
  });
  await journal(req, 'IMPORT_RELEVE', 'releve', r.id, `Relevé ${b.banque} importé : ${lignes.length} ligne(s)`);
  return created(res, { id: r.id, nb_lignes: lignes.length });
}));

router.get('/releves', can('comptabilite:VIEW'), wrap(async (_req, res) => {
  const releves = await prisma.releveBancaire.findMany({ orderBy: { id: 'desc' }, take: 50, include: { _count: { select: { lignes: true } } } });
  const stats = await prisma.ligneReleve.groupBy({ by: ['releveId', 'statut'], _count: true });
  return success(res, releves.map((r) => ({ ...r, statuts: Object.fromEntries(stats.filter((s) => s.releveId === r.id).map((s) => [s.statut, s._count])) })));
}));

router.get('/releves/:id', can('comptabilite:VIEW'), wrap(async (req, res) => {
  const r = await prisma.releveBancaire.findUnique({ where: { id: pid(req) }, include: { lignes: { orderBy: [{ dateOperation: 'asc' }, { id: 'asc' }], include: { ecriture: { select: { numeroPiece: true, libelle: true } } } } } });
  if (!r) throw new ErreurMetier('Relevé introuvable', 404);
  // Écritures de banque qu'aucune ligne de relevé ne couvre : à justifier.
  const dejaLiees = r.lignes.map((l) => l.ecritureId).filter((x): x is number => x !== null);
  const compteBanque = await prisma.compteComptable.findUnique({ where: { numero: '5211' } });
  const orphelines = compteBanque ? await prisma.ecritureComptable.findMany({
    where: { statut: 'validee', id: { notIn: dejaLiees }, dateOperation: { gte: r.dateDebut ?? undefined, lte: r.dateFin ?? undefined }, lignes: { some: { compteId: compteBanque.id } }, lignesReleve: { none: {} } },
    select: { id: true, numeroPiece: true, libelle: true, dateOperation: true, lignes: { where: { compteId: compteBanque.id }, select: { sens: true, montant: true } } }, take: 200,
  }) : [];
  return success(res, { ...r, ecritures_non_rapprochees: orphelines });
}));

/** Rapprochement automatique : même montant (signé) à ±3 jours, l'écriture la plus proche en date l'emporte. */
router.post('/releves/:id/rapprocher', can('comptabilite:UPDATE'), wrap(async (req, res) => {
  const releve = await prisma.releveBancaire.findUnique({ where: { id: pid(req) }, include: { lignes: { where: { statut: 'non_rapprochee' } } } });
  if (!releve) throw new ErreurMetier('Relevé introuvable', 404);
  const banque = await prisma.compteComptable.findUnique({ where: { numero: '5211' } });
  if (!banque) throw new ErreurMetier('Le compte 5211 (Banques) est introuvable.', 500);
  const tolerance = 3 * 86_400_000;

  const candidates = await prisma.ligneEcriture.findMany({
    where: { compteId: banque.id, ecriture: { statut: 'validee', lignesReleve: { none: {} }, dateOperation: { gte: new Date((releve.dateDebut?.getTime() ?? 0) - tolerance), lte: new Date((releve.dateFin?.getTime() ?? Date.now()) + tolerance) } } },
    select: { montant: true, sens: true, ecriture: { select: { id: true, dateOperation: true, numeroPiece: true } } },
  });
  const pool = candidates.map((c) => ({ ecritureId: c.ecriture.id, date: c.ecriture.dateOperation.getTime(), piece: c.ecriture.numeroPiece, signe: arrondi(c.sens === 'debit' ? Number(c.montant) : -Number(c.montant)) }));
  const prises = new Set<number>();
  let rapprochees = 0;
  for (const l of releve.lignes) {
    const cible = arrondi(Number(l.montant));
    // Proximité en date ; une référence retrouvée dans le numéro de pièce prime sur la date.
    const ecart = (p: { date: number; piece: string }) => Math.abs(p.date - l.dateOperation.getTime()) - (l.reference && p.piece.includes(l.reference) ? 1e12 : 0);
    const choix = pool.filter((p) => !prises.has(p.ecritureId) && p.signe === cible && Math.abs(p.date - l.dateOperation.getTime()) <= tolerance)
      .sort((a, b) => ecart(a) - ecart(b))[0];
    if (!choix) continue;
    prises.add(choix.ecritureId);
    await prisma.ligneReleve.update({ where: { id: l.id }, data: { statut: 'rapprochee', ecritureId: choix.ecritureId } });
    rapprochees++;
  }
  await journal(req, 'RAPPROCHEMENT_BANCAIRE', 'releve', releve.id, `${rapprochees}/${releve.lignes.length} ligne(s) rapprochée(s) automatiquement`);
  return success(res, { lignes_examinees: releve.lignes.length, rapprochees, restantes: releve.lignes.length - rapprochees });
}));

router.put('/releves/lignes/:id', can('comptabilite:UPDATE'), wrap(async (req, res) => {
  const b = z.object({ statut: z.enum(['rapprochee', 'ecart', 'non_rapprochee']), ecriture_id: z.coerce.number().int().positive().nullable().optional(), commentaire: z.string().optional() }).parse(req.body);
  if (b.statut === 'ecart' && !b.commentaire?.trim()) throw new ErreurMetier("Un commentaire est obligatoire pour justifier un écart.", 422);
  if (b.statut === 'rapprochee' && !b.ecriture_id) throw new ErreurMetier("Indiquez l'écriture rapprochée.", 422);
  const l = await prisma.ligneReleve.update({ where: { id: pid(req) }, data: { statut: b.statut, ecritureId: b.statut === 'non_rapprochee' ? null : b.ecriture_id ?? undefined, commentaire: b.commentaire ?? null } });
  await journal(req, 'RAPPROCHEMENT_MANUEL', 'ligne_releve', l.id, `Ligne de relevé #${l.id} : ${b.statut}`);
  return success(res, l);
}));

export default router;
