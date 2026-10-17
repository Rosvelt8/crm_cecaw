'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { LngLatBounds } from 'maplibre-gl';
import { Map as CarteBase, MapControls, MapMarker, MapRoute, MarkerContent, MarkerPopup, MarkerTooltip, useMap } from '@/components/ui/map';
import { Surveillance, webglDisponible } from '@/components/map/CarteRiche';
import { PopupCarte } from '@/components/map/PopupCarte';
import type { TerrainAgent, TrajetAgent, TrajetPoint } from './terrain-map-inner';

const TerrainMapLeaflet = dynamic(() => import('./terrain-map-inner'), { ssr: false });

interface Props {
  agents: TerrainAgent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  trajet?: TrajetPoint[];
  trajets?: TrajetAgent[];
}

const heure = (iso: string, secondes = false) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', ...(secondes ? { second: '2-digit' } : {}) });

/** Recentre la carte sur l'agent sélectionné, ou sur l'ensemble des agents quand la liste change. */
function Cadrage({ agents, selectedId }: { agents: TerrainAgent[]; selectedId: string | null }) {
  const { map, isLoaded } = useMap();
  const precedent = useRef<string | null>(null);
  const cle = agents.map((a) => a.id).join(',');
  useEffect(() => {
    if (!map || !isLoaded || agents.length === 0) return;
    if (selectedId) {
      if (selectedId === precedent.current) return;
      const a = agents.find((x) => x.id === selectedId);
      if (a) { map.flyTo({ center: [a.lng, a.lat], zoom: Math.max(map.getZoom(), 16), offset: [0, Math.round(map.getContainer().clientHeight * 0.22)], duration: 1200 }); precedent.current = selectedId; return; }
    }
    precedent.current = null;
    if (agents.length === 1) { map.easeTo({ center: [agents[0].lng, agents[0].lat], zoom: 15, duration: 500 }); return; }
    const b = new LngLatBounds([agents[0].lng, agents[0].lat], [agents[0].lng, agents[0].lat]);
    agents.forEach((a) => b.extend([a.lng, a.lat]));
    map.fitBounds(b, { padding: 70, maxZoom: 15, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, selectedId, cle]);
  return null;
}

/** Pastille d'agent : initiales, anneau animé en ligne, contour bleu quand l'agent est sélectionné. */
function Avatar({ a, actif }: { a: TerrainAgent; actif: boolean }) {
  const fond = actif ? '#1d4ed8' : a.online ? '#10b981' : '#94a3b8';
  return (
    <div className={`relative h-10 w-10 transition-transform ${actif ? 'scale-125' : ''}`}>
      {a.online && <span className="absolute -inset-2 rounded-full border-[2.5px] animate-ping opacity-40" style={{ borderColor: fond }} />}
      <span className="relative grid h-10 w-10 place-items-center rounded-full border-[3px] border-white text-[13px] font-bold tracking-tight text-white shadow-lg" style={{ background: fond }}>{a.initials}</span>
      {a.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500" />}
    </div>
  );
}

function popupAgent(a: TerrainAgent) {
  return {
    titre: a.nom,
    sousTitre: a.matricule,
    badges: [{ label: a.online ? 'En ligne' : 'Hors ligne', ton: a.online ? 'bon' as const : 'neutre' as const }],
    infos: [
      { icone: 'zone' as const, label: 'Secteur', valeur: a.secteur || '—' },
      ...(a.equipe ? [{ icone: 'personne' as const, label: 'Équipe', valeur: a.equipe }] : []),
      ...(a.dernierePositionAt ? [{
        icone: 'heure' as const, label: 'Dernière position',
        valeur: a.minutesAgo !== null && a.minutesAgo < 60 ? `il y a ${a.minutesAgo} min` : new Date(a.dernierePositionAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      }] : []),
      { icone: 'adresse' as const, label: 'Coordonnées', valeur: `${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}` },
    ],
    actions: [
      { label: 'Fiche', href: `/dashboard/collecte/agents/${a.id}`, principale: true, icone: 'voir' as const },
      { label: 'Tournées', href: '/dashboard/terrain/tournees', icone: 'tournee' as const },
      { label: 'Itinéraire', href: `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`, externe: true, icone: 'itineraire' as const },
    ],
  };
}

function TerrainMapRiche({ agents, selectedId, onSelect, trajet = [], trajets = [], onEchec }: Props & { onEchec: () => void }) {
  const ligneJour = useMemo(() => trajet.map((p) => [p.longitude, p.latitude] as [number, number]), [trajet]);
  return (
    <div className="relative h-full w-full overflow-hidden">
      <CarteBase className="h-full w-full" viewport={{ center: [9.702, 4.049], zoom: 14 }}>
        <Surveillance onEchec={onEchec} />
        <MapControls position="top-right" showZoom showCompass showLocate showFullscreen />
        <Cadrage agents={agents} selectedId={selectedId} />

        {trajets.map((t) => t.points.length > 1 && (
          <MapRoute key={`t${t.agent_id}`} id={`trajet-agent-${t.agent_id}`} coordinates={t.points.map((p) => [p.longitude, p.latitude] as [number, number])} color={t.couleur} width={4} opacity={0.8} interactive={false} />
        ))}
        {trajets.map((t) => t.points.length > 0 && (
          <MapMarker key={`d${t.agent_id}`} longitude={t.points[0].longitude} latitude={t.points[0].latitude}>
            <MarkerContent><span className="block h-4 w-4 rounded-full border-2 border-white shadow-md" style={{ background: t.couleur }} /></MarkerContent>
            <MarkerTooltip offset={14}>{t.nom} · départ {heure(t.points[0].releve_at)}</MarkerTooltip>
          </MapMarker>
        ))}

        {ligneJour.length > 1 && <MapRoute id="trajet-jour" coordinates={ligneJour} color="#b8860b" width={4} opacity={0.75} interactive={false} />}
        {trajet.map((p, i) => (
          <MapMarker key={`${p.releve_at}-${i}`} longitude={p.longitude} latitude={p.latitude}>
            <MarkerContent><span className="block h-2.5 w-2.5 rounded-full border border-amber-700 bg-amber-300 shadow" /></MarkerContent>
            <MarkerTooltip offset={10}>{heure(p.releve_at, true)} · {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}</MarkerTooltip>
          </MapMarker>
        ))}

        {agents.map((a) => (
          <MapMarker key={a.id} longitude={a.lng} latitude={a.lat} onClick={() => onSelect(a.id)}>
            <MarkerContent><Avatar a={a} actif={selectedId === a.id} /></MarkerContent>
            <MarkerPopup className="w-auto max-w-none border-0 bg-transparent p-0 shadow-none" offset={28}>
              <PopupCarte popup={popupAgent(a)} couleur={a.online ? '#10b981' : '#64748b'} icone="agent" />
            </MarkerPopup>
            <MarkerTooltip offset={30}>{a.nom}</MarkerTooltip>
          </MapMarker>
        ))}
      </CarteBase>
    </div>
  );
}

/**
 * Carte des agents sur le terrain. Moteur principal : MapLibre / OpenFreeMap (gratuit). Repli automatique sur la carte
 * Leaflet / OpenStreetMap d'origine si WebGL manque, si le fond ne charge pas, ou si NEXT_PUBLIC_CARTE_MOTEUR=leaflet.
 */
export default function TerrainMap(props: Props) {
  const force = process.env.NEXT_PUBLIC_CARTE_MOTEUR === 'leaflet';
  const [repli, setRepli] = useState(false);
  const [sansWebgl] = useState(() => typeof document !== 'undefined' && !webglDisponible());
  if (force || repli || sansWebgl) return <TerrainMapLeaflet {...props} />;
  return <TerrainMapRiche {...props} onEchec={() => setRepli(true)} />;
}
