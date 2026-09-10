'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { agentService } from '@/services/agentService';
import type { TrajetPoint } from '@/components/collecte/terrain-map-inner';
import { agenceService } from '@/services/agenceService';
import { useAgentsLive } from '@/hooks/useAgentsLive';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search, Signal, WifiOff, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

const TerrainMap = dynamic(() => import('@/components/collecte/terrain-map-inner'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-slate-100">
      <div className="text-center space-y-2">
        <MapPin className="h-8 w-8 text-muted-foreground/40 mx-auto animate-pulse" />
        <p className="text-sm text-muted-foreground">Chargement de la carte…</p>
      </div>
    </div>
  ),
});

export default function TerrainPage() {
  // Positions et flux temps reel partages avec la page Geolocalisation.
  const { agents } = useAgentsLive();
  const [agences, setAgences] = useState<{ id: number; nom: string }[]>([]);
  const [search, setSearch] = useState('');
  const [filterAgence, setFilterAgence] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trajet, setTrajet] = useState<TrajetPoint[]>([]);
  const [trajetKm, setTrajetKm] = useState<number>(0);

  // Trajet du jour de l'agent selectionne, rafraichi a chaque nouvelle position.
  useEffect(() => {
    if (!selectedId) return;
    let annule = false;
    agentService
      .getTrajet(selectedId)
      .then((t) => {
        if (annule) return;
        setTrajet(t.points);
        setTrajetKm(t.distance_km);
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [selectedId, agents]);

  useEffect(() => {
    agenceService.getAgences({ per_page: 100 }).then((r) => setAgences(r.data ?? [])).catch(() => {});
  }, []);

  const filtered = agents.filter((a) => {
    const q = search.toLowerCase();
    if (filterAgence !== 'all' && a.agenceId !== filterAgence) return false;
    if (q && !`${a.nom} ${a.matricule} ${a.secteur} ${a.equipe}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const onlineCount = agents.filter((a) => a.online).length;
  const selectedAgent = agents.find((a) => a.id === selectedId);

  return (
    <div
      className="-mx-4 -mb-4 -mt-4 lg:-mx-8 lg:-mb-8 lg:-mt-8 flex flex-col lg:flex-row"
      style={{ height: 'calc(100vh - 56px)' }}
    >
      {/* ── Left panel ───────────────────────────────────────────────── */}
      <div className="w-full lg:w-72 lg:shrink-0 flex flex-col bg-white lg:border-r border-b lg:border-b-0 border-border/80 shadow-sm lg:shadow-sm z-10 h-[40vh] lg:h-full">

        {/* Header */}
        <div className="px-3 sm:px-4 py-2 sm:py-3 border-b space-y-2 sm:space-y-3">
          <div className="flex items-start sm:items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-xs sm:text-sm leading-none">Suivi Terrain</p>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">
                <span className={cn('font-bold', onlineCount > 0 ? 'text-emerald-600' : 'text-slate-400')}>
                  {onlineCount}
                </span>
                <span className="text-muted-foreground"> / {agents.length} en ligne</span>
              </p>
            </div>
            <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', onlineCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300')} />
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-8 h-7 sm:h-8 text-xs"
              placeholder="Nom, matricule…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={filterAgence} onValueChange={(v) => { setFilterAgence(v); setSelectedId(null); }}>
            <SelectTrigger className="h-7 sm:h-8 text-xs">
              <SelectValue placeholder="Toutes les agences" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les agences</SelectItem>
              {agences.map((ag) => (
                <SelectItem key={ag.id} value={String(ag.id)}>{ag.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-1.5 sm:py-2 border-b bg-muted/30">
          <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-muted-foreground">
            <div className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="hidden sm:inline">En ligne (&lt;60 min)</span>
            <span className="sm:hidden">Ligne</span>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-muted-foreground">
            <div className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-slate-400 shrink-0" />
            <span className="hidden sm:inline">Hors ligne</span>
            <span className="sm:hidden">Offline</span>
          </div>
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map((a) => (
            <button
              key={a.id}
              className={cn(
                'w-full text-left px-2 sm:px-4 py-2 sm:py-3 transition-colors hover:bg-muted/50 border-b border-border/50',
                selectedId === a.id
                  ? 'bg-brand-50 border-l-[3px] border-l-brand-500 pl-[calc(0.5rem-3px)] sm:pl-[calc(1rem-3px)]'
                  : 'border-l-[3px] border-l-transparent'
              )}
              onClick={() => setSelectedId(a.id === selectedId ? null : a.id)}
            >
              <div className="flex items-center gap-2">
                <div className={cn(
                  'h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-bold text-white shrink-0',
                  a.online ? 'bg-emerald-500' : 'bg-slate-400'
                )}>
                  {a.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[11px] sm:text-xs leading-tight truncate">{a.nom}</p>
                  <p className="text-[9px] sm:text-[10px] font-mono text-muted-foreground truncate">{a.matricule}</p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate hidden sm:block">{a.secteur}</p>
                </div>
                <div className="shrink-0">
                  {a.online
                    ? <Signal className="h-3 w-3 text-emerald-500" />
                    : <WifiOff className="h-3 w-3 text-muted-foreground/30" />}
                </div>
              </div>
              {a.dernierePositionAt && (
                <p className={cn('text-[9px] sm:text-[10px] mt-1 pl-9 sm:pl-10', a.online ? 'text-emerald-600' : 'text-muted-foreground/60')}>
                  {a.minutesAgo !== null && a.minutesAgo < 60
                    ? `Il y a ${a.minutesAgo} min`
                    : new Date(a.dernierePositionAt).toLocaleString('fr-FR', {
                        day: 'numeric', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                      })}
                </p>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="py-8 sm:py-12 text-center text-xs text-muted-foreground">Aucun agent trouvé.</div>
          )}
        </div>

        {/* Footer */}
        <div className="p-2 sm:p-3 border-t space-y-2 bg-muted/20">
          {selectedAgent ? (
            <div className="space-y-1">
              <div className="text-[9px] sm:text-[11px] text-muted-foreground text-center truncate">
                Sélectionné : <span className="font-semibold text-foreground">{selectedAgent.nom}</span>
              </div>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground text-center">
                {selectedAgent.minutesAgo === null
                  ? 'Aucune position reçue de son téléphone'
                  : selectedAgent.minutesAgo < 60
                    ? `Position reçue il y a ${selectedAgent.minutesAgo} min`
                    : `Dernière position il y a ${Math.floor(selectedAgent.minutesAgo / 60)} h`}
              </p>
            </div>
          ) : (
            <p className="text-[9px] sm:text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              {agents.length} agent{agents.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* ── Map area ─────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden h-[60vh] lg:h-full">
        <TerrainMap
          agents={filtered}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
          trajet={selectedId ? trajet : []}
        />

        {selectedId ? (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] bg-white/95 border border-brand-100 rounded-full px-4 py-1.5 shadow-sm text-[11px] font-semibold flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            {trajet.length > 0
              ? `Trajet du jour : ${trajet.length} relevés · ${trajetKm} km`
              : "Aucun relevé transmis aujourd'hui"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
