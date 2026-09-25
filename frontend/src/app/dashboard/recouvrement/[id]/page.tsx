'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Kpi, fcfa } from '@/components/ui/kpi';
import { recouvrementApi } from '@/services/metierService';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { formatDate, formatDateTime } from '@/lib/utils';
import { CLASSES, STATUTS } from '@/lib/recouvrementLabels';

const CANAUX: Record<string, string> = { sms: 'SMS', appel: 'Appel', visite: 'Visite', courrier: 'Courrier', email: 'Email' };
const NIVEAUX = ['', 'Relance amiable', 'Rappel formel', 'Second avis / visite', 'Mise en demeure'];
const demain = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

export default function DossierRecouvrementPage() {
  const { id } = useParams<{ id: string }>();
  const dossierId = Number(id);
  const { can } = useCan();
  const [d, setD] = useState<any>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [rel, setRel] = useState({ canal: 'appel', message: '', resultat: '' });
  const [pro, setPro] = useState({ montant: 0, date: demain(), commentaire: '' });
  const [plan, setPlan] = useState({ nb: 3, date: demain() });
  const [esc, setEsc] = useState({ vers: 'precontentieux', motif: '' });

  const charger = useCallback(async () => {
    try { setD(await recouvrementApi.obtenir(dossierId)); setErreur(null); } catch (e) { setErreur(msg(e, 'Dossier introuvable')); }
  }, [dossierId]);
  useEffect(() => { void charger(); }, [charger]);

  const agir = async (fn: () => Promise<unknown>, ok: string) => {
    setOccupe(true);
    try { await fn(); toast.success(ok); await charger(); } catch (e) { toast.error(msg(e)); } finally { setOccupe(false); }
  };

  /** Position de l'appareil : indispensable pour une visite de recouvrement (preuve de passage). */
  const position = () => new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Géolocalisation indisponible sur cet appareil'));
    navigator.geolocation.getCurrentPosition((p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }), () => reject(new Error("Position refusée ou indisponible")), { enableHighAccuracy: true, timeout: 15000 });
  });

  if (erreur) return <div className="space-y-3"><Link href="/dashboard/recouvrement" className="text-sm text-muted-foreground inline-flex items-center"><ArrowLeft className="h-4 w-4 mr-1" />Retour</Link><p className="text-destructive">{erreur}</p></div>;
  if (!d) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Chargement…</div>;

  const clos = ['regularise', 'irrecouvrable'].includes(d.statut);
  const peutAgir = !clos && d.statut !== 'contentieux';
  const planOuvert = d.plans.find((p: any) => ['propose', 'actif'].includes(p.statut));
  const relancer = can('recouvrement:EXECUTE');
  const escalader = can('recouvrement:APPROVE');

  return (
    <div className="space-y-4">
      <Link href="/dashboard/recouvrement" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4 mr-1" />Recouvrement</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{d.reference}</h1>
        <Badge variant={STATUTS[d.statut].v}>{STATUTS[d.statut].l}</Badge>
        <Badge variant="outline">{CLASSES[d.classe]}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {d.client.prenom} {d.client.nom} · {d.client.telephone} · crédit <Link href={`/dashboard/credits/${d.demande.id}`} className="text-brand-700 hover:underline">{d.demande.reference}</Link> · {d.agence.nom}
        {d.agent ? ` · agent ${d.agent.prenom} ${d.agent.nom}` : ' · non assigné'}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Retard" valeur={`${d.joursRetard} j`} ton={d.joursRetard > 90 ? 'mauvais' : 'alerte'} precision={`${d.nbEcheancesImpayees} échéance(s)`} />
        <Kpi label="Impayé" valeur={fcfa(d.montantImpaye)} />
        <Kpi label="Pénalités" valeur={fcfa(d.penalites)} />
        <Kpi label="Capital restant dû" valeur={fcfa(d.capitalRestantDu)} />
        <Kpi label="Relance" valeur={`${d.niveauAtteint} / ${d.niveauRequis}`} ton={d.niveauAtteint < d.niveauRequis ? 'mauvais' : 'bon'} precision={NIVEAUX[d.niveauRequis]} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {peutAgir && relancer && (
            <Card>
              <CardHeader><CardTitle className="text-base">Enregistrer une relance</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Canal</Label>
                    <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={rel.canal} onChange={(e) => setRel({ ...rel, canal: e.target.value })}>{Object.entries(CANAUX).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div className="space-y-1.5 sm:col-span-2"><Label>Message ou résultat</Label><Input value={rel.resultat} onChange={(e) => setRel({ ...rel, resultat: e.target.value })} placeholder="Ex. le client s'engage à payer vendredi" /></div>
                </div>
                <Button variant="brand" size="sm" disabled={occupe} onClick={() => agir(async () => {
                  const pos = rel.canal === 'visite' ? await position().catch((e) => { throw new Error(e.message); }) : {};
                  await recouvrementApi.relancer(dossierId, { canal: rel.canal, resultat: rel.resultat || undefined, ...pos });
                  setRel({ ...rel, resultat: '' });
                }, 'Relance enregistrée')}>
                  {rel.canal === 'visite' && <MapPin className="h-4 w-4 mr-1.5" />}Enregistrer{rel.canal === 'visite' ? ' (avec ma position)' : ''}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Historique des relances ({d.relances.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {d.relances.length === 0 && <p className="text-sm text-muted-foreground">Aucune relance.</p>}
              {d.relances.map((r: any) => (
                <div key={r.id} className="rounded-md border p-2 text-sm">
                  <p className="font-medium">Niveau {r.niveau} · {CANAUX[r.canal]}{r.automatique && <span className="ml-2 text-xs text-muted-foreground">(automatique)</span>}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(r.relanceAt)}{r.agent ? ` · ${r.agent.prenom} ${r.agent.nom}` : ''}{r.latitude ? ` · position ${Number(r.latitude).toFixed(4)}, ${Number(r.longitude).toFixed(4)}` : ''}</p>
                  {(r.resultat || r.message) && <p className="mt-0.5">{r.resultat ?? r.message}</p>}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Échéances impayées</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm"><thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">N°</th><th className="px-3 py-2 text-left">Échéance</th><th className="px-3 py-2 text-right">Dû</th><th className="px-3 py-2 text-right">Payé</th><th className="px-3 py-2 text-right">Pénalité</th></tr></thead>
                <tbody>{d.echeances_impayees.map((e: any) => (
                  <tr key={e.id} className="border-t"><td className="px-3 py-1.5">{e.numero}</td><td className="px-3 py-1.5">{formatDate(e.dateEcheance)}</td><td className="px-3 py-1.5 text-right tabular-nums">{fcfa(e.montantTotal)}</td><td className="px-3 py-1.5 text-right tabular-nums">{fcfa(e.montantPaye)}</td><td className="px-3 py-1.5 text-right tabular-nums">{fcfa(e.penalite)}</td></tr>))}</tbody></table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Promesses de paiement</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {d.promesses.map((p: any) => (
                <div key={p.id} className="rounded-md border p-2 text-sm">
                  <p className="font-medium">{fcfa(p.montant)} avant le {formatDate(p.datePromise)}</p>
                  <div className="flex items-center justify-between"><Badge variant={p.statut === 'tenue' ? 'success' : p.statut === 'rompue' ? 'destructive' : p.statut === 'en_cours' ? 'info' : 'outline'}>{p.statut.replace('_', ' ')}</Badge>
                    {p.statut === 'en_cours' && relancer && <span className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => agir(() => recouvrementApi.traiterPromesse(dossierId, p.id, { statut: 'tenue' }), 'Promesse tenue')}>Tenue</Button><Button size="sm" variant="ghost" onClick={() => agir(() => recouvrementApi.traiterPromesse(dossierId, p.id, { statut: 'rompue' }), 'Promesse rompue')}>Rompue</Button></span>}</div>
                </div>
              ))}
              {peutAgir && relancer && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="grid grid-cols-2 gap-2"><Input type="number" min={0} placeholder="Montant" value={pro.montant || ''} onChange={(e) => setPro({ ...pro, montant: Number(e.target.value) })} /><Input type="date" value={pro.date} onChange={(e) => setPro({ ...pro, date: e.target.value })} /></div>
                  <Button size="sm" variant="outline" disabled={occupe || pro.montant <= 0} onClick={() => agir(() => recouvrementApi.promesse(dossierId, { montant: pro.montant, date_promise: pro.date }), 'Promesse enregistrée')}>Enregistrer la promesse</Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Plan de régularisation</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {d.plans.map((p: any) => (
                <div key={p.id} className="rounded-md border p-2 text-sm space-y-1">
                  <div className="flex items-center justify-between"><span className="font-medium">{fcfa(p.montantTotal)}</span><Badge variant={p.statut === 'actif' ? 'success' : p.statut === 'rompu' ? 'destructive' : 'outline'}>{p.statut}</Badge></div>
                  {p.lignes.map((l: any) => <p key={l.id} className="text-xs text-muted-foreground">{l.numero}. {formatDate(l.dateEcheance)} · {fcfa(l.montant)} · {l.statut.replace('_', ' ')}</p>)}
                  <p className="text-xs text-muted-foreground">Proposé par {p.creePar.prenom} {p.creePar.nom}{p.valideePar ? ` · validé par ${p.valideePar.prenom} ${p.valideePar.nom}` : ''}</p>
                  {p.statut === 'propose' && escalader && <Button size="sm" variant="brand" disabled={occupe} onClick={() => agir(() => recouvrementApi.validerPlan(dossierId, p.id), 'Plan validé')}>Valider le plan</Button>}
                </div>
              ))}
              {peutAgir && relancer && !planOuvert && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="grid grid-cols-2 gap-2"><Input type="number" min={2} max={24} value={plan.nb} onChange={(e) => setPlan({ ...plan, nb: Number(e.target.value) })} /><Input type="date" value={plan.date} onChange={(e) => setPlan({ ...plan, date: e.target.value })} /></div>
                  <Button size="sm" variant="outline" disabled={occupe} onClick={() => agir(() => recouvrementApi.plan(dossierId, { nb_echeances: plan.nb, premiere_date: plan.date }), 'Plan proposé')}>Proposer un plan en {plan.nb} échéances</Button>
                  <p className="text-xs text-muted-foreground">Le plan couvre l'impayé et les pénalités. Sa validation revient à une autre personne.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {!clos && escalader && (
            <Card>
              <CardHeader><CardTitle className="text-base">Escalade</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {d.motifEscalade && <p className="text-sm">Dernier motif : {d.motifEscalade}</p>}
                <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={esc.vers} onChange={(e) => setEsc({ ...esc, vers: e.target.value })}>
                  <option value="precontentieux">Précontentieux</option><option value="contentieux">Contentieux</option><option value="irrecouvrable">Classer irrécouvrable</option></select>
                <Textarea rows={2} placeholder="Motif (obligatoire, 10 caractères minimum)" value={esc.motif} onChange={(e) => setEsc({ ...esc, motif: e.target.value })} />
                <Button size="sm" variant="destructive" disabled={occupe || esc.motif.trim().length < 10} onClick={() => agir(() => recouvrementApi.escalade(dossierId, esc), 'Dossier escaladé')}>Escalader</Button>
                <p className="text-xs text-muted-foreground">Le contentieux exige une phase précontentieuse préalable. Le dossier de crédit est archivé à chaque escalade.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
