import http from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import { api, arreter, attendre, demarrer, titre, utilisateur, verifier } from './helpers';
import prisma from '../../src/lib/prisma';
import { synchroSanctionsPlanifiee } from '../../src/modules/screening/sanctionsTaches';

/**
 * Sources de sanctions autres que l'OFAC : ONU (XML derrière une redirection à signature temporaire), UE (lien à jeton),
 * listes locales du CRM ; contrôle multi-sources, surveillance sans délai, contrôle du portefeuille par liste,
 * robustesse et absence de fuite de secrets. Aucun accès aux vrais sites : tout est servi par un faux serveur local.
 */

const FIX = join(__dirname, 'fixtures');
const lire = (...chemin: string[]) => readFileSync(join(FIX, ...chemin), 'utf-8');
const JETON_UE = 'SECRET-EU-TOKEN-4242';
const SIGNATURE_ONU = 'SECRETSIG-UN-9999';

const serveur = { onu: 'normal' as 'normal' | 'tronque' | 'erreur', ue: 'normal' as 'normal' | 'erreur', visitesBlobOnu: 0, visitesUe: 0 };
const faux = http.createServer((req, res) => {
  const u = new URL(req.url ?? '/', 'http://faux');
  if (u.pathname === '/un/consolidated.xml') { res.writeHead(302, { Location: `/un-blob/consolidatedLegacyByPRN.xml?sv=2024-05-04&sig=${SIGNATURE_ONU}` }).end(); return; }
  if (u.pathname === '/un-blob/consolidatedLegacyByPRN.xml') {
    serveur.visitesBlobOnu++;
    if (u.searchParams.get('sig') !== SIGNATURE_ONU) { res.writeHead(403).end(); return; }
    if (serveur.onu === 'erreur') { res.writeHead(500).end('boom'); return; }
    const xml = lire('onu', 'consolidated.xml');
    res.writeHead(200, { 'Content-Type': 'application/xml' }).end(serveur.onu === 'tronque' ? xml.slice(0, 4000) : xml);
    return;
  }
  if (u.pathname === '/eu/FSF.xml') {
    serveur.visitesUe++;
    if (u.searchParams.get('token') !== JETON_UE) { res.writeHead(403).end(); return; }
    if (serveur.ue === 'erreur') { res.writeHead(500).end('boom'); return; }
    res.writeHead(200, { 'Content-Type': 'application/xml' }).end(lire('ue', 'FSF.xml'));
    return;
  }
  if (u.pathname.startsWith('/ofac/')) { try { res.writeHead(200, { 'Content-Type': 'text/csv' }).end(lire('ofac', u.pathname.split('/').pop()!)); } catch { res.writeHead(404).end(); } return; }
  res.writeHead(404).end();
});

const attendreCondition = async <T>(fn: () => Promise<T | null | undefined | false>, ms = 10000): Promise<T | null> => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { const v = await fn(); if (v) return v as T; await attendre(150); }
  return null;
};

(async () => {
  await new Promise<void>((r) => faux.listen(0, '127.0.0.1', () => r()));
  const origine = `http://127.0.0.1:${(faux.address() as { port: number }).port}`;
  process.env.OFAC_BASE_URL = `${origine}/ofac`;
  process.env.UN_LIST_URL = `${origine}/un/consolidated.xml`;
  process.env.SANCTIONS_MINIMUM_ENTREES = '1';
  delete process.env.EU_SANCTIONS_URL;
  await demarrer();

  const admin = await utilisateur('it.admin.src@cecaw.cm', 'admin', []);
  const r05 = await utilisateur('it.commercial.src@cecaw.cm', 'agent', ['R05']);
  const r06 = await utilisateur('it.conformite.src@cecaw.cm', 'manager', ['R06']);
  const param = (listes: string[]) => api(admin.token, 'PUT', '/administration/parametres/conformite.ofac_listes', { valeur: listes });
  const sync = (corps: object = {}) => api(admin.token, 'POST', '/conformite/sanctions/synchroniser', corps);
  const controle = (token: string, corps: Record<string, unknown>) => api(token, 'POST', '/conformite/screenings', corps);
  const historique = async (clientId: number) => (await api(r06.token, 'GET', `/conformite/clients/${clientId}/historique`)).corps?.data as any[] | undefined;
  const creerClient = async (corps: Record<string, unknown>) => {
    const r = await api(r05.token, 'POST', '/clients', { telephone: '677000000', adresse: 'Douala', agence_id: 1, email: '', type_personne: 'physique', ...corps });
    if (r.statut !== 201) throw new Error(`Création client impossible : ${JSON.stringify(r.corps)}`);
    return r.corps.data.id as number;
  };

  titre('Source UE non configurée, listes locales vides');
  await param(['sdn', 'non_sdn', 'locale']);
  const etat0 = await api(r06.token, 'GET', '/conformite/sanctions/etat');
  const ue0 = etat0.corps.data?.listes?.find((l: any) => l.liste === 'ue');
  verifier(etat0.statut === 200 && ue0?.configuree === false && /EU Login/.test(ue0.aide_configuration ?? ''), "l'UE est signalée « non configurée » avec la marche à suivre", ue0);
  verifier(etat0.corps.data.listes.map((l: any) => l.liste).sort().join() === 'locale,non_sdn,onu,sdn,ue', 'toutes les sources figurent à l\'état des listes');
  const alias = await api(r06.token, 'GET', '/conformite/ofac/etat');
  verifier(alias.statut === 200 && alias.corps.data.listes.length === 5, "l'ancien chemin /ofac/etat reste servi (alias)");

  titre('Phase 1 : OFAC + listes locales seulement');
  const s1 = await sync();
  verifier(s1.statut === 200 && s1.corps.data.map((r: any) => r.liste).sort().join() === 'locale,non_sdn,sdn', 'seules les listes actives et configurées sont synchronisées (ni ONU, ni UE)', s1.corps.data);
  verifier(s1.corps.data.find((r: any) => r.liste === 'locale')?.statut === 'reussie' && s1.corps.data.find((r: any) => r.liste === 'locale').entrees === 0, 'liste locale vide : synchronisation réussie, 0 inscription');
  verifier((await sync({ liste: 'ue' })).statut === 422, "synchroniser l'UE sans configuration est refusé (422)");
  verifier((await api(r05.token, 'POST', '/conformite/sanctions/synchroniser', {})).statut === 403, 'un commercial ne synchronise pas');

  // Une personne seulement listée par l'ONU (CDi.003), créée AVANT le chargement de la liste ONU.
  const clientIya = await creerClient({ prenom: 'Gaston', nom: 'Iyamuremye', date_naissance: '1948-05-05', nationalite: 'Rwandaise' });
  const hIya = await attendreCondition(async () => { const h = await historique(clientIya); return h && h.length >= 1 ? h : null; });
  verifier(hIya?.[0]?.statut === 'aucune_correspondance', "avant la liste ONU, Gaston Iyamuremye n'est pas listé");

  titre('Phase 2 : ONU (redirection à signature temporaire)');
  await param(['sdn', 'non_sdn', 'onu', 'locale']);
  const planifiee = await synchroSanctionsPlanifiee();
  const onu1 = planifiee.listes.find((l: any) => l.liste === 'onu');
  verifier(onu1?.statut === 'reussie' && onu1.entrees === 13 && onu1.ajoutees === 13, 'ONU : 13 inscriptions lues depuis le XML', onu1);
  verifier(serveur.visitesBlobOnu >= 1, "la redirection 302 vers l'adresse signée a été suivie");
  verifier(planifiee.surveillance === null && /Première charge/.test((planifiee as any).remarque ?? ''), "première charge de l'ONU : le portefeuille n'est pas contrôlé d'office, la conformité en est avertie", planifiee);
  verifier(((await historique(clientIya))?.length ?? 0) === 1, 'le client existant n\'a pas été recontrôlé automatiquement');

  const lance = await api(admin.token, 'POST', '/conformite/sanctions/depistage-portefeuille', { liste: 'onu' });
  verifier(lance.statut === 202, 'contrôle du portefeuille contre la seule liste ONU : lancé en arrière-plan');
  const hIya2 = await attendreCondition(async () => { const h = await historique(clientIya); return h && h.length >= 2 ? h : null; });
  const surv = hIya2?.[0];
  verifier(surv?.declencheur === 'surveillance_continue' && surv.statut === 'correspondance_potentielle' && surv.correspondances[0].liste === 'onu', 'le client remonte contre la nouvelle liste (ONU)', surv);
  verifier(surv?.correspondances?.[0]?.reference === 'CDi.003' && surv?.correspondances?.[0]?.indices?.naissance === 'annee', "référence officielle ONU affichable, et date de naissance comparée à l'année publiée", surv?.correspondances?.[0]);
  verifier((await api(r06.token, 'POST', '/conformite/sanctions/depistage-portefeuille', { liste: 'onu' })).statut === 403, 'réservé à qui paramètre la conformité');

  titre('Phase 3 : UE avec lien à jeton');
  await param(['sdn', 'non_sdn', 'onu', 'ue', 'locale']);
  const sansLien = await sync();
  verifier(!sansLien.corps.data.some((r: any) => r.liste === 'ue'), "sans EU_SANCTIONS_URL, l'UE reste ignorée même activée");
  process.env.EU_SANCTIONS_URL = `${origine}/eu/FSF.xml?token=${JETON_UE}`;
  const avecLien = await sync({ liste: 'ue' });
  const ue1 = avecLien.corps.data?.[0];
  verifier(avecLien.statut === 200 && ue1?.statut === 'reussie' && ue1.entrees === 3 && ue1.ignorees === 1, 'UE : 3 inscriptions, le navire est ignoré', avecLien.corps);
  const etat1 = await api(r06.token, 'GET', '/conformite/sanctions/etat');
  verifier(etat1.corps.data.listes.find((l: any) => l.liste === 'ue').configuree === true && etat1.corps.data.listes.find((l: any) => l.liste === 'ue').nb_entrees === 3, "l'UE apparaît configurée avec ses inscriptions");

  titre('Contrôle multi-sources');
  const multi = await controle(r06.token, { nom: 'Jo', prenom: 'Yong Chol', date_naissance: '1973-09-30', pays: 'Corée du Nord' });
  const parListe = (multi.corps.data?.correspondances ?? []).filter((c: any) => c.score >= 99).map((c: any) => c.liste).sort();
  verifier(multi.statut === 201 && parListe.join() === 'onu,sdn,ue', 'une personne listée par l\'OFAC, l\'ONU et l\'UE ressort des trois listes dans un seul contrôle', parListe);
  verifier(multi.corps.data.correspondances.filter((c: any) => c.score >= 99).every((c: any) => c.confiance === 'forte' && c.indices.pays === 'concordant' && c.indices.naissance === 'exacte'), 'confiance forte et pays concordant, quelle que soit la graphie du pays (Korea, North / DPRK / KOREA, DEMOCRATIC…)');
  verifier(multi.corps.data.versions_listes.length === 5, 'le contrôle fige la version de chaque liste utilisée (OFAC x2, ONU, UE, locale)', multi.corps.data.versions_listes);
  const kato = await controle(r06.token, { nom: 'Kato' });
  const katoOnu = kato.corps.data.correspondances.find((c: any) => c.liste === 'onu');
  verifier(katoOnu?.via === 'alias' && katoOnu.confiance === 'faible', "un rapprochement sur un alias que l'ONU juge peu fiable reste de confiance faible", katoOnu);
  // Mémoire des faux positifs : elle s'attache à une fiche client, et vaut pour toutes les listes à la fois.
  const clientJo = await creerClient({ prenom: 'Yong Chol', nom: 'Jo', date_naissance: '1973-09-30', nationalite: 'Corée du Nord' });
  const sJo = await controle(r06.token, { client_id: clientJo });
  verifier(['onu', 'sdn', 'ue'].every((l) => sJo.corps.data.correspondances.some((c: any) => c.liste === l && c.score >= 99)), 'le client est rapproché des trois listes', sJo.corps.data.correspondances?.map((c: any) => c.liste));
  const revue = await api(r06.token, 'POST', `/conformite/screenings/${sJo.corps.data.id}/revue`, { decision: 'faux_positif', commentaire: 'Homonyme vérifié sur pièce, trois listes écartées ensemble.' });
  verifier(revue.statut === 200, 'un seul faux positif écarte les correspondances de toutes les listes');
  const apres = await controle(r06.token, { client_id: clientJo });
  const listesEcartees = [...new Set(apres.corps.data.ecartees.filter((c: any) => c.score >= 99).map((c: any) => c.liste))].sort();
  verifier(apres.corps.data.statut === 'aucune_correspondance' && listesEcartees.join() === 'onu,sdn,ue', 'au contrôle suivant, ces correspondances ne ré-alertent plus mais restent visibles', listesEcartees);

  titre('Listes locales : saisie, sans délai, retrait');
  verifier((await api(r05.token, 'POST', '/conformite/listes', { nom: 'X', categorie: 'sanction' })).statut === 403, 'un commercial ne saisit pas de liste de surveillance');
  verifier((await api(r06.token, 'POST', '/conformite/listes', { nom: 'X', categorie: 'sanction', date_naissance: 'hier' })).statut === 422, 'date de naissance illisible refusée');
  const clientAnif = await creerClient({ prenom: 'Anif', nom: 'Test', date_naissance: '1975-02-03', nationalite: 'Camerounaise' });
  const hAnif = await attendreCondition(async () => { const h = await historique(clientAnif); return h && h.length >= 1 ? h : null; });
  verifier(hAnif?.[0]?.statut === 'aucune_correspondance', "avant la notification, le client n'est pas listé");

  const [e1, e2] = await Promise.all([
    api(r06.token, 'POST', '/conformite/listes', { nom: 'Test', prenom: 'Anif', date_naissance: '1975-02-03', pays: 'Cameroun', categorie: 'sanction', source: 'ANIF — notification 12/2026', motif: 'Gel administratif', alias: ['A. Test'], type_entree: 'individu', numero_piece: '112233445' }),
    api(r06.token, 'POST', '/conformite/listes', { nom: 'Société Écran SARL', categorie: 'interne', type_entree: 'entite' }),
  ]);
  verifier(e1.statut === 201 && e2.statut === 201, 'deux saisies simultanées acceptées');
  const nbLocale = await attendreCondition(async () => ((await prisma.sanctionEntree.count({ where: { liste: 'locale', actif: true } })) === 2 ? true : null));
  verifier(!!nbLocale, 'deux saisies simultanées : aucune n\'est perdue dans la copie locale (verrou de synchronisation)');
  const hAnif2 = await attendreCondition(async () => { const h = await historique(clientAnif); return h && h.length >= 2 ? h : null; });
  const sA = hAnif2?.[0];
  verifier(sA?.declencheur === 'surveillance_continue' && sA.statut === 'correspondance_potentielle' && sA.correspondances[0].liste === 'locale' && sA.correspondances[0].confiance === 'forte', 'la nouvelle inscription nationale est recherchée sans délai dans le portefeuille (confiance forte : naissance et pays concordants)', sA);
  verifier(/ANIF/.test(sA?.correspondances?.[0]?.extrait_remarques ?? ''), 'la provenance (« ANIF — notification… ») figure dans les remarques du rapprochement');
  const parPiece = await controle(r06.token, { nom: 'Quelqu\'un', prenom: 'Autre', numero_piece: '112 233-445' });
  verifier(parPiece.corps.data.correspondances?.[0]?.liste === 'locale' && parPiece.corps.data.correspondances[0].raison === 'identifiant', 'la pièce d\'identité saisie dans la liste locale est comparée');
  const entiteLocale = await controle(r06.token, { type_personne: 'morale', nom: 'Societe Ecran' });
  verifier(entiteLocale.corps.data.correspondances?.some((c: any) => c.liste === 'locale' && c.type === 'entite'), 'une société de la liste locale est rapprochée comme entité, pas comme personne');
  verifier((await controle(r06.token, { nom: 'Ecran', prenom: 'Societe' })).corps.data.correspondances.every((c: any) => c.type === 'individu'), 'une personne physique n\'est pas rapprochée d\'une société');

  const csv = await api(r06.token, 'POST', '/conformite/listes/import', { csv: [
    'nom;prenom;numero_piece;pays;categorie;source;date_naissance;alias;type',
    'Mbarga;Jules;;Cameroun;sanction;ANIF lot 2;1982-07-07;J. Mbarga|Jules M.;individu',
    'Date;Mauvaise;;;sanction;lot 2;07/07/1982;;individu',
    'Type;Mauvais;;;sanction;lot 2;;;personne',
  ].join('\n') });
  verifier(csv.statut === 200 && csv.corps.data.importees === 1 && csv.corps.data.rejetees === 2, "import enrichi : date, alias et type ; les lignes invalides sont rapportées", csv.corps.data);
  const importe = await attendreCondition(() => prisma.sanctionEntree.findFirst({ where: { liste: 'locale', nom: 'Jules Mbarga', actif: true }, include: { alias: true } }));
  verifier(importe && importe.alias.length === 2 && importe.anneesNaissance.includes(1982), 'l\'import alimente aussi la copie locale (alias et naissance compris)');

  const idAnif = e1.corps.data.id;
  verifier((await api(r06.token, 'DELETE', `/conformite/listes/${idAnif}`)).statut === 204, 'retrait de la notification');
  const retire = await attendreCondition(() => prisma.sanctionEntree.findFirst({ where: { liste: 'locale', uid: idAnif, actif: false } }));
  verifier(!!retire, 'une entrée retirée devient inactive dans la copie, jamais supprimée');
  verifier((await controle(r06.token, { nom: 'Anif', prenom: 'Test', date_naissance: '1975-02-03' })).corps.data.correspondances.every((c: any) => c.liste !== 'locale'), 'et ne correspond plus aux contrôles suivants');

  titre('Robustesse et secrets');
  const avantOnu = await prisma.sanctionEntree.count({ where: { liste: 'onu', actif: true } });
  process.env.SANCTIONS_MINIMUM_ENTREES = '5';
  serveur.onu = 'tronque';
  const trq = await sync({ liste: 'onu', forcer: true });
  verifier(trq.corps.data[0].statut === 'echec' && /incomplet|suspect/.test(trq.corps.data[0].erreur), 'un XML ONU coupé est refusé', trq.corps.data[0]);
  verifier((await prisma.sanctionEntree.count({ where: { liste: 'onu', actif: true } })) === avantOnu, 'la liste ONU précédente est conservée intacte');
  serveur.onu = 'erreur';
  const err = await sync({ liste: 'onu', forcer: true });
  verifier(err.corps.data[0].statut === 'echec', 'une erreur serveur sur l\'adresse signée est consignée');
  serveur.ue = 'erreur';
  const errUe = await sync({ liste: 'ue', forcer: true });
  verifier(errUe.corps.data[0].statut === 'echec', 'une erreur serveur de l\'UE est consignée');
  serveur.onu = 'normal'; serveur.ue = 'normal';
  process.env.SANCTIONS_MINIMUM_ENTREES = '1';

  const toutesErreurs = JSON.stringify([
    await prisma.sanctionSynchronisation.findMany({ select: { erreur: true } }),
    await prisma.alerteConformite.findMany({ select: { titre: true, description: true, donnees: true } }),
    (await api(r06.token, 'GET', '/conformite/sanctions/synchronisations')).corps,
    (await api(r06.token, 'GET', '/conformite/sanctions/etat')).corps,
    trq.corps, err.corps, errUe.corps,
  ]);
  verifier(!toutesErreurs.includes(JETON_UE) && !toutesErreurs.includes(SIGNATURE_ONU), 'ni le jeton du lien UE ni la signature de l\'adresse ONU n\'apparaissent dans les erreurs, alertes, historiques ou réponses API');
  verifier(!!(await prisma.alerteConformite.findFirst({ where: { code: 'sanctions_synchro_echec' } })), "les échecs créent des alertes de conformité");

  titre('Tâche planifiée');
  const taches = await api(admin.token, 'GET', '/administration/taches');
  verifier(taches.corps.data.find((t: any) => t.nom === 'sanctions_synchronisation')?.planification === 'toutes les 360 min', 'toutes les sources sont synchronisées toutes les 6 heures');
  const defaut = await api(admin.token, 'GET', '/administration/parametres');
  const age = defaut.corps.data.find((p: any) => p.cle === 'conformite.ofac_age_max_jours');
  verifier(age?.defaut === 1, "l'âge maximal des listes par défaut est d'un jour");

  faux.close();
  await arreter();
})().catch((e) => { console.error(e); process.exit(1); });
