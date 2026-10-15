'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, ShieldAlert, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { screeningApi, type Controle, type CorrespondanceOfac, type DecisionRevue } from '@/services/screeningService';
import { CONFIANCE, DECISION_LABEL, DECLENCHEUR_LABEL, INDICE_NAISSANCE, INDICE_PAYS, LISTE_LABEL, REVUE_LABEL, STATUT_CONTROLE, lienSource } from '@/lib/sanctionsLabels';
import { useCan } from '@/hooks/useCan';
import { msg } from '@/lib/apiHelpers';
import { cn, formatDate, formatDateTime } from '@/lib/utils';

const TON = { bon: 'bg-success-50 text-success-700 border-success/30', neutre: 'bg-muted text-muted-foreground border-transparent', mauvais: 'bg-warning-50 text-warning-700 border-warning/30' } as const;
const MINIMUM: Record<DecisionRevue, number> = { faux_positif: 10, escalade: 10, correspondance_confirmee: 20 };
const majuscule = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function CarteCorrespondance({ c, selectionnable, choisie, onBascule, ecartee }: { c: CorrespondanceOfac; selectionnable?: boolean; choisie?: boolean; onBascule?: () => void; ecartee?: boolean }) {
  const conf = CONFIANCE[c.confiance];
  const nais = INDICE_NAISSANCE[c.indices.naissance], pays = INDICE_PAYS[c.indices.pays];
  return (
    <div className={cn('rounded-lg border p-3 space-y-2.5 text-sm', choisie && 'ring-2 ring-brand-500', ecartee && 'opacity-70')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-semibold">{c.nom}</p>
            <Badge variant="outline" className="text-[10px]">{c.type === 'individu' ? 'Personne' : 'Entité'}</Badge>
            <Badge variant="outline" className="text-[10px]">{LISTE_LABEL[c.liste] ?? c.liste}</Badge>
            {c.reference && <span className="text-[11px] font-mono text-muted-foreground">{c.reference}</span>}
            {c.champ === 'entreprise' && <Badge variant="info" className="text-[10px]">Employeur</Badge>}
          </div>
          {c.titre && <p className="text-xs text-muted-foreground">{c.titre}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={conf.variant}>{conf.label}</Badge>
          {selectionnable && <label className="flex items-center gap-1 text-xs cursor-pointer"><input type="checkbox" checked={!!choisie} onChange={onBascule} />Confirmer</label>}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div><span className="text-muted-foreground">Nom contrôlé : </span><span className="font-medium">{c.nom_controle}</span></div>
        <div><span className="text-muted-foreground">Rapproché de : </span><span className="font-medium">{c.nom_rapproche}</span>{c.via === 'alias' && <span className="text-muted-foreground"> (alias{c.type_alias === 'fka' ? ', ancien nom' : ''})</span>}</div>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden"><div className={cn('h-full', c.score >= 95 ? 'bg-destructive' : c.score >= 90 ? 'bg-warning' : 'bg-brand-600')} style={{ width: `${c.score}%` }} /></div>
        <span className="text-xs tabular-nums w-28 text-right">Ressemblance du nom : <strong>{c.score} %</strong></span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className={cn('rounded border px-1.5 py-0.5 text-[11px]', TON[nais.ton])}>{nais.label}</span>
        <span className={cn('rounded border px-1.5 py-0.5 text-[11px]', TON[pays.ton])}>{pays.label}</span>
        {c.indices.identifiant && <span className="rounded border px-1.5 py-0.5 text-[11px] bg-destructive/10 text-destructive border-destructive/30 font-medium">Pièce identique : {c.indices.identifiant}</span>}
        {c.raison === 'identifiant' && <span className="rounded border px-1.5 py-0.5 text-[11px] bg-warning-50 text-warning-700 border-warning/30">Retenu sur la seule pièce d&apos;identité</span>}
      </div>

      {c.nom_courant && (
        <p className="flex items-start gap-1.5 rounded bg-muted px-2 py-1.5 text-xs"><Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />Nom composé de mots très répandus dans les listes : la ressemblance seule ne suffit pas à désigner cette personne.</p>
      )}

      <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        {c.programmes.length > 0 && <><dt className="text-muted-foreground">Programmes</dt><dd>{c.programmes.join(', ')}</dd></>}
        {c.naissances.length > 0 && <><dt className="text-muted-foreground">Naissance (source)</dt><dd>{c.naissances.join(' ; ')}</dd></>}
        {c.nationalites.length > 0 && <><dt className="text-muted-foreground">Nationalité</dt><dd>{c.nationalites.join(', ')}</dd></>}
        {c.pays.length > 0 && <><dt className="text-muted-foreground">Pays associés</dt><dd>{c.pays.map(majuscule).join(', ')}</dd></>}
        {c.identifiants.length > 0 && <><dt className="text-muted-foreground">Pièces / numéros</dt><dd className="break-all">{c.identifiants.slice(0, 4).map((i) => `${i.type} ${i.valeur}${i.pays ? ` (${i.pays})` : ''}`).join(' ; ')}</dd></>}
        {ecartee && c.ecartee_le && <><dt className="text-muted-foreground">Écartée le</dt><dd>{formatDate(c.ecartee_le)}</dd></>}
      </dl>

      {c.extrait_remarques && (
        <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">{c.liste === 'locale' ? 'Provenance et motif (saisie interne)' : 'Remarques publiées par la source'}</summary><p className="mt-1 text-muted-foreground">{c.extrait_remarques}</p></details>
      )}
      {(() => {
        const lien = lienSource(c);
        return lien ? <a href={lien.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"><ExternalLink className="h-3 w-3" />{lien.libelle}</a> : null;
      })()}
    </div>
  );
}

/** Détail d'un contrôle de sanctions pour la conformité : rapprochements, indices, et revue humaine. */
export default function ControleSanctionsDetail({ controle: c, onChange }: { controle: Controle; onChange?: () => void }) {
  const { can } = useCan();
  const peutReviser = can('conformite:APPROVE') && (c.revue_statut === 'a_revoir' || c.revue_statut === 'escaladee');
  const [decision, setDecision] = useState<DecisionRevue>('faux_positif');
  const [commentaire, setCommentaire] = useState('');
  const [choix, setChoix] = useState<Set<number>>(new Set());
  const [envoi, setEnvoi] = useState(false);
  const st = STATUT_CONTROLE[c.statut];
  const retenues = c.correspondances ?? [];
  const minimum = MINIMUM[decision];
  const pret = commentaire.trim().length >= minimum && (decision !== 'correspondance_confirmee' || choix.size > 0);

  const valider = async () => {
    if (decision === 'correspondance_confirmee' && !window.confirm('Confirmer cette correspondance ? La décision est enregistrée à votre nom et notifie la direction et la conformité. Le client n\'est pas bloqué automatiquement : appliquez la procédure interne.')) return;
    setEnvoi(true);
    try {
      await screeningApi.reviser(c.id, { decision, commentaire: commentaire.trim(), ...(decision === 'correspondance_confirmee' ? { entree_ids: [...choix] } : {}) });
      toast.success('Décision enregistrée'); setCommentaire(''); setChoix(new Set()); onChange?.();
    } catch (e) { toast.error(msg(e)); } finally { setEnvoi(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{c.reference}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(c.created_at)} · {DECLENCHEUR_LABEL[c.declencheur] ?? c.declencheur}</p>
        </div>
        <div className="flex gap-1.5"><Badge variant={st.variant}>{st.label}</Badge>{c.revue_statut !== 'non_requise' && <Badge variant="secondary">{REVUE_LABEL[c.revue_statut]}</Badge>}</div>
      </div>

      <div className="rounded-lg bg-muted/50 p-3 text-xs grid sm:grid-cols-2 gap-x-4 gap-y-0.5">
        <div><span className="text-muted-foreground">Identité contrôlée : </span><strong>{[c.controle.prenom, c.controle.nom].filter(Boolean).join(' ')}</strong> ({c.controle.type_personne === 'morale' ? 'société' : 'personne physique'})</div>
        {c.controle.alias.length > 0 && <div><span className="text-muted-foreground">Alias : </span>{c.controle.alias.join(', ')}</div>}
        {c.controle.date_naissance && <div><span className="text-muted-foreground">Naissance : </span>{formatDate(c.controle.date_naissance)}</div>}
        {c.controle.pays && <div><span className="text-muted-foreground">Pays / nationalité : </span>{c.controle.pays}</div>}
        {c.controle.entreprise && <div><span className="text-muted-foreground">Employeur : </span>{c.controle.entreprise}</div>}
        {c.numero_piece && <div><span className="text-muted-foreground">Pièce(s) : </span>{c.numero_piece}</div>}
      </div>

      {c.avertissements.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning-50 p-2.5 text-xs space-y-1">
          {c.avertissements.map((a) => <p key={a} className="flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning-700" />{a}</p>)}
        </div>
      )}
      {c.statut === 'erreur_technique' && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs flex items-start gap-1.5"><ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0 text-destructive" />{c.erreur ?? c.message}</p>}
      {c.statut === 'aucune_correspondance' && retenues.length === 0 && <p className="flex items-center gap-1.5 text-sm text-success-700"><CheckCircle2 className="h-4 w-4" />Aucune correspondance retenue avec les listes de sanctions chargées.</p>}

      {retenues.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Correspondances à examiner ({retenues.length})</p>
          <p className="text-xs text-muted-foreground">Une ressemblance de nom n&apos;est pas une identification. Comparez les éléments (date de naissance, pays, pièces) et consultez la fiche officielle avant de conclure.</p>
          {retenues.map((m) => (
            <CarteCorrespondance key={m.entree_id} c={m} selectionnable={peutReviser && decision === 'correspondance_confirmee'} choisie={choix.has(m.entree_id)}
              onBascule={() => setChoix((s) => { const n = new Set(s); if (n.has(m.entree_id)) n.delete(m.entree_id); else n.add(m.entree_id); return n; })} />
          ))}
        </div>
      )}

      {peutReviser && retenues.length > 0 && (
        <div className="rounded-lg border-2 border-brand-200 p-3 space-y-2.5">
          <p className="text-sm font-semibold">Décision de revue{c.revue_statut === 'escaladee' ? ' (dossier escaladé)' : ''}</p>
          <div className="grid sm:grid-cols-3 gap-2 text-xs">
            {(['faux_positif', 'correspondance_confirmee', 'escalade'] as DecisionRevue[]).map((d) => (
              <label key={d} className={cn('flex items-start gap-2 rounded-md border p-2 cursor-pointer', decision === d && 'border-brand-500 bg-brand-50')}>
                <input type="radio" name={`decision-${c.id}`} className="mt-0.5" checked={decision === d} onChange={() => setDecision(d)} />
                <span><strong>{DECISION_LABEL[d]}</strong><br /><span className="text-muted-foreground">{d === 'faux_positif' ? 'Homonyme ou ressemblance fortuite : ne plus alerter sur ces inscriptions.' : d === 'correspondance_confirmee' ? 'La personne est bien celle de la liste (cochez les inscriptions).' : 'Transmettre à la direction sans trancher.'}</span></span>
              </label>
            ))}
          </div>
          <Textarea rows={3} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Justification (éléments vérifiés, pièces consultées…)" />
          <div className="flex items-center justify-between gap-2">
            <span className={cn('text-xs', commentaire.trim().length >= minimum ? 'text-muted-foreground' : 'text-warning-700')}>{commentaire.trim().length}/{minimum} caractères minimum{decision === 'correspondance_confirmee' && choix.size === 0 ? ' · cochez au moins une inscription' : ''}</span>
            <Button variant={decision === 'correspondance_confirmee' ? 'destructive' : 'brand'} size="sm" disabled={!pret || envoi} onClick={valider}>Enregistrer la décision</Button>
          </div>
        </div>
      )}

      {c.revue && (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-0.5">
          <p><strong>{DECISION_LABEL[c.revue.decision]}</strong> · {formatDateTime(c.revue.revue_at)}</p>
          <p className="text-muted-foreground">{c.revue.commentaire}</p>
        </div>
      )}

      {(c.ecartees?.length ?? 0) > 0 && (
        <details className="text-xs"><summary className="cursor-pointer font-medium">Correspondances écartées lors d&apos;une revue précédente ({c.ecartees!.length})</summary>
          <div className="mt-2 space-y-2">{c.ecartees!.map((m) => <CarteCorrespondance key={m.entree_id} c={m} ecartee />)}</div></details>
      )}
      {(c.non_retenues?.length ?? 0) > 0 && (
        <details className="text-xs"><summary className="cursor-pointer font-medium">Rapprochements non retenus : confiance inférieure au minimum paramétré ({c.non_retenues!.length})</summary>
          <div className="mt-2 space-y-2">{c.non_retenues!.map((m) => <CarteCorrespondance key={m.entree_id} c={m} ecartee />)}</div></details>
      )}

      {c.versions_listes && c.versions_listes.length > 0 && (
        <p className="text-[11px] text-muted-foreground">Listes utilisées : {c.versions_listes.map((v) => `${LISTE_LABEL[v.liste as keyof typeof LISTE_LABEL] ?? v.liste} (${v.nb_entrees} inscriptions, à jour au ${v.a_jour_au ? formatDate(v.a_jour_au) : '—'})`).join(' · ')} · seuil de ressemblance {c.seuil} %</p>
      )}
    </div>
  );
}
