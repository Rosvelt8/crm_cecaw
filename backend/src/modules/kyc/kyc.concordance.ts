import prisma from '../../lib/prisma';

/**
 * Concordance entre le dossier KYC (pièces, justificatifs) et la fiche du client ou du prospect.
 * Calculée à la demande, jamais stockée : elle reflète toujours l'état courant de la fiche, si bien
 * qu'une correction faite après coup apparaît aussitôt. Chaque vérification est rattachée aux
 * contrôles KYC qu'elle éclaire, pour que le contrôleur voie la preuve en face de sa décision.
 */

export type StatutVerification = 'ok' | 'ecart' | 'manquant' | 'info';

export interface Verification {
  code: string;
  groupe: 'identite' | 'coordonnees' | 'activite' | 'finances' | 'doublons' | 'sanctions';
  libelle: string;
  statut: StatutVerification;
  /** Ce que dit la fiche. */
  fiche: string | null;
  /** Ce que montre le dossier (pièce, justificatif, base). */
  dossier: string | null;
  detail?: string;
  /** Codes des contrôles KYC que cette vérification éclaire. */
  controles: string[];
}

const norm = (s?: string | null) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const jours = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86_400_000);
const fmtDate = (d?: Date | null) => (d ? d.toLocaleDateString('fr-FR') : null);
const fcfa = (n: number) => `${new Intl.NumberFormat('fr-FR').format(Math.round(n))} FCFA`;
const present = (v?: string | null) => !!v && v.trim().length > 0;

export async function calculerConcordance(dossierId: number) {
  const d = await prisma.dossierKyc.findUniqueOrThrow({
    where: { id: dossierId },
    include: { piecesIdentite: { include: { pieceJointe: true }, orderBy: { createdAt: 'asc' } }, piecesJointes: { where: { archiveAt: null } } },
  });
  const estClient = d.clientId != null;
  const personne = estClient
    ? await prisma.client.findUniqueOrThrow({ where: { id: d.clientId! }, include: { agence: { select: { nom: true } }, commercial: { select: { prenom: true, nom: true } }, zone: { select: { nom: true } }, sourcesRevenu: true, charges: true } })
    : await prisma.prospect.findUniqueOrThrow({ where: { id: d.prospectId! }, include: { commercial: { select: { prenom: true, nom: true } }, zone: { select: { nom: true } } } });
  const client = estClient ? (personne as Awaited<ReturnType<typeof prisma.client.findUniqueOrThrow>> & { sourcesRevenu: { montantMensuel: unknown; justifie: boolean }[]; charges: { montantMensuel: unknown }[] }) : null;
  const morale = personne.typePersonne === 'morale';
  const v: Verification[] = [];
  const add = (x: Verification) => v.push(x);
  const maintenant = new Date();

  // ── Identité ──────────────────────────────────────────────────────────────
  add({ code: 'nom', groupe: 'identite', libelle: morale ? 'Raison sociale' : 'Nom et prénom', statut: present(personne.nom) && (morale || present(personne.prenom)) ? 'ok' : 'manquant', fiche: `${personne.prenom ?? ''} ${personne.nom}`.trim() || null, dossier: null, detail: morale || present(personne.prenom) ? undefined : 'Prénom non renseigné sur la fiche.', controles: ['identite_conforme', 'homonymie'] });

  if (d.piecesIdentite.length === 0) {
    add({ code: 'piece_numero', groupe: 'identite', libelle: "Numéro de la pièce d'identité", statut: 'manquant', fiche: personne.numeroCni ?? null, dossier: null, detail: "Aucune pièce d'identité enregistrée dans le dossier.", controles: ['identite_conforme'] });
  } else {
    const nums = d.piecesIdentite.map((p) => p.numero);
    const fiche = personne.numeroCni;
    const statut: StatutVerification = !present(fiche) ? 'manquant' : nums.some((n) => norm(n) === norm(fiche)) ? 'ok' : 'ecart';
    add({ code: 'piece_numero', groupe: 'identite', libelle: "Numéro de la pièce d'identité", statut, fiche: fiche ?? null, dossier: nums.join(' ; '), detail: statut === 'manquant' ? 'La fiche ne mentionne pas de numéro de pièce : à compléter pour pouvoir comparer.' : statut === 'ecart' ? 'Le numéro saisi dans le dossier ne correspond pas à celui de la fiche : relire la pièce et corriger la fiche ou le dossier.' : undefined, controles: ['identite_conforme'] });
  }

  const sansScan = d.piecesIdentite.filter((p) => !p.pieceJointeId);
  add({ code: 'piece_scan', groupe: 'identite', libelle: "Copie de la pièce d'identité", statut: d.piecesIdentite.length === 0 || sansScan.length > 0 ? 'manquant' : 'ok', fiche: null, dossier: `${d.piecesIdentite.length - sansScan.length}/${d.piecesIdentite.length} pièce(s) avec fichier`, detail: sansScan.length ? 'Au moins une pièce n\'a pas de copie jointe : impossible de vérifier le numéro et la validité sur le document.' : undefined, controles: ['identite_conforme'] });

  const datees = d.piecesIdentite.filter((p) => p.dateExpiration);
  if (d.piecesIdentite.length > 0) {
    const expirees = datees.filter((p) => p.dateExpiration! < maintenant);
    const proches = datees.filter((p) => p.dateExpiration! >= maintenant && jours(p.dateExpiration!, maintenant) <= 90);
    add({ code: 'piece_validite', groupe: 'identite', libelle: "Validité de la pièce d'identité", statut: datees.length === 0 ? 'manquant' : expirees.length ? 'ecart' : proches.length ? 'ecart' : 'ok', fiche: null, dossier: datees.map((p) => `expire le ${fmtDate(p.dateExpiration)}`).join(' ; ') || null, detail: datees.length === 0 ? "Date d'expiration non saisie." : expirees.length ? "Pièce expirée : exiger un document en cours de validité (ou un récépissé de renouvellement)." : proches.length ? 'La pièce expire dans moins de 90 jours.' : undefined, controles: ['identite_conforme'] });
  }

  if (!morale) {
    const dn = personne.dateNaissance;
    const age = dn ? Math.floor(jours(maintenant, dn) / 365.25) : null;
    add({ code: 'date_naissance', groupe: 'identite', libelle: 'Date de naissance', statut: !dn ? 'manquant' : age! < 18 ? 'ecart' : 'ok', fiche: dn ? `${fmtDate(dn)} (${age} ans)` : null, dossier: null, detail: !dn ? 'Non renseignée : à relever sur la pièce d\'identité.' : age! < 18 ? 'Personne mineure : un crédit ne peut pas être accordé sans représentant légal.' : undefined, controles: ['identite_conforme', 'homonymie'] });
    add({ code: 'lieu_naissance', groupe: 'identite', libelle: 'Lieu de naissance', statut: present(personne.lieuNaissance) ? 'ok' : 'manquant', fiche: personne.lieuNaissance ?? null, dossier: null, controles: ['identite_conforme'] });
    add({ code: 'nationalite', groupe: 'identite', libelle: 'Nationalité', statut: present(personne.nationalite) ? 'ok' : 'manquant', fiche: personne.nationalite ?? null, dossier: null, controles: ['identite_conforme', 'origine_fonds'] });
  } else {
    add({ code: 'registre', groupe: 'identite', libelle: 'RCCM et NUI', statut: present(personne.rccm) && present(personne.nui) ? 'ok' : 'manquant', fiche: [personne.rccm && `RCCM ${personne.rccm}`, personne.nui && `NUI ${personne.nui}`].filter(Boolean).join(' · ') || null, dossier: null, detail: present(personne.rccm) && present(personne.nui) ? undefined : 'RCCM et/ou NUI manquant : joindre l\'extrait de registre.', controles: ['identite_conforme', 'activite_verifiee'] });
  }

  // ── Coordonnées ───────────────────────────────────────────────────────────
  const chiffresTel = (personne.telephone ?? '').replace(/\D/g, '');
  add({ code: 'telephone', groupe: 'coordonnees', libelle: 'Téléphone', statut: chiffresTel.length >= 8 && chiffresTel.length <= 15 ? 'ok' : 'ecart', fiche: personne.telephone || null, dossier: null, detail: chiffresTel.length >= 8 && chiffresTel.length <= 15 ? undefined : 'Numéro invalide ou incomplet.', controles: ['adresse_verifiee'] });
  add({ code: 'adresse', groupe: 'coordonnees', libelle: 'Adresse du domicile', statut: present(personne.adresse) ? 'ok' : 'manquant', fiche: [personne.adresse, personne.quartier, personne.ville].filter(present).join(', ') || null, dossier: null, controles: ['adresse_verifiee'] });
  add({ code: 'geoloc_domicile', groupe: 'coordonnees', libelle: 'Géolocalisation du domicile', statut: personne.latitude != null && personne.longitude != null ? 'ok' : 'manquant', fiche: personne.latitude != null ? `${Number(personne.latitude).toFixed(5)}, ${Number(personne.longitude).toFixed(5)}` : null, dossier: null, detail: personne.latitude == null ? "Domicile non géolocalisé : une visite terrain est nécessaire pour vérifier l'adresse." : undefined, controles: ['adresse_verifiee'] });
  const justifsDomicile = d.piecesJointes.filter((p) => /domicile|adresse|eau|électricité|electricite|loyer|facture/i.test(p.intitule));
  add({ code: 'justif_adresse', groupe: 'coordonnees', libelle: "Justificatif d'adresse", statut: justifsDomicile.length ? 'ok' : 'manquant', fiche: null, dossier: justifsDomicile.map((p) => p.intitule).join(' ; ') || null, detail: justifsDomicile.length ? undefined : "Aucun justificatif joint (facture d'eau ou d'électricité, quittance de loyer, attestation de résidence…).", controles: ['adresse_verifiee'] });

  // ── Activité ──────────────────────────────────────────────────────────────
  add({ code: 'activite', groupe: 'activite', libelle: morale ? "Secteur d'activité" : 'Profession et activité', statut: present(personne.profession) || present(personne.secteurActivite) ? 'ok' : 'manquant', fiche: [personne.profession, personne.secteurActivite, personne.employeur].filter(present).join(' · ') || null, dossier: null, controles: ['activite_verifiee', 'revenus_justifies'] });
  if (client) {
    add({ code: 'geoloc_activite', groupe: 'activite', libelle: "Localisation de l'activité", statut: client.latitudeActivite != null ? 'ok' : 'manquant', fiche: client.latitudeActivite != null ? `${Number(client.latitudeActivite).toFixed(5)}, ${Number(client.longitudeActivite).toFixed(5)}` : null, dossier: null, detail: client.latitudeActivite == null ? "L'emplacement de l'activité n'est pas relevé : vérification sur place nécessaire." : undefined, controles: ['activite_verifiee'] });
    add({ code: 'anciennete', groupe: 'activite', libelle: "Ancienneté de l'activité", statut: client.ancienneteActiviteMois != null ? 'ok' : 'manquant', fiche: client.ancienneteActiviteMois != null ? `${client.ancienneteActiviteMois} mois` : null, dossier: null, controles: ['activite_verifiee'] });
    const photosActivite = await prisma.pieceJointe.count({ where: { clientId: client.id, categorie: 'photo_activite', archiveAt: null } });
    add({ code: 'photo_activite', groupe: 'activite', libelle: "Photos de l'activité", statut: photosActivite > 0 ? 'ok' : 'manquant', fiche: null, dossier: `${photosActivite} photo(s)`, detail: photosActivite === 0 ? "Aucune photo prise sur le lieu d'activité." : undefined, controles: ['activite_verifiee'] });
    add({ code: 'photo_client', groupe: 'identite', libelle: 'Photo du client', statut: client.photoUrl ? 'ok' : 'manquant', fiche: client.photoUrl ? 'Photo présente' : null, dossier: null, detail: client.photoUrl ? undefined : "Pas de photo : le rapprochement visage / pièce d'identité est impossible.", controles: ['identite_conforme'] });

    // ── Finances ────────────────────────────────────────────────────────────
    const sources = client.sourcesRevenu;
    const totalSources = sources.reduce((s, x) => s + Number(x.montantMensuel), 0);
    const totalCharges = client.charges.reduce((s, x) => s + Number(x.montantMensuel), 0);
    const revenus = client.revenusMensuels != null ? Number(client.revenusMensuels) : null;
    let statutRev: StatutVerification; let detailRev: string | undefined;
    if (sources.length === 0) { statutRev = 'manquant'; detailRev = 'Aucune source de revenus détaillée : le revenu déclaré n\'est appuyé par rien.'; }
    else if (revenus != null && Math.abs(revenus - totalSources) > Math.max(1, totalSources * 0.1)) { statutRev = 'ecart'; detailRev = `Le revenu déclaré sur la fiche (${fcfa(revenus)}) diffère de plus de 10 % de la somme des sources (${fcfa(totalSources)}).`; }
    else statutRev = 'ok';
    add({ code: 'revenus', groupe: 'finances', libelle: 'Revenus mensuels déclarés', statut: statutRev, fiche: revenus != null ? fcfa(revenus) : null, dossier: sources.length ? `${sources.length} source(s) : ${fcfa(totalSources)}` : null, detail: detailRev, controles: ['revenus_justifies', 'origine_fonds'] });
    const justifies = sources.filter((s) => s.justifie).reduce((a, s) => a + Number(s.montantMensuel), 0);
    const part = totalSources > 0 ? Math.round((justifies / totalSources) * 100) : 0;
    const preuves = await prisma.pieceJointe.count({ where: { clientId: client.id, categorie: 'justificatif_financier', archiveAt: null } });
    add({ code: 'justification_revenus', groupe: 'finances', libelle: 'Revenus justifiés par des preuves', statut: sources.length === 0 ? 'manquant' : part >= 50 && preuves > 0 ? 'ok' : 'ecart', fiche: null, dossier: `${part} % des revenus cochés « justifié » · ${preuves} justificatif(s) financier(s)`, detail: part >= 50 && preuves > 0 ? undefined : 'Moins de la moitié des revenus est justifiée, ou aucun justificatif financier n\'est joint.', controles: ['revenus_justifies', 'origine_fonds'] });
    add({ code: 'charges', groupe: 'finances', libelle: 'Charges mensuelles', statut: client.charges.length === 0 ? 'manquant' : revenus != null && totalCharges > revenus ? 'ecart' : 'ok', fiche: client.chargesMensuelles != null ? fcfa(Number(client.chargesMensuelles)) : null, dossier: client.charges.length ? `${client.charges.length} ligne(s) : ${fcfa(totalCharges)}` : null, detail: client.charges.length === 0 ? 'Charges non détaillées.' : revenus != null && totalCharges > revenus ? 'Les charges dépassent les revenus déclarés.' : undefined, controles: ['revenus_justifies'] });

    // ── Doublons ────────────────────────────────────────────────────────────
    const doublons = await prisma.client.findMany({
      where: { id: { not: client.id }, OR: [
        ...(present(client.numeroCni) ? [{ numeroCni: client.numeroCni }] : []),
        { telephone: client.telephone },
        ...(client.dateNaissance ? [{ nom: { equals: client.nom, mode: 'insensitive' as const }, prenom: { equals: client.prenom ?? undefined, mode: 'insensitive' as const }, dateNaissance: client.dateNaissance }] : []),
      ] },
      select: { id: true, nom: true, prenom: true, telephone: true, numeroCni: true }, take: 5,
    });
    add({ code: 'doublons', groupe: 'doublons', libelle: 'Doublons dans la base clients', statut: doublons.length ? 'ecart' : 'ok', fiche: null, dossier: doublons.length ? doublons.map((x) => `${x.prenom ?? ''} ${x.nom} (#${x.id}${x.numeroCni && x.numeroCni === client.numeroCni ? ', même pièce' : x.telephone === client.telephone ? ', même téléphone' : ', même identité'})`).join(' ; ') : 'Aucun client avec la même pièce, le même téléphone ou la même identité', detail: doublons.length ? 'Vérifier qu\'il ne s\'agit pas de la même personne enregistrée deux fois.' : undefined, controles: ['homonymie'] });
  } else {
    add({ code: 'revenus', groupe: 'finances', libelle: 'Revenus mensuels déclarés', statut: personne.revenusMensuels != null ? 'info' : 'manquant', fiche: personne.revenusMensuels != null ? fcfa(Number(personne.revenusMensuels)) : null, dossier: null, detail: 'Prospect : les sources de revenus se détaillent après sa conversion en client.', controles: ['revenus_justifies'] });
    const doublons = await prisma.prospect.findMany({ where: { id: { not: personne.id }, OR: [...(present(personne.numeroCni) ? [{ numeroCni: personne.numeroCni }] : []), { telephone: personne.telephone }] }, select: { id: true, nom: true, prenom: true }, take: 5 });
    add({ code: 'doublons', groupe: 'doublons', libelle: 'Doublons dans la base prospects', statut: doublons.length ? 'ecart' : 'ok', fiche: null, dossier: doublons.length ? doublons.map((x) => `${x.prenom ?? ''} ${x.nom} (#${x.id})`).join(' ; ') : 'Aucun doublon détecté', controles: ['homonymie'] });
  }

  // ── Sanctions ─────────────────────────────────────────────────────────────
  const dernier = await prisma.screeningVerification.findFirst({ where: estClient ? { clientId: d.clientId! } : { prospectId: d.prospectId! }, orderBy: { createdAt: 'desc' }, select: { reference: true, statut: true, createdAt: true, nbCorrespondances: true, scoreMax: true, revueStatut: true } });
  if (!dernier) add({ code: 'sanctions', groupe: 'sanctions', libelle: 'Contrôle des sanctions (OFAC, ONU, UE, listes locales)', statut: 'manquant', fiche: null, dossier: null, detail: 'Aucun contrôle de sanctions effectué : le lancer depuis la fiche de la personne.', controles: ['listes_surveillance'] });
  else {
    const perime = dernier.createdAt < personne.updatedAt;
    const statut: StatutVerification = dernier.statut === 'aucune_correspondance' ? (perime ? 'ecart' : 'ok') : 'ecart';
    add({ code: 'sanctions', groupe: 'sanctions', libelle: 'Contrôle des sanctions (OFAC, ONU, UE, listes locales)', statut, fiche: null, dossier: `${dernier.reference} · ${fmtDate(dernier.createdAt)} · ${dernier.statut === 'aucune_correspondance' ? 'aucune correspondance' : dernier.statut === 'erreur_technique' ? 'erreur technique' : `${dernier.nbCorrespondances} correspondance(s), score ${dernier.scoreMax} %`}`, detail: dernier.statut !== 'aucune_correspondance' ? 'Correspondance ou erreur : traiter dans Conformité avant toute validation.' : perime ? 'La fiche a été modifiée depuis ce contrôle : le relancer.' : undefined, controles: ['listes_surveillance'] });
  }

  const resume = {
    total: v.length,
    ok: v.filter((x) => x.statut === 'ok').length,
    ecarts: v.filter((x) => x.statut === 'ecart').length,
    manquants: v.filter((x) => x.statut === 'manquant').length,
  };
  return { type: estClient ? 'client' : 'prospect', personne, verifications: v, resume };
}

/** Pièces du dossier que le contrôleur doit avoir ouvertes : copies des pièces d'identité et justificatifs. */
export async function piecesAConsulter(dossierId: number) {
  const d = await prisma.dossierKyc.findUniqueOrThrow({
    where: { id: dossierId },
    include: { piecesIdentite: { select: { pieceJointeId: true } }, piecesJointes: { where: { archiveAt: null }, select: { id: true } } },
  });
  const identite = d.piecesIdentite.map((p) => p.pieceJointeId).filter((x): x is number => x != null);
  const autres = d.piecesJointes.map((p) => p.id).filter((x) => !identite.includes(x));
  return { identite, autres };
}
