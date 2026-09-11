'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, RefreshCw, Radio, WifiOff, Users, Clock, Crosshair, Route, Calendar, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentsLive } from '@/hooks/useAgentsLive';
import { agentService } from '@/services/agentService';
import {
  SEUIL_SILENCE_MIN,
  enHeuresDeService,
  niveauSilence,
  type NiveauSilence,
} from '@/lib/silenceAgent';
import { toast } from 'sonner';
import type { TrajetAgent } from '@/components/collecte/terrain-map-inner';

const TerrainMap = dynamic(() => import('@/components/collecte/terrain-map-inner'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-muted rounded-xl">
      <MapPin className="h-8 w-8 text-muted-foreground animate-bounce" />
      <span className="ml-2 font-medium text-muted-foreground">Chargement de la carte...</span>
    </div>
  ),
});

/** Couleurs de trace, distinctes entre elles et du fond de carte. */
const COULEURS = ['#b8860b', '#1d4ed8', '#059669', '#dc2626', '#7c3aed', '#0891b2', '#ea580c'];

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
  const [syncing, setSyncing] = useState(false);
  const [jour, setJour] = useState(() => new Date().toISOString().slice(0, 10));
  const [compares, setCompares] = useState<string[]>([]);
  const [trajets, setTrajets] = useState<TrajetAgent[]>([]);
  const [chargementTrajets, setChargementTrajets] = useState(false);

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

  /**
   * Itineraires de la journee choisie.
   *
   * Sans selection explicite, on affiche celui de l'agent courant ; des qu'une
   * comparaison est demandee, on superpose les traces des agents retenus.
   */
  useEffect(() => {
    const cibles = compares.length > 0 ? compares : selectedId ? [selectedId] : [];
    // Rien a tracer : l'etat est deja vide au depart, et le vidage se fait au
    // retour de la requete precedente.
    if (cibles.length === 0) return;
    let annule = false;
    setChargementTrajets(true);
    agentService
      .getTrajets(jour, cibles)
      .then((r) => {
        if (annule) return;
        setTrajets(
          r.trajets.map((t, i) => ({
            agent_id: t.agent_id,
            nom: t.nom,
            matricule: t.matricule,
            couleur: COULEURS[i % COULEURS.length],
            points: t.points,
          })),
        );
      })
      .catch(() => {
        if (!annule) setTrajets([]);
      })
      .finally(() => {
        if (!annule) setChargementTrajets(false);
      });
    return () => {
      annule = true;
    };
  }, [jour, compares, selectedId, lastEventAt]);

  /**
   * Agents dont le suivi s'est tu pendant les heures de service.
   * « silencieux » : a transmis aujourd'hui puis plus rien — le service a
   * probablement ete tue. « absent » : rien du tout depuis ce matin.
   */
  const alertes = useMemo(() => {
    if (!enHeuresDeService()) return { silencieux: [], absents: [] };
    const par = (n: NiveauSilence) =>
      agents.filter((a) => niveauSilence(a.minutesAgo, a.dernierePositionAt) === n);
    return { silencieux: par('silencieux'), absents: par('absent') };
  }, [agents]);

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

      {/* Alerte : distinguer un agent immobile d'un suivi interrompu. */}
      {alertes.silencieux.length > 0 || alertes.absents.length > 0 ? (
        <div className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="min-w-0 space-y-1.5">
              <p className="text-xs font-semibold text-amber-900">
                Suivi interrompu pour {alertes.silencieux.length + alertes.absents.length} agent
                {alertes.silencieux.length + alertes.absents.length > 1 ? 's' : ''}
              </p>

              {alertes.silencieux.length > 0 ? (
                <p className="text-[11px] text-amber-800">
                  <span className="font-semibold">Plus rien depuis {SEUIL_SILENCE_MIN} min :</span>{' '}
                  {alertes.silencieux.map((a) => a.nom || a.matricule).join(', ')}
                  {' — '}le téléphone a probablement mis l&apos;application en veille.
                </p>
              ) : null}

              {alertes.absents.length > 0 ? (
                <p className="text-[11px] text-amber-800">
                  <span className="font-semibold">Aucune position aujourd&apos;hui :</span>{' '}
                  {alertes.absents.map((a) => a.nom || a.matricule).join(', ')}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

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
                  <div
                    key={agent.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1 hover:bg-muted/50 transition-colors',
                      selectedId === agent.id && 'bg-brand-50',
                    )}
                  >
                    {/* Cocher plusieurs agents superpose leurs itineraires. */}
                    <input
                      type="checkbox"
                      checked={compares.includes(agent.id)}
                      onChange={(e) =>
                        setCompares((prev) =>
                          e.target.checked
                            ? [...prev, agent.id]
                            : prev.filter((x) => x !== agent.id),
                        )
                      }
                      className="h-3.5 w-3.5 accent-brand-600 shrink-0"
                      aria-label={`Comparer l'itinéraire de ${agent.nom}`}
                    />
                    <button
                    type="button"
                    className="flex-1 text-left py-2"
                    onClick={() => selectAgent(agent.id)}
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
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex-1 min-h-0 flex flex-col gap-2">
          {/* Barre des itineraires : date, agents compares, totaux. */}
          <div className="flex flex-wrap items-center gap-3 text-xs bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 shrink-0">
            {chargementTrajets || syncing ? (
              <Crosshair className="h-3.5 w-3.5 text-brand-600 animate-spin" />
            ) : (
              <Route className="h-3.5 w-3.5 text-brand-600" />
            )}
            <span className="font-semibold">Itinéraires</span>

            <label className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="date"
                value={jour}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setJour(e.target.value)}
                className="h-7 rounded border border-brand-200 bg-white px-2 text-xs"
              />
            </label>

            {trajets.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {trajets.map((t) => (
                  <span
                    key={t.agent_id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white border px-2 py-0.5"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: t.couleur }}
                    />
                    <span className="font-semibold">{t.nom || t.matricule}</span>
                    <span className="text-muted-foreground">{t.points.length} pts</span>
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">
                {compares.length > 0 || selectedId
                  ? 'Aucun relevé transmis ce jour-là.'
                  : 'Sélectionnez un agent, ou cochez-en plusieurs pour comparer.'}
              </span>
            )}

            {compares.length > 0 ? (
              <button
                type="button"
                onClick={() => setCompares([])}
                className="ml-auto text-brand-700 underline"
              >
                Effacer la comparaison
              </button>
            ) : null}
          </div>

          <TerrainMap
            agents={filtered}
            selectedId={selectedId}
            onSelect={selectAgent}
            trajets={trajets}
          />
        </div>
      </div>
    </div>
  );
}
