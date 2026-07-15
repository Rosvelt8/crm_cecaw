'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { agenceService } from '@/services/agenceService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Cloud, Plus, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const router = useRouter();

  // Agences (réel, via l'API /agences)
  const [agenceList, setAgenceList] = useState<any[]>([]);
  const [agencesLoading, setAgencesLoading] = useState(true);

  const loadAgences = useCallback(async () => {
    setAgencesLoading(true);
    try {
      const res = await agenceService.getAgences({ per_page: 100 });
      setAgenceList(res.data ?? []);
    } catch {
      toast.error('Erreur lors du chargement des agences');
    } finally {
      setAgencesLoading(false);
    }
  }, []);

  useEffect(() => { loadAgences(); }, [loadAgences]);

  const toggleAgence = async (a: any) => {
    try {
      await agenceService.update(a.id, { actif: !a.actif });
      setAgenceList((prev) => prev.map((x) => (x.id === a.id ? { ...x, actif: !x.actif } : x)));
      toast.success(`Agence ${!a.actif ? 'activée' : 'désactivée'}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la mise à jour');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Paramètres du Système</h1>
        <p className="text-muted-foreground">Configuration avancée du CRM pour les administrateurs.</p>
      </div>

      <div className="space-y-6">
        {/* ─── AGENCES ─── */}
        <Card className="animate-in fade-in duration-300">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 text-brand-600" />
              </div>
              <div>
                <CardTitle>Agences & Structure</CardTitle>
                <CardDescription>{agenceList.length} agence{agenceList.length !== 1 ? 's' : ''} enregistrée{agenceList.length !== 1 ? 's' : ''}.</CardDescription>
              </div>
            </div>
            <Button variant="brand" size="sm" onClick={() => router.push('/dashboard/parametres/agences')} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" /> Nouvelle Agence
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {agencesLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Chargement…</div>
            ) : (
              <div className="space-y-3">
                {agenceList.map((a) => (
                  <div key={a.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border rounded-xl hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-xs">
                        {a.nom?.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-sm">{a.nom}</div>
                        <div className="text-[10px] text-muted-foreground">{a.ville}{a.adresse ? ` • ${a.adresse}` : ''}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={a.actif ? 'success' : 'outline'}>
                        {a.actif ? 'Active' : 'Inactive'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs w-full sm:w-auto"
                        onClick={() => toggleAgence(a)}
                      >
                        {a.actif ? 'Désactiver' : 'Activer'}
                      </Button>
                    </div>
                  </div>
                ))}
                {agenceList.length === 0 && (
                  <div className="py-10 text-center text-sm text-muted-foreground">Aucune agence créée.</div>
                )}
              </div>
            )}
            <div className="pt-2 flex justify-end">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => router.push('/dashboard/parametres/agences')}>
                Gestion complète des agences <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ─── État du système ─── */}
        <Card className="bg-muted/20 border-dashed">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Cloud className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold uppercase tracking-wider">État du Système</span>
                  <span className="text-xs text-muted-foreground">Version 1.0.0-PROD • Tous les services opérationnels</span>
                </div>
              </div>
              <Badge variant="success" className="h-6">ONLINE</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
