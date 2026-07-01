'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Layers, Plus, X, Search, Edit2, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { produitService } from '@/services/produitService';
import type { Produit, GroupeProduit } from '@/types/produit';

export default function ProduitsPage() {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [groupes, setGroupes] = useState<GroupeProduit[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showProductModal, setShowProductModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);

  // Confirmation suppression
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'produit' | 'groupe'; id: number; nom: string } | null>(null);

  // Form States
  const [formData, setFormData] = useState<Partial<Produit>>({ type: 'credit', est_actif: true });
  const [groupFormData, setGroupFormData] = useState<Partial<GroupeProduit>>({ est_actif: true });

  const fetchData = async () => {
    setLoading(true);
    try {
      const pRes = await produitService.getProduits();
      const gRes = await produitService.getGroupesProduits();
      setProduits(pRes.data);
      setGroupes(gRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (formData.id) {
        await produitService.updateProduit(formData.id, formData);
        toast.success('Produit mis à jour');
      } else {
        await produitService.createProduit(formData as Produit);
        toast.success('Produit créé avec succès');
      }
      setShowProductModal(false);
      setFormData({ type: 'credit', est_actif: true });
      fetchData();
    } catch (err) {
      toast.error('Erreur lors de l\'enregistrement');
    }
  };

  const handleEditProduct = (p: Produit) => {
    setFormData(p);
    setShowProductModal(true);
  };

  const handleDeleteProduct = (id: number, nom: string) => {
    setConfirmDelete({ type: 'produit', id, nom });
  };

  const handleDeleteGroup = async (id: number, nom: string) => {
    setConfirmDelete({ type: 'groupe', id, nom });
  };

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'produit') {
      await produitService.deleteProduit(confirmDelete.id);
      toast.success('Produit supprimé');
    } else {
      await produitService.deleteGroupeProduit(confirmDelete.id);
      toast.success('Groupe supprimé');
    }
    setConfirmDelete(null);
    fetchData();
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (groupFormData.id) {
        await produitService.updateGroupeProduit(groupFormData.id, groupFormData);
        toast.success('Groupe mis à jour');
      } else {
        await produitService.createGroupeProduit(groupFormData as GroupeProduit);
        toast.success('Groupe créé avec succès');
      }
      setShowGroupModal(false);
      setGroupFormData({ est_actif: true });
      fetchData();
    } catch (err) {
      toast.error('Erreur lors de l\'enregistrement');
    }
  };

  const handleEditGroup = (g: GroupeProduit) => {
    setGroupFormData(g);
    setShowGroupModal(true);
  };


  return (
    <div className="space-y-8 relative px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Produits & Groupes</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Gestion du catalogue de produits Cecaw Finance S.A.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
           <Button variant="outline" className="w-full sm:w-auto text-xs" onClick={() => { setGroupFormData({ est_actif: true }); setShowGroupModal(true); }}>
              <Layers className="mr-2 h-4 w-4" /> Nouveau Groupe
           </Button>
           <Button variant="brand" className="w-full sm:w-auto text-xs" onClick={() => { setFormData({ type: 'credit', est_actif: true }); setShowProductModal(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Nouveau Produit
           </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-40 text-muted-foreground">Chargement des produits...</div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-3 items-start grid-cols-1">
           <div className="lg:col-span-2 space-y-6">
              <Card>
                 <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                       <div>
                          <CardTitle className="text-base">Catalogue des Produits</CardTitle>
                          <CardDescription className="text-xs">Liste de tous les produits disponibles</CardDescription>
                       </div>
                       <div className="w-full sm:w-64">
                         <Input placeholder="Rechercher..." icon={<Search className="h-4 w-4" />} />
                       </div>
                    </div>
                 </CardHeader>
                 <CardContent>
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                       {produits.map(produit => (
                         <div key={produit.id} className="p-4 rounded-xl border bg-card hover:bg-muted/50 transition-colors group flex flex-col gap-2">
                           <div className="flex justify-between items-start">
                             <div>
                               <div className="font-bold">{produit.nom}</div>
                               <div className="text-xs text-muted-foreground">{produit.code} • {produit.type}</div>
                             </div>
                             <div className="flex gap-2 items-center">
                               <Badge variant={produit.est_actif ? 'success' : 'secondary'} className="text-[10px]">
                                 {produit.est_actif ? 'Actif' : 'Inactif'}
                               </Badge>
                             </div>
                           </div>
                           <p className="text-xs mt-2 text-muted-foreground line-clamp-2 min-h-[32px]">{produit.description}</p>
                           {produit.type === 'credit' && (
                             <div className="mt-2 text-[10px] font-medium bg-brand-50 text-brand-700 px-2 py-1 rounded w-fit">
                               Taux Défaut: {produit.taux_interet_defaut}% | Min: {produit.montant_min} FCFA
                             </div>
                           )}
                           <div className="mt-4 pt-3 border-t flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-brand-600" onClick={() => handleEditProduct(produit)}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-danger-600" onClick={() => handleDeleteProduct(produit.id, produit.nom)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                           </div>
                         </div>
                       ))}
                    </div>
                 </CardContent>
              </Card>
           </div>
           
           <div className="space-y-6 lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Groupes de Produits</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {groupes.map(groupe => (
                    <div key={groupe.id} className="p-3 rounded-lg border bg-card flex items-center gap-3 group relative">
                      <div className="h-10 w-10 shrink-0 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Layers className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{groupe.nom}</div>
                        <div className="text-[10px] text-muted-foreground">{groupe.code} • {groupe.produits_count || 0} produits</div>
                      </div>
                      <Badge variant={groupe.est_actif ? 'success' : 'secondary'} className="shrink-0">{groupe.est_actif ? 'Actif' : 'Inactif'}</Badge>
                      
                      {/* Actions hover */}
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-card shadow-sm rounded-md border p-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-brand-600" onClick={() => handleEditGroup(groupe)}>
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-danger-600" onClick={() => handleDeleteGroup(groupe.id, groupe.nom)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
           </div>
        </div>
      )}

      {/* Modal Produit (Custom Overlay) */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
           <div className="bg-background rounded-xl shadow-xl w-full max-w-xl max-h-[95vh] overflow-y-auto animate-in zoom-in-95">
              <div className="sticky top-0 bg-background/80 backdrop-blur border-b p-4 flex items-center justify-between z-10">
                 <h2 className="text-xl font-bold">{formData.id ? 'Modifier le Produit' : 'Nouveau Produit'}</h2>
                 <Button variant="ghost" size="icon" onClick={() => setShowProductModal(false)}>
                    <X className="h-5 w-5" />
                 </Button>
              </div>
              <form onSubmit={handleSaveProduct} className="p-4 space-y-6">
                 <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                    <div className="space-y-2">
                       <Label className="text-xs sm:text-sm">Code Produit *</Label>
                       <Input required value={formData.code || ''} onChange={e => setFormData({...formData, code: e.target.value})} placeholder="Ex: PRD-AGRI" className="text-xs" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-xs sm:text-sm">Nom du Produit *</Label>
                       <Input required value={formData.nom || ''} onChange={e => setFormData({...formData, nom: e.target.value})} placeholder="Ex: Crédit Agricole" className="text-xs" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-xs sm:text-sm">Type de Produit</Label>
                       <Select value={formData.type} onValueChange={(val: any) => setFormData({...formData, type: val})}>
                          <SelectTrigger className="text-xs">
                             <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                             <SelectItem value="credit">Crédit</SelectItem>
                             <SelectItem value="epargne">Épargne</SelectItem>
                             <SelectItem value="assurance">Assurance</SelectItem>
                          </SelectContent>
                       </Select>
                    </div>
                    <div className="space-y-2">
                       <Label className="text-xs sm:text-sm">Groupe (Pôle)</Label>
                       <Select value={formData.groupe_id?.toString()} onValueChange={(val) => setFormData({...formData, groupe_id: Number(val)})}>
                          <SelectTrigger className="text-xs">
                             <SelectValue placeholder="Sélectionner..." />
                          </SelectTrigger>
                          <SelectContent>
                             {groupes.map(g => (
                               <SelectItem key={g.id} value={g.id.toString()}>{g.nom}</SelectItem>
                             ))}
                          </SelectContent>
                       </Select>
                    </div>
                 </div>
                 
                 <div className="space-y-2">
                    <Label className="text-xs sm:text-sm">Description</Label>
                    <Input value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Courte description..." className="text-xs" />
                 </div>

                 {formData.type === 'credit' && (
                    <div className="p-4 border rounded-lg bg-muted/20 space-y-4">
                       <h3 className="text-xs sm:text-sm font-bold">Conditions du Crédit</h3>
                       <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                          <div className="space-y-2">
                             <Label className="text-xs">Taux d'intérêt (%)</Label>
                             <Input type="number" step="0.1" value={formData.taux_interet_defaut || ''} onChange={e => setFormData({...formData, taux_interet_defaut: Number(e.target.value)})} className="text-xs" />
                          </div>
                          <div className="space-y-2">
                             <Label className="text-xs">Montant Min</Label>
                             <Input type="number" value={formData.montant_min || ''} onChange={e => setFormData({...formData, montant_min: Number(e.target.value)})} className="text-xs" />
                          </div>
                          <div className="space-y-2">
                             <Label className="text-xs">Montant Max</Label>
                             <Input type="number" value={formData.montant_max || ''} onChange={e => setFormData({...formData, montant_max: Number(e.target.value)})} className="text-xs" />
                          </div>
                       </div>
                    </div>
                 )}

                 <div className="flex items-center gap-2">
                    <input type="checkbox" id="est_actif" checked={formData.est_actif} onChange={e => setFormData({...formData, est_actif: e.target.checked})} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600" />
                    <Label htmlFor="est_actif" className="cursor-pointer">Produit Actif (Disponible)</Label>
                 </div>

                 <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t">
                    <Button type="button" variant="ghost" className="w-full sm:w-auto order-2 sm:order-1" onClick={() => setShowProductModal(false)}>Annuler</Button>
                    <Button type="submit" variant="brand" className="w-full sm:w-auto order-1 sm:order-2">Enregistrer</Button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
           <div className="bg-background rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
              <div className="border-b p-4 flex items-center justify-between sticky top-0 bg-background">
                 <h2 className="text-lg font-bold">{groupFormData.id ? 'Modifier le Groupe' : 'Nouveau Groupe'}</h2>
                 <Button variant="ghost" size="icon" onClick={() => setShowGroupModal(false)}>
                    <X className="h-5 w-5" />
                 </Button>
              </div>
              <form onSubmit={handleSaveGroup} className="p-4 space-y-6">
                 <div className="space-y-4">
                    <div className="space-y-2">
                       <Label className="text-xs sm:text-sm">Code du Groupe *</Label>
                       <Input required value={groupFormData.code || ''} onChange={e => setGroupFormData({...groupFormData, code: e.target.value})} placeholder="Ex: GRP-CREDIT" className="text-xs" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-xs sm:text-sm">Nom du Groupe *</Label>
                       <Input required value={groupFormData.nom || ''} onChange={e => setGroupFormData({...groupFormData, nom: e.target.value})} placeholder="Ex: Pôle Crédits" className="text-xs" />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-xs sm:text-sm">Description</Label>
                       <Input value={groupFormData.description || ''} onChange={e => setGroupFormData({...groupFormData, description: e.target.value})} placeholder="Courte description..." className="text-xs" />
                    </div>
                 </div>

                 <div className="flex items-center gap-2">
                    <input type="checkbox" id="group_est_actif" checked={groupFormData.est_actif} onChange={e => setGroupFormData({...groupFormData, est_actif: e.target.checked})} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600" />
                    <Label htmlFor="group_est_actif" className="cursor-pointer">Groupe Actif</Label>
                 </div>

                 <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t">
                    <Button type="button" variant="ghost" className="w-full sm:w-auto order-2 sm:order-1" onClick={() => setShowGroupModal(false)}>Annuler</Button>
                    <Button type="submit" variant="brand" className="w-full sm:w-auto order-1 sm:order-2">Enregistrer</Button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* Modal Confirmation Suppression */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm animate-in zoom-in-95">
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3 text-danger-600">
                <AlertTriangle className="h-6 w-6 shrink-0" />
                <h2 className="text-base sm:text-lg font-bold">Confirmer la suppression</h2>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground break-words">
                Voulez-vous vraiment supprimer{' '}
                <span className="font-bold text-foreground">"{confirmDelete.nom}"</span> ?
                Cette action est irréversible.
              </p>
              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                <Button variant="ghost" className="w-full sm:w-auto order-2 sm:order-1" onClick={() => setConfirmDelete(null)}>Annuler</Button>
                <Button variant="destructive" className="w-full sm:w-auto order-1 sm:order-2" onClick={confirmDeleteAction}>Supprimer</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
