'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { creditService } from '@/services/creditService';
import { useCan } from '@/hooks/useCan';
import { formatCurrency, formatDate } from '@/lib/utils';
import { STATUT_LABELS, STATUT_VARIANT, type DemandeCreditListe, type StatutDemandeCredit } from '@/types/credit';

const PAR_PAGE = 20;

export default function CreditsPage() {
  const { can } = useCan();
  const [items, setItems] = useState<DemandeCreditListe[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const r = await creditService.lister({ page, per_page: PAR_PAGE, search: recherche || undefined, statut: statut || undefined });
      setItems(r.data);
      setTotal(r.meta?.total ?? r.data.length);
    } catch (e: unknown) {
      setErreur((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Chargement impossible');
    } finally {
      setChargement(false);
    }
  }, [page, recherche, statut]);

  // Recherche différée : on n'interroge pas l'API à chaque frappe.
  useEffect(() => {
    const t = setTimeout(charger, 300);
    return () => clearTimeout(t);
  }, [charger]);

  const nbPages = Math.max(1, Math.ceil(total / PAR_PAGE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Demandes de crédit</h1>
          <p className="text-sm text-muted-foreground">{total} dossier(s) dans votre périmètre</p>
        </div>
        {can('credit:CREATE') && (
          <Link href="/dashboard/credits/nouveau"><Button variant="brand"><Plus className="h-4 w-4 mr-1.5" />Nouvelle demande</Button></Link>
        )}
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Référence ou client…" value={recherche} onChange={(e) => { setRecherche(e.target.value); setPage(1); }} />
          </div>
          <select className="h-10 rounded-lg border bg-background px-3 text-sm" value={statut} onChange={(e) => { setStatut(e.target.value); setPage(1); }}>
            <option value="">Tous les statuts</option>
            {(Object.keys(STATUT_LABELS) as StatutDemandeCredit[]).map((s) => <option key={s} value={s}>{STATUT_LABELS[s]}</option>)}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {erreur ? (
            <p className="p-6 text-sm text-destructive">{erreur}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead><TableHead>Client</TableHead><TableHead>Produit</TableHead>
                  <TableHead className="text-right">Montant</TableHead><TableHead>Durée</TableHead>
                  <TableHead>Statut</TableHead><TableHead>Score</TableHead><TableHead>Agence</TableHead><TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chargement ? (
                  <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Chargement…</TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">Aucune demande</TableCell></TableRow>
                ) : items.map((d) => (
                  <TableRow key={d.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell><Link href={`/dashboard/credits/${d.id}`} className="font-medium text-brand-700 hover:underline">{d.reference}</Link></TableCell>
                    <TableCell>{d.client.prenom} {d.client.nom}</TableCell>
                    <TableCell>{d.produit.nom}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(Number(d.montantAccorde ?? d.montantDemande))}</TableCell>
                    <TableCell>{d.dureeMois} mois</TableCell>
                    <TableCell><Badge variant={STATUT_VARIANT[d.statut]}>{STATUT_LABELS[d.statut]}</Badge></TableCell>
                    <TableCell>{d.scoreValeur != null ? `${d.scoreValeur} (${d.scoreClasse})` : '—'}</TableCell>
                    <TableCell>{d.agence.nom}</TableCell>
                    <TableCell>{formatDate(d.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {nbPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</Button>
          <span>Page {page} / {nbPages}</span>
          <Button variant="outline" size="sm" disabled={page >= nbPages} onClick={() => setPage(page + 1)}>Suivant</Button>
        </div>
      )}
    </div>
  );
}
