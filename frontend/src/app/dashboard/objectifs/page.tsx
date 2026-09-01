'use client';

import { useState, useEffect, useCallback } from 'react';
import { objectifService } from '@/services/objectifService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Target, TrendingUp, Users, Wallet, PiggyBank, Calendar,
  ArrowUpRight, Activity, Flame, RefreshCw
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Package } from 'lucide-react';
import { toast } from 'sonner';

const categoryIcons: Record<string, React.ElementType> = {
  epargne: PiggyBank,
  credit: Wallet,
  crm: Users,
};

export default function ObjectifsPage() {
  const [objectifs, setObjectifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await objectifService.getAllObjectifs();
      setObjectifs(rows);
    } catch { toast.error('Erreur lors du chargement des objectifs'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const atteints = objectifs.filter((o) => o.statut === 'atteint' || o.statut === 'depasse').length;
  const enCours = objectifs.filter((o) => o.statut === 'en_cours').length;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Mes Objectifs</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Suivez vos performances individuelles et contribuez à la croissance de l'agence.</p>
        </div>
        <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
          {enCours > 0 && (
            <div className="flex flex-col items-end text-right w-full sm:w-auto">
              <div className="flex items-center gap-1 text-brand-600 font-bold text-xs sm:text-sm">
                <Flame className="h-4 w-4 shrink-0" />
                <span>{enCours} objectif{enCours > 1 ? 's' : ''} en cours</span>
              </div>
              <span className="text-[10px] text-muted-foreground uppercase">Performance continue</span>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="w-full sm:w-auto">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-3">
        <Card className="p-4 sm:p-6 bg-brand-600 text-white border-none relative overflow-hidden group">
          <div className="absolute right-[-10px] top-[-10px] opacity-10 group-hover:scale-125 transition-transform duration-700">
            <Activity className="h-24 w-24" />
          </div>
          <div className="relative z-10 space-y-3 sm:space-y-4">
            <div className="text-brand-200 text-[10px] font-bold uppercase tracking-[2px]">Objectifs</div>
            <div className="text-3xl sm:text-4xl font-black italic">{objectifs.length > 0 ? `${atteints}/${objectifs.length}` : '—'}</div>
            <div className="flex items-center gap-2 text-xs text-brand-100">
              <TrendingUp className="h-3 w-3" />
              <span>{atteints} atteint{atteints !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-2 border-brand-100 bg-brand-50/30 md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm">Progression Globale</h3>
            {atteints > 0 && (
              <Badge variant="brand">
                {Math.round((atteints / Math.max(objectifs.length, 1)) * 100)}% complétés
              </Badge>
            )}
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-end justify-between text-xs">
                <span className="font-medium text-muted-foreground">Objectifs atteints</span>
                <span className="font-bold">{objectifs.length > 0 ? `${Math.round((atteints / objectifs.length) * 100)}%` : '—'}</span>
              </div>
              <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full"
                  style={{ width: objectifs.length > 0 ? `${Math.round((atteints / objectifs.length) * 100)}%` : '0%' }}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 border-t pt-3 sm:pt-4">
              <div className="text-center">
                <div className="text-[10px] text-muted-foreground uppercase font-bold">Total</div>
                <div className="text-sm font-black">{loading ? '…' : objectifs.length}</div>
              </div>
              <div className="text-center border-x">
                <div className="text-[10px] text-muted-foreground uppercase font-bold">En cours</div>
                <div className="text-sm font-black">{loading ? '…' : enCours}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-muted-foreground uppercase font-bold">Atteints</div>
                <div className="text-sm font-black">{loading ? '…' : atteints}</div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground text-sm">Chargement…</div>
      ) : objectifs.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          <Target className="h-10 w-10 mx-auto opacity-20 mb-3" />
          <p>Aucun objectif défini pour le moment.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-6">
          <h2 className="text-lg sm:text-xl font-bold">Détail des Objectifs</h2>
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
            {objectifs.map((obj) => {
              const Icon = categoryIcons[obj.type as string] || Target;
              const actuelle = obj.valeur_actuelle ?? obj.valeurActuelle ?? 0;
              const cible = obj.valeur_cible ?? obj.valeurCible ?? 1;
              const percent = Math.min(Math.round((actuelle / cible) * 100), 100);
              const unite = obj.unite ?? obj.type ?? '';
              const statut = obj.statut ?? 'en_cours';

              return (
                <Card key={obj.id} className="p-3 sm:p-5 group">
                  <div className="flex items-start justify-between gap-2 mb-4 sm:mb-6">
                    <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1">
                      <div className={cn(
                        'h-8 w-8 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300 shrink-0',
                        statut === 'atteint' || statut === 'depasse' ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-100 text-brand-700'
                      )}>
                        <Icon className="h-4 sm:h-5 w-4 sm:w-5" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-xs sm:text-sm break-words">{obj.titre ?? obj.nom}</span>
                        {(obj.date_fin ?? obj.dateFin) && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase tracking-wider mt-0.5">
                            <Calendar className="h-2.5 w-2.5 shrink-0" /> Échéance: {new Date(obj.date_fin ?? obj.dateFin).toLocaleDateString('fr-FR')}
                          </span>
                        )}
                        {obj.produit && (
                          <span className="text-[10px] text-brand-600 font-bold flex items-center gap-1 mt-0.5">
                            <Package className="h-2.5 w-2.5 shrink-0" /> Produit: {obj.produit.nom}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant={
                      statut === 'atteint' || statut === 'depasse' ? 'success' :
                      statut === 'en_risque' ? 'destructive' : 'brand'
                    } className="shrink-0 text-xs">
                      {percent}%
                    </Badge>
                  </div>

                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-end justify-between gap-2">
                      <div className="flex flex-col min-w-0">
                        <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Actuel</span>
                        <span className="text-base sm:text-lg font-black italic break-words">
                          {unite === 'FCFA' ? formatCurrency(actuelle, true) : actuelle} {unite !== 'FCFA' && unite}
                        </span>
                      </div>
                      <div className="flex flex-col items-end min-w-0 flex-1">
                        <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Cible</span>
                        <span className="text-xs sm:text-sm font-bold text-muted-foreground break-words text-right">
                          {unite === 'FCFA' ? formatCurrency(cible, true) : cible} {unite !== 'FCFA' && unite}
                        </span>
                      </div>
                    </div>

                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-1000',
                          statut === 'atteint' || statut === 'depasse' ? 'bg-emerald-500' :
                          statut === 'en_risque' ? 'bg-red-500' : 'bg-brand-500'
                        )}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-muted-foreground italic capitalize">{statut.replace(/_/g, ' ')}</span>
                    <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold group-hover:text-brand-600">
                      DÉTAILS <ArrowUpRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
