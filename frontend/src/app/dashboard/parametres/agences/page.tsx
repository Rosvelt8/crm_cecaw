'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/table-pagination';
import { agenceService } from '@/services/agenceService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2, X, Check, Eye, Building2, MapPin, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Form = { nom: string; ville: string; adresse: string; telephone: string; email: string };
const EMPTY: Form = { nom: '', ville: '', adresse: '', telephone: '', email: '' };

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <button type="button" onClick={onChange}
    className={cn('h-5 w-9 rounded-full relative transition-colors', checked ? 'bg-brand-600' : 'bg-muted')}>
    <div className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
  </button>
);

export default function AgencesPage() {
  const [agences, setAgences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<'create' | null>(null);
  const [drawer, setDrawer] = useState<any | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await agenceService.getAgences({ per_page: 100 });
      setAgences(res.data ?? []);
    } catch { toast.error('Erreur lors du chargement'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { paginated, ...pagination } = usePagination(agences, 15);

  const openDrawer = (a: any) => {
    setDrawer(a); setEditMode(false);
    setForm({ nom: a.nom, ville: a.ville ?? '', adresse: a.adresse ?? '', telephone: a.telephone ?? '', email: a.email ?? '' });
  };
  const closeDrawer = () => { setDrawer(null); setEditMode(false); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom.trim() || !form.ville.trim()) { toast.error('Nom et ville requis'); return; }
    setSaving(true);
    try {
      await agenceService.create(form);
      toast.success(`Agence "${form.nom}" créée`);
      setModal(null);
      await load();
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Erreur lors de la création'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawer || !form.nom.trim()) { toast.error('Nom requis'); return; }
    setSaving(true);
    try {
      const updated = await agenceService.update(drawer.id, form);
      setAgences((prev) => prev.map((a) => a.id === drawer.id ? { ...a, ...form } : a));
      setDrawer({ ...drawer, ...form });
      setEditMode(false);
      toast.success('Agence mise à jour');
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Erreur'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await agenceService.remove(id);
      setAgences((prev) => prev.filter((a) => a.id !== id));
      toast.success('Agence supprimée');
      setConfirmId(null);
      if (drawer?.id === id) closeDrawer();
    } catch (err: any) { toast.error(err?.response?.data?.message ?? 'Impossible de supprimer cette agence'); }
  };

  const FormFields = () => (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Nom *</Label><Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Agence Akwa" /></div>
        <div className="space-y-1.5"><Label>Ville *</Label><Input value={form.ville} onChange={(e) => setForm({ ...form, ville: e.target.value })} placeholder="Douala" /></div>
      </div>
      <div className="space-y-1.5"><Label>Adresse</Label><Input value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} placeholder="Rue, quartier…" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Téléphone</Label><Input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agences</h1>
          <p className="text-sm text-muted-foreground">{agences.length} agence{agences.length !== 1 ? 's' : ''} dans le réseau</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="w-full sm:w-auto"><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /></Button>
          <Button variant="brand" size="sm" onClick={() => { setForm(EMPTY); setModal('create'); }} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Nouvelle agence
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {['Agence', 'Ville', 'Adresse', 'Téléphone', 'Actions'].map((h) => (
                  <th key={h} className={cn('px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider', h === 'Actions' ? 'text-right' : 'text-left')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={5} className="py-16 text-center text-muted-foreground text-sm">Chargement…</td></tr>
              ) : paginated.map((a) => (
                <tr key={a.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => openDrawer(a)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4 text-brand-600" />
                      </div>
                      <p className="font-semibold">{a.nom}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{a.ville ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{a.adresse || '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{a.telephone || '—'}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { openDrawer(a); setEditMode(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      {confirmId === a.id ? (
                        <>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleDelete(a.id)}>
                            <Check className="mr-1 h-3 w-3" /> Confirmer
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setConfirmId(null)}><X className="h-3 w-3" /></Button>
                        </>
                      ) : (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmId(a.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && agences.length === 0 && <div className="py-14 text-center text-sm text-muted-foreground">Aucune agence créée.</div>}
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
                <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4 text-brand-600" />
                </div>
                <div>
                  <p className="font-bold">{drawer.nom}</p>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3" />{drawer.ville}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!editMode && <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditMode(true)}><Pencil className="h-3 w-3" /> Éditer</Button>}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={closeDrawer}><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {!editMode ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[['Nom', drawer.nom], ['Ville', drawer.ville ?? '—'], ['Adresse', drawer.adresse || '—'], ['Téléphone', drawer.telephone || '—'], ['Email', drawer.email || '—']].map(([l, v]) => (
                    <div key={l}><p className="text-[10px] text-muted-foreground font-medium uppercase">{l}</p><p className="font-semibold mt-0.5">{v}</p></div>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleUpdate} className="space-y-4">
                  <FormFields />
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
              <h2 className="font-bold">Nouvelle agence</h2>
              <Button variant="ghost" size="icon" onClick={() => setModal(null)}><X className="h-4 w-4" /></Button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <FormFields />
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
