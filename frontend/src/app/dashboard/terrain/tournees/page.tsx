'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Route as RouteIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EnTete } from '@/components/ui/kpi';
import { tourneesApi } from '@/services/metierService';
import { agentService } from '@/services/agentService';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { formatDate } from '@/lib/utils';

const TYPES: Record<string, string> = { commerciale: 'Commerciale', collecte: 'Collecte', recouvrement: 'Recouvrement' };
const STATUT: Record<string, { l: string; v: 'outline' | 'info' | 'success' | 'secondary' }> = { planifiee: { l: 'Planifiée', v: 'outline' }, en_cours: { l: 'En cours', v: 'info' }, terminee: { l: 'Terminée', v: 'success' }, annulee: { l: 'Annulée', v: 'secondary' } };
const aujourdhui = () => new Date().toISOString().slice(0, 10);

export default function TourneesPage() {
  const { can } = useCan();
  const [items, setItems] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [date, setDate] = useState(aujourdhui());
  const [type, setType] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [gen, setGen] = useState({ type: 'collecte', agent_id: '', date: aujourdhui(), max: 15 });
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try { setItems(await tourneesApi.lister({ date: date || undefined, type: type || undefined })); setErreur(null); }
    catch (e) { setErreur(msg(e, 'Chargement impossible')); }
    finally { setChargement(false); }
  }, [date, type]);
  useEffect(() => { void charger(); }, [charger]);
  useEffect(() => { agentService.getAgents({ per_page: 100 } as never).then((r: any) => setAgents(r.data ?? [])).catch(() => setAgents([])); }, []);

  const generer = async () => {
    setOccupe(true);
    try {
      const t = await tourneesApi.generer({ type: gen.type, agent_id: Number(gen.agent_id), date: gen.date, max_visites: gen.max });
      toast.success(`Tournée ${t.reference} générée : ${t.visites.length} visite(s), ${t.distancePrevueKm} km`);
      setDate(gen.date); await charger();
    } catch (e) { toast.error(msg(e, 'Génération impossible')); } finally { setOccupe(false); }
  };

  return (
    <div className="space-y-4">
      <EnTete titre="Tournées" sousTitre="Planification, optimisation des circuits, exécution et écarts prévu / réalisé" />

      {can('tournees:CREATE') && (
        <Card>
          <CardHeader><CardTitle className="text-base">Générer une tournée</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-4 gap-3">
              <div className="space-y-1.5"><Label>Type</Label>
                <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={gen.type} onChange={(e) => setGen({ ...gen, type: e.target.value })}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="space-y-1.5"><Label>Agent</Label>
                <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={gen.agent_id} onChange={(e) => setGen({ ...gen, agent_id: e.target.value })}>
                  <option value="">Choisir…</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.utilisateur ? `${a.utilisateur.prenom} ${a.utilisateur.nom}` : a.nom ?? a.matricule} ({a.matricule})</option>)}</select></div>
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" min={aujourdhui()} value={gen.date} onChange={(e) => setGen({ ...gen, date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Visites maximum</Label><Input type="number" min={1} max={40} value={gen.max} onChange={(e) => setGen({ ...gen, max: Number(e.target.value) })} /></div>
            </div>
            <p className="text-xs text-muted-foreground">
              Les cibles viennent du portefeuille : prospects à relancer (commerciale), clients à collecter (collecte) ou dossiers assignés (recouvrement).
              Elles sont classées par priorité puis ordonnées pour raccourcir le trajet.
            </p>
            <Button variant="brand" disabled={occupe || !gen.agent_id} onClick={generer}>{occupe ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RouteIcon className="h-4 w-4 mr-1.5" />}Générer et optimiser</Button>
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="p-4 flex flex-wrap gap-3">
        <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className="h-10 rounded-lg border bg-background px-3 text-sm" value={type} onChange={(e) => setType(e.target.value)}><option value="">Tous les types</option>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <Button variant="ghost" onClick={() => setDate('')}>Toutes les dates</Button>
      </CardContent></Card>

      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : chargement ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div> : items.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Aucune tournée.</p> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((t) => (
            <Link key={t.id} href={`/dashboard/terrain/tournees/${t.id}`}>
              <Card className="hover:border-brand-400 transition-colors h-full"><CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between"><span className="font-semibold">{t.reference}</span><Badge variant={STATUT[t.statut].v}>{STATUT[t.statut].l}</Badge></div>
                <p className="text-sm">{t.agent.utilisateur.prenom} {t.agent.utilisateur.nom} · {TYPES[t.type]}</p>
                <p className="text-xs text-muted-foreground">{formatDate(t.date)} · {t._count.visites} visite(s) · {Number(t.distancePrevueKm)} km prévus · ~{t.dureePrevueMin} min</p>
                {t.distanceRealiseeKm != null && <p className="text-xs">Réalisé : {Number(t.distanceRealiseeKm)} km</p>}
              </CardContent></Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
