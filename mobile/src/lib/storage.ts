import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Deux niveaux de stockage :
 *  - SecureStore (Keychain iOS / Keystore Android) pour tout ce qui ouvre l'acces :
 *    jetons et empreinte du code PIN ;
 *  - AsyncStorage pour le reste, lisible sans deverrouillage par la tache
 *    de geolocalisation qui tourne en arriere-plan.
 */
const SECURE = {
  access: 'cecaw.access',
  refresh: 'cecaw.refresh',
  pinHash: 'cecaw.pin_hash',
  pinSalt: 'cecaw.pin_salt',
} as const;

const PLAIN = {
  user: 'cecaw.user',
  agentProfile: 'cecaw.agent_profile',
  agentId: 'cecaw.agent_id',
  lockDelay: 'cecaw.lock_delay',
  pinAttempts: 'cecaw.pin_attempts',
  tracking: 'cecaw.tracking',
  queuePositions: 'cecaw.queue.positions',
  queueTransactions: 'cecaw.queue.transactions',
} as const;

export async function getSecure(key: keyof typeof SECURE): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE[key]);
  } catch {
    return null;
  }
}

export async function setSecure(key: keyof typeof SECURE, value: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE[key], value);
}

export async function deleteSecure(key: keyof typeof SECURE): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE[key]);
  } catch {
    /* la cle peut deja etre absente */
  }
}

export async function getItem(key: keyof typeof PLAIN): Promise<string | null> {
  return AsyncStorage.getItem(PLAIN[key]);
}

export async function setItem(key: keyof typeof PLAIN, value: string): Promise<void> {
  await AsyncStorage.setItem(PLAIN[key], value);
}

export async function removeItem(key: keyof typeof PLAIN): Promise<void> {
  await AsyncStorage.removeItem(PLAIN[key]);
}

export async function getJson<T>(key: keyof typeof PLAIN): Promise<T | null> {
  const raw = await getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJson(key: keyof typeof PLAIN, value: unknown): Promise<void> {
  await setItem(key, JSON.stringify(value));
}

/**
 * Efface tout : jetons, PIN, identite, files d'attente.
 * Appelee a la deconnexion et apres trop d'echecs de code PIN.
 */
export async function wipeAll(): Promise<void> {
  await Promise.all(Object.keys(SECURE).map((k) => deleteSecure(k as keyof typeof SECURE)));
  await AsyncStorage.multiRemove(Object.values(PLAIN));
}
