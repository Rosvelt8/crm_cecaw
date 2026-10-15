import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyserListe, analyserNaissance, analyserRemarques, lireCsv, normaliserIdentifiant } from '../src/modules/screening/ofac.parse';
import { analyserOnu } from '../src/modules/screening/sources/onu';
import { analyserUe, ue } from '../src/modules/screening/sources/ue';
import { analyserLocale } from '../src/modules/screening/sources/locale';
import { masquer } from '../src/modules/screening/sources/http';
import {
  canonPays, classerConfiance, comparerNaissance, comparerPays, formeCanonique, IndexSanctions, indexerNom, motsDuNom, preuveDuNom, proximiteMots, rareteMot,
  seuilNomCourant, similariteNoms, type EntreeIndexable, type Rarete,
} from '../src/modules/screening/matching';

/** Vérifications sans base de données du lecteur de fichiers OFAC et du moteur de rapprochement. Lancer : npx ts-node scripts/verif-ofac.ts */

const FIX = join(__dirname, 'it', 'fixtures', 'ofac');
const lire = (f: string) => readFileSync(join(FIX, f), 'utf-8');
const sim = (a: string, b: string) => similariteNoms(indexerNom(a)!, indexerNom(b)!);

// ── Lecture CSV ─────────────────────────────────────────────────────────────────
{
  const l = lireCsv('1,"A, B",-0- ,"dit ""x""",-0- \r\n\x1a\n2,"multi\nligne",c\n');
  assert.deepEqual(l[0], ['1', 'A, B', '-0-', 'dit "x"', '-0-']);
  assert.equal(l.length, 2, 'la ligne de fin de fichier DOS (0x1a) est ignorée');
  assert.equal(l[1][1], 'multi\nligne', 'un champ entre guillemets peut contenir un saut de ligne');
}

// ── Remarques ───────────────────────────────────────────────────────────────────
{
  assert.deepEqual(analyserNaissance('30 Sep 1973').annees, [1973]);
  assert.equal(analyserNaissance('30 Sep 1973').dates[0].toISOString().slice(0, 10), '1973-09-30');
  assert.deepEqual(analyserNaissance('1959 to 1962').annees, [1959, 1960, 1961, 1962]);
  assert.deepEqual(analyserNaissance('Sep 1973').annees, [1973]);
  assert.equal(analyserNaissance('31 Feb 1970').dates.length, 0, 'une date impossible est rejetée');

  const r = analyserRemarques("DOB 12 Jan 1970; alt. DOB 1971; POB Damas, Syria; nationality Syria; Gender Male; Passport A1234567 (Iran) issued 01 Jan 2010; National ID No. 99-88-77 (Syria); Tax ID No. 123 (Syria); a.k.a. 'Abou Test'; Executive Order 14024 directive; Linked To: ACME.");
  assert.deepEqual(r.annees, [1970, 1971]);
  assert.equal(r.nationalites[0], 'Syria');
  assert.equal(r.lieux[0], 'Damas, Syria');
  assert.deepEqual(r.identifiants.map((i) => [i.type, i.normalise, i.pays]), [['Passport', 'A1234567', 'Iran'], ['National ID', '998877', 'Syria']], 'les numéros trop courts ou décoratifs sont écartés');
  assert.equal(r.alias[0].nom, 'Abou Test');
  assert.equal(normaliserIdentifiant('ab-12 34/56'), 'AB123456');
}

// ── Fichiers de test ─────────────────────────────────────────────────────────────
const { entrees, ignorees } = analyserListe({ principal: lire('SDN.CSV'), alias: lire('ALT.CSV'), adresses: lire('ADD.CSV'), commentaires: lire('SDN_COMMENTS.CSV') });
const cons = analyserListe({ principal: lire('CONS_PRIM.CSV'), alias: lire('CONS_ALT.CSV'), adresses: lire('CONS_ADD.CSV'), commentaires: lire('CONS_COMMENTS.CSV') });
const parNom = (re: RegExp) => entrees.find((e) => re.test(e.nom))!;
{
  assert.equal(entrees.length, 9);
  assert.equal(ignorees, 1, 'le navire est ignoré');
  assert.equal(cons.entrees.length, 3);
  const jo = parNom(/^JO, Yong Chol$/);
  assert.equal(jo.type, 'individu');
  assert.equal(jo.datesNaissance[0].toISOString().slice(0, 10), '1973-09-30');
  assert.ok(jo.pays.includes('korea north'));
  assert.ok(jo.alias.some((a) => a.nom === 'CHO, Yong Chol'));
  const gaz = parNom(/^GAZPROMBANK/);
  assert.equal(gaz.type, 'entite');
  assert.deepEqual(gaz.programmes, ['UKRAINE-EO13662', 'RUSSIA-EO14024'], 'les programmes multiples sont séparés');
  assert.ok(gaz.identifiants.some((i) => i.normalise === '7744001497'));
  assert.ok(gaz.remarques!.length > 1000, 'la suite des remarques (fichier de commentaires) est rattachée');
  const ba = parNom(/^BA'ASYIR/);
  assert.deepEqual(ba.anneesNaissance, [1974, 1977]);
  assert.equal(parNom(/^OREKHOV/).identifiants.filter((i) => i.type === 'Passport').length, 2);
  assert.equal(cons.entrees.find((e) => /^AL-SHANTI/.test(e.nom))!.anneesNaissance[0], 1955);
}
{
  // L'empreinte change quand le contenu change, pas autrement.
  const a = analyserListe({ principal: lire('SDN.CSV'), alias: lire('ALT.CSV'), adresses: lire('ADD.CSV'), commentaires: lire('SDN_COMMENTS.CSV') }).entrees;
  assert.deepEqual(a.map((e) => e.empreinte), entrees.map((e) => e.empreinte), 'analyse déterministe');
  const modifie = analyserListe({ principal: lire('SDN.CSV').replace('DOB 30 Sep 1973', 'DOB 01 Oct 1973'), alias: lire('ALT.CSV'), adresses: lire('ADD.CSV'), commentaires: lire('SDN_COMMENTS.CSV') }).entrees;
  assert.notEqual(modifie.find((e) => /^JO, Yong/.test(e.nom))!.empreinte, parNom(/^JO, Yong Chol$/).empreinte);
  assert.equal(modifie.find((e) => /^OREKHOV/.test(e.nom))!.empreinte, parNom(/^OREKHOV/).empreinte);
}

// ── Mots et noms ─────────────────────────────────────────────────────────────────
{
  assert.deepEqual(motsDuNom("BA'ASYIR, Abdul-Rahim Éric"), ['baasyir', 'abdul', 'rahim', 'eric']);
  assert.equal(formeCanonique('mohammed'), formeCanonique('muhammad'));
  assert.equal(formeCanonique('mahamat'), formeCanonique('muhammad'));
  assert.equal(formeCanonique('hussein'), formeCanonique('husain'));
  assert.ok(proximiteMots('ibrahim', 'rahim') < 0.85, 'un mot ne ressemble pas à sa fin');
  assert.ok(proximiteMots('abdoulaye', 'abdul') < 0.85);
  assert.ok(proximiteMots('sara', 'sarah') >= 0.85, 'faute de frappe sur un mot court');
  assert.ok(proximiteMots('chul', 'chol') >= 0.85);
  assert.ok(proximiteMots('mvondo', 'mvondu') >= 0.85);
  assert.ok(proximiteMots('kyong', 'yong') >= 0.85, 'une lettre de différence est une faute de frappe plausible : à un humain de trancher');
  assert.ok(proximiteMots('hassan', 'hussein') < 0.85, 'deux prénoms distincts');
}
{
  assert.equal(sim('JO, Yong Chol', 'Yong Chol Jo'), 1, "l'ordre des mots est sans effet");
  assert.ok(sim('Yong Chul Jo', 'JO, Yong Chol') > 0.9, 'faute de frappe');
  assert.ok(sim('Mohamed Lumwisa', 'LUMISA, Muhammed') > 0.85, 'translittération');
  assert.ok(sim('Jamileh Abdullah Alshanti', 'AL-SHANTI, Jamileh Abdullah') >= 0.99, 'particule recollée');
  assert.ok(sim('Gazprombank', 'GAZPROMBANK JOINT STOCK COMPANY') >= 0.99, 'mots juridiques sans équivalent ignorés');
  assert.ok(sim('Jean Dupont', 'JO, Yong Chol') < 0.5);
  assert.ok(sim('Yong', 'JO, Yong Chol') < 0.85, 'un nom partiel ne suffit pas');
  assert.ok(sim('Trading Company', 'ABC Trading Company') <= 0.5, 'des mots génériques seuls ne rapprochent pas');
  assert.ok(sim('Ali Mohamed', 'Mohamed Ali Hassan') < 0.85);
}

// ── Indices ─────────────────────────────────────────────────────────────────────
{
  const e = { datesNaissance: [new Date('1973-09-30')], anneesNaissance: [1973] };
  assert.equal(comparerNaissance(new Date('1973-09-30'), e), 'exacte');
  assert.equal(comparerNaissance(new Date('1973-01-02'), e), 'annee');
  assert.equal(comparerNaissance(new Date('1974-01-02'), e), 'proche');
  assert.equal(comparerNaissance(new Date('1990-01-02'), e), 'incompatible');
  assert.equal(comparerNaissance(null, e), 'inconnue');
  assert.equal(comparerNaissance(new Date('1990-01-02'), { datesNaissance: [], anneesNaissance: [] }), 'inconnue');
  assert.equal(canonPays('Camerounaise'), 'cameroon');
  assert.equal(canonPays('Corée du Nord'), 'korea north');
  assert.equal(comparerPays('Corée du Nord', ['korea north', 'syria']), 'concordant');
  assert.equal(comparerPays('Cameroun', ['russia']), 'different');
  assert.equal(comparerPays(null, ['russia']), 'inconnu');
  assert.equal(comparerPays('Indonésie', ['indonesia']), 'concordant', 'graphie française reconnue');
  assert.equal(comparerPays('Atlantide', ['indonesia']), 'inconnu', 'un pays non reconnu n\'est jamais « différent »');
  assert.equal(comparerPays('Cameroun', ['madeupland']), 'inconnu', 'ni lorsque c\'est le pays de la liste qui est inconnu');
  assert.equal(classerConfiance(100, { naissance: 'exacte', pays: 'inconnu', identifiant: false }), 'forte');
  assert.equal(classerConfiance(100, { naissance: 'incompatible', pays: 'inconnu', identifiant: false }), 'faible', 'une date de naissance incompatible abaisse la confiance');
  assert.equal(classerConfiance(97, { naissance: 'inconnue', pays: 'inconnu', identifiant: false }), 'moyenne', 'un nom seul, sans indice, n\'est pas « forte »');
  assert.equal(classerConfiance(87, { naissance: 'inconnue', pays: 'inconnu', identifiant: false }), 'faible');
  assert.equal(classerConfiance(60, { naissance: 'inconnue', pays: 'inconnu', identifiant: true }), 'forte', 'une pièce identique est un indice fort');
  assert.equal(classerConfiance(100, { naissance: 'inconnue', pays: 'concordant', identifiant: false, courant: true }), 'faible', 'nom très courant sans date de naissance');
  assert.equal(classerConfiance(100, { naissance: 'exacte', pays: 'inconnu', identifiant: false, courant: true }), 'forte', 'une date de naissance exacte lève le doute du nom courant');
}

// ── Rareté ───────────────────────────────────────────────────────────────────────
{
  const r: Rarete = { total: 38000, frequences: new Map([['muhammad', 1626], ['yong', 12]]) };
  assert.ok(rareteMot(r, 'muhammad') < 0.5);
  assert.equal(rareteMot(r, 'yong'), 1);
  assert.equal(rareteMot(r, 'inconnu'), 1);
  assert.equal(seuilNomCourant(1), 0.75);
  assert.equal(seuilNomCourant(5), 1.5);
  const q = indexerNom('Ali Muhammad')!, c = indexerNom('MUHAMMAD, Ali')!;
  assert.ok(preuveDuNom(q, c, { total: 38000, frequences: new Map([['muhammad', 1626], ['ali', 767]]) }) < seuilNomCourant(2));
}

// ── Index sur les fichiers de test ─────────────────────────────────────────────────
{
  let id = 1;
  const index = new IndexSanctions([...entrees.map((e) => ({ ...e, liste: 'sdn' })), ...cons.entrees.map((e) => ({ ...e, liste: 'non_sdn' }))].map((e) => ({ ...e, id: id++ } as EntreeIndexable)));
  const cherche = (nom: string, extra: object = {}, type: 'individu' | 'entite' = 'individu') => index.rechercher({ type, noms: [nom], ...extra });

  const exact = cherche('Yong Chol Jo', { dateNaissance: new Date('1973-09-30'), pays: 'Corée du Nord' })[0];
  assert.equal(exact.nom, 'JO, Yong Chol');
  assert.equal(exact.score, 100);
  assert.equal(exact.confiance, 'forte');
  assert.equal(exact.indices.naissance, 'exacte');
  assert.equal(exact.indices.pays, 'concordant');

  const autreNaissance = cherche('Yong Chol Jo', { dateNaissance: new Date('1990-05-05') })[0];
  assert.equal(autreNaissance.confiance, 'faible');
  assert.equal(autreNaissance.indices.naissance, 'incompatible');

  assert.equal(cherche('Veliki Slavian')[0].nom, 'PETROVSKIY, Yan Igorevich', 'rapprochement par alias');
  assert.equal(cherche('Veliki Slavian')[0].via, 'alias');

  const piece = cherche('Jean Dupont', { identifiants: ['756 454-133'] });
  assert.equal(piece.length, 1, 'une pièce identique remonte une inscription au nom différent');
  assert.equal(piece[0].raison, 'identifiant');
  assert.equal(piece[0].indices.identifiant, 'Passport 756454133');
  assert.deepEqual(cherche('Jean Dupont', { identifiants: ['12'] }), [], 'un numéro trop court ne rapproche pas');

  assert.equal(cherche('Gazprombank', {}, 'entite')[0].nom, 'GAZPROMBANK JOINT STOCK COMPANY');
  assert.equal(cherche('Gazprombank').length, 0, 'une personne physique n\'est pas rapprochée d\'une société');
  assert.equal(cherche('CECAW Finance SA', {}, 'entite').length, 0);
  assert.equal(cherche('Marie Ngassa').length, 0);
  assert.equal(cherche('Jamileh Abdullah Alshanti')[0].liste, 'non_sdn', 'les deux listes sont interrogées');
  assert.equal(cherche('Yong Chol Jo', {}, 'individu').filter((c) => c.score >= 99).length, 1);
  assert.deepEqual(cherche('Yong Chol Jo', {}).map((c) => c.entree_id), cherche('Yong Chol Jo', {}).map((c) => c.entree_id), 'résultat déterministe');
  assert.ok(index.rechercher({ type: 'individu', noms: ['Yong Chol Jo'] }, 99).every((c) => c.score >= 99), 'le seuil est respecté');
}

// ── ONU : fichier XML (extrait réel du fichier public) ────────────────────────────
{
  const xml = readFileSync(join(FIX, '..', 'onu', 'consolidated.xml'), 'utf-8');
  const onu = analyserOnu(xml).entrees;
  const ref = (r: string) => onu.find((e) => e.reference === r)!;
  assert.equal(onu.length, 13);
  assert.equal(new Set(onu.map((e) => e.uid)).size, 13, 'identifiants uniques');
  assert.ok(onu.every((e) => e.reference && e.dateInscription && e.programmes.length === 1), 'référence, date d\'inscription et programme présents');
  assert.equal(onu.filter((e) => e.type === 'entite').length, 3);

  const jo = ref('KPi.034');
  assert.equal(jo.nom, 'JO YONG CHOL', 'nom reconstitué (prénoms et nom)');
  assert.equal(jo.datesNaissance[0].toISOString().slice(0, 10), '1973-09-30');
  assert.ok(jo.alias.some((a) => a.nom === 'Cho Yong Chol' && a.type === 'aka'));
  assert.deepEqual(jo.programmes, ['DPRK']);
  const lumisa = ref('CDi.047');
  assert.deepEqual(lumisa.anneesNaissance, [1959, 1960, 1961, 1962, 1963, 1964, 1965], 'plage de naissance (BETWEEN) dépliée');
  assert.ok(lumisa.alias.some((a) => a.nom === 'L. KATO' && a.type === 'faible'), 'alias de qualité « Low » = faible');
  assert.ok(lumisa.alias.some((a) => a.nom === 'LUMISA, MUHAMAD' && a.type === 'aka'));
  const hassan = ref('CDi.040');
  assert.deepEqual(hassan.identifiants.map((i) => i.normalise).sort(), ['AB187304', 'AB850901'], 'plusieurs passeports');
  assert.equal(hassan.datesNaissance[0].toISOString().slice(0, 10), '1997-07-21');
  assert.ok(hassan.anneesNaissance.includes(1993) && hassan.anneesNaissance.includes(1997));
  assert.ok(ref('CDe.001').alias.some((a) => a.type === 'fka'), 'ancien nom d\'une entité');
  assert.equal(ref('QDi.018').anneesNaissance.length, 0, 'sans date de naissance publiée');
  assert.ok(ref('KPi.034').pays.includes('democratic people s republic of korea'));

  assert.throws(() => analyserOnu(xml.slice(0, 5000)), /incomplet/, 'un fichier coupé est refusé');
  assert.throws(() => analyserOnu('<html>erreur</html>'), /incomplet/);
  assert.equal(analyserOnu(xml).entrees[0].empreinte, onu[0].empreinte, 'empreintes déterministes');
  assert.notEqual(analyserOnu(xml.replace('1973-09-30', '1973-10-01')).entrees.find((e) => e.reference === 'KPi.034')!.empreinte, jo.empreinte);

  // Pays : les graphies ONU et OFAC d'un même pays se rejoignent.
  assert.equal(canonPays("Democratic People's Republic of Korea"), canonPays('Korea, North'));
  assert.equal(comparerPays('Corée du Nord', jo.pays), 'concordant');
  assert.equal(canonPays('Russian Federation'), 'russia');

  // Multi-sources : la même personne, listée par l'OFAC et par l'ONU, remonte deux fois.
  let id = 100;
  const tout = [
    ...entrees.map((e) => ({ ...e, liste: 'sdn' })), ...onu.map((e) => ({ ...e, liste: 'onu' })),
  ].map((e) => ({ ...e, id: id++ } as EntreeIndexable));
  const index = new IndexSanctions(tout);
  const trouves = index.rechercher({ type: 'individu', noms: ['Yong Chol Jo'], dateNaissance: new Date('1973-09-30'), pays: 'Corée du Nord' });
  const listes = trouves.filter((c) => c.score === 100).map((c) => c.liste).sort();
  assert.deepEqual(listes, ['onu', 'sdn'], 'une personne listée par deux autorités ressort des deux listes');
  assert.ok(trouves.filter((c) => c.score === 100).every((c) => c.confiance === 'forte' && c.indices.pays === 'concordant'));

  // Alias peu fiable : jamais mieux que « faible ».
  const solo = new IndexSanctions(onu.map((e, i) => ({ ...e, liste: 'onu', id: i + 1 } as EntreeIndexable)));
  const viaAlias = solo.rechercher({ type: 'individu', noms: ['Kato'] });
  assert.equal(viaAlias[0].via, 'alias');
  assert.equal(viaAlias[0].confiance, 'faible', 'un alias de faible fiabilité ne donne jamais plus qu\'une confiance faible');
  const viaNom = solo.rechercher({ type: 'individu', noms: ['Muhammed Lumisa'] });
  assert.equal(viaNom[0].via, 'principal');
  assert.notEqual(viaNom[0].confiance, 'faible');
  assert.equal(solo.rechercher({ type: 'individu', noms: ['Gaston Iyamuremye'], dateNaissance: new Date('1948-03-03') })[0].indices.naissance, 'annee');
}

// ── UE : fichier XML d'exemple (structure documentée, non validée sur le fichier officiel) ───
{
  const xml = readFileSync(join(FIX, '..', 'ue', 'FSF.xml'), 'utf-8');
  const { entrees: ueE, ignorees: ueIgn } = analyserUe(xml);
  assert.equal(ueE.length, 3);
  assert.equal(ueIgn, 1, 'le navire est ignoré');
  const jo = ueE.find((e) => e.uid === 900001)!;
  assert.equal(jo.type, 'individu');
  assert.equal(jo.nom, 'Yong Chol Jo');
  assert.equal(jo.reference, 'EU.9001.01');
  assert.deepEqual(jo.programmes, ['PRK']);
  assert.equal(jo.datesNaissance[0].toISOString().slice(0, 10), '1973-09-30');
  assert.ok(jo.alias.some((a) => a.nom === 'Cho Yong Chol' && a.type === 'faible'), 'alias « strong=false » = faible');
  assert.equal(jo.identifiants[0].normalise, 'PS4455667');
  assert.equal(jo.dateInscription!.toISOString().slice(0, 10), '2017-03-31');
  assert.equal(comparerPays('Corée du Nord', jo.pays), 'concordant', 'la graphie UE du pays rejoint celle de la saisie');
  const ent = ueE.find((e) => e.uid === 900002)!;
  assert.equal(ent.type, 'entite');
  assert.ok(ent.pays.includes('cyprus'));
  const kamga = ueE.find((e) => e.uid === 900003)!;
  assert.equal(kamga.nom, 'Paul Marie Kamga', 'nom reconstitué quand wholeName est vide');
  assert.deepEqual(kamga.anneesNaissance, [1980], 'année seule');
  assert.throws(() => analyserUe(xml.slice(0, 1500)), /incomplet/);
  assert.equal(ue.configuree(), false, 'sans EU_SANCTIONS_URL la source est ignorée');
  process.env.EU_SANCTIONS_URL = 'https://exemple.test/fsf?token=SECRET';
  assert.equal(ue.configuree(), true);
  delete process.env.EU_SANCTIONS_URL;
}

// ── Listes locales (saisie CRM) ───────────────────────────────────────────────────
{
  const json = JSON.stringify([
    { id: 7, nom: 'Test', prenom: 'Anif', dateNaissance: '1975-02-03T00:00:00.000Z', numeroPiece: '112233445', pays: 'Cameroun', alias: ['A. Test', 'Test Anif'], typeEntree: 'individu', categorie: 'sanction', source: 'ANIF — notification 12/2026', motif: 'Gel administratif', createdAt: '2026-10-01T08:00:00.000Z' },
    { id: 8, nom: 'Société Écran SARL', prenom: null, dateNaissance: null, numeroPiece: '123', pays: null, alias: [], typeEntree: 'entite', categorie: 'interne', source: null, motif: null, createdAt: '2026-10-02T08:00:00.000Z' },
  ]);
  const { entrees: loc } = analyserLocale(json);
  assert.equal(loc.length, 2);
  assert.equal(loc[0].nom, 'Anif Test');
  assert.equal(loc[0].reference, 'LOC-7');
  assert.deepEqual(loc[0].programmes, ['sanction']);
  assert.equal(loc[0].datesNaissance[0].toISOString().slice(0, 10), '1975-02-03');
  assert.equal(loc[0].identifiants[0].normalise, '112233445');
  assert.ok(loc[0].pays.includes('cameroon') || loc[0].pays.includes('cameroun'));
  assert.equal(loc[0].remarques, 'ANIF — notification 12/2026 — Gel administratif', 'provenance conservée dans les remarques');
  assert.equal(loc[0].alias.length, 2);
  assert.equal(loc[1].type, 'entite');
  assert.equal(loc[1].identifiants.length, 0, 'un numéro trop court ne sert pas au rapprochement');
}

// ── Masquage des secrets (lien à jeton de l'UE) ─────────────────────────────────────
{
  const lien = 'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=SECRET-ABC-123';
  assert.ok(!masquer(`échec sur ${lien}`).includes('SECRET-ABC-123'), 'le jeton du lien est masqué');
  assert.ok(!masquer('erreur SECRET-ABC-123 inattendue', ['SECRET-ABC-123']).includes('SECRET-ABC-123'), 'un secret connu est masqué où qu\'il apparaisse');
  assert.ok(!masquer('GET https://x.blob.core.windows.net/f.xml?sv=1&sig=Yz%2BSDf&se=2').includes('Yz%2BSDf'), 'la signature temporaire est masquée');
}

console.log('verif-ofac : toutes les vérifications passent.');
