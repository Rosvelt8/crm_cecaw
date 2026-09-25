'use client';
/* eslint-disable react/no-unescaped-entities -- texte français : les apostrophes sont légitimes dans le JSX */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { clientService } from '@/services/clientService';
import { produitService } from '@/services/produitService';
import { creditService } from '@/services/creditService';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Periodicite, Simulation, TypeCredit } from '@/types/credit';

interface ClientOption { id: number; nom: string; prenom: string | null; telephone: string }
interface ProduitOption { id: number; nom: string; type?: string }

const message = (e: unknown, defaut: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? defaut;

export default function NouvelleDemandePage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [recherche, setRecherche] = useState('');
  const [produits, setProduits] = useState<ProduitOption[]>([]);

  const [clientId, setClientId] = useState<number | null>(null);
  const [produitId, setProduitId] = useState<number | null>(null);
  const [typeCredit, setTypeCredit] = useState<TypeCredit>('individuel');
  const [montant, setMontant] = useState(0);
  const [duree, setDuree] = useState(12);
  const [periodicite, setPeriodicite] = useState<Periodicite>('mensuel');
  const [differe, setDiffere] = useState(0);
  const [objet, setObjet] = useState('');

  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [erreurSimulation, setErreurSimulation] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    produitService.getProduits({ per_page: 100 } as never)
      .then((r) => setProduits((r.data as ProduitOption[]).filter((p) => p.type === 'credit')))
      .catch(() => toast.error('Produits indisponibles'));
  }, []);

  // Recherche de client différée pour ne pas interroger l'API à chaque frappe.
  useEffect(() => {
    const t = setTimeout(() => {
      clientService.getClients({ per_page: 20, search: recherche || undefined })
        .then((r) => setClients(r.data))
        .catch(() => setClients([]));
    }, 300);
    return () => clearTimeout(t);
  }, [recherche]);

  // Simulation en direct : elle applique le paramétrage du produit et les règles d'éligibilité.
  useEffect(() => {
    if (!produitId || montant <= 0 || duree <= 0) { setSimulation(null); setErreurSimulation(null); return; }
    let annule = false;
    const t = setTimeout(async () => {
      try {
        const s = await creditService.simuler({ produit_id: produitId, montant, duree_mois: duree, periodicite, differe_mois: differe || undefined, client_id: clientId ?? undefined });
        if (!annule) { setSimulation(s); setErreurSimulation(null); }
      } catch (e) {
        if (!annule) { setSimulation(null); setErreurSimulation(message(e, 'Simulation impossible')); }
      }
    }, 400);
    return () => { annule = true; clearTimeout(t); };
  }, [produitId, montant, duree, periodicite, differe, clientId]);

  const pret = clientId && produitId && montant > 0 && duree > 0 && objet.trim().length >= 3;
  const clientChoisi = useMemo(() => clients.find((c) => c.id === clientId), [clients, clientId]);

  const enregistrer = async (soumettre: boolean) => {
    if (!pret) return;
    setEnvoi(true);
    try {
      const d = await creditService.creer({
        client_id: clientId!, produit_id: produitId!, type_credit: typeCredit, montant_demande: montant,
        duree_mois: duree, periodicite, differe_mois: differe || undefined, objet,
      });
      if (soumettre) {
        try { await creditService.soumettre(d.id); toast.success(`Demande ${d.reference} soumise`); }
        catch (e) { toast.error(`Demande ${d.reference} créée en brouillon, mais non soumise : ${message(e, 'erreur')}`); }
      } else {
        toast.success(`Brouillon ${d.reference} enregistré`);
      }
      router.push(`/dashboard/credits/${d.id}`);
    } catch (e) {
      toast.error(message(e, 'Création impossible'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <Link href="/dashboard/credits" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4 mr-1" />Demandes de crédit</Link>
      <h1 className="text-2xl font-bold">Nouvelle demande de crédit</h1>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Demande</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Input placeholder="Rechercher un client…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
              <div className="max-h-40 overflow-y-auto rounded-md border divide-y">
                {clients.length === 0 && <p className="p-3 text-sm text-muted-foreground">Aucun client</p>}
                {clients.map((c) => (
                  <button key={c.id} type="button" onClick={() => setClientId(c.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${c.id === clientId ? 'bg-brand-50 font-medium' : ''}`}>
                    {c.prenom} {c.nom} <span className="text-muted-foreground">· {c.telephone}</span>
                  </button>
                ))}
              </div>
              {clientId && <p className="text-xs text-muted-foreground">Sélectionné : {clientChoisi ? `${clientChoisi.prenom ?? ''} ${clientChoisi.nom}` : `#${clientId}`}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Produit de crédit</Label>
                <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={produitId ?? ''} onChange={(e) => setProduitId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Choisir…</option>
                  {produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select>
                {produits.length === 0 && <p className="text-xs text-warning-700">Aucun produit de crédit : l'administrateur fonctionnel doit en typer au moins un dans Paramètres › Paramétrage financier.</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={typeCredit} onChange={(e) => setTypeCredit(e.target.value as TypeCredit)}>
                  <option value="individuel">Individuel</option><option value="solidaire">Solidaire</option><option value="pme">PME</option><option value="agricole">Agricole</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Périodicité</Label>
                <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={periodicite} onChange={(e) => setPeriodicite(e.target.value as Periodicite)}>
                  <option value="mensuel">Mensuelle</option><option value="bimensuel">Bimestrielle</option><option value="trimestriel">Trimestrielle</option><option value="semestriel">Semestrielle</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Montant demandé</Label><Input type="number" min={0} value={montant || ''} onChange={(e) => setMontant(Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label>Durée (mois)</Label><Input type="number" min={1} value={duree || ''} onChange={(e) => setDuree(Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label>Différé (mois)</Label><Input type="number" min={0} value={differe || ''} onChange={(e) => setDiffere(Number(e.target.value))} /></div>
            </div>

            <div className="space-y-1.5">
              <Label>Objet du crédit</Label>
              <Textarea rows={3} value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Ex. achat de stock de marchandises pour la boutique" />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" disabled={!pret || envoi} onClick={() => enregistrer(false)}>{envoi && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Enregistrer en brouillon</Button>
              <Button variant="brand" disabled={!pret || envoi || (simulation !== null && !simulation.eligible)} onClick={() => enregistrer(true)}>Enregistrer et soumettre</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Simulation</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {erreurSimulation && <p className="flex items-start gap-2 text-sm text-warning-700"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{erreurSimulation}</p>}
            {!simulation && !erreurSimulation && <p className="text-sm text-muted-foreground">Choisissez un produit et renseignez montant et durée pour voir l'échéancier.</p>}
            {simulation && (
              <>
                {!simulation.eligible && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1">
                    <p className="font-medium text-destructive">Demande non éligible</p>
                    {simulation.motifs_ineligibilite.map((m) => <p key={m}>{m}</p>)}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Taux annuel</p><p className="font-semibold">{simulation.taux_annuel} %</p></div>
                  <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">1re échéance</p><p className="font-semibold">{formatCurrency(simulation.premiereEcheance)}</p></div>
                  <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Total des intérêts</p><p className="font-semibold">{formatCurrency(simulation.totalInterets)}</p></div>
                  <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Frais de dossier</p><p className="font-semibold">{formatCurrency(simulation.frais_dossier)}</p></div>
                  <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Total à rembourser</p><p className="font-semibold">{formatCurrency(simulation.totalARembourser)}</p></div>
                  <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">TEG approché</p><p className="font-semibold">{simulation.teg} %</p></div>
                </div>
                <Badge variant="outline">Amortissement {simulation.mode_amortissement}</Badge>
                <div className="max-h-72 overflow-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0"><tr><th className="px-2 py-1.5 text-left">N°</th><th className="px-2 py-1.5 text-left">Date</th><th className="px-2 py-1.5 text-right">Capital</th><th className="px-2 py-1.5 text-right">Intérêts</th><th className="px-2 py-1.5 text-right">Échéance</th><th className="px-2 py-1.5 text-right">Restant dû</th></tr></thead>
                    <tbody>
                      {simulation.lignes.map((l) => (
                        <tr key={l.numero} className="border-t">
                          <td className="px-2 py-1">{l.numero}</td><td className="px-2 py-1">{formatDate(l.dateEcheance)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{formatCurrency(l.capital)}</td><td className="px-2 py-1 text-right tabular-nums">{formatCurrency(l.interet)}</td>
                          <td className="px-2 py-1 text-right tabular-nums font-medium">{formatCurrency(l.montantTotal)}</td><td className="px-2 py-1 text-right tabular-nums">{formatCurrency(l.capitalRestantDu)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
