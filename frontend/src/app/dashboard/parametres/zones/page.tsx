'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { adminService, type ZoneRef } from '@/services/adminService';
import { agenceService } from '@/services/agenceService';
import { agentService } from '@/services/agentService';
import { useCan } from '@/hooks/useCan';

const message = (e: unknown, defaut: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? defaut;

interface AgenceOption { id: number; nom: string }
interface AgentOption { id: number; matricule: string; utilisateur?: { prenom: string; nom: string } }

const FORM_VIDE = { nom: '', code: '', type: 'zone' as 'zone' | 'secteur', parentId: '', agenceId: '', latitude: '', longitude: '', population: '', potentielEstime: '' };

export default function ZonesPage() {
  const { can } = useCan();
  const peutCreer = can('organisation:CREATE');
  const peutModifier = can('organisation:UPDATE');

  const [zones, setZones] = useState<ZoneRef[]>([]);
  const [agences, setAgences] = useState<AgenceOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [form, setForm] = useState(FORM_VIDE);
  const [affectation, setAffectation] = useState<{ zone: ZoneRef; ids: Set<number> } | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try { setZones(await adminService.zones()); setErreur(null); }
    catch (e) { setErreur(message(e, 'Accès refusé')); }
    finally { setChargement(false); }
  }, []);

  useEffect(() => {
    void charger();
    agenceService.getAgences({ per_page: 100 }).then((r) => setAgences(r.data)).catch(() => {});
    agentService.getAgents({ per_page: 100 } as never).then((r: { data: AgentOption[] }) => setAgents(r.data)).catch(() => {});
  }, [charger]);

  const nombre = (v: string) => (v.trim() === '' ? null : Number(v));

  const creer = async () => {
    setOccupe(true);
    try {
      await adminService.creerZone({
        nom: form.nom, code: form.code || null, type: form.type, parentId: nombre(form.parentId), agenceId: nombre(form.agenceId),
        latitude: nombre(form.latitude), longitude: nombre(form.longitude), population: nombre(form.population), potentielEstime: nombre(form.potentielEstime),
      });
      toast.success('Zone créée'); setForm(FORM_VIDE); await charger();
    } catch (e) { toast.error(message(e, 'Création impossible')); } finally { setOccupe(false); }
  };

  const supprimer = async (z: ZoneRef) => {
    if (!window.confirm(`Supprimer « ${z.nom} » ?`)) return;
    try { await adminService.supprimerZone(z.id); toast.success('Zone supprimée'); await charger(); }
    catch (e) { toast.error(message(e, 'Suppression impossible')); }
  };

  const enregistrerAffectation = async () => {
    if (!affectation) return;
    try {
      await adminService.affecterAgentsZone(affectation.zone.id, [...affectation.ids].map((agent_id) => ({ agent_id })));
      toast.success('Affectation enregistrée'); setAffectation(null); await charger();
    } catch (e) { toast.error(message(e, 'Affectation impossible')); }
  };

  if (chargement) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Chargement…</div>;
  if (erreur) return <p className="text-destructive">{erreur}</p>;

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Zones et secteurs</h1><p className="text-sm text-muted-foreground">Découpage territorial, rattachement aux agences et affectation des agents.</p></div>

      {peutCreer && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nouvelle zone</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-4 gap-3">
              <div className="space-y-1.5"><Label>Nom</Label><Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Nature</Label>
                <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'zone' | 'secteur' })}><option value="zone">Zone</option><option value="secteur">Secteur</option></select></div>
              <div className="space-y-1.5"><Label>Agence</Label>
                <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={form.agenceId} onChange={(e) => setForm({ ...form, agenceId: e.target.value })}><option value="">—</option>{agences.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select></div>
              <div className="space-y-1.5"><Label>Zone parente</Label>
                <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}><option value="">—</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}</select></div>
              <div className="space-y-1.5"><Label>Latitude (centre)</Label><Input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Longitude (centre)</Label><Input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Population estimée</Label><Input type="number" min={0} value={form.population} onChange={(e) => setForm({ ...form, population: e.target.value })} /></div>
            </div>
            <Button variant="brand" disabled={occupe || !form.nom.trim()} onClick={creer}><Plus className="h-4 w-4 mr-1.5" />Créer la zone</Button>
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">Zone</th><th className="px-3 py-2 text-left">Agence</th><th className="px-3 py-2 text-left">Agents</th><th className="px-3 py-2 text-right">Clients</th><th className="px-3 py-2 text-right">Prospects</th><th className="px-3 py-2" /></tr></thead>
          <tbody>
            {zones.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Aucune zone définie</td></tr>}
            {zones.map((z) => (
              <tr key={z.id} className="border-t">
                <td className="px-3 py-2"><span className="font-medium">{z.nom}</span> {z.code && <span className="text-xs text-muted-foreground">({z.code})</span>} <Badge variant="outline">{z.type}</Badge></td>
                <td className="px-3 py-2">{z.agence?.nom ?? '—'}</td>
                <td className="px-3 py-2">{z.agents.length === 0 ? '—' : z.agents.map((a) => a.agent.utilisateur ? `${a.agent.utilisateur.prenom} ${a.agent.utilisateur.nom}` : a.agent.matricule).join(', ')}</td>
                <td className="px-3 py-2 text-right tabular-nums">{z._count.clients}</td><td className="px-3 py-2 text-right tabular-nums">{z._count.prospects}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {peutModifier && <Button size="sm" variant="ghost" onClick={() => setAffectation({ zone: z, ids: new Set(z.agents.map((a) => a.agent.id)) })}>Agents</Button>}
                  {peutModifier && <Button size="sm" variant="ghost" onClick={() => supprimer(z)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>

      {affectation && (
        <Card>
          <CardHeader><CardTitle className="text-base">Agents de « {affectation.zone.nom} »</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto">
              {agents.map((a) => (
                <label key={a.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                  <input type="checkbox" checked={affectation.ids.has(a.id)} onChange={() => setAffectation((s) => { if (!s) return s; const ids = new Set(s.ids); if (ids.has(a.id)) ids.delete(a.id); else ids.add(a.id); return { ...s, ids }; })} />
                  {a.utilisateur ? `${a.utilisateur.prenom} ${a.utilisateur.nom}` : a.matricule}
                </label>
              ))}
            </div>
            <div className="flex gap-2"><Button variant="brand" onClick={enregistrerAffectation}>Enregistrer</Button><Button variant="ghost" onClick={() => setAffectation(null)}>Annuler</Button></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
