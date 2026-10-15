import http from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import { api, arreter, attendre, demarrer, titre, utilisateur, verifier } from './helpers';
import prisma from '../../src/lib/prisma';
import { depisterPortefeuille } from '../../src/modules/screening/ofacScreening.service';
import { synchroSanctionsPlanifiee } from '../../src/modules/screening/sanctionsTaches';

/**
 * Contrôle de sanctions OFAC : synchronisation (sur un serveur de fichiers local, jamais le vrai site),
 * contrôles, droits, revue humaine, mémoire des faux positifs, surveillance continue, robustesse.
 */

const FIX = join(__dirname, 'fixtures', 'ofac');
const fichier = (nom: string) => readFileSync(join(FIX, nom), 'utf-8');

// ── Faux site de l'OFAC ────────────────────────────────────────────────────────────
const serveur = { version: 1, mode: 'normal' as 'normal' | 'tronque' | 'html' | 'erreur' };
const KAMGA = `99001,"KAMGA, Paul Marie","individual","SDGT",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"DOB 12 May 1980; nationality Cameroon; Gender Male."\n`;
function contenu(nom: string): string {
  let t = fichier(nom);
  if (nom === 'SDN.CSV') {
    if (serveur.mode === 'tronque') return t.split('\n')[0] + '\n';
    if (serveur.version === 2) {
      t = t.split('\n').filter((l) => !l.startsWith('537,')).join('\n').replace("a.k.a. 'BNC'.", "a.k.a. 'BNCUBA'.") + KAMGA;
    }
  }
  return t;
}
const faux = http.createServer((req, res) => {
  const nom = (req.url ?? '').split('/').pop() ?? '';
  if (serveur.mode === 'erreur') { res.writeHead(500).end('boom'); return; }
  if (serveur.mode === 'html') { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>maintenance</html>'); return; }
  try { res.writeHead(200, { 'Content-Type': 'text/csv' }).end(contenu(nom)); } catch { res.writeHead(404).end(); }
});

const attendreCondition = async <T>(fn: () => Promise<T | null | undefined | false>, ms = 8000): Promise<T | null> => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { const v = await fn(); if (v) return v as T; await attendre(150); }
  return null;
};
const jour = (n: number) => new Date(Date.now() - n * 86_400_000);
const aujourdhui = () => new Date().toISOString().slice(0, 10);

(async () => {
  await new Promise<void>((r) => faux.listen(0, '127.0.0.1', () => r()));
  process.env.OFAC_BASE_URL = `http://127.0.0.1:${(faux.address() as { port: number }).port}`;
  process.env.OFAC_MINIMUM_ENTREES = '1';
  await demarrer();

  const admin = await utilisateur('it.admin.ofac@cecaw.cm', 'admin', []);
  const r05 = await utilisateur('it.commercial.ofac@cecaw.cm', 'agent', ['R05']);
  const r05b = await utilisateur('it.commercial2.ofac@cecaw.cm', 'agent', ['R05']);
  const r06 = await utilisateur('it.conformite.ofac@cecaw.cm', 'manager', ['R06']);

  // Ce test porte sur l'OFAC : les autres sources ont leur propre test (06-sources-sanctions).
  await api(admin.token, 'PUT', '/administration/parametres/conformite.ofac_listes', { valeur: ['sdn', 'non_sdn'] });

  const creerClient = async (corps: Record<string, unknown>) => {
    const r = await api(r05.token, 'POST', '/clients', { telephone: '677000000', adresse: 'Douala', agence_id: 1, email: '', ...corps });
    if (r.statut !== 201) throw new Error(`Création client impossible : ${JSON.stringify(r.corps)}`);
    return r.corps.data.id as number;
  };
  const historique = async (token: string, clientId: number) => (await api(token, 'GET', `/conformite/clients/${clientId}/historique`)).corps?.data as any[] | undefined;
  const attendreHistorique = (clientId: number, n = 1) => attendreCondition(async () => { const h = await historique(r06.token, clientId); return h && h.length >= n ? h : null; });
  const controle = (token: string, corps: Record<string, unknown>) => api(token, 'POST', '/conformite/screenings', corps);

  titre('Sans liste chargée : jamais « aucune correspondance » par défaut');
  const sansListe = await controle(r05.token, { nom: 'Personne Quelconque' });
  verifier(sansListe.statut === 201 && sansListe.corps.data.statut === 'erreur_technique', "sans liste chargée, le contrôle est une erreur technique", sansListe.corps);
  verifier(!('erreur' in sansListe.corps.data) && !('correspondances' in sansListe.corps.data), 'un commercial ne voit ni le détail technique ni de rapprochement');
  verifier((await prisma.screeningVerification.count({ where: { statut: 'aucune_correspondance' } })) === 0, "aucun « sans correspondance » n'a été enregistré à tort");

  titre('Synchronisation des listes');
  verifier((await api(r05.token, 'POST', '/conformite/ofac/synchroniser', {})).statut === 403, 'un commercial ne peut pas synchroniser');
  verifier((await api(r06.token, 'POST', '/conformite/ofac/synchroniser', {})).statut === 403, "l'agent conformité ne paramètre pas les listes (conformite:CONFIGURE requis)");
  const sync1 = await api(admin.token, 'POST', '/conformite/ofac/synchroniser', {});
  const sdn1 = sync1.corps.data?.find((r: any) => r.liste === 'sdn');
  const non1 = sync1.corps.data?.find((r: any) => r.liste === 'non_sdn');
  verifier(sync1.statut === 200 && sdn1?.statut === 'reussie' && sdn1.entrees === 9 && sdn1.ajoutees === 9 && sdn1.ignorees === 1, 'première synchro SDN : 9 inscriptions, le navire est ignoré', sync1.corps);
  verifier(non1?.statut === 'reussie' && non1.entrees === 3, 'première synchro de la liste consolidée', non1);
  const etat = await api(r06.token, 'GET', '/conformite/ofac/etat');
  const etatSdn = etat.corps.data?.listes?.find((l: any) => l.liste === 'sdn');
  verifier(etat.statut === 200 && etatSdn?.nb_entrees === 9 && etatSdn.obsolete === false && etatSdn.a_jour_au, "l'état des listes indique la fraîcheur", etat.corps);
  verifier((await api(r05.token, 'GET', '/conformite/ofac/etat')).statut === 403, "l'état des listes est réservé à la conformité");

  const sync2 = await api(admin.token, 'POST', '/conformite/ofac/synchroniser', {});
  verifier(sync2.corps.data.every((r: any) => r.statut === 'inchangee'), 'une publication identique est reconnue et non retraitée', sync2.corps.data);
  const sync3 = await api(admin.token, 'POST', '/conformite/ofac/synchroniser', { forcer: true });
  const sdn3 = sync3.corps.data.find((r: any) => r.liste === 'sdn');
  verifier(sdn3.statut === 'reussie' && sdn3.ajoutees === 0 && sdn3.modifiees === 0 && sdn3.retirees === 0, 'un retraitement forcé ne change rien (empreintes stables)', sdn3);

  titre('Contrôle automatique à la création et confidentialité');
  const clientA = await creerClient({ type_personne: 'physique', prenom: 'Yong Chol', nom: 'Jo', date_naissance: '1973-09-30', nationalite: 'Corée du Nord' });
  const clientB = await creerClient({ type_personne: 'physique', prenom: 'Marie', nom: 'Ngassa', date_naissance: '1988-04-02', nationalite: 'Camerounaise' });
  const clientC = await creerClient({ type_personne: 'morale', nom: 'Banco Nacional de Cuba', forme_juridique: 'SA' });
  const hA = await attendreHistorique(clientA);
  const hB = await attendreHistorique(clientB);
  const hC = await attendreHistorique(clientC);
  const a = hA?.[0];
  verifier(a?.declencheur === 'automatique' && a.statut === 'correspondance_potentielle' && a.revue_statut === 'a_revoir', 'création du client A : contrôle automatique, correspondance potentielle à revoir', a);
  verifier(a?.correspondances?.[0]?.nom === 'JO, Yong Chol' && a.correspondances[0].confiance === 'forte' && a.correspondances[0].score === 100, 'la conformité voit le détail : nom OFAC, score 100, confiance forte', a?.correspondances?.[0]);
  verifier(a?.correspondances?.[0]?.indices?.naissance === 'exacte' && a.correspondances[0].indices.pays === 'concordant', 'indices de naissance et de pays concordants');
  verifier(a?.versions_listes?.length === 2 && a.reference?.startsWith('SCR-'), 'la version des listes utilisée est figée dans le contrôle', a?.versions_listes);
  verifier(hB?.[0]?.statut === 'aucune_correspondance' && hB[0].revue_statut === 'non_requise', 'un client sans homonyme : aucune correspondance, pas de revue');
  verifier(hC?.[0]?.statut === 'correspondance_potentielle' && hC[0].correspondances[0].type === 'entite', 'une société est rapprochée des entités listées');
  const alerteA = await prisma.alerteConformite.findFirst({ where: { code: 'sanctions_correspondance', entiteType: 'client', entiteId: clientA } });
  verifier(alerteA?.niveau === 'critique' && alerteA.statut === 'ouverte', "une alerte de conformité critique est créée pour la revue", alerteA);
  verifier((await prisma.client.findUnique({ where: { id: clientA } }))?.statut === 'actif', "le client n'est PAS bloqué automatiquement");

  const vueCommercial = await historique(r05.token, clientA);
  verifier(vueCommercial?.[0]?.statut === 'correspondance_potentielle' && vueCommercial[0].message, 'le commercial voit le statut et un message neutre');
  verifier(vueCommercial?.[0] && !('correspondances' in vueCommercial[0]) && !('score_max' in vueCommercial[0]) && !('alerte_id' in vueCommercial[0]), 'le commercial ne voit ni noms listés, ni scores, ni alerte (pas de divulgation)', vueCommercial?.[0]);
  verifier((await api(r05b.token, 'GET', `/conformite/clients/${clientA}/historique`)).statut === 404, "un autre commercial ne voit pas l'historique d'un client hors de son périmètre");
  verifier((await api(r05b.token, 'GET', `/conformite/screenings/${a.id}`)).statut === 404, "ni le détail d'un contrôle hors de son périmètre");
  verifier((await api(r05.token, 'GET', `/conformite/screenings/${a.id}`)).statut === 200, 'mais le sien oui');

  titre('Contrôles manuels, validation des entrées');
  verifier((await controle(r05.token, {})).statut === 422, 'sans client ni nom : refusé');
  verifier((await controle(r05.token, { client_id: clientA, prospect_id: 1 })).statut === 422, 'client et prospect ensemble : refusé');
  verifier((await controle(r05.token, { client_id: 99999999 })).statut === 404, 'client inexistant : 404');
  const parPiece = await controle(r06.token, { nom: 'Dupont', prenom: 'Jean', numero_piece: '756 454-133' });
  verifier(parPiece.corps.data?.statut === 'correspondance_potentielle' && parPiece.corps.data.correspondances[0].raison === 'identifiant', "une pièce d'identité identique à celle d'un inscrit déclenche une revue malgré un nom différent", parPiece.corps.data);
  const inconnu = await controle(r06.token, { nom: 'Fotso', prenom: 'Aline', date_naissance: '1990-03-03', pays: 'Cameroun' });
  verifier(inconnu.corps.data?.statut === 'aucune_correspondance' && !inconnu.corps.data.correspondances.length, 'identité saisie sans homonyme : aucune correspondance');
  verifier((await controle(r06.token, { nom: 'Fotso', date_naissance: 'pas-une-date' })).statut === 422, 'date de naissance illisible : refusée');

  titre('Revue humaine : droits, justification, effets');
  verifier((await api(r05.token, 'POST', `/conformite/screenings/${a.id}/revue`, { decision: 'faux_positif', commentaire: 'homonyme évident' })).statut === 403, 'un commercial ne rend pas de décision de revue');
  verifier((await api(r06.token, 'POST', `/conformite/screenings/${a.id}/revue`, { decision: 'faux_positif', commentaire: 'ok' })).statut === 422, 'une justification trop courte est refusée');
  const revFp = await api(r06.token, 'POST', `/conformite/screenings/${a.id}/revue`, { decision: 'faux_positif', commentaire: 'Homonyme : date de naissance et pièce différentes vérifiées.' });
  verifier(revFp.statut === 200 && revFp.corps.data.statut === 'aucune_correspondance' && revFp.corps.data.revue_statut === 'revue' && revFp.corps.data.revue?.decision === 'faux_positif', 'faux positif : le contrôle est clos avec sa décision', revFp.corps);
  verifier(revFp.corps.data.statut_initial === 'correspondance_potentielle', "le statut initial reste consultable");
  verifier((await prisma.alerteConformite.findUnique({ where: { id: alerteA!.id } }))?.statut === 'fausse_alerte', "l'alerte est close en fausse alerte");
  verifier((await api(r06.token, 'POST', `/conformite/screenings/${a.id}/revue`, { decision: 'faux_positif', commentaire: 'Deuxième décision sur le même contrôle.' })).statut === 409, 'un contrôle déjà examiné ne se réexamine pas');
  verifier((await api(r06.token, 'POST', `/conformite/screenings/${hB![0].id}/revue`, { decision: 'faux_positif', commentaire: 'Sans correspondance à revoir.' })).statut === 409, "pas de revue sur un contrôle sans correspondance");

  titre('Mémoire des faux positifs');
  const relance = await controle(r06.token, { client_id: clientA });
  verifier(relance.corps.data.statut === 'aucune_correspondance' && relance.corps.data.ecartees.some((x: any) => x.nom === 'JO, Yong Chol') && relance.corps.data.correspondances.length === 0, "même client, même inscription : la correspondance écartée n'alerte plus mais reste visible", relance.corps.data);
  const maj = await api(r05.token, 'PUT', `/clients/${clientA}`, { nationalite: 'Camerounaise' });
  verifier(maj.statut === 200, 'mise à jour de la fiche client');
  const apresChangement = await controle(r06.token, { client_id: clientA });
  verifier(apresChangement.corps.data.statut === 'correspondance_potentielle', "si l'identité du client change, la décision précédente ne couvre plus le nouveau contrôle", apresChangement.corps.data.statut);

  titre('Correspondance confirmée par un humain');
  const ba = await controle(r06.token, { nom: "Ba'asyir", prenom: 'Abdul Rahim', date_naissance: '1977-11-16' });
  const baC = ba.corps.data?.correspondances?.[0];
  verifier(ba.corps.data?.statut === 'correspondance_potentielle' && baC?.confiance === 'forte', 'contrôle fort : toujours « potentielle » tant qu\'un humain n\'a pas statué', ba.corps.data);
  const chemin = `/conformite/screenings/${ba.corps.data.id}/revue`;
  verifier((await api(r06.token, 'POST', chemin, { decision: 'correspondance_confirmee', commentaire: 'Identité vérifiée sur pièce originale du client.' })).statut === 422, "confirmer exige de désigner l'inscription");
  verifier((await api(r06.token, 'POST', chemin, { decision: 'correspondance_confirmee', commentaire: 'Identité vérifiée sur pièce originale.', entree_ids: [999999] })).statut === 422, "une inscription étrangère au contrôle est refusée");
  verifier((await api(r06.token, 'POST', chemin, { decision: 'correspondance_confirmee', commentaire: 'trop court', entree_ids: [baC.entree_id] })).statut === 422, 'la confirmation exige une justification détaillée (20 caractères)');
  const confirmation = await api(r06.token, 'POST', chemin, { decision: 'correspondance_confirmee', commentaire: 'Identité vérifiée sur pièce originale du client, dossier transmis.', entree_ids: [baC.entree_id] });
  verifier(confirmation.statut === 200 && confirmation.corps.data.statut === 'correspondance_confirmee' && confirmation.corps.data.revue_statut === 'revue', 'seule la décision humaine fait passer à « correspondance confirmée »', confirmation.corps);
  const alerteBa = await prisma.alerteConformite.findUnique({ where: { id: confirmation.corps.data.alerte_id } });
  verifier(alerteBa?.statut === 'en_cours' && alerteBa.niveau === 'critique', "l'alerte reste ouverte (suivi de la procédure interne)", alerteBa);
  verifier(!!(await attendreCondition(() => prisma.evenementMetier.findFirst({ where: { code: 'conformite.sanctions_confirmee' } }))), 'la confirmation notifie la direction et la conformité');

  titre('Escalade');
  const esc = await controle(r06.token, { nom: 'Yong Chol Jo' });
  const escRev = await api(r06.token, 'POST', `/conformite/screenings/${esc.corps.data.id}/revue`, { decision: 'escalade', commentaire: 'Doute sur la pièce, avis de la direction demandé.' });
  verifier(escRev.statut === 200 && escRev.corps.data.revue_statut === 'escaladee' && escRev.corps.data.statut === 'correspondance_potentielle', "escalade : le contrôle reste à trancher", escRev.corps.data);
  const escFin = await api(r06.token, 'POST', `/conformite/screenings/${esc.corps.data.id}/revue`, { decision: 'faux_positif', commentaire: 'Direction consultée : homonyme confirmé.' });
  verifier(escFin.statut === 200 && escFin.corps.data.revue_statut === 'revue', "un contrôle escaladé peut ensuite être tranché");

  titre('File de revue');
  const file = await api(r06.token, 'GET', '/conformite/screenings?a_revoir=true');
  verifier(file.statut === 200 && Array.isArray(file.corps.data) && file.corps.data.every((x: any) => ['a_revoir', 'escaladee'].includes(x.revue_statut)), 'la file ne contient que les contrôles à revoir', file.corps.data?.length);
  verifier((await api(r05.token, 'GET', '/conformite/screenings?a_revoir=true')).statut === 403, 'la file est réservée à la conformité');
  verifier((await api(r06.token, 'GET', '/conformite/screenings/compteurs')).statut === 200, 'compteurs disponibles');

  titre('Paramétrage : confiance minimale et seuil');
  verifier((await api(admin.token, 'PUT', '/administration/parametres/conformite.ofac_confiance_min', { valeur: 'enorme' })).statut === 422, 'une confiance minimale invalide est refusée');
  verifier((await api(admin.token, 'PUT', '/administration/parametres/conformite.ofac_seuil', { valeur: 20 })).statut === 422, 'un seuil hors 60-100 est refusé');
  verifier((await api(admin.token, 'PUT', '/administration/parametres/conformite.ofac_listes', { valeur: ['inconnue'] })).statut === 422, 'une liste inconnue est refusée');
  const faible = await controle(r06.token, { nom: 'Yong Chol Jo', date_naissance: '1990-05-05' });
  verifier(faible.corps.data.correspondances[0]?.confiance === 'faible' && faible.corps.data.statut === 'correspondance_potentielle', 'date de naissance incompatible : confiance faible, mais toujours à revoir par défaut', faible.corps.data.correspondances?.[0]);
  await api(admin.token, 'PUT', '/administration/parametres/conformite.ofac_confiance_min', { valeur: 'forte' });
  const filtre = await controle(r06.token, { nom: 'Yong Chol Jo', date_naissance: '1990-05-05' });
  verifier(filtre.corps.data.statut === 'aucune_correspondance' && filtre.corps.data.non_retenues.length >= 1 && filtre.corps.data.revue_statut === 'non_requise', "avec une confiance minimale « forte », la correspondance faible est consignée mais ne déclenche pas de revue", filtre.corps.data);
  verifier(!(await prisma.alerteConformite.findUnique({ where: { empreinte: `ofac:${filtre.corps.data.id}` } })), 'et aucune alerte');
  await api(admin.token, 'DELETE', '/administration/parametres/conformite.ofac_confiance_min');

  titre('Listes anciennes');
  await prisma.sanctionSynchronisation.updateMany({ data: { finAt: jour(10) } });
  const vieux = await controle(r06.token, { nom: 'Fotso', prenom: 'Aline' });
  verifier(vieux.corps.data.avertissements.length >= 1 && /n'a pas été vérifiée depuis/.test(vieux.corps.data.avertissements[0]), "un avertissement signale que le contrôle s'appuie sur des listes anciennes", vieux.corps.data.avertissements);
  const etatVieux = await api(r06.token, 'GET', '/conformite/ofac/etat');
  verifier(etatVieux.corps.data.listes.find((l: any) => l.liste === 'sdn').obsolete === true, "l'état des listes passe en « obsolète »");

  titre('Mise à jour incrémentale et surveillance continue');
  const clientD = await creerClient({ type_personne: 'physique', prenom: 'Paul Marie', nom: 'Kamga', date_naissance: '1980-05-12', nationalite: 'Camerounaise' });
  const hD = await attendreHistorique(clientD);
  verifier(hD?.[0]?.statut === 'aucune_correspondance', "avant la mise à jour de la liste, Paul Marie Kamga n'est pas listé");
  serveur.version = 2;
  const planifiee = await synchroSanctionsPlanifiee();
  const sdn4 = planifiee.listes.find((l: any) => l.liste === 'sdn');
  verifier(sdn4?.statut === 'reussie' && sdn4.ajoutees === 1 && sdn4.modifiees === 1 && sdn4.retirees === 1, 'mise à jour : 1 ajout, 1 modification, 1 retrait', sdn4);
  const retiree = await prisma.sanctionEntree.findFirst({ where: { liste: 'sdn', uid: 537 } });
  verifier(retiree && retiree.actif === false && retiree.retireSyncId, "une inscription retirée est désactivée, jamais supprimée");
  verifier(planifiee.surveillance && planifiee.surveillance.avec_correspondance >= 1, 'la tâche contrôle le portefeuille sur les seules inscriptions nouvelles ou modifiées', planifiee.surveillance);
  const hD2 = await historique(r06.token, clientD);
  verifier(hD2?.[0]?.declencheur === 'surveillance_continue' && hD2[0].statut === 'correspondance_potentielle' && hD2[0].correspondances[0].nom === 'KAMGA, Paul Marie', 'le client existant remonte en surveillance continue', hD2?.[0]);
  const nouvelleEntree = await prisma.sanctionEntree.findFirstOrThrow({ where: { liste: 'sdn', uid: 99001 } });
  const encore = await depisterPortefeuille({ entreeIds: [nouvelleEntree.id] });
  verifier(encore.avec_correspondance === 0 && encore.deja_traites >= 1, 'relancer la surveillance ne crée pas de doublon', encore);
  const apres = await historique(r06.token, clientD);
  verifier(apres?.length === 2, 'le client D a bien deux contrôles (création, surveillance)', apres?.length);

  titre('Robustesse : fichiers corrompus ou indisponibles');
  const avant = await prisma.sanctionEntree.count({ where: { liste: 'sdn', actif: true } });
  process.env.OFAC_MINIMUM_ENTREES = '5';
  serveur.mode = 'tronque';
  const trq = await api(admin.token, 'POST', '/conformite/ofac/synchroniser', { forcer: true });
  const trqSdn = trq.corps.data.find((r: any) => r.liste === 'sdn');
  verifier(trqSdn.statut === 'echec' && /suspect/.test(trqSdn.erreur), 'un fichier tronqué est refusé', trqSdn);
  verifier((await prisma.sanctionEntree.count({ where: { liste: 'sdn', actif: true } })) === avant, 'la liste précédente est conservée intacte');
  verifier(!!(await prisma.alerteConformite.findFirst({ where: { code: 'sanctions_synchro_echec' } })), "l'échec crée une alerte de conformité");
  serveur.mode = 'html';
  const html = await api(admin.token, 'POST', '/conformite/ofac/synchroniser', { forcer: true });
  verifier(html.corps.data.find((r: any) => r.liste === 'sdn').statut === 'echec', "une page HTML à la place d'un fichier est refusée");
  serveur.mode = 'erreur';
  const err500 = await api(admin.token, 'POST', '/conformite/ofac/synchroniser', { forcer: true });
  verifier(err500.corps.data.find((r: any) => r.liste === 'sdn').statut === 'echec', 'une erreur serveur est consignée sans effet sur la liste');
  serveur.mode = 'normal';
  process.env.OFAC_MINIMUM_ENTREES = '1';
  const encorePotentielle = await controle(r06.token, { nom: 'Yong Chol Jo' });
  verifier(encorePotentielle.corps.data.statut === 'correspondance_potentielle', 'après des échecs de synchronisation, les contrôles continuent avec la dernière liste valide');
  const histo = await api(r06.token, 'GET', '/conformite/ofac/synchronisations');
  verifier(histo.corps.data.filter((s: any) => s.statut === 'echec').length >= 3, "l'historique des synchronisations consigne les échecs");

  titre('Tâches planifiées');
  const taches = await api(admin.token, 'GET', '/administration/taches');
  const tSync = taches.corps.data.find((t: any) => t.nom === 'sanctions_synchronisation');
  const tPort = taches.corps.data.find((t: any) => t.nom === 'sanctions_portefeuille');
  verifier(tSync?.planification === 'toutes les 360 min' && tPort?.planification === 'lancement manuel', 'synchronisation toutes les 6 heures, contrôle du portefeuille en lancement manuel', [tSync, tPort]);
  const lancement = await api(admin.token, 'POST', '/conformite/ofac/depistage-portefeuille', {});
  verifier(lancement.statut === 202, 'le contrôle du portefeuille démarre en arrière-plan (202)');
  const tache = await attendreCondition(() => prisma.tacheExecution.findFirst({ where: { nom: 'sanctions_portefeuille', statut: { in: ['ok', 'echec'] } } }), 20000);
  verifier(tache?.statut === 'ok' && (tache.resultat as any)?.examines >= 4, 'le contrôle du portefeuille examine tous les clients', tache);
  verifier((await api(r06.token, 'POST', '/conformite/ofac/depistage-portefeuille', {})).statut === 403, 'réservé à qui paramètre la conformité');

  titre('Journal');
  verifier((await prisma.log.count({ where: { module: 'conformite', action: 'SCREENING_SANCTIONS' } })) >= 5, 'chaque contrôle est journalisé');
  verifier((await prisma.log.count({ where: { module: 'conformite', action: { startsWith: 'REVUE_SANCTIONS_' } } })) >= 3, 'chaque décision de revue est journalisée avec son auteur');
  console.log(`   (jour de référence ${aujourdhui()})`);

  faux.close();
  await arreter();
})().catch((e) => { console.error(e); process.exit(1); });
