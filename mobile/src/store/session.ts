import { create } from 'zustand';
import * as authApi from '../api/auth';
import { setSessionLostHandler } from '../api/client';
import { findMyAgent } from '../api/agents';
import { ALLOWED_ROLE, DEFAULT_LOCK_DELAY_MIN, MAX_PIN_ATTEMPTS } from '../config';
import { definePin, hasPin, verifyPin, bumpAttempts, resetAttempts, getAttempts } from '../lib/pin';
import { getItem, getJson, setItem, setJson, setSecure, wipeAll } from '../lib/storage';
import { resumeTracking, stopTracking } from '../tracking';
import { connectLiveLink, disconnectLiveLink } from '../tracking/liveLink';
import type { Agent, User } from '../types';

/**
 * Etapes possibles de la session :
 *  loading   - on relit le disque au demarrage
 *  signedOut - aucun jeton, ecran email / mot de passe
 *  pinSetup  - authentifie mais aucun code PIN defini
 *  locked    - authentifie, code PIN exige (demarrage a froid ou inactivite)
 *  ready     - acces complet
 */
export type SessionStatus = 'loading' | 'signedOut' | 'pinSetup' | 'locked' | 'ready';

interface SessionState {
  status: SessionStatus;
  user: User | null;
  agent: Agent | null;
  /** Delai d'inactivite avant verrouillage, en minutes. */
  lockDelayMin: number;
  /** Essais de code PIN restants avant purge des donnees locales. */
  attemptsLeft: number;
  error: string | null;

  bootstrap: () => Promise<void>;
  signIn: (identifiant: string, password: string) => Promise<void>;
  configurePin: (pin: string, lockDelayMin: number) => Promise<void>;
  setLockDelay: (minutes: number) => Promise<void>;
  unlock: (pin: string) => Promise<boolean>;
  lock: () => void;
  signOut: () => Promise<void>;
  clearError: () => void;
}

/** Purge locale complete : jetons, code PIN, identite, files d'attente, tracking. */
async function purge() {
  disconnectLiveLink();
  await stopTracking().catch(() => undefined);
  await wipeAll();
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  user: null,
  agent: null,
  lockDelayMin: DEFAULT_LOCK_DELAY_MIN,
  attemptsLeft: MAX_PIN_ATTEMPTS,
  error: null,

  bootstrap: async () => {
    // Une session perdue en cours de route (refresh refuse) ramene a la connexion.
    setSessionLostHandler(() => set({ status: 'signedOut', user: null, agent: null }));

    const [user, agent, delay, attempts, pinSet] = await Promise.all([
      getJson<User>('user'),
      getJson<Agent>('agentProfile'),
      getItem('lockDelay'),
      getAttempts(),
      hasPin(),
    ]);

    const lockDelayMin = delay ? Number(delay) || DEFAULT_LOCK_DELAY_MIN : DEFAULT_LOCK_DELAY_MIN;
    const attemptsLeft = Math.max(0, MAX_PIN_ATTEMPTS - attempts);

    if (!user) {
      set({ status: 'signedOut', lockDelayMin, attemptsLeft });
      return;
    }

    // Le canal reste ouvert meme application verrouillee : un superviseur doit
    // pouvoir localiser un agent sans que celui-ci deverrouille son telephone.
    if (agent?.id) {
      connectLiveLink(agent.id).catch(() => undefined);
      // Le service de fond survit a la fermeture de l'application, mais le flux
      // temps reel doit etre rouvert a chaque lancement.
      resumeTracking(agent.id).catch(() => undefined);
    }

    set({
      user,
      agent: agent ?? null,
      lockDelayMin,
      attemptsLeft,
      // Demarrage a froid : le code PIN est systematiquement redemande.
      status: pinSet ? 'locked' : 'pinSetup',
    });
  },

  signIn: async (identifiant, password) => {
    set({ error: null });
    try {
      const result = await authApi.login(identifiant.trim(), password);

      // L'application est reservee aux agents terrain : tout autre role est
      // refuse avant meme d'ecrire le moindre jeton sur le telephone.
      if (result.user.role !== ALLOWED_ROLE) {
        set({
          error:
            "Cette application est reservee aux agents terrain. Utilisez le back-office avec ce compte.",
        });
        return;
      }

      await setSecure('access', result.accessToken);
      await setSecure('refresh', result.refreshToken);
      await setJson('user', result.user);

      // La fiche agent porte l'identifiant attendu par les endpoints position
      // et transaction ; sans elle, ni tracking ni collecte ne sont possibles.
      let agent: Agent | null = null;
      try {
        agent = await findMyAgent(result.user.id);
      } catch {
        agent = null;
      }
      if (agent) {
        await setJson('agentProfile', agent);
        connectLiveLink(agent.id).catch(() => undefined);
        resumeTracking(agent.id).catch(() => undefined);
      }

      set({
        user: result.user,
        agent,
        error: agent
          ? null
          : "Aucune fiche agent n'est rattachee a ce compte. Contactez votre superviseur.",
        status: (await hasPin()) ? 'ready' : 'pinSetup',
      });
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      set({
        error:
          err.message === 'Network Error'
            ? 'Pas de connexion. Verifiez votre reseau.'
            : err.response?.data?.message ?? 'Identifiants incorrects.',
      });
    }
  },

  configurePin: async (pin, lockDelayMin) => {
    await definePin(pin);
    // Copie chiffree cote serveur : permet de retrouver son code apres une
    // reinstallation. Un echec reseau n'empeche pas d'utiliser l'application.
    authApi.enregistrerPinServeur(pin).catch(() => undefined);
    await setItem('lockDelay', String(lockDelayMin));
    set({ status: 'ready', lockDelayMin, attemptsLeft: MAX_PIN_ATTEMPTS, error: null });
  },

  setLockDelay: async (minutes) => {
    await setItem('lockDelay', String(minutes));
    set({ lockDelayMin: minutes });
  },

  unlock: async (pin) => {
    if (await verifyPin(pin)) {
      await resetAttempts();
      set({ status: 'ready', attemptsLeft: MAX_PIN_ATTEMPTS, error: null });
      return true;
    }

    const used = await bumpAttempts();
    const left = Math.max(0, MAX_PIN_ATTEMPTS - used);

    // Telephone vole ou perdu : passe le quota, on efface tout sur l'appareil.
    if (left === 0) {
      await purge();
      set({
        status: 'signedOut',
        user: null,
        agent: null,
        attemptsLeft: MAX_PIN_ATTEMPTS,
        error: 'Trop de tentatives. Les donnees locales ont ete effacees.',
      });
      return false;
    }

    set({ attemptsLeft: left, error: `Code incorrect. ${left} essai(s) restant(s).` });
    return false;
  },

  lock: () => {
    if (get().status === 'ready') set({ status: 'locked', error: null });
  },

  signOut: async () => {
    await authApi.logout();
    await purge();
    set({ status: 'signedOut', user: null, agent: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
