import http from 'http';
import bcrypt from 'bcryptjs';
import prisma from '../../src/lib/prisma';
import app from '../../src/app';
import { synchroniserReferentiel, viderCacheDroits } from '../../src/lib/rbac';
import { synchroniserPlanComptable } from '../../src/lib/compta';
import { synchroniserDeclencheurs } from '../../src/lib/notifier';

/**
 * Aides des tests d'intégration. À exécuter UNIQUEMENT contre une base jetable : ces scripts
 * créent des utilisateurs, des dossiers et modifient des dates. Ils refusent de démarrer si la
 * base n'est pas un localhost sur le port de test.
 */

export const MDP = 'Test-Cecaw-2026!';
let server: http.Server;
export let base = '';
let compteurs = { ok: 0, ko: 0 };

export async function demarrer() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost:5544\//.test(url)) throw new Error(`Refus : DATABASE_URL (${url.replace(/:[^:@]*@/, ':***@')}) n'est pas la base de test locale (localhost:5544).`);
  await synchroniserReferentiel();
  await synchroniserPlanComptable();
  await synchroniserDeclencheurs();
  await new Promise<void>((r) => { server = http.createServer(app).listen(0, () => r()); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
}

export async function arreter() {
  await new Promise<void>((r) => server.close(() => r()));
  await prisma.$disconnect();
  console.log(`\n${compteurs.ok} vérification(s) réussie(s), ${compteurs.ko} échec(s)`);
  process.exit(compteurs.ko === 0 ? 0 : 1);
}

export function verifier(condition: unknown, message: string, detail?: unknown) {
  if (condition) { compteurs.ok++; console.log(`  OK  ${message}`); }
  else { compteurs.ko++; console.log(`  KO  ${message}${detail !== undefined ? ` -> ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); }
}

export const titre = (t: string) => console.log(`\n== ${t}`);

export interface Reponse { statut: number; corps: any; brut?: ArrayBuffer; type?: string | null }

export async function api(token: string | null, methode: string, chemin: string, corps?: unknown): Promise<Reponse> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (corps instanceof FormData) body = corps;
  else if (corps !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(corps); }
  const r = await fetch(`${base}${chemin}`, { method: methode, headers, body });
  const type = r.headers.get('content-type');
  if (type?.includes('application/json')) return { statut: r.status, corps: await r.json(), type };
  const brut = await r.arrayBuffer();
  return { statut: r.status, corps: null, brut, type };
}

export interface Acteur { id: number; token: string; email: string; agentId?: number }

export async function utilisateur(
  email: string, roleHistorique: 'admin' | 'manager' | 'backoffice' | 'agent', codesRoles: string[],
  opts: { agenceId?: number; agent?: { matricule: string; lat?: number; lng?: number } } = {},
): Promise<Acteur> {
  const hash = await bcrypt.hash(MDP, 4);
  const u = await prisma.utilisateur.upsert({
    where: { email },
    create: { nom: email.split('@')[0].toUpperCase(), prenom: 'Test', email, password: hash, role: roleHistorique, agenceId: opts.agenceId ?? 1, actif: true },
    update: { password: hash, role: roleHistorique, agenceId: opts.agenceId ?? 1, actif: true, tentativesEchouees: 0, bloqueJusquA: null, mfaActif: false, mfaSecret: null },
  });
  await prisma.utilisateurRole.deleteMany({ where: { utilisateurId: u.id } });
  const roles = await prisma.role.findMany({ where: { code: { in: codesRoles } } });
  await prisma.utilisateurRole.createMany({ data: roles.map((r) => ({ utilisateurId: u.id, roleId: r.id })) });
  viderCacheDroits(u.id);

  let agentId: number | undefined;
  if (opts.agent) {
    const a = await prisma.agent.upsert({
      where: { utilisateurId: u.id },
      create: { utilisateurId: u.id, matricule: opts.agent.matricule, latitude: opts.agent.lat ?? null, longitude: opts.agent.lng ?? null, dernierePositionAt: opts.agent.lat ? new Date() : null },
      update: { latitude: opts.agent.lat ?? null, longitude: opts.agent.lng ?? null, dernierePositionAt: opts.agent.lat ? new Date() : null },
    });
    agentId = a.id;
  }
  const r = await api(null, 'POST', '/auth/login', { identifiant: email, password: MDP });
  if (r.statut !== 200) throw new Error(`Connexion de ${email} impossible : ${JSON.stringify(r.corps)}`);
  return { id: u.id, token: r.corps.data.access_token, email, agentId };
}

export const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));
