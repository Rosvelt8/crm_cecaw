import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { requirePermission as can } from '../../middleware/permissions';
import { ErreurMetier, rolesEffectifs } from '../../lib/rbac';
import { DocumentPdf, montantPdf, datePdf } from '../../lib/pdf';
import { createLog } from '../../lib/logger';
import { demandeVisible } from '../credit/credit.service';

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
  doc.tableau(
    [{ titre: 'N°', largeur: 6 }, { titre: 'Date', largeur: 14 }, { titre: 'Capital', largeur: 18, alignement: 'd' }, { titre: 'Intérêts', largeur: 16, alignement: 'd' }, { titre: 'Échéance', largeur: 18, alignement: 'd' }, { titre: 'Restant dû', largeur: 20, alignement: 'd' }, { titre: 'Statut', largeur: 14 }],
    d.echeances.map((e: any) => [String(e.numero), datePdf(e.dateEcheance), montantPdf(e.capital).replace(' FCFA', ''), montantPdf(e.interet).replace(' FCFA', ''), montantPdf(e.montantTotal).replace(' FCFA', ''), montantPdf(e.capitalRestantDu).replace(' FCFA', ''), e.statut.replace(/_/g, ' ')]),
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
