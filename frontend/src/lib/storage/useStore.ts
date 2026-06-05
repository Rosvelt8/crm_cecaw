'use client';

import { useState, useCallback } from 'react';

function readLS<T>(key: string, seeds: T[]): T[] {
  if (typeof window === 'undefined') return seeds;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      localStorage.setItem(key, JSON.stringify(seeds));
      return seeds;
    }
    return JSON.parse(raw) as T[];
  } catch {
    return seeds;
  }
}

function writeLS<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
}

/**
 * Hook générique CRUD sur localStorage.
 * Toutes les entités doivent avoir un champ `id: string`.
 * Les seeds ne sont écrits qu'une seule fois (si la clé est absente).
 */
export function useStore<T extends { id: string }>(key: string, seeds: T[] = []) {
  const [items, setItems] = useState<T[]>(() => readLS<T>(key, seeds));

  const add = useCallback((item: T) => {
    setItems((prev) => {
      const next = [item, ...prev];
      writeLS(key, next);
      return next;
    });
  }, [key]);

  const update = useCallback((id: string, patch: Partial<Omit<T, 'id'>>) => {
    setItems((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, ...patch } : item));
      writeLS(key, next);
      return next;
    });
  }, [key]);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      writeLS(key, next);
      return next;
    });
  }, [key]);

  /** Réinitialise le store aux seeds (utile pour le dev) */
  const reset = useCallback(() => {
    writeLS(key, seeds);
    setItems(seeds);
  }, [key, seeds]);

  return { items, add, update, remove, reset };
}

/** Lecture directe hors hook (ex : dans logger) */
export function readStore<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

export const STORAGE_KEYS = {
  groupesProduits: 'cecaw_groupes_produits',
  produits:        'cecaw_produits',
  agences:         'cecaw_agences',
  equipes:         'cecaw_equipes',
  utilisateurs:    'cecaw_utilisateurs',
  agents:          'cecaw_agents',
  prospects:       'cecaw_prospects',
  clients:         'cecaw_clients',
  comptes:         'cecaw_comptes',
  transactions:    'cecaw_transactions',
  objectifs:       'cecaw_objectifs',
  logs:            'cecaw_logs',
} as const;
