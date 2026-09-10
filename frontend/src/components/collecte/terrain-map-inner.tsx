'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type TerrainAgent = {
  id: string;
  lat: number;
  lng: number;
  initials: string;
  nom: string;
  matricule: string;
  secteur: string;
  equipe: string;
  agenceId: string;
  online: boolean;
  minutesAgo: number | null;
  dernierePositionAt: string | null;
};

delete (L.Icon.Default.prototype as any)._getIconUrl;

function makeIcon(initials: string, online: boolean, selected: boolean) {
  const bg = selected ? '#1d4ed8' : online ? '#10b981' : '#94a3b8';
  const border = selected ? '#1e40af' : online ? '#059669' : '#64748b';
  const ring = online
    ? `<div style="position:absolute;width:56px;height:56px;border-radius:50%;
        border:2.5px solid ${bg};opacity:0.5;top:-8px;left:-8px;
        animation:terrain-ring 2s ease-out infinite;pointer-events:none;"></div>`
    : '';
  return L.divIcon({
    html: `
      <div style="position:relative;width:40px;height:40px;">
        ${ring}
        <div style="
          width:40px;height:40px;border-radius:50%;
          background:${bg};border:3px solid ${border};
          box-shadow:0 4px 14px rgba(0,0,0,0.28);
          display:flex;align-items:center;justify-content:center;
          color:white;font-weight:700;font-size:13px;letter-spacing:-0.5px;
          cursor:pointer;user-select:none;
          ${selected ? 'transform:scale(1.18);' : 'transition:transform 0.15s;'}
        ">${initials}</div>
        ${online
          ? `<div style="position:absolute;bottom:2px;right:2px;width:11px;height:11px;
              background:#22c55e;border:2px solid white;border-radius:50%;"></div>`
          : ''}
      </div>
    `,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -26],
  });
}

function FlyToAgent({ selectedId, agents }: { selectedId: string | null; agents: TerrainAgent[] }) {
  const map = useMap();
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId && selectedId !== prev.current) {
      const a = agents.find((ag) => ag.id === selectedId);
      if (a) map.flyTo([a.lat, a.lng], Math.max(map.getZoom(), 16), { duration: 1.2 });
      prev.current = selectedId;
    }
  }, [selectedId, agents, map]);
  return null;
}

/** Trajet du jour de l'agent selectionne, trace par-dessus la carte. */
export type TrajetPoint = { latitude: number; longitude: number; releve_at: string };

interface Props {
  agents: TerrainAgent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  trajet?: TrajetPoint[];
}

const CENTER: [number, number] = [4.0490, 9.7020];

export default function TerrainMapInner({ agents, selectedId, onSelect, trajet = [] }: Props) {
  useEffect(() => {
    const style = document.createElement('style');
    style.dataset.id = 'terrain-ring';
    style.textContent = `
      @keyframes terrain-ring {
        0%   { transform: scale(1);   opacity: 0.6; }
        100% { transform: scale(1.9); opacity: 0;   }
      }
      .leaflet-popup-content-wrapper {
        border-radius: 12px !important;
        padding: 0 !important;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18) !important;
        overflow: hidden;
      }
      .leaflet-popup-content {
        margin: 0 !important;
        width: auto !important;
      }
      .leaflet-popup-tip-container { margin-top: -1px; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <MapContainer
      center={CENTER}
      zoom={14}
      style={{ height: '100%', width: '100%' }}
      className="z-0"
      zoomControl={true}
      touchZoom={true}
      doubleClickZoom={true}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        subdomains="abc"
        maxZoom={19}
      />
      <FlyToAgent selectedId={selectedId} agents={agents} />

      {/* Trajet du jour : la ligne relie les releves, les pastilles marquent
          chaque point transmis par le telephone. */}
      {trajet.length > 1 && (
        <Polyline
          positions={trajet.map((p) => [p.latitude, p.longitude] as [number, number])}
          pathOptions={{ color: '#b8860b', weight: 4, opacity: 0.75 }}
        />
      )}
      {trajet.map((p, i) => (
        <CircleMarker
          key={`${p.releve_at}-${i}`}
          center={[p.latitude, p.longitude]}
          radius={4}
          pathOptions={{ color: '#96670a', fillColor: '#e5b830', fillOpacity: 0.9, weight: 1.5 }}
        >
          <Popup>
            <div style={{ padding: '6px 10px', fontSize: 12 }}>
              {new Date(p.releve_at).toLocaleTimeString('fr-FR', {
                hour: '2-digit', minute: '2-digit', second: '2-digit',
              })}
              <div style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 10 }}>
                {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
      {agents.map((a) => (
        <Marker
          key={a.id}
          position={[a.lat, a.lng]}
          icon={makeIcon(a.initials, a.online, selectedId === a.id)}
          eventHandlers={{ click: () => onSelect(a.id) }}
        >
          <Popup>
            <div style={{ width: 200, fontFamily: 'system-ui, sans-serif' }}>
              {/* Header */}
              <div style={{
                background: a.online ? '#10b981' : '#94a3b8',
                padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 700, fontSize: 14, flexShrink: 0,
                }}>{a.initials}</div>
                <div>
                  <div style={{ color: 'white', fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>{a.nom}</div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontFamily: 'monospace' }}>{a.matricule}</div>
                </div>
              </div>
              {/* Body */}
              <div style={{ padding: '10px 14px 12px', lineHeight: 1.7 }}>
                <div style={{ fontSize: 12, color: '#475569' }}>
                  <div>📍 <strong style={{ color: '#1e293b' }}>{a.secteur}</strong></div>
                  {a.equipe && <div>👥 {a.equipe}</div>}
                </div>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: a.online ? '#dcfce7' : '#f1f5f9',
                    color: a.online ? '#166534' : '#64748b',
                    padding: '2px 10px', borderRadius: 9999,
                    fontSize: 11, fontWeight: 700,
                  }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: a.online ? '#22c55e' : '#94a3b8',
                      display: 'inline-block',
                    }} />
                    {a.online ? 'En ligne' : 'Hors ligne'}
                  </span>
                </div>
                {a.dernierePositionAt && (
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                    Dernière pos. :{' '}
                    {a.minutesAgo !== null && a.minutesAgo < 60
                      ? `il y a ${a.minutesAgo} min`
                      : new Date(a.dernierePositionAt).toLocaleString('fr-FR', {
                          day: 'numeric', month: 'short',
                          hour: '2-digit', minute: '2-digit',
                        })}
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 4, fontFamily: 'monospace' }}>
                  {a.lat.toFixed(4)}, {a.lng.toFixed(4)}
                </div>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
