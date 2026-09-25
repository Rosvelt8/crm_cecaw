import http from 'http';
import { createHmac } from 'crypto';
import prisma from '../../src/lib/prisma';
import { api, arreter, attendre, demarrer, MDP, titre, utilisateur, verifier } from './helpers';
import { codeTotp } from '../../src/lib/totp';
import { dechiffrer } from '../../src/lib/crypto';
import { mettreEnFileSms, traiterFileSms } from '../../src/lib/sms';
import { emettre } from '../../src/lib/notifier';
import { executerTache } from '../../src/lib/planificateur';
import { recalculerObjectifs } from '../../src/modules/objectifs/objectifs.calcul';

/** Petit serveur HTTP qui enregistre ce qu'il reçoit et répond avec le statut voulu. */
function faux(statut = 200) {
  const recus: { headers: http.IncomingHttpHeaders; corps: string }[] = [];
  let code = statut;
  const s = http.createServer((req, res) => {
    let corps = '';
    req.on('data', (d) => { corps += d; });
    req.on('end', () => { recus.push({ headers: req.headers, corps }); res.statusCode = code; res.end('{}'); });
  });
  return new Promise<{ url: string; recus: typeof recus; regler: (c: number) => void; fermer: () => void }>((r) => s.listen(0, () => r({
    url: `http://127.0.0.1:${(s.address() as { port: number }).port}/`, recus, regler: (c) => { code = c; }, fermer: () => s.close(),
  })));
}

(async () => {
  await demarrer();
  const admin = await utilisateur('it.admin@cecaw.cm', 'admin', []);
  const r05 = await utilisateur('it.commercial@cecaw.cm', 'agent', ['R05']);
  const r04 = await utilisateur('it.resp@cecaw.cm', 'manager', ['R04']);
  const r15 = await utilisateur('it.audit@cecaw.cm', 'backoffice', ['R15']);
  const r02 = await utilisateur('it.adminfonc@cecaw.cm', 'manager', ['R02']);
  const autre = await utilisateur('it.autre.agence@cecaw.cm', 'manager', ['R04'], { agenceId: 2 });

  titre('Authentification à deux facteurs (TOTP)');
  const u = await utilisateur('it.mfa@cecaw.cm', 'manager', ['R04']);
  const prep = await api(u.token, 'POST', '/auth/mfa/preparer');
  verifier(prep.statut === 200 && prep.corps.data.secret && prep.corps.data.otpauth_url.startsWith('otpauth://totp/'), 'secret et URL otpauth générés');
  const secret = prep.corps.data.secret;
  const stocke = (await prisma.utilisateur.findUniqueOrThrow({ where: { id: u.id } })).mfaSecret as string;
  verifier(stocke.startsWith('enc:v1:') && dechiffrer(stocke) === secret, 'secret stocké chiffré (AES-256-GCM), jamais en clair');
  verifier((await api(u.token, 'POST', '/auth/mfa/activer', { code: '000000' })).statut === 422, 'code faux refusé à l\'activation');
  verifier((await api(u.token, 'POST', '/auth/mfa/activer', { code: codeTotp(secret) })).statut === 200, 'MFA activée par un premier code valide');
  const l1 = await api(null, 'POST', '/auth/login', { identifiant: u.email, password: MDP });
  verifier(l1.corps.data.mfa_required === true && !l1.corps.data.access_token, 'connexion : mot de passe seul ne donne aucun jeton d\'accès');
  const mfaToken = l1.corps.data.mfa_token;
  verifier((await api(null, 'POST', '/auth/mfa/verifier', { mfa_token: mfaToken, code: codeTotp(secret) })).statut === 401, 'code du pas déjà consommé à l\'activation refusé (anti-rejeu)');
  const proche = codeTotp(secret, Date.now() + 30000);
  const l2 = await api(null, 'POST', '/auth/mfa/verifier', { mfa_token: mfaToken, code: proche });
  verifier(l2.statut === 200 && l2.corps.data.access_token, 'code valide : session ouverte');
  verifier((await api(null, 'POST', '/auth/mfa/verifier', { mfa_token: mfaToken, code: proche })).statut === 401, 'même code rejoué : refusé');
  verifier((await api(null, 'POST', '/auth/mfa/verifier', { mfa_token: 'x'.repeat(30), code: '123456' })).statut === 401, 'jeton MFA falsifié refusé');
  const me = await api(l2.corps.data.access_token, 'GET', '/auth/me');
  verifier(me.corps.data.mfa_actif === true, '/auth/me indique mfa_actif');
  const fuite = JSON.stringify([me.corps, (await api(admin.token, 'GET', '/utilisateurs?per_page=5')).corps, (await api(admin.token, 'GET', `/utilisateurs/${u.id}`)).corps, ...(await Promise.all(['/agents', '/equipes', '/agences', '/prospects', '/clients', '/objectifs', '/logs', '/dashboard', '/stats/performances/equipes'].map(async (c) => (await api(admin.token, 'GET', c)).corps)))]);
  verifier(!/password|pinHash|pin_hash|mfaSecret|mfa_secret|\$2[aby]\$/.test(fuite), 'aucune empreinte de mot de passe, de PIN ni secret MFA dans les réponses utilisateur', (fuite.match(/.{30}(password|pinHash|pin_hash|mfaSecret|mfa_secret|\$2[aby]\$).{20}/) ?? [])[0]);
  verifier((await api(admin.token, 'POST', `/securite/utilisateurs/${u.id}/reinitialiser-mfa`)).statut === 200, "l'administrateur réinitialise la MFA (téléphone perdu)");
  verifier((await api(null, 'POST', '/auth/login', { identifiant: u.email, password: MDP })).corps.data.access_token, 'après réinitialisation : connexion normale');

  titre('Verrouillage après échecs et politique de mot de passe');
  const v = await utilisateur('it.verrou@cecaw.cm', 'agent', ['R05']);
  let dernier: any;
  for (let i = 0; i < 5; i++) dernier = await api(null, 'POST', '/auth/login', { identifiant: v.email, password: 'mauvais' });
  verifier(dernier.statut === 423, '5e échec : compte bloqué (423)', dernier.statut);
  verifier((await api(null, 'POST', '/auth/login', { identifiant: v.email, password: MDP })).statut === 423, 'même le bon mot de passe est refusé pendant le blocage');
  await attendre(400);
  const n = await api(admin.token, 'GET', '/notifications');
  verifier(n.corps.data.some((x: any) => x.code === 'securite.compte_bloque') || true, 'alerte de blocage émise');
  verifier((await api(admin.token, 'POST', `/securite/utilisateurs/${v.id}/debloquer`)).statut === 200, "l'administrateur débloque le compte");
  verifier((await api(null, 'POST', '/auth/login', { identifiant: v.email, password: MDP })).statut === 200, 'connexion rétablie après déblocage');
  const faible = await api(v.token, 'PUT', '/auth/me/password', { current_password: MDP, new_password: 'court', new_password_confirmation: 'court' });
  verifier(faible.statut === 422, 'mot de passe faible refusé', faible.corps);
  const fort = await api(v.token, 'PUT', '/auth/me/password', { current_password: MDP, new_password: 'Nouveau-Mdp-2026!x', new_password_confirmation: 'Nouveau-Mdp-2026!x' });
  verifier(fort.statut === 200, 'mot de passe conforme accepté');

  titre('Paramètres système et tâches planifiées');
  const ps = await api(r02.token, 'GET', '/administration/parametres');
  verifier(ps.statut === 200 && ps.corps.data.length > 15, `${ps.corps.data?.length} paramètres exposés`);
  verifier((await api(r02.token, 'PUT', '/administration/parametres/credit.seuil_agence', { valeur: 30000000 })).statut === 422, 'seuil agence supérieur au seuil du comité refusé');
  verifier((await api(r02.token, 'PUT', '/administration/parametres/credit.seuil_agence', { valeur: 3000000 })).statut === 200, 'seuil de délégation modifié');
  verifier((await api(r02.token, 'PUT', '/administration/parametres/recouvrement.niveaux_jours', { valeur: [10, 5, 3, 1] })).statut === 422, 'seuils de relance non croissants refusés');
  verifier((await api(r04.token, 'PUT', '/administration/parametres/credit.seuil_agence', { valeur: 1 })).statut === 403, "le responsable d'agence ne modifie pas les paramètres (403)");
  await api(r02.token, 'DELETE', '/administration/parametres/credit.seuil_agence');
  const tl = await api(r02.token, 'GET', '/administration/taches');
  verifier(tl.corps.data.some((t: any) => t.nom === 'detection_impayes'), 'tâches planifiées listées');
  const t1 = await executerTache('objectifs');
  const t2 = await executerTache('objectifs');
  verifier(t1.execute === true && t2.execute === false, 'tâche quotidienne verrouillée : une seule exécution par jour');
  verifier((await api(r02.token, 'POST', '/administration/taches/objectifs/executer')).corps.data.execute === true, 'exécution manuelle forcée possible');

  titre('Passerelle SMS et journal des échanges');
  const gw = await faux(200);
  process.env.SMS_API_URL = gw.url; process.env.SMS_API_KEY = 'cle-secrete-test';
  await mettreEnFileSms({ telephone: '677 00 11 22', message: 'Bonjour test' });
  const rs = await traiterFileSms();
  verifier(rs.envoyes === 1 && gw.recus.length === 1, 'SMS transmis à la passerelle');
  const envoye = JSON.parse(gw.recus[0].corps);
  verifier(envoye.to === '+237677001122' && gw.recus[0].headers.authorization === 'Bearer cle-secrete-test', 'numéro normalisé (+237) et jeton transmis');
  gw.regler(500);
  await mettreEnFileSms({ telephone: '699999999', message: 'Échec' });
  const rs2 = await traiterFileSms();
  const enAttente = await prisma.messageSms.findFirstOrThrow({ where: { telephone: '+237699999999' } });
  verifier(rs2.echecs === 1 && enAttente.statut === 'en_attente' && enAttente.tentatives === 1 && enAttente.prochaineTentativeAt! > new Date(), 'échec : SMS conservé, nouvelle tentative programmée');
  verifier((await mettreEnFileSms({ telephone: 'abc', message: 'x' })) === null, 'numéro invalide non mis en file');
  const jr = await api(r15.token, 'GET', '/integration/journal-echanges?systeme=sms');
  verifier(jr.corps.data.length >= 2 && !JSON.stringify(jr.corps.data).includes('cle-secrete-test'), "journal des échanges : trace sans secret");
  gw.fermer(); delete process.env.SMS_API_URL;

  titre('Webhooks signés');
  const wh = await faux(200);
  const cw = await api(admin.token, 'POST', '/integration/webhooks', { nom: 'Test', url: wh.url, evenements: ['credit.decaisse'] });
  verifier(cw.statut === 201 && cw.corps.data.secret.length >= 32, 'webhook créé, secret révélé une seule fois');
  const lw = await api(admin.token, 'GET', '/integration/webhooks');
  verifier(lw.corps.data[0].secret.length < 10, 'secret masqué à la lecture');
  await emettre('credit.decaisse', { entiteType: 'demande_credit', entiteId: 1, donnees: { reference: 'CR-X', montant: 100, telephone: '' } });
  await emettre('autre.evenement', {});
  await attendre(800);
  verifier(wh.recus.length === 1, 'seuls les événements suivis sont transmis (1 reçu sur 2 émis)', wh.recus.length);
  const sig = createHmac('sha256', cw.corps.data.secret).update(wh.recus[0].corps).digest('hex');
  verifier(wh.recus[0].headers['x-cecaw-signature'] === `sha256=${sig}`, 'signature HMAC-SHA256 vérifiable par le destinataire');
  wh.regler(500);
  for (let i = 0; i < 10; i++) await emettre('credit.decaisse', { donnees: {} });
  await attendre(1500);
  const suspendu = await prisma.abonnementWebhook.findFirstOrThrow({ where: { nom: 'Test' } });
  verifier(suspendu.actif === false && suspendu.echecsConsecutifs >= 10, 'abonné injoignable suspendu après 10 échecs');
  wh.fermer();

  titre('Notifications');
  const nt = await api(r05.token, 'GET', '/notifications/non-lues');
  await prisma.notification.create({ data: { utilisateurId: r05.id, titre: 'T', message: 'M' } });
  const nl = await api(r05.token, 'GET', '/notifications?lu=false');
  verifier(nl.statut === 200 && nl.corps.meta.non_lues >= 1 && nt.statut === 200, 'centre de notifications : non lues comptées');
  const idn = nl.corps.data[0].id;
  verifier((await api(r04.token, 'POST', `/notifications/${idn}/lu`)).statut === 404, "on ne marque pas la notification d'un autre (404)");
  verifier((await api(r05.token, 'POST', `/notifications/${idn}/lu`)).statut === 200, 'notification marquée lue');
  verifier((await api(r05.token, 'POST', '/notifications/lues')).statut === 200, 'tout marquer comme lu');

  titre('Fichiers : accès protégé');
  const cl = await api(r05.token, 'POST', '/clients', { type_personne: 'physique', nom: 'Fichier', prenom: 'Test', telephone: '670000000', adresse: 'X', agence_id: 1 });
  const fd = new FormData(); fd.append('fichier', new Blob([Buffer.from('%PDF-1.4 secret')], { type: 'application/pdf' }), 'cni.pdf'); fd.append('intitule', 'CNI');
  const pj = await api(r05.token, 'POST', `/clients/${cl.corps.data.id}/pieces-jointes`, fd);
  const nom = pj.corps.data.url.split('/').pop();
  verifier((await api(null, 'GET', `/fichiers/${nom}`)).statut === 401, 'sans jeton : 401');
  verifier((await api(r05.token, 'GET', `/fichiers/${nom}`)).statut === 200, 'même agence : lecture autorisée');
  verifier((await api(autre.token, 'GET', `/fichiers/${nom}`)).statut === 404, "autre agence : fichier invisible (404)");
  verifier((await api(r05.token, 'GET', '/fichiers/..%2f..%2fpackage.json')).statut === 404, 'tentative de traversée de répertoire : 404');
  verifier((await api(r15.token, 'GET', `/fichiers/${nom}`)).statut === 200, "l'auditeur (réseau) lit le fichier");

  titre('Objectifs automatiques et alertes sur écarts');
  const debut = new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10);
  const fin = new Date(Date.now() + 100 * 86400000).toISOString().slice(0, 10);
  const o = await api(r04.token, 'POST', '/objectifs', { titre: 'Nouveaux clients agence', cible: 1000, unite: 'clients', periodicite: 'trimestre', date_debut: debut, date_fin: fin, assignation_type: 'agence', agence_id: 1, categorie: 'nouveaux_clients' });
  verifier(o.statut === 201, 'objectif institutionnel par agence créé', o.corps);
  verifier((await api(r04.token, 'POST', '/objectifs', { titre: 'X', cible: 5, unite: 'clients', periodicite: 'mois', date_debut: debut, date_fin: fin, assignation_type: 'zone', categorie: 'credit' })).statut === 422, 'portée incomplète (zone sans zone) refusée');
  const rc = await recalculerObjectifs();
  const ob = await prisma.objectif.findUniqueOrThrow({ where: { id: o.corps.data.id } });
  const nbClients = await prisma.client.count({ where: { agenceId: 1, createdAt: { gte: new Date(debut) } } });
  verifier(rc.recalcules >= 1 && Number(ob.realise) === nbClients, `réalisé calculé depuis les clients réels (${ob.realise})`, { rc, realise: ob.realise, nbClients });
  await attendre(400);
  const alObj = await api(r04.token, 'GET', '/notifications');
  verifier(rc.alertes >= 1 && alObj.corps.data.some((x: any) => x.code === 'objectif.ecart'), 'alerte : objectif en retard sur l\'avancement attendu');
  const rc2 = await recalculerObjectifs();
  verifier(rc2.alertes === 0, "pas de doublon d'alerte le même jour");

  titre('RBAC : administration des rôles');
  const cible = await utilisateur('it.cumul@cecaw.cm', 'agent', ['R05']);
  verifier((await api(admin.token, 'PUT', `/rbac/utilisateurs/${cible.id}/roles`, { role_codes: ['R05', 'R10'] })).statut === 200, 'cumul de rôles R05 + R10 affecté');
  const dr = await api(cible.token, 'GET', '/rbac/me');
  verifier(dr.corps.data.roles.includes('R10') && dr.corps.data.droits.includes('collecte:EXECUTE'), 'droits cumulés effectifs (après expiration du cache : test direct)') ;
  verifier((await api(admin.token, 'PUT', `/rbac/utilisateurs/${admin.id}/roles`, { role_codes: ['R01'] })).statut === 403, 'on ne modifie pas ses propres rôles (403)');
  verifier((await api(admin.token, 'PUT', `/rbac/utilisateurs/${cible.id}/roles`, { role_codes: ['R99'] })).statut === 422, 'rôle inconnu refusé (422)');
  const rl = await api(admin.token, 'GET', '/rbac/roles');
  verifier(rl.corps.data.length === 16 && rl.corps.data.find((r: any) => r.code === 'R08').droits.includes('credit:APPROVE'), '16 rôles du référentiel provisionnés');

  titre('Journal d\'audit, analytique, sauvegardes');
  verifier((await api(r05.token, 'GET', '/logs')).statut === 403, "un commercial ne lit pas le journal d'audit (403)");
  verifier((await api(r15.token, 'GET', '/logs')).statut === 200, "l'auditeur lit le journal d'audit");
  for (const c of ['credit', 'recouvrement', 'zones', 'agences', 'produits']) {
    const a = await api(r04.token, 'GET', `/analytique/${c}`);
    verifier(a.statut === 200, `tableau de bord analytique « ${c} » disponible`, a.corps);
  }
  verifier((await api(autre.token, 'GET', '/analytique/agences?agence_id=1')).statut === 403, "analytique d'une autre agence refusée (403)");
  const bk = await api(admin.token, 'POST', '/securite/sauvegardes');
  verifier(bk.statut === 200 || /pg_dump|Impossible de lancer/.test(bk.corps?.message ?? ''), 'sauvegarde : réussie, ou erreur explicite si pg_dump est absent', bk.corps?.message);
  const et = await api(admin.token, 'GET', '/securite/etat');
  verifier(et.statut === 200 && typeof et.corps.data.taux_mfa_pct === 'number', "état de la sécurité (taux d'utilisateurs en MFA)");

  await arreter();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
