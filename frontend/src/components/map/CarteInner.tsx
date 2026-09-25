'use client';

import { useEffect } from 'react';
import { CircleMarker, MapContainer, Polygon, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface CartePoint { lat: number; lng: number; couleur: string; rayon?: number; titre?: string; detail?: string; groupe?: string }
export interface CarteLigne { points: [number, number][]; couleur: string; pointille?: boolean; epaisseur?: number; titre?: string }
export interface CartePolygone { anneau: [number, number][]; couleur: string; titre?: string }

/** Recadre la carte sur l'ensemble des éléments dès qu'ils changent. */
function Cadrage({ points }: { points: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) { map.setView(points[0], 15); return; }
    const bornes: LatLngBoundsExpression = points;
    map.fitBounds(bornes, { padding: [30, 30], maxZoom: 16 });
  }, [map, points]);
  return null;
}

/**
 * Carte OpenStreetMap générique : points colorés, lignes (trajets prévu / réalisé) et polygones (zones).
 * Chargée côté client uniquement (Leaflet manipule `window`), via `Carte.tsx`.
 */
export default function CarteInner({ points = [], lignes = [], polygones = [], hauteur = 480 }: { points?: CartePoint[]; lignes?: CarteLigne[]; polygones?: CartePolygone[]; hauteur?: number }) {
  const tous: LatLngTuple[] = [
    ...points.map((p) => [p.lat, p.lng] as LatLngTuple),
    ...lignes.flatMap((l) => l.points as LatLngTuple[]),
    ...polygones.flatMap((p) => p.anneau as LatLngTuple[]),
  ];
  return (
    <MapContainer center={tous[0] ?? [4.05, 9.7]} zoom={12} style={{ height: hauteur, width: '100%', borderRadius: 8 }} scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {polygones.map((p, i) => (
        <Polygon key={`pg${i}`} positions={p.anneau} pathOptions={{ color: p.couleur, weight: 2, fillOpacity: 0.12 }}>
          {p.titre && <Popup>{p.titre}</Popup>}
        </Polygon>
      ))}
      {lignes.map((l, i) => (
        <Polyline key={`l${i}`} positions={l.points} pathOptions={{ color: l.couleur, weight: l.epaisseur ?? 3, dashArray: l.pointille ? '8 8' : undefined }}>
          {l.titre && <Popup>{l.titre}</Popup>}
        </Polyline>
      ))}
      {points.map((p, i) => (
        <CircleMarker key={`p${i}`} center={[p.lat, p.lng]} radius={p.rayon ?? 6} pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: p.couleur, fillOpacity: 0.9 }}>
          {(p.titre || p.detail) && <Popup><strong>{p.titre}</strong>{p.detail && <><br />{p.detail}</>}</Popup>}
        </CircleMarker>
      ))}
      <Cadrage points={tous} />
    </MapContainer>
  );
}
