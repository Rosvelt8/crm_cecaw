import prisma from './prisma';
import { appelerSysteme } from './echanges';
import { parametre } from './parametres';

/**
 * Passerelle de messagerie client, SMS et WhatsApp (COMMUNICATION 1, compléments stratégiques
 * point 17 : registre de canaux extensible).
 *
 * Les messages passent par une file unique (`messages_sms`, colonne `canal`) : rien n'est perdu
 * si le fournisseur est indisponible, les envois sont rejoués avec un délai croissant. Un
 * troisième canal s'ajoute en complétant `FOURNISSEURS` ci-dessous, sans toucher au reste.
 *
 * SMS : point d'accès HTTP JSON générique, configuré par variables d'environnement.
 *   SMS_API_URL      adresse d'envoi (obligatoire pour activer l'envoi réel)
 *   SMS_API_KEY      jeton envoyé en `Authorization: Bearer`
 *   SMS_SENDER       expéditeur affiché (par défaut « CECAW »)
 * Corps envoyé : { "to": "+2376...", "message": "...", "from": "CECAW", "reference": "<id>" }.
 *
 * WhatsApp : API Cloud de Meta (Graph API), configurée par variables d'environnement.
 *   WHATSAPP_TOKEN            jeton d'accès permanent de l'application Meta Business
 *   WHATSAPP_PHONE_NUMBER_ID  identifiant du numéro expéditeur (Meta Business Manager)
 *   WHATSAPP_API_URL          racine de l'API (par défaut https://graph.facebook.com/v21.0)
 * Activable/désactivable sans redéploiement depuis Paramètres > Communication (paramètre
 * `communication.whatsapp_actif`), une fois les identifiants ci-dessus renseignés par CECAW.
 * HYPOTHÈSE : Meta exige un message-modèle pré-approuvé pour toute prise de contact hors d'une
 * fenêtre de conversation de 24 h ouverte par le client ; un message libre (celui envoyé ici)
 * n'aboutit donc de façon fiable que pour répondre à un client déjà en échange récent (rappel
 * d'échéance, relance) — les campagnes à froid vers des clients silencieux depuis longtemps
 * nécessiteront un modèle approuvé par Meta, à mettre en place séparément.
 */

const DELAIS_MIN = [5, 30, 120];
const MAX_TENTATIVES = DELAIS_MIN.length + 1;

export type Canal = 'sms' | 'whatsapp';

export const smsConfigure = () => Boolean(process.env.SMS_API_URL);
export const whatsappConfigure = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

async function whatsappActif(): Promise<boolean> {
  if (!whatsappConfigure()) return false;
  try { return await parametre<boolean>('communication.whatsapp_actif'); } catch { return false; }
}

/** Un canal est disponible s'il est configuré, et pour WhatsApp seulement si en outre activé. */
async function canalDisponible(canal: Canal): Promise<boolean> {
  return canal === 'sms' ? smsConfigure() : whatsappActif();
}

/** Normalise un numéro en format international. Sans indicatif, on suppose le Cameroun (+237). */
export function normaliserTelephone(brut: string | null | undefined): string | null {
  if (!brut) return null;
  let chiffres = brut.replace(/[^\d+]/g, '');
  if (chiffres.startsWith('00')) chiffres = `+${chiffres.slice(2)}`;
  if (chiffres.startsWith('+')) return /^\+\d{8,15}$/.test(chiffres) ? chiffres : null;
  if (/^\d{9}$/.test(chiffres)) return `+237${chiffres}`;
  if (/^237\d{9}$/.test(chiffres)) return `+${chiffres}`;
  return null;
}

/** Met un message en file. `canal` par défaut à 'sms' : tous les appelants existants sont inchangés. */
export async function mettreEnFileSms(p: { telephone: string | null | undefined; message: string; entiteType?: string; entiteId?: number; canal?: Canal }) {
  const tel = normaliserTelephone(p.telephone);
  if (!tel) return null;
  return prisma.messageSms.create({
    data: {
      telephone: tel, message: p.message.slice(0, 480), canal: p.canal ?? 'sms',
      entiteType: p.entiteType ?? null, entiteId: p.entiteId ?? null,
      prochaineTentativeAt: new Date(),
    },
  });
}

async function envoyerSms(m: { id: number; telephone: string; message: string }) {
  return appelerSysteme('sms', process.env.SMS_API_URL as string, {
    headers: { 'Content-Type': 'application/json', ...(process.env.SMS_API_KEY ? { Authorization: `Bearer ${process.env.SMS_API_KEY}` } : {}) },
    corps: JSON.stringify({ to: m.telephone, message: m.message, from: process.env.SMS_SENDER ?? 'CECAW', reference: String(m.id) }),
    reference: `sms:${m.id}`,
  });
}

async function envoyerWhatsapp(m: { id: number; telephone: string; message: string }) {
  const racine = process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v21.0';
  const url = `${racine}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  return appelerSysteme('whatsapp', url, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    corps: JSON.stringify({ messaging_product: 'whatsapp', to: m.telephone.replace(/^\+/, ''), type: 'text', text: { body: m.message } }),
    reference: `whatsapp:${m.id}`,
  });
}

const FOURNISSEURS: Record<Canal, (m: { id: number; telephone: string; message: string }) => ReturnType<typeof appelerSysteme>> = {
  sms: envoyerSms,
  whatsapp: envoyerWhatsapp,
};

/** Envoie les messages en attente dont l'heure de tentative est arrivée. Renvoie les compteurs. */
export async function traiterFileSms(limite = 50) {
  const dues = await prisma.messageSms.findMany({
    where: { statut: 'en_attente', prochaineTentativeAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: limite,
  });
  let envoyes = 0;
  let echecs = 0;

  for (const m of dues) {
    if (!(await canalDisponible(m.canal))) {
      const raison = m.canal === 'sms' ? 'Passerelle SMS non configurée (SMS_API_URL)' : 'Canal WhatsApp non configuré ou désactivé (WHATSAPP_TOKEN, communication.whatsapp_actif)';
      await prisma.messageSms.update({ where: { id: m.id }, data: { statut: 'echec', erreur: raison, prochaineTentativeAt: null } });
      echecs++;
      continue;
    }
    const r = await FOURNISSEURS[m.canal](m);
    if (r.ok) {
      await prisma.messageSms.update({ where: { id: m.id }, data: { statut: 'envoye', envoyeAt: new Date(), tentatives: m.tentatives + 1, erreur: null, prochaineTentativeAt: null } });
      envoyes++;
    } else {
      const tentatives = m.tentatives + 1;
      const definitif = tentatives >= MAX_TENTATIVES;
      await prisma.messageSms.update({
        where: { id: m.id },
        data: {
          tentatives, erreur: r.erreur ?? `HTTP ${r.statut}`,
          statut: definitif ? 'echec' : 'en_attente',
          prochaineTentativeAt: definitif ? null : new Date(Date.now() + DELAIS_MIN[tentatives - 1] * 60_000),
        },
      });
      echecs++;
    }
  }
  return { traites: dues.length, envoyes, echecs };
}

export async function renvoyerSms(id: number) {
  return prisma.messageSms.update({ where: { id }, data: { statut: 'en_attente', tentatives: 0, erreur: null, prochaineTentativeAt: new Date() } });
}
