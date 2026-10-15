import { createHash } from 'crypto';
import { ListeSanction, Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { alerter } from '../../lib/conformite';
import { parametre } from '../../lib/parametres';
import { ErreurMetier } from '../../lib/rbac';
import { masquer } from './sources/http';
import { SOURCES, sourceDe } from './sources';
import type { EntreeAnalysee } from './ofac.parse';

/**
 * Synchronisation des listes de sanctions vers la base locale, pour toutes les sources (OFAC, ONU, UE,
 * listes locales). Chaque exécution, par liste :
 *   1. récupère les fichiers via le connecteur de la source ;
 *   2. ne retraite rien si leur empreinte est identique à la dernière publication appliquée ;
 *   3. refuse un fichier vide ou anormalement réduit plutôt que de « retirer » toute la liste ;
 *   4. applique la différence (ajouts, modifications, retraits) dans UNE transaction : un échec
 *      laisse la liste précédente intacte et utilisable.
 * Une inscription retirée par la source est désactivée, jamais supprimée : les contrôles passés y
 * renvoient et doivent rester explicables.
 */

const VERROU_SYNCHRO = 7_481_001;
/** Numéro de verrou par liste : deux synchronisations d'une même liste ne se chevauchent jamais. */
const ORDRE: Record<ListeSanction, number> = { sdn: 1, non_sdn: 2, onu: 3, ue: 4, locale: 5 };

export const TOUTES_LES_LISTES: ListeSanction[] = ['sdn', 'non_sdn', 'onu', 'ue', 'locale'];

/** Listes activées par l'administrateur et réellement utilisables (une source sans configuration est ignorée). */
export const listesActives = async (): Promise<ListeSanction[]> => {
  const v = await parametre<string[]>('conformite.ofac_listes');
  const choisies = (Array.isArray(v) ? v : []).filter((x): x is ListeSanction => (TOUTES_LES_LISTES as string[]).includes(x));
  return choisies.filter((l) => SOURCES.some((s) => s.liste === l && s.configuree()));
};

const versLigne = (e: EntreeAnalysee, liste: ListeSanction, syncId: number, creation: boolean) => ({
  liste, uid: e.uid, reference: e.reference?.slice(0, 60) ?? null, type: e.type, nom: e.nom.slice(0, 500), programmes: e.programmes, titre: e.titre?.slice(0, 300) ?? null,
  dateInscription: e.dateInscription ?? null,
  naissances: e.naissances, datesNaissance: e.datesNaissance, anneesNaissance: e.anneesNaissance, lieuxNaissance: e.lieuxNaissance,
  nationalites: e.nationalites, pays: e.pays, identifiants: e.identifiants as unknown as Prisma.InputJsonValue, remarques: e.remarques,
  empreinte: e.empreinte, actif: true, retireSyncId: null, ...(creation ? { ajouteSyncId: syncId } : { modifieSyncId: syncId }),
});
const lignesAlias = (entreeId: number, e: EntreeAnalysee) => e.alias.map((a) => ({ entreeId, nom: a.nom.slice(0, 500), type: a.type }));

export interface ResultatSynchro {
  liste: ListeSanction; statut: 'reussie' | 'inchangee' | 'echec' | 'non_configuree'; synchroId: number;
  entrees: number; ajoutees: number; modifiees: number; retirees: number; ignorees: number;
  /** Identifiants des inscriptions ajoutées ou modifiées, pour la surveillance continue. */
  entreesChangees: number[];
  premiereCharge: boolean;
  erreur?: string;
}

export async function synchroniserListe(liste: ListeSanction, opts: { declencheur?: 'planifie' | 'manuel'; declencheParId?: number | null; forcer?: boolean } = {}): Promise<ResultatSynchro> {
  const source = sourceDe(liste);
  if (!source.configuree()) throw new ErreurMetier(`La source « ${source.libelle} » n'est pas configurée. ${source.aideConfiguration ?? ''}`.trim(), 422);
  const synchro = await prisma.sanctionSynchronisation.create({ data: { liste, declencheur: opts.declencheur ?? 'planifie', declencheParId: opts.declencheParId ?? null } });
  const base: ResultatSynchro = { liste, statut: 'echec', synchroId: synchro.id, entrees: 0, ajoutees: 0, modifiees: 0, retirees: 0, ignorees: 0, entreesChangees: [], premiereCharge: false };
  const clore = (data: Prisma.SanctionSynchronisationUpdateInput) => prisma.sanctionSynchronisation.update({ where: { id: synchro.id }, data: { ...data, finAt: new Date() } });

  try {
    const contenus = await source.recuperer();
    const empreinteSource = createHash('sha256').update(contenus.join('\u0000')).digest('hex');
    if (!opts.forcer) {
      const derniere = await prisma.sanctionSynchronisation.findFirst({ where: { liste, statut: 'reussie', id: { not: synchro.id } }, orderBy: { id: 'desc' }, select: { empreinteSource: true, nbEntrees: true } });
      if (derniere?.empreinteSource === empreinteSource) {
        await clore({ statut: 'inchangee', empreinteSource, nbEntrees: derniere.nbEntrees });
        return { ...base, statut: 'inchangee', entrees: derniere.nbEntrees };
      }
    }

    const { entrees, ignorees } = source.analyser(contenus);
    const actifsAvant = await prisma.sanctionEntree.count({ where: { liste, actif: true } });
    // Plancher abaissable (SANCTIONS_MINIMUM_ENTREES) pour les environnements de test qui servent de petits fichiers.
    const minimum = Number(process.env.SANCTIONS_MINIMUM_ENTREES ?? process.env.OFAC_MINIMUM_ENTREES ?? source.minimum);
    if (!source.sansGardeFous && entrees.length < minimum) throw new Error(`Fichier suspect : ${entrees.length} inscription(s) lue(s) (minimum attendu ${minimum}). La liste actuelle est conservée.`);
    if (!source.sansGardeFous && actifsAvant > 100 && entrees.length < actifsAvant * 0.5) throw new Error(`Fichier suspect : ${entrees.length} inscription(s) contre ${actifsAvant} actuellement. La liste actuelle est conservée.`);

    const bilan = await prisma.$transaction(async (tx) => {
      // Verrou bloquant : deux synchronisations d'une même liste se suivent au lieu de se chevaucher. La seconde
      // applique sa propre version, plus récente, des fichiers (indispensable pour les listes locales modifiées coup sur coup).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VERROU_SYNCHRO}::int, ${ORDRE[liste]}::int)`;

      const existants = new Map((await tx.sanctionEntree.findMany({ where: { liste }, select: { id: true, uid: true, empreinte: true, actif: true } })).map((x) => [x.uid, x]));
      const nouvelles = entrees.filter((e) => !existants.has(e.uid));
      const modifiees = entrees.filter((e) => { const x = existants.get(e.uid); return x && (x.empreinte !== e.empreinte || !x.actif); });
      const presents = new Set(entrees.map((e) => e.uid));
      const retirees = [...existants.values()].filter((x) => x.actif && !presents.has(x.uid));
      const changees: number[] = [];

      for (let i = 0; i < nouvelles.length; i += 500) {
        const lot = nouvelles.slice(i, i + 500);
        const crees = await tx.sanctionEntree.createManyAndReturn({ data: lot.map((e) => versLigne(e, liste, synchro.id, true)), select: { id: true, uid: true } });
        const parUid = new Map(crees.map((c) => [c.uid, c.id]));
        const alias = lot.flatMap((e) => lignesAlias(parUid.get(e.uid)!, e));
        if (alias.length) await tx.sanctionAlias.createMany({ data: alias });
        changees.push(...crees.map((c) => c.id));
      }
      for (let i = 0; i < modifiees.length; i += 200) {
        const lot = modifiees.slice(i, i + 200);
        const ids = lot.map((e) => existants.get(e.uid)!.id);
        await tx.sanctionAlias.deleteMany({ where: { entreeId: { in: ids } } });
        for (const e of lot) await tx.sanctionEntree.update({ where: { id: existants.get(e.uid)!.id }, data: versLigne(e, liste, synchro.id, false) });
        const alias = lot.flatMap((e) => lignesAlias(existants.get(e.uid)!.id, e));
        if (alias.length) await tx.sanctionAlias.createMany({ data: alias });
        changees.push(...ids);
      }
      if (retirees.length) await tx.sanctionEntree.updateMany({ where: { id: { in: retirees.map((x) => x.id) } }, data: { actif: false, retireSyncId: synchro.id } });
      return { ajoutees: nouvelles.length, modifiees: modifiees.length, retirees: retirees.length, changees };
    }, { timeout: 900_000, maxWait: 30_000 });

    await clore({ statut: 'reussie', empreinteSource, nbEntrees: entrees.length, nbAjoutees: bilan.ajoutees, nbModifiees: bilan.modifiees, nbRetirees: bilan.retirees, nbIgnorees: ignorees });
    await createLog({
      utilisateurId: opts.declencheParId ?? undefined, utilisateurLabel: opts.declencheParId ? 'manuel' : 'planificateur', module: 'conformite', action: 'SYNCHRO_SANCTIONS', entiteType: 'liste_sanction', entiteId: synchro.id,
      description: `${liste} : ${entrees.length} inscriptions (${bilan.ajoutees} ajoutée(s), ${bilan.modifiees} modifiée(s), ${bilan.retirees} retirée(s))`,
    });
    return { ...base, statut: 'reussie', entrees: entrees.length, ajoutees: bilan.ajoutees, modifiees: bilan.modifiees, retirees: bilan.retirees, ignorees, entreesChangees: bilan.changees, premiereCharge: actifsAvant === 0 };
  } catch (e) {
    const message = masquer(((e as Error).message ?? 'Erreur inconnue').slice(0, 1000));
    await clore({ statut: 'echec', erreur: message }).catch(() => undefined);
    // Une liste qui ne se met plus à jour devient dangereuse sans qu'on le voie : on le signale, une fois par jour.
    await alerter({
      code: 'sanctions_synchro_echec', niveau: 'eleve', titre: `Échec de la mise à jour de la liste de sanctions « ${liste} »`,
      description: `${message} Les contrôles continuent avec la dernière version de la liste.`, empreinte: `sanctions-synchro-echec:${liste}:${new Date().toISOString().slice(0, 10)}`,
      entiteType: 'liste_sanction', entiteId: synchro.id,
    }).catch(() => undefined);
    console.error(`[sanctions] synchronisation ${liste}`, masquer(String((e as Error).stack ?? e)));
    return { ...base, erreur: message };
  }
}

/** Synchronise toutes les listes activées et configurées. Ne lève pas : chaque liste rapporte son propre résultat. */
export async function synchroniserToutes(opts: { declencheur?: 'planifie' | 'manuel'; declencheParId?: number | null; forcer?: boolean } = {}): Promise<ResultatSynchro[]> {
  const resultats: ResultatSynchro[] = [];
  for (const liste of await listesActives()) resultats.push(await synchroniserListe(liste, opts));
  return resultats;
}

/** État des listes pour l'écran de conformité et pour juger de la fraîcheur au moment d'un contrôle. */
export async function etatListes() {
  const actives = await listesActives();
  const choisies = (await parametre<string[]>('conformite.ofac_listes')) ?? [];
  const ageMax = Number(await parametre('conformite.ofac_age_max_jours'));
  const sorties = [];
  for (const source of SOURCES) {
    const liste = source.liste;
    const [derniere, reussie, verifiee, nbActives] = await Promise.all([
      prisma.sanctionSynchronisation.findFirst({ where: { liste }, orderBy: { id: 'desc' } }),
      prisma.sanctionSynchronisation.findFirst({ where: { liste, statut: 'reussie' }, orderBy: { id: 'desc' } }),
      prisma.sanctionSynchronisation.findFirst({ where: { liste, statut: { in: ['reussie', 'inchangee'] } }, orderBy: { id: 'desc' } }),
      prisma.sanctionEntree.count({ where: { liste, actif: true } }),
    ]);
    const aJourAu = verifiee?.finAt ?? null;
    const ageJours = aJourAu ? (Date.now() - aJourAu.getTime()) / 86_400_000 : null;
    sorties.push({
      liste, libelle: source.libelle, autorite: source.autorite, page_officielle: source.pageOfficielle,
      active: actives.includes(liste), souhaitee: choisies.includes(liste), configuree: source.configuree(), aide_configuration: source.configuree() ? null : source.aideConfiguration ?? null,
      nb_entrees: nbActives, a_jour_au: aJourAu, age_jours: ageJours === null ? null : Math.round(ageJours * 10) / 10,
      obsolete: actives.includes(liste) && (ageJours === null || ageJours > ageMax),
      derniere_modification_at: reussie?.finAt ?? null, derniere_tentative: derniere ? { statut: derniere.statut, at: derniere.finAt ?? derniere.debutAt, erreur: derniere.erreur } : null,
    });
  }
  return { age_max_jours: ageMax, listes: sorties };
}

export async function historiqueSynchronisations(limite = 30) {
  return prisma.sanctionSynchronisation.findMany({ orderBy: { id: 'desc' }, take: Math.min(100, limite), include: { declenchePar: { select: { prenom: true, nom: true } } } });
}
