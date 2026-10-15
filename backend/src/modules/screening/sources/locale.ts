import type { TypeEntreeSanction } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { normaliserIdentifiant, type EntreeAnalysee } from '../ofac.parse';
import { aliasDistincts, avecEmpreinte, identifiantValide, paysDistincts } from './commun';
import type { SourceSanctions } from './types';

/**
 * Listes de surveillance saisies dans le CRM (Conformité > Listes de surveillance) : notifications
 * nationales de l'ANIF ou de la commission de gel, personnes politiquement exposées, liste interne.
 * Elles alimentent la même copie locale que les listes officielles : un seul contrôle les interroge toutes,
 * avec la même file de revue, la même mémoire des faux positifs et le même historique.
 *
 * La provenance (« ANIF — notification du… ») se consigne dans les champs `source` et `motif` de l'entrée.
 * Une entrée supprimée ou désactivée devient inactive dans la copie, jamais effacée.
 */

interface LigneLocale {
  id: number; nom: string; prenom: string | null; dateNaissance: string | null; numeroPiece: string | null; pays: string | null; alias: string[];
  typeEntree: TypeEntreeSanction; categorie: string; source: string | null; motif: string | null; createdAt: string;
}

export function analyserLocale(json: string): { entrees: EntreeAnalysee[]; ignorees: number } {
  const lignes = JSON.parse(json) as LigneLocale[];
  const entrees = lignes.map((l): EntreeAnalysee => {
    const nom = [l.prenom, l.nom].filter(Boolean).join(' ').trim();
    const naissance = l.dateNaissance ? new Date(l.dateNaissance) : null;
    const dates = naissance && !Number.isNaN(naissance.getTime()) ? [naissance] : [];
    const identifiants = l.numeroPiece ? [{ type: 'Pièce', valeur: l.numeroPiece, normalise: normaliserIdentifiant(l.numeroPiece), pays: l.pays }].filter(identifiantValide) : [];
    return avecEmpreinte({
      uid: l.id, type: l.typeEntree, nom, reference: `LOC-${l.id}`, programmes: [l.categorie], titre: null, dateInscription: new Date(l.createdAt),
      naissances: dates.map((d) => d.toISOString().slice(0, 10)), datesNaissance: dates, anneesNaissance: dates.map((d) => d.getUTCFullYear()),
      lieuxNaissance: [], nationalites: [], pays: paysDistincts([l.pays]), identifiants,
      alias: aliasDistincts(l.alias.map((a) => ({ nom: a, type: 'aka' as const })), nom), remarques: [l.source, l.motif].filter(Boolean).join(' — ') || null,
    });
  });
  return { entrees, ignorees: 0 };
}

export const locale: SourceSanctions = {
  liste: 'locale', libelle: 'Listes de surveillance du CRM (notifications nationales, PEP, liste interne)', autorite: 'Saisie interne CECAW',
  pageOfficielle: '/dashboard/conformite', minimum: 0, sansGardeFous: true, configuree: () => true,
  async recuperer() {
    const lignes = await prisma.entreeSurveillance.findMany({ where: { actif: true }, orderBy: { id: 'asc' } });
    return [JSON.stringify(lignes)];
  },
  analyser: ([json]) => analyserLocale(json),
};
