'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EnTete, fcfa } from '@/components/ui/kpi';
import { objectifService } from '@/services/objectifService';
import { objectifsApi } from '@/services/metierService';
import { agenceService } from '@/services/agenceService';
import { adminService } from '@/services/adminService';
import { equipeService } from '@/services/equipeService';
import { produitService } from '@/services/produitService';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { formatDate } from '@/lib/utils';

const CATEGORIES: Record<string, { l: string; auto: boolean }> = {
  credit: { l: 'Crédit décaissé', auto: true }, recouvrement: { l: 'Recouvrement', auto: true }, collecte: { l: 'Collecte', auto: true },
  nouveaux_clients: { l: 'Nouveaux clients', auto: true }, commercial: { l: 'Commercial (saisi)', auto: false }, produit: { l: 'Par produit (saisi)', auto: false },
};
const PORTEES: Record<string, string> = { institution: 'Institution', agence: 'Agence', zone: 'Zone', equipe: 'Équipe', agents: 'Agents' };
const STATUT: Record<string, 'info' | 'success' | 'warning' | 'destructive'> = { en_cours: 'info', atteint: 'success', depasse: 'success', echec: 'destructive' };
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const finDeMois = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); };

/** Avancement attendu (%) à ce jour, progression linéaire sur la période. */
const attendu = (debut: string, fin: string) => { const t = new Date(fin).getTime() + 86_400_000 - new Date(debut).getTime(); return t <= 0 ? 100 : Math.min(100, Math.max(0, Math.round(((Date.now() - new Date(debut).getTime()) / t) * 100))); };

export default function ObjectifsPilotagePage() {
  const { can } = useCan();
  const [items, setItems] = useState<any[]>([]);
  const [agences, setAgences] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [produits, setProduits] = useState<any[]>([]);
  const [f, setF] = useState({ titre: '', categorie: 'credit', unite: 'montant', cible: '', date_debut: aujourdhui(), date_fin: finDeMois(), portee: 'agence', agence_id: '', zone_id: '', equipe_id: '', produit_id: '' });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try { setItems(await objectifService.getAllObjectifs()); setErreur(null); } catch (e) { setErreur(msg(e, 'Chargement impossible')); } finally { setChargement(false); }
  }, []);
  useEffect(() => {
    void charger();
    agenceService.getAgences({ per_page: 100 }).then((r) => setAgences(r.data)).catch(() => {});
    adminService.zones().then(setZones).catch(() => {});
    equipeService.getEquipes({ per_page: 100 } as never).then((r: any) => setEquipes(r.data ?? [])).catch(() => {});
    produitService.getProduits({ per_page: 100 } as never).then((r: any) => setProduits(r.data ?? [])).catch(() => {});
  }, [charger]);

  const creer = async () => {
    setOccupe(true);
    try {
      await objectifService.create({
        titre: f.titre, categorie: f.categorie, unite: f.unite, cible: Number(f.cible), periodicite: 'mois', date_debut: f.date_debut, date_fin: f.date_fin, assignation_type: f.portee,
        ...(f.portee === 'agence' ? { agence_id: Number(f.agence_id) } : {}), ...(f.portee === 'zone' ? { zone_id: Number(f.zone_id) } : {}), ...(f.portee === 'equipe' ? { equipe_id: Number(f.equipe_id) } : {}),
        ...(f.categorie === 'produit' ? { produit_id: Number(f.produit_id) } : {}),
      });
      toast.success('Objectif créé'); setF({ ...f, titre: '', cible: '' }); await charger();
    } catch (e) { toast.error(msg(e, 'Création impossible')); } finally { setOccupe(false); }
  };

  const porteeLibelle = (o: any) => o.assignationType === 'agence' ? `Agence ${o.agence?.nom ?? ''}` : o.assignationType === 'equipe' ? `Équipe ${o.equipe?.nom ?? ''}` : o.assignationType === 'zone' ? `Zone #${o.zoneId}` : o.assignationType === 'institution' ? 'Toute l\'institution' : `${o.agents?.length ?? 0} agent(s)`;
  const pret = f.titre.trim() && Number(f.cible) > 0 && (f.portee !== 'agence' || f.agence_id) && (f.portee !== 'zone' || f.zone_id) && (f.portee !== 'equipe' || f.equipe_id) && f.portee !== 'agents' && (f.categorie !== 'produit' || f.produit_id);

  return (
    <div className="space-y-4">
      <EnTete titre="Objectifs de pilotage" sousTitre="Objectifs institutionnels, par agence, zone ou équipe, calculés automatiquement depuis l'activité réelle">
        {can('objectifs:UPDATE') && <Button variant="outline" onClick={async () => { try { const r = await objectifsApi.recalculer(); toast.success(`${r.recalcules} objectif(s) recalculé(s), ${r.alertes} alerte(s)`); await charger(); } catch (e) { toast.error(msg(e)); } }}><RefreshCw className="h-4 w-4 mr-1.5" />Recalculer</Button>}
      </EnTete>

      {can('objectifs:CREATE') && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nouvel objectif</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-4 gap-3">
              <div className="space-y-1.5 sm:col-span-2"><Label>Titre</Label><Input value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} placeholder="Ex. Décaissements agence Akwa, septembre" /></div>
              <div className="space-y-1.5"><Label>Catégorie</Label><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select></div>
              <div className="space-y-1.5"><Label>Unité</Label><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={f.unite} onChange={(e) => setF({ ...f, unite: e.target.value })}><option value="montant">Montant (FCFA)</option><option value="clients">Nombre</option></select></div>
              <div className="space-y-1.5"><Label>Cible</Label><Input type="number" min={0} value={f.cible} onChange={(e) => setF({ ...f, cible: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Du</Label><Input type="date" value={f.date_debut} onChange={(e) => setF({ ...f, date_debut: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Au</Label><Input type="date" value={f.date_fin} onChange={(e) => setF({ ...f, date_fin: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Portée</Label><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={f.portee} onChange={(e) => setF({ ...f, portee: e.target.value })}>{Object.entries(PORTEES).filter(([k]) => k !== 'agents').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              {f.portee === 'agence' && <div className="space-y-1.5"><Label>Agence</Label><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={f.agence_id} onChange={(e) => setF({ ...f, agence_id: e.target.value })}><option value="">Choisir…</option>{agences.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select></div>}
              {f.portee === 'zone' && <div className="space-y-1.5"><Label>Zone</Label><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={f.zone_id} onChange={(e) => setF({ ...f, zone_id: e.target.value })}><option value="">Choisir…</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}</select></div>}
              {f.portee === 'equipe' && <div className="space-y-1.5"><Label>Équipe</Label><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={f.equipe_id} onChange={(e) => setF({ ...f, equipe_id: e.target.value })}><option value="">Choisir…</option>{equipes.map((z) => <option key={z.id} value={z.id}>{z.nom}</option>)}</select></div>}
              {f.categorie === 'produit' && <div className="space-y-1.5"><Label>Produit</Label><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={f.produit_id} onChange={(e) => setF({ ...f, produit_id: e.target.value })}><option value="">Choisir…</option>{produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}</select></div>}
            </div>
            <p className="text-xs text-muted-foreground">{CATEGORIES[f.categorie].auto ? 'Le réalisé est calculé chaque nuit depuis les décaissements, remboursements, encaissements ou créations de clients de la portée choisie. Une alerte est envoyée si l\'avancement prend du retard.' : 'Le réalisé de cette catégorie se saisit à la main. Les objectifs par agents se gèrent dans Collecte › Objectifs.'}</p>
            <Button variant="brand" disabled={occupe || !pret} onClick={creer}>Créer l'objectif</Button>
          </CardContent>
        </Card>
      )}

      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : chargement ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div> : items.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Aucun objectif.</p> : (
        <div className="grid md:grid-cols-2 gap-3">
          {items.map((o) => {
            const cible = Number(o.cible); const realise = Number(o.realise);
            const pct = cible > 0 ? Math.round((realise / cible) * 100) : 0;
            const att = attendu(o.dateDebut, o.dateFin);
            const enRetard = o.statut === 'en_cours' && att - pct > 15;
            const fmt = (n: number) => (o.unite === 'montant' ? fcfa(n) : String(n));
            return (
              <Card key={o.id}><CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2"><p className="font-medium text-sm">{o.titre}</p><Badge variant={STATUT[o.statut]}>{o.statut.replace('_', ' ')}</Badge></div>
                <p className="text-xs text-muted-foreground">{CATEGORIES[o.categorie]?.l ?? o.categorie} · {porteeLibelle(o)} · {formatDate(o.dateDebut)} au {formatDate(o.dateFin)}</p>
                <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full ${pct >= 100 ? 'bg-success' : enRetard ? 'bg-warning' : 'bg-brand-600'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  {o.statut === 'en_cours' && <div className="absolute top-0 h-full w-0.5 bg-foreground/60" style={{ left: `${att}%` }} title={`Avancement attendu : ${att} %`} />}
                </div>
                <p className="text-xs">{fmt(realise)} sur {fmt(cible)} ({pct} %){o.statut === 'en_cours' && <span className={enRetard ? 'text-warning-700' : 'text-muted-foreground'}> · attendu {att} %</span>}</p>
                {can('objectifs:UPDATE') && <div className="flex justify-end"><button className="text-muted-foreground hover:text-destructive" title="Supprimer" onClick={async () => { if (window.confirm(`Supprimer « ${o.titre} » ?`)) { try { await objectifService.remove(o.id); await charger(); } catch (e) { toast.error(msg(e)); } } }}><Trash2 className="h-4 w-4" /></button></div>}
              </CardContent></Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
