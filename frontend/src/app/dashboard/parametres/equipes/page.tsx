'use client';

import { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/table-pagination';
import { equipeService } from '@/services/equipeService';
import { agenceService } from '@/services/agenceService';
import { userService } from '@/services/userService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, X, Check, UsersRound, Building2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Form = { nom: string; agenceId: string; responsableId: string };
const EMPTY: Form = { nom: '', agenceId: '', responsableId: '' };

const equipeSchema = z.object({
  nom: z.string().trim().min(1, "Nom de l'équipe requis").max(150, 'Maximum 150 caractères'),
  agenceId: z.string().trim().min(1, 'Agence requise'),
  responsableId: z.string().optional(),
});

function validateForm(form: Form): Record<string, string> | null {
  const result = equipeSchema.safeParse(form);
  if (result.success) return null;
  const errors: Record<string, string> = {};
  result.error.issues.forEach((issue) => { errors[String(issue.path[0])] = issue.message; });
  return errors;
}

export default function EquipesPage() {
  const { canEditParametres } = useAuth();
  const [equipes, setEquipes] = useState<any[]>([]);
  const [agences, setAgences] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<'create' | null>(null);
  const [drawer, setDrawer] = useState<any | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eqRes, agRes, usrRes] = await Promise.all([
        equipeService.getEquipes({ per_page: 100 }),
        agenceService.getAgences({ per_page: 100 }),
        userService.getUsers({ per_page: 100 }),
      ]);
      setEquipes(eqRes.data ?? []);
      setAgences(agRes.data ?? []);
      // Un responsable d'équipe peut être un manager (chef d'agence), un admin, ou un chef d'équipe (backoffice).
      setManagers((usrRes.data ?? []).filter((u: any) => {
        const slug = typeof u.role === 'string' ? u.role : u.role?.slug ?? '';
        return slug === 'manager' || slug === 'admin' || slug === 'backoffice';
      }));
    } catch { toast.error('Erreur lors du chargement'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { paginated, ...pagination } = usePagination(equipes, 15);

  const openDrawer = (eq: any) => {
    setDrawer(eq); setEditMode(false); setErrors({});
    setForm({
      nom: eq.nom,
      agenceId: String(eq.agenceId ?? eq.agence?.id ?? ''),
      responsableId: String(eq.responsableId ?? eq.responsable?.id ?? ''),
    });
  };
  const closeDrawer = () => { setDrawer(null); setEditMode(false); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrors = validateForm(form);
    if (fieldErrors) { setErrors(fieldErrors); toast.error(Object.values(fieldErrors)[0]); return; }
    setErrors({});
    setSaving(true);
    try {
      await equipeService.create({
        nom: form.nom,
        agence_id: Number(form.agenceId),
        responsable_id: form.responsableId ? Number(form.responsableId) : undefined,
      });
      toast.success(`Équipe "${form.nom}" créée`);
      setModal(null);
      await load();
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Erreur lors de la création'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawer) return;
    const fieldErrors = validateForm(form);
    if (fieldErrors) { setErrors(fieldErrors); toast.error(Object.values(fieldErrors)[0]); return; }
    setErrors({});
    setSaving(true);
    try {
      await equipeService.update(drawer.id, {
        nom: form.nom,
        agence_id: Number(form.agenceId),
        responsable_id: form.responsableId ? Number(form.responsableId) : null,
      });
      toast.success('Équipe mise à jour');
      await load();
      closeDrawer();
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await equipeService.remove(id);
      setEquipes((prev) => prev.filter((x) => x.id !== id));
      toast.success('Équipe supprimée');
      setConfirmId(null);
      if (drawer?.id === id) closeDrawer();
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Impossible de supprimer cette équipe'); }
  };

  const FormFields = () => (
    <>
      <div className="space-y-1.5">
        <Label>Nom de l'équipe *</Label>
        <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="ex: Équipe Akwa" />
        {errors.nom && <p className="text-xs text-red-500">{errors.nom}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Agence rattachée *</Label>
        <Select value={form.agenceId} onValueChange={(v) => setForm({ ...form, agenceId: v })}>
          <SelectTrigger><SelectValue placeholder="Choisir une agence" /></SelectTrigger>
          <SelectContent>{agences.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.nom}</SelectItem>)}</SelectContent>
        </Select>
        {errors.agenceId && <p className="text-xs text-red-500">{errors.agenceId}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Responsable</Label>
        <Select value={form.responsableId || '__none__'} onValueChange={(v) => setForm({ ...form, responsableId: v === '__none__' ? '' : v })}>
          <SelectTrigger><SelectValue placeholder="Choisir un responsable" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Aucun</SelectItem>
            {managers.map((u) => {
              const slug = typeof u.role === 'string' ? u.role : u.role?.slug ?? '';
              const roleLabel = slug === 'manager' ? 'Manager' : slug === 'admin' ? 'Admin' : slug === 'backoffice' ? "Chef d'équipe" : slug;
              return <SelectItem key={u.id} value={String(u.id)}>{u.prenom} {u.nom} — {roleLabel}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Équipes</h1>
          <p className="text-sm text-muted-foreground">{equipes.length} équipe{equipes.length !== 1 ? 's' : ''} configurée{equipes.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="w-full sm:w-auto"><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /></Button>
          {canEditParametres && (
            <Button variant="brand" size="sm" onClick={() => { setForm(EMPTY); setErrors({}); setModal('create'); }} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" /> Nouvelle équipe
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {['Équipe', 'Agence', 'Responsable', 'Membres', 'Actions'].map((h) => (
                  <th key={h} className={cn('px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider', h === 'Actions' ? 'text-right' : 'text-left')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="py-16 text-center text-muted-foreground text-sm">Chargement…</td></tr>
              ) : paginated.map((eq) => {
                const resp = eq.responsable ?? managers.find((u) => u.id === eq.responsableId);
                const membreCount = eq.nb_membres ?? eq._count?.membres ?? eq.membres?.length ?? 0;
                return (
                  <tr key={eq.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => openDrawer(eq)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                          <UsersRound className="h-4 w-4 text-emerald-600" />
                        </div>
                        <p className="font-semibold">{eq.nom}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{eq.agence?.nom ?? agences.find((a) => a.id === eq.agenceId)?.nom ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{resp ? `${resp.prenom} ${resp.nom}` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-muted text-muted-foreground">
                        {membreCount} membre{membreCount !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {canEditParametres && (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { openDrawer(eq); setEditMode(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                          {confirmId === eq.id ? (
                            <>
                              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleDelete(eq.id)}>
                                <Check className="mr-1 h-3 w-3" /> Confirmer
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setConfirmId(null)}><X className="h-3 w-3" /></Button>
                            </>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmId(eq.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && equipes.length === 0 && <div className="py-14 text-center text-sm text-muted-foreground">Aucune équipe créée.</div>}
        </div>
      </Card>
      <TablePagination {...pagination} />

      {/* Drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={closeDrawer} />
          <div className="w-full sm:w-[420px] bg-background shadow-2xl border-l flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <UsersRound className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="font-bold">{drawer.nom}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3 inline" /> {drawer.agence?.nom ?? agences.find((a) => a.id === drawer.agenceId)?.nom ?? '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!editMode && canEditParametres && <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditMode(true)}><Pencil className="h-3 w-3" /> Éditer</Button>}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={closeDrawer}><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {!editMode ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ['Nom', drawer.nom],
                      ['Agence', drawer.agence?.nom ?? agences.find((a) => a.id === drawer.agenceId)?.nom ?? '—'],
                      ['Responsable', drawer.responsable
                        ? `${drawer.responsable.prenom} ${drawer.responsable.nom}`
                        : managers.find((u) => u.id === drawer.responsableId)
                          ? `${managers.find((u) => u.id === drawer.responsableId)!.prenom} ${managers.find((u) => u.id === drawer.responsableId)!.nom}`
                          : '—'],
                    ].map(([l, v]) => (
                      <div key={l}><p className="text-[10px] text-muted-foreground font-medium uppercase">{l}</p><p className="font-semibold mt-0.5">{v}</p></div>
                    ))}
                  </div>
                  {drawer.membres?.length > 0 && (
                    <div className="border-t pt-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                        Membres ({drawer.membres.length})
                      </p>
                      <div className="space-y-1.5">
                        {drawer.membres.map((u: any) => (
                          <div key={u.id} className="flex items-center gap-2.5 p-2 rounded bg-muted/40">
                            <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-[10px] shrink-0">
                              {u.prenom?.[0]}{u.nom?.[0]}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold">{u.prenom} {u.nom}</p>
                              <p className="text-[10px] text-muted-foreground">{u.fonction || u.role}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleUpdate} className="space-y-4">
                  {FormFields()}
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditMode(false)}>Annuler</Button>
                    <Button type="submit" variant="brand" size="sm" loading={saving}>Enregistrer</Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal création */}
      {modal === 'create' && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-[calc(100vw-2rem)] sm:max-w-md my-4">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="font-bold">Nouvelle équipe</h2>
              <Button variant="ghost" size="icon" onClick={() => setModal(null)}><X className="h-4 w-4" /></Button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              {FormFields()}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setModal(null)}>Annuler</Button>
                <Button type="submit" variant="brand" loading={saving}>Créer</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
