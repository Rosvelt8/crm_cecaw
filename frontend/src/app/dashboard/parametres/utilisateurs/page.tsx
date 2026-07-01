'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/table-pagination';
import { userService } from '@/services/userService';
import { agenceService } from '@/services/agenceService';
import { equipeService } from '@/services/equipeService';
import type { User, BackendRole } from '@/types/user';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, X, Check, Search, KeyRound, ShieldCheck, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ROLE_LABELS: Record<BackendRole, string> = {
  admin: 'Administrateur', manager: 'Manager', backoffice: 'Back-office', agent: 'Agent terrain',
};
const ROLE_COLORS: Record<BackendRole, string> = {
  admin: 'bg-red-100 text-red-700', manager: 'bg-violet-100 text-violet-700',
  backoffice: 'bg-blue-100 text-blue-700', agent: 'bg-emerald-100 text-emerald-700',
};

type Form = { nom: string; prenom: string; email: string; role: BackendRole; fonction: string; agenceId: string; equipeId: string; actif: boolean };
const EMPTY: Form = { nom: '', prenom: '', email: '', role: 'agent', fonction: '', agenceId: '', equipeId: '', actif: true };

function initials(p: string, n: string) { return `${p?.[0] ?? ''}${n?.[0] ?? ''}`.toUpperCase() || '?'; }
function roleSlug(u: User): BackendRole { return (u.roleString ?? u.role?.slug ?? 'agent') as BackendRole; }

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange}
      className={cn('h-5 w-9 rounded-full relative transition-colors', checked ? 'bg-brand-600' : 'bg-muted')}>
      <div className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  );
}

export default function UtilisateursPage() {
  const [utilisateurs, setUtilisateurs] = useState<User[]>([]);
  const [agences, setAgences] = useState<any[]>([]);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch]               = useState('');
  const [filterRole, setFilterRole]       = useState('all');
  const [filterAgence, setFilterAgence]   = useState('all');

  const [drawer, setDrawer]       = useState<User | null>(null);
  const [editMode, setEditMode]   = useState(false);
  const [form, setForm]           = useState<Form>(EMPTY);
  const [modal, setModal]         = useState<'create' | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [saving, setSaving]       = useState(false);
  const [pwdModal, setPwdModal]   = useState<User | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [usrRes, agRes, eqRes] = await Promise.all([
        userService.getUsers({ per_page: 200 }),
        agenceService.getAgences({ per_page: 100 }),
        equipeService.getEquipes({ per_page: 100 }),
      ]);
      setUtilisateurs(usrRes.data ?? []);
      setAgences(agRes.data ?? []);
      setEquipes(eqRes.data ?? []);
    } catch {
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filtered = useMemo(() =>
    utilisateurs.filter((u) => {
      const q = search.toLowerCase();
      const slug = roleSlug(u);
      return (!q || `${u.prenom} ${u.nom} ${u.email} ${u.fonction ?? ''}`.toLowerCase().includes(q))
        && (filterRole   === 'all' || slug === filterRole)
        && (filterAgence === 'all' || String(u.agence_id ?? u.agence?.id ?? '') === filterAgence);
    }),
    [utilisateurs, search, filterRole, filterAgence]
  );

  const { paginated, ...pagination } = usePagination(filtered, 10);

  const equipesForAgence = (agenceId: string) =>
    agenceId ? equipes.filter((e) => String(e.agence_id ?? e.agence?.id ?? '') === agenceId) : equipes;

  const getAgenceNom = (u: User) => u.agence?.nom ?? '—';
  const getEquipeNom = (u: User) => u.equipe?.nom ?? '';

  const openDrawer = (u: User) => {
    setDrawer(u);
    setEditMode(false);
    setForm({
      nom: u.nom, prenom: u.prenom, email: u.email, role: roleSlug(u),
      fonction: u.fonction ?? '', actif: u.actif ?? true,
      agenceId: String(u.agence_id ?? u.agence?.id ?? ''),
      equipeId: String(u.equipe_id ?? u.equipe?.id ?? ''),
    });
  };
  const closeDrawer = () => { setDrawer(null); setEditMode(false); };

  const openCreate = () => { setForm(EMPTY); setModal('create'); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom.trim() || !form.prenom.trim() || !form.email.trim()) {
      toast.error('Nom, prénom et email requis'); return;
    }
    setSaving(true);
    try {
      await userService.create({
        nom: form.nom, prenom: form.prenom, email: form.email,
        role: form.role, fonction: form.fonction || undefined,
        agence_id: Number(form.agenceId) || 0,
        equipe_id: form.equipeId ? Number(form.equipeId) : undefined,
        actif: form.actif,
      });
      toast.success(`Utilisateur ${form.prenom} ${form.nom} créé`);
      setModal(null);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawer) return;
    if (!form.nom.trim() || !form.prenom.trim() || !form.email.trim()) {
      toast.error('Nom, prénom et email requis'); return;
    }
    setSaving(true);
    try {
      const updated = await userService.update(drawer.id, {
        id: drawer.id,
        nom: form.nom, prenom: form.prenom, email: form.email,
        role: form.role, fonction: form.fonction || undefined,
        agence_id: Number(form.agenceId) || undefined,
        equipe_id: form.equipeId ? Number(form.equipeId) : undefined,
        actif: form.actif,
      });
      toast.success('Utilisateur mis à jour');
      setDrawer(updated);
      setEditMode(false);
      await loadAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await userService.remove(id);
      toast.success('Utilisateur supprimé');
      setConfirmId(null);
      if (drawer?.id === id) closeDrawer();
      await loadAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la suppression');
    }
  };

  const toggleActif = async (u: User) => {
    try {
      await userService.toggle(u.id);
      toast.success(`Accès ${u.actif ? 'suspendu' : 'réactivé'}`);
      if (drawer?.id === u.id) setDrawer({ ...drawer, actif: !u.actif });
      await loadAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur');
    }
  };

  const handleResetPwd = async (u: User) => {
    try {
      await userService.resetPassword(u.id);
      toast.success(`Mot de passe de ${u.prenom} ${u.nom} réinitialisé`);
      setPwdModal(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la réinitialisation');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground">{utilisateurs.length} comptes enregistrés</p>
        </div>
        <Button variant="brand" size="sm" onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" /> Nouvel utilisateur
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 w-full sm:min-w-[200px] sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Nom, email, fonction…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterAgence} onValueChange={setFilterAgence}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Toutes les agences" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les agences</SelectItem>
            {agences.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Tous les rôles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les rôles</SelectItem>
            {(Object.keys(ROLE_LABELS) as BackendRole[]).map((r) => (
              <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && <div className="py-16 text-center text-sm text-muted-foreground">Chargement…</div>}

      {/* Tableau */}
      {!loading && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {['Utilisateur', 'Email', 'Rôle', 'Fonction', 'Agence / Équipe', 'Statut', 'Actions'].map((h) => (
                    <th key={h} className={cn('px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider',
                      h === 'Actions' ? 'text-right' : 'text-left')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((u) => {
                  const slug = roleSlug(u);
                  return (
                    <tr key={u.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => openDrawer(u)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs shrink-0">
                            {initials(u.prenom, u.nom)}
                          </div>
                          <div>
                            <p className="font-semibold">{u.prenom} {u.nom}</p>
                            <p className="text-[10px] font-mono text-muted-foreground">#{u.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold', ROLE_COLORS[slug] ?? 'bg-muted text-muted-foreground')}>
                          {ROLE_LABELS[slug] ?? slug}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{u.fonction || '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <p>{getAgenceNom(u)}</p>
                        {u.equipe && <p className="text-[10px]">{getEquipeNom(u)}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold',
                          u.actif ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                          {u.actif ? 'Actif' : 'Suspendu'}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Voir / Éditer" onClick={() => openDrawer(u)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                            title="Réinitialiser MDP" onClick={() => setPwdModal(u)}>
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => toggleActif(u)}>
                            {u.actif ? 'Suspendre' : 'Activer'}
                          </Button>
                          {confirmId === u.id ? (
                            <>
                              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleDelete(u.id)}>
                                <Check className="mr-1 h-3 w-3" /> Confirmer
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setConfirmId(null)}><X className="h-3 w-3" /></Button>
                            </>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmId(u.id)}>
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
            {filtered.length === 0 && <div className="py-14 text-center text-sm text-muted-foreground">Aucun utilisateur trouvé.</div>}
          </div>
        </Card>
      )}
      <TablePagination {...pagination} />

      {/* ── Drawer visualisation / édition ── */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={closeDrawer} />
          <div className="w-full sm:w-[480px] bg-background shadow-2xl border-l flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm shrink-0">
                  {initials(drawer.prenom, drawer.nom)}
                </div>
                <div>
                  <p className="font-bold leading-tight">{drawer.prenom} {drawer.nom}</p>
                  <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold mt-0.5', ROLE_COLORS[roleSlug(drawer)] ?? 'bg-muted text-muted-foreground')}>
                    {ROLE_LABELS[roleSlug(drawer)] ?? roleSlug(drawer)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!editMode && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditMode(true)}>
                    <Pencil className="h-3 w-3" /> Éditer
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={closeDrawer}><X className="h-4 w-4" /></Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {!editMode ? (
                <div className="p-5 space-y-5">
                  <section className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Identité</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        ['Prénom', drawer.prenom],
                        ['Nom', drawer.nom],
                        ['Email', drawer.email],
                        ['Fonction', drawer.fonction || '—'],
                        ['Rôle', ROLE_LABELS[roleSlug(drawer)] ?? roleSlug(drawer)],
                        ['Statut', drawer.actif ? 'Actif' : 'Suspendu'],
                      ].map(([l, v]) => (
                        <div key={l}>
                          <p className="text-[10px] text-muted-foreground font-medium uppercase">{l}</p>
                          <p className="font-semibold mt-0.5">{v}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="border-t" />
                  <section className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Affectation</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        ['Agence', getAgenceNom(drawer)],
                        ['Équipe', getEquipeNom(drawer) || '—'],
                      ].map(([l, v]) => (
                        <div key={l}>
                          <p className="text-[10px] text-muted-foreground font-medium uppercase">{l}</p>
                          <p className="font-semibold mt-0.5">{v}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="border-t" />
                  <section className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actions administrateur</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5"
                        onClick={() => toggleActif(drawer)}>
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {drawer.actif ? "Suspendre l'accès" : "Réactiver l'accès"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50"
                        onClick={() => setPwdModal(drawer)}>
                        <KeyRound className="h-3.5 w-3.5" /> Réinitialiser MDP
                      </Button>
                    </div>
                  </section>
                  <div className="border-t" />
                  <p className="text-[10px] text-muted-foreground">
                    Créé le {new Date(drawer.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              ) : (
                <form onSubmit={handleUpdate} className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Prénom *</Label>
                      <Input value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nom *</Label>
                      <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email *</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fonction</Label>
                    <Input value={form.fonction} onChange={(e) => setForm({ ...form, fonction: e.target.value })} placeholder="ex: Agent de collecte" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Rôle</Label>
                      <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as BackendRole })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ROLE_LABELS) as BackendRole[]).map((r) => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Agence</Label>
                      <Select value={form.agenceId || '__none__'} onValueChange={(v) => setForm({ ...form, agenceId: v === '__none__' ? '' : v, equipeId: '' })}>
                        <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Aucune</SelectItem>
                          {agences.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.nom}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Équipe</Label>
                    <Select value={form.equipeId || '__none__'} onValueChange={(v) => setForm({ ...form, equipeId: v === '__none__' ? '' : v })} disabled={!form.agenceId}>
                      <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Aucune</SelectItem>
                        {equipesForAgence(form.agenceId).map((eq) => <SelectItem key={eq.id} value={String(eq.id)}>{eq.nom}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-xs">Accès actif</Label>
                    <Toggle checked={form.actif} onChange={() => setForm({ ...form, actif: !form.actif })} />
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditMode(false)}>Annuler</Button>
                    <Button type="submit" variant="brand" size="sm" disabled={saving}>Enregistrer</Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal création ── */}
      {modal === 'create' && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-[calc(100vw-2rem)] sm:max-w-lg my-4">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="font-bold">Nouvel utilisateur</h2>
              <Button variant="ghost" size="icon" onClick={() => setModal(null)}><X className="h-4 w-4" /></Button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Prénom *</Label>
                  <Input value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nom *</Label>
                  <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fonction</Label>
                <Input value={form.fonction} onChange={(e) => setForm({ ...form, fonction: e.target.value })} placeholder="ex: Agent de collecte" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Rôle</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as BackendRole })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROLE_LABELS) as BackendRole[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Agence</Label>
                  <Select value={form.agenceId || '__none__'} onValueChange={(v) => setForm({ ...form, agenceId: v === '__none__' ? '' : v, equipeId: '' })}>
                    <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Aucune</SelectItem>
                      {agences.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.nom}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Équipe</Label>
                <Select value={form.equipeId || '__none__'} onValueChange={(v) => setForm({ ...form, equipeId: v === '__none__' ? '' : v })} disabled={!form.agenceId}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Aucune</SelectItem>
                    {equipesForAgence(form.agenceId).map((eq) => <SelectItem key={eq.id} value={String(eq.id)}>{eq.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-700">
                Un mot de passe temporaire sera envoyé à l'adresse email fournie.
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setModal(null)}>Annuler</Button>
                <Button type="submit" variant="brand" disabled={saving}>Créer l'utilisateur</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal réinitialisation MDP ── */}
      {pwdModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-[calc(100vw-2rem)] sm:max-w-md my-4">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="font-bold">Réinitialisation du mot de passe</h2>
                <p className="text-xs text-muted-foreground">{pwdModal.prenom} {pwdModal.nom}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setPwdModal(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg border space-y-1">
                <p className="text-sm text-muted-foreground">
                  Un nouveau mot de passe temporaire sera généré et envoyé à l'adresse de l'utilisateur.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setPwdModal(null)}>Annuler</Button>
                <Button variant="brand" onClick={() => handleResetPwd(pwdModal)}>
                  <KeyRound className="mr-2 h-3.5 w-3.5" /> Réinitialiser
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
