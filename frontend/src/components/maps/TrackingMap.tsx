'use client';

import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';
import { CECAW_COORDINATES } from '@/constants';

// Tous les marqueurs utilisent des divIcon personnalisés — pas de dépendance externe nécessaire

interface AgentMarkerProps {
  agent: {
    id: number;
    nom: string;
    lat: number;
    lng: number;
    statut: string;
    lastSeen: string;
  };
}

function AgentMarker({ agent }: AgentMarkerProps) {
    const iconColor = agent.statut === 'actif' ? '#10b981' : '#f59e0b';
    
    // Custom marker icon
    const customIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color: ${iconColor}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });

    return (
        <Marker position={[agent.lat, agent.lng]} icon={customIcon}>
            <Popup className="premium-popup">
                <div className="p-1">
                    <h3 className="font-bold text-sm">{agent.nom}</h3>
                    <p className="text-xs text-muted-foreground capitalize">{agent.statut}</p>
                    <div className="mt-2 text-[10px] text-muted-foreground">
                        Dernière mise à jour: {agent.lastSeen}
                    </div>
                </div>
            </Popup>
        </Marker>
    );
}

const mockAgents = [
    { id: 1, nom: "Mvondo Jean", lat: 4.0511, lng: 9.7679, statut: "actif", lastSeen: "Il y a 2 min" },
    { id: 2, nom: "Kamga Eric", lat: 4.0621, lng: 9.7550, statut: "actif", lastSeen: "Il y a 5 min" },
    { id: 3, nom: "Ngassa Marie", lat: 4.0411, lng: 9.7789, statut: "pause", lastSeen: "Il y a 15 min" },
    { id: 4, nom: "Talla Pierre", lat: 4.0750, lng: 9.7230, statut: "actif", lastSeen: "Il y a 1 min" },
];

export default function TrackingMap() {
  return (
    <div className="h-full w-full rounded-lg overflow-hidden border shadow-sm relative">
      <MapContainer
        center={[CECAW_COORDINATES.lat, CECAW_COORDINATES.lng]}
        zoom={CECAW_COORDINATES.zoom}
        scrollWheelZoom={true}
        className="h-full w-full z-10"
        touchZoom={true}
        doubleClickZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {mockAgents.map(agent => (
            <AgentMarker key={agent.id} agent={agent} />
        ))}
        {/* Agence Circle */}
        <Circle 
            center={[CECAW_COORDINATES.lat, CECAW_COORDINATES.lng]} 
            radius={1000} 
            pathOptions={{ fillColor: '#1d4ed8', color: '#1d4ed8', opacity: 0.3, fillOpacity: 0.1 }}
        />
      </MapContainer>
      
      {/* Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-20 bg-background/90 backdrop-blur-sm p-3 rounded-lg border shadow-lg text-[11px] space-y-2">
         <div className="font-bold mb-1">Légende</div>
         <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-success-500" />
            <span>Agent Actif</span>
         </div>
         <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-warning-500" />
            <span>En Pause</span>
         </div>
         <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary-500/20 border border-primary-500" />
            <span>Rayon Agence (1km)</span>
         </div>
      </div>
    </div>
  );
}
