'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { CarteLigne, CartePoint, CartePolygone } from './types';
import { webglDisponible } from './CarteRiche';

export type { CarteLigne, CartePoint, CartePolygone };
export type { ActionCarte, BadgeCarte, IconeCarte, InfoCarte, PopupCarte } from './types';

const chargement = <div className="h-[480px] w-full flex items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">Chargement de la carte…</div>;
const CarteRiche = dynamic(() => import('./CarteRiche'), { ssr: false, loading: () => chargement });
const CarteInner = dynamic(() => import('./CarteInner'), { ssr: false, loading: () => chargement });

type Props = { points?: CartePoint[]; lignes?: CarteLigne[]; polygones?: CartePolygone[]; hauteur?: number };

/**
 * Carte générique. Moteur principal : MapLibre (mapcn) sur le fond gratuit OpenFreeMap. Si WebGL est indisponible, si le
 * fond ne se charge pas, ou si NEXT_PUBLIC_CARTE_MOTEUR=leaflet, on revient à la carte Leaflet / OpenStreetMap d'origine.
 */
export default function Carte(props: Props) {
  const force = process.env.NEXT_PUBLIC_CARTE_MOTEUR === 'leaflet';
  const [repli, setRepli] = useState(false);
  // WebGL se teste côté navigateur uniquement (ce composant n'est rendu qu'après authentification).
  const [sansWebgl] = useState(() => typeof document !== 'undefined' && !webglDisponible());
  if (force || repli || sansWebgl) {
    return (
      <div className="space-y-1">
        {(repli || sansWebgl) && !force && <p className="text-[11px] text-muted-foreground">Carte simplifiée (le fond de carte principal n&apos;a pas pu être chargé).</p>}
        <CarteInner {...props} />
      </div>
    );
  }
  return <CarteRiche {...props} onEchec={() => setRepli(true)} />;
}
