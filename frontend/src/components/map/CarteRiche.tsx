'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LngLatBounds } from 'maplibre-gl';
import {
  Map as CarteBase, MapClusterLayer, MapControls, MapGeoJSON, MapMarker, MapPopup, MapRoute, MarkerContent, MarkerPopup, MarkerTooltip, useMap,
} from '@/components/ui/map';
import { PinCarte, estEpingle } from './PinCarte';
import { PopupCarte } from './PopupCarte';
import type { CarteLigne, CartePoint, CartePolygone } from './types';

/**
 * Carte MapLibre (composants mapcn) sur le fond OpenFreeMap : gratuit, sans clé, sans compte.
 * Marqueurs en SVG (épingles et pastilles à pictogramme), fenêtres d'information riches avec boutons vers les pages
 * de référence. Au-delà de `SEUIL_DENSE` points, passage en regroupement (clusters) pour rester fluide.
 * Si le fond ne se charge pas ou que WebGL est indisponible, `onEchec` permet de revenir à la carte Leaflet.
 */

const SEUIL_DENSE = 350;
const DELAI_CHARGEMENT_MS = 15_000;

export function webglDisponible(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

/** Recadre sur l'ensemble des éléments dès qu'ils changent. */
function Cadrage({ coords }: { coords: [number, number][] }) {
  const { map, isLoaded } = useMap();
  const cle = `${coords.length}:${coords[0]?.join(',')}:${coords[coords.length - 1]?.join(',')}`;
  useEffect(() => {
    if (!map || !isLoaded || coords.length === 0) return;
    if (coords.length === 1) { map.easeTo({ center: coords[0], zoom: 15, duration: 500 }); return; }
    const b = new LngLatBounds(coords[0], coords[0]);
    coords.forEach((c) => b.extend(c));
    map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, cle]);
  return null;
}

/** Signale l'échec du fond de carte (style inaccessible ou jamais chargé) pour basculer sur le moteur de repli. */
export function Surveillance({ onEchec }: { onEchec: () => void }) {
  const { map } = useMap();
  const echec = useRef(onEchec);
  useEffect(() => { echec.current = onEchec; });
  useEffect(() => {
    if (!map) return;
    let charge = false;
    const surChargement = () => { charge = true; };
    // Une erreur avant le premier chargement = style ou ressources de base inaccessibles. Après, ce ne sont que des tuiles manquantes.
    const surErreur = () => { if (!charge) echec.current(); };
    map.on('load', surChargement);
    map.on('error', surErreur);
    const delai = setTimeout(() => { if (!charge) echec.current(); }, DELAI_CHARGEMENT_MS);
    return () => { clearTimeout(delai); map.off('load', surChargement); map.off('error', surErreur); };
  }, [map]);
  return null;
}

function PopupSimple({ titre, detail }: { titre?: string; detail?: string }) {
  return <div className="rounded-lg bg-popover px-3 py-2 text-sm shadow-lg"><strong>{titre}</strong>{detail && <p className="text-xs text-muted-foreground">{detail}</p>}</div>;
}

export default function CarteRiche({ points = [], lignes = [], polygones = [], hauteur = 480, onEchec }: {
  points?: CartePoint[]; lignes?: CarteLigne[]; polygones?: CartePolygone[]; hauteur?: number; onEchec?: () => void;
}) {
  const coords: [number, number][] = useMemo(() => [
    ...points.map((p) => [p.lng, p.lat] as [number, number]),
    ...lignes.flatMap((l) => l.points.map(([lat, lng]) => [lng, lat] as [number, number])),
    ...polygones.flatMap((p) => p.anneau.map(([lat, lng]) => [lng, lat] as [number, number])),
  ], [points, lignes, polygones]);
  const dense = points.length > SEUIL_DENSE;
  const [ouvert, setOuvert] = useState<{ lng: number; lat: number; point?: CartePoint; polygone?: CartePolygone } | null>(null);

  // En mode dense, les points sont regroupés par couleur (un calque de clusters par couleur).
  const groupes = useMemo(() => {
    if (!dense) return [];
    const m = new Map<string, CartePoint[]>();
    for (const p of points) (m.get(p.couleur) ?? m.set(p.couleur, []).get(p.couleur)!).push(p);
    return [...m.entries()].map(([couleur, liste]) => ({
      couleur, liste,
      data: { type: 'FeatureCollection' as const, features: liste.map((p, i) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] }, properties: { i } })) },
    }));
  }, [dense, points]);

  return (
    <div className="relative w-full overflow-hidden rounded-lg border" style={{ height: hauteur }}>
      <CarteBase className="h-full w-full" viewport={{ center: coords[0] ?? [9.7, 4.05], zoom: 12 }}>
        {onEchec && <Surveillance onEchec={onEchec} />}
        <MapControls position="top-right" showZoom showCompass showLocate showFullscreen />
        <Cadrage coords={coords} />

        {polygones.map((p, i) => (
          <MapGeoJSON
            key={`pg${i}`} id={`zone-${i}`}
            data={{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [p.anneau.map(([lat, lng]) => [lng, lat])] }, properties: {} }}
            fillPaint={{ 'fill-color': p.couleur, 'fill-opacity': 0.14 }} linePaint={{ 'line-color': p.couleur, 'line-width': 2 }}
            onClick={(e) => setOuvert({ lng: e.longitude, lat: e.latitude, polygone: p })}
          />
        ))}
        {lignes.map((l, i) => (
          <MapRoute key={`l${i}`} id={`ligne-${i}`} coordinates={l.points.map(([lat, lng]) => [lng, lat] as [number, number])} color={l.couleur} width={l.epaisseur ?? 4} opacity={0.85} dashArray={l.pointille ? [2, 2] : undefined} interactive={false} />
        ))}

        {!dense && points.map((p, i) => (
          <MapMarker key={`${i}-${p.lat}-${p.lng}`} longitude={p.lng} latitude={p.lat} anchor={estEpingle(p.icone, p.numero) ? 'bottom' : 'center'}>
            <MarkerContent><PinCarte couleur={p.couleur} icone={p.icone} numero={p.numero} pulse={p.pulse} /></MarkerContent>
            {p.popup
              ? <MarkerPopup className="w-auto max-w-none border-0 bg-transparent p-0 shadow-none" offset={estEpingle(p.icone, p.numero) ? [0, -46] : 14}><PopupCarte popup={p.popup} couleur={p.couleur} icone={p.icone} /></MarkerPopup>
              : (p.titre || p.detail) && <MarkerPopup className="w-auto max-w-none border-0 bg-transparent p-0 shadow-none"><PopupSimple titre={p.titre} detail={p.detail} /></MarkerPopup>}
            {(p.popup?.titre ?? p.titre) && <MarkerTooltip offset={estEpingle(p.icone, p.numero) ? [0, -52] : 18}>{p.popup?.titre ?? p.titre}</MarkerTooltip>}
          </MapMarker>
        ))}

        {dense && groupes.map((g) => (
          <MapClusterLayer
            key={g.couleur} data={g.data} pointColor={g.couleur} clusterColors={[g.couleur, g.couleur, g.couleur]} clusterRadius={45} clusterMaxZoom={14}
            onPointClick={(f, c) => setOuvert({ lng: c[0], lat: c[1], point: g.liste[(f.properties as { i: number }).i] })}
          />
        ))}

        {ouvert && (
          <MapPopup longitude={ouvert.lng} latitude={ouvert.lat} onClose={() => setOuvert(null)} closeButton className="w-auto max-w-none border-0 bg-transparent p-0 shadow-none" offset={12}>
            {ouvert.point?.popup
              ? <PopupCarte popup={ouvert.point.popup} couleur={ouvert.point.couleur} icone={ouvert.point.icone} />
              : ouvert.polygone?.popup
                ? <PopupCarte popup={ouvert.polygone.popup} couleur={ouvert.polygone.couleur} />
                : <PopupSimple titre={ouvert.point?.titre ?? ouvert.polygone?.titre} detail={ouvert.point?.detail} />}
          </MapPopup>
        )}
      </CarteBase>
    </div>
  );
}
