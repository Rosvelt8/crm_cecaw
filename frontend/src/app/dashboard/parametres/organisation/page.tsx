'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EnTete } from '@/components/ui/kpi';
import apiClient from '@/lib/axios';
import { agenceService } from '@/services/agenceService';
import { useCan } from '@/hooks/useCan';
import { donnees, msg } from '@/lib/apiHelpers';

const nombre = (v: string) => (v.trim() === '' ? null : Number(v));

export default function OrganisationPage() {
  const { can } = useCan();
  const creer = can('organisation:CREATE');
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [points, setPoints] = useState<any[]>([]);
  const [agences, setAgences] = useState<any[]>([]);
  const [inst, setInst] = useState({ nom: '', sigle: '', telephone: '', email: '' });
  const [pt, setPt] = useState({ nom: '', code: '', agenceId: '', latitude: '', longitude: '' });
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [i, p] = await Promise.all([apiClient.get('/organisation/institutions').then(donnees<any[]>), apiClient.get('/organisation/points-service').then(donnees<any[]>)]);
      setInstitutions(i); setPoints(p); setErreur(null);
    } catch (e) { setErreur(msg(e, 'Accès refusé')); }
  }, []);
  useEffect(() => { void charger(); agenceService.getAgences({ per_page: 100 }).then((r) => setAgences(r.data)).catch(() => {}); }, [charger]);

  if (erreur) return <p className="text-destructive">{erreur}</p>;
  return (
    <div className="space-y-4">
      <EnTete titre="Organisation" sousTitre="Institution, réseau d'agences et points de service (points de collecte)" />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="text-base">Institution</CardTitle></CardHeader><CardContent className="space-y-2">
          {institutions.map((i) => <div key={i.id} className="rounded-md border p-2 text-sm"><span className="font-medium">{i.nom}</span> {i.sigle && <Badge variant="outline">{i.sigle}</Badge>}<p className="text-xs text-muted-foreground">{i.telephone} {i.email}</p></div>)}
          {institutions.length === 0 && <p className="text-sm text-muted-foreground">Aucune institution renseignée.</p>}
          {creer && <div className="grid grid-cols-2 gap-2 pt-2 border-t"><Input placeholder="Nom" value={inst.nom} onChange={(e) => setInst({ ...inst, nom: e.target.value })} /><Input placeholder="Sigle" value={inst.sigle} onChange={(e) => setInst({ ...inst, sigle: e.target.value })} /><Input placeholder="Téléphone" value={inst.telephone} onChange={(e) => setInst({ ...inst, telephone: e.target.value })} /><Input placeholder="Email" value={inst.email} onChange={(e) => setInst({ ...inst, email: e.target.value })} />
            <Button className="col-span-2" size="sm" variant="brand" disabled={!inst.nom.trim()} onClick={async () => { try { await apiClient.post('/organisation/institutions', { nom: inst.nom, sigle: inst.sigle || null, telephone: inst.telephone || null, email: inst.email || null }); setInst({ nom: '', sigle: '', telephone: '', email: '' }); await charger(); } catch (e) { toast.error(msg(e)); } }}>Ajouter</Button></div>}
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-base">Points de service</CardTitle></CardHeader><CardContent className="space-y-2">
          {points.map((p) => <div key={p.id} className="flex items-center justify-between rounded-md border p-2 text-sm"><span><span className="font-medium">{p.nom}</span> <span className="text-xs text-muted-foreground">{p.agence.nom}{p.latitude ? '' : ' · sans position'}</span></span>{creer && <button className="text-destructive" onClick={async () => { if (window.confirm(`Supprimer « ${p.nom} » ?`)) { try { await apiClient.delete(`/organisation/points-service/${p.id}`); await charger(); } catch (e) { toast.error(msg(e)); } } }}><Trash2 className="h-4 w-4" /></button>}</div>)}
          {points.length === 0 && <p className="text-sm text-muted-foreground">Aucun point de service.</p>}
          {creer && <div className="grid grid-cols-2 gap-2 pt-2 border-t"><Input placeholder="Nom" value={pt.nom} onChange={(e) => setPt({ ...pt, nom: e.target.value })} /><Input placeholder="Code" value={pt.code} onChange={(e) => setPt({ ...pt, code: e.target.value })} />
            <select className="col-span-2 h-10 rounded-lg border bg-background px-3 text-sm" value={pt.agenceId} onChange={(e) => setPt({ ...pt, agenceId: e.target.value })}><option value="">Agence de rattachement…</option>{agences.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select>
            <Input type="number" step="any" placeholder="Latitude" value={pt.latitude} onChange={(e) => setPt({ ...pt, latitude: e.target.value })} /><Input type="number" step="any" placeholder="Longitude" value={pt.longitude} onChange={(e) => setPt({ ...pt, longitude: e.target.value })} />
            <Button className="col-span-2" size="sm" variant="brand" disabled={!pt.nom.trim() || !pt.agenceId} onClick={async () => { try { await apiClient.post('/organisation/points-service', { nom: pt.nom, code: pt.code || null, agenceId: Number(pt.agenceId), latitude: nombre(pt.latitude), longitude: nombre(pt.longitude) }); setPt({ nom: '', code: '', agenceId: '', latitude: '', longitude: '' }); await charger(); } catch (e) { toast.error(msg(e)); } }}>Ajouter</Button></div>}
        </CardContent></Card>
      </div>
    </div>
  );
}
