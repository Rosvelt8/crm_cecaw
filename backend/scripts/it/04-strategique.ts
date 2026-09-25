import { api, arreter, demarrer, titre, utilisateur, verifier } from './helpers';

(async () => {
  await demarrer();

  const admin = await utilisateur('it.admin.strat@cecaw.cm', 'admin', []);
  const r05 = await utilisateur('it.commercial.strat@cecaw.cm', 'agent', ['R05']);
  const r02 = await utilisateur('it.fonctionnel.strat@cecaw.cm', 'manager', ['R02']);

  titre('Référentiel secteur / métier (point 8)');
  const secteur = await api(admin.token, 'POST', '/organisation/secteurs', { nom: 'Commerce de vivres IT' });
  verifier(secteur.statut === 201, 'création du secteur', secteur.corps);
  const metier = await api(admin.token, 'POST', '/organisation/metiers', { nom: 'Vendeuse de légumes IT', secteurId: secteur.corps.data.id });
  verifier(metier.statut === 201, 'création du métier rattaché au secteur', metier.corps);

  titre('Marchés et Bayam-Sellam (points 15-16)');
  const marche = await api(admin.token, 'POST', '/organisation/marches', { nom: 'Marché Congo IT', type: 'grand', agenceId: 1, latitude: 4.05, longitude: 9.7 });
  verifier(marche.statut === 201, 'création du marché', marche.corps);
  verifier(marche.corps.data.type === 'grand', 'type de marché conservé');

  titre('Client rattaché au marché et au référentiel secteur/métier');
  const cl = await api(r05.token, 'POST', '/clients', {
    type_personne: 'physique', nom: 'Ngo', prenom: 'Sandrine', telephone: '677998877', email: 'sandrine.it@test.cm',
    adresse: 'Marché Congo', agence_id: 1, revenu_mensuel: '150 000 FCFA', latitude: 4.05, longitude: 9.7,
    marche_id: marche.corps.data.id, secteur_id: secteur.corps.data.id, metier_id: metier.corps.data.id,
  });
  verifier(cl.statut === 201, 'création du client', cl.corps);
  const clientId = cl.corps.data.id;
  const fiche = await api(r05.token, 'GET', `/clients/${clientId}`);
  verifier(fiche.corps.data.marche?.id === marche.corps.data.id, 'la fiche client porte le marché');
  verifier(fiche.corps.data.secteur?.id === secteur.corps.data.id, 'la fiche client porte le secteur');
  verifier(fiche.corps.data.metier?.id === metier.corps.data.id, 'la fiche client porte le métier');

  titre('Historique des interactions (points 2-3)');
  const refus = await api(r05.token, 'POST', '/interactions', { type: 'appel', resume: 'Sans client ni prospect' });
  verifier(refus.statut === 422, 'refuse une interaction sans client_id ni prospect_id', refus.corps);
  const inter = await api(r05.token, 'POST', '/interactions', {
    type: 'appel', canal: 'telephone', client_id: clientId, resume: 'Appel de courtoisie', engagement: 'Rappeler jeudi', prochaine_action_at: '2026-12-01',
  });
  verifier(inter.statut === 201, 'création d\'une interaction', inter.corps);
  const liste = await api(r05.token, 'GET', `/interactions?client_id=${clientId}`);
  verifier(liste.corps.data.length === 1 && liste.corps.data[0].resume === 'Appel de courtoisie', 'liste des interactions du client');
  const actions = await api(r05.token, 'GET', '/interactions/mes-actions');
  verifier(actions.statut === 200 && actions.corps.data.some((a: { id: number }) => a.id === inter.corps.data.id), 'apparaît dans mes actions à suivre');

  titre('Objectifs personnels du client (point 13)');
  // Ouverture de compte hors périmètre de R05 (comptes:CREATE/collecte:CREATE requis) : admin ici.
  const compte = await api(admin.token, 'POST', `/clients/${clientId}/comptes`, { produit_id: 7 }); // 7 = Compte Épargne dans le seed
  const compteId: number | undefined = compte.statut === 201 ? compte.corps.data.id : undefined;
  if (!compteId) console.log('  (ouverture de compte échouée :', JSON.stringify(compte.corps), ')');
  const objCl = await api(r05.token, 'POST', `/clients/${clientId}/objectifs-personnels`, { type: 'personnel', titre: 'Acheter un frigo', montant_cible: 200000, date_cible: '2026-12-31', compte_id: compteId });
  verifier(objCl.statut === 201, 'création d\'un objectif personnel', objCl.corps);
  const listeObj = await api(r05.token, 'GET', `/clients/${clientId}/objectifs-personnels`);
  verifier(listeObj.corps.data.length === 1, 'liste des objectifs personnels');
  const majObj = await api(r05.token, 'PUT', `/clients/${clientId}/objectifs-personnels/${objCl.corps.data.id}`, { statut: 'atteint' });
  verifier(majObj.corps.data.statut === 'atteint', 'mise à jour du statut de l\'objectif');

  titre('Objectif d\'épargne sur un compte (point 10)');
  if (compteId) {
    const setObj = await api(r05.token, 'PATCH', `/comptes/${compteId}/objectif-epargne`, { montant: 500000, date: '2027-06-30' });
    verifier(setObj.statut === 200 && Number(setObj.corps.data.objectifEpargneMontant) === 500000, 'objectif d\'épargne enregistré', setObj.corps);
    const analyse = await api(r05.token, 'GET', `/comptes/${compteId}/analyse-epargne`);
    verifier(analyse.statut === 200 && analyse.corps.data.objectif_montant === 500000, 'analyse épargne renvoie l\'objectif', analyse.corps);
  } else {
    console.log('  (compte non créé : bloc épargne ignoré)');
  }

  titre('Synthèse crédit et recouvrement sur la fiche client (points 11-12)');
  const synth = await api(r05.token, 'GET', `/clients/${clientId}/synthese`);
  verifier(synth.statut === 200 && Array.isArray(synth.corps.data.credits) && Array.isArray(synth.corps.data.recouvrement), 'la synthèse renvoie les deux blocs', synth.corps);

  titre('Score client (point 1)');
  const recalcul = await api(admin.token, 'POST', '/clients/scores/recalculer', {});
  verifier(recalcul.statut === 200 && typeof recalcul.corps.data.traites === 'number', 'recalcul global des scores', recalcul.corps);
  const scoreFiche = await api(r05.token, 'GET', `/clients/${clientId}`);
  verifier(scoreFiche.corps.data.score !== null && typeof scoreFiche.corps.data.score?.score === 'number', 'le score apparaît sur la fiche après recalcul', scoreFiche.corps.data.score);
  verifier(scoreFiche.corps.data.score?.cycleVie === 'nouveau', 'un client tout juste créé est classé "nouveau"', scoreFiche.corps.data.score);
  const scores = await api(admin.token, 'GET', '/clients/scores?cycle_vie=nouveau');
  verifier(scores.statut === 200 && scores.corps.data.some((s: { clientId: number }) => s.clientId === clientId), 'la vue de segmentation retrouve le client', scores.corps);

  titre('Droits : R02 ne gère pas le CRM, mais gère bien l\'organisation (marchés/secteurs)');
  verifier((await api(r02.token, 'GET', '/clients')).statut === 403, 'R02 refusé sur les clients');
  verifier((await api(r02.token, 'POST', '/organisation/marches', { nom: 'Marché R02 IT' })).statut === 201, 'R02 peut créer un marché');

  await arreter();
})().catch((e) => { console.error(e); process.exit(1); });
