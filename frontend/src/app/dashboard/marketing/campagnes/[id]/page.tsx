'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Ban, CheckCircle2, Loader2, Pencil, Play, Plus, Trash2, Unlink, X } from 'lucide-react';
import { toast } from 'sonner';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TablePagination } from '@/components/ui/table-pagination';
import { EnTete, Kpi, Onglets, fcfa } from '@/components/ui/kpi';
import { PersonnelPicker } from '@/components/campagnes/PersonnelPicker';
import { campagnesApi } from '@/services/metierService';
import { objectifService } from '@/services/objectifService';
import { clientService } from '@/services/clientService';
import { prospectService } from '@/services/prospectService';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { formatDate } from '@/lib/utils';
import { CYCLE_LABEL } from '@/lib/segmentationLabels';
import { CANAL_CAMPAGNE, ROLE_MEMBRE, STATUT_CAMPAGNE, STATUT_CIBLE, TYPE_CAMPAGNE } from '@/lib/campagneLabels';

type Onglet = 'apercu' | 'personnes' | 'objectifs';
const champ = 'h-9 rounded-md border bg-background px-2 text-sm';

export default function CampagnePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useCan();
  const gerer = can('communication:CONFIGURE');
  const [c, setC] = useState<any>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('apercu');

  const charger = useCallback(() => campagnesApi.obtenir(id)
    .then((r) => { setC(r); setErreur(null); })
    .catch((e) => setErreur(msg(e, 'Campagne introuvable'))), [id]);
  useEffect(() => { void charger(); }, [charger]);

  const action = async (fn: () => Promise<any>, ok: string | ((r: any) => string)) => {
    try { const r = await fn(); toast.success(typeof ok === 'string' ? ok : ok(r)); await charger(); } catch (e) { toast.error(msg(e)); }
  };

  if (erreur) return <p className="text-sm text-destructive">{erreur}</p>;
  if (!c) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  const st = STATUT_CAMPAGNE[c.statut] ?? { label: c.statut, variant: 'outline' as const };

  return (
    <div className="space-y-4">
      <Link href="/dashboard/marketing/campagnes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Campagnes</Link>
      <EnTete titre={c.nom} sousTitre={`${TYPE_CAMPAGNE[c.type] ?? c.type} · ${formatDate(c.dateDebut)}${c.dateFin ? ` → ${formatDate(c.dateFin)}` : ''}${c.agence ? ` · ${c.agence.nom}` : ' · tout le réseau'}`}>
        <Badge variant={st.variant}>{st.label}</Badge>
        {gerer && c.statut !== 'annulee' && <Link href={`/dashboard/marketing/campagnes/${c.id}/modifier`}><Button variant="outline" size="sm"><Pencil className="h-4 w-4 mr-1.5" />Modifier</Button></Link>}
        {gerer && (c.statut === 'brouillon' || c.statut === 'en_cours') && (
          <Button variant="brand" size="sm" onClick={() => { if (window.confirm(c.canal ? `Lancer la campagne ? Les messages ${CANAL_CAMPAGNE[c.canal]} partiront vers les cibles non encore contactées.` : 'Lancer la campagne ? Les cibles seront figées (aucun message envoyé).')) void action(() => campagnesApi.lancer(c.id), (r) => `${r.nb_cibles} cible(s) · ${r.mises_en_file} message(s) en file${r.en_attente_canal ? ` · ${r.en_attente_canal} en attente de canal` : ''}`); }}>
            <Play className="h-4 w-4 mr-1.5" />{c.statut === 'brouillon' ? 'Lancer' : 'Relancer les nouvelles cibles'}
          </Button>
        )}
        {gerer && c.statut === 'en_cours' && <Button variant="outline" size="sm" onClick={() => { if (window.confirm('Clôturer la campagne ?')) void action(() => campagnesApi.cloturer(c.id), 'Campagne clôturée'); }}><CheckCircle2 className="h-4 w-4 mr-1.5" />Clôturer</Button>}
        {gerer && (c.statut === 'brouillon' || c.statut === 'en_cours') && <Button variant="ghost" size="sm" onClick={() => { if (window.confirm('Annuler la campagne ? Elle ne pourra plus être relancée.')) void action(() => campagnesApi.annuler(c.id), 'Campagne annulée'); }}><Ban className="h-4 w-4 mr-1.5" />Annuler</Button>}
        {gerer && c.statut === 'brouillon' && <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => { if (!window.confirm('Supprimer définitivement ce brouillon ?')) return; try { await campagnesApi.supprimer(c.id); toast.success('Brouillon supprimé'); router.push('/dashboard/marketing/campagnes'); } catch (e) { toast.error(msg(e)); } }}><Trash2 className="h-4 w-4" /></Button>}
      </EnTete>

      <Onglets valeur={onglet} onChange={setOnglet} options={[
        { id: 'apercu', label: 'Vue d’ensemble' },
        { id: 'personnes', label: `Personnes (${(c._count?.cibles ?? 0) + (c.membres?.length ?? 0)})` },
        { id: 'objectifs', label: `Objectifs (${c.objectifs?.length ?? 0})` },
      ]} />

      {onglet === 'apercu' ? <Apercu c={c} /> : onglet === 'personnes' ? <Personnes c={c} gerer={gerer} lier={gerer || can('crm:UPDATE')} recharger={charger} /> : <Objectifs c={c} gerer={gerer || can('objectifs:UPDATE')} recharger={charger} />}
    </div>
  );
}

// ── Vue d'ensemble : informations et tableau de bord automatique ─────────────

function Apercu({ c }: { c: any }) {
  const [funnel, setFunnel] = useState<any>(null);
  const [evo, setEvo] = useState<any[]>([]);
  const [eval_, setEval] = useState<any>(null);
  useEffect(() => {
    campagnesApi.funnel(c.id).then(setFunnel).catch(() => {});
    campagnesApi.evolution(c.id).then(setEvo).catch(() => {});
    campagnesApi.evaluation({ ids: String(c.id), statut: c.statut }).then((r) => setEval(r.campagnes[0] ?? null)).catch(() => {});
  }, [c.id, c.statut]);

  const crit = (c.criteres ?? {}) as Record<string, any>;
  const etapes: [string, string][] = [['cibles', 'Ciblés'], ['atteints', 'Atteints'], ['prospects_crees', 'Prospects'], ['convertis', 'Convertis'], ['demandes_creees', 'Demandes'], ['accordees', 'Accordées']];
  const max = funnel ? Math.max(1, ...etapes.map(([k]) => funnel[k] ?? 0)) : 1;
  const pct = (v: number | null | undefined) => (v == null ? '—' : `${v} %`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Taux d'atteinte" valeur={pct(eval_?.taux_atteinte)} precision={`${eval_?.atteints ?? 0} / ${eval_?.cibles ?? 0} cibles`} />
        <Kpi label="Conversion prospects" valeur={pct(eval_?.taux_conversion)} precision={`${eval_?.convertis ?? 0} converti(s) sur ${eval_?.prospects_crees ?? 0}`} />
        <Kpi label="Montant décaissé" valeur={fcfa(eval_?.montant_decaisse ?? 0)} precision={`${eval_?.accordees ?? 0} crédit(s) accordé(s)`} />
        <Kpi label="Rendement" valeur={eval_?.rendement != null ? `× ${eval_.rendement}` : '—'} precision="FCFA décaissés par FCFA dépensé" ton={eval_?.rendement == null ? undefined : eval_.rendement >= 1 ? 'bon' : 'alerte'} />
        <Kpi label="Budget" valeur={fcfa(c.budget)} precision={eval_?.consommation_budget != null ? `${eval_.consommation_budget} % consommé` : undefined} ton={eval_?.consommation_budget > 100 ? 'mauvais' : undefined} />
        <Kpi label="Coût réel" valeur={fcfa(c.coutReel)} precision={eval_?.cout_par_client != null ? `${fcfa(eval_.cout_par_client)} / nouveau client` : undefined} />
        <Kpi label="Objectifs" valeur={eval_?.objectifs ? `${eval_.objectifs_atteints} / ${eval_.objectifs}` : '—'} precision={eval_?.avancement_objectifs != null ? `avancement moyen ${eval_.avancement_objectifs} %` : 'aucun objectif rattaché'} />
        <Kpi label="Période écoulée" valeur={pct(eval_?.avancement_temps)} precision={eval_?.duree_jours ? `${eval_.duree_jours} jour(s) au total` : 'sans date de fin'} />
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Évolution hebdomadaire</CardTitle></CardHeader>
          <CardContent>
            {evo.length === 0 ? <p className="text-sm text-muted-foreground py-10 text-center">Pas encore d'activité.</p> : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={evo.map((e) => ({ ...e, semaine: formatDate(e.semaine, { day: '2-digit', month: 'short' }) }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                  <XAxis dataKey="semaine" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="n" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="m" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v)} />
                  <Tooltip formatter={(v: any, n: any) => (n === 'Décaissé' ? fcfa(v) : v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="n" dataKey="envois" name="Messages" fill="#d6d3d1" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="n" dataKey="prospects" name="Prospects" fill="#b8860b" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="n" dataKey="demandes" name="Demandes" fill="#0d9488" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="m" dataKey="montant_decaisse" name="Décaissé" stroke="#2563eb" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Entonnoir de conversion</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {!funnel ? <Loader2 className="h-4 w-4 animate-spin" /> : etapes.map(([k, l]) => (
              <div key={k} className="flex items-center gap-2 text-sm">
                <span className="w-20 text-xs text-muted-foreground">{l}</span>
                <div className="flex-1 h-5 rounded bg-muted overflow-hidden"><div className="h-full bg-brand-600/80" style={{ width: `${((funnel[k] ?? 0) / max) * 100}%` }} /></div>
                <span className="w-10 text-right font-semibold tabular-nums">{funnel[k] ?? 0}</span>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground pt-1">Prospects et demandes comptent quand le commercial attribue leur origine à la campagne.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Description</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="whitespace-pre-line">{c.description || <span className="text-muted-foreground">Aucune description.</span>}</p>
            {c.objectifGeneral && <div><p className="text-xs font-semibold text-muted-foreground uppercase">Objectif général</p><p className="whitespace-pre-line">{c.objectifGeneral}</p></div>}
            <dl className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
              <dt className="text-muted-foreground">Responsable</dt><dd>{c.responsable ? `${c.responsable.prenom} ${c.responsable.nom}` : '—'}</dd>
              <dt className="text-muted-foreground">Créée par</dt><dd>{c.creePar ? `${c.creePar.prenom} ${c.creePar.nom}` : '—'}</dd>
              <dt className="text-muted-foreground">Événement lié</dt><dd>{c.evenementCalendrier?.nom ?? '—'}</dd>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Message et ciblage</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">Canal : <span className="text-foreground font-medium">{c.canal ? CANAL_CAMPAGNE[c.canal] : 'aucun envoi automatique'}</span></p>
            {c.message && <p className="rounded bg-muted p-2 text-xs">{c.message}</p>}
            <div className="flex flex-wrap gap-1.5">
              {(crit.cycle_vie ?? []).map((k: string) => <Badge key={k} variant="secondary">{CYCLE_LABEL[k as keyof typeof CYCLE_LABEL] ?? k}</Badge>)}
              {crit.marche_id && <Badge variant="secondary">Marché #{crit.marche_id}</Badge>}
              {crit.secteur_id && <Badge variant="secondary">Secteur #{crit.secteur_id}</Badge>}
              {crit.agence_id && <Badge variant="secondary">Agence #{crit.agence_id}</Badge>}
              {crit.potentiel_min != null && <Badge variant="secondary">Potentiel ≥ {crit.potentiel_min}</Badge>}
              {Object.keys(crit).length === 0 && <span className="text-xs text-muted-foreground">Tous les clients actifs</span>}
            </div>
            <p className="text-xs">{c.nb_cibles_estime} client(s) correspondent aujourd'hui · {c._count?.cibles ?? 0} personne(s) liée(s)</p>
            {Object.keys(c.resume ?? {}).length > 0 && <div className="flex flex-wrap gap-2 text-xs">{Object.entries(c.resume).map(([k, n]) => <span key={k} className="rounded border px-2 py-0.5">{STATUT_CIBLE[k] ?? k} : <strong>{n as number}</strong></span>)}</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Personnes liées : équipe interne + cibles (clients, prospects) ───────────

function Personnes({ c, gerer, lier, recharger }: { c: any; gerer: boolean; lier: boolean; recharger: () => Promise<void> }) {
  const membres: any[] = c.membres ?? [];
  const enregistrerMembres = async (liste: { utilisateur_id: number; role: string }[]) => {
    try { await campagnesApi.membres(c.id, liste); toast.success('Équipe mise à jour'); await recharger(); } catch (e) { toast.error(msg(e)); }
  };
  const asListe = (m: any[]) => m.map((x) => ({ utilisateur_id: x.utilisateurId ?? x.utilisateur.id, role: x.role }));
  const close = c.statut === 'annulee' || c.statut === 'terminee';

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Équipe de campagne</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {gerer && <PersonnelPicker exclure={membres.map((m) => m.utilisateur.id)} onChoisir={(u) => void enregistrerMembres([...asListe(membres), { utilisateur_id: u.id, role: 'membre' }])} />}
          {membres.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Personne n'est encore affecté.</p>}
          {membres.map((m) => (
            <div key={m.utilisateur.id} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2">
              <div className="min-w-0"><p className="text-sm font-medium truncate">{m.utilisateur.prenom} {m.utilisateur.nom}</p><p className="text-xs text-muted-foreground truncate">{m.utilisateur.fonction ?? m.utilisateur.email}</p></div>
              {gerer ? (
                <div className="flex items-center gap-1">
                  <select className="h-7 rounded border bg-background px-1 text-xs" value={m.role} onChange={(e) => void enregistrerMembres(asListe(membres).map((x) => (x.utilisateur_id === m.utilisateur.id ? { ...x, role: e.target.value } : x)))}>
                    {Object.entries(ROLE_MEMBRE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <button className="text-muted-foreground hover:text-destructive" title="Retirer" onClick={() => void enregistrerMembres(asListe(membres).filter((x) => x.utilisateur_id !== m.utilisateur.id))}><X className="h-4 w-4" /></button>
                </div>
              ) : <Badge variant="secondary">{ROLE_MEMBRE[m.role]}</Badge>}
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="lg:col-span-2"><Cibles c={c} lier={lier && !close} recharger={recharger} /></div>
    </div>
  );
}

function Cibles({ c, lier, recharger }: { c: any; lier: boolean; recharger: () => Promise<void> }) {
  const [items, setItems] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ total: 0, per_page: 25 });
  const [filtre, setFiltre] = useState({ type: '', statut: '', search: '', page: 1 });
  const [ajout, setAjout] = useState(false);

  const charger = useCallback(() => campagnesApi.cibles(c.id, { ...filtre, type: filtre.type || undefined, statut: filtre.statut || undefined, search: filtre.search || undefined })
    .then((r) => { setItems(r.items); setMeta(r.meta); })
    .catch((e) => toast.error(msg(e))), [c.id, filtre]);
  useEffect(() => { const t = setTimeout(() => { void charger(); }, 200); return () => clearTimeout(t); }, [charger]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Personnes ciblées <span className="text-muted-foreground font-normal text-sm">({meta.total ?? 0})</span></CardTitle>
        {lier && <Button size="sm" variant={ajout ? 'ghost' : 'brand'} onClick={() => setAjout(!ajout)}>{ajout ? 'Fermer' : <><Plus className="h-4 w-4 mr-1" />Lier des personnes</>}</Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        {ajout && <AjoutCibles campagneId={c.id} onAjoute={async () => { await charger(); await recharger(); }} />}
        <div className="flex flex-wrap gap-2">
          <Input className="w-48 h-9" placeholder="Nom, téléphone…" value={filtre.search} onChange={(e) => setFiltre({ ...filtre, search: e.target.value, page: 1 })} />
          <select className={champ} value={filtre.type} onChange={(e) => setFiltre({ ...filtre, type: e.target.value, page: 1 })}><option value="">Clients et prospects</option><option value="client">Clients</option><option value="prospect">Prospects</option></select>
          <select className={champ} value={filtre.statut} onChange={(e) => setFiltre({ ...filtre, statut: e.target.value, page: 1 })}><option value="">Tous les statuts</option>{Object.entries(STATUT_CIBLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        {items.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">{c.statut === 'brouillon' ? 'Les clients correspondant aux critères seront liés au lancement. Vous pouvez déjà lier des personnes à la main.' : 'Aucune personne.'}</p> : (
          <div className="divide-y rounded-md border">
            {items.map((x) => {
              const p = x.client ?? x.prospect;
              return (
                <div key={x.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <Link className="font-medium hover:underline" href={x.client ? `/dashboard/marketing/clients/${x.client.id}` : `/dashboard/marketing/prospects/${x.prospect.id}/modifier`}>{p?.prenom} {p?.nom}</Link>
                    <p className="text-xs text-muted-foreground">{x.client ? 'Client' : 'Prospect'} · {p?.telephone}{x.ajoutManuel ? ` · ajouté par ${x.ajoutePar?.prenom ?? ''} ${x.ajoutePar?.nom ?? ''}` : ' · critères'}{x.note ? ` · ${x.note}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={x.statut === 'echec' ? 'destructive' : x.statut === 'mise_en_file' ? 'success' : 'secondary'}>{STATUT_CIBLE[x.statut] ?? x.statut}</Badge>
                    {lier && x.statut !== 'mise_en_file' && <button className="text-muted-foreground hover:text-destructive" title="Retirer" onClick={async () => { try { await campagnesApi.retirerCible(c.id, x.id); await charger(); await recharger(); } catch (e) { toast.error(msg(e)); } }}><X className="h-4 w-4" /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <TablePagination page={filtre.page} perPage={meta.per_page ?? 25} total={meta.total ?? 0} totalPages={meta.last_page ?? 1} setPage={(p) => setFiltre({ ...filtre, page: p })} />
      </CardContent>
    </Card>
  );
}

function AjoutCibles({ campagneId, onAjoute }: { campagneId: number; onAjoute: () => Promise<void> }) {
  const [type, setType] = useState<'client' | 'prospect'>('client');
  const [q, setQ] = useState('');
  const [resultats, setResultats] = useState<any[]>([]);
  const [selection, setSelection] = useState<Map<string, any>>(new Map());
  const [note, setNote] = useState('');
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const appel = type === 'client' ? clientService.getClients({ search: q, per_page: 15 }) : prospectService.getProspects({ search: q, per_page: 15 });
      appel.then((r: any) => setResultats(r.data ?? [])).catch(() => setResultats([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, type]);

  const basculer = (p: any) => setSelection((s) => { const n = new Map(s); const k = `${type}-${p.id}`; if (n.has(k)) n.delete(k); else n.set(k, { ...p, _type: type }); return n; });
  const valider = async () => {
    const tous = [...selection.values()];
    setOccupe(true);
    try {
      const r = await campagnesApi.ajouterCibles(campagneId, { client_ids: tous.filter((x) => x._type === 'client').map((x) => x.id), prospect_ids: tous.filter((x) => x._type === 'prospect').map((x) => x.id), note: note || undefined });
      toast.success(`${r.clients_ajoutes} client(s) et ${r.prospects_ajoutes} prospect(s) liés`);
      setSelection(new Map()); setNote(''); await onAjoute();
    } catch (e) { toast.error(msg(e)); } finally { setOccupe(false); }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <select className={champ} value={type} onChange={(e) => setType(e.target.value as 'client' | 'prospect')}><option value="client">Clients</option><option value="prospect">Prospects</option></select>
        <Input className="flex-1 min-w-48 h-9" placeholder={`Rechercher un ${type}…`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="max-h-56 overflow-y-auto divide-y rounded border bg-background">
        {resultats.length === 0 ? <p className="text-xs text-muted-foreground p-3">Aucun résultat.</p> : resultats.map((p) => (
          <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/50">
            <input type="checkbox" checked={selection.has(`${type}-${p.id}`)} onChange={() => basculer(p)} />
            <span className="font-medium">{p.prenom} {p.nom}</span><span className="text-xs text-muted-foreground">{p.telephone}</span>
          </label>
        ))}
      </div>
      {selection.size > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">{[...selection.entries()].map(([k, p]) => <Badge key={k} variant="secondary" className="gap-1">{p.prenom} {p.nom}<button onClick={() => setSelection((s) => { const n = new Map(s); n.delete(k); return n; })}><X className="h-3 w-3" /></button></Badge>)}</div>
          <Input className="flex-1 min-w-40 h-9" placeholder="Note (facultatif) : ex. rencontré au salon" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" variant="brand" disabled={occupe} onClick={valider}>Lier {selection.size} personne(s)</Button>
        </div>
      )}
    </div>
  );
}

// ── Objectifs rattachés ───────────────────────────────────────────────────────

function Objectifs({ c, gerer, recharger }: { c: any; gerer: boolean; recharger: () => Promise<void> }) {
  const [libres, setLibres] = useState<any[]>([]);
  const [choix, setChoix] = useState('');
  useEffect(() => { if (gerer) objectifService.getObjectifs({ campagne_id: 'aucune', per_page: 100 } as never).then((r) => setLibres(r.data)).catch(() => {}); }, [gerer, c.objectifs]);

  return (
    <div className="space-y-3">
      {gerer && (
        <Card><CardContent className="p-3 flex flex-wrap items-center gap-2">
          <Link href={`/dashboard/objectifs?campagne_id=${c.id}`}><Button size="sm" variant="brand"><Plus className="h-4 w-4 mr-1" />Créer un objectif pour cette campagne</Button></Link>
          <span className="text-xs text-muted-foreground">ou rattacher un objectif existant :</span>
          <select className={`${champ} min-w-56`} value={choix} onChange={(e) => setChoix(e.target.value)}><option value="">Choisir…</option>{libres.map((o) => <option key={o.id} value={o.id}>{o.titre}</option>)}</select>
          <Button size="sm" variant="outline" disabled={!choix} onClick={async () => { try { await campagnesApi.lierObjectifs(c.id, [Number(choix)]); setChoix(''); toast.success('Objectif rattaché'); await recharger(); } catch (e) { toast.error(msg(e)); } }}>Rattacher</Button>
        </CardContent></Card>
      )}
      {(c.objectifs ?? []).length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Aucun objectif chiffré rattaché à cette campagne.</p> : (
        <div className="grid md:grid-cols-2 gap-3">
          {c.objectifs.map((o: any) => {
            const montant = o.unite === 'montant' || o.unite === 'panier_moyen';
            const f = (n: number) => (montant ? fcfa(n) : String(Number(n)));
            return (
              <Card key={o.id}><CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2"><p className="font-medium text-sm">{o.titre}</p><Badge variant={o.statut === 'echec' ? 'destructive' : o.statut === 'en_cours' ? 'info' : 'success'}>{o.statut.replace('_', ' ')}</Badge></div>
                <p className="text-xs text-muted-foreground">{o.categorie.replace('_', ' ')} · {formatDate(o.dateDebut)} → {formatDate(o.dateFin)}{o.agence ? ` · ${o.agence.nom}` : ''}</p>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden"><div className={`h-full ${o.pourcentage >= 100 ? 'bg-success' : 'bg-brand-600'}`} style={{ width: `${Math.min(100, o.pourcentage)}%` }} /></div>
                <div className="flex items-center justify-between">
                  <p className="text-xs">{f(o.realise)} sur {f(o.cible)} ({o.pourcentage} %)</p>
                  {gerer && <button className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1" onClick={async () => { try { await campagnesApi.delierObjectif(c.id, o.id); await recharger(); } catch (e) { toast.error(msg(e)); } }}><Unlink className="h-3.5 w-3.5" />Détacher</button>}
                </div>
              </CardContent></Card>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Un objectif rattaché ne compte que ce que la campagne produit : prospects et demandes attribués, clients issus de ses prospects ou ciblés par elle. Le réalisé se recalcule chaque nuit (ou via « Recalculer » dans Objectifs de pilotage).</p>
    </div>
  );
}
