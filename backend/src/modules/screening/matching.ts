import type { AliasSanction, IdentifiantSanction } from './ofac.parse';
import { formePays, normaliserIdentifiant } from './ofac.parse';

/**
 * Rapprochement d'identités avec les listes OFAC.
 *
 * Principe : le rapprochement de NOMS fait remonter des candidats (score 0-100), puis des indices
 * indépendants (date de naissance, pièce d'identité, pays) en précisent la confiance. Le résultat
 * est toujours une *correspondance potentielle* à faire examiner par un humain : aucun score, même
 * de 100, ne vaut confirmation.
 *
 * Nom : les mots sont comparés sans tenir compte de l'ordre (« NOM, Prénom » ou « Prénom NOM »),
 * des accents, de la casse ni de la ponctuation. Chaque mot est apparié au mot le plus proche de
 * l'autre nom (Jaro-Winkler, avec une table de variantes de translittération courantes comme
 * Mohammed/Muhammad). Les mots peu discriminants (formes juridiques, particules : « SARL », « al »,
 * « bin ») pèsent peu. Le score est la moyenne harmonique de la couverture dans les deux sens,
 * si bien qu'un nom plus court ou plus long que l'autre est pénalisé.
 */

// ─── Normalisation ────────────────────────────────────────────────────────────

const FORMES_JURIDIQUES = new Set([
  'sa', 'sarl', 'sas', 'sasu', 'ltd', 'limited', 'llc', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'gmbh', 'jsc',
  'ooo', 'oao', 'zao', 'pjsc', 'ojsc', 'plc', 'ltda', 'srl', 'spa', 'bhd', 'pte', 'pvt', 'llp', 'fze', 'fzco', 'fzc', 'est',
  'establishment', 'group', 'holding', 'holdings', 'trading', 'international', 'general', 'enterprise', 'enterprises', 'the', 'of', 'and', 'for',
  'joint', 'stock', 'public', 'private', 'liability', 'partnership', 'closed', 'open', 'cjsc', 'ao', 'npo', 'cie', 'compagnie', 'societe',
  'groupe', 'sociedad', 'anonima', 'anonyme',
]);
const PARTICULES = new Set([
  'al', 'el', 'ul', 'bin', 'ben', 'bint', 'ibn', 'ould', 'de', 'da', 'do', 'dos', 'del', 'della', 'di', 'du', 'des', 'la', 'le', 'les',
  'van', 'von', 'der', 'den', 'ter', 'ten', 'san',
]);
const POIDS_FAIBLE = 0.25;

const REMPLACEMENTS: [RegExp, string][] = [[/ß/g, 'ss'], [/æ/g, 'ae'], [/œ/g, 'oe'], [/ø/g, 'o'], [/đ/g, 'd'], [/ł/g, 'l'], [/ı/g, 'i']];

/** Mots d'un nom : minuscules, sans accent ni ponctuation, apostrophes recollées (Ba'asyir → baasyir). */
export function motsDuNom(nom: string | null | undefined): string[] {
  let s = (nom ?? '').toLowerCase();
  for (const [re, par] of REMPLACEMENTS) s = s.replace(re, par);
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`´]/g, '').replace(/&/g, ' and ');
  return s.replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t.length > 1);
}

/** Forme « phonétique » d'un mot : regroupe les translittérations usuelles (Mohammed/Muhammad, Hussein/Husain…). */
export function formeCanonique(mot: string): string {
  let s = mot;
  if (/^m(?:o|u|ou|a)h?[ao]m+[ae][dt]$/.test(s)) return 'muhammad';
  if (/^abd(?:ou|u|e|a|o)l+$/.test(s)) return 'abdul';
  if (/^h(?:o|ou|u)ss?(?:ei|ai|ay|e)n$/.test(s)) return 'husain';
  if (/^y(?:o|ou|u)ss?[eu]f$/.test(s)) return 'yusuf';
  if (/^ahm[ae][dt]$/.test(s)) return 'ahmad';
  if (/^(?:o|u|ou)m[ae]r$/.test(s)) return 'umar';
  s = s.replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/q/g, 'k').replace(/w/g, 'v').replace(/kh/g, 'h').replace(/gh/g, 'g')
    .replace(/sch|sh/g, 's').replace(/ou|oo/g, 'u').replace(/ee/g, 'i').replace(/y/g, 'i');
  return s.replace(/(.)\1+/g, '$1');
}

export interface MotIndexe { m: string; c: string; poids: number }
export interface NomIndexe {
  mots: MotIndexe[]; compact: string; poidsTotal: number;
  /** Même nom avec les particules recollées au mot suivant (« al shanti » → « alshanti »), si le nom en contient. */
  fusion: NomIndexe | null;
}

function construireNom(bruts: string[], avecFusion: boolean): NomIndexe {
  const mots = bruts.map((m) => ({ m, c: formeCanonique(m), poids: FORMES_JURIDIQUES.has(m) || PARTICULES.has(m) ? POIDS_FAIBLE : 1 }));
  let fusion: NomIndexe | null = null;
  if (avecFusion && bruts.some((m, i) => PARTICULES.has(m) && i < bruts.length - 1)) {
    const fusionnes: string[] = [];
    for (let i = 0; i < bruts.length; i++) {
      let mot = bruts[i];
      while (PARTICULES.has(bruts[i]) && i < bruts.length - 1) { i++; mot += bruts[i]; }
      fusionnes.push(mot);
    }
    fusion = construireNom(fusionnes, false);
  }
  return { mots, compact: [...bruts].sort().join(''), poidsTotal: mots.reduce((s, x) => s + x.poids, 0), fusion };
}

export function indexerNom(nom: string): NomIndexe | null {
  const bruts = motsDuNom(nom);
  return bruts.length === 0 ? null : construireNom(bruts, true);
}

// ─── Similarité ───────────────────────────────────────────────────────────────

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const portee = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const ma = new Array<boolean>(la).fill(false);
  const mb = new Array<boolean>(lb).fill(false);
  let correspondances = 0;
  for (let i = 0; i < la; i++) {
    const debut = Math.max(0, i - portee), fin = Math.min(lb - 1, i + portee);
    for (let j = debut; j <= fin; j++) {
      if (mb[j] || a[i] !== b[j]) continue;
      ma[i] = mb[j] = true; correspondances++; break;
    }
  }
  if (correspondances === 0) return 0;
  let transpositions = 0, k = 0;
  for (let i = 0; i < la; i++) {
    if (!ma[i]) continue;
    while (!mb[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const jaro = (correspondances / la + correspondances / lb + (correspondances - transpositions / 2) / correspondances) / 3;
  let prefixe = 0;
  while (prefixe < 4 && prefixe < la && prefixe < lb && a[prefixe] === b[prefixe]) prefixe++;
  return jaro > 0.7 ? jaro + prefixe * 0.1 * (1 - jaro) : jaro;
}

/**
 * Proximité de deux mots : moyenne de Jaro-Winkler (tolère les fautes de frappe) et de la distance
 * d'édition (écarte les mots qui ne partagent qu'un début ou une fin, « ibrahim »/« rahim »).
 */
export function proximiteMots(a: string, b: string): number {
  if (a === b) return 1;
  const longueur = Math.max(a.length, b.length);
  const distance = distanceLevenshtein(a, b);
  const moyenne = (jaroWinkler(a, b) + (1 - distance / longueur)) / 2;
  // Mot court avec une seule faute de frappe, même initiale (« Sara »/« Sarah », « Chul »/« Chol ») : la moyenne
  // ci-dessus le sanctionnerait trop (une lettre sur quatre), alors que la faute est vraisemblable.
  return longueur <= 5 && distance === 1 && a[0] === b[0] ? Math.max(moyenne, 0.88) : moyenne;
}

/** Les formes canoniques égales valent 0,97 : une variante de translittération reste moins sûre qu'une identité parfaite. */
export function similariteMot(a: MotIndexe, b: MotIndexe): number {
  if (a.m === b.m) return 1;
  const brute = proximiteMots(a.m, b.m);
  const canon = a.c === b.c ? 0.97 : proximiteMots(a.c, b.c) * 0.97;
  return Math.max(brute, canon);
}

const SEUIL_MOT = 0.85;

function distanceLevenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Similarité de deux noms indexés, de 0 à 1 (meilleure des lectures avec ou sans particules recollées). */
export function similariteNoms(q: NomIndexe, c: NomIndexe): number {
  let meilleur = similariteBase(q, c);
  if (meilleur < 1 && (q.fusion || c.fusion)) {
    meilleur = Math.max(meilleur, similariteBase(q.fusion ?? q, c.fusion ?? c));
    if (q.fusion && c.fusion) meilleur = Math.max(meilleur, similariteBase(q.fusion, c), similariteBase(q, c.fusion));
  }
  return meilleur;
}

function similariteBase(q: NomIndexe, c: NomIndexe): number {
  if (q.compact === c.compact) return 1;
  // Couverture pondérée d'un nom par l'autre. Un mot juridique ou une particule sans équivalent
  // n'est pas compté contre le nom (« Gazprombank » face à « Gazprombank Joint Stock Company »).
  const couverture = (de: MotIndexe[], vers: MotIndexe[]) => {
    let somme = 0, total = 0;
    for (const x of de) {
      let best = 0;
      for (const y of vers) { const s = similariteMot(x, y); if (s > best) best = s; }
      const credit = best >= SEUIL_MOT ? best : 0;
      if (x.poids === 1) { somme += credit; total += 1; } else if (credit > 0) { somme += x.poids * credit; total += x.poids; }
    }
    return total > 0 ? somme / total : 0;
  };
  const rappel = couverture(q.mots, c.mots);
  const precision = couverture(c.mots, q.mots);
  let score = rappel + precision === 0 ? 0 : (2 * rappel * precision) / (rappel + precision);

  // Mots fusionnés ou séparés (« Alshanti » / « Al Shanti ») : comparaison des noms recollés.
  if (q.mots.length !== c.mots.length) {
    const longueur = Math.max(q.compact.length, c.compact.length);
    if (longueur > 0 && Math.abs(q.compact.length - c.compact.length) <= 2) {
      score = Math.max(score, (1 - distanceLevenshtein(q.compact, c.compact) / longueur) * 0.96);
    }
  }
  // Un nom n'est pas rapproché sur ses seuls mots secondaires (« Trading Company »).
  const significatifQ = q.mots.some((x) => x.poids === 1), significatifC = c.mots.some((x) => x.poids === 1);
  if (significatifQ && significatifC) {
    const sQ = q.mots.filter((x) => x.poids === 1), sC = c.mots.filter((x) => x.poids === 1);
    if (!sQ.some((x) => sC.some((y) => similariteMot(x, y) >= SEUIL_MOT))) return Math.min(score, 0.5);
  }
  return Math.min(1, score);
}

// ─── Indices complémentaires ──────────────────────────────────────────────────

export type IndiceNaissance = 'exacte' | 'annee' | 'proche' | 'incompatible' | 'inconnue';
export type IndicePays = 'concordant' | 'different' | 'inconnu';
export type Confiance = 'forte' | 'moyenne' | 'faible';

export function comparerNaissance(sujet: Date | null | undefined, e: { datesNaissance: Date[]; anneesNaissance: number[] }): IndiceNaissance {
  if (!sujet || (e.datesNaissance.length === 0 && e.anneesNaissance.length === 0)) return 'inconnue';
  const jour = sujet.toISOString().slice(0, 10);
  if (e.datesNaissance.some((d) => d.toISOString().slice(0, 10) === jour)) return 'exacte';
  const an = sujet.getUTCFullYear();
  if (e.anneesNaissance.includes(an)) return 'annee';
  if (e.anneesNaissance.some((y) => Math.abs(y - an) === 1)) return 'proche';
  return 'incompatible';
}

/** Pays/nationalités courants (français et anglais, noms et gentilés) vers la forme employée par l'OFAC. */
const PAYS: [string, string[]][] = [
  ['cameroon', ['cameroun', 'camerounais', 'camerounaise', 'cameroonian']],
  ['nigeria', ['nigerian', 'nigeriane', 'nigerien nigeria']],
  ['niger', ['nigerien', 'nigerienne']],
  ['chad', ['tchad', 'tchadien', 'tchadienne', 'chadian']],
  ['central african republic', ['centrafrique', 'republique centrafricaine', 'centrafricain', 'centrafricaine']],
  ['gabon', ['gabonais', 'gabonaise', 'gabonese']],
  ['equatorial guinea', ['guinee equatoriale', 'equatoguineen']],
  ['congo republic of the', ['congo brazzaville', 'republic of the congo', 'congolais brazzaville']],
  ['congo democratic republic of the', ['rdc', 'republique democratique du congo', 'congo kinshasa', 'drc', 'democratic republic of the congo', 'congolais']],
  ['cote d ivoire', ['cote divoire', 'ivory coast', 'ivoirien', 'ivoirienne', 'cote d ivoire republic of']],
  ['senegal', ['senegalais', 'senegalaise', 'senegalese']],
  ['mali', ['malien', 'malienne', 'malian']],
  ['burkina faso', ['burkinabe', 'burkina']],
  ['ghana', ['ghaneen', 'ghaneenne', 'ghanaian']],
  ['togo', ['togolais', 'togolaise', 'togolese']],
  ['benin', ['beninois', 'beninoise']],
  ['guinea', ['guinee', 'guineen', 'guineenne']],
  ['sierra leone', ['sierra leonais']],
  ['liberia', ['liberien', 'liberienne']],
  ['mauritania', ['mauritanie', 'mauritanien', 'mauritanienne']],
  ['morocco', ['maroc', 'marocain', 'marocaine']],
  ['algeria', ['algerie', 'algerien', 'algerienne']],
  ['tunisia', ['tunisie', 'tunisien', 'tunisienne']],
  ['libya', ['libye', 'libyen', 'libyenne', 'libyan arab jamahiriya']],
  ['egypt', ['egypte', 'egyptien', 'egyptienne']],
  ['sudan', ['soudan', 'soudanais', 'soudanaise']],
  ['south sudan', ['soudan du sud']],
  ['somalia', ['somalie', 'somalien', 'somalienne']],
  ['ethiopia', ['ethiopie', 'ethiopien', 'ethiopienne']],
  ['eritrea', ['erythree', 'erythreen']],
  ['kenya', ['kenyan', 'kenyane']],
  ['uganda', ['ouganda', 'ougandais']],
  ['rwanda', ['rwandais', 'rwandaise']],
  ['burundi', ['burundais']],
  ['tanzania', ['tanzanie', 'tanzanien', 'united republic of tanzania', 'tanzania united republic of']],
  ['zimbabwe', ['zimbabween']],
  ['south africa', ['afrique du sud', 'sud africain']],
  ['angola', ['angolais']],
  ['mozambique', ['mozambicain']],
  ['madagascar', ['malgache']],
  ['france', ['francais', 'francaise', 'french']],
  ['united kingdom', ['royaume uni', 'uk', 'britannique', 'british', 'angleterre', 'united kingdom of great britain and northern ireland']],
  ['germany', ['allemagne', 'allemand', 'allemande']],
  ['belgium', ['belgique', 'belge']],
  ['switzerland', ['suisse']],
  ['italy', ['italie', 'italien', 'italienne']],
  ['spain', ['espagne', 'espagnol', 'espagnole']],
  ['portugal', ['portugais']],
  ['russia', ['russie', 'russe', 'russian', 'russian federation']],
  ['ukraine', ['ukrainien', 'ukrainienne']],
  ['belarus', ['bielorussie', 'bielorusse']],
  ['china', ['chine', 'chinois', 'chinoise', 'chinese']],
  ['india', ['inde', 'indien', 'indienne']],
  ['pakistan', ['pakistanais']],
  ['afghanistan', ['afghan', 'afghane']],
  ['iran', ['iranien', 'iranienne', 'iran islamic republic of', 'islamic republic of iran']],
  ['iraq', ['irak', 'irakien', 'irakienne']],
  ['syria', ['syrie', 'syrien', 'syrienne', 'syrian arab republic']],
  ['lebanon', ['liban', 'libanais', 'libanaise']],
  ['yemen', ['yemen', 'yemenite']],
  ['saudi arabia', ['arabie saoudite', 'saoudien']],
  ['united arab emirates', ['emirats arabes unis', 'eau', 'uae', 'dubai']],
  ['turkey', ['turquie', 'turc', 'turque']],
  ['korea north', ['coree du nord', 'north korea', 'democratic people s republic of korea', 'korea democratic people s republic of', 'dprk']],
  ['korea south', ['coree du sud', 'south korea', 'republic of korea', 'korea republic of']],
  ['venezuela', ['venezuelien', 'bolivarian republic of venezuela', 'venezuela bolivarian republic of']],
  ['cuba', ['cubain', 'cubaine']],
  ['nicaragua', ['nicaraguayen']],
  ['mexico', ['mexique', 'mexicain', 'mexicaine']],
  ['colombia', ['colombie', 'colombien']],
  ['burma', ['myanmar', 'birmanie', 'birman', 'union of myanmar']],
  ['united states', ['etats unis', 'usa', 'us', 'americain', 'americaine', 'american', 'united states of america']],
  ['canada', ['canadien', 'canadienne']],
  ['haiti', ['haitien', 'haitienne']],
  ['indonesia', ['indonesie', 'indonesien', 'indonesienne', 'indonesian']],
  ['philippines', ['philippin', 'philippine', 'philippines']],
  ['malaysia', ['malaisie', 'malaisien', 'malaysian']],
  ['thailand', ['thailande', 'thailandais']],
  ['bangladesh', ['bangladais']],
  ['sri lanka', ['sri lankais']],
  ['nepal', ['nepalais']],
  ['kazakhstan', ['kazakh']],
  ['uzbekistan', ['ouzbekistan', 'ouzbek']],
  ['tajikistan', ['tadjikistan', 'tadjik']],
  ['azerbaijan', ['azerbaidjan', 'azeri']],
  ['armenia', ['armenie', 'armenien']],
  ['jordan', ['jordanie', 'jordanien']],
  ['kuwait', ['koweit', 'koweitien']],
  ['qatar', ['qatari']],
  ['israel', ['israelien']],
  ['greece', ['grece', 'grec']],
  ['netherlands', ['pays bas', 'neerlandais', 'dutch', 'holland']],
  ['sweden', ['suede', 'suedois']],
  ['cyprus', ['chypre', 'chypriote']],
  ['japan', ['japon', 'japonais']],
  ['brazil', ['bresil', 'bresilien']],
  ['argentina', ['argentine', 'argentin']],
  ['peru', ['perou', 'peruvien']],
  ['ecuador', ['equateur', 'equatorien']],
  ['djibouti', ['djiboutien']],
  ['comoros', ['comores', 'comorien']],
  ['congo republic of the', ['republic of the congo']],
];
const CANON_PAYS = new Map<string, string>();
for (const [canon, variantes] of PAYS) { CANON_PAYS.set(canon, canon); variantes.forEach((v) => CANON_PAYS.set(v, canon)); }

/** Forme comparable d'un pays ou d'une nationalité saisie (« Camerounaise » → « cameroon »). Inconnu → forme brute. */
export function canonPays(saisie: string | null | undefined): string | null {
  const f = formePays(saisie ?? '');
  if (!f) return null;
  return CANON_PAYS.get(f) ?? f;
}

const PAYS_CONNUS = new Set(CANON_PAYS.values());

/**
 * « Différent » n'est affirmé que si les deux côtés sont des pays reconnus : une graphie inconnue
 * (« Indonésie » absent de la table) ne doit jamais passer pour un pays différent, ce qui rassurerait à tort.
 */
export function comparerPays(sujet: string | null | undefined, paysEntree: string[]): IndicePays {
  const s = canonPays(sujet);
  if (!s || paysEntree.length === 0) return 'inconnu';
  const canons = paysEntree.map((p) => CANON_PAYS.get(p) ?? p);
  if (canons.includes(s)) return 'concordant';
  return PAYS_CONNUS.has(s) && canons.every((c) => PAYS_CONNUS.has(c)) ? 'different' : 'inconnu';
}

export function classerConfiance(score: number, ind: { naissance: IndiceNaissance; pays: IndicePays; identifiant: boolean; courant?: boolean }): Confiance {
  if (ind.identifiant) return 'forte';
  let niveau = score >= 90 ? 1 : 0;
  const corrobore = ind.naissance === 'exacte' || ind.naissance === 'annee' || (ind.pays === 'concordant' && score >= 95);
  if (score >= 95 && corrobore) niveau = 2;
  else if (score >= 95) niveau = Math.max(niveau, 1);
  if (ind.naissance === 'exacte' && score >= 90) niveau = 2;
  // Une date de naissance incompatible est l'indice d'écartement le plus fort, sans suffire à clore seul.
  if (ind.naissance === 'incompatible') niveau = Math.max(0, niveau - 1);
  // Un nom fait de mots très répandus dans les listes (« Ibrahim Mohamed ») sans autre indice ne désigne personne en particulier.
  if (ind.courant && ind.naissance !== 'exacte' && ind.naissance !== 'annee') niveau = 0;
  return (['faible', 'moyenne', 'forte'] as const)[niveau];
}

// ─── Rareté des mots ──────────────────────────────────────────────────────────

/** Fréquence des mots (forme canonique) dans l'ensemble des noms des listes. */
export interface Rarete { total: number; frequences: Map<string, number> }

/** Rareté d'un mot, de 0 (omniprésent : « muhammad ») à 1 (quelques occurrences ou moins). */
export function rareteMot(r: Rarete, canonique: string): number {
  const df = r.frequences.get(canonique) ?? 1;
  return Math.min(1, Math.log(r.total / df) / Math.log(r.total / 20));
}

/** En deçà, le nom rapproché est trop banal pour désigner une personne précise (plafond pour les noms longs). */
export const PREUVE_NOM_COURANT = 1.5;
/** Seuil applicable à un nom contrôlé de `n` mots significatifs : un nom d'un seul mot rare suffit. */
export const seuilNomCourant = (n: number) => Math.min(PREUVE_NOM_COURANT, 0.75 * Math.max(1, n));

/** Somme de la rareté des mots significatifs du nom contrôlé retrouvés dans le nom de la liste. */
export function preuveDuNom(q: NomIndexe, c: NomIndexe, r: Rarete): number {
  const retrouves = (x: NomIndexe, y: NomIndexe) => {
    let preuve = 0;
    for (const m of x.mots) {
      if (m.poids !== 1) continue;
      let meilleur: MotIndexe | null = null, best = 0;
      for (const o of y.mots) { const s = similariteMot(m, o); if (s > best) { best = s; meilleur = o; } }
      if (meilleur && best >= SEUIL_MOT) preuve += rareteMot(r, meilleur.c);
    }
    return preuve;
  };
  return Math.max(retrouves(q, c), q.fusion || c.fusion ? retrouves(q.fusion ?? q, c.fusion ?? c) : 0);
}

// ─── Index ────────────────────────────────────────────────────────────────────

export interface EntreeIndexable {
  id: number; liste: string; uid: number; type: 'individu' | 'entite'; nom: string; programmes: string[]; titre?: string | null;
  /** Référence lisible de la source (ex. « QDi.217 »). */
  reference?: string | null;
  naissances: string[]; datesNaissance: Date[]; anneesNaissance: number[]; nationalites: string[]; pays: string[];
  identifiants: IdentifiantSanction[]; alias: AliasSanction[]; empreinte: string; remarques?: string | null;
}

export interface SujetRecherche {
  type: 'individu' | 'entite';
  /** Nom principal puis variantes (alias, nom d'usage). */
  noms: string[];
  dateNaissance?: Date | null;
  pays?: string | null;
  /** Numéros de pièces (CNI, passeport, NUI, RCCM…). */
  identifiants?: (string | null | undefined)[];
}

export interface Correspondance {
  entree_id: number; liste: string; uid: number; reference: string | null; type: 'individu' | 'entite'; nom: string; programmes: string[];
  score: number; confiance: Confiance; raison: 'nom' | 'identifiant';
  /** Nom de l'inscription effectivement rapproché (principal ou alias). */
  nom_rapproche: string; via: 'principal' | 'alias'; type_alias: string | null; nom_controle: string;
  indices: { naissance: IndiceNaissance; pays: IndicePays; identifiant: string | null };
  /** Vrai si le rapprochement ne repose que sur des mots très répandus dans les listes. */
  nom_courant: boolean;
  naissances: string[]; nationalites: string[]; pays: string[]; identifiants: { type: string; valeur: string; pays: string | null }[];
  titre: string | null; extrait_remarques: string | null; empreinte_entree: string;
}

interface NomEntree { entree: number; nom: string; idx: NomIndexe; via: 'principal' | 'alias'; typeAlias: string | null }

export class IndexSanctions {
  readonly entrees: EntreeIndexable[];
  private noms: NomEntree[] = [];
  private parMot = new Map<string, number[]>();
  private parLongueur = new Map<number, string[]>();
  private parCompact = new Map<string, number[]>();
  private parIdentifiant = new Map<string, { entree: number; ident: IdentifiantSanction }[]>();

  readonly rarete: Rarete;

  /** `rarete` : statistiques de l'index complet, à fournir pour un index partiel (sinon calculées sur `entrees`). */
  constructor(entrees: EntreeIndexable[], rarete?: Rarete) {
    this.entrees = entrees;
    entrees.forEach((e, i) => {
      const ajouter = (nom: string, via: 'principal' | 'alias', typeAlias: string | null) => {
        const idx = indexerNom(nom);
        if (!idx) return;
        const n = this.noms.push({ entree: i, nom, idx, via, typeAlias }) - 1;
        const vus = new Set<string>();
        for (const m of [...idx.mots, ...(idx.fusion?.mots ?? [])]) {
          if (vus.has(m.m)) continue;
          vus.add(m.m);
          const liste = this.parMot.get(m.m);
          if (liste) liste.push(n);
          else {
            this.parMot.set(m.m, [n]);
            const bucket = this.parLongueur.get(m.m.length);
            if (bucket) bucket.push(m.m); else this.parLongueur.set(m.m.length, [m.m]);
          }
        }
        (this.parCompact.get(idx.compact) ?? this.parCompact.set(idx.compact, []).get(idx.compact)!).push(n);
      };
      ajouter(e.nom, 'principal', null);
      e.alias.forEach((a) => ajouter(a.nom, 'alias', a.type));
      e.identifiants.forEach((ident) => (this.parIdentifiant.get(ident.normalise) ?? this.parIdentifiant.set(ident.normalise, []).get(ident.normalise)!).push({ entree: i, ident }));
    });
    if (rarete) this.rarete = rarete;
    else {
      const frequences = new Map<string, number>();
      for (const n of this.noms) for (const c of new Set(n.idx.mots.filter((m) => m.poids === 1).map((m) => m.c))) frequences.set(c, (frequences.get(c) ?? 0) + 1);
      this.rarete = { total: Math.max(this.noms.length, 100), frequences };
    }
  }

  get taille() { return this.entrees.length; }

  /** Indices des noms de l'index susceptibles de ressembler à `q` (au moins un mot significatif proche). */
  private candidats(q: NomIndexe): Set<number> {
    const res = new Set<number>();
    const tous = [...q.mots, ...(q.fusion?.mots ?? [])];
    const significatifs = tous.some((m) => m.poids === 1) ? tous.filter((m) => m.poids === 1) : tous;
    for (const mot of significatifs) {
      const L = mot.m.length;
      const marge = Math.max(1, Math.ceil(L * 0.3));
      for (let l = L - marge; l <= L + marge; l++) {
        for (const v of this.parLongueur.get(l) ?? []) {
          if (v === mot.m || jaroWinkler(mot.m, v) >= SEUIL_MOT || jaroWinkler(mot.c, formeCanonique(v)) >= SEUIL_MOT) {
            for (const n of this.parMot.get(v) ?? []) res.add(n);
          }
        }
      }
    }
    for (const n of this.parCompact.get(q.compact) ?? []) res.add(n);
    return res;
  }

  rechercher(sujet: SujetRecherche, seuil = 85): Correspondance[] {
    const requetes = sujet.noms.map((n) => ({ nom: n, idx: indexerNom(n) })).filter((x): x is { nom: string; idx: NomIndexe } => x.idx !== null);

    // 1. Meilleur rapprochement de nom par inscription (principal ou alias), au-dessus du seuil.
    interface Rapproche { score: number; cible: NomEntree; controle: string }
    const parNom = new Map<number, Rapproche>();
    for (const r of requetes) {
      for (const n of this.candidats(r.idx)) {
        const cible = this.noms[n];
        if (this.entrees[cible.entree].type !== sujet.type) continue;
        const score = similariteNoms(r.idx, cible.idx) * 100;
        if (score >= seuil && score > (parNom.get(cible.entree)?.score ?? 0)) parNom.set(cible.entree, { score, cible, controle: r.nom });
      }
    }

    // 2. Pièces d'identité identiques : une inscription est retenue même si son nom ressemble peu.
    const parPiece = new Map<number, IdentifiantSanction>();
    for (const brut of sujet.identifiants ?? []) {
      const n = normaliserIdentifiant(brut ?? '');
      if (n.length < 6) continue;
      for (const { entree, ident } of this.parIdentifiant.get(n) ?? []) {
        if (this.entrees[entree].type === sujet.type) parPiece.set(entree, ident);
      }
    }
    for (const entree of parPiece.keys()) {
      if (parNom.has(entree)) continue;
      let meilleur: Rapproche | null = null;
      for (const r of requetes) {
        for (const cible of this.noms) {
          if (cible.entree !== entree) continue;
          const score = similariteNoms(r.idx, cible.idx) * 100;
          if (!meilleur || score > meilleur.score) meilleur = { score, cible, controle: r.nom };
        }
      }
      if (meilleur) parNom.set(entree, meilleur);
    }

    const resultats: Correspondance[] = [];
    for (const [i, m] of parNom) {
      const e = this.entrees[i];
      const identifiant = parPiece.get(i) ?? null;
      const indices = {
        naissance: e.type === 'individu' ? comparerNaissance(sujet.dateNaissance, e) : ('inconnue' as IndiceNaissance),
        pays: comparerPays(sujet.pays, e.pays),
        identifiant: identifiant ? `${identifiant.type} ${identifiant.valeur}` : null,
      };
      const score = Math.round(m.score);
      const raison: Correspondance['raison'] = identifiant && m.score < seuil ? 'identifiant' : 'nom';
      const requete = requetes.find((r) => r.nom === m.controle)!;
      const nomCourant = preuveDuNom(requete.idx, m.cible.idx, this.rarete) < seuilNomCourant(requete.idx.mots.filter((x) => x.poids === 1).length);
      let confiance = classerConfiance(score, { naissance: indices.naissance, pays: indices.pays, identifiant: identifiant !== null, courant: nomCourant });
      // Une pièce concordante sans nom proche doit être vérifiée, mais ne vaut pas à elle seule une forte confiance.
      if (raison === 'identifiant' && score < 60) confiance = 'moyenne';
      // Rapprochement obtenu sur un alias que la source juge peu fiable : jamais mieux que « faible » (sauf pièce identique).
      if (m.cible.typeAlias === 'faible' && !identifiant) confiance = 'faible';
      resultats.push({
        entree_id: e.id, liste: e.liste, uid: e.uid, reference: e.reference ?? null, type: e.type, nom: e.nom, programmes: e.programmes,
        score, confiance, raison, nom_rapproche: m.cible.nom, via: m.cible.via, type_alias: m.cible.typeAlias, nom_controle: m.controle,
        indices, nom_courant: nomCourant, naissances: e.naissances, nationalites: e.nationalites, pays: e.pays,
        identifiants: e.identifiants.map((x) => ({ type: x.type, valeur: x.valeur, pays: x.pays })),
        titre: e.titre ?? null, extrait_remarques: e.remarques ? e.remarques.slice(0, 500) : null, empreinte_entree: e.empreinte,
      });
    }
    const RANG = { forte: 2, moyenne: 1, faible: 0 };
    return resultats.sort((a, b) => RANG[b.confiance] - RANG[a.confiance] || b.score - a.score).slice(0, 25);
  }
}
