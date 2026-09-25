import prisma from './prisma';
import { appelerSysteme } from './echanges';

/**
 * Passerelle SMS (API SMS, COMMUNICATION 1).
 *
 * Les messages passent par une file (`messages_sms`) : rien n'est perdu si le
 * fournisseur est indisponible, les envois sont rejoués avec un délai croissant.
 *
 * Fournisseur : point d'accès HTTP JSON générique, configuré par variables d'environnement.
 *   SMS_API_URL      adresse d'envoi (obligatoire pour activer l'envoi réel)
 *   SMS_API_KEY      jeton envoyé en `Authorization: Bearer`
 *   SMS_SENDER       expéditeur affiché (par défaut « CECAW »)
 * Corps envoyé : { "to": "+2376...", "message": "...", "from": "CECAW", "reference": "<id>" }.
 * Un fournisseur imposant un autre format se branche en adaptant `envoyerVersFournisseur`.
 */

const DELAIS_MIN = [5, 30, 120];
const MAX_TENTATIVES = DELAIS_MIN.length + 1;

export const smsConfigure = () => Boolean(process.env.SMS_API_URL);

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

export async function mettreEnFileSms(p: { telephone: string | null | undefined; message: string; entiteType?: string; entiteId?: number }) {
  const tel = normaliserTelephone(p.telephone);
  if (!tel) return null;
  return prisma.messageSms.create({
    data: {
      telephone: tel, message: p.message.slice(0, 480), entiteType: p.entiteType ?? null, entiteId: p.entiteId ?? null,
      prochaineTentativeAt: new Date(),
    },
  });
}

async function envoyerVersFournisseur(m: { id: number; telephone: string; message: string }) {
  const r = await appelerSysteme('sms', process.env.SMS_API_URL as string, {
    headers: { 'Content-Type': 'application/json', ...(process.env.SMS_API_KEY ? { Authorization: `Bearer ${process.env.SMS_API_KEY}` } : {}) },
    corps: JSON.stringify({ to: m.telephone, message: m.message, from: process.env.SMS_SENDER ?? 'CECAW', reference: String(m.id) }),
    reference: `sms:${m.id}`,
  });
  return r;
}

/** Envoie les SMS en attente dont l'heure de tentative est arrivée. Renvoie les compteurs. */
export async function traiterFileSms(limite = 50) {
  const dues = await prisma.messageSms.findMany({
    where: { statut: 'en_attente', prochaineTentativeAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: limite,
  });
  let envoyes = 0;
  let echecs = 0;

  for (const m of dues) {
    if (!smsConfigure()) {
      await prisma.messageSms.update({ where: { id: m.id }, data: { statut: 'echec', erreur: 'Passerelle SMS non configurée (SMS_API_URL)', prochaineTentativeAt: null } });
      echecs++;
      continue;
    }
    const r = await envoyerVersFournisseur(m);
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
