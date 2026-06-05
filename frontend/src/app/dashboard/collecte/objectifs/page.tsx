'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/table-pagination';
import { objectifService } from '@/services/objectifService';
import { produitService } from '@/services/produitService';
import { agentService } from '@/services/agentService';
import { equipeService } from '@/services/equipeService';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, X, Check, Target, Users, User } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUT_CONFIG: Record<string, { label: string; color: string }> = {
  en_cours: { label: 'En cours', color: 'bg-blue-100 text-blue-700' },
  atteint:  { label: 'Atteint',  color: 'bg-emerald-100 text-emerald-700' },
  depasse:  { label: 'Dépassé',  color: 'bg-violet-100 text-violet-700' },
  echec:    { label: 'Échec',    color: 'bg-red-100 text-red-700' },
};

const PERIODICITE_LABELS: Record<string, string> = {
  semaine: 'Semaine', mois: 'Mois', trimestre: 'Trimestre',
};

type Form = {
  titre: string; produitId: string; cible: string; unite: string;
  periodicite: string; dateDebut: string; dateFin: string;
  assignationType: string; equipeId: string; agentIds: string[];
};

const EMPTY: Form = {
  titre: '', produitId: '', cible: '', unite: 'clients',
  periodicite: 'mois', dateDebut: '', dateFin: '',
  assignationType: 'agents', equipeId: '', agentIds: [],
};

export default function ObjectifsPage() {
  const { isAgent, utilisateurId } = useAuth();

  const [objectifs, setObjectifs] = useState<any[]>([]);
  const [produits, setProduits] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState<'create' | { id: number | string } | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<number | string | null>(null);

  const loadObjectifs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await objectifService.getObjectifs({ per_page: 100 });
      setObjectifs(res.data ?? []);
    } catch {
      toast.error('Erreur lors du chargement des objectifs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadObjectifs();
    produitService.getProduits({ actif: true, per_page: 100 }).then((r) => setProduits(r.data ?? [])).catch(() => {});
    agentService.getAgents({ per_page: 200 }).then((r) => setAgents(r.data ?? [])).catch(() => {});
    equipeService.getEquipes({ per_page: 100 }).then((r) => setEquipes(r.data ?? [])).catch(() => {});
  }, [loadObjectifs]);

  const visibleObjectifs = isAgent && utilisateurId
    ? objectifs.filter((o) => {
        const agentIds: string[] = (o.agentIds ?? o.agents ?? []).map((a: any) =>
          typeof a === 'object' ? String(a.id ?? a.utilisateurId) : String(a)
        );
        if (o.assignationType === 'agents') return agentIds.includes(utilisateurId);
        return false;
      })
    : objectifs;

  const { paginated, ...pagination } = usePagination(visibleObjectifs, 15);

  const getAgentLabel = (agentOrId: any): string => {
    if (typeof agentOrId === 'object') {
      const u = agentOrId.utilisateur;
      return u ? `${u.prenom} ${u.nom}` : agentOrId.matricule ?? String(agentOrId.id);
    }
    const ag = agents.find((a) => String(a.id) === String(agentOrId));
    if (!ag) return String(agentOrId);
    const u = ag.utilisateur;
    return u ? `${u.prenom} ${u.nom}` : ag.matricule;
  };

  const getProduitNom = (idOrObj: any): string => {
    if (typeof idOrObj === 'object' && idOrObj?.nom) return idOrObj.nom;
    const p = produits.find((p) => String(p.id) === String(idOrObj));
    return p?.nom ?? '—';
  };

  const getEquipeNom = (idOrObj: any): string => {
    if (typeof idOrObj === 'object' && idOrObj?.nom) return idOrObj.nom;
    const e = equipes.find((e) => String(e.id) === String(idOrObj));
    return e?.nom ?? '—';
  };

  const openCreate = () => {
    setForm({ ...EMPTY, dateDebut: new Date().toISOString().split('T')[0] });
    setModal('create');
  };

  const openEdit = (o: any) => {
    const rawAgentIds: string[] = (o.agentIds ?? o.agents ?? []).map((a: any) =>
      typeof a === 'object' ? String(a.id) : String(a)
    );
    setForm({
      titre: o.titre ?? o.nom ?? '',
      produitId: String(o.produitId ?? o.produit?.id ?? ''),
      cible: String(o.cible ?? o.valeur_cible ?? o.valeurCible ?? ''),
      unite: o.unite ?? 'clients',
      periodicite: o.periodicite ?? 'mois',
      dateDebut: o.dateDebut ?? o.date_debut ?? '',
      dateFin: o.dateFin ?? o.date_fin ?? '',
      assignationType: o.assignationType ?? 'agents',
      equipeId: String(o.equipeId ?? o.equipe?.id ?? ''),
      agentIds: rawAgentIds,
    });
    setModal({ id: o.id });
  };

  const toggleAgent = (id: string) => {
    setForm((prev) => ({
      ...prev,
      agentIds: prev.agentIds.includes(id)
        ? prev.agentIds.filter((a) => a !== id)
        : [...prev.agentIds, id],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titre.trim() || !form.produitId || !form.cible || !form.dateDebut || !form.dateFin) {
      toast.error('Titre, produit, cible et dates requis'); return;
    }
    if (form.assignationType === 'equipe' && !form.equipeId) { toast.error('Sélectionnez une équipe'); return; }
    if (form.assignationType === 'agents' && form.agentIds.length === 0) { toast.error('Sélectionnez au moins un agent'); return; }

    setSaving(true);
    try {
      const payload = {
        titre: form.titre,
        produitId: Number(form.produitId),
        cible: parseFloat(form.cible),
        unite: form.unite,
        periodicite: form.periodicite,
        dateDebut: form.dateDebut,
        dateFin: form.dateFin,
        assignationType: form.assignationType,
        equipeId: form.assignationType === 'equipe' ? Number(form.equipeId) : null,
        agentIds: form.assignationType === 'agents' ? form.agentIds.map(Number) : [],
      };

      if (modal === 'create') {
        await objectifService.create(payload);
        toast.success(`Objectif "${form.titre}" créé`);
      } else if (modal && typeof modal === 'object') {
        await objectifService.update(modal.id, payload);
        toast.success('Objectif mis à jour');
      }
      setModal(null);
      await loadObjectifs();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number | string) => {
    try {
      await objectifService.remove(id);
      toast.success('Objectif supprimé');
      setConfirmId(null);
      await loadObjectifs();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la suppression');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Objectifs</h1>
          <p className="text-sm text-muted-foreground">Attribution et suivi des objectifs par équipe ou agent.</p>
        </div>
        {!isAgent && (
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Nouvel objectif
          </Button>
        )}
      </div>

      {loading && <div className="py-16 text-center text-sm text-muted-foreground">Chargement…</div>}

      {!loading && (
        <div className="grid gap-4">
          {paginated.map((o) => {
            const valActuelle = o.valeur_actuelle ?? o.valeurActuelle ?? o.realise ?? 0;
            const valCible    = o.cible ?? o.valeur_cible ?? o.valeurCible ?? 1;
            const unite       = o.unite ?? 'clients';
            const pct = Math.min(100, Math.round((valActuelle / valCible) * 100));
            const cfg = STATUT_CONFIG[o.statut] ?? STATUT_CONFIG.en_cours;
            const agentList: any[] = o.agentIds ?? o.agents ?? [];
            const equipeIdOrObj = o.equipeId ?? o.equipe;
            return (
              <Card key={o.id} className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold">{o.titre ?? o.nom}</p>
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', cfg.color)}>
                        {cfg.label}
                      </span>
                      <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-medium">
                        {PERIODICITE_LABELS[o.periodicite] ?? o.periodicite}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {getProduitNom(o.produitId ?? o.produit)} · {o.dateDebut ?? o.date_debut} → {o.dateFin ?? o.date_fin}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {o.assignationType === 'equipe' ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" /> Équipe : {getEquipeNom(equipeIdOrObj)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          {agentList.map((a) => getAgentLabel(a)).join(', ') || '—'}
                        </span>
                      )}
                    </div>
                  </div>
                  {!isAgent && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(o)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {confirmId === o.id ? (
                        <>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleDelete(o.id)}>
                            <Check className="mr-1 h-3 w-3" /> Confirmer
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setConfirmId(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setConfirmId(o.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {unite === 'montant' ? formatCurrency(valActuelle) : `${valActuelle} client${valActuelle !== 1 ? 's' : ''}`}
                      {' / '}
                      {unite === 'montant' ? formatCurrency(valCible) : `${valCible} client${valCible !== 1 ? 's' : ''}`}
                    </span>
                    <span className={cn('font-black text-base', pct >= 100 ? 'text-emerald-600' : pct >= 60 ? 'text-brand-600' : 'text-muted-foreground')}>
                      {pct}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-brand-600' : 'bg-amber-400')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
          {visibleObjectifs.length === 0 && (
            <div className="py-16 text-center text-muted-foreground text-sm">
              {isAgent ? 'Aucun objectif ne vous est assigné.' : 'Aucun objectif défini.'}
            </div>
          )}
        </div>
      )}
      <TablePagination {...pagination} />

      {/* Modal */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-lg my-4">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="font-bold">{modal === 'create' ? 'Nouvel objectif' : "Modifier l'objectif"}</h2>
              <Button variant="ghost" size="icon" onClick={() => setModal(null)}><X className="h-4 w-4" /></Button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="space-y-2">
                <Label>Titre <span className="text-red-500">*</span></Label>
                <Input value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} placeholder="ex: Recrutement DAT — Juin" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Produit <span className="text-red-500">*</span></Label>
                  <Select value={form.produitId || '__none__'} onValueChange={(v) => setForm({ ...form, produitId: v === '__none__' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {produits.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nom}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Périodicité</Label>
                  <Select value={form.periodicite} onValueChange={(v) => setForm({ ...form, periodicite: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PERIODICITE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cible <span className="text-red-500">*</span></Label>
                  <Input type="number" min="1" value={form.cible} onChange={(e) => setForm({ ...form, cible: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Unité</Label>
                  <Select value={form.unite} onValueChange={(v) => setForm({ ...form, unite: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clients">Clients</SelectItem>
                      <SelectItem value="montant">Montant (FCFA)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date début <span className="text-red-500">*</span></Label>
                  <Input type="date" value={form.dateDebut} onChange={(e) => setForm({ ...form, dateDebut: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Date fin <span className="text-red-500">*</span></Label>
                  <Input type="date" value={form.dateFin} onChange={(e) => setForm({ ...form, dateFin: e.target.value })} />
                </div>
              </div>

              <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
                <div className="flex gap-4">
                  {(['agents', 'equipe'] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="radio"
                        name="assignationType"
                        value={t}
                        checked={form.assignationType === t}
                        onChange={() => setForm({ ...form, assignationType: t, equipeId: '', agentIds: [] })}
                      />
                      {t === 'agents' ? 'Agent(s) nominatif(s)' : 'Équipe entière'}
                    </label>
                  ))}
                </div>

                {form.assignationType === 'equipe' ? (
                  <div className="space-y-2">
                    <Label>Équipe <span className="text-red-500">*</span></Label>
                    <Select value={form.equipeId || '__none__'} onValueChange={(v) => setForm({ ...form, equipeId: v === '__none__' ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="Choisir une équipe" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {equipes.map((eq) => <SelectItem key={eq.id} value={String(eq.id)}>{eq.nom}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Agent(s) <span className="text-red-500">*</span></Label>
                    <div className="grid gap-2 max-h-48 overflow-y-auto">
                      {agents.map((ag) => {
                        const u = ag.utilisateur;
                        const agId = String(ag.id);
                        const selected = form.agentIds.includes(agId);
                        return (
                          <label key={ag.id} className={cn('flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-colors', selected ? 'border-brand-300 bg-brand-50' : 'hover:bg-muted/50')}>
                            <input type="checkbox" checked={selected} onChange={() => toggleAgent(agId)} className="accent-brand-600" />
                            <span className="text-sm">
                              {u ? `${u.prenom} ${u.nom}` : ag.matricule}
                              <span className="ml-2 text-[10px] font-mono text-muted-foreground">{ag.matricule}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setModal(null)}>Annuler</Button>
                <Button type="submit" variant="brand" disabled={saving}>Enregistrer</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
