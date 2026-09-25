import prisma from '../../src/lib/prisma';
import { api, arreter, attendre, demarrer, titre, utilisateur, verifier } from './helpers';
import { detecterImpayes } from '../../src/modules/recouvrement/recouvrement.service';
import { verifierEquilibre } from '../../src/lib/compta';

(async () => {
  await demarrer();
  await prisma.agence.update({ where: { id: 1 }, data: { latitude: 4.05, longitude: 9.7 } });

  titre('Acteurs et rôles');
  const admin = await utilisateur('it.admin@cecaw.cm', 'admin', []);
  const r05 = await utilisateur('it.commercial@cecaw.cm', 'agent', ['R05']);
  const r06 = await utilisateur('it.kyc@cecaw.cm', 'backoffice', ['R06']);
  const r07 = await utilisateur('it.analyste@cecaw.cm', 'backoffice', ['R07']);
  const r08 = await utilisateur('it.comite@cecaw.cm', 'manager', ['R08']);
  const r09 = await utilisateur('it.caisse@cecaw.cm', 'backoffice', ['R09']);
  const r11 = await utilisateur('it.recouvrement@cecaw.cm', 'agent', ['R11']);
  const r04 = await utilisateur('it.resp@cecaw.cm', 'manager', ['R04']);
  const r15 = await utilisateur('it.audit@cecaw.cm', 'backoffice', ['R15']);

  const me = await api(r05.token, 'GET', '/rbac/me');
  verifier(me.corps.data.droits.includes('credit:CREATE') && !me.corps.data.droits.includes('credit:APPROVE'), 'R05 : monte un crédit mais ne l\'approuve pas');
  verifier((await api(r05.token, 'GET', '/rbac/roles')).statut === 403, 'R05 ne lit pas les rôles (403)');
  verifier((await api(r15.token, 'PUT', '/parametrages/produits/13/type', { type: 'credit' })).statut === 403, "R15 (auditeur) ne modifie rien (403)");

  titre('Client, KYC et validation par un acteur distinct');
  const cl = await api(r05.token, 'POST', '/clients', { type_personne: 'physique', nom: 'Tchoua', prenom: 'Marie', telephone: '677123456', email: 'marie@test.cm', adresse: 'Akwa', agence_id: 1, revenu_mensuel: '250 000 FCFA', latitude: 4.051, longitude: 9.701, date_naissance: '1985-04-12', nationalite: 'Camerounaise' });
  verifier(cl.statut === 201, 'client créé', cl.corps);
  const clientId = cl.corps.data.id;
  const revenus = await prisma.client.findUnique({ where: { id: clientId }, select: { revenusMensuels: true } });
  verifier(Number(revenus?.revenusMensuels) === 250000, 'revenu texte converti en nombre (250 000)', revenus);

  const fin = await api(r05.token, 'PUT', `/kyc/clients/${clientId}/finances`, { anciennete_activite_mois: 48, latitude_activite: 4.052, longitude_activite: 9.702, sources: [{ libelle: 'Boutique', montant_mensuel: 300000, justifie: true }], charges: [{ libelle: 'Loyer', montant_mensuel: 40000 }] });
  verifier(fin.statut === 200 && fin.corps.data.total_sources === 300000, 'sources de revenus et charges enregistrées', fin.corps);

  const kyc = await api(r05.token, 'POST', '/kyc/dossiers', { client_id: clientId });
  verifier(kyc.statut === 201, 'dossier KYC ouvert');
  const kycId = kyc.corps.data.id;
  const fd = new FormData(); fd.append('type', 'cni'); fd.append('numero', 'CNI-778899'); fd.append('date_expiration', '2032-01-01');
  verifier((await api(r05.token, 'POST', `/kyc/dossiers/${kycId}/pieces-identite`, fd)).statut === 201, "pièce d'identité ajoutée");
  await prisma.entreeSurveillance.create({ data: { nom: 'Dupont', prenom: 'Jean', categorie: 'sanction', source: 'test' } });
  const soum = await api(r05.token, 'POST', `/kyc/dossiers/${kycId}/soumettre`);
  verifier(soum.statut === 200 && soum.corps.data.correspondances_surveillance === 0, 'KYC soumis, aucune correspondance de surveillance', soum.corps);

  verifier((await api(r05.token, 'POST', `/kyc/dossiers/${kycId}/valider`)).statut === 403, 'le créateur ne valide pas son KYC (403)');
  const det = await api(r06.token, 'GET', `/kyc/dossiers/${kycId}`);
  verifier((await api(r06.token, 'POST', `/kyc/dossiers/${kycId}/valider`)).statut === 422, 'validation refusée tant que des contrôles restent à évaluer');
  for (const c of det.corps.data.controles.filter((x: any) => x.resultat === null)) await api(r06.token, 'PUT', `/kyc/dossiers/${kycId}/controles/${c.id}`, { resultat: 'conforme' });
  const val = await api(r06.token, 'POST', `/kyc/dossiers/${kycId}/valider`);
  verifier(val.statut === 200 && val.corps.data.niveau_risque, 'KYC validé par R06 avec niveau de risque', val.corps);

  titre('Demande de crédit');
  const sim = await api(r05.token, 'POST', '/credits/simulation', { produit_id: 13, montant: 1000000, duree_mois: 12, periodicite: 'mensuel', client_id: clientId });
  verifier(sim.statut === 200 && sim.corps.data.lignes.length === 12 && sim.corps.data.eligible, 'simulation : 12 échéances, éligible', sim.corps);
  verifier(Math.abs(sim.corps.data.lignes[0].montantTotal - 91679.98) < 1, `mensualité 12 mois à 18 % ≈ 91 680 (${sim.corps.data.lignes[0].montantTotal})`);
  const dem = await api(r05.token, 'POST', '/credits', { client_id: clientId, produit_id: 13, type_credit: 'individuel', montant_demande: 1000000, duree_mois: 12, periodicite: 'mensuel', objet: 'Achat de stock' });
  verifier(dem.statut === 201, 'demande créée', dem.corps);
  const did = dem.corps.data.id;
  verifier((await api(r05.token, 'POST', `/credits/${did}/garanties`, { type: 'immobilier', description: 'Terrain Akwa', valeur_estimee: 2000000 })).statut === 201, 'garantie ajoutée');
  const sub = await api(r05.token, 'POST', `/credits/${did}/soumettre`);
  verifier(sub.statut === 200 && sub.corps.data.statut === 'kyc_valide', 'soumission : KYC déjà validé donc dossier prêt pour analyse', sub.corps);

  titre('Grille d\'analyse (canevas)');
  const grille = {
    moisAnnee: '2026-09', caHypotheseHaute: 1000000, caHypotheseBasse: 800000, hypotheseRetenue: 'basse',
    achatsMarchandises: 480000, transportApprovisionnement: 20000, loyerLocal: 30000, impotsTaxes: 10000, salaires: 50000, eauElectricite: 15000, reparationsMaintenance: 5000, autresDepensesActivite: 10000,
    loyerDomicile: 40000, autresDepensesFamiliales: 60000, echeancesCecaw: 15000, echeancesAutresEmf: 5000, detteAutresEmf: 0, autresRevenusNets: 10000,
    bilan: { localTerrain: 5000000, equipement: 1500000, stockMarchandises: 800000, creancesClients: 200000, liquidites: 100000, autresActifs: 0, dettes: 2000000 },
  };
  verifier((await api(r05.token, 'PUT', `/credits/${did}/grille`, grille)).statut === 403, 'le monteur ne remplit pas la grille (droit absent, 403)');
  const g = await api(r07.token, 'PUT', `/credits/${did}/grille`, grille);
  verifier(g.statut === 200, 'grille enregistrée par R07', g.corps);
  const gs = await api(r07.token, 'GET', `/credits/${did}/grille`);
  const gr = gs.corps.data.grille;
  verifier(Number(gr.caRetenu) === 800000 && Number(gr.margeBrute) === 300000 && Number(gr.totalDepenses) === 620000 && Number(gr.cashFlow) === 180000 && Number(gr.capaciteRemboursement) === 70000, 'totaux (A)(B)(C) et capacité = 800 000 / 620 000 / 180 000 / 70 000', gr);
  verifier(Number(gr.bilan.fondsPropres) === 5600000 && Number(gr.bilan.totalPassif) === Number(gr.bilan.totalFondsCommerce), 'bilan : fonds propres 5 600 000 et passif = actif');
  const ap = await api(r07.token, 'POST', '/credits/grille/apercu', { ...grille, demande_id: did });
  verifier(ap.statut === 200 && ap.corps.data.grille.capaciteRemboursement === 70000, 'aperçu en direct identique à l\'enregistrement');
  const term = await api(r07.token, 'POST', `/credits/${did}/analyse/terminer`);
  verifier(term.statut === 200 && term.corps.data.score.valeur > 0, `analyse transmise au comité, score ${term.corps.data.score?.valeur}`, term.corps);

  titre('Décision, contrat, décaissement');
  verifier((await api(r05.token, 'POST', `/credits/${did}/decision`, { sens: 'favorable' })).statut === 403, 'le monteur ne décide pas (403)');
  verifier((await api(r07.token, 'POST', `/credits/${did}/decision`, { sens: 'favorable' })).statut === 403, "l'analyste ne décide pas (403)");
  const dec = await api(r08.token, 'POST', `/credits/${did}/decision`, { sens: 'favorable', montant_accorde: 1000000 });
  verifier(dec.statut === 200 && dec.corps.data.statut === 'approuvee', 'comité R08 approuve (instance agence)', dec.corps);
  await attendre(500); // les notifications sont émises en arrière-plan
  const notifs = await api(r05.token, 'GET', '/notifications');
  verifier(notifs.corps.data.some((n: any) => n.code === 'credit.decide'), 'le monteur est notifié de la décision');
  verifier((await api(r08.token, 'POST', `/credits/${did}/contrat`)).statut === 403, 'le décideur ne peut pas éditer le contrat (droit EXECUTE absent)');
  verifier((await api(r09.token, 'POST', `/credits/${did}/contrat`)).statut === 201, 'contrat édité par la caisse');
  verifier((await api(r09.token, 'POST', `/credits/${did}/decaissement`, { mode: 'especes' })).statut === 422, 'décaissement refusé avant signature du contrat');
  verifier((await api(r09.token, 'POST', `/credits/${did}/contrat/signer`)).statut === 200, 'contrat signé');
  const dcs = await api(r09.token, 'POST', `/credits/${did}/decaissement`, { mode: 'especes' });
  verifier(dcs.statut === 200 && dcs.corps.data.nb_echeances === 12, 'décaissement : 12 échéances générées', dcs.corps);
  verifier(Math.abs(dcs.corps.data.montant_net - 990000) < 0.01, 'frais de dossier 1 % déduits (net 990 000)', dcs.corps.data);

  titre('Comptabilité du décaissement');
  const ecr = await prisma.ecritureComptable.findUnique({ where: { cle: `dec:${did}` }, include: { lignes: { include: { compte: true } } } });
  verifier(!!ecr, 'écriture de décaissement générée');
  const eq = verifierEquilibre((ecr?.lignes ?? []).map((l) => ({ compte: l.compte.numero, sens: l.sens, montant: Number(l.montant) })));
  verifier(eq.equilibre && eq.debit === 1000000, 'écriture équilibrée (débit 3111 = 1 000 000 = caisse 990 000 + frais 10 000)', eq);

  titre('Archives scellées');
  const arch = await api(r08.token, 'GET', `/archives?entite_type=demande_credit&entite_id=${did}`);
  verifier(arch.statut === 200, 'R08 (documentaire:VIEW) peut lire les archives du dossier qu on lui soumet', arch.statut);
  verifier((await api(r08.token, 'POST', '/archives', { entite_type: 'demande_credit', entite_id: did })).statut === 403, "mais ne peut pas en créer (documentaire:CREATE absent)");
  const archAdmin = await api(admin.token, 'GET', `/archives?entite_type=demande_credit&entite_id=${did}`);
  verifier(archAdmin.corps.data.length >= 2, `archives automatiques (décision, décaissement) : ${archAdmin.corps.data.length}`);
  const v1 = await api(admin.token, 'GET', `/archives/${archAdmin.corps.data[0].id}/verifier`);
  verifier(v1.corps.data.integre === true, 'archive intègre (empreinte recalculée identique)');
  await prisma.$executeRawUnsafe(`UPDATE archives SET contenu = jsonb_set(contenu, '{demande,objet}', '"FALSIFIE"') WHERE id = ${archAdmin.corps.data[0].id}`);
  const v2 = await api(admin.token, 'GET', `/archives/${archAdmin.corps.data[0].id}/verifier`);
  verifier(v2.corps.data.integre === false, 'archive falsifiée détectée (intégrité rompue)');

  titre('Documents PDF');
  for (const [nom, chemin] of [['contrat', `/documents/credits/${did}/contrat`], ['échéancier', `/documents/credits/${did}/echeancier`]] as const) {
    const p = await api(r09.token, 'GET', chemin);
    verifier(p.statut === 200 && p.type === 'application/pdf' && Buffer.from(p.brut!).subarray(0, 5).toString() === '%PDF-', `PDF ${nom} valide`, p.statut);
  }

  titre('Recouvrement');
  await prisma.utilisateurRole.upsert({ where: { utilisateurId_roleId: { utilisateurId: r11.id, roleId: (await prisma.role.findUniqueOrThrow({ where: { code: 'R11' } })).id } }, create: { utilisateurId: r11.id, roleId: (await prisma.role.findUniqueOrThrow({ where: { code: 'R11' } })).id }, update: {} });
  // Recule le calendrier : les 3 premières échéances deviennent échues (75, 45 et 15 jours).
  const jours = [75, 45, 15];
  const echs = await prisma.echeance.findMany({ where: { demandeId: did }, orderBy: { numero: 'asc' }, take: 3 });
  for (let i = 0; i < 3; i++) await prisma.echeance.update({ where: { id: echs[i].id }, data: { dateEcheance: new Date(Date.now() - jours[i] * 86400000) } });
  const det1 = await detecterImpayes();
  verifier(det1.ouverts === 1, 'détection : 1 dossier de recouvrement ouvert', det1);
  const dos = await prisma.dossierRecouvrement.findFirstOrThrow({ where: { demandeId: did } });
  verifier(dos.joursRetard >= 74 && dos.classe === 'r61_90' && dos.nbEcheancesImpayees === 3, `classification ${dos.classe}, ${dos.joursRetard} j, ${dos.nbEcheancesImpayees} échéances`, dos);
  verifier(dos.niveauRequis === 4 && dos.niveauAtteint === 4, 'niveau de relance 4 requis et avis automatique envoyé', dos);
  verifier(dos.agentId === r11.id, 'dossier affecté automatiquement à l\'agent R11 de l\'agence', dos.agentId);
  verifier(Number(dos.penalites) > 0, `pénalités calculées (${dos.penalites})`);
  const sms = await prisma.messageSms.findMany({ where: { entiteId: dos.id } });
  verifier(sms.length >= 1 && sms[0].telephone === '+237677123456', 'SMS de relance mis en file avec numéro normalisé +237', sms.map((s) => s.telephone));
  const nR = await api(r11.token, 'GET', '/notifications');
  verifier(nR.corps.data.some((n: any) => n.code === 'recouvrement.nouveau_dossier'), "l'agent est notifié du dossier assigné");

  const vis = await api(r11.token, 'POST', `/recouvrement/${dos.id}/relances`, { canal: 'visite' });
  verifier(vis.statut === 422, 'visite sans position refusée (géolocalisation obligatoire)');
  verifier((await api(r11.token, 'POST', `/recouvrement/${dos.id}/relances`, { canal: 'visite', latitude: 4.0511, longitude: 9.7011, resultat: 'Débiteur absent' })).statut === 201, 'visite géolocalisée enregistrée');
  const prom = await api(r11.token, 'POST', `/recouvrement/${dos.id}/promesses`, { montant: 100000, date_promise: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) });
  verifier(prom.statut === 201, 'promesse de paiement enregistrée', prom.corps);
  const plan = await api(r11.token, 'POST', `/recouvrement/${dos.id}/plans`, { nb_echeances: 3, premiere_date: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10) });
  verifier(plan.statut === 201, 'plan de régularisation proposé', plan.corps);
  verifier((await api(r11.token, 'POST', `/recouvrement/${dos.id}/plans/${plan.corps.data.id}/valider`)).statut === 403, "l'agent ne valide pas son propre plan (droit APPROVE absent)");
  verifier((await api(r04.token, 'POST', `/recouvrement/${dos.id}/plans/${plan.corps.data.id}/valider`)).statut === 200, 'plan validé par le responsable d\'agence');
  verifier((await api(r04.token, 'POST', `/recouvrement/${dos.id}/escalade`, { vers: 'contentieux', motif: 'Refus de payer manifeste' })).statut === 422, 'contentieux impossible sans phase précontentieuse');
  const pre = await api(r04.token, 'POST', `/recouvrement/${dos.id}/escalade`, { vers: 'precontentieux', motif: 'Relances 1 à 4 sans effet' });
  verifier(pre.statut === 200 && pre.corps.data.statut === 'precontentieux', 'escalade précontentieuse (retard > 90 j ou niveau 4)', pre.corps);
  const tb = await api(r04.token, 'GET', '/recouvrement/tableau-de-bord');
  verifier(tb.statut === 200 && tb.corps.data.dossiers_actifs === 1 && tb.corps.data.par1 > 0, `tableau de bord : PAR1 ${tb.corps.data.par1} %, taux de retard ${tb.corps.data.taux_retard} %`, tb.corps);

  titre('Remboursement et régularisation');
  const totalDu = Number(dos.montantImpaye) + Number(dos.penalites);
  const rb = await api(r09.token, 'POST', `/credits/${did}/remboursements`, { montant: Math.ceil(totalDu), mode: 'especes' });
  verifier(rb.statut === 201, 'remboursement de tous les impayés enregistré', rb.corps);
  const dosApres = await prisma.dossierRecouvrement.findUniqueOrThrow({ where: { id: dos.id } });
  verifier(dosApres.statut === 'regularise', 'dossier de recouvrement clos automatiquement (régularisé)', dosApres.statut);
  const ecrR = await prisma.ecritureComptable.findFirstOrThrow({ where: { evenement: 'credit.remboursement', entiteId: rb.corps.data.remboursement_id }, include: { lignes: { include: { compte: true } } } });
  const parCompte = Object.fromEntries(ecrR.lignes.map((l) => [l.compte.numero, Number(l.montant)]));
  verifier(verifierEquilibre(ecrR.lignes.map((l) => ({ compte: l.compte.numero, sens: l.sens, montant: Number(l.montant) }))).equilibre && parCompte['3111'] > 0 && parCompte['7111'] > 0, 'écriture de remboursement ventilée capital / intérêts / pénalités', parCompte);

  titre('Contrôle de périmètre');
  const autre = await utilisateur('it.autre.agence@cecaw.cm', 'manager', ['R04'], { agenceId: 2 });
  verifier((await api(autre.token, 'GET', `/credits/${did}`)).statut === 404, "un responsable d'une autre agence ne voit pas le dossier (404)");
  verifier((await api(autre.token, 'GET', `/recouvrement/${dos.id}`)).statut === 404, 'ni le dossier de recouvrement (404)');
  verifier((await api(null, 'GET', '/credits')).statut === 401, 'sans jeton : 401');

  await arreter();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
