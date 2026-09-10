'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { agentService } from '@/services/agentService';
import { TOKEN_KEYS } from '@/constants';
import type { TerrainAgent } from '@/components/collecte/terrain-map-inner';

/** Au-dela de ce delai sans position, un agent est considere hors ligne. */
const ONLINE_WINDOW_MIN = 60;

/**
 * Payload emis par le backend sur `agent:position` (agents.service.ts).
 * Il est en snake_case, contrairement aux reponses REST qui sont en camelCase.
 */
interface PositionEvent {
  agent_id: number;
  latitude: number;
  longitude: number;
  derniere_position_at: string;
  en_ligne: boolean;
}

export type SocketState = 'connecting' | 'live' | 'offline';

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Number.isFinite(diff) ? Math.round(diff / 60000) : null;
}

/** Convertit une fiche agent de l'API en marqueur exploitable par la carte. */
function toTerrainAgent(raw: Record<string, unknown>): TerrainAgent | null {
  const lat = raw.latitude;
  const lng = raw.longitude;
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;

  const u = (raw.utilisateur ?? {}) as Record<string, unknown>;
  const agence = (u.agence ?? {}) as Record<string, unknown>;
  const equipe = (u.equipe ?? {}) as Record<string, unknown>;
  const derniere = (raw.dernierePositionAt as string | null) ?? null;
  const ago = minutesSince(derniere);

  const prenom = (u.prenom as string) ?? '';
  const nom = (u.nom as string) ?? '';

  return {
    id: String(raw.id),
    lat: Number(lat),
    lng: Number(lng),
    initials: `${prenom[0] ?? '?'}${nom[0] ?? '?'}`.toUpperCase(),
    nom: prenom || nom ? `${prenom} ${nom}`.trim() : String(raw.matricule ?? ''),
    matricule: (raw.matricule as string) ?? '',
    secteur: (raw.secteur as string) ?? '',
    equipe: (equipe.nom as string) ?? '',
    agenceId: String(agence.id ?? u.agenceId ?? ''),
    online: ago !== null && ago < ONLINE_WINDOW_MIN,
    minutesAgo: ago,
    dernierePositionAt: derniere,
  };
}

/**
 * Source unique des positions d'agents : chargement REST initial, puis mise a
 * jour au fil de l'eau via WebSocket des que le mobile transmet une position.
 *
 * Le serveur exige un jeton dans la requete de connexion et rattache lui-meme
 * le client a la salle « terrain » (server.ts) : emettre un evenement `join`
 * ne sert a rien, et se connecter sans jeton fait deconnecter aussitot.
 */
export function useAgentsLive() {
  const [agents, setAgents] = useState<TerrainAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Calcule au rendu : sans jeton la connexion est vouee a l'echec, autant
  // partir directement de l'etat « hors flux » plutot que de le corriger apres coup.
  const [socketState, setSocketState] = useState<SocketState>(() =>
    typeof window !== 'undefined' && localStorage.getItem(TOKEN_KEYS.access)
      ? 'connecting'
      : 'offline',
  );
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);

  /** Positions recues avant que la liste REST n'arrive, rejouees ensuite. */
  const pending = useRef<Map<string, PositionEvent>>(new Map());

  /** Socket conserve pour pouvoir solliciter un telephone, pas seulement ecouter. */
  const socketRef = useRef<Socket | null>(null);

  const applyEvent = useCallback((payload: PositionEvent) => {
    const id = String(payload.agent_id);
    setLastEventAt(new Date().toISOString());
    setAgents((prev) => {
      const index = prev.findIndex((a) => a.id === id);
      if (index === -1) {
        // Agent encore inconnu de la liste : on garde l'evenement pour le
        // prochain rafraichissement plutot que d'inventer une fiche vide.
        pending.current.set(id, payload);
        return prev;
      }
      const ago = minutesSince(payload.derniere_position_at) ?? 0;
      const next = [...prev];
      next[index] = {
        ...next[index],
        lat: Number(payload.latitude),
        lng: Number(payload.longitude),
        dernierePositionAt: payload.derniere_position_at,
        minutesAgo: ago,
        online: payload.en_ligne ?? ago < ONLINE_WINDOW_MIN,
      };
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await agentService.getAllAgents();
      const mapped = (rows as Record<string, unknown>[])
        .map(toTerrainAgent)
        .filter((a): a is TerrainAgent => a !== null);

      // On rejoue les positions arrivees pendant le chargement.
      const replayed = mapped.map((a) => {
        const queued = pending.current.get(a.id);
        if (!queued) return a;
        pending.current.delete(a.id);
        const ago = minutesSince(queued.derniere_position_at) ?? 0;
        return {
          ...a,
          lat: Number(queued.latitude),
          lng: Number(queued.longitude),
          dernierePositionAt: queued.derniere_position_at,
          minutesAgo: ago,
          online: queued.en_ligne ?? ago < ONLINE_WINDOW_MIN,
        };
      });

      setAgents(replayed);
    } catch {
      setError('Impossible de charger les positions des agents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';

    // Sans jeton le serveur ferme la connexion : inutile de la tenter.
    if (typeof window === 'undefined' || !localStorage.getItem(TOKEN_KEYS.access)) return;

    const socket: Socket = io(url, {
      transports: ['websocket'],
      // Fonction et non valeur : socket.io la rappelle a chaque tentative de
      // reconnexion. Le jeton d'acces ne vit que 15 minutes ; fige a la
      // connexion, il condamnait toute reconnexion ulterieure.
      auth: (cb) => cb({ token: localStorage.getItem(TOKEN_KEYS.access) }),
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;
    // `connect` arrive avant que le serveur n'ait valide le jeton : on attend
    // sa confirmation pour annoncer le temps reel.
    socket.on('session:ready', () => setSocketState('live'));
    socket.on('connect', () => setSocketState('connecting'));
    socket.on('disconnect', () => setSocketState('offline'));
    socket.on('agent:position', applyEvent);

    // Un refus par l'intergiciel d'authentification (jeton expire) laisse
    // `socket.active` a false : socket.io ne rejoue alors rien de lui-meme.
    // On relance a la main, le rappel `auth` fournira le jeton renouvele.
    let relance: ReturnType<typeof setTimeout> | null = null;
    socket.on('connect_error', () => {
      setSocketState('offline');
      if (socket.active) return;
      relance = setTimeout(() => socket.connect(), 3000);
    });

    return () => {
      if (relance) clearTimeout(relance);
      socket.off('agent:position', applyEvent);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [applyEvent]);

  /**
   * Demande au telephone d'un agent sa position immediate.
   *
   * Le serveur repond aussitot pour dire si un telephone est joignable ; la
   * position elle-meme arrive ensuite par l'evenement `agent:position`
   * ordinaire, comme n'importe quel releve.
   */
  const requestPosition = useCallback((agentId: string): Promise<boolean> => {
    const socket = socketRef.current;
    if (!socket?.connected) return Promise.resolve(false);

    // Reference locale non nullable : `socketRef.current` peut etre remis a
    // null par le nettoyage de l'effet avant que la promesse ne se resolve.
    const live = socket;

    return new Promise((resolve) => {
      const onAck = (payload: { agent_id: number; joignable: boolean }) => {
        if (String(payload.agent_id) !== agentId) return;
        clearTimeout(timer);
        live.off('agent:position:requested', onAck);
        resolve(Boolean(payload.joignable));
      };

      const timer = setTimeout(() => {
        live.off('agent:position:requested', onAck);
        resolve(false);
      }, 5000);

      live.on('agent:position:requested', onAck);
      live.emit('agent:position:request', { agent_id: Number(agentId) });
    });
  }, []);

  const stats = useMemo(() => {
    const online = agents.filter((a) => a.online).length;
    return { total: agents.length, online, offline: agents.length - online };
  }, [agents]);

  return { agents, stats, loading, error, socketState, lastEventAt, reload: load, requestPosition };
}
