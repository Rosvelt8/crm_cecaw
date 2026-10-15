import { analyserNaissance, normaliserIdentifiant, type AliasSanction, type EntreeAnalysee, type IdentifiantSanction } from '../ofac.parse';
import { aliasDistincts, avecEmpreinte, identifiantValide, paysDistincts } from './commun';
import { telecharger } from './http';
import type { SourceSanctions } from './types';
import { estNoeud, lireXml, liste, texte, type NoeudXml } from './xml';

/**
 * ONU : liste consolidée du Conseil de sécurité. Fichier XML public d'environ 2 Mo (≈ 740 personnes,
 * ≈ 270 entités). L'adresse historique redirige vers un stockage à signature temporaire (environ une heure) :
 * la redirection est suivie à chaque téléchargement et l'adresse finale n'est jamais conservée.
 * HYPOTHÈSE à surveiller : le fichier s'appelle désormais « Legacy » ; si l'ONU le retire, la synchronisation
 * échoue et l'alerte de conformité le signale (le format de remplacement devra alors être raccordé ici).
 */

const URL_ONU_DEFAUT = 'https://scsanctions.un.org/resources/xml/en/consolidated.xml';
const TABLEAUX = ['INDIVIDUAL', 'ENTITY', 'INDIVIDUAL_ALIAS', 'ENTITY_ALIAS', 'INDIVIDUAL_ADDRESS', 'ENTITY_ADDRESS', 'INDIVIDUAL_DATE_OF_BIRTH', 'INDIVIDUAL_PLACE_OF_BIRTH', 'INDIVIDUAL_DOCUMENT', 'VALUE'];

const dateIso = (v: string): Date | null => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 ? d : null;
};

/** Qualité d'un alias selon l'ONU : « Low » = peu fiable ; « f.k.a. » = ancien nom ; le reste = alias courant. */
function typeAlias(qualite: string): AliasSanction['type'] {
  const q = qualite.toLowerCase();
  if (q === 'low') return 'faible';
  if (q.startsWith('f.k.a')) return 'fka';
  if (q.startsWith('n.k.a')) return 'nka';
  return 'aka';
}

interface Naissances { textes: string[]; dates: Date[]; annees: Set<number> }
function ajouterNaissance(n: Naissances, d: NoeudXml) {
  const date = texte(d.DATE), annee = texte(d.YEAR), de = texte(d.FROM_YEAR), a = texte(d.TO_YEAR), note = texte(d.NOTE);
  if (date) { const x = dateIso(date); if (x) { n.dates.push(x); n.annees.add(x.getUTCFullYear()); n.textes.push(date.slice(0, 10)); } }
  if (annee && /^\d{4}$/.test(annee)) { n.annees.add(Number(annee)); n.textes.push(annee); }
  if (de && a && Number(a) >= Number(de) && Number(a) - Number(de) <= 30) {
    for (let y = Number(de); y <= Number(a); y++) n.annees.add(y);
    n.textes.push(`${de} to ${a}`);
  }
  // Date seulement décrite en note (« Nov. 1973 ») : on retient l'année pour la comparaison.
  if (!date && !annee && !de && note) for (const y of analyserNaissance(note).annees) { n.annees.add(y); n.textes.push(note); }
}

function nomComplet(n: NoeudXml): string {
  return ['FIRST_NAME', 'SECOND_NAME', 'THIRD_NAME', 'FOURTH_NAME'].map((k) => texte(n[k])).filter(Boolean).join(' ');
}

function identifiants(docs: NoeudXml[]): IdentifiantSanction[] {
  const res: IdentifiantSanction[] = [];
  for (const d of docs) {
    const [t1, t2] = [texte(d.TYPE_OF_DOCUMENT), texte(d.TYPE_OF_DOCUMENT2)];
    const type = (t2 && t2.toLowerCase() !== t1.toLowerCase() ? [t1, t2] : [t1]).filter(Boolean).join(' — ') || 'Document';
    const pays = texte(d.ISSUING_COUNTRY) || texte(d.COUNTRY_OF_ISSUE) || null;
    // Un champ peut porter plusieurs numéros (« A123456; B654321 »).
    for (const brut of texte(d.NUMBER).split(/\s*[;/]\s*|\s+et\s+|\s+or\s+/i)) {
      const valeur = brut.trim();
      const i: IdentifiantSanction = { type, valeur, normalise: normaliserIdentifiant(valeur), pays };
      if (valeur && identifiantValide(i)) res.push(i);
    }
  }
  return res;
}

export function analyserOnu(xml: string): { entrees: EntreeAnalysee[]; ignorees: number } {
  // Un fichier coupé net se lit sans erreur ; on vérifie donc qu'il est complet avant d'en tirer quoi que ce soit.
  if (!/<\/CONSOLIDATED_LIST>\s*$/.test(xml)) throw new Error("Fichier de l'ONU incomplet (balise de fin absente).");
  const racine = lireXml(xml, TABLEAUX).CONSOLIDATED_LIST;
  if (!estNoeud(racine)) throw new Error("Fichier de l'ONU illisible (racine CONSOLIDATED_LIST absente).");

  const entrees: EntreeAnalysee[] = [];
  const vus = new Set<number>();
  const traiter = (n: NoeudXml, type: 'individu' | 'entite') => {
    const uid = Number(texte(n.DATAID));
    const nom = nomComplet(n);
    if (!Number.isInteger(uid) || !nom || vus.has(uid)) return;
    vus.add(uid);
    const individu = type === 'individu';
    const naiss: Naissances = { textes: [], dates: [], annees: new Set() };
    const alias: AliasSanction[] = [];
    for (const a of liste(individu ? n.INDIVIDUAL_ALIAS : n.ENTITY_ALIAS)) {
      const nomAlias = texte(a.ALIAS_NAME);
      if (nomAlias) alias.push({ nom: nomAlias, type: typeAlias(texte(a.QUALITY)) });
      // Un alias peut porter sa propre date de naissance : c'est une autre date connue de la même personne.
      if (individu && texte(a.DATE_OF_BIRTH)) ajouterNaissance(naiss, { DATE: a.DATE_OF_BIRTH } as NoeudXml);
    }
    if (individu) for (const d of liste(n.INDIVIDUAL_DATE_OF_BIRTH)) ajouterNaissance(naiss, d);
    const nationalites = individu ? liste<NoeudXml>(n.NATIONALITY).flatMap((x) => liste(x.VALUE).map(texte)).filter(Boolean) : [];
    const adresses = liste(individu ? n.INDIVIDUAL_ADDRESS : n.ENTITY_ADDRESS);
    const lieux = individu ? liste(n.INDIVIDUAL_PLACE_OF_BIRTH).map((l) => [texte(l.CITY), texte(l.STATE_PROVINCE), texte(l.COUNTRY)].filter(Boolean).join(', ')).filter(Boolean) : [];
    const docs = individu ? identifiants(liste(n.INDIVIDUAL_DOCUMENT)) : [];
    const titres = individu ? [...liste(n.DESIGNATION).flatMap((d) => (estNoeud(d) ? liste(d.VALUE).map(texte) : [texte(d)])), ...liste(n.TITLE).flatMap((d) => (estNoeud(d) ? liste(d.VALUE).map(texte) : [texte(d)]))].filter(Boolean) : [];
    const listeInscription = texte(n.LISTED_ON);

    entrees.push(avecEmpreinte({
      uid, type, nom, reference: texte(n.REFERENCE_NUMBER) || null, programmes: texte(n.UN_LIST_TYPE) ? [texte(n.UN_LIST_TYPE)] : [],
      titre: titres.length ? titres.join('; ').slice(0, 300) : null, dateInscription: dateIso(listeInscription),
      naissances: [...new Set(naiss.textes)], datesNaissance: naiss.dates, anneesNaissance: [...naiss.annees].sort((a, b) => a - b),
      lieuxNaissance: lieux, nationalites, pays: paysDistincts([...nationalites, ...adresses.map((a) => texte(a.COUNTRY)), ...docs.map((d) => d.pays)]),
      identifiants: docs, alias: aliasDistincts(alias, nom), remarques: texte(n.COMMENTS1) || null,
    }));
  };
  const individus = estNoeud(racine.INDIVIDUALS) ? liste(racine.INDIVIDUALS.INDIVIDUAL) : [];
  const entites = estNoeud(racine.ENTITIES) ? liste(racine.ENTITIES.ENTITY) : [];
  individus.forEach((n) => traiter(n, 'individu'));
  entites.forEach((n) => traiter(n, 'entite'));
  return { entrees, ignorees: 0 };
}

export const onu: SourceSanctions = {
  liste: 'onu', libelle: 'ONU — liste consolidée du Conseil de sécurité', autorite: 'Conseil de sécurité des Nations unies',
  pageOfficielle: 'https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list', minimum: 300, configuree: () => true,
  recuperer: async () => [await telecharger(process.env.UN_LIST_URL ?? URL_ONU_DEFAUT, 'consolidated.xml')],
  analyser: ([xml]) => analyserOnu(xml),
};
