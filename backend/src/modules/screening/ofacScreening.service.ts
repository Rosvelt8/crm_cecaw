import { createHash } from 'crypto';
import { DeclencheurScreening, ListeSanction, Prisma, StatutScreening, TypePersonne } from '@prisma/client';
import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { alerter } from '../../lib/conformite';
import { parametre, parametreNombre } from '../../lib/parametres';
import { ErreurMetier } from '../../lib/rbac';
import type { JwtPayload } from '../../middleware/auth';
import { agenceFilter as perimetreClientsBrut } from '../clients/clients.service';
import { agenceFilter as perimetreProspectsBrut } from '../prospects/prospects.service';
import { listesActives } from './sanctionsSync.service';
import { sourceDe } from './sources';
import type { AliasSanction, IdentifiantSanction } from './ofac.parse';
import { canonPays, IndexSanctions, motsDuNom, type Confiance, type Correspondance, type EntreeIndexable } from './matching';

/**
 * Contrôle de sanctions OFAC d'une personne ou d'une société.
 *
 * Garanties de conception :
 *  - le moteur ne produit que « aucune correspondance », « correspondance potentielle » ou « erreur
 *    technique » ; seule une décision humaine (voir revue.service) peut confirmer une correspondance ;
 *  - un contrôle n'est JAMAIS déclaré « sans correspondance » faute de données : sans liste chargée, il
 *    échoue en erreur technique ;
 *  - aucun blocage de client ni de dossier n'est déclenché ici ;
 *  - l'identité contrôlée et la version des listes sont figées dans le contrôle, qui reste opposable.
 */

export interface CorrespondanceScreening extends Correspondance { champ: 'nom' | 'entreprise' }
export interface VersionListe { liste: string; synchro_id: number; a_jour_au: string | null; nb_entrees: number }

interface SujetControle {
  clientId?: number; prospectId?: number; typePersonne: TypePersonne;
  nom: string; prenom?: string | null; alias: string[]; dateNaissance?: Date | null; pays?: string | null; entreprise?: string | null;
  pieces: string[]; agenceId?: number | null;
}

export interface DemandeScreening {
  client_id?: number; prospect_id?: number; type_personne?: TypePersonne;
  nom?: string; prenom?: string | null; alias?: string[]; date_naissance?: string | null; pays?: string | null; entreprise?: string | null; numero_piece?: string | null;
}

/** Périmètre de lecture de l'acteur. Un responsable sans agence ne voit rien, plutôt que « les fiches sans agence ». */
async function filtreClients(actor: JwtPayload): Promise<Prisma.ClientWhereInput> {
  const f = await perimetreClientsBrut(actor);
  return 'agenceId' in f && f.agenceId == null ? { id: -1 } : (f as Prisma.ClientWhereInput);
}
async function filtreProspects(actor: JwtPayload): Promise<Prisma.ProspectWhereInput> {
  return (await perimetreProspectsBrut(actor)) as Prisma.ProspectWhereInput;
}

const RANG: Record<Confiance, number> = { faible: 0, moyenne: 1, forte: 2 };
const NIVEAU_ALERTE: Record<Confiance, 'moyen' | 'eleve' | 'critique'> = { faible: 'moyen', moyenne: 'eleve', forte: 'critique' };
const libelle = (s: { nom: string; prenom?: string | null }) => [s.prenom, s.nom].filter(Boolean).join(' ').trim();

// ─── Index en mémoire ─────────────────────────────────────────────────────────

let cache: { cle: string; index: IndexSanctions } | null = null;
let chargement: Promise<IndexSanctions> | null = null;

async function construireIndex(listes: ListeSanction[]): Promise<IndexSanctions> {
  const lignes = await prisma.sanctionEntree.findMany({ where: { actif: true, liste: { in: listes } }, include: { alias: { select: { nom: true, type: true } } } });
  const entrees: EntreeIndexable[] = lignes.map((l) => ({
    id: l.id, liste: l.liste, uid: l.uid, reference: l.reference, type: l.type, nom: l.nom, programmes: l.programmes, titre: l.titre, naissances: l.naissances,
    datesNaissance: l.datesNaissance, anneesNaissance: l.anneesNaissance, nationalites: l.nationalites, pays: l.pays,
    identifiants: (l.identifiants ?? []) as unknown as IdentifiantSanction[], alias: l.alias as AliasSanction[], empreinte: l.empreinte, remarques: l.remarques,
  }));
  return new IndexSanctions(entrees);
}

/**
 * Index des listes actuellement chargées. Reconstruit seulement quand une synchronisation a modifié
 * les données (la clé de cache suit la dernière synchronisation réussie de chaque liste, lue en base :
 * fonctionne aussi avec plusieurs instances du serveur).
 */
export async function chargerIndex(): Promise<{ index: IndexSanctions | null; versions: VersionListe[]; avertissements: string[] }> {
  const actives = await listesActives();
  const ageMax = await parametreNombre('conformite.ofac_age_max_jours');
  const versions: VersionListe[] = [];
  const avertissements: string[] = [];
  const chargees: ListeSanction[] = [];
  for (const liste of actives) {
    const [reussie, verifiee] = await Promise.all([
      prisma.sanctionSynchronisation.findFirst({ where: { liste, statut: 'reussie' }, orderBy: { id: 'desc' } }),
      prisma.sanctionSynchronisation.findFirst({ where: { liste, statut: { in: ['reussie', 'inchangee'] } }, orderBy: { id: 'desc' } }),
    ]);
    if (!reussie) { avertissements.push(`La liste « ${sourceDe(liste).libelle} » n'a jamais été chargée : le contrôle est incomplet.`); continue; }
    const aJourAu = verifiee?.finAt ?? reussie.finAt;
    const age = aJourAu ? (Date.now() - aJourAu.getTime()) / 86_400_000 : Infinity;
    if (age > ageMax) avertissements.push(`La liste « ${sourceDe(liste).libelle} » n'a pas été vérifiée depuis ${Math.floor(age)} jour(s) (limite : ${ageMax}). Le contrôle s'appuie sur une version ancienne.`);
    versions.push({ liste, synchro_id: reussie.id, a_jour_au: aJourAu?.toISOString() ?? null, nb_entrees: reussie.nbEntrees });
    chargees.push(liste);
  }
  if (chargees.length === 0) return { index: null, versions, avertissements };

  const cle = versions.map((v) => `${v.liste}:${v.synchro_id}`).join('|');
  if (cache?.cle !== cle) {
    chargement ??= construireIndex(chargees).finally(() => { chargement = null; });
    cache = { cle, index: await chargement };
  }
  return { index: cache.index, versions, avertissements };
}

export const viderCacheIndex = () => { cache = null; };

// ─── Identité contrôlée ───────────────────────────────────────────────────────

const empreinteDe = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

function empreinteSujet(s: SujetControle): string {
  return empreinteDe({
    t: s.typePersonne, noms: motsDuNom(libelle(s)).sort(), alias: s.alias.map((a) => motsDuNom(a).sort().join(' ')).sort(),
    dn: s.dateNaissance?.toISOString().slice(0, 10) ?? null, pays: canonPays(s.pays), pieces: s.pieces.map((p) => p.replace(/[^A-Za-z0-9]/g, '').toUpperCase()).sort(),
    e: motsDuNom(s.entreprise).sort(),
  });
}

interface FicheClient {
  id: number; nom: string; prenom: string | null; typePersonne: TypePersonne; dateNaissance: Date | null; nationalite: string | null; employeur: string | null;
  sigle: string | null; numeroCni: string | null; nui: string | null; rccm: string | null; agenceId: number | null;
}
const SELECT_FICHE = { id: true, nom: true, prenom: true, typePersonne: true, dateNaissance: true, nationalite: true, employeur: true, sigle: true, numeroCni: true, nui: true, rccm: true } as const;

function sujetDeFiche(f: FicheClient, type: 'client' | 'prospect', piecesKyc: string[]): SujetControle {
  const morale = f.typePersonne === 'morale';
  return {
    ...(type === 'client' ? { clientId: f.id } : { prospectId: f.id }),
    typePersonne: f.typePersonne, nom: f.nom, prenom: f.prenom, alias: morale && f.sigle ? [f.sigle] : [],
    dateNaissance: morale ? null : f.dateNaissance, pays: f.nationalite,
    entreprise: morale ? null : f.employeur, pieces: [f.numeroCni, f.nui, f.rccm, ...piecesKyc].filter((x): x is string => !!x), agenceId: f.agenceId,
  };
}

async function piecesKyc(clientIds: number[]): Promise<Map<number, string[]>> {
  const m = new Map<number, string[]>();
  if (clientIds.length === 0) return m;
  const lignes = await prisma.pieceIdentite.findMany({ where: { dossier: { clientId: { in: clientIds } } }, select: { numero: true, dossier: { select: { clientId: true } } } });
  for (const l of lignes) if (l.dossier.clientId) (m.get(l.dossier.clientId) ?? m.set(l.dossier.clientId, []).get(l.dossier.clientId)!).push(l.numero);
  return m;
}

/** Fusionne la fiche (client ou prospect) et les informations saisies par l'utilisateur (alias, corrections). */
async function resoudreSujet(actor: JwtPayload | null, d: DemandeScreening): Promise<SujetControle> {
  let base: SujetControle | null = null;
  if (d.client_id) {
    const where = { id: d.client_id, ...(actor ? await filtreClients(actor) : {}) };
    const f = await prisma.client.findFirst({ where, select: { ...SELECT_FICHE, agenceId: true } });
    if (!f) throw new ErreurMetier('Client introuvable', 404);
    base = sujetDeFiche(f, 'client', (await piecesKyc([f.id])).get(f.id) ?? []);
  } else if (d.prospect_id) {
    const where = { id: d.prospect_id, ...(actor ? await filtreProspects(actor) : {}) };
    const f = await prisma.prospect.findFirst({ where, select: { ...SELECT_FICHE, commercial: { select: { agenceId: true } } } });
    if (!f) throw new ErreurMetier('Prospect introuvable', 404);
    base = sujetDeFiche({ ...f, agenceId: f.commercial?.agenceId ?? null }, 'prospect', []);
  }
  if (!base && !d.nom?.trim()) throw new ErreurMetier("Indiquez un client, un prospect ou au moins un nom à contrôler.", 422);

  const s: SujetControle = base ?? { typePersonne: d.type_personne ?? 'physique', nom: '', alias: [], pieces: [] };
  if (d.nom?.trim()) s.nom = d.nom.trim();
  if (d.prenom?.trim()) s.prenom = d.prenom.trim();
  if (d.type_personne) s.typePersonne = d.type_personne;
  if (d.alias?.length) s.alias = [...new Set([...s.alias, ...d.alias.map((a) => a.trim()).filter(Boolean)])];
  if (d.date_naissance) {
    const dn = new Date(d.date_naissance);
    if (Number.isNaN(dn.getTime())) throw new ErreurMetier('Date de naissance invalide', 422);
    s.dateNaissance = dn;
  }
  if (d.pays?.trim()) s.pays = d.pays.trim();
  if (d.entreprise?.trim()) s.entreprise = d.entreprise.trim();
  if (d.numero_piece?.trim()) s.pieces = [...s.pieces, d.numero_piece.trim()];
  if (motsDuNom(libelle(s)).length === 0) throw new ErreurMetier('Le nom à contrôler est vide ou illisible.', 422);
  return s;
}

// ─── Recherche et tri des correspondances ─────────────────────────────────────

function rechercherSujet(index: IndexSanctions, s: SujetControle, seuil: number): CorrespondanceScreening[] {
  const type = s.typePersonne === 'morale' ? 'entite' : 'individu';
  const noms = [libelle(s), ...(s.prenom ? [`${s.nom} ${s.prenom}`] : []), ...s.alias];
  const principal = index.rechercher({ type, noms, dateNaissance: s.dateNaissance, pays: s.pays, identifiants: s.pieces }, seuil).map((c) => ({ ...c, champ: 'nom' as const }));
  // L'employeur d'une personne physique est contrôlé comme une société.
  const entreprise = s.entreprise && type === 'individu'
    ? index.rechercher({ type: 'entite', noms: [s.entreprise], pays: s.pays }, seuil).map((c) => ({ ...c, champ: 'entreprise' as const }))
    : [];
  return [...principal, ...entreprise].sort((a, b) => RANG[b.confiance] - RANG[a.confiance] || b.score - a.score);
}

interface Tri {
  retenues: CorrespondanceScreening[];
  ecartees: (CorrespondanceScreening & { ecartee_le: string })[];
  non_retenues: CorrespondanceScreening[];
}

async function trier(s: SujetControle, empreinte: string, trouvees: CorrespondanceScreening[], confianceMin: Confiance, memos?: { entreeId: number; empreinteEntree: string; empreinteSujet: string; createdAt: Date }[]): Promise<Tri> {
  const lignes = memos ?? (s.clientId || s.prospectId
    ? await prisma.screeningEcartee.findMany({ where: s.clientId ? { clientId: s.clientId } : { prospectId: s.prospectId }, select: { entreeId: true, empreinteEntree: true, empreinteSujet: true, createdAt: true } })
    : []);
  const par = new Map(lignes.map((m) => [m.entreeId, m]));
  const tri: Tri = { retenues: [], ecartees: [], non_retenues: [] };
  for (const c of trouvees) {
    const m = par.get(c.entree_id);
    // Écartée seulement si ni l'identité contrôlée ni l'inscription OFAC n'ont changé depuis la décision.
    if (m && m.empreinteEntree === c.empreinte_entree && m.empreinteSujet === empreinte) tri.ecartees.push({ ...c, ecartee_le: m.createdAt.toISOString() });
    else if (RANG[c.confiance] < RANG[confianceMin]) tri.non_retenues.push(c);
    else tri.retenues.push(c);
  }
  return tri;
}

// ─── Enregistrement ───────────────────────────────────────────────────────────

const SELECT_LISTE = { id: true } as const;

async function enregistrer(p: {
  sujet: SujetControle; empreinte: string; statut: StatutScreening; seuil: number; tri?: Tri; versions?: VersionListe[]; avertissements?: string[]; erreur?: string;
  declencheur: DeclencheurScreening; acteurId?: number | null; cle?: string; confianceMin?: Confiance;
}) {
  const retenues = p.tri?.retenues ?? [];
  const potentielle = p.statut === 'correspondance_potentielle';
  const scoreMax = retenues.length ? Math.max(...retenues.map((c) => c.score)) : null;
  const s = p.sujet;

  const cree = await prisma.$transaction(async (tx) => {
    const ligne = await tx.screeningVerification.create({
      data: {
        reference: `TMP-${createHash('sha1').update(`${Date.now()}${Math.random()}`).digest('hex').slice(0, 20)}`,
        clientId: s.clientId ?? null, prospectId: s.prospectId ?? null, typePersonne: s.typePersonne, nom: s.nom.slice(0, 200), prenom: s.prenom?.slice(0, 200) ?? null,
        alias: s.alias, dateNaissance: s.dateNaissance ?? null, pays: s.pays?.slice(0, 100) ?? null, entreprise: s.entreprise?.slice(0, 200) ?? null,
        numeroPiece: s.pieces.length ? s.pieces.join(', ').slice(0, 80) : null, empreinteSujet: p.empreinte, statut: p.statut, scoreMax, seuil: p.seuil,
        nbCorrespondances: retenues.length,
        resultat: p.tri ? ({
          statut_initial: p.statut, cle: p.cle ?? null, confiance_min: p.confianceMin ?? 'faible',
          correspondances: p.tri.retenues, ecartees: p.tri.ecartees, non_retenues: p.tri.non_retenues,
        } as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        avertissements: p.avertissements ?? [], erreur: p.erreur ?? null, versionListes: (p.versions ?? []) as unknown as Prisma.InputJsonValue,
        declencheur: p.declencheur, creeParId: p.acteurId ?? null, revueStatut: potentielle ? 'a_revoir' : 'non_requise',
      },
      select: SELECT_LISTE,
    });
    return tx.screeningVerification.update({ where: { id: ligne.id }, data: { reference: `SCR-${new Date().getFullYear()}-${String(ligne.id).padStart(6, '0')}` } });
  });

  if (potentielle) {
    const meilleure = retenues.reduce((m, c) => (RANG[c.confiance] > RANG[m] ? c.confiance : m), 'faible' as Confiance);
    const cree_ = await alerter({
      code: 'sanctions_correspondance', niveau: NIVEAU_ALERTE[meilleure], titre: `Correspondance de sanctions potentielle : ${libelle(s)}`,
      description: `${retenues.length} correspondance(s) potentielle(s) avec les listes de sanctions (meilleur score ${scoreMax} %, confiance ${meilleure}). Revue requise : ${cree.reference}. Une ressemblance de nom ne constitue pas une identification.`,
      empreinte: `ofac:${cree.id}`, entiteType: s.clientId ? 'client' : s.prospectId ? 'prospect' : 'screening', entiteId: s.clientId ?? s.prospectId ?? cree.id, agenceId: s.agenceId ?? null,
      donnees: { screeningId: cree.id, reference: cree.reference },
    });
    if (cree_) {
      const alerte = await prisma.alerteConformite.findUnique({ where: { empreinte: `ofac:${cree.id}` }, select: { id: true } });
      if (alerte) await prisma.screeningVerification.update({ where: { id: cree.id }, data: { alerteId: alerte.id } });
    }
  }
  await createLog({
    utilisateurId: p.acteurId ?? undefined, utilisateurLabel: p.acteurId ? 'utilisateur' : p.declencheur, agenceId: s.agenceId ?? undefined, module: 'conformite', action: 'SCREENING_SANCTIONS',
    entiteType: s.clientId ? 'client' : s.prospectId ? 'prospect' : 'screening', entiteId: s.clientId ?? s.prospectId ?? cree.id,
    description: `Contrôle de sanctions ${cree.reference} : ${p.statut}${scoreMax !== null ? ` (score ${scoreMax})` : ''}`,
  });
  return prisma.screeningVerification.findUniqueOrThrow({ where: { id: cree.id } });
}

// ─── Lancement d'un contrôle ──────────────────────────────────────────────────

async function seuilEtConfiance() {
  const seuil = await parametreNombre('conformite.ofac_seuil');
  const brut = await parametre<string>('conformite.ofac_confiance_min');
  return { seuil, confianceMin: (['faible', 'moyenne', 'forte'].includes(brut) ? brut : 'faible') as Confiance };
}

/** Lance un contrôle et l'enregistre. Une défaillance technique est enregistrée comme telle, jamais comme « aucune correspondance ». */
export async function lancer(actor: JwtPayload | null, demande: DemandeScreening, declencheur: DeclencheurScreening = 'manuel') {
  const sujet = await resoudreSujet(actor, demande);
  const empreinte = empreinteSujet(sujet);
  const { seuil, confianceMin } = await seuilEtConfiance().catch(() => ({ seuil: 85, confianceMin: 'faible' as Confiance }));
  try {
    const { index, versions, avertissements } = await chargerIndex();
    if (!index) {
      return await enregistrer({ sujet, empreinte, statut: 'erreur_technique', seuil, versions, avertissements, declencheur, acteurId: actor?.sub, erreur: "Aucune liste de sanctions n'est chargée : le contrôle n'a pas pu être effectué. Lancez une synchronisation des listes (Conformité > Sanctions)." });
    }
    const tri = await trier(sujet, empreinte, rechercherSujet(index, sujet, seuil), confianceMin);
    return await enregistrer({
      sujet, empreinte, statut: tri.retenues.length ? 'correspondance_potentielle' : 'aucune_correspondance', seuil, tri, versions, avertissements, declencheur, acteurId: actor?.sub, confianceMin,
    });
  } catch (e) {
    console.error('[ofac] contrôle', e);
    return enregistrer({ sujet, empreinte, statut: 'erreur_technique', seuil, declencheur, acteurId: actor?.sub, erreur: `Erreur technique pendant le contrôle : ${(e as Error).message}`.slice(0, 500) });
  }
}

/** Contrôle d'un nouveau client/prospect. Silencieux : n'échoue jamais, n'enregistre rien tant qu'aucune liste n'est chargée. */
export async function lancerAutomatique(cible: { client_id?: number; prospect_id?: number }): Promise<void> {
  try {
    if (!(await parametre<boolean>('conformite.ofac_depistage_auto'))) return;
    const { index } = await chargerIndex();
    if (!index) return;
    await lancer(null, cible, 'automatique');
  } catch (e) {
    console.error('[ofac] contrôle automatique', e);
  }
}

// ─── Surveillance continue ────────────────────────────────────────────────────

export interface BilanPortefeuille { examines: number; avec_correspondance: number; deja_traites: number }

/**
 * Contrôle les clients et prospects en portefeuille. Avec `entreeIds`, seules les inscriptions
 * nouvelles ou modifiées sont recherchées (rapide, utilisé après chaque mise à jour des listes).
 * Sans, tout le portefeuille est confronté à toutes les listes (première mise en service).
 * Un contrôle n'est enregistré que s'il y a une correspondance à examiner, et jamais deux fois
 * pour la même situation (même identité, mêmes inscriptions).
 */
export async function depisterPortefeuille(opts: { entreeIds?: number[]; liste?: ListeSanction } = {}): Promise<BilanPortefeuille> {
  const { index: complet, versions, avertissements } = await chargerIndex();
  if (!complet) throw new ErreurMetier("Aucune liste de sanctions n'est chargée.", 409);
  let index = complet;
  if (opts.entreeIds || opts.liste) {
    // Inscriptions précises (surveillance continue) ou toutes celles d'une liste (liste ajoutée après coup).
    const ids = new Set(opts.entreeIds ?? []);
    const entrees = complet.entrees.filter((e) => (opts.liste ? e.liste === opts.liste : ids.has(e.id)));
    if (entrees.length === 0) return { examines: 0, avec_correspondance: 0, deja_traites: 0 };
    index = new IndexSanctions(entrees, complet.rarete);
  }
  const { seuil, confianceMin } = await seuilEtConfiance();
  const bilan: BilanPortefeuille = { examines: 0, avec_correspondance: 0, deja_traites: 0 };

  const traiter = async (sujet: SujetControle, memos: Awaited<ReturnType<typeof prisma.screeningEcartee.findMany>>) => {
    bilan.examines++;
    const empreinte = empreinteSujet(sujet);
    const tri = await trier(sujet, empreinte, rechercherSujet(index, sujet, seuil), confianceMin, memos);
    if (tri.retenues.length === 0) return;
    const cle = empreinteDe({ s: empreinte, e: tri.retenues.map((c) => `${c.entree_id}:${c.empreinte_entree}`).sort() });
    const deja = await prisma.screeningVerification.findFirst({
      where: { ...(sujet.clientId ? { clientId: sujet.clientId } : { prospectId: sujet.prospectId }), resultat: { path: ['cle'], equals: cle } }, select: { id: true },
    });
    if (deja) { bilan.deja_traites++; return; }
    await enregistrer({ sujet, empreinte, statut: 'correspondance_potentielle', seuil, tri, versions, avertissements, declencheur: 'surveillance_continue', cle, confianceMin });
    bilan.avec_correspondance++;
  };

  const LOT = 200;
  for (let curseur = 0; ; ) {
    const clients = await prisma.client.findMany({ where: { id: { gt: curseur }, statut: { not: 'inactif' } }, orderBy: { id: 'asc' }, take: LOT, select: { ...SELECT_FICHE, agenceId: true } });
    if (clients.length === 0) break;
    curseur = clients[clients.length - 1].id;
    const [pieces, memos] = await Promise.all([piecesKyc(clients.map((c) => c.id)), prisma.screeningEcartee.findMany({ where: { clientId: { in: clients.map((c) => c.id) } } })]);
    for (const c of clients) await traiter(sujetDeFiche(c, 'client', pieces.get(c.id) ?? []), memos.filter((m) => m.clientId === c.id));
    await new Promise((r) => setImmediate(r));
  }
  for (let curseur = 0; ; ) {
    const prospects = await prisma.prospect.findMany({ where: { id: { gt: curseur }, statut: { notIn: ['converti', 'perdu'] } }, orderBy: { id: 'asc' }, take: LOT, select: { ...SELECT_FICHE, commercial: { select: { agenceId: true } } } });
    if (prospects.length === 0) break;
    curseur = prospects[prospects.length - 1].id;
    const memos = await prisma.screeningEcartee.findMany({ where: { prospectId: { in: prospects.map((p) => p.id) } } });
    for (const p of prospects) await traiter(sujetDeFiche({ ...p, agenceId: p.commercial?.agenceId ?? null }, 'prospect', []), memos.filter((m) => m.prospectId === p.id));
    await new Promise((r) => setImmediate(r));
  }
  return bilan;
}

// ─── Consultation ─────────────────────────────────────────────────────────────

type Controle = Awaited<ReturnType<typeof prisma.screeningVerification.findUniqueOrThrow>>;

const MESSAGE: Record<StatutScreening, string> = {
  aucune_correspondance: 'Aucune correspondance avec les listes de sanctions.',
  correspondance_potentielle: 'Correspondance potentielle : le contrôle est transmis à la conformité pour examen. Aucune conclusion ne doit en être tirée à ce stade.',
  correspondance_confirmee: 'Contrôle examiné par la conformité : les mesures prévues par la procédure interne s\'appliquent.',
  erreur_technique: 'Le contrôle n\'a pas pu être effectué. Réessayez ou contactez la conformité.',
};

/**
 * `detail` : accès au détail des rapprochements (noms et programmes des personnes listées), réservé à la
 * conformité. Les autres utilisateurs voient seulement le statut, afin de ne pas révéler une suspicion
 * à la personne concernée ni de lui faire porter une accusation fondée sur un simple homonyme.
 */
export function presenter(c: Controle, detail: boolean) {
  const base = {
    id: c.id, reference: c.reference, client_id: c.clientId, prospect_id: c.prospectId, statut: c.statut, message: MESSAGE[c.statut],
    revue_statut: c.revueStatut, declencheur: c.declencheur, created_at: c.createdAt,
    controle: { nom: c.nom, prenom: c.prenom, type_personne: c.typePersonne, alias: c.alias, date_naissance: c.dateNaissance, pays: c.pays, entreprise: c.entreprise },
    avertissements: c.avertissements,
  };
  if (!detail) return base;
  const r = (c.resultat ?? {}) as { correspondances?: unknown[]; ecartees?: unknown[]; non_retenues?: unknown[]; statut_initial?: string };
  return {
    ...base, score_max: c.scoreMax, seuil: c.seuil, nb_correspondances: c.nbCorrespondances, numero_piece: c.numeroPiece,
    correspondances: r.correspondances ?? [], ecartees: r.ecartees ?? [], non_retenues: r.non_retenues ?? [], statut_initial: r.statut_initial ?? c.statut,
    versions_listes: c.versionListes, erreur: c.erreur,
    revue: c.revueAt ? { decision: c.decision, commentaire: c.commentaireRevue, revue_par_id: c.revueParId, revue_at: c.revueAt } : null, alerte_id: c.alerteId,
  };
}

/** La fiche client ou prospect est-elle dans le périmètre de lecture de l'acteur ? */
export async function ficheAccessible(actor: JwtPayload, cible: { clientId?: number | null; prospectId?: number | null }): Promise<boolean> {
  if (cible.clientId) return (await prisma.client.count({ where: { id: cible.clientId, ...(await filtreClients(actor)) } })) > 0;
  if (cible.prospectId) return (await prisma.prospect.count({ where: { id: cible.prospectId, ...(await filtreProspects(actor)) } })) > 0;
  return false;
}

/** Un contrôle est visible de la conformité, et de qui peut voir le client ou le prospect concerné. */
export async function accessible(actor: JwtPayload, c: Controle, voitTout: boolean): Promise<boolean> {
  if (voitTout) return true;
  if (c.clientId || c.prospectId) return ficheAccessible(actor, c);
  return c.creeParId === actor.sub;
}

export async function obtenir(id: number) {
  const c = await prisma.screeningVerification.findUnique({ where: { id } });
  if (!c) throw new ErreurMetier('Contrôle introuvable', 404);
  return c;
}

export async function historique(cible: { clientId?: number; prospectId?: number }) {
  return prisma.screeningVerification.findMany({ where: cible.clientId ? { clientId: cible.clientId } : { prospectId: cible.prospectId }, orderBy: { id: 'desc' }, take: 100 });
}

export async function lister(q: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(q.page ?? '1'), 10) || 1);
  const parPage = Math.min(100, Math.max(1, parseInt(String(q.per_page ?? '20'), 10) || 20));
  const where: Prisma.ScreeningVerificationWhereInput = {};
  if (q.statut) where.statut = q.statut as StatutScreening;
  if (q.revue_statut) where.revueStatut = q.revue_statut as never;
  else if (q.a_revoir === 'true') where.revueStatut = { in: ['a_revoir', 'escaladee'] };
  if (q.search) {
    const t = { contains: String(q.search), mode: 'insensitive' as const };
    where.OR = [{ nom: t }, { prenom: t }, { reference: t }];
  }
  const [items, total] = await Promise.all([
    prisma.screeningVerification.findMany({
      where, orderBy: [{ revueStatut: 'asc' }, { id: 'desc' }], skip: (page - 1) * parPage, take: parPage,
      include: { client: { select: { id: true, nom: true, prenom: true } }, prospect: { select: { id: true, nom: true, prenom: true } } },
    }),
    prisma.screeningVerification.count({ where }),
  ]);
  return {
    items: items.map((c) => ({
      id: c.id, reference: c.reference, statut: c.statut, revue_statut: c.revueStatut, decision: c.decision, score_max: c.scoreMax, nb_correspondances: c.nbCorrespondances,
      nom: [c.prenom, c.nom].filter(Boolean).join(' '), client_id: c.clientId, prospect_id: c.prospectId, declencheur: c.declencheur, created_at: c.createdAt,
    })),
    meta: { page, per_page: parPage, total },
  };
}

export async function compteurs() {
  const [parRevue, parStatut] = await Promise.all([
    prisma.screeningVerification.groupBy({ by: ['revueStatut'], _count: true }),
    prisma.screeningVerification.groupBy({ by: ['statut'], _count: true }),
  ]);
  return { par_revue: Object.fromEntries(parRevue.map((x) => [x.revueStatut, x._count])), par_statut: Object.fromEntries(parStatut.map((x) => [x.statut, x._count])) };
}
