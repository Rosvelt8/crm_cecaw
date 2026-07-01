'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Search, Plus, Clock, X, MoreHorizontal, ChevronRight, LayoutGrid, List,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { PIPELINE_STATUT_LABELS } from '@/constants';
import { toast } from 'sonner';

type PipelineStatut = 'nouveau' | 'contacte' | 'interesse' | 'negocie' | 'converti' | 'perdu';

interface Prospect {
  id: number;
  nom: string;
  contact: string;
  montant: number;
  statut: PipelineStatut;
  score: number;
  produit: string;
  telephone: string;
  lastActivity: string;
}

const initialProspects: Prospect[] = [
  { id: 1, nom: 'Garage du Moungo', contact: 'M. Tagne', montant: 5000000, statut: 'negocie', score: 85, produit: 'Crédit PME', telephone: '699001122', lastActivity: 'Il y a 2h' },
  { id: 2, nom: 'Boutique Mony', contact: 'Mme Mony', montant: 1200000, statut: 'nouveau', score: 62, produit: 'Crédit Consommation', telephone: '677334455', lastActivity: 'Hier' },
  { id: 3, nom: 'Agri-Expert SARL', contact: 'Dr. Fotsing', montant: 15000000, statut: 'interesse', score: 92, produit: 'Crédit Agricole', telephone: '655667788', lastActivity: 'Il y a 1h' },
  { id: 4, nom: 'Transport Rapide', contact: 'M. Sali', montant: 8000000, statut: 'contacte', score: 45, produit: 'Crédit PME', telephone: '699887766', lastActivity: '3 jours' },
  { id: 5, nom: 'Couture Chic', contact: 'Mme Bella', montant: 450000, statut: 'interesse', score: 78, produit: 'Crédit Consommation', telephone: '677112233', lastActivity: 'Hier' },
  { id: 6, nom: 'Ets Nana', contact: 'M. Nana', montant: 2500000, statut: 'nouveau', score: 55, produit: 'Crédit Commerce', telephone: '699223344', lastActivity: 'Il y a 5h' },
];

const columns: { id: PipelineStatut; title: string; color: string }[] = [
  { id: 'nouveau', title: 'Nouveaux', color: '#6366f1' },
  { id: 'contacte', title: 'Contactés', color: '#3b82f6' },
  { id: 'interesse', title: 'Intéressés', color: '#f59e0b' },
  { id: 'negocie', title: 'En Négociation', color: '#8b5cf6' },
  { id: 'converti', title: 'Convertis', color: '#10b981' },
];

export default function ProspectsPage() {
  const [prospects, setProspects] = useState(initialProspects);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showModal, setShowModal] = useState(false);
  const [editProspect, setEditProspect] = useState<Prospect | null>(null);
  const [form, setForm] = useState<Partial<Prospect>>({
    statut: 'nouveau',
    produit: 'Crédit Consommation',
    score: 50,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return prospects;
    return prospects.filter(
      (p) =>
        p.nom.toLowerCase().includes(q) ||
        p.contact.toLowerCase().includes(q) ||
        p.produit.toLowerCase().includes(q)
    );
  }, [prospects, search]);

  const openCreate = () => {
    setEditProspect(null);
    setForm({ statut: 'nouveau', produit: 'Crédit Consommation', score: 50 });
    setShowModal(true);
  };

  const openEdit = (p: Prospect) => {
    setEditProspect(p);
    setForm({ ...p });
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom?.trim() || !form.contact?.trim()) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }
    if (editProspect) {
      setProspects((prev) =>
        prev.map((p) => (p.id === editProspect.id ? { ...p, ...form } as Prospect : p))
      );
      toast.success('Prospect mis à jour');
    } else {
      const newP: Prospect = {
        id: Date.now(),
        nom: form.nom!,
        contact: form.contact!,
        montant: Number(form.montant) || 0,
        statut: (form.statut as PipelineStatut) || 'nouveau',
        score: Number(form.score) || 50,
        produit: form.produit || 'Crédit Consommation',
        telephone: form.telephone || '',
        lastActivity: "À l'instant",
      };
      setProspects((prev) => [newP, ...prev]);
      toast.success('Prospect ajouté au pipeline');
    }
    setShowModal(false);
  };

  const moveProspect = (id: number, newStatut: PipelineStatut) => {
    setProspects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, statut: newStatut, lastActivity: "À l'instant" } : p))
    );
    toast.success(`Prospect déplacé vers "${PIPELINE_STATUT_LABELS[newStatut]}"`);
  };

  const pipelineValue = prospects
    .filter((p) => !['converti', 'perdu'].includes(p.statut))
    .reduce((s, p) => s + p.montant, 0);

  const conversionRate = prospects.length
    ? Math.round((prospects.filter((p) => p.statut === 'converti').length / prospects.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pipeline CRM</h1>
          <p className="text-muted-foreground">Suivez et convertissez vos opportunités commerciales.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'brand' : 'ghost'}
              size="icon" className="h-8 w-8"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'brand' : 'ghost'}
              size="icon" className="h-8 w-8"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="brand" onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> Nouveau Prospect
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-primary-50/30 border-primary-100">
          <div className="text-xs text-muted-foreground font-medium uppercase">Valeur Pipeline</div>
          <div className="text-xl font-bold text-primary-700">{formatCurrency(pipelineValue, true)}</div>
        </Card>
        <Card className="p-4 bg-success-50/30 border-success-100">
          <div className="text-xs text-muted-foreground font-medium uppercase">Taux de Conversion</div>
          <div className="text-xl font-bold text-success-700">{conversionRate}%</div>
        </Card>
        <Card className="p-4 bg-amber-50/30 border-amber-100">
          <div className="text-xs text-muted-foreground font-medium uppercase">Score Moyen</div>
          <div className="text-xl font-bold text-amber-700">
            {prospects.length ? Math.round(prospects.reduce((s, p) => s + p.score, 0) / prospects.length) : 0} / 100
          </div>
        </Card>
        <Card className="p-4 bg-brand-50/30 border-brand-100">
          <div className="text-xs text-muted-foreground font-medium uppercase">Total Prospects</div>
          <div className="text-xl font-bold text-brand-700">{prospects.length}</div>
        </Card>
      </div>

      {/* Search */}
      <div className="w-full sm:max-w-sm">
        <Input
          placeholder="Rechercher un prospect..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<Search className="h-4 w-4" />}
        />
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4 -mx-4 px-4">
        <div className="flex gap-4 min-w-max h-[calc(100vh-380px)]">
          {columns.map((column) => {
            const cards = filtered.filter((p) => p.statut === column.id);
            return (
              <div key={column.id} className="w-72 flex flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: column.color }} />
                    <h3 className="text-sm font-bold uppercase tracking-wider">{column.title}</h3>
                    <Badge variant="outline" className="text-[10px] h-4 px-1">{cards.length}</Badge>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={openCreate}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                <div className="flex-1 bg-muted/40 rounded-xl p-2 space-y-3 overflow-y-auto border border-dashed border-muted-foreground/10">
                  {cards.map((prospect) => (
                    <Card
                      key={prospect.id}
                      className="p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer border-none group"
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start justify-between">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold group-hover:text-brand-600 transition-colors">{prospect.nom}</span>
                            <span className="text-[10px] text-muted-foreground">{prospect.contact} • {prospect.telephone}</span>
                          </div>
                          <Button
                            variant="ghost" size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => openEdit(prospect)}
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="flex items-center justify-between text-[11px]">
                          <div className="font-bold">{formatCurrency(prospect.montant, true)}</div>
                          <div className={cn(
                            'px-1.5 py-0.5 rounded font-bold',
                            prospect.score > 80 ? 'bg-success-50 text-success-700' :
                            prospect.score > 50 ? 'bg-warning-50 text-warning-700' : 'bg-danger-50 text-danger-700'
                          )}>
                            {prospect.score}%
                          </div>
                        </div>

                        <div className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                          {prospect.produit}
                        </div>

                        <div className="flex items-center justify-between border-t pt-2">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" /> {prospect.lastActivity}
                          </div>
                          {/* Bouton avancer dans le pipeline */}
                          {column.id !== 'converti' && (
                            <Select
                              value={prospect.statut}
                              onValueChange={(v) => moveProspect(prospect.id, v as PipelineStatut)}
                            >
                              <SelectTrigger className="h-6 w-6 border-none bg-transparent p-0 [&>svg]:hidden">
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </SelectTrigger>
                              <SelectContent>
                                {columns.map((col) => (
                                  <SelectItem key={col.id} value={col.id} className="text-xs">
                                    {col.title}
                                  </SelectItem>
                                ))}
                                <SelectItem value="perdu" className="text-xs text-red-500">Perdu</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                  {cards.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-20 text-[11px] text-muted-foreground/50">
                      Aucun prospect
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Nouveau / Modifier Prospect */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md animate-in zoom-in-95">
            <div className="border-b p-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">{editProspect ? 'Modifier le Prospect' : 'Nouveau Prospect'}</h2>
                <p className="text-xs text-muted-foreground">Renseigner les informations de l'opportunité commerciale.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowModal(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <form onSubmit={handleSave} className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Nom de l'entreprise / Client <span className="text-red-500">*</span></Label>
                <Input
                  required
                  value={form.nom || ''}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  placeholder="Ex : Garage du Moungo"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact principal <span className="text-red-500">*</span></Label>
                  <Input
                    required
                    value={form.contact || ''}
                    onChange={(e) => setForm({ ...form, contact: e.target.value })}
                    placeholder="Ex : M. Tagne"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input
                    value={form.telephone || ''}
                    onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                    placeholder="699..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Montant estimé (FCFA)</Label>
                  <Input
                    type="number"
                    value={form.montant || ''}
                    onChange={(e) => setForm({ ...form, montant: Number(e.target.value) })}
                    placeholder="Ex : 5 000 000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Score (%)</Label>
                  <Input
                    type="number"
                    min="0" max="100"
                    value={form.score || ''}
                    onChange={(e) => setForm({ ...form, score: Number(e.target.value) })}
                    placeholder="0 – 100"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Produit d'intérêt</Label>
                <Select value={form.produit} onValueChange={(v) => setForm({ ...form, produit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Crédit Consommation">Crédit Consommation</SelectItem>
                    <SelectItem value="Crédit PME">Crédit PME</SelectItem>
                    <SelectItem value="Crédit Agricole">Crédit Agricole</SelectItem>
                    <SelectItem value="Crédit Commerce">Crédit Commerce</SelectItem>
                    <SelectItem value="Épargne Tontine">Épargne Tontine</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Statut pipeline</Label>
                <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v as PipelineStatut })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {columns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Annuler</Button>
                <Button type="submit" variant="brand">
                  {editProspect ? 'Enregistrer' : 'Ajouter au pipeline'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
