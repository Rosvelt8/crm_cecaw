'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Play, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EnTete } from '@/components/ui/kpi';
import { administrationApi } from '@/services/metierService';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { formatDateTime } from '@/lib/utils';

const CATEGORIES: Record<string, string> = {
  credit: 'Crédit et délégations', recouvrement: 'Recouvrement', communication: 'Communication', terrain: 'Terrain et tournées', territoire: 'Territoire',
  conformite: 'Conformité', objectifs: 'Objectifs', securite: 'Sécurité',
  segmentation: 'Segmentation client', commercial: 'Relances commerciales',
};

/** Convertit la saisie texte vers le type de la valeur par défaut du paramètre. */
function analyser(defaut: unknown, saisie: string): unknown {
  if (typeof defaut === 'number') return Number(saisie);
  if (typeof defaut === 'boolean') return saisie === 'true';
  if (Array.isArray(defaut)) return saisie.split(/[;,\s]+/).filter(Boolean).map(Number);
  return JSON.parse(saisie);
}
const afficher = (v: unknown) => (typeof v === 'object' && v !== null && !Array.isArray(v) ? JSON.stringify(v) : Array.isArray(v) ? v.join(', ') : String(v));

export default function ParametresSystemePage() {
  const { can } = useCan();
  const modif = can('administration:CONFIGURE');
  const [params, setParams] = useState<any[]>([]);
  const [taches, setTaches] = useState<any[]>([]);
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try { const [p, t] = await Promise.all([administrationApi.parametres(), administrationApi.taches()]); setParams(p); setTaches(t); setErreur(null); }
    catch (e) { setErreur(msg(e, 'Accès refusé')); } finally { setChargement(false); }
  }, []);
  useEffect(() => { void charger(); }, [charger]);

  const enregistrer = async (p: any) => {
    const brut = saisies[p.cle];
    if (brut === undefined) return;
    try { await administrationApi.definir(p.cle, analyser(p.defaut, brut)); toast.success('Paramètre enregistré'); setSaisies(({ [p.cle]: _omis, ...reste }) => { void _omis; return reste; }); await charger(); }
    catch (e) { toast.error(msg(e, 'Valeur refusée')); }
  };

  if (chargement) return <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (erreur) return <p className="text-destructive">{erreur}</p>;

  return (
    <div className="space-y-4">
      <EnTete titre="Paramètres système" sousTitre="Seuils, délégations et règles métier modifiables sans redéploiement. Chaque changement est journalisé." />
      {Object.entries(CATEGORIES).map(([cat, libelle]) => {
        const liste = params.filter((p) => p.categorie === cat);
        if (liste.length === 0) return null;
        return (
          <Card key={cat}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{libelle}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {liste.map((p) => (
                <div key={p.cle} className="grid md:grid-cols-12 gap-2 items-center border-b last:border-0 pb-3 last:pb-0">
                  <div className="md:col-span-6"><p className="text-sm font-medium">{p.description}</p><p className="text-xs text-muted-foreground">{p.cle}{p.modifie && <Badge variant="info" className="ml-2">Modifié</Badge>}</p></div>
                  <div className="md:col-span-4">
                    {typeof p.defaut === 'boolean' ? (
                      <select disabled={!modif} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={saisies[p.cle] ?? String(p.valeur)} onChange={(e) => setSaisies({ ...saisies, [p.cle]: e.target.value })}><option value="true">Oui</option><option value="false">Non</option></select>
                    ) : <Input disabled={!modif} className="h-9" value={saisies[p.cle] ?? afficher(p.valeur)} onChange={(e) => setSaisies({ ...saisies, [p.cle]: e.target.value })} />}
                  </div>
                  <div className="md:col-span-2 flex gap-1 justify-end">
                    {modif && <Button size="sm" variant="brand" disabled={saisies[p.cle] === undefined} onClick={() => enregistrer(p)}>OK</Button>}
                    {modif && p.modifie && <Button size="sm" variant="ghost" title="Valeur par défaut" onClick={async () => { try { await administrationApi.reinitialiser(p.cle); await charger(); } catch (e) { toast.error(msg(e)); } }}><RotateCcw className="h-4 w-4" /></Button>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Tâches planifiées</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {taches.map((t) => (
            <div key={t.nom} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <div><p className="font-medium">{t.libelle}</p><p className="text-xs text-muted-foreground">{t.planification}{!t.active && ' · désactivée'} · dernière : {t.derniere_execution ? `${formatDateTime(t.derniere_execution)} (${t.dernier_statut})` : 'jamais'}{t.derniere_erreur ? ` · ${t.derniere_erreur}` : ''}</p></div>
              {modif && <Button size="sm" variant="outline" onClick={async () => { try { const r = await administrationApi.executerTache(t.nom); toast.success(r.execute ? 'Tâche exécutée' : r.raison); await charger(); } catch (e) { toast.error(msg(e)); } }}><Play className="h-4 w-4 mr-1" />Exécuter</Button>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
