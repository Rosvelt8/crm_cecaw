import { normaliserIdentifiant, type AliasSanction, type EntreeAnalysee, type IdentifiantSanction } from '../ofac.parse';
import { aliasDistincts, avecEmpreinte, identifiantValide, paysDistincts } from './commun';
import { telecharger } from './http';
import type { SourceSanctions } from './types';
import { estNoeud, lireXml, liste, texte, type NoeudXml } from './xml';

/**
 * Union européenne : liste consolidée des sanctions financières (« Financial Sanctions Files », XML v1.1).
 *
 * Le fichier officiel n'est téléchargeable qu'avec un lien à jeton généré depuis un compte EU Login (gratuit) :
 * ce lien se place dans la variable d'environnement EU_SANCTIONS_URL (jamais en base ; jamais dans un message
 * d'erreur ni un journal). Tant qu'elle est absente, la source est ignorée et l'écran l'indique.
 *
 * ATTENTION : ce lecteur est écrit d'après la structure documentée du format (attributs `logicalId`,
 * `euReferenceNumber`, `nameAlias@wholeName`, `birthdate`, `citizenship`, `identification`…) et validé sur un
 * fichier d'exemple, PAS sur le fichier officiel. À valider sur le vrai fichier dès que le lien est disponible.
 */

const TABLEAUX = ['sanctionEntity', 'nameAlias', 'birthdate', 'citizenship', 'address', 'identification', 'regulation'];
const attr = (n: NoeudXml, nom: string) => texte(n[`@_${nom}`]);

const dateIso = (v: string): Date | null => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 ? d : null;
};

export function analyserUe(xml: string): { entrees: EntreeAnalysee[]; ignorees: number } {
  if (!/<\/export>\s*$/.test(xml)) throw new Error("Fichier de l'UE incomplet (balise de fin absente).");
  const racine = lireXml(xml, TABLEAUX).export;
  if (!estNoeud(racine)) throw new Error("Fichier de l'UE illisible (racine « export » absente).");

  const entrees: EntreeAnalysee[] = [];
  const vus = new Set<number>();
  let ignorees = 0;
  for (const n of liste(racine.sanctionEntity)) {
    const uid = Number(attr(n, 'logicalId'));
    if (!Number.isInteger(uid) || vus.has(uid)) { ignorees++; continue; }
    const sujet = liste(n.subjectType)[0];
    const code = estNoeud(sujet) ? (attr(sujet, 'classificationCode') || attr(sujet, 'code')).toLowerCase() : '';
    // « P » (person) → individu ; « E » (enterprise) → entité ; tout autre sujet (navire…) est sans objet ici.
    if (code && !['p', 'person'].includes(code) && !['e', 'enterprise'].includes(code)) { ignorees++; continue; }
    const type: 'individu' | 'entite' = ['p', 'person'].includes(code) ? 'individu' : 'entite';

    const noms = liste(n.nameAlias).map((a) => ({
      nom: attr(a, 'wholeName') || [attr(a, 'firstName'), attr(a, 'middleName'), attr(a, 'lastName')].filter(Boolean).join(' '),
      // « strong » = alias que l'UE tient pour fiable ; les autres sont des variantes moins sûres.
      fort: attr(a, 'strong') !== 'false',
    })).filter((a) => a.nom);
    if (noms.length === 0) { ignorees++; continue; }
    vus.add(uid);
    const principal = noms.find((a) => a.fort) ?? noms[0];
    const alias: AliasSanction[] = noms.filter((a) => a !== principal).map((a) => ({ nom: a.nom, type: a.fort ? 'aka' : 'faible' }));

    const textes: string[] = [], dates: Date[] = [], annees = new Set<number>(), lieux: string[] = [];
    for (const b of liste(n.birthdate)) {
      const complete = attr(b, 'birthdate'), annee = attr(b, 'year');
      const d = complete ? dateIso(complete) : null;
      if (d) { dates.push(d); annees.add(d.getUTCFullYear()); textes.push(complete.slice(0, 10)); }
      else if (/^\d{4}$/.test(annee)) { annees.add(Number(annee)); textes.push(annee); }
      const lieu = [attr(b, 'city'), attr(b, 'place'), attr(b, 'countryDescription')].filter(Boolean).join(', ');
      if (lieu) lieux.push(lieu);
    }
    const nationalites = liste(n.citizenship).map((c) => attr(c, 'countryDescription')).filter(Boolean);
    const adresses = liste(n.address).map((a) => attr(a, 'countryDescription'));
    const identifiants: IdentifiantSanction[] = [];
    for (const i of liste(n.identification)) {
      const valeur = attr(i, 'number');
      const ident: IdentifiantSanction = { type: attr(i, 'identificationTypeDescription') || attr(i, 'identificationTypeCode') || 'Document', valeur, normalise: normaliserIdentifiant(valeur), pays: attr(i, 'countryDescription') || null };
      if (valeur && identifiantValide(ident)) identifiants.push(ident);
    }
    const reglements = liste(n.regulation);
    const programmes = [...new Set(reglements.map((r) => attr(r, 'programme')).filter(Boolean))];
    const publications = reglements.map((r) => dateIso(attr(r, 'publicationDate') || attr(r, 'entryIntoForceDate'))).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
    const fonction = liste(n.nameAlias).map((a) => attr(a, 'function')).find(Boolean);

    entrees.push(avecEmpreinte({
      uid, type, nom: principal.nom, reference: attr(n, 'euReferenceNumber') || null, programmes, titre: fonction?.slice(0, 300) ?? null, dateInscription: publications[0] ?? null,
      naissances: [...new Set(textes)], datesNaissance: dates, anneesNaissance: [...annees].sort((a, b) => a - b), lieuxNaissance: lieux, nationalites,
      pays: paysDistincts([...nationalites, ...adresses, ...identifiants.map((i) => i.pays)]), identifiants, alias: aliasDistincts(alias, principal.nom),
      remarques: (attr(n, 'remark') || texte(liste(n.remark)[0]) || attr(n, 'designationDetails')) || null,
    }));
  }
  return { entrees, ignorees };
}

export const ue: SourceSanctions = {
  liste: 'ue', libelle: 'UE — liste consolidée des sanctions financières', autorite: 'Union européenne (Commission)',
  pageOfficielle: 'https://webgate.ec.europa.eu/fsd/fsf', minimum: 1000,
  configuree: () => !!process.env.EU_SANCTIONS_URL?.trim(),
  aideConfiguration: "Créez un compte EU Login (gratuit), ouvrez le site « Financial Sanctions Files » de la Commission, générez le lien du fichier XML (format v1.1) puis renseignez-le dans la variable d'environnement EU_SANCTIONS_URL du serveur.",
  recuperer: async () => {
    const lien = process.env.EU_SANCTIONS_URL!.trim();
    return [await telecharger(lien, 'liste consolidée UE', [lien])];
  },
  analyser: ([xml]) => analyserUe(xml),
};
