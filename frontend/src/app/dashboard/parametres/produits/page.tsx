'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { z } from 'zod';
import { useCan } from '@/hooks/useCan';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/table-pagination';
import { produitService } from '@/services/produitService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Onglets } from '@/components/ui/kpi';
import { Plus, Pencil, Trash2, X, Check, Search, Eye, Package, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { adminService, type ForfaitRef, type MarcheRef, type SecteurRef, type CriteresCible } from '@/services/adminService';
import { agenceService } from '@/services/agenceService';
import { CYCLE_LABEL } from '@/lib/segmentationLabels';
import { msg } from '@/lib/apiHelpers';

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
  const [onglet, setOnglet] = useState<'catalogue' | 'forfaits'>('catalogue');
  return (
    <div className="space-y-4">
      <Onglets valeur={onglet} onChange={setOnglet} options={[{ id: 'catalogue', label: 'Catalogue' }, { id: 'forfaits', label: 'Forfaits' }]} />
      {onglet === 'catalogue' ? <CatalogueTab /> : <ForfaitsTab />}
    </div>
  );
}

function CatalogueTab() {
  const { can } = useCan();
  // POST/PUT/DELETE /produits exigent tous `produits:CONFIGURE` (le taux/type se règlent séparément,
  // voir Paramètres > Paramétrage financier).
  const canEditParametres = can('produits:CONFIGURE');
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
          {canEditParametres && (
            <Button variant="brand" size="sm" onClick={() => { setForm(EMPTY); setErrors({}); setModal('create'); }} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" /> Nouveau produit
            </Button>
          )}
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
                        {canEditParametres && (
                          <>
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
                          </>
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
                {!editMode && canEditParametres && <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditMode(true)}><Pencil className="h-3 w-3" /> Éditer</Button>}
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
                  {canEditParametres && (
                    <div className="pt-3 border-t">
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => toggleActif(drawer)}>
                        {drawer.actif ? 'Désactiver le produit' : 'Activer le produit'}
                      </Button>
                    </div>
                  )}
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

/** Forfaits commerciaux (Lot 15) : bundles de produits ciblant un segment de clients. */
function ForfaitsTab() {
  const { can } = useCan();
  const peutGerer = can('produits:CONFIGURE');
  const [forfaits, setForfaits] = useState<ForfaitRef[]>([]);
  const [produits, setProduits] = useState<{ id: number; nom: string; actif: boolean }[]>([]);
  const [marches, setMarches] = useState<MarcheRef[]>([]);
  const [secteurs, setSecteurs] = useState<SecteurRef[]>([]);
  const [agences, setAgences] = useState<{ id: number; nom: string }[]>([]);
  const [chargement, setChargement] = useState(true);
  const [formulaire, setFormulaire] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [f, setF] = useState({ nom: '', description: '', produit_ids: [] as number[], cycle_vie: [] as string[], marche_id: '', secteur_id: '', agence_id: '', potentiel_min: '' });
  const [opportunites, setOpportunites] = useState<{ forfaitId: number; data: Awaited<ReturnType<typeof adminService.clientsEligiblesForfait>> } | null>(null);

  const charger = useCallback(() => adminService.forfaits()
    .then(setForfaits)
    .catch((e) => toast.error(msg(e, 'Accès refusé')))
    .finally(() => setChargement(false)), []);
  useEffect(() => {
    void charger();
    produitService.getProduits().then((r) => setProduits(r.data ?? [])).catch(() => {});
    adminService.marches().then(setMarches).catch(() => {});
    adminService.secteurs().then(setSecteurs).catch(() => {});
    agenceService.getAgences({ per_page: 100 }).then((r) => setAgences(r.data)).catch(() => {});
  }, [charger]);

  const VIDE = { nom: '', description: '', produit_ids: [] as number[], cycle_vie: [] as string[], marche_id: '', secteur_id: '', agence_id: '', potentiel_min: '' };
  const [enEdition, setEnEdition] = useState<number | null>(null);

  const ouvrirEdition = (ft: ForfaitRef) => {
    const c = ft.criteres ?? {};
    setF({
      nom: ft.nom, description: ft.description ?? '', produit_ids: ft.produits.map((p) => p.produit.id), cycle_vie: c.cycle_vie ?? [],
      marche_id: c.marche_id ? String(c.marche_id) : '', secteur_id: c.secteur_id ? String(c.secteur_id) : '',
      agence_id: c.agence_id ? String(c.agence_id) : '', potentiel_min: c.potentiel_min !== undefined ? String(c.potentiel_min) : '',
    });
    setEnEdition(ft.id); setFormulaire(true);
  };
  const fermer = () => { setFormulaire(false); setEnEdition(null); setF(VIDE); };

  const enregistrer = async () => {
    if (!f.nom.trim() || f.produit_ids.length === 0) { toast.error('Nom et au moins un produit requis'); return; }
    setOccupe(true);
    try {
      const criteres: CriteresCible = {};
      if (f.cycle_vie.length) criteres.cycle_vie = f.cycle_vie as CriteresCible['cycle_vie'];
      if (f.marche_id) criteres.marche_id = Number(f.marche_id);
      if (f.secteur_id) criteres.secteur_id = Number(f.secteur_id);
      if (f.agence_id) criteres.agence_id = Number(f.agence_id);
      if (f.potentiel_min) criteres.potentiel_min = Number(f.potentiel_min);
      const corps = { nom: f.nom, description: f.description || undefined, criteres, produit_ids: f.produit_ids };
      if (enEdition) { await adminService.modifierForfait(enEdition, corps); toast.success('Forfait modifié'); }
      else { await adminService.creerForfait(corps); toast.success('Forfait créé'); }
      fermer();
      await charger();
    } catch (e) { toast.error(msg(e)); } finally { setOccupe(false); }
  };

  const basculerActif = async (ft: ForfaitRef) => {
    try { await adminService.modifierForfait(ft.id, { actif: !ft.actif }); await charger(); }
    catch (e) { toast.error(msg(e)); }
  };

  const supprimer = async (id: number) => {
    try { await adminService.supprimerForfait(id); toast.success('Forfait supprimé'); await charger(); }
    catch (e) { toast.error(msg(e)); }
  };

  const voirOpportunites = async (forfaitId: number) => {
    if (opportunites?.forfaitId === forfaitId) { setOpportunites(null); return; }
    try { setOpportunites({ forfaitId, data: await adminService.clientsEligiblesForfait(forfaitId) }); }
    catch (e) { toast.error(msg(e)); }
  };

  if (chargement) return <p className="text-sm text-muted-foreground py-8 text-center">Chargement…</p>;

  return (
    <div className="space-y-3">
      {peutGerer && (
        <Card>
          <CardContent className="p-3 space-y-3">
            {!formulaire ? (
              <Button variant="brand" size="sm" onClick={() => setFormulaire(true)}><Plus className="mr-2 h-4 w-4" />Nouveau forfait</Button>
            ) : (
              <div className="space-y-2">
                <div className="grid sm:grid-cols-2 gap-2">
                  <Input placeholder="Nom du forfait" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} />
                  <Input placeholder="Description (optionnel)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
                </div>
                <p className="text-xs text-muted-foreground">Produits du forfait :</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {produits.filter((p) => p.actif).map((p) => (
                    <label key={p.id} className="flex items-center gap-1 rounded-md border px-2 py-1">
                      <input type="checkbox" checked={f.produit_ids.includes(p.id)} onChange={() => setF({ ...f, produit_ids: f.produit_ids.includes(p.id) ? f.produit_ids.filter((x) => x !== p.id) : [...f.produit_ids, p.id] })} />
                      {p.nom}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Ciblage (laisser vide = tous les clients actifs) :</p>
                <div className="grid sm:grid-cols-4 gap-2">
                  <div className="flex flex-wrap gap-2 items-center text-xs col-span-full sm:col-span-2">
                    {Object.entries(CYCLE_LABEL).map(([k, l]) => (
                      <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={f.cycle_vie.includes(k)} onChange={() => setF({ ...f, cycle_vie: f.cycle_vie.includes(k) ? f.cycle_vie.filter((x) => x !== k) : [...f.cycle_vie, k] })} />{l}</label>
                    ))}
                  </div>
                  <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.marche_id} onChange={(e) => setF({ ...f, marche_id: e.target.value })}>
                    <option value="">Tous les marchés</option>{marches.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                  </select>
                  <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.secteur_id} onChange={(e) => setF({ ...f, secteur_id: e.target.value })}>
                    <option value="">Tous les secteurs</option>{secteurs.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                  </select>
                  <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.agence_id} onChange={(e) => setF({ ...f, agence_id: e.target.value })}>
                    <option value="">Toutes les agences</option>{agences.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                  </select>
                  <Input type="number" min={0} max={100} placeholder="Potentiel minimal (0-100)" value={f.potentiel_min} onChange={(e) => setF({ ...f, potentiel_min: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={fermer}>Annuler</Button>
                  <Button size="sm" variant="brand" disabled={occupe} onClick={enregistrer}>{enEdition ? 'Enregistrer' : 'Créer'}</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {forfaits.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Aucun forfait.</p>}
      {forfaits.map((ft) => (
        <Card key={ft.id}>
          <CardContent className="p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{ft.nom}</p>
                <p className="text-xs text-muted-foreground">{ft.produits.map((p) => p.produit.nom).join(' + ')}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={ft.actif ? 'success' : 'secondary'}>{ft.actif ? 'Actif' : 'Inactif'}</Badge>
                <Button size="sm" variant="outline" onClick={() => voirOpportunites(ft.id)}>{opportunites?.forfaitId === ft.id ? 'Masquer' : 'Clients éligibles'}</Button>
                {peutGerer && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => basculerActif(ft)}>{ft.actif ? 'Désactiver' : 'Activer'}</Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => ouvrirEdition(ft)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => supprimer(ft.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </>
                )}
              </div>
            </div>
            {ft.description && <p className="text-xs text-muted-foreground">{ft.description}</p>}
            {opportunites?.forfaitId === ft.id && (
              <div className="space-y-1.5 pt-2 border-t">
                {opportunites.data.length === 0 && <p className="text-xs text-muted-foreground">Aucune opportunité : tous les clients ciblés détiennent déjà ce forfait, ou aucun client ne correspond au ciblage.</p>}
                {opportunites.data.map((o) => (
                  <div key={o.client.id} className="flex items-center justify-between gap-2 text-xs rounded-md border p-1.5">
                    <span>{o.client.prenom} {o.client.nom} · manque : {o.produits_manquants.join(', ')}</span>
                    <span className="font-bold text-brand-700">{o.score_forfait}/100</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
