'use client';
/* eslint-disable react/no-unescaped-entities -- texte français : les apostrophes sont légitimes dans le JSX */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Archive, CheckCircle2, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import GrilleAnalyse from '@/components/credit/GrilleAnalyse';
import { creditService } from '@/services/creditService';
import { adminService } from '@/services/adminService';
import { msg as msgApi, telecharger, cheminFichier } from '@/lib/apiHelpers';
import AuthImage from '@/components/ui/auth-image';
import { useCan } from '@/hooks/useCan';
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { STATUT_LABELS, STATUT_VARIANT, type DemandeCreditDetail, type ModeReglement, type TypeGarantie } from '@/types/credit';

type Onglet = 'synthese' | 'garanties' | 'grille' | 'echeancier' | 'archives';

const message = (e: unknown, defaut: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? defaut;
const ETAPES: Record<string, string> = {
  montage: 'Montage du dossier', soumission: 'Soumission', analyse: "Début de l'analyse", analyse_terminee: 'Analyse terminée, transmis au comité',
  decision: 'Décision', contrat: 'Édition du contrat', signature_contrat: 'Signature du contrat', decaissement: 'Décaissement',
  cloture: 'Clôture', annulation: 'Annulation',
};
const libelleEtape = (e: string) => ETAPES[e] ?? (e.startsWith('avenant_') ? `Avenant : ${e.slice(8)}` : e);

export default function DemandeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const demandeId = Number(id);
  const { can } = useCan();

  const [d, setD] = useState<DemandeCreditDetail | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('synthese');
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try { setD(await creditService.obtenir(demandeId)); setErreur(null); }
    catch (e) { setErreur(message(e, 'Dossier introuvable')); }
  }, [demandeId]);
  useEffect(() => { void charger(); }, [charger]);

  /** Exécute une action du workflow avec un retour utilisateur homogène. */
  const agir = async (fn: () => Promise<unknown>, ok: string) => {
    setOccupe(true);
    try { await fn(); toast.success(ok); await charger(); }
    catch (e) { toast.error(message(e, 'Action impossible')); }
    finally { setOccupe(false); }
  };

  if (erreur) return <div className="space-y-3"><Link href="/dashboard/credits" className="text-sm text-muted-foreground inline-flex items-center"><ArrowLeft className="h-4 w-4 mr-1" />Retour</Link><p className="text-destructive">{erreur}</p></div>;
  if (!d) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Chargement…</div>;

  const client = d.client as { id: number; nom: string; prenom: string | null };
  const nomClient = `${client.prenom ?? ''} ${client.nom}`.trim();
  const analysable = ['kyc_valide', 'analyse_en_cours'].includes(d.statut);
  const montant = Number(d.montantAccorde ?? d.montantDemande);

  const onglets: { id: Onglet; label: string }[] = [
    { id: 'synthese', label: 'Synthèse' },
    { id: 'garanties', label: `Garanties et visites (${d.garanties.length + d.garants.length + d.visites.length})` },
    ...(can('analyse:VIEW') ? [{ id: 'grille' as Onglet, label: "Grille d'analyse" }] : []),
    { id: 'echeancier', label: 'Échéancier' },
    ...(can('documentaire:VIEW') ? [{ id: 'archives' as Onglet, label: 'Archives' }] : []),
  ];

  return (
    <div className="space-y-4">
      <Link href="/dashboard/credits" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4 mr-1" />Demandes de crédit</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{d.reference}</h1>
            <Badge variant={STATUT_VARIANT[d.statut]}>{STATUT_LABELS[d.statut]}</Badge>
            {d.scoreValeur != null && <Badge variant="outline">Score {d.scoreValeur}/100 · {d.scoreClasse}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            <Link href={`/dashboard/marketing/clients/${client.id}`} className="text-brand-700 hover:underline">{nomClient}</Link>
            {' · '}{d.produit.nom}{' · '}{d.agence.nom}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">{formatCurrency(montant)}</p>
          <div className="mt-1 flex justify-end gap-2">
            {d.contrat && <Button size="sm" variant="outline" onClick={() => telecharger(`/documents/credits/${d.id}/contrat`, undefined, true).catch((e) => toast.error(msgApi(e)))}>Contrat PDF</Button>}
            {d.echeances.length > 0 && <Button size="sm" variant="outline" onClick={() => telecharger(`/documents/credits/${d.id}/echeancier`, undefined, true).catch((e) => toast.error(msgApi(e)))}>Échéancier PDF</Button>}
          </div>
          <p className="text-sm text-muted-foreground">{d.dureeAccordeeMois ?? d.dureeMois} mois · {d.periodicite} · {d.tauxApplique ?? '—'} %</p>
        </div>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {onglets.map((o) => (
          <button key={o.id} onClick={() => setOnglet(o.id)}
            className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap', onglet === o.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {o.label}
          </button>
        ))}
      </div>

      {onglet === 'synthese' && <Synthese d={d} nomClient={nomClient} occupe={occupe} agir={agir} can={can} />}
      {onglet === 'garanties' && <GarantiesVisites d={d} recharger={charger} can={can} />}
      {onglet === 'grille' && (
        <GrilleAnalyse
          demandeId={d.id} reference={d.reference} clientNom={nomClient}
          editable={analysable && can('analyse:CREATE', 'analyse:UPDATE')}
          peutTransmettre={d.statut === 'analyse_en_cours' && can('analyse:SUBMIT')}
          onChange={charger}
        />
      )}
      {onglet === 'echeancier' && <Echeancier d={d} occupe={occupe} agir={agir} can={can} />}
      {onglet === 'archives' && <Archives demandeId={d.id} can={can} />}
    </div>
  );
}

type Can = (...codes: string[]) => boolean;
type Agir = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

// ─────────────────────────────────────────────────────────────────────────────

function Synthese({ d, nomClient, occupe, agir, can }: { d: DemandeCreditDetail; nomClient: string; occupe: boolean; agir: Agir; can: Can }) {
  const [motif, setMotif] = useState('');
  const [montantAccorde, setMontantAccorde] = useState(Number(d.montantDemande));
  const [conditions, setConditions] = useState('');
  const [modeDecaissement, setModeDecaissement] = useState<ModeReglement>('especes');
  const [compteId, setCompteId] = useState('');

  const brouillon = d.statut === 'brouillon';
  const decision = d.statut === 'comite_en_attente' && can('credit:APPROVE', 'credit:REJECT');

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Demande</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
            <p><span className="text-muted-foreground">Client : </span>{nomClient}</p>
            <p><span className="text-muted-foreground">Type : </span>{d.typeCredit}</p>
            <p><span className="text-muted-foreground">Montant demandé : </span>{formatCurrency(Number(d.montantDemande))}</p>
            <p><span className="text-muted-foreground">Durée : </span>{d.dureeMois} mois (différé {d.differeMois})</p>
            <p><span className="text-muted-foreground">Monté par : </span>{d.montePar.prenom} {d.montePar.nom}</p>
            <p><span className="text-muted-foreground">Analysé par : </span>{d.analysePar ? `${d.analysePar.prenom} ${d.analysePar.nom}` : '—'}</p>
            <p className="sm:col-span-2"><span className="text-muted-foreground">Objet : </span>{d.objet}</p>
            <p className="sm:col-span-2 flex items-center gap-2"><span className="text-muted-foreground">KYC : </span>
              {d.dossierKyc ? <><Link href={`/dashboard/kyc/${d.dossierKyc.id}`} className="text-brand-700 hover:underline">{d.dossierKyc.reference}</Link><Badge variant={d.dossierKyc.statut === 'valide' ? 'success' : 'warning'}>{d.dossierKyc.statut}</Badge>{d.dossierKyc.niveauRisque && <Badge variant="outline">Risque {d.dossierKyc.niveauRisque}</Badge>}</> : 'Aucun dossier validé'}
            </p>
            {d.motifDecision && <p className="sm:col-span-2"><span className="text-muted-foreground">Motif de décision : </span>{d.motifDecision}</p>}
          </CardContent>
        </Card>

        {brouillon && (
          <Card><CardContent className="p-4 flex flex-wrap gap-2 items-center">
            {can('credit:SUBMIT') && <Button variant="brand" disabled={occupe} onClick={() => agir(() => creditService.soumettre(d.id), 'Demande soumise')}>Soumettre la demande</Button>}
            {can('credit:UPDATE') && <Button variant="outline" disabled={occupe} onClick={() => { const m = window.prompt("Motif de l'annulation ?"); if (m && m.trim().length >= 3) void agir(() => creditService.annuler(d.id, m.trim()), 'Demande annulée'); }}>Annuler</Button>}
          </CardContent></Card>
        )}

        {d.statut === 'kyc_en_cours' && (
          <Card><CardContent className="p-4 text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-warning-700" />En attente de la validation du dossier KYC du client. Le dossier avancera automatiquement dès qu'il sera validé.</CardContent></Card>
        )}

        {decision && (
          <Card>
            <CardHeader><CardTitle className="text-base">Décision</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Instance requise pour ce montant : <strong>{d.instance_requise}</strong>. Le monteur et l'analyste du dossier ne peuvent pas décider.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Montant accordé</Label><Input type="number" min={0} value={montantAccorde || ''} onChange={(e) => setMontantAccorde(Number(e.target.value))} /></div>
                <div className="space-y-1.5"><Label>Conditions particulières</Label><Input value={conditions} onChange={(e) => setConditions(e.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><Label>Motif (obligatoire pour un rejet ou un ajournement)</Label><Textarea rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} /></div>
              <div className="flex flex-wrap gap-2">
                {can('credit:APPROVE') && <Button variant="success" disabled={occupe} onClick={() => agir(() => creditService.decider(d.id, { sens: 'favorable', montant_accorde: montantAccorde, conditions: conditions || undefined, motif: motif || undefined }), 'Crédit approuvé')}>Approuver</Button>}
                <Button variant="outline" disabled={occupe || !motif.trim()} onClick={() => agir(() => creditService.decider(d.id, { sens: 'ajourne', motif }), 'Dossier renvoyé pour complément')}>Ajourner</Button>
                <Button variant="destructive" disabled={occupe || !motif.trim()} onClick={() => agir(() => creditService.decider(d.id, { sens: 'defavorable', motif }), 'Crédit rejeté')}>Rejeter</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {d.statut === 'approuvee' && can('credit:EXECUTE') && (
          <Card><CardContent className="p-4"><Button variant="brand" disabled={occupe} onClick={() => agir(() => creditService.editerContrat(d.id), 'Contrat édité')}>Éditer le contrat</Button></CardContent></Card>
        )}

        {d.statut === 'contrat_edite' && d.contrat && can('credit:EXECUTE') && (
          <Card>
            <CardHeader><CardTitle className="text-base">Contrat {d.contrat.numero}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Montant {formatCurrency(Number(d.contrat.montant))} · taux {d.contrat.taux} % · {d.contrat.dureeMois} mois · frais de dossier {formatCurrency(Number(d.contrat.fraisDossier))}</p>
              {!d.contrat.signeParClient ? (
                <Button disabled={occupe} onClick={() => agir(() => creditService.signerContrat(d.id), 'Contrat signé')}>Enregistrer la signature du client</Button>
              ) : (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-success-700"><CheckCircle2 className="h-4 w-4" />Signé le {d.contrat.dateSignature ? formatDate(d.contrat.dateSignature) : ''}</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Mode de décaissement</Label>
                      <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={modeDecaissement} onChange={(e) => setModeDecaissement(e.target.value as ModeReglement)}>
                        <option value="especes">Espèces</option><option value="virement">Virement</option><option value="cheque">Chèque</option><option value="compte">Crédit sur compte</option>
                      </select></div>
                    {modeDecaissement === 'compte' && <div className="space-y-1.5"><Label>N° interne du compte</Label><Input type="number" value={compteId} onChange={(e) => setCompteId(e.target.value)} /></div>}
                  </div>
                  <Button variant="brand" disabled={occupe || (modeDecaissement === 'compte' && !compteId)} onClick={() => agir(() => creditService.decaisser(d.id, { mode: modeDecaissement, compte_id: compteId ? Number(compteId) : undefined }), 'Crédit décaissé')}>Décaisser {formatCurrency(Number(d.contrat!.montant))}</Button>
                  <p className="text-xs text-muted-foreground">Le décaissement ne peut pas être exécuté par la personne qui a pris la décision.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Historique du dossier</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {d.actes.map((a) => (
              <li key={a.id} className="text-sm border-l-2 border-brand-200 pl-3">
                <p className="font-medium">{libelleEtape(a.etape)}</p>
                <p className="text-xs text-muted-foreground">{a.acteur.prenom} {a.acteur.nom} · {formatDateTime(a.createdAt)}</p>
                {a.commentaire && <p className="text-xs mt-0.5">{a.commentaire}</p>}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const TYPES_GARANTIE: { v: TypeGarantie; l: string }[] = [
  { v: 'salaire', l: 'Domiciliation de salaire' }, { v: 'immobilier', l: 'Immobilier' }, { v: 'materiel', l: 'Matériel' },
  { v: 'nantissement', l: 'Nantissement' }, { v: 'depot_garantie', l: 'Dépôt de garantie' }, { v: 'tiers_garant', l: 'Caution' }, { v: 'autre', l: 'Autre' },
];

function GarantiesVisites({ d, recharger, can }: { d: DemandeCreditDetail; recharger: () => Promise<void>; can: Can }) {
  const editable = ['brouillon', 'soumise', 'kyc_en_cours', 'kyc_valide', 'analyse_en_cours'].includes(d.statut) && can('credit:UPDATE');
  const [g, setG] = useState({ type: 'immobilier' as TypeGarantie, description: '', valeur: 0 });
  const [gt, setGt] = useState({ nom: '', telephone: '', lien: '' });
  const [v, setV] = useState({ date: new Date().toISOString().slice(0, 10), compte: '' });
  const [photos, setPhotos] = useState<FileList | null>(null);
  const [occupe, setOccupe] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setOccupe(true);
    try { await fn(); toast.success(ok); await recharger(); } catch (e) { toast.error(message(e, 'Action impossible')); } finally { setOccupe(false); }
  };

  const totalRetenu = d.garanties.reduce((s, x) => s + Number(x.valeurRetenue ?? x.valeurEstimee), 0);
  const montant = Number(d.montantAccorde ?? d.montantDemande);

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Garanties</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {d.garanties.length === 0 && <p className="text-sm text-muted-foreground">Aucune garantie enregistrée.</p>}
          {d.garanties.map((x) => (
            <div key={x.id} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
              <div><p className="font-medium">{TYPES_GARANTIE.find((t) => t.v === x.type)?.l} — {x.description}</p>
                <p className="text-xs text-muted-foreground">Estimée {formatCurrency(Number(x.valeurEstimee))} · retenue {formatCurrency(Number(x.valeurRetenue ?? x.valeurEstimee))}</p></div>
              {editable && <button className="text-destructive" onClick={() => run(() => creditService.supprimerGarantie(d.id, x.id), 'Garantie supprimée')}><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
          {d.garanties.length > 0 && <p className="text-sm">Couverture : <strong>{montant > 0 ? Math.round((totalRetenu / montant) * 100) : 0} %</strong> du montant</p>}
          {editable && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t">
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={g.type} onChange={(e) => setG({ ...g, type: e.target.value as TypeGarantie })}>{TYPES_GARANTIE.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
              <Input type="number" min={0} placeholder="Valeur estimée" value={g.valeur || ''} onChange={(e) => setG({ ...g, valeur: Number(e.target.value) })} />
              <Input className="col-span-2" placeholder="Description" value={g.description} onChange={(e) => setG({ ...g, description: e.target.value })} />
              <Button size="sm" className="col-span-2" disabled={occupe || !g.description || g.valeur <= 0}
                onClick={() => run(async () => { await creditService.ajouterGarantie(d.id, { type: g.type, description: g.description, valeur_estimee: g.valeur }); setG({ ...g, description: '', valeur: 0 }); }, 'Garantie ajoutée')}>Ajouter la garantie</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Garants</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {d.garants.length === 0 && <p className="text-sm text-muted-foreground">Aucun garant.</p>}
          {d.garants.map((x) => (
            <div key={x.id} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
              <div><p className="font-medium">{x.prenom} {x.nom}</p><p className="text-xs text-muted-foreground">{x.telephone}{x.lienParente ? ` · ${x.lienParente}` : ''}</p></div>
              {editable && <button className="text-destructive" onClick={() => run(() => creditService.supprimerGarant(d.id, x.id), 'Garant supprimé')}><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
          {editable && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t">
              <Input placeholder="Nom" value={gt.nom} onChange={(e) => setGt({ ...gt, nom: e.target.value })} />
              <Input placeholder="Téléphone" value={gt.telephone} onChange={(e) => setGt({ ...gt, telephone: e.target.value })} />
              <Input className="col-span-2" placeholder="Lien avec le demandeur" value={gt.lien} onChange={(e) => setGt({ ...gt, lien: e.target.value })} />
              <Button size="sm" className="col-span-2" disabled={occupe || !gt.nom || gt.telephone.length < 6}
                onClick={() => run(async () => { await creditService.ajouterGarant(d.id, { nom: gt.nom, telephone: gt.telephone, lien_parente: gt.lien || undefined }); setGt({ nom: '', telephone: '', lien: '' }); }, 'Garant ajouté')}>Ajouter le garant</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Visites terrain</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {d.visites.length === 0 && <p className="text-sm text-muted-foreground">Aucune visite enregistrée.</p>}
          {d.visites.map((x) => (
            <div key={x.id} className="rounded-md border p-3 text-sm space-y-2">
              <p className="font-medium">{formatDate(x.dateVisite)} · {x.visitePar.prenom} {x.visitePar.nom}</p>
              <p>{x.compteRendu}</p>
              {x.photos.length > 0 && <div className="flex flex-wrap gap-2">{x.photos.map((p) => (
                <button key={p.id} type="button" onClick={() => telecharger(cheminFichier(p.url), p.nomFichier, true).catch((e) => toast.error(msgApi(e)))}><AuthImage url={p.url} alt={p.nomFichier} className="h-16 w-16 rounded object-cover border" /></button>))}</div>}
            </div>
          ))}
          {editable && (
            <div className="space-y-2 pt-2 border-t">
              <div className="grid sm:grid-cols-3 gap-2">
                <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
                <Input className="sm:col-span-2" type="file" accept="image/*" multiple onChange={(e) => setPhotos(e.target.files)} />
              </div>
              <Textarea rows={3} placeholder="Compte rendu : état de l'activité, stock observé, environnement, cohérence avec le déclaré…" value={v.compte} onChange={(e) => setV({ ...v, compte: e.target.value })} />
              <Button size="sm" disabled={occupe || v.compte.trim().length < 3}
                onClick={() => run(async () => {
                  const f = new FormData();
                  f.append('date_visite', v.date); f.append('compte_rendu', v.compte);
                  Array.from(photos ?? []).slice(0, 5).forEach((p) => f.append('photos', p));
                  await creditService.enregistrerVisite(d.id, f); setV({ ...v, compte: '' }); setPhotos(null);
                }, 'Visite enregistrée')}>Enregistrer la visite</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const STATUT_ECHEANCE: Record<string, { l: string; v: 'success' | 'warning' | 'destructive' | 'outline' | 'info' }> = {
  payee: { l: 'Payée', v: 'success' }, a_echoir: { l: 'À échoir', v: 'outline' }, partiellement_payee: { l: 'Partielle', v: 'info' },
  en_retard: { l: 'En retard', v: 'destructive' }, impayee: { l: 'Impayée', v: 'destructive' },
};

function Echeancier({ d, occupe, agir, can }: { d: DemandeCreditDetail; occupe: boolean; agir: Agir; can: Can }) {
  const [montant, setMontant] = useState(0);
  const [mode, setMode] = useState<ModeReglement>('especes');
  const [av, setAv] = useState({ type: 'reechelonnement' as 'restructuration' | 'reechelonnement' | 'refinancement', motif: '', duree: 12, taux: '' });

  if (d.echeances.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">L'échéancier est généré au décaissement du crédit.</p>;

  const totalDu = d.echeances.filter((e) => e.statut !== 'payee').reduce((s, e) => s + Number(e.montantTotal) + Number(e.penalite) - Number(e.montantPaye), 0);
  const enRetard = d.echeances.filter((e) => e.statut === 'en_retard');
  const encours = d.statut === 'decaissee';

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Reste dû</p><p className="text-xl font-bold tabular-nums">{formatCurrency(totalDu)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Échéances soldées</p><p className="text-xl font-bold">{d.echeances.filter((e) => e.statut === 'payee').length} / {d.echeances.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">En retard</p><p className={cn('text-xl font-bold', enRetard.length > 0 && 'text-destructive')}>{enRetard.length}</p></CardContent></Card>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-left">N°</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-right">Capital</th><th className="px-3 py-2 text-right">Intérêts</th><th className="px-3 py-2 text-right">Échéance</th><th className="px-3 py-2 text-right">Payé</th><th className="px-3 py-2 text-right">Restant dû</th><th className="px-3 py-2 text-left">Statut</th></tr></thead>
          <tbody>
            {d.echeances.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-3 py-1.5">{e.numero}</td><td className="px-3 py-1.5">{formatDate(e.dateEcheance)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(Number(e.capital))}</td><td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(Number(e.interet))}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatCurrency(Number(e.montantTotal))}</td><td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(Number(e.montantPaye))}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(Number(e.capitalRestantDu))}</td>
                <td className="px-3 py-1.5"><Badge variant={STATUT_ECHEANCE[e.statut].v}>{STATUT_ECHEANCE[e.statut].l}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>

      {encours && can('credit:EXECUTE') && (
        <Card>
          <CardHeader><CardTitle className="text-base">Enregistrer un remboursement</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5"><Label>Montant</Label><Input type="number" min={0} className="w-44" value={montant || ''} onChange={(e) => setMontant(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Mode</Label>
              <select className="h-10 rounded-lg border bg-background px-3 text-sm" value={mode} onChange={(e) => setMode(e.target.value as ModeReglement)}><option value="especes">Espèces</option><option value="virement">Virement</option><option value="cheque">Chèque</option></select></div>
            <Button variant="brand" disabled={occupe || montant <= 0} onClick={() => agir(async () => { await creditService.rembourser(d.id, { montant, mode }); setMontant(0); }, 'Remboursement enregistré')}>Enregistrer</Button>
            <p className="text-xs text-muted-foreground">Imputé sur les échéances les plus anciennes.</p>
          </CardContent>
        </Card>
      )}

      {encours && can('credit:APPROVE') && (
        <Card>
          <CardHeader><CardTitle className="text-base">Avenant (restructuration, rééchelonnement, refinancement)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Type</Label><select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={av.type} onChange={(e) => setAv({ ...av, type: e.target.value as typeof av.type })}><option value="reechelonnement">Rééchelonnement</option><option value="restructuration">Restructuration</option><option value="refinancement">Refinancement</option></select></div>
              <div className="space-y-1.5"><Label>Nouvelle durée (mois)</Label><Input type="number" min={1} value={av.duree || ''} onChange={(e) => setAv({ ...av, duree: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Nouveau taux (%) — optionnel</Label><Input type="number" min={0} value={av.taux} onChange={(e) => setAv({ ...av, taux: e.target.value })} /></div>
            </div>
            <Textarea rows={2} placeholder="Motif de l'avenant" value={av.motif} onChange={(e) => setAv({ ...av, motif: e.target.value })} />
            <Button variant="outline" disabled={occupe || av.motif.trim().length < 5 || av.duree <= 0}
              onClick={() => agir(() => creditService.avenant(d.id, { type: av.type, motif: av.motif, nouvelle_duree_mois: av.duree, nouveau_taux: av.taux ? Number(av.taux) : undefined }), 'Avenant appliqué : échéancier régénéré')}>Appliquer l'avenant</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Archives({ demandeId, can }: { demandeId: number; can: Can }) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof adminService.archives>>>([]);
  const [chargement, setChargement] = useState(true);
  const [verif, setVerif] = useState<Record<number, boolean>>({});

  const charger = useCallback(async () => {
    try { setItems(await adminService.archives('demande_credit', demandeId)); } catch { toast.error('Archives indisponibles'); } finally { setChargement(false); }
  }, [demandeId]);
  useEffect(() => { void charger(); }, [charger]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Archives du dossier</CardTitle>
        {can('documentaire:CREATE') && (
          <Button size="sm" variant="outline" onClick={async () => { try { await adminService.archiver('demande_credit', demandeId, 'Archivage manuel'); toast.success('Instantané archivé'); await charger(); } catch (e) { toast.error(message(e, 'Archivage impossible')); } }}>
            <Archive className="h-4 w-4 mr-1.5" />Archiver l'état actuel
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">Les archives sont des instantanés figés et scellés (empreinte SHA-256). Le dossier est archivé automatiquement à la décision, au décaissement, à chaque avenant et à la clôture.</p>
        {chargement ? <Loader2 className="h-4 w-4 animate-spin" /> : items.length === 0 ? <p className="text-sm text-muted-foreground">Aucune archive.</p> : items.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <div>
              <p className="font-medium">Version {a.version} · {a.motif ?? '—'}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(a.archiveAt)}{a.archivePar ? ` · ${a.archivePar.prenom} ${a.archivePar.nom}` : ''} · <span className="font-mono">{a.hash.slice(0, 16)}…</span></p>
            </div>
            <div className="flex items-center gap-2">
              {verif[a.id] !== undefined && <Badge variant={verif[a.id] ? 'success' : 'destructive'}>{verif[a.id] ? 'Intègre' : 'ALTÉRÉE'}</Badge>}
              <Button size="sm" variant="ghost" onClick={async () => { try { const r = await adminService.verifierArchive(a.id); setVerif((v) => ({ ...v, [a.id]: r.integre })); } catch { toast.error('Vérification impossible'); } }}>Vérifier l'intégrité</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
