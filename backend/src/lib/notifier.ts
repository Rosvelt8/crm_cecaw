import prisma from './prisma';
import { mettreEnFileSms } from './sms';
import { appelerSysteme } from './echanges';
import { signerHmac } from './crypto';

/**
 * Moteur d'événements et de notifications (COMMUNICATION, TR-08).
 *
 * Toute action notable du métier appelle `emettre(code, …)`. L'événement est journalisé,
 * puis les déclencheurs paramétrés le transforment en notifications dans l'application,
 * en SMS (file d'envoi) et en webhooks sortants. `emettre` ne lève jamais d'exception :
 * une notification manquée ne doit pas annuler l'opération métier qui l'a produite.
 */

export interface EvenementEntree {
  entiteType?: string;
  entiteId?: number;
  agenceId?: number | null;
  acteurId?: number | null;
  /** Variables du gabarit et données transmises aux webhooks. Les clés `*Id` désignent des utilisateurs. */
  donnees?: Record<string, unknown>;
}

const ROLES_GLOBAUX = new Set(['R01', 'R02', 'R03', 'R14', 'R15']);
/** Repli pour les comptes sans affectation de rôle : le rôle historique vaut pour les rôles suivants. */
const REPLI_HISTORIQUE: Record<string, string[]> = { admin: ['R01', 'R02', 'R03'], manager: ['R04'], backoffice: ['R12', 'R07'], agent: ['R05', 'R10'] };

export function rendreGabarit(gabarit: string, donnees: Record<string, unknown>): string {
  return gabarit.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, cle: string) => {
    const v = donnees[cle];
    return v === undefined || v === null ? '' : String(v);
  });
}

/** Utilisateurs actifs exerçant l'un des rôles, dans l'agence concernée pour les rôles non globaux. */
async function utilisateursParRoles(roleCodes: string[], agenceId?: number | null): Promise<number[]> {
  const ids = new Set<number>();

  const affectes = await prisma.utilisateurRole.findMany({
    where: { role: { code: { in: roleCodes }, actif: true }, utilisateur: { actif: true } },
    select: { role: { select: { code: true } }, utilisateur: { select: { id: true, agenceId: true } } },
  });
  for (const a of affectes) {
    if (ROLES_GLOBAUX.has(a.role.code) || !agenceId || a.utilisateur.agenceId === agenceId) ids.add(a.utilisateur.id);
  }

  // Comptes sans aucune affectation : on retombe sur leur rôle historique.
  const roleHist = Object.entries(REPLI_HISTORIQUE)
    .filter(([, codes]) => codes.some((c) => roleCodes.includes(c)))
    .map(([r]) => r);
  if (roleHist.length > 0) {
    const anciens = await prisma.utilisateur.findMany({
      where: { actif: true, role: { in: roleHist as never[] }, roles: { none: {} } },
      select: { id: true, agenceId: true, role: true },
    });
    for (const u of anciens) {
      const codes = REPLI_HISTORIQUE[u.role] ?? [];
      const global = codes.some((c) => ROLES_GLOBAUX.has(c) && roleCodes.includes(c));
      if (global || !agenceId || u.agenceId === agenceId) ids.add(u.id);
    }
  }
  return [...ids];
}

async function resoudreDestinataires(d: { destinataire: string; roleCodes: unknown }, e: EvenementEntree): Promise<number[]> {
  const donnees = e.donnees ?? {};
  if (d.destinataire === 'acteur') return e.acteurId ? [e.acteurId] : [];
  if (d.destinataire === 'roles') return utilisateursParRoles(Array.isArray(d.roleCodes) ? (d.roleCodes as string[]) : [], e.agenceId);
  if (d.destinataire.startsWith('utilisateur:')) {
    const id = Number(donnees[d.destinataire.slice('utilisateur:'.length)]);
    return Number.isInteger(id) && id > 0 ? [id] : [];
  }
  return [];
}

export async function emettre(code: string, e: EvenementEntree = {}): Promise<void> {
  try {
    const donnees = e.donnees ?? {};
    const evt = await prisma.evenementMetier.create({
      data: {
        code, entiteType: e.entiteType ?? null, entiteId: e.entiteId ?? null, agenceId: e.agenceId ?? null,
        acteurId: e.acteurId ?? null, donnees: donnees as never,
      },
    });

    const declencheurs = await prisma.declencheurNotification.findMany({ where: { evenement: code, actif: true } });
    for (const d of declencheurs) {
      const canaux = (Array.isArray(d.canaux) ? d.canaux : []) as string[];
      const titre = rendreGabarit(d.titre, donnees);
      const message = rendreGabarit(d.gabarit, donnees);

      if (d.destinataire === 'client') {
        if (canaux.includes('sms')) {
          await mettreEnFileSms({ telephone: donnees.telephone as string | undefined, message, entiteType: e.entiteType, entiteId: e.entiteId });
        }
        continue;
      }

      const destinataires = await resoudreDestinataires(d, e);
      // Un acteur n'a pas besoin d'être notifié de sa propre action, sauf s'il est le seul destinataire prévu.
      const utiles = destinataires.length > 1 && e.acteurId ? destinataires.filter((id) => id !== e.acteurId) : destinataires;

      if (canaux.includes('in_app') && utiles.length > 0) {
        await prisma.notification.createMany({
          data: utiles.map((utilisateurId) => ({
            utilisateurId, titre, message, code, lien: (donnees.lien as string | undefined) ?? null,
            entiteType: e.entiteType ?? null, entiteId: e.entiteId ?? null,
          })),
        });
      }
    }

    void dispatcherWebhooks(evt.id, code, donnees);
  } catch (err) {
    console.error(`[notifier] événement ${code} non traité`, err);
  }
}

async function dispatcherWebhooks(evenementId: number, code: string, donnees: Record<string, unknown>) {
  try {
    const abonnements = await prisma.abonnementWebhook.findMany({ where: { actif: true } });
    for (const a of abonnements) {
      const suivis = (Array.isArray(a.evenements) ? a.evenements : []) as string[];
      if (!suivis.includes('*') && !suivis.includes(code)) continue;

      const corps = JSON.stringify({ id: evenementId, evenement: code, date: new Date().toISOString(), donnees });
      const r = await appelerSysteme('webhook', a.url, {
        headers: { 'Content-Type': 'application/json', 'X-CECAW-Signature': `sha256=${signerHmac(a.secret, corps)}`, 'X-CECAW-Evenement': code },
        corps, reference: `webhook:${a.id}:${evenementId}`,
      });
      // Compteur incrémenté en base (atomique) : des événements simultanés ne se marchent pas dessus.
      if (r.ok) {
        if (a.echecsConsecutifs > 0) await prisma.abonnementWebhook.update({ where: { id: a.id }, data: { echecsConsecutifs: 0 } });
      } else {
        const maj = await prisma.abonnementWebhook.update({ where: { id: a.id }, data: { echecsConsecutifs: { increment: 1 } }, select: { echecsConsecutifs: true } });
        // Un abonné durablement injoignable est suspendu pour ne pas ralentir chaque événement.
        if (maj.echecsConsecutifs >= 10) await prisma.abonnementWebhook.update({ where: { id: a.id }, data: { actif: false } });
      }
    }
  } catch (err) {
    console.error('[notifier] webhooks', err);
  }
}

/** Déclencheurs livrés par défaut. Ajoutés s'ils manquent ; jamais écrasés une fois modifiés par l'administrateur. */
const DECLENCHEURS_DEFAUT = [
  { evenement: 'credit.analyse_terminee', libelle: 'Dossier prêt pour décision', destinataire: 'roles', roleCodes: ['R08', 'R04', 'R03'], canaux: ['in_app'], titre: 'Dossier en attente de décision', gabarit: 'Le dossier {{reference}} ({{client}}, {{montant}} FCFA) est prêt pour décision.' },
  { evenement: 'credit.decide', libelle: 'Décision rendue au monteur du dossier', destinataire: 'utilisateur:monteParId', canaux: ['in_app'], titre: 'Décision sur {{reference}}', gabarit: 'Le dossier {{reference}} ({{client}}) a reçu une décision : {{decision}}.' },
  { evenement: 'credit.decaisse', libelle: 'SMS au client au décaissement', destinataire: 'client', canaux: ['sms'], titre: 'Crédit décaissé', gabarit: 'CECAW : votre crédit {{reference}} de {{montant}} FCFA a été décaissé. Première échéance : {{premiere_echeance}} FCFA.' },
  { evenement: 'credit.remboursement', libelle: 'SMS de reçu de remboursement', destinataire: 'client', canaux: ['sms'], titre: 'Remboursement reçu', gabarit: 'CECAW : remboursement de {{montant}} FCFA reçu sur le crédit {{reference}}. Reste dû : {{reste}} FCFA.' },
  { evenement: 'credit.rappel_echeance', libelle: "SMS de rappel avant l'échéance", destinataire: 'client', canaux: ['sms'], titre: 'Échéance à venir', gabarit: 'CECAW : rappel, votre échéance de {{montant}} FCFA (crédit {{reference}}) est due le {{date}}.' },
  { evenement: 'kyc.a_valider', libelle: 'Dossier KYC à contrôler', destinataire: 'roles', roleCodes: ['R06'], canaux: ['in_app'], titre: 'Dossier KYC à contrôler', gabarit: 'Le dossier KYC {{reference}} ({{personne}}) attend un contrôle.' },
  { evenement: 'kyc.traite', libelle: 'Résultat du contrôle KYC', destinataire: 'utilisateur:creeParId', canaux: ['in_app'], titre: 'KYC {{reference}} : {{resultat}}', gabarit: 'Le dossier KYC {{reference}} ({{personne}}) a été {{resultat}}.' },
  { evenement: 'recouvrement.nouveau_dossier', libelle: 'Nouveau dossier de recouvrement assigné', destinataire: 'utilisateur:agentId', canaux: ['in_app'], titre: 'Nouveau dossier de recouvrement', gabarit: 'Le dossier {{reference}} ({{client}}) vous est assigné : {{jours}} jours de retard, {{montant}} FCFA impayés.' },
  { evenement: 'recouvrement.niveau_1', libelle: 'SMS de relance niveau 1', destinataire: 'client', canaux: ['sms'], titre: 'Relance', gabarit: 'CECAW : votre échéance de crédit est en retard de {{jours}} jours ({{montant}} FCFA). Merci de régulariser rapidement.' },
  { evenement: 'recouvrement.niveau_2', libelle: 'SMS de relance niveau 2', destinataire: 'client', canaux: ['sms'], titre: 'Relance', gabarit: 'CECAW : rappel, {{montant}} FCFA restent impayés depuis {{jours}} jours. Contactez votre agence pour régulariser.' },
  { evenement: 'recouvrement.niveau_3', libelle: 'SMS de relance niveau 3', destinataire: 'client', canaux: ['sms'], titre: 'Relance', gabarit: 'CECAW : SECOND AVIS. {{montant}} FCFA impayés depuis {{jours}} jours. Un agent va vous rendre visite. Régularisez sans délai.' },
  { evenement: 'recouvrement.niveau_4', libelle: 'SMS de relance niveau 4', destinataire: 'client', canaux: ['sms'], titre: 'Mise en demeure', gabarit: 'CECAW : MISE EN DEMEURE. {{montant}} FCFA impayés depuis {{jours}} jours. Sans régularisation, votre dossier sera transmis au contentieux.' },
  { evenement: 'recouvrement.promesse_rompue', libelle: 'Promesse de paiement non tenue', destinataire: 'utilisateur:agentId', canaux: ['in_app'], titre: 'Promesse non tenue', gabarit: 'La promesse de {{montant}} FCFA du dossier {{reference}} n\'a pas été honorée.' },
  { evenement: 'recouvrement.escalade', libelle: 'Escalade de dossier', destinataire: 'roles', roleCodes: ['R04', 'R03'], canaux: ['in_app'], titre: 'Escalade : {{reference}}', gabarit: 'Le dossier {{reference}} ({{client}}) passe en {{statut}}.' },
  { evenement: 'collecte.journee_cloturee', libelle: 'Journée de collecte à contrôler', destinataire: 'roles', roleCodes: ['R12', 'R04'], canaux: ['in_app'], titre: 'Journée de collecte à contrôler', gabarit: '{{agent}} a clôturé sa journée du {{date}} : {{total}} FCFA en {{nb}} opération(s).' },
  { evenement: 'collecte.ecart', libelle: 'Écart de caisse constaté', destinataire: 'roles', roleCodes: ['R04', 'R12', 'R15'], canaux: ['in_app'], titre: 'Écart de collecte', gabarit: 'Écart de {{ecart}} FCFA sur la journée du {{date}} de {{agent}}.' },
  { evenement: 'objectif.ecart', libelle: "Objectif en retard sur l'avancement attendu", destinataire: 'utilisateur:createurId', canaux: ['in_app'], titre: 'Objectif en retard : {{titreObjectif}}', gabarit: '« {{titreObjectif}} » est à {{realise}} % alors que {{attendu}} % étaient attendus à cette date.' },
  { evenement: 'conformite.alerte', libelle: 'Alerte de conformité', destinataire: 'roles', roleCodes: ['R06', 'R15'], canaux: ['in_app'], titre: 'Alerte : {{titreAlerte}}', gabarit: '{{description}}' },
  { evenement: 'terrain.conflit', libelle: 'Conflit de synchronisation terrain', destinataire: 'roles', roleCodes: ['R12', 'R04'], canaux: ['in_app'], titre: 'Conflit de synchronisation', gabarit: 'La visite « {{libelle}} » de {{agent}} a été modifiée en parallèle : vérification requise.' },
  { evenement: 'securite.compte_bloque', libelle: 'Compte bloqué après échecs de connexion', destinataire: 'roles', roleCodes: ['R01'], canaux: ['in_app'], titre: 'Compte bloqué', gabarit: 'Le compte {{email}} est bloqué après des échecs de connexion répétés.' },
] as const;

export async function synchroniserDeclencheurs() {
  for (const d of DECLENCHEURS_DEFAUT) {
    const existe = await prisma.declencheurNotification.findFirst({ where: { evenement: d.evenement, libelle: d.libelle }, select: { id: true } });
    if (existe) continue;
    await prisma.declencheurNotification.create({
      data: {
        evenement: d.evenement, libelle: d.libelle, destinataire: d.destinataire,
        roleCodes: ('roleCodes' in d ? [...d.roleCodes] : undefined) as never, canaux: [...d.canaux] as never, titre: d.titre, gabarit: d.gabarit,
      },
    });
  }
}
