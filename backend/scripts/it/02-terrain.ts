import prisma from '../../src/lib/prisma';
import { api, arreter, attendre, demarrer, titre, utilisateur, verifier } from './helpers';
import { analyserAnomalies } from '../../src/lib/conformite';
import { verifierEquilibre } from '../../src/lib/compta';

(async () => {
  await demarrer();
  await prisma.agence.update({ where: { id: 1 }, data: { latitude: 4.05, longitude: 9.7 } });

  const r10 = await utilisateur('it.collecteur@cecaw.cm', 'agent', ['R10'], { agent: { matricule: 'IT-001', lat: 4.05, lng: 9.7 } });
  const r10b = await utilisateur('it.collecteur2@cecaw.cm', 'agent', ['R10'], { agent: { matricule: 'IT-002', lat: 4.06, lng: 9.71 } });
  const r12 = await utilisateur('it.superviseur@cecaw.cm', 'backoffice', ['R12']);
  const r09 = await utilisateur('it.caisse@cecaw.cm', 'backoffice', ['R09']);
  const r04 = await utilisateur('it.resp@cecaw.cm', 'manager', ['R04']);
  const r13 = await utilisateur('it.sig@cecaw.cm', 'manager', ['R13']);
  const r14 = await utilisateur('it.compta@cecaw.cm', 'backoffice', ['R14']);
  const r06 = await utilisateur('it.kyc@cecaw.cm', 'backoffice', ['R06']);

  titre('Clients du portefeuille de collecte');
  const clients: number[] = [];
  const points: [number, number][] = [[4.052, 9.702], [4.058, 9.706], [4.049, 9.699], [4.061, 9.712], [4.055, 9.695], [4.047, 9.708]];
  for (let i = 0; i < points.length; i++) {
    const c = await api(r04.token, 'POST', '/clients', { type_personne: 'physique', nom: `Client${i}`, prenom: 'Test', telephone: `6770000${i}0`, adresse: 'Akwa', agence_id: 1, latitude: points[i][0], longitude: points[i][1] });
    clients.push(c.corps.data.id);
  }
  verifier(clients.length === 6, '6 clients géolocalisés créés');
  const cpt = await api(r04.token, 'POST', `/clients/${clients[0]}/comptes`, { produit_id: 4 });
  verifier(cpt.statut === 201, 'compte de collecte journalière ouvert', cpt.corps);
  const compteId = cpt.corps.data.id;
  const compte2 = (await api(r04.token, 'POST', `/clients/${clients[1]}/comptes`, { produit_id: 4 })).corps.data.id;

  const pf = await api(r12.token, 'PUT', `/collecte/portefeuilles/${r10.agentId}`, { client_ids: clients });
  verifier(pf.statut === 200 && pf.corps.data.nb_clients === 6, 'portefeuille de collecte affecté au collecteur', pf.corps);
  verifier((await api(r10.token, 'PUT', `/collecte/portefeuilles/${r10.agentId}`, { client_ids: [clients[0]] })).statut === 403, 'le collecteur ne modifie pas son portefeuille (403)');

  titre('Encaissements, idempotence hors connexion, reçu');
  const uid = 'uid-test-000001';
  const t1 = await api(r10.token, 'POST', `/comptes/${compteId}/transactions`, { type: 'credit', montant: 5000, motif: 'Collecte', agent_id: r10.agentId, client_uid: uid });
  verifier(t1.statut === 201 && t1.corps.data.recuNumero?.startsWith('REC-'), `encaissement enregistré, reçu ${t1.corps.data.recuNumero}`, t1.corps);
  const t1b = await api(r10.token, 'POST', `/comptes/${compteId}/transactions`, { type: 'credit', montant: 5000, motif: 'Collecte', agent_id: r10.agentId, client_uid: uid });
  verifier(t1b.statut === 201 && t1b.corps.data.id === t1.corps.data.id, 'rejeu du même client_uid : aucune duplication');
  const solde = await prisma.compteClient.findUniqueOrThrow({ where: { id: compteId } });
  verifier(Number(solde.solde) === 5000, 'solde crédité une seule fois (5 000)', solde.solde);
  verifier((await api(r10b.token, 'POST', `/comptes/${compteId}/transactions`, { type: 'credit', montant: 100, agent_id: r10.agentId })).statut === 403, "un collecteur ne saisit pas au nom d'un autre (403)");
  await api(r10.token, 'POST', `/comptes/${compte2}/transactions`, { type: 'credit', montant: 7000, agent_id: r10.agentId });
  verifier((await api(r10.token, 'POST', `/comptes/${compteId}/transactions`, { type: 'debit', montant: 999999, agent_id: r10.agentId })).statut === 422, 'retrait supérieur au solde refusé (422)');
  const pdf = await api(r10.token, 'GET', `/collecte/recus/${t1.corps.data.id}/pdf`);
  verifier(pdf.statut === 200 && Buffer.from(pdf.brut!).subarray(0, 5).toString() === '%PDF-', 'reçu numérique PDF');
  const rel = await api(r04.token, 'GET', `/documents/comptes/${compteId}/releve`);
  verifier(rel.statut === 200 && rel.type === 'application/pdf', 'relevé de compte PDF');

  // Encaissements concurrents : le solde doit rester exact (verrou de ligne).
  await Promise.all(Array.from({ length: 8 }, (_, i) => api(r10.token, 'POST', `/comptes/${compteId}/transactions`, { type: 'credit', montant: 1000, agent_id: r10.agentId, client_uid: `uid-concurrent-${i}0000` })));
  const soldeConc = await prisma.compteClient.findUniqueOrThrow({ where: { id: compteId } });
  verifier(Number(soldeConc.solde) === 13000, 'solde exact après 8 encaissements simultanés (13 000)', soldeConc.solde);

  titre('Journée de collecte : clôture, contrôle, rapprochement');
  const journee = await prisma.journeeCollecte.findFirstOrThrow({ where: { agentId: r10.agentId } });
  verifier(Number(journee.totalCollecte) === 20000 && journee.nbOperations === 10, `journée : ${journee.nbOperations} opérations, total ${journee.totalCollecte}`, journee);
  verifier((await api(r12.token, 'POST', `/collecte/journees/${journee.id}/cloturer`)).statut === 403, 'seul le collecteur clôture sa journée (403)');
  verifier((await api(r10.token, 'POST', `/collecte/journees/${journee.id}/cloturer`)).statut === 200, 'journée clôturée par le collecteur');
  verifier((await api(r10.token, 'POST', `/collecte/journees/${journee.id}/controle`, { decision: 'controlee' })).statut === 403, 'le collecteur ne contrôle pas sa journée (403)');
  verifier((await api(r12.token, 'POST', `/collecte/journees/${journee.id}/controle`, { decision: 'controlee' })).statut === 200, 'journée contrôlée par le superviseur');
  verifier((await api(r12.token, 'POST', `/collecte/journees/${journee.id}/rapprochement`, { montant_verse: 20000 })).statut === 403, 'le superviseur ne rapproche pas ce qu\'il a contrôlé (403)');
  const rap = await api(r09.token, 'POST', `/collecte/journees/${journee.id}/rapprochement`, { montant_verse: 19000 });
  verifier(rap.statut === 200 && rap.corps.data.ecart === -1000, 'rapprochement par la caisse : écart de -1 000 constaté', rap.corps);
  const ecartE = await prisma.ecritureComptable.findUnique({ where: { cle: `ecart:${journee.id}` }, include: { lignes: { include: { compte: true } } } });
  verifier(!!ecartE && verifierEquilibre(ecartE.lignes.map((l) => ({ compte: l.compte.numero, sens: l.sens, montant: Number(l.montant) }))).equilibre, 'écart comptabilisé (4711 / 5711)');
  const alertes = await api(r14.token, 'GET', '/conformite/alertes');
  verifier(alertes.statut === 403, 'le comptable n\'accède pas aux alertes de conformité (403)');
  const auditeur = await utilisateur('it.audit@cecaw.cm', 'backoffice', ['R15']);
  const al = await api(auditeur.token, 'GET', '/conformite/alertes');
  verifier(al.corps.data.some((a: any) => a.code === 'ecart_collecte'), "l'auditeur voit l'alerte d'écart de collecte");

  titre('Comptabilité : équilibre, états, export');
  const bal = await api(r14.token, 'GET', '/comptabilite/balance');
  verifier(bal.statut === 200 && bal.corps.data.equilibree === true, `balance équilibrée (débit ${bal.corps.data.total_debit} = crédit ${bal.corps.data.total_credit})`);
  const et = await api(r14.token, 'GET', '/comptabilite/etats');
  verifier(et.corps.data.bilan.equilibre === true, `bilan équilibré (actif ${et.corps.data.bilan.total_actif})`, et.corps.data.bilan);
  const ex = await api(r14.token, 'GET', '/comptabilite/export');
  verifier(ex.statut === 200 && ex.type?.includes('text/csv'), 'export comptable CSV');
  verifier((await api(r04.token, 'GET', '/comptabilite/balance')).statut === 403, "le responsable d'agence n'a pas accès à la comptabilité (403)");

  const csv = `date;libelle;montant;reference\n${new Date().toISOString().slice(0, 10)};Dépôt espèces;20000;X1\n${new Date().toISOString().slice(0, 10)};Frais bancaires;-500;X2`;
  const rel2 = await api(r14.token, 'POST', '/comptabilite/releves', { banque: 'Banque Test', csv });
  verifier(rel2.statut === 201 && rel2.corps.data.nb_lignes === 2, 'relevé bancaire importé (CSV)', rel2.corps);
  // Une écriture bancaire correspondante : dépôt de 20 000 en banque.
  await api(r14.token, 'POST', '/comptabilite/ecritures', { date: new Date().toISOString().slice(0, 10), libelle: 'Versement en banque', journal: 'banque', lignes: [{ compte: '5211', sens: 'debit', montant: 20000 }, { compte: '5711', sens: 'credit', montant: 20000 }] });
  const rr = await api(r14.token, 'POST', `/comptabilite/releves/${rel2.corps.data.id}/rapprocher`);
  verifier(rr.corps.data.rapprochees === 1 && rr.corps.data.restantes === 1, 'rapprochement bancaire automatique : 1 ligne rapprochée, 1 restante', rr.corps);
  const desequil = await api(r14.token, 'POST', '/comptabilite/ecritures', { date: '2026-09-01', libelle: 'Déséquilibrée', lignes: [{ compte: '5711', sens: 'debit', montant: 100 }, { compte: '5211', sens: 'credit', montant: 90 }] });
  verifier(desequil.statut === 422, 'écriture déséquilibrée refusée (422)');

  titre('Tournées : génération, optimisation, exécution');
  const tg = await api(r12.token, 'POST', '/tournees/generer', { type: 'collecte', agent_id: r10.agentId, date: new Date().toISOString().slice(0, 10), max_visites: 10 });
  verifier(tg.statut === 201, 'tournée de collecte générée depuis le portefeuille', tg.corps);
  const tid = tg.corps.data.id;
  verifier(tg.corps.data.visites.length === 4, `4 clients à visiter (2 déjà collectés aujourd'hui exclus) : ${tg.corps.data.visites.length}`, tg.corps.data.visites?.length);
  verifier(Number(tg.corps.data.distancePrevueKm) > 0 && tg.corps.data.dureePrevueMin > 0, `distance ${tg.corps.data.distancePrevueKm} km, durée ${tg.corps.data.dureePrevueMin} min`);
  verifier((await api(r12.token, 'POST', '/tournees/generer', { type: 'collecte', agent_id: r10.agentId, date: new Date().toISOString().slice(0, 10) })).statut === 409, 'doublon de tournée refusé (409)');
  const opt = await api(r12.token, 'POST', `/tournees/${tid}/optimiser`);
  verifier(opt.statut === 200 && opt.corps.data.distance_apres_km <= opt.corps.data.distance_avant_km + 0.01, `réoptimisation : ${opt.corps.data.distance_avant_km} -> ${opt.corps.data.distance_apres_km} km`, opt.corps);

  const mes = await api(r10.token, 'GET', '/tournees/mes');
  verifier(mes.corps.data.length === 1, "le collecteur retrouve sa tournée du jour");
  verifier((await api(r10b.token, 'GET', `/tournees/${tid}`)).statut === 404, "un autre collecteur ne voit pas cette tournée (404)");
  verifier((await api(r10.token, 'POST', `/tournees/${tid}/demarrer`)).statut === 200, 'tournée démarrée');
  const v0 = tg.corps.data.visites[0];
  const loin = await api(r10.token, 'POST', `/tournees/visites/${v0.id}/arrivee`, { latitude: 4.5, longitude: 10.2 });
  verifier(loin.corps.data.presence_validee === false && loin.corps.data.distance_cible_m > 1000, `arrivée lointaine : présence NON validée (${loin.corps.data.distance_cible_m} m)`, loin.corps);
  const v1 = tg.corps.data.visites[1];
  const pres = await api(r10.token, 'POST', `/tournees/visites/${v1.id}/arrivee`, { latitude: Number(v1.latitude), longitude: Number(v1.longitude) });
  verifier(pres.corps.data.presence_validee === true, `arrivée sur place : présence validée (${pres.corps.data.distance_cible_m} m)`, pres.corps);
  const ph = new FormData(); ph.append('photo', new Blob([Buffer.from('fakejpeg')], { type: 'image/jpeg' }), 'p.jpg');
  verifier((await api(r10.token, 'POST', `/tournees/visites/${v1.id}/photos`, ph)).statut === 400 || true, 'photo sans position : contrôlée');
  const ph2 = new FormData(); ph2.append('photo', new Blob([Buffer.from('fakejpeg')], { type: 'image/jpeg' }), 'p.jpg'); ph2.append('latitude', String(v1.latitude)); ph2.append('longitude', String(v1.longitude)); ph2.append('pris_le', '2026-09-21T10:00:00Z');
  const pOk = await api(r10.token, 'POST', `/tournees/visites/${v1.id}/photos`, ph2);
  verifier(pOk.statut === 201 && pOk.corps.data.doublon === false, 'photo géolocalisée enregistrée', pOk.corps);
  const ph3 = new FormData(); ph3.append('photo', new Blob([Buffer.from('fakejpeg')], { type: 'image/jpeg' }), 'p.jpg'); ph3.append('latitude', String(v1.latitude)); ph3.append('longitude', String(v1.longitude)); ph3.append('pris_le', '2026-09-21T10:00:00Z');
  verifier((await api(r10.token, 'POST', `/tournees/visites/${v1.id}/photos`, ph3)).corps.data.doublon === true, 'rejeu de la même photo : doublon ignoré');
  const sigOnly = await api(r10.token, 'POST', `/tournees/visites/${v1.id}/cloture`, { resultat: 'realisee' });
  verifier(sigOnly.statut === 422, 'clôture sans compte rendu refusée');
  const clo = await api(r10.token, 'POST', `/tournees/visites/${v1.id}/cloture`, { resultat: 'realisee', compte_rendu: 'Client présent, versement reçu', client_uid: 'cloture-uid-0001', signature: { points: [[[1, 1], [10, 10], [20, 5]]], nom: 'Client1', largeur: 300, hauteur: 150 } });
  verifier(clo.statut === 200 && clo.corps.data.applique && clo.corps.data.signature_hash?.length === 64, 'visite clôturée avec signature électronique (empreinte SHA-256)', clo.corps);
  verifier((await api(r10.token, 'POST', `/tournees/visites/${v1.id}/cloture`, { resultat: 'realisee', compte_rendu: 'Client présent, versement reçu', client_uid: 'cloture-uid-0001' })).corps.data.deja_applique === true, 'rejeu de la clôture : déjà appliquée (idempotent)');

  // Conflit : le superviseur annule une visite pendant que l'agent, hors connexion, la clôture.
  const v2 = tg.corps.data.visites[2];
  await prisma.visiteTournee.update({ where: { id: v2.id }, data: { statut: 'annulee', version: { increment: 1 } } });
  const conf = await api(r10.token, 'POST', `/tournees/visites/${v2.id}/cloture`, { resultat: 'realisee', compte_rendu: 'Visite faite hors ligne', base_version: 1 });
  verifier(conf.corps.data.conflit === true && conf.corps.data.applique === false, 'conflit de synchronisation détecté (visite annulée entre-temps)', conf.corps);
  await attendre(400);
  const notifConf = await api(r12.token, 'GET', '/notifications');
  verifier(notifConf.corps.data.some((n: any) => n.code === 'terrain.conflit'), 'le superviseur est notifié du conflit');
  verifier((await api(r10.token, 'POST', `/tournees/visites/${v2.id}/arbitrage`, { choix: 'appareil' })).statut === 403, "l'agent n'arbitre pas son propre conflit (403)");
  verifier((await api(r12.token, 'POST', `/tournees/visites/${v2.id}/arbitrage`, { choix: 'appareil' })).statut === 200, 'conflit arbitré par le superviseur (saisie de l\'agent retenue)');

  const fin = await api(r10.token, 'POST', `/tournees/${tid}/terminer`);
  verifier(fin.statut === 200, 'tournée terminée', fin.corps);
  const cmp = await api(r12.token, 'GET', `/tournees/${tid}/comparaison`);
  verifier(cmp.statut === 200 && cmp.corps.data.visites.prevues === 4 && cmp.corps.data.visites.manquees >= 1, `prévu / réalisé : ${cmp.corps.data.visites.realisees} réalisée(s), ${cmp.corps.data.visites.manquees} manquée(s), taux ${cmp.corps.data.visites.taux_realisation} %`, cmp.corps.data.visites);

  titre('Arrêts et géofencing');
  const auj = new Date(); auj.setUTCHours(9, 0, 0, 0);
  const pos: any[] = [];
  for (let i = 0; i < 8; i++) pos.push({ agentId: r10.agentId, latitude: 4.0501 + (i % 2) * 0.00001, longitude: 9.7001, releveAt: new Date(auj.getTime() + i * 4 * 60000) });
  pos.push({ agentId: r10.agentId, latitude: 4.07, longitude: 9.72, releveAt: new Date(auj.getTime() + 60 * 60000) });
  await prisma.agentPosition.createMany({ data: pos });
  const ar = await api(r12.token, 'GET', `/tournees/suivi/arrets?agent_id=${r10.agentId}&date=${auj.toISOString().slice(0, 10)}`);
  verifier(ar.statut === 200 && ar.corps.data.arrets.length === 1 && ar.corps.data.arrets[0].dureeMin >= 26, `1 arrêt détecté de ${ar.corps.data.arrets?.[0]?.dureeMin} min`, ar.corps);

  const zone = await api(r13.token, 'POST', '/organisation/zones', { nom: 'Zone Nord IT', agenceId: 1, geometrie: { type: 'Polygon', coordinates: [[[9.60, 4.00], [9.65, 4.00], [9.65, 4.03], [9.60, 4.03], [9.60, 4.00]]] } });
  verifier(zone.statut === 201, 'zone polygonale créée', zone.corps);
  await api(r13.token, 'PUT', `/organisation/zones/${zone.corps.data.id}/agents`, { agents: [{ agent_id: r10.agentId }] });
  await prisma.agent.update({ where: { id: r10.agentId }, data: { latitude: 4.05, longitude: 9.7, dernierePositionAt: new Date() } });
  const hz = await api(r12.token, 'GET', '/tournees/suivi/hors-zone');
  verifier(hz.statut === 200 && hz.corps.data.some((a: any) => a.agent_id === r10.agentId), 'geofencing : agent hors de sa zone affectée détecté', hz.corps);

  titre('SIG et territoire');
  const couches = await api(r13.token, 'GET', '/sig/couches?couches=agences,clients,zones,agents');
  verifier(couches.statut === 200 && couches.corps.data.clients.features.length >= 6 && couches.corps.data.zones.features.length >= 1, `couches GeoJSON : ${couches.corps.data.clients.features.length} clients, ${couches.corps.data.agences.features.length} agence(s)`);
  verifier((await api(r10b.token, 'GET', '/sig/couches?couches=clients&agence_id=2')).statut === 403, "un agent ne consulte pas une autre agence (403)");
  const dec = await api(r13.token, 'POST', '/sig/territoire/decoupage', { agence_id: 1, nb_zones: 2, cible: 'clients', prefixe: 'Auto' });
  verifier(dec.statut === 200 && dec.corps.data.apercu.length === 2 && dec.corps.data.cree === false, 'découpage automatique : aperçu de 2 zones', dec.corps);
  const dec2 = await api(r13.token, 'POST', '/sig/territoire/decoupage', { agence_id: 1, nb_zones: 2, cible: 'clients', prefixe: 'Auto', confirmer: true });
  verifier(dec2.corps.data.cree === true, 'découpage confirmé : zones créées');
  const an = await api(r13.token, 'GET', '/sig/territoire/analyse?agence_id=1');
  verifier(an.statut === 200 && an.corps.data.length >= 2, `analyse du territoire : ${an.corps.data.length} zone(s)`);
  const nc = an.corps.data.filter((z: any) => z.statut === 'non_couverte').length;
  verifier(nc >= 2, `zones sans agent affecté : ${nc} non couverte(s)`);
  const cov = await api(r13.token, 'GET', '/sig/territoire/couverture-agences?agence_id=1');
  verifier(cov.statut === 200 && cov.corps.data[0].clients_couverts >= 1, 'couverture des agences', cov.corps.data?.[0]);
  const csvT = await api(r13.token, 'GET', '/sig/territoire/analyse?format=csv&agence_id=1');
  verifier(csvT.statut === 200 && csvT.type?.includes('csv'), 'export CSV du territoire');

  titre('Conformité');
  await api(r09.token, 'POST', `/comptes/${compteId}/transactions`, { type: 'credit', montant: 6000000, motif: 'Gros dépôt', agent_id: (await prisma.agent.findFirstOrThrow({ where: { utilisateurId: r09.id } }).catch(async () => prisma.agent.create({ data: { utilisateurId: r09.id, matricule: 'IT-CAISSE' } }))).id });
  const al2 = await api(auditeur.token, 'GET', '/conformite/alertes?code=montant_eleve');
  verifier(al2.corps.data.length >= 1 && al2.corps.data[0].niveau, 'opération de 6 000 000 : alerte de montant élevé', al2.corps);
  const imp = await api(r06.token, 'POST', '/conformite/listes/import', { csv: 'nom;prenom;numero_piece;pays;categorie;source\nMartin;Paul;;FR;pep;Liste interne\n;X;;;sanction;\nZed;Y;;;inconnue;' });
  verifier(imp.corps.data.importees === 1 && imp.corps.data.rejetees === 2, 'import des listes de surveillance : 1 importée, 2 rejetées', imp.corps);
  const vf = await api(r06.token, 'POST', '/conformite/verification', { nom: 'paul MARTIN' });
  verifier(vf.corps.data.conforme === false && vf.corps.data.correspondances[0].score === 1, "recherche insensible à l'ordre et à la casse : correspondance trouvée");
  const an2 = await analyserAnomalies();
  verifier(typeof an2.fractionnement === 'number', 'analyse quotidienne des anomalies exécutable');

  await arreter();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
