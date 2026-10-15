import { DecisionRevueScreening, Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { createLog } from '../../lib/logger';
import { emettre } from '../../lib/notifier';
import { ErreurMetier } from '../../lib/rbac';
import type { JwtPayload } from '../../middleware/auth';
import type { CorrespondanceScreening } from './ofacScreening.service';

/**
 * Revue humaine d'un contrôle OFAC (agent habilité, droit `conformite:APPROVE`).
 *
 * Trois décisions seulement :
 *  - `faux_positif` : homonyme ou ressemblance fortuite. Les correspondances sont écartées et ne
 *    déclencheront plus d'alerte tant que ni l'identité du client ni l'inscription OFAC ne changent ;
 *  - `correspondance_confirmee` : la personne contrôlée est bien celle de la liste (les inscriptions
 *    concernées sont désignées). L'alerte reste ouverte : le gel, la déclaration ou le refus relèvent
 *    de la procédure interne et de la loi, pas de ce logiciel, qui ne bloque rien de lui-même ;
 *  - `escalade` : le dossier est transmis à un niveau supérieur sans être tranché.
 * Toute décision exige une justification écrite, conservée avec le nom de son auteur.
 */

export interface DemandeRevue {
  decision: DecisionRevueScreening;
  commentaire: string;
  /** Pour une correspondance confirmée : identifiants des inscriptions (`entree_id`) effectivement confirmées. */
  entree_ids?: number[];
}

const MINIMUM: Record<DecisionRevueScreening, number> = { faux_positif: 10, escalade: 10, correspondance_confirmee: 20 };

export async function reviser(actor: JwtPayload, id: number, d: DemandeRevue) {
  const c = await prisma.screeningVerification.findUnique({ where: { id } });
  if (!c) throw new ErreurMetier('Contrôle introuvable', 404);
  if (c.revueStatut !== 'a_revoir' && c.revueStatut !== 'escaladee') {
    throw new ErreurMetier(c.revueStatut === 'revue' ? 'Ce contrôle a déjà été examiné. Relancez un contrôle si la situation a changé.' : "Ce contrôle ne requiert pas de revue : aucune correspondance potentielle n'a été retenue.", 409);
  }
  const commentaire = d.commentaire.trim();
  if (commentaire.length < MINIMUM[d.decision]) throw new ErreurMetier(`Une justification d'au moins ${MINIMUM[d.decision]} caractères est obligatoire pour cette décision.`, 422);

  const r = (c.resultat ?? {}) as { correspondances?: CorrespondanceScreening[] };
  const correspondances = r.correspondances ?? [];
  let confirmees: number[] = [];
  if (d.decision === 'correspondance_confirmee') {
    confirmees = [...new Set(d.entree_ids ?? [])];
    if (confirmees.length === 0) throw new ErreurMetier('Désignez la ou les inscriptions OFAC confirmées.', 422);
    const connues = new Set(correspondances.map((x) => x.entree_id));
    if (confirmees.some((e) => !connues.has(e))) throw new ErreurMetier("Une inscription désignée ne figure pas parmi les correspondances de ce contrôle.", 422);
  }
  // Correspondances que cette décision écarte : toutes pour un faux positif, les non confirmées sinon.
  const aEcarter = d.decision === 'faux_positif' ? correspondances : d.decision === 'correspondance_confirmee' ? correspondances.filter((x) => !confirmees.includes(x.entree_id)) : [];

  const maj = await prisma.$transaction(async (tx) => {
    if (c.clientId || c.prospectId) {
      for (const x of aEcarter) {
        const cle = c.clientId ? { clientId: c.clientId } : { prospectId: c.prospectId };
        const existant = await tx.screeningEcartee.findFirst({ where: { ...cle, entreeId: x.entree_id }, select: { id: true } });
        const data = { entreeId: x.entree_id, empreinteEntree: x.empreinte_entree, empreinteSujet: c.empreinteSujet, screeningId: c.id, decideParId: actor.sub };
        if (existant) await tx.screeningEcartee.update({ where: { id: existant.id }, data });
        else await tx.screeningEcartee.create({ data: { ...cle, ...data } });
      }
    }
    const resultat = { ...((c.resultat ?? {}) as object), confirmees } as unknown as Prisma.InputJsonValue;
    const maj = await tx.screeningVerification.update({
      where: { id },
      data: {
        decision: d.decision, commentaireRevue: commentaire, revueParId: actor.sub, revueAt: new Date(), resultat,
        revueStatut: d.decision === 'escalade' ? 'escaladee' : 'revue',
        statut: d.decision === 'faux_positif' ? 'aucune_correspondance' : d.decision === 'correspondance_confirmee' ? 'correspondance_confirmee' : c.statut,
      },
    });
    if (c.alerteId) {
      // Faux positif : l'alerte est close. Confirmation ou escalade : elle reste ouverte, suivie jusqu'à l'application de la procédure.
      await tx.alerteConformite.update({
        where: { id: c.alerteId },
        data: d.decision === 'faux_positif'
          ? { statut: 'fausse_alerte', commentaireTraitement: commentaire, traiteParId: actor.sub, traiteAt: new Date() }
          : { statut: 'en_cours', commentaireTraitement: commentaire, traiteParId: actor.sub, ...(d.decision === 'correspondance_confirmee' ? { niveau: 'critique' as const } : {}) },
      });
    }
    return maj;
  });

  const personne = [c.prenom, c.nom].filter(Boolean).join(' ');
  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined, module: 'conformite', action: `REVUE_SANCTIONS_${d.decision.toUpperCase()}`,
    entiteType: c.clientId ? 'client' : c.prospectId ? 'prospect' : 'screening', entiteId: c.clientId ?? c.prospectId ?? c.id,
    description: `Contrôle de sanctions ${c.reference} : ${d.decision.replace('_', ' ')}. ${commentaire}`.slice(0, 1000),
  });
  const donnees = { reference: c.reference, personne, revuePar: actor.email, commentaire, lien: '/dashboard/conformite' };
  if (d.decision === 'correspondance_confirmee') void emettre('conformite.sanctions_confirmee', { entiteType: 'screening', entiteId: c.id, donnees });
  if (d.decision === 'escalade') void emettre('conformite.sanctions_escalade', { entiteType: 'screening', entiteId: c.id, donnees });
  return maj;
}
