import axios from 'axios';
import { api } from './client';
import { API_URL } from '../config';
import type { User } from '../types';

/** Le backend renvoie l'utilisateur en snake_case ; le reste de l'app parle camelCase. */
function mapUser(raw: Record<string, unknown>): User {
  return {
    id: Number(raw.id),
    nom: String(raw.nom ?? ''),
    prenom: String(raw.prenom ?? ''),
    email: String(raw.email ?? ''),
    role: (raw.role ?? 'agent') as User['role'],
    fonction: (raw.fonction as string | null) ?? null,
    actif: raw.actif !== false,
    agence: (raw.agence as User['agence']) ?? null,
    equipe: (raw.equipe as User['equipe']) ?? null,
  };
}

export interface LoginResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

/**
 * Connexion par adresse email ou par matricule d'agent.
 *
 * `client: 'mobile'` demande au serveur une session longue : un agent sur le
 * terrain ne peut pas se reconnecter toutes les quinze minutes, et le
 * rafraichissement echouerait justement la ou la couverture manque.
 */
export async function login(identifiant: string, password: string): Promise<LoginResult> {
  // Instance nue : a la connexion il n'y a pas encore de jeton a joindre.
  const { data } = await axios.post(`${API_URL}/auth/login`, {
    identifiant,
    password,
    client: 'mobile',
  });
  const payload = data?.data ?? data;
  return {
    user: mapUser(payload.user ?? payload),
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
  };
}

export async function me(): Promise<User> {
  const { data } = await api.get('/auth/me');
  return mapUser(data?.data ?? data);
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // Une deconnexion serveur qui echoue ne doit pas empecher la purge locale.
  }
}

/** Indique si un code PIN est deja enregistre pour ce compte. */
export async function aCodePinServeur(): Promise<boolean> {
  try {
    const { data } = await api.get('/auth/me/pin');
    return Boolean(data?.data?.a_code_pin);
  } catch {
    return false;
  }
}

/**
 * Synchronise le code PIN avec le serveur.
 *
 * Le deverrouillage reste verifie sur l'appareil, pour fonctionner hors reseau.
 * Cette copie chiffree permet de retrouver son code apres une reinstallation et
 * a un administrateur de le reinitialiser. L'echec n'est pas bloquant : le code
 * local suffit a se servir de l'application.
 */
export async function enregistrerPinServeur(pin: string): Promise<boolean> {
  try {
    await api.put('/auth/me/pin', { pin });
    return true;
  } catch {
    return false;
  }
}
