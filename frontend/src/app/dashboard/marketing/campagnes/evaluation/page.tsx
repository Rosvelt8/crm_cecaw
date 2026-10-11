'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowLeft, ArrowUp, Download, Loader2, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, Legend, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EnTete, Kpi, fcfa } from '@/components/ui/kpi';
import { campagnesApi } from '@/services/metierService';
import { agenceService } from '@/services/agenceService';
import { msg } from '@/lib/apiHelpers';
import { STATUT_CAMPAGNE, TYPE_CAMPAGNE } from '@/lib/campagneLabels';
import { cn } from '@/lib/utils';

/**
 * Tableau d'évaluation des campagnes : indicateurs calculés automatiquement côté serveur, et un
 * score composite entièrement réglable ici (critères retenus, poids, sens « plus = mieux » ou
 * « moins = mieux »). Les réglages restent mémorisés dans le navigateur de l'utilisateur.
 */

type Format = 'nombre' | 'pct' | 'fcfa' | 'ratio';
interface Critere { cle: string; label: string; format: Format; sens: 'haut' | 'bas'; groupe: string }

const CRITERES: Critere[] = [
  { cle: 'cibles', label: 'Personnes ciblées', format: 'nombre', sens: 'haut', groupe: 'Portée' },
  { cle: 'taux_atteinte', label: "Taux d'atteinte", format: 'pct', sens: 'haut', groupe: 'Portée' },
  { cle: 'prospects_crees', label: 'Prospects générés', format: 'nombre', sens: 'haut', groupe: 'Acquisition' },
  { cle: 'taux_conversion', label: 'Taux de conversion', format: 'pct', sens: 'haut', groupe: 'Acquisition' },
  { cle: 'nouveaux_clients', label: 'Nouveaux clients', format: 'nombre', sens: 'haut', groupe: 'Acquisition' },
  { cle: 'demandes', label: 'Demandes de crédit', format: 'nombre', sens: 'haut', groupe: 'Business' },
  { cle: 'taux_accord', label: "Taux d'accord", format: 'pct', sens: 'haut', groupe: 'Business' },
  { cle: 'montant_decaisse', label: 'Montant décaissé', format: 'fcfa', sens: 'haut', groupe: 'Business' },
  { cle: 'rendement', label: 'Rendement (décaissé / coût)', format: 'ratio', sens: 'haut', groupe: 'Efficience' },
  { cle: 'cout_par_prospect', label: 'Coût par prospect', format: 'fcfa', sens: 'bas', groupe: 'Efficience' },
  { cle: 'cout_par_client', label: 'Coût par nouveau client', format: 'fcfa', sens: 'bas', groupe: 'Efficience' },
  { cle: 'consommation_budget', label: 'Consommation du budget', format: 'pct', sens: 'bas', groupe: 'Efficience' },
  { cle: 'avancement_objectifs', label: 'Avancement des objectifs', format: 'pct', sens: 'haut', groupe: 'Objectifs' },
  { cle: 'objectifs_atteints', label: 'Objectifs atteints', format: 'nombre', sens: 'haut', groupe: 'Objectifs' },
];
const PAR_CLE = Object.fromEntries(CRITERES.map((c) => [c.cle, c]));
const POIDS_DEFAUT: Record<string, number> = { taux_atteinte: 1, taux_conversion: 2, nouveaux_clients: 2, montant_decaisse: 2, rendement: 3, avancement_objectifs: 3 };
const COLONNES_DEFAUT = ['cibles', 'taux_atteinte', 'prospects_crees', 'taux_conversion', 'nouveaux_clients', 'montant_decaisse', 'rendement', 'avancement_objectifs'];
const COULEURS = ['#b8860b', '#0d9488', '#2563eb', '#db2777', '#7c3aed'];
const STOCKAGE = 'cecaw.evaluation-campagnes.v1';

const formater = (v: any, f: Format) => {
  if (v == null) return '—';
  if (f === 'pct') return `${v} %`;
  if (f === 'fcfa') return fcfa(v);
  if (f === 'ratio') return `× ${v}`;
  return new Intl.NumberFormat('fr-FR').format(v);
};
const lire = () => { try { return typeof window === 'undefined' ? null : JSON.parse(localStorage.getItem(STOCKAGE) ?? 'null'); } catch { return null; } };
const ecrire = (v: unknown) => { try { localStorage.setItem(STOCKAGE, JSON.stringify(v)); } catch { /* stockage indisponible : réglages non mémorisés */ } };
const debutAnnee = () => `${new Date().getFullYear()}-01-01`;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

function Tri({ tri, cle }: { tri: { cle: string; desc: boolean }; cle: string }) {
  if (tri.cle !== cle) return null;
  return tri.desc ? <ArrowDown className="inline h-3 w-3" /> : <ArrowUp className="inline h-3 w-3" />;
}

export default function EvaluationCampagnesPage() {
  const [filtres, setFiltres] = useState({ debut: debutAnnee(), fin: aujourdhui(), statut: '', type: '', agence_id: '' });
  // Réglages mémorisés dans le navigateur (repli sur les valeurs par défaut si indisponibles).
  const [poids, setPoids] = useState<Record<string, number>>(() => lire()?.poids ?? POIDS_DEFAUT);
  const [colonnes, setColonnes] = useState<string[]>(() => lire()?.colonnes ?? COLONNES_DEFAUT);
  const [metrique, setMetrique] = useState<string>(() => lire()?.metrique ?? 'montant_decaisse');
  const [tri, setTri] = useState<{ cle: string; desc: boolean }>({ cle: 'score', desc: true });
  const [comparees, setComparees] = useState<number[]>([]);
  const [reglages, setReglages] = useState(false);
  const [donnees, setDonnees] = useState<{ campagnes: any[]; totaux: any } | null>(null);
  const [agences, setAgences] = useState<{ id: number; nom: string }[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => { agenceService.getAgences({ per_page: 100 }).then((x) => setAgences(x.data)).catch(() => {}); }, []);
  useEffect(() => { ecrire({ poids, colonnes, metrique }); }, [poids, colonnes, metrique]);

  const majFiltres = (p: Partial<typeof filtres>) => { setChargement(true); setFiltres((x) => ({ ...x, ...p })); };
  useEffect(() => {
    const t = setTimeout(() => {
      campagnesApi.evaluation({ debut: filtres.debut || undefined, fin: filtres.fin || undefined, statut: filtres.statut || undefined, type: filtres.type || undefined, agence_id: filtres.agence_id || undefined })
        .then((r) => { setDonnees(r); setComparees((c) => (c.length ? c.filter((id) => r.campagnes.some((x: any) => x.id === id)) : r.campagnes.slice(0, 3).map((x: any) => x.id))); })
        .catch((e) => toast.error(msg(e, 'Évaluation indisponible')))
        .finally(() => setChargement(false));
    }, 250);
    return () => clearTimeout(t);
  }, [filtres]);

  /** Normalisation min-max de chaque critère (0-100), inversée pour les critères « moins = mieux ». */
  const normalise = useMemo(() => {
    const lignes = donnees?.campagnes ?? [];
    const res: Record<number, Record<string, number | null>> = {};
    for (const c of CRITERES) {
      const vals = lignes.map((l) => l[c.cle]).filter((v) => v != null) as number[];
      const min = Math.min(...vals); const max = Math.max(...vals);
      for (const l of lignes) {
        res[l.id] ??= {};
        const v = l[c.cle];
        if (v == null || vals.length === 0) { res[l.id][c.cle] = null; continue; }
        const n = max === min ? 100 : ((v - min) / (max - min)) * 100;
        res[l.id][c.cle] = Math.round(c.sens === 'haut' ? n : 100 - n);
      }
    }
    return res;
  }, [donnees]);

  const actifs = CRITERES.filter((c) => (poids[c.cle] ?? 0) > 0);
  const lignes = useMemo(() => {
    const avecScore = (donnees?.campagnes ?? []).map((l) => {
      // Un critère sans valeur (ex. pas de coût saisi) n'est ni pénalisé ni compté : on repondère.
      let somme = 0, total = 0;
      for (const c of actifs) { const n = normalise[l.id]?.[c.cle]; if (n == null) continue; somme += n * poids[c.cle]; total += poids[c.cle]; }
      return { ...l, score: total > 0 ? Math.round(somme / total) : null };
    });
    return avecScore.sort((a, b) => {
      const va = a[tri.cle] ?? -Infinity; const vb = b[tri.cle] ?? -Infinity;
      const r = typeof va === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return tri.desc ? -r : r;
    });
  }, [donnees, normalise, poids, tri, actifs]);

  const radar = actifs.map((c) => ({ critere: c.label, ...Object.fromEntries(comparees.map((id) => [id, normalise[id]?.[c.cle] ?? 0])) }));
  const graphe = [...lignes].filter((l) => l[metrique] != null).sort((a, b) => b[metrique] - a[metrique]).slice(0, 12).map((l) => ({ nom: l.nom.length > 22 ? `${l.nom.slice(0, 21)}…` : l.nom, valeur: l[metrique] }));
  const t = donnees?.totaux;

  const exporter = () => {
    const entetes = ['Campagne', 'Type', 'Statut', 'Score', ...CRITERES.map((c) => c.label)];
    const csv = [entetes, ...lignes.map((l) => [l.nom, TYPE_CAMPAGNE[l.type] ?? l.type, l.statut, l.score ?? '', ...CRITERES.map((c) => l[c.cle] ?? '')])]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `evaluation-campagnes-${aujourdhui()}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const trier = (cle: string) => setTri((x) => ({ cle, desc: x.cle === cle ? !x.desc : true }));
  const champ = 'h-9 rounded-md border bg-background px-2 text-sm';

  return (
    <div className="space-y-4">
      <Link href="/dashboard/marketing/campagnes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Campagnes</Link>
      <EnTete titre="Évaluation des campagnes" sousTitre="Indicateurs calculés automatiquement ; score composite réglable selon vos critères">
        <Button variant={reglages ? 'brand' : 'outline'} onClick={() => setReglages(!reglages)}><SlidersHorizontal className="h-4 w-4 mr-1.5" />Critères et poids</Button>
        <Button variant="outline" onClick={exporter} disabled={!lignes.length}><Download className="h-4 w-4 mr-1.5" />Exporter</Button>
      </EnTete>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Campagnes actives entre</span>
        <Input type="date" className="h-9 w-40" value={filtres.debut} onChange={(e) => majFiltres({ debut: e.target.value })} />
        <span className="text-xs text-muted-foreground">et</span>
        <Input type="date" className="h-9 w-40" value={filtres.fin} onChange={(e) => majFiltres({ fin: e.target.value })} />
        <select className={champ} value={filtres.statut} onChange={(e) => majFiltres({ statut: e.target.value })}><option value="">Tous statuts (hors annulées)</option>{Object.entries(STATUT_CAMPAGNE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select className={champ} value={filtres.type} onChange={(e) => majFiltres({ type: e.target.value })}><option value="">Tous types</option>{Object.entries(TYPE_CAMPAGNE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className={champ} value={filtres.agence_id} onChange={(e) => majFiltres({ agence_id: e.target.value })}><option value="">Toutes agences</option>{agences.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select>
        {chargement && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {reglages && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Critères du score</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => { setPoids(POIDS_DEFAUT); setColonnes(COLONNES_DEFAUT); }}><RotateCcw className="h-3.5 w-3.5 mr-1" />Réinitialiser</Button>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            {CRITERES.map((c) => (
              <div key={c.cle} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={colonnes.includes(c.cle)} onChange={() => setColonnes((x) => (x.includes(c.cle) ? x.filter((k) => k !== c.cle) : [...x, c.cle]))} title="Afficher la colonne" />{c.label}</label>
                  <span className={cn('text-xs tabular-nums', (poids[c.cle] ?? 0) === 0 ? 'text-muted-foreground' : 'font-semibold text-brand-700')}>{(poids[c.cle] ?? 0) === 0 ? 'ignoré' : `poids ${poids[c.cle]}`}</span>
                </div>
                <input type="range" min={0} max={5} step={1} className="w-full accent-[#b8860b]" value={poids[c.cle] ?? 0} onChange={(e) => setPoids({ ...poids, [c.cle]: Number(e.target.value) })} />
                <p className="text-[11px] text-muted-foreground">{c.groupe} · {c.sens === 'haut' ? 'plus élevé = mieux' : 'plus bas = mieux'}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {t && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <Kpi label="Campagnes" valeur={t.campagnes} precision={`${t.en_cours} en cours`} />
          <Kpi label="Personnes ciblées" valeur={formater(t.cibles, 'nombre')} precision={`atteinte ${formater(t.taux_atteinte, 'pct')}`} />
          <Kpi label="Prospects générés" valeur={formater(t.prospects_crees, 'nombre')} precision={`conversion ${formater(t.taux_conversion, 'pct')}`} />
          <Kpi label="Nouveaux clients" valeur={formater(t.nouveaux_clients, 'nombre')} />
          <Kpi label="Montant décaissé" valeur={fcfa(t.montant_decaisse)} precision={`${t.accordees} crédit(s) accordé(s)`} />
          <Kpi label="Rendement global" valeur={formater(t.rendement, 'ratio')} precision={`coût ${fcfa(t.cout_reel)} / budget ${fcfa(t.budget)}`} />
        </div>
      )}

      {!chargement && lignes.length === 0 ? <p className="text-sm text-muted-foreground text-center py-10">Aucune campagne sur cette période.</p> : (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
                <CardTitle className="text-base">Comparaison par indicateur</CardTitle>
                <select className={champ} value={metrique} onChange={(e) => setMetrique(e.target.value)}>{CRITERES.map((c) => <option key={c.cle} value={c.cle}>{c.label}</option>)}</select>
              </CardHeader>
              <CardContent>
                {graphe.length === 0 ? <p className="text-sm text-muted-foreground py-16 text-center">Aucune valeur pour cet indicateur.</p> : (
                  <ResponsiveContainer width="100%" height={Math.max(220, graphe.length * 30)}>
                    <BarChart data={graphe} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e5e4" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v)} />
                      <YAxis type="category" dataKey="nom" width={150} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => formater(v, PAR_CLE[metrique].format)} />
                      <Bar dataKey="valeur" name={PAR_CLE[metrique].label} fill="#b8860b" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Profil multicritère <span className="text-xs font-normal text-muted-foreground">(cochez jusqu’à 5 campagnes dans le tableau)</span></CardTitle></CardHeader>
              <CardContent>
                {comparees.length === 0 || actifs.length < 3 ? <p className="text-sm text-muted-foreground py-16 text-center">{actifs.length < 3 ? 'Activez au moins 3 critères pour le profil.' : 'Sélectionnez des campagnes à comparer.'}</p> : (
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radar} outerRadius="70%">
                      <PolarGrid stroke="#e7e5e4" />
                      <PolarAngleAxis dataKey="critere" tick={{ fontSize: 10 }} />
                      {comparees.map((id, i) => <Radar key={id} dataKey={String(id)} name={lignes.find((l) => l.id === id)?.nom ?? `#${id}`} stroke={COULEURS[i]} fill={COULEURS[i]} fillOpacity={0.12} strokeWidth={2} />)}
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => `${v}/100`} />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-8" />
                    <th className="text-left px-3 py-2 cursor-pointer whitespace-nowrap" onClick={() => trier('nom')}>Campagne <Tri tri={tri} cle="nom" /></th>
                    <th className="text-right px-3 py-2 cursor-pointer whitespace-nowrap" onClick={() => trier('score')}>Score <Tri tri={tri} cle="score" /></th>
                    {colonnes.map((k) => <th key={k} className="text-right px-3 py-2 cursor-pointer whitespace-nowrap" onClick={() => trier(k)}>{PAR_CLE[k]?.label} <Tri tri={tri} cle={k} /></th>)}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lignes.map((l, i) => (
                    <tr key={l.id} className="hover:bg-muted/30">
                      <td className="pl-3"><input type="checkbox" checked={comparees.includes(l.id)} disabled={!comparees.includes(l.id) && comparees.length >= 5} onChange={() => setComparees((x) => (x.includes(l.id) ? x.filter((y) => y !== l.id) : [...x, l.id]))} /></td>
                      <td className="px-3 py-2">
                        <Link href={`/dashboard/marketing/campagnes/${l.id}`} className="font-medium hover:underline">{l.nom}</Link>
                        <div className="flex gap-1.5 mt-0.5"><Badge variant={STATUT_CAMPAGNE[l.statut]?.variant ?? 'outline'} className="text-[10px] px-1.5 py-0">{STATUT_CAMPAGNE[l.statut]?.label ?? l.statut}</Badge><span className="text-[11px] text-muted-foreground">{TYPE_CAMPAGNE[l.type]}</span></div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {l.score == null ? '—' : (
                          <div className="inline-flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden"><div className={cn('h-full', l.score >= 66 ? 'bg-success' : l.score >= 33 ? 'bg-brand-600' : 'bg-warning')} style={{ width: `${l.score}%` }} /></div>
                            <span className={cn('font-bold tabular-nums', tri.cle === 'score' && tri.desc && i === 0 && 'text-brand-700')}>{l.score}</span>
                          </div>
                        )}
                      </td>
                      {colonnes.map((k) => <td key={k} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{formater(l[k], PAR_CLE[k]?.format ?? 'nombre')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">Score sur 100 : chaque critère est ramené sur 0-100 entre la moins bonne et la meilleure campagne affichée, puis pondéré. Un critère sans valeur pour une campagne (ex. coût non saisi) n’entre pas dans son score.</p>
        </>
      )}
    </div>
  );
}
