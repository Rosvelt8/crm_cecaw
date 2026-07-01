'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { MapPin, LocateFixed, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const Map = dynamic(() => import('./location-picker-map'), { ssr: false });

interface Props {
  value: { lat: number; lng: number } | null;
  onChange: (coords: { lat: number; lng: number } | null) => void;
  className?: string;
}

export function LocationPicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);

  const detectPosition = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setOpen(true);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs w-full sm:w-auto"
          onClick={() => setOpen((o) => !o)}
        >
          <MapPin className="h-3.5 w-3.5" />
          {open ? 'Masquer la carte' : 'Ouvrir la carte'}
          {open ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs text-brand-600 border-brand-200 hover:bg-brand-50 w-full sm:w-auto"
          onClick={detectPosition}
          disabled={locating}
        >
          <LocateFixed className={cn('h-3.5 w-3.5', locating && 'animate-spin')} />
          {locating ? 'Localisation…' : 'Détecter ma position'}
        </Button>

        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-red-500 w-full sm:w-auto py-1"
          >
            <X className="h-3 w-3" /> Effacer
          </button>
        )}
      </div>

      {value && (
        <p className="text-xs text-muted-foreground font-mono">
          {Number(value.lat).toFixed(6)}, {Number(value.lng).toFixed(6)}
        </p>
      )}

      {open && (
        <div className="rounded-lg border overflow-hidden">
          <Map value={value} onChange={onChange} />
          <p className="text-[11px] text-muted-foreground px-3 py-1.5 bg-muted/30 border-t">
            Cliquez sur la carte ou faites glisser le marqueur pour ajuster la position.
          </p>
        </div>
      )}
    </div>
  );
}
