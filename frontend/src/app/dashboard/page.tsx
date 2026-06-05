'use client';

import { useEffect, useState } from 'react';
import { statsService } from '@/services/statsService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Users, UserPlus, Wallet, ArrowLeftRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const PROSPECT_LABELS: Record<string, string> = {
  nouveau: 'Nouveau', contacte: 'Contacté', interesse: 'Intéressé',
  negocie: 'Négocié', converti: 'Converti', perdu: 'Perdu',
};

const PROSPECT_COLORS: Record<string, string> = {
  nouveau: '#94a3b8', contacte: '#60a5fa', interesse: '#f59e0b',
  negocie: '#c47d0e', converti: '#10b981', perdu: '#ef4444',
};

interface DashboardData {
  kpis: {
    clients_actifs: number;
    clients_total: number;
    prospects_en_cours: number;
    prospects_convertis: number;
    solde_comptes_actifs: number;
    nb_comptes_actifs: number;
    total_transactions: number;
    nb_credits: number;
    nb_debits: number;
  };
  transactions_par_mois: Array<{ mois: string; credits: number; debits: number }>;
  prospects_par_statut: Array<{ statut: string; count: number }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    statsService.getDashboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const kpis = data?.kpis;
  const txByMonth = (data?.transactions_par_mois ?? []).map((m) => ({
    label: m.mois,
    Crédits: m.credits,
    Débits: m.debits,
  }));
  const prospectsByStatut = (data?.prospects_par_statut ?? []).map((p) => ({
    label: PROSPECT_LABELS[p.statut] ?? p.statut,
    value: p.count,
    color: PROSPECT_COLORS[p.statut] ?? '#94a3b8',
  }));

  const KPI_ITEMS = [
    {
      label: 'Clients actifs',
      value: loading ? '…' : kpis?.clients_actifs ?? 0,
      sub: `${kpis?.clients_total ?? 0} clients au total`,
      icon: Users,
      iconBg: 'bg-brand-50',
      iconColor: 'text-brand-600',
      valueColor: '',
    },
    {
      label: 'Prospects en cours',
      value: loading ? '…' : kpis?.prospects_en_cours ?? 0,
      sub: `${kpis?.prospects_convertis ?? 0} convertis`,
      icon: UserPlus,
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      valueColor: '',
    },
    {
      label: 'Solde comptes actifs',
      value: loading ? '…' : formatCurrency(kpis?.solde_comptes_actifs ?? 0),
      sub: `${kpis?.nb_comptes_actifs ?? 0} comptes actifs`,
      icon: Wallet,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      valueColor: 'text-emerald-600',
      isFormatted: true,
    },
    {
      label: 'Transactions totales',
      value: loading ? '…' : kpis?.total_transactions ?? 0,
      sub: `${kpis?.nb_credits ?? 0} crédits · ${kpis?.nb_debits ?? 0} débits`,
      icon: ArrowLeftRight,
      iconBg: 'bg-violet-50',
      iconColor: 'text-violet-600',
      valueColor: '',
    },
  ];

  return (
    <div className="h-full flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Vue d'ensemble</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Tableau de bord CECAW Microfinance.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {KPI_ITEMS.map((kpi) => (
          <Card key={kpi.label} className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-muted-foreground">{kpi.label}</p>
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${kpi.iconBg}`}>
                <kpi.icon className={`h-5 w-5 ${kpi.iconColor}`} />
              </div>
            </div>
            <div>
              <p className={`text-3xl font-black tracking-tight ${kpi.valueColor}`}>
                {kpi.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2 flex-1">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Transactions — 6 derniers mois</CardTitle>
            <CardDescription className="text-xs">Crédits et débits cumulés par mois.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[320px]">
            {loading ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Chargement…</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={txByMonth} barGap={4} barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))', fontFamily: 'inherit' }} />
                  <YAxis axisLine={false} tickLine={false}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))', fontFamily: 'inherit' }}
                    tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid hsl(var(--border))', borderRadius: '10px', fontSize: '13px', fontFamily: 'inherit' }}
                    formatter={(v: number) => [formatCurrency(v)]}
                  />
                  <Bar dataKey="Crédits" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Débits" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Pipeline Prospects</CardTitle>
            <CardDescription className="text-xs">Répartition par statut de qualification.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[320px]">
            {loading ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Chargement…</div>
            ) : prospectsByStatut.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Aucun prospect.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={prospectsByStatut} layout="vertical" barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))', fontFamily: 'inherit' }} />
                  <YAxis type="category" dataKey="label" axisLine={false} tickLine={false} width={76}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))', fontFamily: 'inherit' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid hsl(var(--border))', borderRadius: '10px', fontSize: '13px', fontFamily: 'inherit' }}
                    formatter={(v: number) => [v, 'prospects']}
                  />
                  <Bar dataKey="value" name="Prospects" radius={[0, 4, 4, 0]}>
                    {prospectsByStatut.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
