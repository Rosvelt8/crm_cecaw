'use client';

import dynamic from 'next/dynamic';
import type { CarteLigne, CartePoint, CartePolygone } from './CarteInner';

export type { CarteLigne, CartePoint, CartePolygone };

const CarteInner = dynamic(() => import('./CarteInner'), {
  ssr: false,
  loading: () => <div className="h-[480px] w-full flex items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">Chargement de la carte…</div>,
});

export default function Carte(props: { points?: CartePoint[]; lignes?: CarteLigne[]; polygones?: CartePolygone[]; hauteur?: number }) {
  return <CarteInner {...props} />;
}
