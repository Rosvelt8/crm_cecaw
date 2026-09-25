'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { EnTete } from '@/components/ui/kpi';
import Carte, { type CartePoint, type CartePolygone } from '@/components/map/Carte';
import { sigApi } from '@/services/metierService';
import { agenceService } from '@/services/agenceService';
import { msg } from '@/lib/apiHelpers';

interface DefCouche { id: string; label: string; couleur: string; defaut: boolean }
const COUCHES: DefCouche[] = [
  { id: 'agences', label: 'Agences', couleur: '#111827', defaut: true },
  { id: 'points_collecte', label: 'Points de collecte', couleur: '#0ea5e9', defaut: false },
  { id: 'clients', label: 'Clients', couleur: '#10b981', defaut: true },
  { id: 'domiciles', label: 'Domiciles clients', couleur: '#22c55e', defaut: false },
  { id: 'activites', label: 'Activités professionnelles', couleur: '#8b5cf6', defaut: false },
  { id: 'prospects', label: 'Prospects', couleur: '#f59e0b', defaut: false },
  { id: 'credits', label: 'Crédits en cours', couleur: '#3b82f6', defaut: false },
  { id: 'impayes', label: 'Impayés', couleur: '#ef4444', defaut: false },
  { id: 'agents', label: 'Agents en activité', couleur: '#ec4899', defaut: true },
  { id: 'zones', label: 'Zones', couleur: '#6366f1', defaut: true },
];

export default function SigPage() {
  const [actives, setActives] = useState<string[]>(COUCHES.filter((c) => c.defaut).map((c) => c.id));
  const [agences, setAgences] = useState<any[]>([]);
  const [agenceId, setAgenceId] = useState('');
  const [donnees, setDonnees] = useState<Record<string, any>>({});
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => { agenceService.getAgences({ per_page: 100 }).then((r) => setAgences(r.data)).catch(() => {}); }, []);

  const charger = useCallback(async () => {
    if (actives.length === 0) { setDonnees({}); return; }
    setChargement(true);
    try { setDonnees(await sigApi.couches(actives, agenceId ? Number(agenceId) : undefined)); setErreur(null); }
    catch (e) { setErreur(msg(e, 'Chargement impossible')); }
    finally { setChargement(false); }
  }, [actives, agenceId]);
  useEffect(() => { const t = setTimeout(charger, 200); return () => clearTimeout(t); }, [charger]);

  const { points, polygones, tronque } = useMemo(() => {
    const pts: CartePoint[] = [];
    const pgs: CartePolygone[] = [];
    let tr = false;
    for (const def of COUCHES) {
      const fc = donnees[def.id];
      if (!fc) continue;
      if (fc.tronque) tr = true;
      for (const f of fc.features) {
        if (def.id === 'zones') {
          const g = f.geometry;
          const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
          for (const poly of polys) pgs.push({ anneau: poly[0].map(([lng, lat]: number[]) => [lat, lng]), couleur: def.couleur, titre: f.properties.nom });
          continue;
        }
        const [lng, lat] = f.geometry.coordinates;
        const p = f.properties;
        const enActivite = def.id === 'agents' ? p.en_activite : true;
        pts.push({
          lat, lng, couleur: enActivite ? def.couleur : '#94a3b8', rayon: def.id === 'agences' ? 10 : def.id === 'agents' ? 8 : 5,
          titre: p.nom ?? p.reference ?? def.label, detail: [def.label, p.telephone, p.quartier, p.montant ? `${Math.round(p.montant)} FCFA` : null, p.jours ? `${p.jours} j de retard` : null, p.activite].filter(Boolean).join(' · '),
        });
      }
    }
    return { points: pts, polygones: pgs, tronque: tr };
  }, [donnees]);

  return (
    <div className="space-y-4">
      <EnTete titre="Cartographie" sousTitre="Agences, clientèle, crédits, impayés, points de collecte et agents sur OpenStreetMap" />
      <Card><CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {COUCHES.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={actives.includes(c.id)} onChange={() => setActives((a) => (a.includes(c.id) ? a.filter((x) => x !== c.id) : [...a, c.id]))} />
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: c.couleur }} />{c.label}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <select className="h-9 rounded-lg border bg-background px-3 text-sm" value={agenceId} onChange={(e) => setAgenceId(e.target.value)}><option value="">Toutes les agences</option>{agences.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select>
          {chargement && <Loader2 className="h-4 w-4 animate-spin" />}
          <span className="text-xs text-muted-foreground">{points.length} point(s), {polygones.length} zone(s){tronque ? ' · affichage limité à 2 000 éléments par couche' : ''}</span>
        </div>
        {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      </CardContent></Card>
      <Card><CardContent className="p-2"><Carte points={points} polygones={polygones} hauteur={600} /></CardContent></Card>
      <p className="text-xs text-muted-foreground">Les agences et points de collecte n'apparaissent que si leurs coordonnées sont renseignées (Paramètres › Agences et Zones).</p>
    </div>
  );
}
