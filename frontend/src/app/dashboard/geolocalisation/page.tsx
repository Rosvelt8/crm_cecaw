'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, RefreshCw, Radio, WifiOff, Users, Clock, Crosshair, Route } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentsLive } from '@/hooks/useAgentsLive';
import { agentService } from '@/services/agentService';
import { toast } from 'sonner';
import type { TrajetPoint } from '@/components/collecte/terrain-map-inner';

const TerrainMap = dynamic(() => import('@/components/collecte/terrain-map-inner'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-muted rounded-xl">
      <MapPin className="h-8 w-8 text-muted-foreground animate-bounce" />
      <span className="ml-2 font-medium text-muted-foreground">Chargement de la carte...</span>
    </div>
  ),
});

function freshness(minutesAgo: number | null): string {
  if (minutesAgo === null) return 'Jamais localisé';
  if (minutesAgo < 1) return "A l'instant";
  if (minutesAgo < 60) return `il y a ${minutesAgo} min`;
  const h = Math.floor(minutesAgo / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export default function GeolocationPage() {
  const { agents, stats, loading, error, socketState, lastEventAt, reload, requestPosition } =
    useAgentsLive();
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState<'all' | 'online' | 'offline'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trajet, setTrajet] = useState<TrajetPoint[]>([]);
  const [trajetInfo, setTrajetInfo] = useState<{ km: number; points: number } | null>(null);
  const [syncing, setSyncing] = useState(false);

  /**
   * Selectionner un agent declenche deux choses : le chargement de son trajet
   * du jour, et une demande de position immediate a son telephone.
   */
  const selectAgent = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setSyncing(true);
      const joignable = await requestPosition(id);
      setSyncing(false);
      toast[joignable ? 'success' : 'info'](
        joignable
          ? 'Position demandée au téléphone de l&apos;agent.'
          : "Téléphone injoignable : dernière position connue affichée.",
      );
    },
    [requestPosition],
  );

  // Trajet du jour de l'agent selectionne.
  useEffect(() => {
    // Aucun agent selectionne : l'etat initial est deja vide, rien a effacer.
    if (!selectedId) return;
    let annule = false;
    agentService
      .getTrajet(selectedId)
      .then((t) => {
        if (annule) return;
        setTrajet(t.points);
        setTrajetInfo({ km: t.distance_km, points: t.nb_points });
      })
      .catch(() => {
        if (!annule) {
          setTrajet([]);
          setTrajetInfo(null);
        }
      });
    return () => {
      annule = true;
    };
  }, [selectedId, lastEventAt]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      if (filterStatut === 'online' && !a.online) return false;
      if (filterStatut === 'offline' && a.online) return false;
      if (!q) return true;
      return `${a.nom} ${a.matricule} ${a.secteur} ${a.equipe}`.toLowerCase().includes(q);
    });
  }, [agents, search, filterStatut]);

  return (
    <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Géolocalisation Terrain</h1>
          <p className="text-sm text-muted-foreground">
            Positions transmises par l&apos;application mobile des agents de collecte.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
              socketState === 'live'
                ? 'bg-success-50 text-success-700'
                : socketState === 'connecting'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            {socketState === 'live' ? (
              <Radio className="h-3 w-3 animate-pulse" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {socketState === 'live'
              ? 'Flux temps réel'
              : socketState === 'connecting'
                ? 'Connexion...'
                : 'Hors flux'}
          </div>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brand-600" />
            <span className="text-xs font-medium text-muted-foreground">Agents localisés</span>
          </div>
          <div className="text-2xl font-bold mt-1">{stats.total}</div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-success-600" />
            <span className="text-xs font-medium text-muted-foreground">En ligne</span>
          </div>
          <div className="text-2xl font-bold mt-1 text-success-600">{stats.online}</div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Hors ligne</span>
          </div>
          <div className="text-2xl font-bold mt-1">{stats.offline}</div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-brand-600" />
            <span className="text-xs font-medium text-muted-foreground">Dernier signal</span>
          </div>
          <div className="text-sm font-bold mt-1.5">
            {lastEventAt
              ? new Date(lastEventAt).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : '--'}
          </div>
        </Card>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        <Card className="w-full lg:w-80 lg:shrink-0 flex flex-col min-h-0 overflow-hidden">
          <CardHeader className="p-4 border-b space-y-2">
            <CardTitle className="text-sm flex items-center justify-between">
              Agents sur la carte
              <Badge variant="success">{filtered.length}</Badge>
            </CardTitle>
            <Input
              placeholder="Nom, matricule, secteur..."
              className="h-8 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              value={filterStatut}
              onValueChange={(v) => setFilterStatut(v as typeof filterStatut)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="online">En ligne</SelectItem>
                <SelectItem value="offline">Hors ligne</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>

          <CardContent className="p-0 overflow-y-auto flex-1">
            {loading ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Chargement...</div>
            ) : error ? (
              <div className="p-6 text-center text-xs text-red-500">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Aucun agent n&apos;a encore transmis de position depuis l&apos;application mobile.
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => selectAgent(agent.id)}
                    className={cn(
                      'w-full p-3 text-left hover:bg-muted/50 transition-colors',
                      selectedId === agent.id && 'bg-brand-50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            'h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0',
                            agent.online
                              ? 'bg-success-50 text-success-700'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {agent.initials}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold truncate">{agent.nom}</span>
                          <span className="text-[10px] text-muted-foreground truncate">
                            {agent.matricule}
                            {agent.secteur ? ` - ${agent.secteur}` : ''}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {freshness(agent.minutesAgo)}
                          </span>
                        </div>
                      </div>
                      <div
                        className={cn(
                          'h-2 w-2 rounded-full shrink-0',
                          agent.online ? 'bg-success-500' : 'bg-slate-300',
                        )}
                      />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex-1 min-h-0 flex flex-col gap-2">
          {selectedId ? (
            <div className="flex items-center gap-3 text-xs bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 shrink-0">
              {syncing ? (
                <Crosshair className="h-3.5 w-3.5 text-brand-600 animate-spin" />
              ) : (
                <Route className="h-3.5 w-3.5 text-brand-600" />
              )}
              <span className="font-semibold">Trajet du jour</span>
              <span className="text-muted-foreground">
                {trajetInfo && trajetInfo.points > 0
                  ? `${trajetInfo.points} relevés · ${trajetInfo.km} km parcourus`
                  : 'Aucun relevé transmis aujourd&apos;hui'}
              </span>
              {syncing ? (
                <span className="ml-auto text-brand-700">Synchronisation...</span>
              ) : null}
            </div>
          ) : null}
          <TerrainMap
            agents={filtered}
            selectedId={selectedId}
            onSelect={selectAgent}
            trajet={trajet}
          />
        </div>
      </div>
    </div>
  );
}
