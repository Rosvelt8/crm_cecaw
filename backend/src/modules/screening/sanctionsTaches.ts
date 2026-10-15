import type { ListeSanction } from '@prisma/client';
import { depisterPortefeuille } from './ofacScreening.service';
import { synchroniserListe, synchroniserToutes } from './sanctionsSync.service';

/**
 * Tâche planifiée (toutes les 6 h) : met à jour toutes les listes puis, si des inscriptions sont nouvelles
 * ou modifiées, contrôle le portefeuille contre ces seules inscriptions (surveillance continue). À la toute
 * première charge d'une liste officielle, rien n'est contrôlé automatiquement : tout le portefeuille se
 * confronte d'un coup via la tâche manuelle `sanctions_portefeuille`, pour que l'équipe conformité choisisse
 * le moment de recevoir ces alertes. Les listes locales font exception : une inscription saisie est toujours
 * recherchée aussitôt dans le portefeuille.
 */
export async function synchroSanctionsPlanifiee() {
  const resultats = await synchroniserToutes({ declencheur: 'planifie' });
  const changees = resultats.filter((r) => r.statut === 'reussie' && (!r.premiereCharge || r.liste === 'locale')).flatMap((r) => r.entreesChangees);
  const surveillance = changees.length ? await depisterPortefeuille({ entreeIds: changees }) : null;
  const premiere = resultats.some((r) => r.premiereCharge && r.liste !== 'locale');
  return {
    listes: resultats.map(({ entreesChangees: _ignore, ...r }) => r),
    surveillance,
    ...(premiere ? { remarque: 'Première charge d\'une liste : lancez la tâche « sanctions_portefeuille » (ou le bouton de l\'écran Conformité) pour contrôler tout le portefeuille existant.' } : {}),
  };
}

/** Contrôle de tout le portefeuille contre toutes les listes, ou contre une seule (liste ajoutée après coup). */
export const depistagePortefeuilleComplet = () => depisterPortefeuille();
export const depistagePortefeuilleListe = (liste: ListeSanction) => depisterPortefeuille({ liste });

/**
 * Après une saisie dans les listes de surveillance : resynchronise la copie locale aussitôt (pas d'attente du
 * prochain cycle) et recherche les nouvelles entrées dans le portefeuille. Sans délai, comme l'exige une
 * notification de gel. Ne lève jamais : une saisie ne doit pas échouer parce que la surveillance a un souci.
 */
export async function synchroniserLocaleEtSurveiller(acteurId?: number | null): Promise<void> {
  try {
    const r = await synchroniserListe('locale', { declencheur: 'manuel', declencheParId: acteurId ?? null });
    if (r.statut === 'reussie' && r.entreesChangees.length) await depisterPortefeuille({ entreeIds: r.entreesChangees });
  } catch (e) {
    console.error('[sanctions] resynchronisation des listes locales', e);
  }
}
