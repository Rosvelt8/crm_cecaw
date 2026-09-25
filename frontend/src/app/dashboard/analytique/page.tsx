'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EnTete, Kpi, Onglets, fcfa } from '@/components/ui/kpi';
import { analytiqueApi } from '@/services/metierService';
import { agenceService } from '@/services/agenceService';
import { msg } from '@/lib/apiHelpers';
import { CLASSES } from '@/lib/recouvrementLabels';

type Onglet = 'credit' | 'recouvrement' | 'agences' | 'produits' | 'zones';
const COULEURS = ['#b8860b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#64748b', '#ec4899'];
const court = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} k` : String(n));

export default function AnalytiquePage() {
  const [onglet, setOnglet] = useState<Onglet>('credit');
  const [agences, setAgences] = useState<any[]>([]);
  const [agenceId, setAgenceId] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [data, setData] = useState<any>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => { agenceService.getAgences({ per_page: 100 }).then((r) => setAgences(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    let annule = false;
    const p = { agence_id: agenceId || undefined, du: du || undefined, au: au || undefined };
    setChargement(true);
    analytiqueApi[onglet](p).then((r) => { if (!annule) { setData(r); setErreur(null); } }).catch((e) => { if (!annule) { setData(null); setErreur(msg(e, 'Chargement impossible')); } }).finally(() => { if (!annule) setChargement(false); });
    return () => { annule = true; };
  }, [onglet, agenceId, du, au]);

  return (
    <div className="space-y-4">
      <EnTete titre="Tableaux de bord" sousTitre="Crédit, recouvrement, performance des agences, produits et zones">
        <select className="h-10 rounded-lg border bg-background px-3 text-sm" value={agenceId} onChange={(e) => setAgenceId(e.target.value)}><option value="">Toutes les agences</option>{agences.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select>
        {['credit', 'agences', 'produits'].includes(onglet) && <><Input type="date" className="w-40" value={du} onChange={(e) => setDu(e.target.value)} /><Input type="date" className="w-40" value={au} onChange={(e) => setAu(e.target.value)} /></>}
      </EnTete>
      <Onglets valeur={onglet} onChange={(o) => { setData(null); setOnglet(o); }} options={[{ id: 'credit', label: 'Crédit' }, { id: 'recouvrement', label: 'Recouvrement' }, { id: 'agences', label: 'Agences' }, { id: 'produits', label: 'Produits' }, { id: 'zones', label: 'Zones' }]} />
      {erreur ? <p className="text-sm text-destructive">{erreur}</p> : chargement || !data ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
        <>
          {onglet === 'credit' && <Credit d={data} />}
          {onglet === 'recouvrement' && <Recouvrement d={data} />}
          {onglet === 'agences' && <Tableau lignes={data} colonnes={[['nom', 'Agence'], ['clients_actifs', 'Clients'], ['epargne', 'Épargne', 'f'], ['encours_credit', 'Encours crédit', 'f'], ['par30_pct', 'PAR 30 j', 'p'], ['nb_decaisses', 'Crédits'], ['montant_decaisse', 'Décaissé', 'f'], ['collecte_periode', 'Collecte', 'f'], ['objectifs_atteints_pct', 'Objectifs atteints', 'p']]} />}
          {onglet === 'produits' && <Tableau lignes={data} colonnes={[['nom', 'Produit'], ['groupe', 'Groupe'], ['nb_comptes', 'Comptes'], ['epargne', 'Épargne', 'f'], ['nb_credits', 'Crédits'], ['montant_credits', 'Montant crédits', 'f']]} />}
          {onglet === 'zones' && <Tableau lignes={data} colonnes={[['nom', 'Zone'], ['agence', 'Agence'], ['nb_clients', 'Clients'], ['penetration_pct', 'Pénétration', 'p'], ['densite_km2', 'Densité /km²'], ['nb_comptes', 'Comptes'], ['epargne', 'Épargne', 'f'], ['encours_credit', 'Encours', 'f'], ['statut', 'Statut']]} />}
        </>
      )}
    </div>
  );
}

function Credit({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Encours" valeur={fcfa(d.encours)} />
        <Kpi label="Décaissé sur la période" valeur={fcfa(d.total_decaisse)} precision={`${d.nb_decaisses} crédit(s)`} />
        <Kpi label="Taux de remboursement" valeur={`${d.taux_remboursement_pct} %`} precision="payé / échu" ton={d.taux_remboursement_pct >= 95 ? 'bon' : d.taux_remboursement_pct >= 85 ? 'alerte' : 'mauvais'} />
        <Kpi label="Taux de retard" valeur={`${d.taux_retard_pct} %`} precision="échéances échues impayées" ton={d.taux_retard_pct <= 5 ? 'bon' : d.taux_retard_pct <= 10 ? 'alerte' : 'mauvais'} />
        <Kpi label="Portefeuille à risque" valeur={`${d.portefeuille_a_risque.par30} %`} precision={`> 1 j : ${d.portefeuille_a_risque.par1} % · > 90 j : ${d.portefeuille_a_risque.par90} %`} ton={d.portefeuille_a_risque.par30 <= 5 ? 'bon' : 'mauvais'} />
        <Kpi label="Taux d'approbation" valeur={`${d.taux_approbation_pct} %`} />
        <Kpi label="Délai moyen d'instruction" valeur={d.delai_moyen_instruction_jours != null ? `${d.delai_moyen_instruction_jours} j` : '—'} precision="soumission à décision" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="text-base">Décaissements par mois</CardTitle></CardHeader><CardContent style={{ height: 280 }}>
          {d.decaissements_par_mois.length === 0 ? <p className="text-sm text-muted-foreground">Aucun décaissement sur la période.</p> : (
            <ResponsiveContainer><BarChart data={d.decaissements_par_mois}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mois" fontSize={11} /><YAxis fontSize={11} tickFormatter={court} /><Tooltip formatter={(v) => fcfa(Number(v))} /><Bar dataKey="montant" fill="#b8860b" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>)}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Pipeline des demandes</CardTitle></CardHeader><CardContent style={{ height: 280 }}>
          {d.pipeline.length === 0 ? <p className="text-sm text-muted-foreground">Aucune demande sur la période.</p> : (
            <ResponsiveContainer><PieChart><Pie data={d.pipeline} dataKey="nb" nameKey="statut" outerRadius={95} label={(p: any) => `${p.statut.replace('_', ' ')} (${p.nb})`} labelLine={false} fontSize={10}>{d.pipeline.map((_: any, i: number) => <Cell key={i} fill={COULEURS[i % COULEURS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>)}
        </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle className="text-base">Décaissements par produit</CardTitle></CardHeader><CardContent className="space-y-1">
        {d.decaissements_par_produit.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
        {d.decaissements_par_produit.map((p: any) => <div key={p.produit} className="flex justify-between text-sm"><span>{p.produit} <span className="text-muted-foreground">({p.nb})</span></span><span className="tabular-nums">{fcfa(p.montant)}</span></div>)}
      </CardContent></Card>
    </div>
  );
}

function Recouvrement({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Dossiers actifs" valeur={d.dossiers_actifs} /><Kpi label="Impayé" valeur={fcfa(d.montant_impaye)} ton={d.montant_impaye ? 'mauvais' : 'bon'} />
        <Kpi label="Capital en risque" valeur={fcfa(d.capital_en_risque)} precision={`encours total ${fcfa(d.encours_total)}`} /><Kpi label="Taux de recouvrement" valeur={`${d.taux_recouvrement} %`} precision={`${fcfa(d.montant_recouvre)} recouvrés`} />
        <Kpi label="PAR > 1 j" valeur={`${d.par1} %`} /><Kpi label="PAR > 30 j" valeur={`${d.par30} %`} ton={d.par30 <= 5 ? 'bon' : 'mauvais'} /><Kpi label="PAR > 90 j" valeur={`${d.par90} %`} ton={d.par90 <= 2 ? 'bon' : 'mauvais'} /><Kpi label="Taux de retard" valeur={`${d.taux_retard} %`} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="text-base">Impayé par tranche de retard</CardTitle></CardHeader><CardContent style={{ height: 260 }}>
          <ResponsiveContainer><BarChart data={d.par_classe.map((c: any) => ({ ...c, tranche: CLASSES[c.classe] }))}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="tranche" fontSize={11} /><YAxis fontSize={11} tickFormatter={court} /><Tooltip formatter={(v) => fcfa(Number(v))} /><Bar dataKey="montant" fill="#ef4444" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Dossiers par statut</CardTitle></CardHeader><CardContent className="space-y-1.5">
          {d.par_statut.length === 0 && <p className="text-sm text-muted-foreground">—</p>}{d.par_statut.map((s: any) => <div key={s.statut} className="flex items-center justify-between text-sm"><Badge variant="outline">{s.statut.replace('_', ' ')}</Badge><span>{s.nb} · {fcfa(s.montant)}</span></div>)}
        </CardContent></Card>
      </div>
    </div>
  );
}

function Tableau({ lignes, colonnes }: { lignes: any[]; colonnes: [string, string, string?][] }) {
  const fmt = (v: any, t?: string) => (v == null ? '—' : t === 'f' ? fcfa(v) : t === 'p' ? `${v} %` : String(v));
  return (
    <Card><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted text-xs uppercase text-muted-foreground"><tr>{colonnes.map(([k, l], i) => <th key={k} className={`px-3 py-2 ${i === 0 ? 'text-left' : 'text-right'}`}>{l}</th>)}</tr></thead>
      <tbody>{lignes.length === 0 && <tr><td colSpan={colonnes.length} className="px-3 py-8 text-center text-muted-foreground">Aucune donnée</td></tr>}
        {lignes.map((l, i) => <tr key={i} className="border-t">{colonnes.map(([k, , t], j) => <td key={k} className={`px-3 py-1.5 ${j === 0 ? 'font-medium' : 'text-right tabular-nums'}`}>{fmt(l[k], t)}</td>)}</tr>)}</tbody></table></CardContent></Card>
  );
}
