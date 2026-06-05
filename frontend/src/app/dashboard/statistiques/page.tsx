'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/table-pagination';
import { statsService } from '@/services/statsService';
import { agenceService } from '@/services/agenceService';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, Users, Target, Wallet, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { toast } from 'sonner';

type Period = '7j' | '30j' | 'mois' | 'trimestre' | 'annee' | 'tout';
type TabKey = 'individuel' | 'equipes';
type IndivSortKey = 'nom' | 'prospects' | 'convertis' | 'clients' | 'collecte' | 'taux';
type SortDir = 'asc' | 'desc';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'tout',      label: 'Tout' },
  { value: '7j',        label: '7 derniers jours' },
  { value: '30j',       label: '30 derniers jours' },
  { value: 'mois',      label: 'Ce mois' },
  { value: 'trimestre', label: 'Ce trimestre' },
  { value: 'annee',     label: 'Cette année' },
];

type AgentRow = {
  id: string; nom: string; matricule: string;
  agence: string; equipe: string;
  prospects: number; convertis: number; clients: number;
  collecte: number; taux: number;
  objAtteints: number; objTotal: number;
};

type EquipeRow = {
  id: string; nom: string; agence: string; membres: number;
  prospects: number; convertis: number; clients: number;
  collecte: number; taux: number; objAtteints: number; objTotal: number;
};

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 opacity-30 shrink-0" />;
  return dir === 'asc'
    ? <ChevronUp className="h-3 w-3 text-brand-600 shrink-0" />
    : <ChevronDown className="h-3 w-3 text-brand-600 shrink-0" />;
}

export default function StatistiquesPage() {
  const [agences, setAgences] = useState<any[]>([]);
  const [kpis, setKpis] = useState({ prospects: 0, convertis: 0, clients: 0, collecte: 0, taux: 0, objAtteints: 0, objTotal: 0 });
  const [agentRows, setAgentRows] = useState<AgentRow[]>([]);
  const [equipeRows, setEquipeRows] = useState<EquipeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterAgence, setFilterAgence] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState<Period>('tout');
  const [tab, setTab] = useState<TabKey>('individuel');
  const [sortKey, setSortKey] = useState<IndivSortKey>('collecte');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    agenceService.getAgences({ per_page: 100 }).then((r) => setAgences(r.data ?? [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { per_page: 500 };
      if (filterAgence !== 'all') params.agence_id = filterAgence;
      if (filterPeriod !== 'tout') params.periode = filterPeriod;

      const [kpisData, perfData, equipeData] = await Promise.all([
        statsService.getKpis(params),
        statsService.getPerformancesIndividuelles(params),
        statsService.getPerformancesEquipes(params),
      ]);

      setKpis({
        prospects:   kpisData?.prospects          ?? 0,
        convertis:   kpisData?.convertis          ?? 0,
        clients:     kpisData?.clients            ?? 0,
        collecte:    kpisData?.collecte_total     ?? 0,
        taux:        kpisData?.taux_conversion    ?? 0,
        objAtteints: kpisData?.objectifs_atteints ?? 0,
        objTotal:    kpisData?.objectifs_total    ?? 0,
      });

      const rows: AgentRow[] = (perfData ?? []).map((a: any) => ({
        id:          String(a.agent_id ?? ''),
        nom:         a.nom ?? '',
        matricule:   a.matricule ?? '',
        agence:      a.agence ?? '—',
        equipe:      a.equipe ?? '—',
        prospects:   a.prospects          ?? 0,
        convertis:   a.convertis          ?? 0,
        clients:     a.clients            ?? 0,
        collecte:    a.collecte           ?? 0,
        taux:        a.taux_conversion    ?? 0,
        objAtteints: a.objectifs_atteints ?? 0,
        objTotal:    a.objectifs_total    ?? 0,
      }));
      setAgentRows(rows);

      const eqRows: EquipeRow[] = (equipeData ?? []).map((e: any) => ({
        id:          String(e.equipe_id ?? ''),
        nom:         e.nom ?? '',
        agence:      e.agence ?? '—',
        membres:     e.nb_agents          ?? 0,
        prospects:   e.prospects          ?? 0,
        convertis:   e.convertis          ?? 0,
        clients:     e.clients            ?? 0,
        collecte:    e.collecte           ?? 0,
        taux:        e.taux_conversion    ?? 0,
        objAtteints: e.objectifs_atteints ?? 0,
        objTotal:    e.objectifs_total    ?? 0,
      }));
      setEquipeRows(eqRows);
    } catch {
      toast.error('Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
    }
  }, [filterAgence, filterPeriod]);

  useEffect(() => { load(); }, [load]);

  const sortedAgentRows = useMemo(() =>
    [...agentRows].sort((a, b) => {
      const cmp = sortKey === 'nom'
        ? a.nom.localeCompare(b.nom)
        : (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === 'asc' ? cmp : -cmp;
    }),
    [agentRows, sortKey, sortDir]
  );

  const toggleSort = (k: IndivSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  };


  const { paginated: paginatedIndiv, ...paginationIndiv } = usePagination(sortedAgentRows, 10);
  const { paginated: paginatedEquipes, ...paginationEquipes } = usePagination(equipeRows, 10);

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'individuel', label: 'Performances individuelles' },
    { key: 'equipes',    label: 'Performances par équipes' },
  ];

  const thCls = 'px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left select-none';
  const thSortCls = cn(thCls, 'cursor-pointer hover:text-foreground transition-colors');
  const tdCls = 'px-4 py-3 text-sm';

  return (
    <div className="space-y-6">
      {/* ── En-tête + filtres ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Statistiques & Performance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vue d'ensemble et suivi des performances individuelles et collectives.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={filterAgence} onValueChange={setFilterAgence}>
            <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Toutes agences" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les agences</SelectItem>
              {agences.map((ag) => <SelectItem key={ag.id} value={String(ag.id)}>{ag.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPeriod} onValueChange={(v) => setFilterPeriod(v as Period)}>
            <SelectTrigger className="h-8 text-xs w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Prospects',        value: kpis.prospects,              sub: `${kpis.convertis} convertis`,        color: 'text-brand-600',   icon: Users },
          { label: 'Clients recrutés', value: kpis.clients,                sub: 'sur la période',                      color: 'text-violet-600',  icon: Users },
          { label: 'Taux conversion',  value: `${kpis.taux}%`,             sub: `${kpis.convertis}/${kpis.prospects}`, color: 'text-emerald-600', icon: TrendingUp },
          { label: 'Collecte',         value: formatCurrency(kpis.collecte),sub: 'crédits reçus',                      color: 'text-amber-600',   icon: Wallet, small: true },
          { label: 'Objectifs',        value: `${kpis.objAtteints}/${kpis.objTotal}`, sub: 'atteints',                color: 'text-rose-600',    icon: Target },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k.label}</p>
              <k.icon className={cn('h-3.5 w-3.5', k.color)} />
            </div>
            <p className={cn('font-black leading-none', k.color, k.small ? 'text-lg' : 'text-3xl')}>{k.value}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{k.sub}</p>
          </Card>
        ))}
      </div>

      {/* ── Onglets ── */}
      <div>
        <div className="flex border-b border-border mb-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="py-16 text-center text-sm text-muted-foreground">Chargement…</div>
        )}

        {/* ── Tab : Individuelles ── */}
        {!loading && tab === 'individuel' && (
          <>
            <Card className="overflow-hidden rounded-t-none border-t-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className={thSortCls} onClick={() => toggleSort('nom')}>
                        <div className="flex items-center gap-1">Agent <SortIcon active={sortKey === 'nom'} dir={sortDir} /></div>
                      </th>
                      <th className={thCls}>Agence / Équipe</th>
                      <th className={cn(thSortCls, 'text-right')} onClick={() => toggleSort('prospects')}>
                        <div className="flex items-center justify-end gap-1">Prospects <SortIcon active={sortKey === 'prospects'} dir={sortDir} /></div>
                      </th>
                      <th className={cn(thSortCls, 'text-right')} onClick={() => toggleSort('convertis')}>
                        <div className="flex items-center justify-end gap-1">Convertis <SortIcon active={sortKey === 'convertis'} dir={sortDir} /></div>
                      </th>
                      <th className={cn(thSortCls, 'text-right')} onClick={() => toggleSort('clients')}>
                        <div className="flex items-center justify-end gap-1">Clients <SortIcon active={sortKey === 'clients'} dir={sortDir} /></div>
                      </th>
                      <th className={cn(thSortCls, 'text-right')} onClick={() => toggleSort('taux')}>
                        <div className="flex items-center justify-end gap-1">Conv. <SortIcon active={sortKey === 'taux'} dir={sortDir} /></div>
                      </th>
                      <th className={cn(thSortCls, 'text-right')} onClick={() => toggleSort('collecte')}>
                        <div className="flex items-center justify-end gap-1">Collecte <SortIcon active={sortKey === 'collecte'} dir={sortDir} /></div>
                      </th>
                      <th className={cn(thCls, 'text-right')}>Objectifs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedIndiv.map((a) => {
                      const tauxColor = a.taux >= 60 ? 'text-emerald-600' : a.taux >= 30 ? 'text-amber-600' : 'text-muted-foreground';
                      return (
                        <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                          <td className={tdCls}>
                            <div className="flex items-center gap-2.5">
                              <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-700 shrink-0">
                                {a.nom.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                              </div>
                              <div>
                                <p className="font-semibold text-xs leading-tight">{a.nom}</p>
                                <p className="text-[10px] font-mono text-muted-foreground">{a.matricule}</p>
                              </div>
                            </div>
                          </td>
                          <td className={tdCls}>
                            <p className="text-xs text-muted-foreground">{a.agence}</p>
                            <p className="text-[10px] text-muted-foreground/70">{a.equipe}</p>
                          </td>
                          <td className={cn(tdCls, 'text-right font-semibold tabular-nums')}>{a.prospects}</td>
                          <td className={cn(tdCls, 'text-right font-semibold tabular-nums text-emerald-600')}>{a.convertis}</td>
                          <td className={cn(tdCls, 'text-right font-semibold tabular-nums')}>{a.clients}</td>
                          <td className={cn(tdCls, 'text-right font-bold tabular-nums', tauxColor)}>{a.taux}%</td>
                          <td className={cn(tdCls, 'text-right font-bold tabular-nums text-amber-700')}>
                            {a.collecte > 0 ? formatCurrency(a.collecte) : <span className="text-muted-foreground font-normal">—</span>}
                          </td>
                          <td className={cn(tdCls, 'text-right')}>
                            {a.objTotal > 0 ? (
                              <span className={cn('font-semibold', a.objAtteints === a.objTotal ? 'text-emerald-600' : 'text-muted-foreground')}>
                                {a.objAtteints}/{a.objTotal}
                              </span>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {sortedAgentRows.length === 0 && (
                  <div className="py-14 text-center text-sm text-muted-foreground">Aucune donnée sur cette période.</div>
                )}
              </div>
            </Card>
            <TablePagination {...paginationIndiv} />
          </>
        )}

        {/* ── Tab : Équipes ── */}
        {!loading && tab === 'equipes' && (
          <>
            <Card className="overflow-hidden rounded-t-none border-t-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className={thCls}>Équipe</th>
                      <th className={thCls}>Agence</th>
                      <th className={cn(thCls, 'text-right')}>Agents</th>
                      <th className={cn(thCls, 'text-right')}>Prospects</th>
                      <th className={cn(thCls, 'text-right')}>Convertis</th>
                      <th className={cn(thCls, 'text-right')}>Clients</th>
                      <th className={cn(thCls, 'text-right')}>Taux conv.</th>
                      <th className={cn(thCls, 'text-right')}>Collecte</th>
                      <th className={cn(thCls, 'text-right')}>Objectifs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedEquipes.map((eq) => {
                      const pctBar = eq.objTotal > 0 ? Math.min(100, Math.round((eq.objAtteints / eq.objTotal) * 100)) : 0;
                      const tauxColor = eq.taux >= 60 ? 'text-emerald-600' : eq.taux >= 30 ? 'text-amber-600' : 'text-muted-foreground';
                      return (
                        <tr key={eq.id} className="hover:bg-muted/20 transition-colors">
                          <td className={tdCls}>
                            <p className="font-semibold">{eq.nom}</p>
                            <p className="text-[10px] text-muted-foreground">{eq.membres} agent{eq.membres !== 1 ? 's' : ''}</p>
                          </td>
                          <td className={cn(tdCls, 'text-muted-foreground text-xs')}>{eq.agence}</td>
                          <td className={cn(tdCls, 'text-right tabular-nums font-semibold')}>{eq.membres}</td>
                          <td className={cn(tdCls, 'text-right tabular-nums font-semibold')}>{eq.prospects}</td>
                          <td className={cn(tdCls, 'text-right tabular-nums font-semibold text-emerald-600')}>{eq.convertis}</td>
                          <td className={cn(tdCls, 'text-right tabular-nums font-semibold')}>{eq.clients}</td>
                          <td className={cn(tdCls, 'text-right font-bold tabular-nums', tauxColor)}>{eq.taux}%</td>
                          <td className={cn(tdCls, 'text-right font-bold tabular-nums text-amber-700')}>
                            {eq.collecte > 0 ? formatCurrency(eq.collecte) : <span className="text-muted-foreground font-normal">—</span>}
                          </td>
                          <td className={cn(tdCls, 'text-right')}>
                            {eq.objTotal > 0 ? (
                              <div className="flex flex-col items-end gap-1">
                                <span className={cn('font-semibold text-xs', eq.objAtteints === eq.objTotal ? 'text-emerald-600' : 'text-muted-foreground')}>
                                  {eq.objAtteints}/{eq.objTotal}
                                </span>
                                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={cn('h-full rounded-full', pctBar >= 100 ? 'bg-emerald-500' : pctBar >= 60 ? 'bg-brand-500' : 'bg-amber-400')}
                                    style={{ width: `${pctBar}%` }}
                                  />
                                </div>
                              </div>
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {equipeRows.length === 0 && (
                  <div className="py-14 text-center text-sm text-muted-foreground">Aucune donnée sur cette période.</div>
                )}
              </div>
            </Card>
            <TablePagination {...paginationEquipes} />
          </>
        )}
      </div>
    </div>
  );
}
