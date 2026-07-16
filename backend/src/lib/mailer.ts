import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

async function send(to: string, subject: string, html: string) {
  if (!env.SMTP_HOST) return; // skip if not configured
  await transporter.sendMail({ from: env.SMTP_FROM, to, subject, html });
}

// ─── Templates ────────────────────────────────────────────────────────────────

function base(titre: string, contenu: string) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titre}</title>
<style>
  body{margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif}
  .wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .header{background:#1e3a5f;padding:28px 32px}
  .header h1{margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-.3px}
  .header p{margin:4px 0 0;color:rgba(255,255,255,.7);font-size:13px}
  .body{padding:28px 32px}
  .body p{margin:0 0 14px;color:#374151;font-size:14px;line-height:1.6}
  .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:20px 0}
  .box .label{font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
  .box .value{font-size:15px;font-weight:700;color:#0f172a;font-family:monospace}
  .btn{display:inline-block;background:#1e3a5f;color:#fff!important;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin:8px 0}
  .footer{padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>CECAW CRM</h1>
    <p>${titre}</p>
  </div>
  <div class="body">${contenu}</div>
  <div class="footer">CECAW &mdash; Ce message est automatique, merci de ne pas répondre.</div>
</div>
</body></html>`;
}

// ─── Email : bienvenue nouvel utilisateur ──────────────────────────────────────

export async function sendBienvenue(opts: {
  to: string; prenom: string; nom: string;
  email: string; motDePasse: string; role: string;
}) {
  const roleLabel: Record<string, string> = {
    admin: 'Administrateur', manager: 'Manager',
    backoffice: "Chef d'équipe", agent: 'Agent',
  };
  const html = base('Bienvenue sur CECAW CRM', `
    <p>Bonjour <strong>${opts.prenom} ${opts.nom}</strong>,</p>
    <p>Votre compte a été créé sur la plateforme <strong>CECAW CRM</strong>. Voici vos identifiants de connexion :</p>
    <div class="box">
      <div class="label">Adresse e-mail</div>
      <div class="value">${opts.email}</div>
    </div>
    <div class="box">
      <div class="label">Mot de passe temporaire</div>
      <div class="value">${opts.motDePasse}</div>
    </div>
    <div class="box">
      <div class="label">Rôle</div>
      <div class="value">${roleLabel[opts.role] ?? opts.role}</div>
    </div>
    <p>Connectez-vous dès maintenant et changez votre mot de passe.</p>
    <a class="btn" href="${env.FRONTEND_URL}/login">Accéder à CECAW CRM</a>
    <p style="margin-top:20px;font-size:12px;color:#94a3b8;">
      Pour des raisons de sécurité, veuillez changer votre mot de passe après votre première connexion.
    </p>
  `);
  await send(opts.to, 'Bienvenue sur CECAW CRM — Vos identifiants de connexion', html);
}

// ─── Email : réinitialisation mot de passe ─────────────────────────────────────

export async function sendResetPassword(opts: {
  to: string; prenom: string; nom: string; motDePasse: string;
}) {
  const html = base('Réinitialisation de mot de passe', `
    <p>Bonjour <strong>${opts.prenom} ${opts.nom}</strong>,</p>
    <p>Votre mot de passe a été réinitialisé par un administrateur. Voici votre nouveau mot de passe temporaire :</p>
    <div class="box">
      <div class="label">Nouveau mot de passe</div>
      <div class="value">${opts.motDePasse}</div>
    </div>
    <p>Connectez-vous avec ce mot de passe et changez-le immédiatement.</p>
    <a class="btn" href="${env.FRONTEND_URL}/login">Se connecter</a>
    <p style="margin-top:20px;font-size:12px;color:#94a3b8;">
      Si vous n'êtes pas à l'origine de cette demande, contactez immédiatement votre administrateur.
    </p>
  `);
  await send(opts.to, 'CECAW CRM — Réinitialisation de votre mot de passe', html);
}

// ─── Email : bienvenue nouveau client (après conversion prospect) ──────────────

export async function sendBienvenueClient(opts: {
  to: string; prenom: string; nom: string; agence: string;
}) {
  const html = base('Bienvenue chez CECAW', `
    <p>Bonjour <strong>${opts.prenom} ${opts.nom}</strong>,</p>
    <p>Nous avons le plaisir de vous accueillir en tant que <strong>client CECAW</strong>
       à l'agence <strong>${opts.agence}</strong>.</p>
    <p>Votre dossier a été enregistré et un conseiller commercial dédié vous accompagnera
       dans toutes vos démarches.</p>
    <p>N'hésitez pas à contacter votre agence pour toute question.</p>
    <p>Bienvenue dans la famille CECAW !</p>
  `);
  await send(opts.to, 'Bienvenue chez CECAW — Confirmation de votre adhésion', html);
}
