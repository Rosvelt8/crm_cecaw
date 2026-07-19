'use client';

import { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/table-pagination';
import { produitService } from '@/services/produitService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2, X, Check, Eye, Layers, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const COULEURS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#f97316'];

type Form = { nom: string; description: string; couleur: string };
const EMPTY: Form = { nom: '', description: '', couleur: '#10b981' };

const groupeSchema = z.object({
  nom: z.string().trim().min(1, 'Le nom est requis').max(100, 'Maximum 100 caractères'),
  description: z.string().trim().max(255, 'Maximum 255 caractères').optional().or(z.literal('')),
  couleur: z.string().trim().min(1),
});

function validateForm(form: Form): Record<string, string> | null {
  const result = groupeSchema.safeParse(form);
  if (result.success) return null;
  const errors: Record<string, string> = {};
  result.error.issues.forEach((issue) => { errors[String(issue.path[0])] = issue.message; });
  return errors;
}

export default function GroupesPage() {
  const { canEditParametres } = useAuth();
  const [groupes, setGroupes] = useState<any[]>([]);
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
      const res = await produitService.getGroupesProduits();
      setGroupes(res.data ?? []);
    } catch { toast.error('Erreur lors du chargement'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { paginated, ...pagination } = usePagination(groupes, 15);

  const openDrawer = (g: any) => {
    setDrawer(g); setEditMode(false); setErrors({});
    setForm({ nom: g.nom, description: g.description ?? '', couleur: g.couleur ?? '#10b981' });
  };
  const closeDrawer = () => { setDrawer(null); setEditMode(false); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrors = validateForm(form);
    if (fieldErrors) { setErrors(fieldErrors); toast.error(Object.values(fieldErrors)[0]); return; }
    setErrors({});
    setSaving(true);
    try {
      await produitService.createGroupeProduit({ nom: form.nom, description: form.description, couleur: form.couleur });
      toast.success(`Groupe "${form.nom}" créé`);
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
      await produitService.updateGroupeProduit(drawer.id, { nom: form.nom, description: form.description, couleur: form.couleur });
      toast.success('Groupe mis à jour');
      await load();
      closeDrawer();
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await produitService.deleteGroupeProduit(id);
      setGroupes((prev) => prev.filter((x) => x.id !== id));
      toast.success('Groupe supprimé');
      setConfirmId(null);
      if (drawer?.id === id) closeDrawer();
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Impossible de supprimer ce groupe'); }
  };

  const ColorPicker = () => (
    <div className="flex gap-2 flex-wrap">
      {COULEURS.map((c) => (
        <button key={c} type="button" onClick={() => setForm({ ...form, couleur: c })}
          className={cn('h-7 w-7 rounded-full border-2 transition-transform', form.couleur === c ? 'border-foreground scale-110' : 'border-transparent')}
          style={{ backgroundColor: c }} />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Groupes de Produits</h1>
          <p className="text-sm text-muted-foreground">{groupes.length} groupe{groupes.length !== 1 ? 's' : ''} défini{groupes.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="w-full sm:w-auto"><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /></Button>
          {canEditParametres && (
            <Button variant="brand" size="sm" onClick={() => { setForm(EMPTY); setErrors({}); setModal('create'); }} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" /> Nouveau groupe
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {['', 'Nom', 'Description', 'Produits', 'Actions'].map((h, i) => (
                  <th key={i} className={cn('px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider', h === 'Actions' ? 'text-right' : 'text-left')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="py-16 text-center text-muted-foreground text-sm">Chargement…</td></tr>
              ) : paginated.map((g) => {
                const count = g._count?.produits ?? g.produits?.length ?? 0;
                const couleur = g.couleur ?? '#888';
                return (
                  <tr key={g.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => openDrawer(g)}>
                    <td className="px-4 py-3 w-10">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: couleur + '22' }}>
                        <Layers className="h-4 w-4" style={{ color: couleur }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold">{g.nom}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{g.description || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-muted text-muted-foreground">
                        {count} produit{count !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDrawer(g)}><Eye className="h-3.5 w-3.5" /></Button>
                        {canEditParametres && (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { openDrawer(g); setEditMode(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                            {confirmId === g.id ? (
                              <>
                                <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleDelete(g.id)}>
                                  <Check className="mr-1 h-3 w-3" /> Confirmer
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setConfirmId(null)}><X className="h-3 w-3" /></Button>
                              </>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmId(g.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && groupes.length === 0 && <div className="py-14 text-center text-sm text-muted-foreground">Aucun groupe créé.</div>}
        </div>
      </Card>
      <TablePagination {...pagination} />

      {/* Drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={closeDrawer} />
          <div className="w-full sm:w-[400px] bg-background shadow-2xl border-l flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: (drawer.couleur ?? '#888') + '22' }}>
                  <Layers className="h-4 w-4" style={{ color: drawer.couleur ?? '#888' }} />
                </div>
                <p className="font-bold">{drawer.nom}</p>
              </div>
              <div className="flex items-center gap-1">
                {!editMode && canEditParametres && <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditMode(true)}><Pencil className="h-3 w-3" /> Éditer</Button>}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={closeDrawer}><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {!editMode ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-3 text-sm">
                    {[['Nom', drawer.nom], ['Description', drawer.description || '—']].map(([l, v]) => (
                      <div key={l}><p className="text-[10px] text-muted-foreground font-medium uppercase">{l}</p><p className="font-semibold mt-0.5">{v}</p></div>
                    ))}
                    {drawer.couleur && (
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase">Couleur</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="h-5 w-5 rounded-full border" style={{ backgroundColor: drawer.couleur }} />
                          <span className="text-xs font-mono">{drawer.couleur}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {drawer.produits?.length > 0 && (
                    <div className="border-t pt-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Produits associés</p>
                      <div className="space-y-1.5">
                        {drawer.produits.map((p: any) => (
                          <div key={p.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/40">
                            <span className="font-medium">{p.nom}</span>
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', p.actif ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                              {p.actif ? 'Actif' : 'Inactif'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleUpdate} className="space-y-4">
                  <div className="space-y-1.5"><Label className="text-xs">Nom *</Label><Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />{errors.nom && <p className="text-xs text-red-500">{errors.nom}</p>}</div>
                  <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />{errors.description && <p className="text-xs text-red-500">{errors.description}</p>}</div>
                  <div className="space-y-1.5"><Label className="text-xs">Couleur</Label><ColorPicker /></div>
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
              <h2 className="font-bold">Nouveau groupe</h2>
              <Button variant="ghost" size="icon" onClick={() => setModal(null)}><X className="h-4 w-4" /></Button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="space-y-1.5"><Label className="text-xs">Nom *</Label><Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="ex: Épargne" />{errors.nom && <p className="text-xs text-red-500">{errors.nom}</p>}</div>
              <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />{errors.description && <p className="text-xs text-red-500">{errors.description}</p>}</div>
              <div className="space-y-1.5"><Label className="text-xs">Couleur</Label><ColorPicker /></div>
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
