import { createHash } from 'crypto';

/**
 * Lecture des fichiers publiés par l'OFAC (Sanctions List Service) et extraction des champs
 * exploitables pour le rapprochement. Aucune dépendance à la base : testable seul.
 *
 * Les fichiers CSV historiques n'ont pas d'en-tête, marquent « vide » par `-0-` et enfouissent
 * date de naissance, nationalité, pièces d'identité et alias dans la colonne « remarques ». Ces
 * remarques suivent un format régulier (segments séparés par « ; ») que l'on analyse ici ; ce
 * qui n'est pas reconnu est conservé tel quel dans `remarques` pour l'œil du vérificateur.
 *
 * Colonnes (SDN.CSV et CONS_PRIM.CSV) : ent_num, nom, type, programme, titre, indicatif, type de
 * navire, tonnage, jauge, pavillon, armateur, remarques.
 * ALT.CSV : ent_num, alt_num, type d'alias, nom, remarques.
 * ADD.CSV : ent_num, add_num, adresse, ville/code postal, pays, remarques.
 * SDN_COMMENTS.CSV : ent_num, suite des remarques (la colonne principale est tronquée à 1000 caractères).
 */

export interface IdentifiantSanction { type: string; valeur: string; normalise: string; pays: string | null }
/** `faible` : alias que la source qualifie de peu fiable (ONU, qualité « Low » ; UE, alias non « strong »). */
export interface AliasSanction { nom: string; type: 'aka' | 'fka' | 'nka' | 'faible' }

export interface EntreeAnalysee {
  uid: number;
  type: 'individu' | 'entite';
  nom: string;
  programmes: string[];
  titre: string | null;
  naissances: string[];
  datesNaissance: Date[];
  anneesNaissance: number[];
  lieuxNaissance: string[];
  nationalites: string[];
  pays: string[];
  identifiants: IdentifiantSanction[];
  alias: AliasSanction[];
  remarques: string | null;
  empreinte: string;
  /** Référence lisible de la source (ONU « QDi.123 », UE…). Absente pour l'OFAC. */
  reference?: string | null;
  dateInscription?: Date | null;
}

export interface FichiersListe { principal: string; alias: string; adresses: string; commentaires: string }

// ─── CSV ──────────────────────────────────────────────────────────────────────

/** Lecteur CSV minimal (guillemets, guillemets doublés, sauts de ligne dans un champ). */
export function lireCsv(texte: string): string[][] {
  const lignes: string[][] = [];
  let champ = '';
  let ligne: string[] = [];
  let entreGuillemets = false;
  let champQuote = false;
  const fermerChamp = () => { ligne.push(champQuote ? champ : champ.trim()); champ = ''; champQuote = false; };
  const fermerLigne = () => {
    fermerChamp();
    // Ligne vide ou caractère de fin de fichier DOS (0x1a) : ignorée.
    if (!(ligne.length === 1 && (ligne[0] === '' || ligne[0] === '\x1a'))) lignes.push(ligne);
    ligne = [];
  };
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') { champ += '"'; i++; } else entreGuillemets = false;
      } else champ += c;
    } else if (c === '"' && champ.trim() === '') { entreGuillemets = true; champQuote = true; champ = ''; }
    else if (c === ',') fermerChamp();
    else if (c === '\n') fermerLigne();
    else if (c === '\r') { /* géré avec \n */ }
    else champ += c;
  }
  if (champ !== '' || ligne.length > 0) fermerLigne();
  return lignes;
}

/** `-0-` est le marqueur « vide » de l'OFAC. */
export const valeur = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' || t === '-0-' ? null : t;
};

// ─── Analyse des remarques ────────────────────────────────────────────────────

const MOIS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Dates complètes et années d'une valeur « DOB » : `30 Sep 1973`, `Sep 1973`, `1959`, `1959 to 1965`, `circa 1960`. */
export function analyserNaissance(brut: string): { dates: Date[]; annees: number[] } {
  const dates: Date[] = [];
  const annees = new Set<number>();
  const texte = brut.replace(/\.$/, '');
  for (const m of texte.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})\b/g)) {
    const mois = MOIS[m[2].toLowerCase()];
    if (mois === undefined) continue;
    const d = new Date(Date.UTC(Number(m[3]), mois, Number(m[1])));
    if (d.getUTCDate() === Number(m[1])) { dates.push(d); annees.add(Number(m[3])); }
  }
  const plage = texte.match(/\b(\d{4})\s+to\s+(\d{4})\b/i);
  if (plage) {
    const [a, b] = [Number(plage[1]), Number(plage[2])];
    if (b >= a && b - a <= 30) for (let y = a; y <= b; y++) annees.add(y);
  }
  for (const m of texte.matchAll(/\b(1[89]\d{2}|20\d{2})\b/g)) annees.add(Number(m[1]));
  return { dates, annees: [...annees].sort((x, y) => x - y) };
}

const SEGMENTS_IGNORES = /^(?:alt\.\s*)?(?:Linked To|Listing Date|Effective Date|Executive Order|Secondary sanctions risk|Transactions Prohibited|Organization Established Date|Organization Type|Target Type|Gender|Vessel|Aircraft|MMSI|Identification Number IMO|IMO|Call Sign|Website|Email Address|Phone Number|Fax|Telephone|Additional Sanctions Information|For more information|Digital Currency Address|SWIFT|BIC|Other Vessel|Former Vessel|Registration Date)/i;
const LIBELLE_IDENTIFIANT = /^(?:alt\.\s*)?([A-Za-z][A-Za-z'’\-. ]*?(?:\s*\([A-Za-z.' ]+\))?)\s+(?:No\.\s+)?([A-Za-z0-9][A-Za-z0-9\-/.]*\d[A-Za-z0-9\-/.]*)(?:\s+\(([^)]+)\))?(?:\s+(?:issued|expires|expired)\b.*)?\.?$/;

/** Retire accents/ponctuation d'un numéro de pièce pour comparer `AB-123 456` et `ab123456`. */
export const normaliserIdentifiant = (v: string) => v.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

export interface RemarquesAnalysees {
  naissances: string[]; dates: Date[]; annees: number[]; lieux: string[]; nationalites: string[];
  identifiants: IdentifiantSanction[]; alias: AliasSanction[];
}

export function analyserRemarques(remarques: string | null): RemarquesAnalysees {
  const r: RemarquesAnalysees = { naissances: [], dates: [], annees: [], lieux: [], nationalites: [], identifiants: [], alias: [] };
  if (!remarques) return r;
  const annees = new Set<number>();
  for (const brut of remarques.split(';')) {
    const seg = brut.trim();
    if (!seg) continue;
    let m: RegExpMatchArray | null;
    if ((m = seg.match(/^(?:alt\.\s*)?DOB\s+(.+)$/i))) {
      const n = analyserNaissance(m[1]);
      r.naissances.push(m[1].replace(/\.$/, '').trim());
      r.dates.push(...n.dates);
      n.annees.forEach((a) => annees.add(a));
    } else if ((m = seg.match(/^(?:alt\.\s*)?POB\s+(.+)$/i))) r.lieux.push(m[1].replace(/\.$/, '').trim());
    else if ((m = seg.match(/^(?:alt\.\s*)?(?:nationality|citizen)\s+(.+)$/i))) r.nationalites.push(m[1].replace(/\.$/, '').trim());
    else if ((m = seg.match(/^(a|f|n)\.k\.a\.\s+['"‘’“”]?(.+?)['"‘’“”]?\.?$/i))) {
      r.alias.push({ nom: m[2].trim(), type: `${m[1].toLowerCase()}ka` as AliasSanction['type'] });
    } else if (!SEGMENTS_IGNORES.test(seg) && (m = seg.match(LIBELLE_IDENTIFIANT))) {
      const normalise = normaliserIdentifiant(m[2]);
      // Un identifiant trop court ou purement décoratif (« 14024 ») produirait des faux rapprochements.
      if (normalise.length >= 6) r.identifiants.push({ type: m[1].trim(), valeur: m[2], normalise, pays: m[3]?.trim() ?? null });
    }
  }
  r.annees = [...annees].sort((a, b) => a - b);
  return r;
}

// ─── Assemblage des fichiers d'une liste ──────────────────────────────────────

const PAYS_NON_SIGNIFICATIFS = new Set(['', 'undetermined']);

/** Minuscule, sans accent, espaces simples : forme de comparaison des pays. */
export const formePays = (p: string) => p.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function analyserListe(fichiers: FichiersListe): { entrees: EntreeAnalysee[]; ignorees: number } {
  const alias = new Map<number, AliasSanction[]>();
  for (const l of lireCsv(fichiers.alias)) {
    if (l.length < 4) continue;
    const uid = Number(l[0]); const nom = valeur(l[3]);
    if (!Number.isInteger(uid) || !nom) continue;
    const type = (valeur(l[2]) ?? 'aka').toLowerCase();
    (alias.get(uid) ?? alias.set(uid, []).get(uid)!).push({ nom, type: (['aka', 'fka', 'nka'].includes(type) ? type : 'aka') as AliasSanction['type'] });
  }
  const paysAdresses = new Map<number, Set<string>>();
  for (const l of lireCsv(fichiers.adresses)) {
    if (l.length < 5) continue;
    const uid = Number(l[0]); const pays = valeur(l[4]);
    if (!Number.isInteger(uid) || !pays) continue;
    (paysAdresses.get(uid) ?? paysAdresses.set(uid, new Set()).get(uid)!).add(pays);
  }
  const suites = new Map<number, string>();
  for (const l of lireCsv(fichiers.commentaires)) {
    const uid = Number(l[0]); const suite = valeur(l[1]);
    if (Number.isInteger(uid) && suite) suites.set(uid, (suites.get(uid) ?? '') + suite);
  }

  const entrees: EntreeAnalysee[] = [];
  let ignorees = 0;
  const vus = new Set<number>();
  for (const l of lireCsv(fichiers.principal)) {
    if (l.length < 12) continue;
    const uid = Number(l[0]); const nom = valeur(l[1]);
    if (!Number.isInteger(uid) || !nom || vus.has(uid)) continue;
    const typeBrut = (valeur(l[2]) ?? '').toLowerCase();
    // Navires et aéronefs : sans objet pour le contrôle de personnes ou de sociétés.
    if (typeBrut === 'vessel' || typeBrut === 'aircraft') { ignorees++; continue; }
    vus.add(uid);
    const type: EntreeAnalysee['type'] = typeBrut === 'individual' ? 'individu' : 'entite';
    // Le champ « remarques » est tronqué à 1000 caractères : la suite est dans le fichier de commentaires.
    const remarques = [valeur(l[11]), suites.get(uid) ?? null].filter(Boolean).join('') || null;
    const a = analyserRemarques(remarques);

    const aliasFinal = new Map<string, AliasSanction>();
    for (const x of [...(alias.get(uid) ?? []), ...a.alias]) aliasFinal.set(x.nom.toLowerCase(), aliasFinal.get(x.nom.toLowerCase()) ?? x);
    aliasFinal.delete(nom.toLowerCase());

    const pays = new Set<string>();
    for (const p of [...(paysAdresses.get(uid) ?? []), ...a.nationalites, ...a.identifiants.map((i) => i.pays ?? '')]) {
      const f = formePays(p); if (!PAYS_NON_SIGNIFICATIFS.has(f)) pays.add(f);
    }
    const programmes = (valeur(l[3]) ?? '').split(/\]\s*\[/).map((p) => p.replace(/[[\]]/g, '').trim()).filter(Boolean);

    const sansEmpreinte = {
      uid, type, nom, programmes, titre: valeur(l[4]), naissances: a.naissances, datesNaissance: a.dates, anneesNaissance: a.annees,
      lieuxNaissance: a.lieux, nationalites: a.nationalites, pays: [...pays].sort(), identifiants: a.identifiants,
      alias: [...aliasFinal.values()].sort((x, y) => x.nom.localeCompare(y.nom)), remarques,
    };
    const empreinte = createHash('sha256').update(JSON.stringify(sansEmpreinte)).digest('hex');
    entrees.push({ ...sansEmpreinte, empreinte });
  }
  return { entrees, ignorees };
}
