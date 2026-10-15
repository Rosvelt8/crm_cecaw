'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, RefreshCw, ScanSearch, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { TablePagination } from '@/components/ui/table-pagination';
import { Kpi } from '@/components/ui/kpi';
import ControleSanctionsDetail from '@/components/conformite/ControleSanctionsDetail';
import { screeningApi, type Controle, type DemandeControle, type EtatListeOfac, type LigneControle } from '@/services/screeningService';
import { REVUE_LABEL, STATUT_CONTROLE, DECISION_LABEL, LISTE_LABEL, LISTE_ORDRE } from '@/lib/sanctionsLabels';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { cn, formatDate, formatDateTime } from '@/lib/utils';

const VUES: Record<string, { label: string; params: Record<string, unknown> }> = {
  a_revoir: { label: 'À revoir', params: { a_revoir: 'true' } },
  tous: { label: 'Tous les contrôles', params: {} },
  potentielles: { label: 'Correspondances potentielles', params: { statut: 'correspondance_potentielle' } },
  confirmees: { label: 'Correspondances confirmées', params: { statut: 'correspondance_confirmee' } },
  erreurs: { label: 'Erreurs techniques', params: { statut: 'erreur_technique' } },
  sans: { label: 'Sans correspondance', params: { statut: 'aucune_correspondance' } },
};
const champ = 'h-9 rounded-md border bg-background px-2 text-sm';

function CarteSource({ l, ageMax, onChange }: { l: EtatListeOfac; ageMax: number; onChange: () => void }) {
  const { can } = useCan();
  const [occupe, setOccupe] = useState<'synchro' | 'portefeuille' | null>(null);
  const configurable = can('conformite:CONFIGURE');
  const lancer = async (quoi: 'synchro' | 'portefeuille') => {
    if (quoi === 'portefeuille' && !window.confirm(`Contrôler tous les clients et prospects contre la liste « ${LISTE_LABEL[l.liste]} » ? Le traitement peut durer plusieurs minutes et créer des alertes à examiner.`)) return;
    setOccupe(quoi);
    try {
      if (quoi === 'synchro') {
        const r = (await screeningApi.synchroniser({ liste: l.liste, forcer: true }))[0];
        if (r.statut === 'echec') toast.error(`Échec : ${r.erreur}`);
        else toast.success(`${LISTE_LABEL[l.liste]} : ${r.entrees} inscriptions (+${r.ajoutees} / ~${r.modifiees} / −${r.retirees})`);
        onChange();
      } else toast.success((await screeningApi.depisterPortefeuille(l.liste)).message);
    } catch (e) { toast.error(msg(e)); } finally { setOccupe(null); }
  };
  const etat = !l.configuree ? { label: 'Non configurée', variant: 'outline' as const }
    : !l.souhaitee ? { label: 'Désactivée', variant: 'secondary' as const }
    : l.a_jour_au === null ? { label: 'Jamais chargée', variant: 'destructive' as const }
    : l.obsolete ? { label: `Ancienne (${Math.floor(l.age_jours ?? 0)} j)`, variant: 'destructive' as const }
    : { label: 'À jour', variant: 'success' as const };
  const utilisable = l.configuree && l.souhaitee;
  return (
    <div className={cn('rounded-lg border p-3 space-y-2 text-sm', !utilisable && 'bg-muted/30')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="font-medium leading-tight">{l.libelle}</p><p className="text-xs text-muted-foreground">{l.autorite}</p></div>
        <Badge variant={etat.variant} className="shrink-0">{etat.label}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {l.nb_entrees.toLocaleString('fr-FR')} inscription(s){l.a_jour_au ? ` · vérifiée le ${formatDateTime(l.a_jour_au)}` : ''}
        {l.derniere_tentative?.statut === 'echec' && <span className="text-destructive"> · dernière tentative en échec : {l.derniere_tentative.erreur?.slice(0, 140)}</span>}
      </p>
      {!l.configuree && l.aide_configuration && <p className="rounded bg-muted px-2 py-1.5 text-xs">{l.aide_configuration}</p>}
      {l.liste === 'locale' && <p className="text-xs text-muted-foreground">Alimentée par l&apos;onglet « Listes de surveillance » (notifications nationales, PEP, liste interne) : une saisie est recherchée dans le portefeuille aussitôt.</p>}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {l.liste === 'locale'
          ? <Link href="/dashboard/conformite?onglet=listes" className="text-xs text-brand-700 hover:underline">Gérer les listes de surveillance</Link>
          : <a href={l.page_officielle} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"><ExternalLink className="h-3 w-3" />Liste officielle</a>}
        {configurable && utilisable && (
          <span className="ml-auto flex gap-1.5">
            {l.liste !== 'locale' && <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!!occupe} onClick={() => lancer('synchro')}>{occupe === 'synchro' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}Mettre à jour</Button>}
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!!occupe || l.nb_entrees === 0} onClick={() => lancer('portefeuille')}>{occupe === 'portefeuille' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Users className="h-3 w-3 mr-1" />}Contrôler le portefeuille</Button>
          </span>
        )}
      </div>
      {utilisable && l.obsolete && <p className="text-[11px] text-destructive">Plus de {ageMax} jour(s) sans vérification : les contrôles s&apos;appuient sur une version ancienne.</p>}
    </div>
  );
}

function EtatListes({ etat, onSynchro }: { etat: { age_max_jours: number; listes: EtatListeOfac[] } | null; onSynchro: () => void }) {
  const { can } = useCan();
  const [occupe, setOccupe] = useState(false);
  const toutMettreAJour = async () => {
    setOccupe(true);
    try {
      const r = await screeningApi.synchroniser();
      const echecs = r.filter((x) => x.statut === 'echec');
      if (echecs.length) toast.error(`Échec : ${echecs.map((x) => `${LISTE_LABEL[x.liste]} (${x.erreur})`).join(' ; ')}`);
      else toast.success(r.every((x) => x.statut === 'inchangee') ? 'Toutes les listes sont déjà à jour.' : r.filter((x) => x.statut === 'reussie').map((x) => `${LISTE_LABEL[x.liste]} : +${x.ajoutees} / ~${x.modifiees} / −${x.retirees}`).join(' · '));
      onSynchro();
    } catch (e) { toast.error(msg(e)); } finally { setOccupe(false); }
  };
  const triees = etat ? [...etat.listes].sort((a, b) => LISTE_ORDRE.indexOf(a.liste) - LISTE_ORDRE.indexOf(b.liste)) : [];
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sources de sanctions (copie locale)</CardTitle>
        {can('conformite:CONFIGURE') && <Button size="sm" variant="outline" disabled={occupe} onClick={toutMettreAJour}>{occupe ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}Tout mettre à jour</Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        {!etat ? <Loader2 className="h-4 w-4 animate-spin" /> : <div className="grid md:grid-cols-2 gap-3">{triees.map((l) => <CarteSource key={l.liste} l={l} ageMax={etat.age_max_jours} onChange={onSynchro} />)}</div>}
        <p className="text-xs text-muted-foreground">Mise à jour automatique toutes les 6 heures depuis les sites officiels (OFAC, Nations unies, Union européenne). Les contrôles utilisent cette copie : aucune saisie sur les sites officiels n&apos;est nécessaire, et un changement de liste déclenche aussitôt le contrôle du portefeuille.</p>
      </CardContent>
    </Card>
  );
}

function ControlePonctuel({ onResultat }: { onResultat: (c: Controle) => void }) {
  const [f, setF] = useState({ type_personne: 'physique' as 'physique' | 'morale', nom: '', prenom: '', alias: '', date_naissance: '', pays: '', entreprise: '', numero_piece: '' });
  const [occupe, setOccupe] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const lancer = async () => {
    setOccupe(true);
    try {
      const b: DemandeControle = { type_personne: f.type_personne, nom: f.nom.trim() };
      if (f.prenom.trim()) b.prenom = f.prenom.trim();
      if (f.alias.trim()) b.alias = f.alias.split(/[;,]/).map((a) => a.trim()).filter(Boolean);
      if (f.date_naissance) b.date_naissance = f.date_naissance;
      if (f.pays.trim()) b.pays = f.pays.trim();
      if (f.entreprise.trim()) b.entreprise = f.entreprise.trim();
      if (f.numero_piece.trim()) b.numero_piece = f.numero_piece.trim();
      onResultat(await screeningApi.lancer(b));
    } catch (e) { toast.error(msg(e)); } finally { setOccupe(false); }
  };
  const morale = f.type_personne === 'morale';
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Contrôler une personne ou une société</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid sm:grid-cols-4 gap-3">
          <div className="space-y-1"><Label>Type</Label><select className={`${champ} w-full`} value={f.type_personne} onChange={(e) => set({ type_personne: e.target.value as 'physique' | 'morale' })}><option value="physique">Personne physique</option><option value="morale">Société</option></select></div>
          <div className="space-y-1"><Label>{morale ? 'Raison sociale *' : 'Nom *'}</Label><Input value={f.nom} onChange={(e) => set({ nom: e.target.value })} /></div>
          {!morale && <div className="space-y-1"><Label>Prénom(s)</Label><Input value={f.prenom} onChange={(e) => set({ prenom: e.target.value })} /></div>}
          <div className="space-y-1"><Label>Alias / autres noms</Label><Input value={f.alias} onChange={(e) => set({ alias: e.target.value })} placeholder="séparés par des virgules" /></div>
          {!morale && <div className="space-y-1"><Label>Date de naissance</Label><Input type="date" value={f.date_naissance} onChange={(e) => set({ date_naissance: e.target.value })} /></div>}
          <div className="space-y-1"><Label>Pays / nationalité</Label><Input value={f.pays} onChange={(e) => set({ pays: e.target.value })} placeholder="ex. Cameroun" /></div>
          {!morale && <div className="space-y-1"><Label>Employeur / entreprise</Label><Input value={f.entreprise} onChange={(e) => set({ entreprise: e.target.value })} /></div>}
          <div className="space-y-1"><Label>N° de pièce (CNI, passeport, RCCM…)</Label><Input value={f.numero_piece} onChange={(e) => set({ numero_piece: e.target.value })} /></div>
        </div>
        <div className="flex justify-end"><Button variant="brand" size="sm" disabled={occupe || !f.nom.trim()} onClick={lancer}>{occupe ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5 mr-1" />}Contrôler</Button></div>
      </CardContent>
    </Card>
  );
}

export default function SanctionsTab({ initialId }: { initialId?: number }) {
  const [etat, setEtat] = useState<{ age_max_jours: number; listes: EtatListeOfac[] } | null>(null);
  const [compteurs, setCompteurs] = useState<{ par_revue: Record<string, number>; par_statut: Record<string, number> } | null>(null);
  const [filtre, setFiltre] = useState({ vue: 'a_revoir', search: '', page: 1 });
  const [liste, setListe] = useState<{ items: LigneControle[]; meta: { total?: number; per_page?: number } } | null>(null);
  const [selection, setSelection] = useState<number | null>(initialId ?? null);
  const [detail, setDetail] = useState<Controle | null>(null);
  const [formulaire, setFormulaire] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const chargerEtat = useCallback(() => Promise.all([screeningApi.etat(), screeningApi.compteurs()])
    .then(([e, c]) => { setEtat(e); setCompteurs(c); setErreur(null); })
    .catch((e) => setErreur(msg(e, 'Accès refusé ou chargement impossible'))), []);
  const chargerListe = useCallback(() => screeningApi.lister({ ...VUES[filtre.vue].params, search: filtre.search || undefined, page: filtre.page, per_page: 12 })
    .then(setListe).catch(() => setListe({ items: [], meta: {} })), [filtre]);
  const chargerDetail = useCallback(() => (selection ? screeningApi.obtenir(selection).then(setDetail).catch((e) => toast.error(msg(e))) : Promise.resolve()), [selection]);

  useEffect(() => { void chargerEtat(); }, [chargerEtat]);
  useEffect(() => { const t = setTimeout(() => { void chargerListe(); }, 200); return () => clearTimeout(t); }, [chargerListe]);
  useEffect(() => { void chargerDetail(); }, [chargerDetail]);

  const apresChangement = () => { void chargerEtat(); void chargerListe(); void chargerDetail(); };
  const aRevoir = (compteurs?.par_revue.a_revoir ?? 0);
  const escaladees = (compteurs?.par_revue.escaladee ?? 0);

  if (erreur) return <p className="text-destructive text-sm">{erreur}</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="À revoir" valeur={aRevoir} ton={aRevoir ? 'alerte' : 'bon'} precision="correspondances potentielles" />
        <Kpi label="Escaladés" valeur={escaladees} ton={escaladees ? 'alerte' : undefined} />
        <Kpi label="Confirmées" valeur={compteurs?.par_statut.correspondance_confirmee ?? 0} ton={compteurs?.par_statut.correspondance_confirmee ? 'mauvais' : undefined} />
        <Kpi label="Contrôles réalisés" valeur={Object.values(compteurs?.par_statut ?? {}).reduce((s, n) => s + n, 0)} precision={`${compteurs?.par_statut.erreur_technique ?? 0} erreur(s) technique(s)`} />
      </div>

      <EtatListes etat={etat} onSynchro={apresChangement} />

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Contrôles</h3>
        <Button size="sm" variant={formulaire ? 'ghost' : 'outline'} onClick={() => setFormulaire(!formulaire)}><ScanSearch className="h-3.5 w-3.5 mr-1" />{formulaire ? 'Fermer' : 'Nouveau contrôle'}</Button>
      </div>
      {formulaire && <ControlePonctuel onResultat={(c) => { setSelection(c.id); setDetail(c); setFormulaire(false); apresChangement(); }} />}

      <div className="grid lg:grid-cols-5 gap-4 items-start">
        <div className="lg:col-span-2 space-y-2">
          <div className="flex gap-2">
            <select className={champ} value={filtre.vue} onChange={(e) => setFiltre({ ...filtre, vue: e.target.value, page: 1 })}>{Object.entries(VUES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            <Input className="h-9" placeholder="Nom ou référence…" value={filtre.search} onChange={(e) => setFiltre({ ...filtre, search: e.target.value, page: 1 })} />
          </div>
          {!liste ? <Loader2 className="h-4 w-4 animate-spin" /> : liste.items.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">{filtre.vue === 'a_revoir' ? 'Rien à revoir.' : 'Aucun contrôle.'}</p> : (
            <div className="rounded-md border divide-y">
              {liste.items.map((c) => (
                <button key={c.id} onClick={() => setSelection(c.id)} className={cn('w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors', selection === c.id && 'bg-brand-50')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{c.nom}</span>
                    <Badge variant={STATUT_CONTROLE[c.statut].variant} className="text-[10px] shrink-0">{STATUT_CONTROLE[c.statut].label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.reference} · {formatDate(c.created_at)}{c.score_max != null ? ` · score ${c.score_max} %` : ''} · {c.revue_statut === 'revue' && c.decision ? DECISION_LABEL[c.decision] : REVUE_LABEL[c.revue_statut]}{c.client_id ? ' · client' : c.prospect_id ? ' · prospect' : ' · saisie manuelle'}</p>
                </button>
              ))}
            </div>
          )}
          <TablePagination page={filtre.page} perPage={liste?.meta.per_page ?? 12} total={liste?.meta.total ?? 0} totalPages={Math.max(1, Math.ceil((liste?.meta.total ?? 0) / (liste?.meta.per_page ?? 12)))} setPage={(p) => setFiltre({ ...filtre, page: p })} />
        </div>

        <Card className="lg:col-span-3 lg:sticky lg:top-20">
          <CardContent className="p-4">
            {!selection ? <p className="text-sm text-muted-foreground text-center py-12">Sélectionnez un contrôle pour voir les correspondances et rendre une décision.</p>
              : !detail || detail.id !== selection ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
              : <ControleSanctionsDetail controle={detail} onChange={apresChangement} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
