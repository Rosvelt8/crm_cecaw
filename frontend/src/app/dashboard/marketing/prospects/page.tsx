'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/table-pagination';
import { prospectService } from '@/services/prospectService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Pencil, Trash2, Check, X, ArrowRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

type StatutProspect = 'nouveau' | 'contacte' | 'interesse' | 'negocie' | 'converti' | 'perdu';

export const STATUT_CONFIG: Record<StatutProspect, { label: string; color: string }> = {
  nouveau:   { label: 'Nouveau',   color: 'bg-slate-100 text-slate-700' },
  contacte:  { label: 'Contacté',  color: 'bg-blue-100 text-blue-700' },
  interesse: { label: 'Intéressé', color: 'bg-violet-100 text-violet-700' },
  negocie:   { label: 'Négocié',   color: 'bg-amber-100 text-amber-700' },
  converti:  { label: 'Converti',  color: 'bg-emerald-100 text-emerald-700' },
  perdu:     { label: 'Perdu',     color: 'bg-red-100 text-red-700' },
};

export default function ProspectsPage() {
  const router = useRouter();
  const { isAgent, canDelete, utilisateurId } = useAuth();

  const [prospects, setProspects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState<StatutProspect | 'all'>('all');
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { per_page: 200 };
      if (filterStatut !== 'all') params.statut = filterStatut;
      const res = await prospectService.getProspects(params as any);
      setProspects(res.data ?? []);
    } catch {
      toast.error('Erreur lors du chargement des prospects');
    } finally {
      setLoading(false);
    }
  }, [filterStatut]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    prospects.filter((p) => {
      if (isAgent && p.commercialId !== Number(utilisateurId)) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return `${p.prenom} ${p.nom} ${p.telephone} ${p.ville ?? ''} ${p.profession ?? ''}`.toLowerCase().includes(q);
    }),
    [prospects, search, isAgent, utilisateurId]
  );

  const { paginated, ...pagination } = usePagination(filtered, 20);

  const stats = useMemo(() => ({
    total:     prospects.length,
    enCours:   prospects.filter((p) => !['converti', 'perdu'].includes(p.statut)).length,
    convertis: prospects.filter((p) => p.statut === 'converti').length,
    perdus:    prospects.filter((p) => p.statut === 'perdu').length,
  }), [prospects]);

  const handleConvertir = (p: any) => {
    router.push(`/dashboard/marketing/clients/nouveau?prospectId=${p.id}`);
  };

  const handleDelete = async (id: number) => {
    try {
      await prospectService.remove(id);
      setProspects((prev) => prev.filter((x) => x.id !== id));
      toast.success('Prospect supprimé');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Impossible de supprimer ce prospect');
    }
    setConfirmId(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prospects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Pipeline de conversion — {prospects.length} prospects enregistrés.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button variant="brand" size="sm" onClick={() => router.push('/dashboard/marketing/prospects/nouveau')}>
            <Plus className="mr-2 h-4 w-4" /> Nouveau prospect
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total',     value: stats.total,     color: 'text-foreground' },
          { label: 'En cours',  value: stats.enCours,   color: 'text-brand-600' },
          { label: 'Convertis', value: stats.convertis, color: 'text-emerald-600' },
          { label: 'Perdus',    value: stats.perdus,    color: 'text-red-500' },
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
          <Input className="pl-9" placeholder="Nom, téléphone, ville, profession…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatut} onValueChange={(v) => setFilterStatut(v as any)}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Tous les statuts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {(Object.keys(STATUT_CONFIG) as StatutProspect[]).map((s) => (
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
                {['Prospect', 'Contact', 'Localisation', 'Profession', 'Commercial', 'Statut', 'Actions'].map((h) => (
                  <th key={h} className={cn('px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider', h === 'Actions' ? 'text-right' : 'text-left')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="py-16 text-center text-muted-foreground text-sm">Chargement…</td></tr>
              ) : paginated.map((p) => (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs shrink-0">
                        {p.prenom?.[0]}{p.nom?.[0]}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{p.prenom} {p.nom}</p>
                        {p.numeroCni && <p className="text-[11px] text-muted-foreground">CNI {p.numeroCni}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.telephone}</p>
                    {p.email && <p className="text-[11px] text-muted-foreground">{p.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.ville || p.quartier
                      ? <><p>{p.ville}</p>{p.quartier && <p className="text-[11px]">{p.quartier}</p>}</>
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {p.profession
                      ? <><p>{p.profession}</p>{p.employeur && <p className="text-[11px] text-muted-foreground">{p.employeur}</p>}</>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-[13px]">
                    {p.commercial ? `${p.commercial.prenom} ${p.commercial.nom}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold', (STATUT_CONFIG as any)[p.statut]?.color ?? 'bg-gray-100 text-gray-600')}>
                      {(STATUT_CONFIG as any)[p.statut]?.label ?? p.statut}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {p.statut !== 'converti' && p.statut !== 'perdu' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700" onClick={() => handleConvertir(p)}>
                          <ArrowRight className="h-3 w-3" /> Convertir
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => router.push(`/dashboard/marketing/prospects/${p.id}/modifier`)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {canDelete && (confirmId === p.id ? (
                        <>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleDelete(p.id)}>
                            <Check className="mr-1 h-3 w-3" /> Confirmer
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setConfirmId(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmId(p.id)}>
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
            <div className="py-16 text-center text-muted-foreground text-sm">Aucun prospect trouvé.</div>
          )}
        </div>
      </Card>
      <TablePagination {...pagination} />
    </div>
  );
}
