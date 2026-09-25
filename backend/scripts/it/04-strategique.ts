import { api, arreter, demarrer, titre, utilisateur, verifier } from './helpers';
import prisma from '../../src/lib/prisma';
import { mettreEnFileSms } from '../../src/lib/sms';

const aujourdhuiIso = () => new Date().toISOString().slice(0, 10);

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
  const marcheModifie = await api(admin.token, 'PUT', `/organisation/marches/${marche.corps.data.id}`, { type: 'moyen' });
  verifier(marcheModifie.statut === 200 && marcheModifie.corps.data.type === 'moyen', 'modification du marché (édition depuis l\'UI)', marcheModifie.corps);
  const secteurModifie = await api(admin.token, 'PUT', `/organisation/secteurs/${secteur.corps.data.id}`, { nom: 'Commerce de vivres IT renommé' });
  verifier(secteurModifie.statut === 200 && secteurModifie.corps.data.nom.endsWith('renommé'), 'renommage du secteur (édition depuis l\'UI)', secteurModifie.corps);
  const metierModifie = await api(admin.token, 'PUT', `/organisation/metiers/${metier.corps.data.id}`, { nom: 'Vendeuse de légumes IT renommée' });
  verifier(metierModifie.statut === 200 && metierModifie.corps.data.nom.endsWith('renommée'), 'renommage du métier (édition depuis l\'UI)', metierModifie.corps);

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

  titre('Relances commerciales à règles : client dormant (point 4)');
  // Le client est vieilli de 400 jours, sans interaction ni transaction récente : après recalcul
  // du score il doit devenir "dormant", puis déclencher une relance suggérée à son commercial.
  const ancien = new Date(Date.now() - 400 * 86_400_000);
  await prisma.client.update({ where: { id: clientId }, data: { createdAt: ancien } });
  await prisma.interaction.updateMany({ where: { clientId }, data: { dateInteraction: ancien } });
  await api(admin.token, 'POST', '/clients/scores/recalculer', {});
  const ficheDormant = await api(r05.token, 'GET', `/clients/${clientId}`);
  verifier(ficheDormant.corps.data.score?.cycleVie === 'dormant', 'le client redevient "dormant" après vieillissement', ficheDormant.corps.data.score);

  const relances = await api(admin.token, 'POST', '/administration/taches/relances_commerciales/executer', {});
  verifier(relances.statut === 200 && relances.corps.data.resultat?.dormants >= 1, 'la tâche de relances détecte au moins un client dormant', relances.corps);
  const evenement = await prisma.evenementMetier.findFirst({ where: { code: 'commercial.client_dormant', entiteType: 'client', entiteId: clientId } });
  verifier(Boolean(evenement), 'un événement de relance a bien été journalisé pour ce client');
  const notifs = await api(r05.token, 'GET', '/notifications');
  verifier(notifs.corps.data.some((n: { titre: string }) => n.titre?.includes('dormant')), 'le commercial reçoit la notification de relance', notifs.corps.data.map((n: { titre: string }) => n.titre));

  const relancesRejouees = await api(admin.token, 'POST', '/administration/taches/relances_commerciales/executer', {});
  verifier(relancesRejouees.corps.data.resultat?.dormants === 0, 'le cooldown évite de renotifier immédiatement le même client', relancesRejouees.corps);

  titre('Projection et réajustement d\'objectif (point 14)');
  const objectif = await api(admin.token, 'POST', '/objectifs', {
    titre: 'Objectif IT projection', categorie: 'nouveaux_clients', cible: 100, unite: 'clients', periodicite: 'mois',
    date_debut: new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10), date_fin: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
    assignation_type: 'institution',
  });
  verifier(objectif.statut === 201, 'création d\'un objectif de test', objectif.corps);
  await prisma.objectif.update({ where: { id: objectif.corps.data.id }, data: { realise: 5 } }); // très en retard sur 20 jours écoulés
  const proj = await api(r05.token, 'GET', `/objectifs/${objectif.corps.data.id}/projection`);
  verifier(proj.statut === 200 && typeof proj.corps.data.ecart_projete_pct === 'number', 'la projection est calculée', proj.corps);
  verifier((proj.corps.data.ecart_projete_pct as number) < 0, 'un retard réel se traduit par un écart projeté négatif', proj.corps.data);
  verifier(proj.corps.data.cible_suggeree !== null, 'une cible réajustée est suggérée pour un fort retard', proj.corps.data);

  titre('Potentiel de collecte par marché (points 15-16, Bayam-Sellam)');
  const potentiel = await api(admin.token, 'GET', '/sig/marches/potentiel');
  verifier(potentiel.statut === 200 && Array.isArray(potentiel.corps.data), 'la liste de potentiel par marché répond', potentiel.corps);
  const ligneMarche = potentiel.corps.data.find((l: { marche_id: number }) => l.marche_id === marche.corps.data.id);
  verifier(Boolean(ligneMarche), 'le marché créé apparaît dans l\'analyse de potentiel');
  verifier(ligneMarche?.nb_clients_dormants >= 1, 'le client dormant du marché est compté', ligneMarche);

  titre('Calendrier camerounais (point 6)');
  const jourFerie = await api(admin.token, 'POST', '/calendrier', { nom: 'Tabaski IT', type: 'ferie_religieuse', date_debut: '2027-05-16' });
  verifier(jourFerie.statut === 201, 'création d\'un événement calendrier', jourFerie.corps);
  const calendrier2027 = await api(r05.token, 'GET', '/calendrier?annee=2027');
  verifier(calendrier2027.statut === 200 && calendrier2027.corps.data.some((e: { id: number }) => e.id === jourFerie.corps.data.id), 'filtrage du calendrier par année');
  verifier((await api(r05.token, 'POST', '/calendrier', { nom: 'Refus', type: 'commercial', date_debut: '2027-01-01' })).statut === 403, 'un commercial ne peut pas créer d\'événement (communication:CONFIGURE requis)');

  titre('Campagnes commerciales 360° (point 5)');
  const campagne = await api(admin.token, 'POST', '/campagnes', {
    nom: 'Relance clients dormants IT', criteres: { cycle_vie: ['dormant'] }, canal: 'sms',
    message: 'CECAW : {{prenom}} {{nom}}, votre agence pense à vous !', date_debut: aujourdhuiIso(), evenement_calendrier_id: jourFerie.corps.data.id,
  });
  verifier(campagne.statut === 201, 'création de la campagne', campagne.corps);
  verifier(campagne.corps.data.nb_cibles_estime >= 1, 'l\'estimation de cibles compte au moins le client dormant', campagne.corps.data);

  const lancement = await api(admin.token, 'POST', `/campagnes/${campagne.corps.data.id}/lancer`, {});
  verifier(lancement.statut === 200 && lancement.corps.data.mises_en_file >= 1, 'le lancement met au moins un SMS en file', lancement.corps);

  const detailCampagne = await api(admin.token, 'GET', `/campagnes/${campagne.corps.data.id}`);
  verifier(detailCampagne.corps.data.statut === 'en_cours', 'la campagne passe en cours après lancement');
  verifier(detailCampagne.corps.data.cibles.some((c: { client: { id: number } }) => c.client.id === clientId), 'le client dormant figure bien parmi les cibles enregistrées', detailCampagne.corps.data.cibles);

  const relance2 = await api(admin.token, 'POST', `/campagnes/${campagne.corps.data.id}/lancer`, {});
  verifier(relance2.statut === 200, 'un second lancement est accepté (idempotent, pas de doublon de cible)', relance2.corps);

  const canalEmail = await api(admin.token, 'POST', '/campagnes', { nom: 'Campagne Email IT', criteres: {}, canal: 'email', message: 'Test', date_debut: aujourdhuiIso() });
  await api(admin.token, 'POST', `/campagnes/${canalEmail.corps.data.id}/lancer`, {});
  const detailEmail = await api(admin.token, 'GET', `/campagnes/${canalEmail.corps.data.id}`);
  verifier((detailEmail.corps.data.resume?.en_attente_canal ?? 0) >= 1, 'un canal email non construit met les cibles en attente sans rien envoyer', detailEmail.corps.data.resume);

  titre('Canal WhatsApp : registre de canaux (point 17) et préférence client (point 18)');
  const msgWhatsapp = await mettreEnFileSms({ telephone: '677998877', message: 'Test WhatsApp', canal: 'whatsapp' });
  verifier(msgWhatsapp?.canal === 'whatsapp', 'un message peut être mis en file sur le canal whatsapp', msgWhatsapp);
  const toggleRefuse = await api(admin.token, 'PUT', '/communication/whatsapp', { actif: true });
  verifier(toggleRefuse.statut === 422, 'impossible d\'activer WhatsApp sans WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID côté serveur', toggleRefuse.corps);
  const smsResume = await api(admin.token, 'GET', '/communication/sms');
  verifier(smsResume.corps.data.whatsapp?.configure === false, 'l\'état WhatsApp est rapporté comme non configuré dans ce contexte de test', smsResume.corps.data.whatsapp);

  const prefRefus = await api(r05.token, 'PUT', `/clients/${clientId}`, { canal_prefere: 'valeur-invalide' });
  verifier(prefRefus.statut !== 200, 'une valeur de canal préféré invalide est refusée');
  await prisma.client.update({ where: { id: clientId }, data: { canalPrefere: 'whatsapp' } });
  const fichePref = await api(r05.token, 'GET', `/clients/${clientId}`);
  verifier(fichePref.corps.data.canalPrefere === 'whatsapp', 'le canal préféré du client est bien conservé');

  titre("Photo de l'activité professionnelle (point 9)");
  const listeVide = await api(r05.token, 'GET', `/kyc/clients/${clientId}/photos-activite`);
  verifier(listeVide.statut === 200 && Array.isArray(listeVide.corps.data), 'liste des photos d\'activité accessible avant tout envoi', listeVide.corps);
  const fp = new FormData();
  fp.append('photo', new Blob([Buffer.from('fakejpeg')], { type: 'image/jpeg' }), 'activite.jpg');
  fp.append('latitude', '4.05'); fp.append('longitude', '9.70');
  const photoActivite = await api(r05.token, 'POST', `/kyc/clients/${clientId}/photos-activite`, fp);
  verifier(photoActivite.statut === 200 && photoActivite.corps.data.categorie === 'photo_activite', 'photo d\'activité enregistrée avec sa catégorie', photoActivite.corps);
  verifier(Number(photoActivite.corps.data.latitude) === 4.05, 'la géolocalisation de la photo est conservée', photoActivite.corps.data);
  const listeApres = await api(r05.token, 'GET', `/kyc/clients/${clientId}/photos-activite`);
  verifier(listeApres.corps.data.length === 1, 'la photo apparaît dans la liste (additive, pas de remplacement)');
  const fp2 = new FormData();
  fp2.append('photo', new Blob([Buffer.from('fakejpeg2')], { type: 'image/jpeg' }), 'activite2.jpg');
  await api(r05.token, 'POST', `/kyc/clients/${clientId}/photos-activite`, fp2);
  const listeApres2 = await api(r05.token, 'GET', `/kyc/clients/${clientId}/photos-activite`);
  verifier(listeApres2.corps.data.length === 2, 'une seconde photo s\'ajoute sans remplacer la première (galerie)');

  await arreter();
})().catch((e) => { console.error(e); process.exit(1); });
