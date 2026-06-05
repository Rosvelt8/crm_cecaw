'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default Leaflet marker icons (webpack asset issue)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_CENTER: [number, number] = [4.0483, 9.7085]; // Douala, Cameroun

interface Props {
  value: { lat: number; lng: number } | null;
  onChange: (coords: { lat: number; lng: number }) => void;
}

function ClickHandler({ onChange }: { onChange: (c: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function FlyTo({ value }: { value: { lat: number; lng: number } | null }) {
  const map = useMap();
  const prev = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (value) {
      const lat = Number(value.lat);
      const lng = Number(value.lng);
      if (prev.current?.lat !== lat || prev.current?.lng !== lng) {
        map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 1 });
        prev.current = { lat, lng };
      }
    }
  }, [value, map]);
  return null;
}

export default function LocationPickerMap({ value, onChange }: Props) {
  const lat = value ? Number(value.lat) : null;
  const lng = value ? Number(value.lng) : null;
  return (
    <MapContainer
      center={lat !== null && lng !== null ? [lat, lng] : DEFAULT_CENTER}
      zoom={13}
      style={{ height: '300px', width: '100%', borderRadius: '0.5rem' }}
      className="z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />
      <ClickHandler onChange={onChange} />
      <FlyTo value={value} />
      {lat !== null && lng !== null && (
        <Marker
          position={[lat, lng]}
          draggable
          eventHandlers={{
            dragend(e) {
              const latlng = (e.target as L.Marker).getLatLng();
              onChange({ lat: latlng.lat, lng: latlng.lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
}
