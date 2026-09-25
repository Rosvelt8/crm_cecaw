'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { kycService, type DossierKycListe, type StatutKyc } from '@/services/kycService';
import { clientService } from '@/services/clientService';
import { useCan } from '@/hooks/useCan';
import { formatDate } from '@/lib/utils';
import { RISQUE, STATUT_KYC } from '@/lib/kycLabels';

export default function KycPage() {
  const router = useRouter();
  const { can } = useCan();
  const [items, setItems] = useState<DossierKycListe[]>([]);
  const [statut, setStatut] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [clients, setClients] = useState<{ id: number; nom: string; prenom: string | null; telephone: string }[]>([]);

  const charger = useCallback(async () => {
    setChargement(true);
    try { setItems((await kycService.lister({ per_page: 50, statut: statut || undefined })).data); setErreur(null); }
    catch (e) { setErreur((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Chargement impossible'); }
    finally { setChargement(false); }
  }, [statut]);
  useEffect(() => { void charger(); }, [charger]);

  useEffect(() => {
    if (!creation) return;
    const t = setTimeout(() => { clientService.getClients({ per_page: 10, search: recherche || undefined }).then((r) => setClients(r.data)).catch(() => setClients([])); }, 300);
    return () => clearTimeout(t);
  }, [creation, recherche]);

  const ouvrir = async (clientId: number) => {
    try { const d = await kycService.creer({ client_id: clientId }); toast.success(`Dossier ${d.reference} ouvert`); router.push(`/dashboard/kyc/${d.id}`); }
    catch (e) { toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Création impossible'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Dossiers KYC</h1><p className="text-sm text-muted-foreground">Contrôle documentaire, LCB-FT et niveau de risque</p></div>
        <div className="flex gap-2">
          <select className="h-10 rounded-lg border bg-background px-3 text-sm" value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="">Tous les statuts</option>
            {(Object.keys(STATUT_KYC) as StatutKyc[]).map((s) => <option key={s} value={s}>{STATUT_KYC[s].l}</option>)}
          </select>
          {can('kyc:CREATE') && <Button variant="brand" onClick={() => setCreation((c) => !c)}><Plus className="h-4 w-4 mr-1.5" />Nouveau dossier</Button>}
        </div>
      </div>

      {creation && (
        <Card><CardContent className="p-4 space-y-2">
          <Input placeholder="Rechercher le client à contrôler…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
            {clients.length === 0 && <p className="p-3 text-sm text-muted-foreground">Aucun client</p>}
            {clients.map((c) => <button key={c.id} className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onClick={() => ouvrir(c.id)}>{c.prenom} {c.nom} <span className="text-muted-foreground">· {c.telephone}</span></button>)}
          </div>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        {erreur ? <p className="p-6 text-sm text-destructive">{erreur}</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Référence</TableHead><TableHead>Personne</TableHead><TableHead>Statut</TableHead><TableHead>Risque</TableHead><TableHead>Constitué par</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
            <TableBody>
              {chargement ? <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Chargement…</TableCell></TableRow>
                : items.length === 0 ? <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Aucun dossier</TableCell></TableRow>
                : items.map((k) => {
                  const p = k.client ?? k.prospect;
                  return (
                    <TableRow key={k.id}>
                      <TableCell><Link href={`/dashboard/kyc/${k.id}`} className="font-medium text-brand-700 hover:underline">{k.reference}</Link></TableCell>
                      <TableCell>{p ? `${p.prenom ?? ''} ${p.nom}` : '—'}{k.prospect && <span className="ml-1 text-xs text-muted-foreground">(prospect)</span>}</TableCell>
                      <TableCell><Badge variant={STATUT_KYC[k.statut].v}>{STATUT_KYC[k.statut].l}</Badge></TableCell>
                      <TableCell>{k.niveauRisque ? <Badge variant={RISQUE[k.niveauRisque].v}>{RISQUE[k.niveauRisque].l} {k.scoreLcbft != null ? `(${k.scoreLcbft})` : ''}</Badge> : '—'}</TableCell>
                      <TableCell>{k.creePar.prenom} {k.creePar.nom}</TableCell>
                      <TableCell>{formatDate(k.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}
