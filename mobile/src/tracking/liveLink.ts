import { io, Socket } from 'socket.io-client';
import { API_URL } from '../config';
import { getSecure } from '../lib/storage';
import { sendCurrentPosition } from './index';

/**
 * Canal temps reel entre le telephone et le back-office.
 *
 * Il ne sert qu'a une chose : recevoir une demande de position immediate quand
 * un superviseur clique sur l'agent dans la carte. Le telephone releve alors sa
 * position et la transmet par l'API ordinaire, ce qui la rediffuse a tous les
 * postes connectes.
 *
 * Ce n'est pas un canal de suivi : le releve periodique reste assure par la
 * tache de fond, soumise a la plage horaire de travail.
 */

/** L'URL du socket est celle de l'API, sans le suffixe de version. */
function socketUrl(): string {
  return API_URL.replace(/\/api\/v\d+\/?$/, '');
}

let socket: Socket | null = null;

let relance: ReturnType<typeof setTimeout> | null = null;

export async function connectLiveLink(agentId: number): Promise<void> {
  if (!(await getSecure('access'))) return;

  disconnectLiveLink();

  socket = io(socketUrl(), {
    transports: ['websocket'],
    // Rappel et non valeur fixe : socket.io le rejoue a chaque tentative, ce
    // qui fournit un jeton frais. Le jeton d'acces ne vit que 15 minutes.
    // `agent_id` rattache le telephone a sa salle, sans quoi aucune demande de
    // position ne peut lui parvenir.
    auth: (cb) =>
      getSecure('access').then((jeton) =>
        cb({ token: jeton ?? '', agent_id: String(agentId) }),
      ),
    reconnection: true,
    reconnectionDelay: 3000,
  });

  socket.on('position:request', () => {
    // Demande explicite d'un superviseur : on repond quelle que soit l'heure.
    sendCurrentPosition(agentId).catch(() => undefined);
  });

  // Un refus par l'intergiciel (jeton expire) n'est pas rejoue par socket.io :
  // on relance a la main, le rappel `auth` fournira le jeton renouvele.
  socket.on('connect_error', () => {
    if (socket?.active) return;
    if (relance) clearTimeout(relance);
    relance = setTimeout(() => socket?.connect(), 5000);
  });
}

export function disconnectLiveLink(): void {
  if (relance) {
    clearTimeout(relance);
    relance = null;
  }
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

export function isLiveLinkConnected(): boolean {
  return socket?.connected ?? false;
}
