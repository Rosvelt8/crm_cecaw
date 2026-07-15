'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { z } from 'zod';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/table-pagination';
import { produitService } from '@/services/produitService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, X, Check, Search, Eye, Package, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Form = { nom: string; groupeId: string; description: string; actif: boolean };
const EMPTY: Form = { nom: '', groupeId: '', description: '', actif: true };

const produitSchema = z.object({
  nom: z.string().trim().min(1, 'Nom requis').max(200, 'Maximum 200 caractères'),
  groupeId: z.string().trim().min(1, 'Groupe requis'),
  description: z.string().trim().max(500, 'Maximum 500 caractères').optional().or(z.literal('')),
  actif: z.boolean(),
});

function validateForm(form: Form): Record<string, string> | null {
  const result = produitSchema.safeParse(form);
  if (result.success) return null;
  const errors: Record<string, string> = {};
  result.error.issues.forEach((issue) => { errors[String(issue.path[0])] = issue.message; });
  return errors;
}

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <button type="button" onClick={onChange}
    className={cn('h-5 w-9 rounded-full relative transition-colors', checked ? 'bg-brand-600' : 'bg-muted')}>
    <div className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
  </button>
);

export default function ProduitsPage() {
  const [produits, setProduits] = useState<any[]>([]);
  const [groupes, setGroupes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterGroupe, setFilterGroupe] = useState('all');
  const [modal, setModal] = useState<'create' | null>(null);
  const [drawer, setDrawer] = useState<any | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prRes, grRes] = await Promise.all([
        produitService.getProduits(),
        produitService.getGroupesProduits(),
      ]);
      setProduits(prRes.data ?? []);
      setGroupes(grRes.data ?? []);
    } catch { toast.error('Erreur lors du chargement'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    produits.filter((p) => {
      const q = search.toLowerCase();
      return (!q || `${p.nom} ${p.description ?? ''}`.toLowerCase().includes(q))
        && (filterGroupe === 'all' || String(p.groupeId) === filterGroupe);
    }), [produits, search, filterGroupe]
  );

  const { paginated, ...pagination } = usePagination(filtered, 15);

  const getGroupe = (id: number | string) => groupes.find((g) => g.id === id || String(g.id) === String(id));

  const openDrawer = (p: any) => {
    setDrawer(p); setEditMode(false); setErrors({});
    setForm({ nom: p.nom, groupeId: String(p.groupeId), description: p.description ?? '', actif: p.actif ?? true });
  };
  const closeDrawer = () => { setDrawer(null); setEditMode(false); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrors = validateForm(form);
    if (fieldErrors) { setErrors(fieldErrors); toast.error(Object.values(fieldErrors)[0]); return; }
    setErrors({});
    setSaving(true);
    try {
      await produitService.createProduit({ nom: form.nom, groupe_id: Number(form.groupeId), description: form.description, actif: form.actif });
      toast.success(`Produit "${form.nom}" créé`);
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
      await produitService.updateProduit(drawer.id, { nom: form.nom, groupe_id: Number(form.groupeId), description: form.description, actif: form.actif });
      toast.success('Produit mis à jour');
      await load();
      closeDrawer();
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await produitService.deleteProduit(id);
      setProduits((prev) => prev.filter((x) => x.id !== id));
      toast.success('Produit supprimé');
      setConfirmId(null);
      if (drawer?.id === id) closeDrawer();
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Impossible de supprimer ce produit'); }
  };

  const toggleActif = async (p: any) => {
    try {
      await produitService.updateProduit(p.id, { actif: !p.actif });
      setProduits((prev) => prev.map((x) => x.id === p.id ? { ...x, actif: !p.actif } : x));
      if (drawer?.id === p.id) setDrawer({ ...drawer, actif: !p.actif });
      toast.success(`Produit ${!p.actif ? 'activé' : 'désactivé'}`);
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Erreur'); }
  };

  const FormFields = ({ compact = false }) => (
    <>
      <div className="space-y-1.5">
        <Label className={compact ? 'text-xs' : ''}>Nom *</Label>
        <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="ex: Dépôt à Terme" />
        {errors.nom && <p className="text-xs text-red-500">{errors.nom}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className={compact ? 'text-xs' : ''}>Groupe *</Label>
        <Select value={form.groupeId} onValueChange={(v) => setForm({ ...form, groupeId: v })}>
          <SelectTrigger><SelectValue placeholder="Choisir un groupe" /></SelectTrigger>
          <SelectContent>{groupes.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.nom}</SelectItem>)}</SelectContent>
        </Select>
        {errors.groupeId && <p className="text-xs text-red-500">{errors.groupeId}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className={compact ? 'text-xs' : ''}>Description</Label>
        <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description courte" />
        {errors.description && <p className="text-xs text-red-500">{errors.description}</p>}
      </div>
      <div className="flex items-center gap-3">
        <Label className={compact ? 'text-xs' : ''}>Actif</Label>
        <Toggle checked={form.actif} onChange={() => setForm({ ...form, actif: !form.actif })} />
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produits</h1>
          <p className="text-sm text-muted-foreground">{produits.length} produit{produits.length !== 1 ? 's' : ''} au catalogue</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="w-full sm:w-auto"><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /></Button>
          <Button variant="brand" size="sm" onClick={() => { setForm(EMPTY); setErrors({}); setModal('create'); }} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Nouveau produit
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Nom, description…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterGroupe} onValueChange={setFilterGroupe}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Tous les groupes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les groupes</SelectItem>
            {groupes.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.nom}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {['', 'Produit', 'Groupe', 'Description', 'Statut', 'Actions'].map((h, i) => (
                  <th key={i} className={cn('px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider', h === 'Actions' ? 'text-right' : 'text-left')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="py-16 text-center text-muted-foreground text-sm">Chargement…</td></tr>
              ) : paginated.map((p) => {
                const groupe = p.groupe ?? getGroupe(p.groupeId);
                const couleur = groupe?.couleur ?? '#888';
                return (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => openDrawer(p)}>
                    <td className="px-4 py-3 w-10">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: couleur + '22' }}>
                        <Package className="h-4 w-4" style={{ color: couleur }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold">{p.nom}</td>
                    <td className="px-4 py-3">
                      {groupe && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: groupe.couleur ?? '#888' }} />
                          {groupe.nom}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.description || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold',
                        p.actif ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                        {p.actif ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDrawer(p)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => toggleActif(p)}>
                          {p.actif ? 'Désactiver' : 'Activer'}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { openDrawer(p); setEditMode(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        {confirmId === p.id ? (
                          <>
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleDelete(p.id)}>
                              <Check className="mr-1 h-3 w-3" /> Confirmer
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setConfirmId(null)}><X className="h-3 w-3" /></Button>
                          </>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmId(p.id)}>
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
          {!loading && filtered.length === 0 && <div className="py-14 text-center text-sm text-muted-foreground">Aucun produit trouvé.</div>}
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
                <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: ((drawer.groupe ?? getGroupe(drawer.groupeId))?.couleur ?? '#888') + '22' }}>
                  <Package className="h-4 w-4" style={{ color: (drawer.groupe ?? getGroupe(drawer.groupeId))?.couleur ?? '#888' }} />
                </div>
                <div>
                  <p className="font-bold">{drawer.nom}</p>
                  <p className="text-[10px] text-muted-foreground">{(drawer.groupe ?? getGroupe(drawer.groupeId))?.nom ?? '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!editMode && <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditMode(true)}><Pencil className="h-3 w-3" /> Éditer</Button>}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={closeDrawer}><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {!editMode ? (
                <div className="space-y-3 text-sm">
                  {[['Nom', drawer.nom], ['Groupe', (drawer.groupe ?? getGroupe(drawer.groupeId))?.nom ?? '—'], ['Description', drawer.description || '—']].map(([l, v]) => (
                    <div key={l}><p className="text-[10px] text-muted-foreground font-medium uppercase">{l}</p><p className="font-semibold mt-0.5">{v}</p></div>
                  ))}
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase">Statut</p>
                    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold mt-1',
                      drawer.actif ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                      {drawer.actif ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                  <div className="pt-3 border-t">
                    <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => toggleActif(drawer)}>
                      {drawer.actif ? 'Désactiver le produit' : 'Activer le produit'}
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleUpdate} className="space-y-4">
                  {FormFields({ compact: true })}
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
              <h2 className="font-bold">Nouveau produit</h2>
              <Button variant="ghost" size="icon" onClick={() => setModal(null)}><X className="h-4 w-4" /></Button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              {FormFields({})}
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
