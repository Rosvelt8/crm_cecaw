'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EnTete, Kpi, fcfa } from '@/components/ui/kpi';
import { recouvrementApi } from '@/services/metierService';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { CLASSES, STATUTS } from '@/lib/recouvrementLabels';

export default function RecouvrementPage() {
  const { can } = useCan();
  const [tb, setTb] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [classe, setClasse] = useState('');
  const [statut, setStatut] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const [t, l] = await Promise.all([recouvrementApi.tableau(), recouvrementApi.lister({ page, per_page: 20, classe: classe || undefined, statut: statut || undefined, search: search || undefined })]);
      setTb(t); setItems(l.items); setTotal(l.meta.total ?? l.items.length); setErreur(null);
    } catch (e) { setErreur(msg(e, 'Chargement impossible')); }
    finally { setChargement(false); }
  }, [page, classe, statut, search]);
  useEffect(() => { const t = setTimeout(charger, 250); return () => clearTimeout(t); }, [charger]);

  const detecter = async () => {
    try { const r = await recouvrementApi.detecter(); toast.success(`Détection terminée : ${r.ouverts} ouvert(s), ${r.regularises} régularisé(s)`); await charger(); }
    catch (e) { toast.error(msg(e)); }
  };

  return (
    <div className="space-y-4">
      <EnTete titre="Recouvrement" sousTitre="Impayés, relances graduées, promesses, plans et escalade">
        {can('recouvrement:EXECUTE', 'recouvrement:APPROVE') && <Button variant="outline" onClick={detecter}><RefreshCw className="h-4 w-4 mr-1.5" />Lancer la détection</Button>}
      </EnTete>

      {tb && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Dossiers actifs" valeur={tb.dossiers_actifs} />
          <Kpi label="Montant impayé" valeur={fcfa(tb.montant_impaye)} precision={`+ ${fcfa(tb.penalites)} de pénalités`} ton={tb.montant_impaye > 0 ? 'mauvais' : undefined} />
          <Kpi label="Portefeuille à risque > 30 j" valeur={`${tb.par30} %`} precision={`PAR 1 j : ${tb.par1} %, PAR 90 j : ${tb.par90} %`} ton={tb.par30 > 10 ? 'mauvais' : tb.par30 > 5 ? 'alerte' : 'bon'} />
          <Kpi label="Taux de recouvrement" valeur={`${tb.taux_recouvrement} %`} precision={`${fcfa(tb.montant_recouvre)} recouvrés · retard ${tb.taux_retard} %`} />
        </div>
      )}
      {tb && tb.par_classe.length > 0 && (
        <Card><CardContent className="p-3 flex flex-wrap gap-2">
          {tb.par_classe.map((c: any) => (
            <button key={c.classe} onClick={() => { setClasse(classe === c.classe ? '' : c.classe); setPage(1); }}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${classe === c.classe ? 'border-brand-600 bg-brand-50' : 'hover:bg-muted'}`}>
              <p className="font-medium">{CLASSES[c.classe]}</p><p className="text-xs text-muted-foreground">{c.nb} dossier(s) · {fcfa(c.montant)}</p>
            </button>
          ))}
        </CardContent></Card>
      )}

      <Card><CardContent className="p-4 flex flex-wrap gap-3">
        <Input className="max-w-xs" placeholder="Référence ou client…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="h-10 rounded-lg border bg-background px-3 text-sm" value={statut} onChange={(e) => { setStatut(e.target.value); setPage(1); }}>
          <option value="">Dossiers actifs</option>{Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
        </select>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        {erreur ? <p className="p-6 text-sm text-destructive">{erreur}</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Dossier</TableHead><TableHead>Client</TableHead><TableHead className="text-right">Impayé</TableHead><TableHead>Retard</TableHead><TableHead>Relance</TableHead><TableHead>Statut</TableHead><TableHead>Agent</TableHead></TableRow></TableHeader>
            <TableBody>
              {chargement ? <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Chargement…</TableCell></TableRow>
                : items.length === 0 ? <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Aucun dossier</TableCell></TableRow>
                : items.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell><Link href={`/dashboard/recouvrement/${d.id}`} className="font-medium text-brand-700 hover:underline">{d.reference}</Link><p className="text-xs text-muted-foreground">{d.demande.reference}</p></TableCell>
                    <TableCell>{d.client.prenom} {d.client.nom}<p className="text-xs text-muted-foreground">{d.client.telephone}</p></TableCell>
                    <TableCell className="text-right tabular-nums">{fcfa(d.montantImpaye)}</TableCell>
                    <TableCell><Badge variant={d.joursRetard > 90 ? 'destructive' : d.joursRetard > 30 ? 'warning' : 'outline'}>{d.joursRetard} j</Badge></TableCell>
                    <TableCell>{d.niveauAtteint}/{d.niveauRequis}{d.niveauAtteint < d.niveauRequis && <span className="ml-1 text-xs text-destructive">à faire</span>}</TableCell>
                    <TableCell><Badge variant={STATUTS[d.statut].v}>{STATUTS[d.statut].l}</Badge></TableCell>
                    <TableCell>{d.agent ? `${d.agent.prenom} ${d.agent.nom}` : <span className="text-warning-700">Non assigné</span>}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
      {total > 20 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</Button>
          <span>Page {page} / {Math.ceil(total / 20)}</span>
          <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Suivant</Button>
        </div>
      )}
    </div>
  );
}
