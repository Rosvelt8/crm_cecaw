import React, { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus, View } from 'react-native';
import { useSession } from '../store/session';

/**
 * Verrouillage automatique.
 *
 * Deux declencheurs, parce qu'un telephone se perd aussi bien pose sur une table
 * qu'au fond d'une poche :
 *  - retour d'arriere-plan apres un delai superieur a celui choisi par l'agent ;
 *  - absence de toute interaction pendant ce meme delai, application ouverte.
 */
export function AutoLockProvider({ children }: { children: React.ReactNode }) {
  const status = useSession((s) => s.status);
  const lockDelayMin = useSession((s) => s.lockDelayMin);
  const lock = useSession((s) => s.lock);

  const backgroundedAt = useRef<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayMs = Math.max(1, lockDelayMin) * 60_000;

  const clearIdleTimer = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, []);

  const restartIdleTimer = useCallback(() => {
    clearIdleTimer();
    if (status !== 'ready') return;
    idleTimer.current = setTimeout(lock, delayMs);
  }, [clearIdleTimer, delayMs, lock, status]);

  useEffect(() => {
    restartIdleTimer();
    return clearIdleTimer;
  }, [restartIdleTimer, clearIdleTimer]);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === 'active') {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (since !== null && Date.now() - since >= delayMs) lock();
        else restartIdleTimer();
        return;
      }
      // « inactive » couvre le sas de bascule sur iOS (multitache, appel entrant).
      if (backgroundedAt.current === null) backgroundedAt.current = Date.now();
      clearIdleTimer();
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [clearIdleTimer, delayMs, lock, restartIdleTimer]);

  return (
    // Capture sans consommer : le minuteur repart a chaque geste, et les
    // composants en dessous recoivent l'evenement normalement.
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        restartIdleTimer();
        return false;
      }}
    >
      {children}
    </View>
  );
}
