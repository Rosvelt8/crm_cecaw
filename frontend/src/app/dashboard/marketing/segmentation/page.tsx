'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TablePagination } from '@/components/ui/table-pagination';
import { EnTete, Kpi, fcfa } from '@/components/ui/kpi';
import { clientService } from '@/services/clientService';
import { usePagination } from '@/hooks/usePagination';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { CYCLE_LABEL, CYCLE_TONE } from '@/lib/segmentationLabels';
import { cn } from '@/lib/utils';

const COULEURS: Record<string, string> = {
  nouveau: '#3b82f6', actif: '#10b981', premium: '#b8860b', dormant: '#f59e0b',
  a_risque: '#ef4444', perdu: '#64748b', a_reactiver: '#8b5cf6',
};

interface ScoreRow {
  id: number; clientId: number; score: number; potentiel: number; cycleVie: string;
  scoreCroissance: number; scoreAttrition: number; nombreProduits: number; panierMoyen: number;
  client: { id: number; nom: string; prenom: string | null; telephone: string; commercial: { id: number; nom: string; prenom: string } | null };
}

/**
 * Vue de segmentation client (compléments stratégiques, point 1 ; étendue Lot 15 avec le taux
 * d'équipement et le panier moyen). Câble enfin `clientService.getScores`/`recalculerScores`,
 * jusqu'ici liés côté frontend sans écran pour les consommer.
 */
export default function SegmentationPage() {
  const { can } = useCan();
  const peutRecalculer = can('crm:UPDATE');
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recalcul, setRecalcul] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [filtreCycle, setFiltreCycle] = useState('all');

  // Pas de setState synchrone ici : appelé depuis l'effet initial comme après un recalcul.
  const charger = useCallback(() => clientService.getAllScores()
    .then((r) => setScores(r as ScoreRow[]))
    .catch((e) => toast.error(msg(e, 'Chargement impossible')))
    .finally(() => setChargement(false)), []);

  useEffect(() => { void charger(); }, [charger]);

  const lancerRecalcul = async () => {
    setRecalcul(true);
    try { const r = await clientService.recalculerScores(); toast.success(`${r.traites} client(s) recalculé(s)`); await charger(); }
    catch (e) { toast.error(msg(e, 'Recalcul impossible')); }
    finally { setRecalcul(false); }
  };

  const filtres = useMemo(() => scores.filter((s) => {
    const q = recherche.toLowerCase();
    const matchRecherche = !q || `${s.client.prenom ?? ''} ${s.client.nom} ${s.client.telephone}`.toLowerCase().includes(q);
    return matchRecherche && (filtreCycle === 'all' || s.cycleVie === filtreCycle);
  }), [scores, recherche, filtreCycle]);

  const { paginated, ...pagination } = usePagination(filtres, 20);

  const repartition = useMemo(() => {
    const parCycle = new Map<string, number>();
    for (const s of scores) parCycle.set(s.cycleVie, (parCycle.get(s.cycleVie) ?? 0) + 1);
    return [...parCycle.entries()].map(([cycleVie, nb]) => ({ cycleVie, nb }));
  }, [scores]);

  const nbARisque = useMemo(() => scores.filter((s) => ['a_risque', 'dormant', 'perdu'].includes(s.cycleVie)).length, [scores]);

  const moyennes = useMemo(() => {
    if (scores.length === 0) return { produits: 0, panier: 0 };
    return {
      produits: scores.reduce((s, x) => s + x.nombreProduits, 0) / scores.length,
      panier: scores.reduce((s, x) => s + Number(x.panierMoyen), 0) / scores.length,
    };
  }, [scores]);

  return (
    <div className="space-y-4">
      <EnTete titre="Segmentation clients" sousTitre="Score, cycle de vie, taux d'équipement et panier moyen — calculés chaque nuit par le moteur de règles">
        {peutRecalculer && (
          <Button size="sm" variant="outline" disabled={recalcul} onClick={lancerRecalcul}>
            {recalcul ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Recalculer
          </Button>
        )}
      </EnTete>

      {chargement ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Clients segmentés" valeur={scores.length} />
            <Kpi label="Produits / client (moyenne)" valeur={moyennes.produits.toFixed(1)} />
            <Kpi label="Panier moyen" valeur={fcfa(moyennes.panier)} />
            <Kpi label="À risque de perte" valeur={nbARisque} ton={nbARisque > 0 ? 'alerte' : 'bon'} precision="à risque, dormants et perdus" />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Répartition par cycle de vie</CardTitle></CardHeader>
            <CardContent style={{ height: 240 }}>
              {repartition.length === 0 ? <p className="text-sm text-muted-foreground">Aucune donnée de segmentation.</p> : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={repartition} dataKey="nb" nameKey="cycleVie" outerRadius={90} label={(p: any) => `${CYCLE_LABEL[p.cycleVie] ?? p.cycleVie} (${p.nb})`} labelLine={false} fontSize={11}>
                      {repartition.map((r) => <Cell key={r.cycleVie} fill={COULEURS[r.cycleVie] ?? '#94a3b8'} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Input className="max-w-sm" placeholder="Nom, téléphone…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
            <select className="h-10 rounded-lg border bg-background px-3 text-sm" value={filtreCycle} onChange={(e) => setFiltreCycle(e.target.value)}>
              <option value="all">Tous les cycles de vie</option>
              {Object.entries(CYCLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {['Client', 'Commercial', 'Cycle de vie', 'Score', 'Potentiel', 'Croissance', 'Attrition', 'Produits', 'Panier moyen'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/marketing/clients/${s.client.id}`} className="font-medium text-brand-700 hover:underline">{s.client.prenom} {s.client.nom}</Link>
                        <p className="text-xs text-muted-foreground">{s.client.telephone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{s.client.commercial ? `${s.client.commercial.prenom} ${s.client.commercial.nom}` : '—'}</td>
                      <td className="px-4 py-3"><Badge variant={CYCLE_TONE[s.cycleVie] ?? 'info'}>{CYCLE_LABEL[s.cycleVie] ?? s.cycleVie}</Badge></td>
                      <td className="px-4 py-3 font-semibold">{s.score}</td>
                      <td className="px-4 py-3">{s.potentiel}</td>
                      <td className="px-4 py-3">{s.scoreCroissance}</td>
                      <td className={cn('px-4 py-3', s.scoreAttrition >= 60 && 'text-destructive font-semibold')}>{s.scoreAttrition}</td>
                      <td className="px-4 py-3">{s.nombreProduits}</td>
                      <td className="px-4 py-3">{fcfa(s.panierMoyen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtres.length === 0 && <div className="py-14 text-center text-sm text-muted-foreground">Aucun client trouvé.</div>}
            </div>
          </Card>
          <TablePagination {...pagination} />
        </>
      )}
    </div>
  );
}
