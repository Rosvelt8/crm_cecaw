'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/table-pagination';
import { agentService } from '@/services/agentService';
import { agenceService } from '@/services/agenceService';
import { userService } from '@/services/userService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Pencil, Trash2, X, Check, MapPin, Clock, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function isOnline(dernierePositionAt: string | null): boolean {
  if (!dernierePositionAt) return false;
  return Date.now() - new Date(dernierePositionAt).getTime() < 60 * 60 * 1000;
}

type Form = { utilisateurId: string; matricule: string; secteur: string };
const EMPTY: Form = { utilisateurId: '', matricule: '', secteur: '' };

const agentSchema = z.object({
  utilisateurId: z.string().optional(),
  matricule: z.string().trim().min(1, 'Matricule requis').max(50, 'Maximum 50 caractères'),
  secteur: z.string().trim().max(200, 'Maximum 200 caractères').optional(),
});

function validateForm(form: Form, isCreate: boolean): Record<string, string> | null {
  const result = agentSchema.safeParse(form);
  const errors: Record<string, string> = {};
  if (!result.success) {
    result.error.issues.forEach((issue) => { errors[String(issue.path[0])] = issue.message; });
  }
  if (isCreate && !form.utilisateurId) errors.utilisateurId = 'Utilisateur requis';
  return Object.keys(errors).length > 0 ? errors : null;
}

export default function AgentsPage() {
  const router = useRouter();

  const [agents, setAgents] = useState<any[]>([]);
  const [agences, setAgences] = useState<any[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterAgence, setFilterAgence] = useState<string>('all');
  const [modal, setModal] = useState<'create' | { id: number } | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agRows, agenceRes] = await Promise.all([
        agentService.getAllAgents(),
        agenceService.getAgences({ per_page: 100 }),
      ]);
      setAgents(agRows);
      setAgences(agenceRes.data ?? []);
    } catch { toast.error('Erreur lors du chargement'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadUsers = useCallback(async (currentAgentId?: number) => {
    try {
      const rows = await userService.getAllUsers();
      const usedIds = new Set(agents.filter((a) => a.id !== currentAgentId).map((a) => a.utilisateurId));
      setAvailableUsers(rows.filter((u: any) => !usedIds.has(u.id)));
    } catch { /* silently fail */ }
  }, [agents]);

  const filtered = useMemo(() =>
    agents.filter((a) => {
      const u = a.utilisateur;
      if (filterAgence !== 'all') {
        const agId = u?.agenceId ?? u?.agence?.id;
        if (String(agId) !== filterAgence) return false;
      }
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (a.matricule ?? '').toLowerCase().includes(q) ||
        (a.secteur ?? '').toLowerCase().includes(q) ||
        (u ? `${u.prenom} ${u.nom}`.toLowerCase().includes(q) : false)
      );
    }),
    [agents, search, filterAgence]
  );

  const { paginated, ...pagination } = usePagination(filtered, 15);

  const stats = useMemo(() => ({
    total: agents.length,
    enligne: agents.filter((a) => isOnline(a.dernierePositionAt)).length,
  }), [agents]);

  const openCreate = async () => {
    setForm(EMPTY);
    setErrors({});
    await loadUsers();
    setModal('create');
  };

  const openEdit = (a: any) => {
    setForm({ utilisateurId: String(a.utilisateurId), matricule: a.matricule ?? '', secteur: a.secteur ?? '' });
    setErrors({});
    setModal({ id: a.id });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrors = validateForm(form, modal === 'create');
    if (fieldErrors) { setErrors(fieldErrors); toast.error(Object.values(fieldErrors)[0]); return; }
    setErrors({});
    setSaving(true);
    try {
      if (modal === 'create') {
        await agentService.create({
          utilisateur_id: Number(form.utilisateurId),
          matricule: form.matricule.trim(),
          secteur: form.secteur.trim() || undefined,
        });
        toast.success('Profil agent créé');
      } else if (modal && typeof modal === 'object') {
        await agentService.update(modal.id, { matricule: form.matricule.trim(), secteur: form.secteur.trim() });
        toast.success('Profil agent mis à jour');
      }
      setModal(null);
      await load();
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await agentService.remove(id);
      setAgents((prev) => prev.filter((x) => x.id !== id));
      toast.success('Profil agent supprimé');
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Impossible de supprimer'); }
    setConfirmId(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Agents Terrain</h1>
          <p className="text-sm text-muted-foreground">
            {stats.total} agent{stats.total > 1 ? 's' : ''} — <span className="text-emerald-600 font-semibold">{stats.enligne} en ligne</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /></Button>
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Nouvel agent
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Nom, matricule, secteur…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterAgence} onValueChange={setFilterAgence}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Toutes les agences" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les agences</SelectItem>
            {agences.map((ag) => <SelectItem key={ag.id} value={String(ag.id)}>{ag.nom}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-2 sm:px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap text-left">Agent</th>
                <th className="px-2 sm:px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap text-left hidden sm:table-cell">Équipe</th>
                <th className="px-2 sm:px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap text-left hidden md:table-cell">Agence</th>
                <th className="px-2 sm:px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap text-left hidden lg:table-cell">Secteur</th>
                <th className="px-2 sm:px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap text-left hidden sm:table-cell">Statut GPS</th>
                <th className="px-2 sm:px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="py-16 text-center text-muted-foreground text-sm">Chargement…</td></tr>
              ) : paginated.map((a) => {
                const u = a.utilisateur;
                const online = isOnline(a.dernierePositionAt);
                return (
                  <tr key={a.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => router.push(`/dashboard/collecte/agents/${a.id}`)}>
                    <td className="px-2 sm:px-4 py-3">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs shrink-0">
                          {u ? `${u.prenom?.[0] ?? ''}${u.nom?.[0] ?? ''}` : '?'}
                        </div>
                        <div className="hidden sm:block">
                          <p className="font-semibold text-sm">{u ? `${u.prenom} ${u.nom}` : '—'}</p>
                          <p className="text-[11px] font-mono text-muted-foreground">{a.matricule}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-muted-foreground hidden sm:table-cell">{u?.equipe?.nom ?? '—'}</td>
                    <td className="px-2 sm:px-4 py-3 text-xs sm:text-sm text-muted-foreground hidden md:table-cell">{u?.agence?.nom ?? '—'}</td>
                    <td className="px-2 sm:px-4 py-3 text-xs hidden lg:table-cell">
                      {a.secteur
                        ? <span className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{a.secteur}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2 sm:px-4 py-3 hidden sm:table-cell">
                      <div className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold', online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                        {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                        {online ? 'En ligne' : 'Hors ligne'}
                      </div>
                      {a.dernierePositionAt && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(a.dernierePositionAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {confirmId === a.id ? (
                          <>
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleDelete(a.id)}>
                              <Check className="mr-1 h-3 w-3" /> Confirmer
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setConfirmId(null)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmId(a.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <div className="py-16 text-center text-muted-foreground text-sm">Aucun agent trouvé.</div>
          )}
        </div>
      </Card>
      <TablePagination {...pagination} />

      {/* Modal Create/Edit */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="font-bold">{modal === 'create' ? 'Nouvel agent' : "Modifier l'agent"}</h2>
              <Button variant="ghost" size="icon" onClick={() => setModal(null)}><X className="h-4 w-4" /></Button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {modal === 'create' && (
                <div className="space-y-2">
                  <Label>Utilisateur <span className="text-red-500">*</span></Label>
                  <Select value={form.utilisateurId} onValueChange={(v) => setForm({ ...form, utilisateurId: v })}>
                    <SelectTrigger><SelectValue placeholder="Choisir un utilisateur" /></SelectTrigger>
                    <SelectContent>
                      {availableUsers.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.prenom} {u.nom} — {u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.utilisateurId && <p className="text-xs text-red-500">{errors.utilisateurId}</p>}
                </div>
              )}
              <div className="space-y-2">
                <Label>Matricule <span className="text-red-500">*</span></Label>
                <Input value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} placeholder="ex: AGT-004" />
                {errors.matricule && <p className="text-xs text-red-500">{errors.matricule}</p>}
              </div>
              <div className="space-y-2">
                <Label>Secteur / Zone</Label>
                <Input value={form.secteur} onChange={(e) => setForm({ ...form, secteur: e.target.value })} placeholder="ex: Zone Akwa-Nord" />
                {errors.secteur && <p className="text-xs text-red-500">{errors.secteur}</p>}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setModal(null)}>Annuler</Button>
                <Button type="submit" variant="brand" loading={saving}>Enregistrer</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
