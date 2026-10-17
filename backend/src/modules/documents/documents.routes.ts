import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { ErreurMetier, rolesEffectifs } from '../../lib/rbac';
import { DocumentPdf, montantPdf, datePdf, nombrePdf, montantArrondiPdf } from '../../lib/pdf';
import { createLog } from '../../lib/logger';
import { z } from 'zod';
import { demandeVisible, simuler } from '../credit/credit.service';

/**
 * Documents PDF : relevé de compte (COMPTES 6), contrat de crédit et échéancier (CRÉDIT 16 et 18).
 * Chaque génération est journalisée : un document sensible doit pouvoir être retracé.
 */

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (e) { next(e); } };

function envoyer(res: Response, doc: DocumentPdf, nom: string) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nom}.pdf"`);
  res.send(doc.build());
}

const router = Router();
router.use(authenticate);

router.get('/comptes/:id/releve', can('comptes:VIEW', 'comptes:EXPORT'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const compte = await prisma.compteClient.findUnique({ where: { id }, include: { produit: { select: { nom: true } }, client: { select: { id: true, nom: true, prenom: true, adresse: true, agenceId: true, agence: { select: { nom: true } } } } } });
  if (!compte) throw new ErreurMetier('Compte introuvable', 404);
  const roles = await rolesEffectifs(req.user!.sub, req.user!.role);
  if (!roles.has('R03') && !roles.has('R15') && req.user!.agenceId !== compte.client.agenceId) throw new ErreurMetier('Compte hors de votre périmètre.', 403);

  const du = req.query.du ? new Date(String(req.query.du)) : new Date(Date.now() - 90 * 86_400_000);
  const au = req.query.au ? new Date(`${String(req.query.au)}T23:59:59.999Z`) : new Date();
  if (Number.isNaN(du.getTime()) || Number.isNaN(au.getTime())) throw new ErreurMetier('Période invalide.', 422);

  const ops = await prisma.transaction.findMany({ where: { compteId: id, createdAt: { gte: du, lte: au } }, orderBy: { createdAt: 'asc' }, take: 2000 });
  const soldeInitial = ops.length ? Number(ops[0].soldeAvant) : Number(compte.solde);
  const totalCredits = ops.filter((o) => o.type === 'credit').reduce((s, o) => s + Number(o.montant), 0);
  const totalDebits = ops.filter((o) => o.type === 'debit').reduce((s, o) => s + Number(o.montant), 0);

  const doc = new DocumentPdf(`Releve ${compte.numero}`);
  doc.titre('CECAW FINANCE - Relevé de compte');
  doc.champ('Titulaire', `${compte.client.prenom ?? ''} ${compte.client.nom}`.trim());
  doc.champ('Compte', `${compte.numero} - ${compte.produit.nom}`);
  doc.champ('Agence', compte.client.agence.nom);
  doc.champ('Période', `du ${datePdf(du)} au ${datePdf(au)}`);
  doc.espace();
  doc.champ('Solde initial', montantPdf(soldeInitial));
  doc.champ('Total versements', montantPdf(totalCredits));
  doc.champ('Total retraits', montantPdf(totalDebits));
  doc.champ('Solde final', montantPdf(ops.length ? Number(ops[ops.length - 1].soldeApres) : Number(compte.solde)));
  doc.sousTitre(`Opérations (${ops.length})`);
  doc.tableau(
    [{ titre: 'Date', largeur: 14 }, { titre: 'Reçu', largeur: 20 }, { titre: 'Motif', largeur: 30 }, { titre: 'Débit', largeur: 18, alignement: 'd' }, { titre: 'Crédit', largeur: 18, alignement: 'd' }, { titre: 'Solde', largeur: 20, alignement: 'd' }],
    ops.map((o) => [datePdf(o.createdAt), o.recuNumero ?? '', o.motif ?? '', o.type === 'debit' ? montantPdf(Number(o.montant)).replace(' FCFA', '') : '', o.type === 'credit' ? montantPdf(Number(o.montant)).replace(' FCFA', '') : '', montantPdf(Number(o.soldeApres)).replace(' FCFA', '')]),
  );
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined, module: 'system', action: 'EXPORT_RELEVE', entiteType: 'compte', entiteId: id, description: `Relevé du compte ${compte.numero}` });
  return envoyer(res, doc, `releve-${compte.numero}`);
}));

/**
 * Échéancier de simulation (avant toute demande) : à remettre ou envoyer au client, sans valeur contractuelle.
 * Recalculé côté serveur avec le paramétrage en vigueur : le document ne peut pas être falsifié depuis l'écran.
 */
const simulationPdfSchema = z.object({
  produit_id: z.coerce.number().int().positive(),
  montant: z.coerce.number().positive(),
  duree_mois: z.coerce.number().int().positive(),
  periodicite: z.enum(['mensuel', 'bimensuel', 'trimestriel', 'semestriel']).default('mensuel'),
  differe_mois: z.coerce.number().int().nonnegative().optional(),
  client_id: z.coerce.number().int().positive().optional(),
});
const LIBELLE_PERIODICITE: Record<string, string> = { mensuel: 'Mensuelle', bimensuel: 'Bimestrielle', trimestriel: 'Trimestrielle', semestriel: 'Semestrielle' };
const LIBELLE_MODE: Record<string, string> = { constant: 'Annuités constantes', degressif: 'Capital constant (dégressif)', in_fine: 'In fine' };

router.post('/credits/simulation', can('credit:VIEW'), wrap(async (req, res) => {
  const c = simulationPdfSchema.parse(req.body);
  const sim = await simuler(c);
  const [produit, client] = await Promise.all([
    prisma.produit.findUnique({ where: { id: c.produit_id }, select: { nom: true } }),
    c.client_id ? prisma.client.findUnique({ where: { id: c.client_id }, select: { nom: true, prenom: true } }) : null,
  ]);
  const avecTva = sim.taux_tva > 0 && sim.totalTva + sim.tvaFraisDossier > 0;
  const maintenant = new Date();
  const doc = new DocumentPdf('Simulation de crédit');
  doc.entete({
    document: 'Simulation de crédit',
    reference: `Réf. SIM-${maintenant.toISOString().slice(0, 10).replace(/-/g, '')}-${String(maintenant.getUTCHours()).padStart(2, '0')}${String(maintenant.getUTCMinutes()).padStart(2, '0')}`,
    date: `Établie le ${datePdf(maintenant)}`,
  });
  doc.indicateurs([
    { libelle: 'Montant du crédit', valeur: montantArrondiPdf(c.montant), detail: `sur ${c.duree_mois} mois` },
    { libelle: 'Première échéance', valeur: montantArrondiPdf(sim.premiereEcheance), detail: LIBELLE_PERIODICITE[c.periodicite].toLowerCase() },
    { libelle: 'Total à rembourser', valeur: montantArrondiPdf(sim.totalARembourser), detail: avecTva ? 'hors frais, TVA incluse' : 'hors frais de dossier' },
    { libelle: 'Coût total / TEG', valeur: montantArrondiPdf(sim.coutTotal), detail: `TEG approché ${sim.teg} %` },
  ]);
  doc.bloc('Client et produit', [
    ['Client', client ? `${client.prenom ?? ''} ${client.nom}`.trim() : 'Non renseigné'],
    ['Produit de crédit', produit?.nom ?? '-'],
  ]);
  doc.bloc('Conditions du crédit', [
    ['Montant demandé', montantPdf(c.montant)],
    ['Durée', `${c.duree_mois} mois${c.differe_mois ? ` dont ${c.differe_mois} de différé` : ''}`],
    ['Périodicité', LIBELLE_PERIODICITE[c.periodicite]],
    ["Taux d'intérêt annuel", `${sim.taux_annuel} %`],
    ["Mode d'amortissement", LIBELLE_MODE[sim.mode_amortissement] ?? sim.mode_amortissement],
    ['Frais de dossier', montantPdf(sim.frais_dossier)],
    ['Total des intérêts', montantPdf(sim.totalInterets)],
    ...(avecTva ? [[`TVA (${sim.taux_tva} %)`, `${montantPdf(sim.totalTva)} sur intérêts${sim.tvaFraisDossier > 0 ? ` + ${montantPdf(sim.tvaFraisDossier)} sur frais` : ''}`] as [string, string]] : []),
  ]);
  if (!sim.eligible) doc.encadre(`Demande non éligible en l'état : ${sim.motifs_ineligibilite.join(' ; ')}`, 'alerte');
  const num = (n: number) => nombrePdf(n);
  const somme = (cle: 'capital' | 'interet' | 'tva' | 'montantTotal') => num(sim.lignes.reduce((t, l) => t + l[cle], 0));
  doc.sousTitre('Calendrier de remboursement (montants en FCFA)');
  doc.tableau(
    [{ titre: 'N°', largeur: 6 }, { titre: 'Échéance le', largeur: 14 }, { titre: 'Capital', largeur: 17, alignement: 'd' }, { titre: 'Intérêts', largeur: 15, alignement: 'd' },
      ...(avecTva ? [{ titre: 'TVA', largeur: 12, alignement: 'd' as const }] : []),
      { titre: 'À payer', largeur: 18, alignement: 'd' }, { titre: 'Capital restant dû', largeur: 19, alignement: 'd' }],
    sim.lignes.map((l) => [String(l.numero), datePdf(l.dateEcheance), num(l.capital), num(l.interet), ...(avecTva ? [num(l.tva)] : []), num(l.montantTotal), num(l.capitalRestantDu)]),
    ['', 'Total', somme('capital'), somme('interet'), ...(avecTva ? [somme('tva')] : []), somme('montantTotal'), ''],
  );
  doc.encadre("Simulation donnée à titre indicatif, sans engagement de CECAW FINANCE S.A. Les conditions définitives (taux, frais, TVA, assurance éventuelle, garanties) sont celles du contrat signé après étude et accord du dossier. Les dates d'échéance partent du jour d'édition ; elles seront recalculées à partir de la date de décaissement.");
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined, module: 'credit', action: 'EXPORT_SIMULATION', entiteType: 'produit', entiteId: c.produit_id, description: `Simulation de ${c.montant} sur ${c.duree_mois} mois exportée` });
  return envoyer(res, doc, `simulation-credit-${new Date().toISOString().slice(0, 10)}`);
}));

router.get('/credits/:id/echeancier', can('credit:VIEW'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const d = (await demandeVisible(req.user!, id, { client: true, produit: { select: { nom: true } }, echeances: { orderBy: { numero: 'asc' } } })) as any;
  if (d.echeances.length === 0) throw new ErreurMetier("L'échéancier n'existe qu'après le décaissement.", 409);
  const doc = new DocumentPdf(`Echeancier ${d.reference}`);
  doc.titre(`CECAW FINANCE - Échéancier du crédit ${d.reference}`);
  doc.champ('Emprunteur', `${d.client.prenom ?? ''} ${d.client.nom}`.trim());
  doc.champ('Produit', d.produit.nom);
  doc.champ('Montant', montantPdf(d.montantAccorde ?? d.montantDemande));
  doc.champ('Taux annuel', `${d.tauxApplique ?? '-'} %`);
  doc.sousTitre('Calendrier de remboursement');
  const avecTva = d.echeances.some((e: any) => Number(e.tva) > 0);
  const num = (n: unknown) => montantPdf(n as number).replace(' FCFA', '');
  if (avecTva) doc.ligne('Les échéances comprennent la TVA sur les intérêts (colonne « TVA »).', 9);
  doc.tableau(
    [{ titre: 'N°', largeur: 6 }, { titre: 'Date', largeur: 13 }, { titre: 'Capital', largeur: 16, alignement: 'd' }, { titre: 'Intérêts', largeur: 14, alignement: 'd' },
      ...(avecTva ? [{ titre: 'TVA', largeur: 12, alignement: 'd' as const }] : []),
      { titre: 'Échéance', largeur: 17, alignement: 'd' }, { titre: 'Restant dû', largeur: 18, alignement: 'd' }, { titre: 'Statut', largeur: 13 }],
    d.echeances.map((e: any) => [String(e.numero), datePdf(e.dateEcheance), num(e.capital), num(e.interet), ...(avecTva ? [num(e.tva)] : []), num(e.montantTotal), num(e.capitalRestantDu), e.statut.replace(/_/g, ' ')]),
  );
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined, module: 'credit', action: 'EXPORT_ECHEANCIER', entiteType: 'demande_credit', entiteId: id, description: `Échéancier de ${d.reference}` });
  return envoyer(res, doc, `echeancier-${d.reference}`);
}));

router.get('/credits/:id/contrat', can('credit:VIEW'), wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const d = (await demandeVisible(req.user!, id, { client: true, contrat: true, produit: { select: { nom: true } }, agence: { select: { nom: true } }, garanties: true, garants: true })) as any;
  if (!d.contrat) throw new ErreurMetier("Le contrat n'a pas encore été édité.", 409);
  const c = d.contrat;
  const doc = new DocumentPdf(`Contrat ${c.numero}`);
  doc.titre(`CECAW FINANCE - Contrat de crédit n° ${c.numero}`);
  doc.champ('Dossier', d.reference);
  doc.champ('Agence', d.agence.nom);
  doc.champ('Emprunteur', `${d.client.prenom ?? ''} ${d.client.nom}`.trim());
  doc.champ('Adresse', d.client.adresse ?? '-');
  doc.sousTitre('Conditions du crédit');
  doc.champ('Produit', d.produit.nom);
  doc.champ('Montant accordé', montantPdf(c.montant));
  doc.champ('Durée', `${c.dureeMois} mois`);
  doc.champ('Taux annuel', `${c.taux} %`);
  doc.champ('Frais de dossier', montantPdf(c.fraisDossier));
  if (Number(c.tauxTva) > 0) {
    doc.champ('TVA', `${c.tauxTva} %${c.tvaSurInterets ? ' sur les intérêts' : ''}${Number(c.tvaFraisDossier) > 0 ? ' et sur les frais de dossier' : ''}`);
    if (Number(c.tvaFraisDossier) > 0) doc.champ('TVA sur frais de dossier', montantPdf(c.tvaFraisDossier));
  }
  doc.champ('Objet', d.objet);
  if (d.garanties.length) {
    doc.sousTitre('Garanties');
    d.garanties.forEach((g: any) => doc.ligne(`- ${g.type.replace(/_/g, ' ')} : ${g.description} (valeur retenue ${montantPdf(g.valeurRetenue ?? g.valeurEstimee)})`));
  }
  if (d.garants.length) {
    doc.sousTitre('Garants');
    d.garants.forEach((g: any) => doc.ligne(`- ${g.prenom ?? ''} ${g.nom}, tél. ${g.telephone}`));
  }
  doc.espace(12);
  doc.ligne("L'emprunteur reconnaît avoir pris connaissance des conditions ci-dessus, du calendrier de remboursement annexé et des pénalités applicables en cas de retard.", 9);
  doc.espace(20);
  doc.ligne(c.signeParClient && c.dateSignature ? `Signé par l'emprunteur le ${datePdf(c.dateSignature)}.` : "Signature de l'emprunteur : ______________________        Signature CECAW : ______________________");
  await createLog({ utilisateurId: req.user!.sub, utilisateurLabel: req.user!.email, agenceId: req.user!.agenceId ?? undefined, module: 'credit', action: 'EXPORT_CONTRAT', entiteType: 'demande_credit', entiteId: id, description: `Contrat ${c.numero}` });
  return envoyer(res, doc, `contrat-${c.numero}`);
}));

export default router;
