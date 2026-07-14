'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/table-pagination';
import { clientService } from '@/services/clientService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Pencil, Trash2, Check, X, Eye, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

type StatutClient = 'actif' | 'inactif' | 'blackliste';

const STATUT_CONFIG: Record<StatutClient, { label: string; color: string }> = {
  actif:      { label: 'Actif',      color: 'bg-emerald-100 text-emerald-700' },
  inactif:    { label: 'Inactif',    color: 'bg-slate-100 text-slate-600' },
  blackliste: { label: 'Blacklisté', color: 'bg-red-100 text-red-700' },
};

export default function ClientsPage() {
  const router = useRouter();
  const { isAgent, canDelete, utilisateurId } = useAuth();

  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState<StatutClient | 'all'>('all');
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { per_page: 200 };
      if (filterStatut !== 'all') params.statut = filterStatut;
      const res = await clientService.getClients(params as any);
      setClients(res.data ?? []);
    } catch {
      toast.error('Erreur lors du chargement des clients');
    } finally {
      setLoading(false);
    }
  }, [filterStatut]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    clients.filter((c) => {
      if (isAgent && c.commercialId !== Number(utilisateurId)) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return `${c.prenom ?? ''} ${c.nom} ${c.telephone} ${c.email ?? ''} ${c.ville ?? ''}`.toLowerCase().includes(q);
    }),
    [clients, search, isAgent, utilisateurId]
  );

  const { paginated, ...pagination } = usePagination(filtered, 20);

  const stats = useMemo(() => ({
    total:       clients.length,
    actifs:      clients.filter((c) => c.statut === 'actif').length,
    inactifs:    clients.filter((c) => c.statut === 'inactif').length,
    blacklistes: clients.filter((c) => c.statut === 'blackliste').length,
  }), [clients]);

  const handleDelete = async (id: number) => {
    try {
      await clientService.remove(id);
      setClients((prev) => prev.filter((x) => x.id !== id));
      toast.success('Client supprimé');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Impossible de supprimer ce client');
    }
    setConfirmId(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Portefeuille clients — {clients.length} enregistrés.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button variant="brand" size="sm" onClick={() => router.push('/dashboard/marketing/clients/nouveau')}>
            <Plus className="mr-2 h-4 w-4" /> Nouveau client
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total',       value: stats.total,       color: '' },
          { label: 'Actifs',      value: stats.actifs,      color: 'text-emerald-600' },
          { label: 'Inactifs',    value: stats.inactifs,    color: 'text-slate-500' },
          { label: 'Blacklistés', value: stats.blacklistes, color: 'text-red-500' },
        ].map((k) => (
          <Card key={k.label} className="p-5">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{k.label}</p>
            <p className={cn('text-3xl font-black mt-1', k.color)}>{k.value}</p>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 w-full sm:w-auto sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Nom, téléphone, ville…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatut} onValueChange={(v) => setFilterStatut(v as any)}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Tous" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            {(Object.keys(STATUT_CONFIG) as StatutClient[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUT_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tableau */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {['Client', 'Contact', 'Localisation', 'Agence / Commercial', 'Comptes', 'Statut', 'Actions'].map((h) => (
                  <th key={h} className={cn('px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider', h === 'Actions' ? 'text-right' : 'text-left')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="py-16 text-center text-muted-foreground text-sm">Chargement…</td></tr>
              ) : paginated.map((c) => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => router.push(`/dashboard/marketing/clients/${c.id}`)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs shrink-0">
                        {c.typePersonne === 'morale' ? c.nom?.[0] : <>{c.prenom?.[0]}{c.nom?.[0]}</>}
                      </div>
                      <div>
                        <p className="font-semibold">{c.typePersonne === 'morale' ? c.nom : `${c.prenom ?? ''} ${c.nom}`}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {c.typePersonne === 'morale' ? (c.formeJuridique || 'Entreprise') : (c.numeroCni ? `CNI ${c.numeroCni}` : null)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.telephone}</p>
                    {c.email && <p className="text-[11px] text-muted-foreground">{c.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.ville ? <p>{c.ville}</p> : '—'}
                    {c.quartier && <p className="text-[11px]">{c.quartier}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-[13px]">
                    <p>{c.agence?.nom ?? '—'}</p>
                    {c.commercial && <p className="text-[11px]">{c.commercial.prenom} {c.commercial.nom}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-brand-50 text-brand-700 text-xs font-bold">
                      {c.nb_comptes ?? c._count?.comptes ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold', (STATUT_CONFIG as any)[c.statut]?.color ?? 'bg-gray-100 text-gray-600')}>
                      {(STATUT_CONFIG as any)[c.statut]?.label ?? c.statut}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => router.push(`/dashboard/marketing/clients/${c.id}`)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => router.push(`/dashboard/marketing/clients/${c.id}/modifier`)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {canDelete && (confirmId === c.id ? (
                        <>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleDelete(c.id)}>
                            <Check className="mr-1 h-3 w-3" /> Confirmer
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setConfirmId(null)}><X className="h-3 w-3" /></Button>
                        </>
                      ) : (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmId(c.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <div className="py-16 text-center text-muted-foreground text-sm">Aucun client trouvé.</div>
          )}
        </div>
      </Card>
      <TablePagination {...pagination} />
    </div>
  );
}
