'use client';
/* eslint-disable react/no-unescaped-entities -- texte français : les apostrophes sont légitimes dans le JSX */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Eye, FileText, Loader2, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { kycService, type Concordance, type ControleKyc, type DossierKycDetail, type PieceDossier } from '@/services/kycService';
import { useCan } from '@/hooks/useCan';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import { RISQUE, STATUT_KYC } from '@/lib/kycLabels';
import ApercuPiece from '@/components/kyc/ApercuPiece';
import ConcordanceTable, { LigneVerification } from '@/components/kyc/Concordance';
import FichePersonne from '@/components/kyc/FichePersonne';

const message = (e: unknown, defaut: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? defaut;
const TYPES_PIECE = [['cni', "Carte nationale d'identité"], ['passeport', 'Passeport'], ['permis', 'Permis de conduire'], ['carte_sejour', 'Carte de séjour'], ['recepisse', 'Récépissé'], ['autre', 'Autre']] as const;
const ETAPES: Record<string, string> = {
  kyc_creation: 'Ouverture du dossier', kyc_soumission: 'Soumission au contrôle', kyc_validation: 'Validation', kyc_rejet: 'Rejet',
  kyc_reouverture: 'Réouverture', kyc_archivage: 'Archivage',
};
type Onglet = 'controles' | 'concordance' | 'fiche' | 'pieces';

export default function KycDetailPage() {
  const { id } = useParams<{ id: string }>();
  const dossierId = Number(id);
  const { can } = useCan();
  const [d, setD] = useState<DossierKycDetail | null>(null);
  const [conc, setConc] = useState<Concordance | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [onglet, setOnglet] = useState<Onglet>('controles');
  const [vue, setVue] = useState<PieceDossier | null>(null);
  const [piece, setPiece] = useState({ type: 'cni', numero: '', expiration: '' });
  const [fichier, setFichier] = useState<File | null>(null);
  const [document, setDocument] = useState<{ intitule: string; fichier: File | null }>({ intitule: '', fichier: null });

  const charger = useCallback(async () => {
    try {
      const dossier = await kycService.obtenir(dossierId); setD(dossier); setErreur(null);
      // La concordance se recalcule à chaque chargement : une correction de fiche y apparaît aussitôt.
      kycService.concordance(dossierId).then(setConc).catch(() => setConc(null));
    } catch (e) { setErreur(message(e, 'Dossier introuvable')); }
  }, [dossierId]);
  useEffect(() => { void charger(); }, [charger]);

  const agir = async (fn: () => Promise<unknown>, ok: string) => {
    setOccupe(true);
    try { await fn(); toast.success(ok); await charger(); } catch (e) { toast.error(message(e, 'Action impossible')); } finally { setOccupe(false); }
  };

  const moi = useMemo(() => d?.consultations ?? [], [d]);
  const consultee = useCallback((pjId: number) => moi.filter((c) => c.pieceJointeId === pjId), [moi]);

  /** Ouvre la pièce dans la visionneuse et consigne la consultation (qui, quand). */
  const ouvrir = (pj: PieceDossier) => {
    setVue(pj);
    kycService.consulter(dossierId, pj.id).then(() => kycService.obtenir(dossierId).then(setD)).catch(() => undefined);
  };

  if (erreur) return <div className="space-y-3"><Link href="/dashboard/kyc" className="text-sm text-muted-foreground inline-flex items-center"><ArrowLeft className="h-4 w-4 mr-1" />Retour</Link><p className="text-destructive">{erreur}</p></div>;
  if (!d) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Chargement…</div>;

  const p = d.client ?? d.prospect;
  const ouvert = d.statut === 'brouillon' || d.statut === 'en_controle';
  const controlable = d.statut === 'en_controle' && can('kyc:EXECUTE');
  const nonEvalues = d.controles.filter((c) => c.resultat === null).length;
  const nonConformes = d.controles.filter((c) => c.resultat === 'non_conforme').length;

  // Pièces que le contrôleur doit avoir lues : copies des pièces d'identité + justificatifs du dossier.
  const toutes: PieceDossier[] = [
    ...d.piecesIdentite.map((x) => x.pieceJointe).filter((x): x is PieceDossier => !!x),
    ...d.piecesJointes.filter((x) => !d.piecesIdentite.some((i) => i.pieceJointeId === x.id)),
  ];
  const lues = toutes.filter((x) => consultee(x.id).length > 0).length;
  const ecarts = conc ? conc.resume.ecarts + conc.resume.manquants : null;

  const ongletBtn = (o: Onglet, label: string, badge?: string | number | null, alerte?: boolean) => (
    <button key={o} onClick={() => setOnglet(o)} className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap', onglet === o ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted-foreground hover:text-foreground')}>
      {label}{badge != null && <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-[11px]', alerte ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground')}>{badge}</span>}
    </button>
  );

  return (
    <div className="space-y-4">
      {vue && <ApercuPiece piece={vue} onFermer={() => setVue(null)} />}
      <Link href="/dashboard/kyc" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4 mr-1" />Dossiers KYC</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{d.reference}</h1>
        <Badge variant={STATUT_KYC[d.statut].v}>{STATUT_KYC[d.statut].l}</Badge>
        {d.niveauRisque && <Badge variant={RISQUE[d.niveauRisque].v}>Risque {RISQUE[d.niveauRisque].l}{d.scoreLcbft != null ? ` · ${d.scoreLcbft}/100` : ''}</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">{p ? `${p.prenom ?? ''} ${p.nom}` : ''} · constitué par {d.creePar.prenom} {d.creePar.nom}{d.validePar ? ` · traité par ${d.validePar.prenom} ${d.validePar.nom}` : ''}</p>
      {d.motifRejet && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">Motif du rejet : {d.motifRejet}</p>}

      {/* Tableau de bord du contrôle : où en est-on, vraiment ? */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicateur titre="Contrôles évalués" valeur={`${d.controles.length - nonEvalues} / ${d.controles.length}`} ok={nonEvalues === 0} detail={nonConformes ? `${nonConformes} non conforme(s)` : undefined} />
        <Indicateur titre="Pièces consultées" valeur={toutes.length ? `${lues} / ${toutes.length}` : 'Aucune pièce'} ok={toutes.length > 0 && lues === toutes.length} detail={toutes.length === 0 ? 'Joignez au moins la copie de la pièce d\'identité' : undefined} />
        <Indicateur titre="Concordance avec la fiche" valeur={conc ? (ecarts ? `${ecarts} point(s) à examiner` : 'Tout concorde') : '…'} ok={ecarts === 0} detail={conc ? `${conc.resume.ok} concordant(s) sur ${conc.resume.total}` : undefined} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-1 border-b overflow-x-auto">
            {ongletBtn('controles', 'Contrôles', `${d.controles.length - nonEvalues}/${d.controles.length}`)}
            {ongletBtn('concordance', 'Concordance avec la fiche', ecarts, !!ecarts)}
            {ongletBtn('fiche', type(d) === 'client' ? 'Fiche client' : 'Fiche prospect')}
            {ongletBtn('pieces', 'Pièces et justificatifs', toutes.length ? `${lues}/${toutes.length}` : 0)}
          </div>

          {onglet === 'controles' && (
            <div className="space-y-3">
              {d.statut === 'brouillon' && <p className="text-sm text-muted-foreground">Les contrôles s'évaluent une fois le dossier soumis.</p>}
              {d.controles.map((c) => (
                <CarteControle key={c.id} c={c} dossier={d} conc={conc} controlable={controlable} occupe={occupe} consultee={consultee}
                  onOuvrir={ouvrir} onEvaluer={(resultat, commentaire, accepte) => agir(() => kycService.evaluerControle(d.id, c.id, { resultat, commentaire, accepte_ecarts: accepte }), 'Contrôle enregistré')} />
              ))}
            </div>
          )}

          {onglet === 'concordance' && (
            <Card><CardContent className="pt-5">
              <p className="mb-4 text-sm text-muted-foreground">Chaque ligne compare la fiche du client avec ce que montre le dossier (pièces, justificatifs, base de données). Un écart ou un manque doit être corrigé, ou justifié dans l'observation du contrôle concerné.</p>
              {conc ? <ConcordanceTable verifications={conc.verifications} /> : <Loader2 className="h-4 w-4 animate-spin" />}
            </CardContent></Card>
          )}

          {onglet === 'fiche' && (
            <Card><CardContent className="pt-5">{conc ? <FichePersonne type={conc.type} fiche={conc.personne} /> : <Loader2 className="h-4 w-4 animate-spin" />}</CardContent></Card>
          )}

          {onglet === 'pieces' && (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Pièces d'identité</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {d.piecesIdentite.length === 0 && <p className="text-sm text-muted-foreground">Aucune pièce enregistrée.</p>}
                  {d.piecesIdentite.map((x) => (
                    <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
                      <p>{TYPES_PIECE.find((t) => t[0] === x.type)?.[1]} · n° <strong>{x.numero}</strong>{x.dateExpiration ? ` · expire le ${formatDate(x.dateExpiration)}` : ' · expiration non saisie'}</p>
                      {x.pieceJointe ? <BoutonPiece pj={x.pieceJointe} lectures={consultee(x.pieceJointe.id)} onOuvrir={ouvrir} /> : <Badge variant="warning">Sans copie</Badge>}
                    </div>
                  ))}
                  {ouvert && can('kyc:CREATE', 'kyc:UPDATE') && (
                    <div className="grid sm:grid-cols-4 gap-2 pt-2 border-t">
                      <select className="h-10 rounded-lg border bg-background px-2 text-sm" value={piece.type} onChange={(e) => setPiece({ ...piece, type: e.target.value })}>{TYPES_PIECE.map((t) => <option key={t[0]} value={t[0]}>{t[1]}</option>)}</select>
                      <Input placeholder="Numéro" value={piece.numero} onChange={(e) => setPiece({ ...piece, numero: e.target.value })} />
                      <Input type="date" title="Date d'expiration" value={piece.expiration} onChange={(e) => setPiece({ ...piece, expiration: e.target.value })} />
                      <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} />
                      <Button size="sm" className="sm:col-span-4" disabled={occupe || !piece.numero}
                        onClick={() => agir(async () => {
                          const f = new FormData(); f.append('type', piece.type); f.append('numero', piece.numero);
                          if (piece.expiration) f.append('date_expiration', piece.expiration);
                          if (fichier) f.append('fichier', fichier);
                          await kycService.ajouterPiece(d.id, f); setPiece({ type: 'cni', numero: '', expiration: '' }); setFichier(null);
                        }, "Pièce d'identité ajoutée")}>Ajouter la pièce</Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Justificatifs du dossier</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {d.piecesJointes.filter((x) => !d.piecesIdentite.some((i) => i.pieceJointeId === x.id)).length === 0 && <p className="text-sm text-muted-foreground">Aucun document.</p>}
                  {d.piecesJointes.filter((x) => !d.piecesIdentite.some((i) => i.pieceJointeId === x.id)).map((x) => (
                    <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
                      <p className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" />{x.intitule} <span className="text-xs text-muted-foreground">v{x.version} · {x.nomFichier}</span></p>
                      <BoutonPiece pj={x} lectures={consultee(x.id)} onOuvrir={ouvrir} />
                    </div>
                  ))}
                  {ouvert && can('kyc:CREATE', 'kyc:UPDATE') && (
                    <div className="grid sm:grid-cols-3 gap-2 pt-2 border-t">
                      <Input placeholder="Intitulé (ex. Facture d'eau)" value={document.intitule} onChange={(e) => setDocument({ ...document, intitule: e.target.value })} />
                      <Input type="file" onChange={(e) => setDocument({ ...document, fichier: e.target.files?.[0] ?? null })} />
                      <Button size="sm" disabled={occupe || !document.fichier}
                        onClick={() => agir(async () => { const f = new FormData(); f.append('fichier', document.fichier!); if (document.intitule) f.append('intitule', document.intitule); await kycService.joindre(d.id, f); setDocument({ intitule: '', fichier: null }); }, 'Document ajouté')}><Paperclip className="mr-1.5 h-4 w-4" />Joindre</Button>
                      <p className="sm:col-span-3 text-xs text-muted-foreground">Un document de même intitulé remplace le précédent, qui reste conservé en version antérieure.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Décision sur le dossier</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {d.statut === 'brouillon' && can('kyc:SUBMIT') && <Button className="w-full" variant="brand" disabled={occupe} onClick={() => agir(() => kycService.soumettre(d.id), 'Dossier soumis au contrôle')}>Soumettre au contrôle</Button>}
              {d.statut === 'en_controle' && can('kyc:APPROVE') && (
                <>
                  <ul className="space-y-1 text-xs">
                    <Pre ok={nonEvalues === 0} texte={nonEvalues === 0 ? 'Tous les contrôles sont évalués' : `${nonEvalues} contrôle(s) à évaluer`} />
                    <Pre ok={nonConformes === 0} texte={nonConformes === 0 ? 'Aucune non-conformité' : `${nonConformes} contrôle(s) non conforme(s) : rejeter ou faire corriger`} />
                    <Pre ok={toutes.length > 0 && lues === toutes.length} texte={toutes.length === 0 ? 'Aucune pièce jointe' : lues === toutes.length ? 'Toutes les pièces ont été consultées' : `${toutes.length - lues} pièce(s) non consultée(s)`} avertissement />
                    <Pre ok={ecarts === 0} texte={ecarts === 0 ? 'Fiche et dossier concordent' : `${ecarts ?? '…'} écart(s) ou manque(s) avec la fiche`} avertissement />
                  </ul>
                  <Button className="w-full" variant="success" disabled={occupe || nonEvalues > 0 || nonConformes > 0} onClick={() => agir(async () => { const r = await kycService.valider(d.id); toast.info(`Risque ${r.niveau_risque} (${r.score_lcbft}/100)`); }, 'Dossier validé')}>Valider le dossier</Button>
                  <p className="text-xs text-muted-foreground">La validation est refusée à la personne qui a constitué le dossier.</p>
                </>
              )}
              {d.statut === 'en_controle' && can('kyc:REJECT') && <Button className="w-full" variant="destructive" disabled={occupe} onClick={() => { const m = window.prompt('Motif du rejet :'); if (m && m.trim().length >= 3) void agir(() => kycService.rejeter(d.id, m.trim()), 'Dossier rejeté'); }}>Rejeter</Button>}
              {d.statut === 'rejete' && can('kyc:CREATE', 'kyc:UPDATE') && <Button className="w-full" variant="outline" disabled={occupe} onClick={() => agir(() => kycService.rouvrir(d.id), 'Dossier rouvert')}>Rouvrir pour correction</Button>}
              {['valide', 'rejete'].includes(d.statut) && can('kyc:APPROVE') && <Button className="w-full" variant="outline" disabled={occupe} onClick={() => agir(() => kycService.archiver(d.id), 'Dossier archivé')}>Archiver</Button>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Historique</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {d.actes.map((a) => (
                  <li key={a.id} className="text-sm border-l-2 border-brand-200 pl-3">
                    <p className="font-medium">{ETAPES[a.etape] ?? a.etape}</p>
                    <p className="text-xs text-muted-foreground">{a.acteur.prenom} {a.acteur.nom} · {formatDateTime(a.createdAt)}</p>
                    {a.commentaire && <p className="text-xs mt-0.5">{a.commentaire}</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const type = (d: DossierKycDetail) => (d.client ? 'client' : 'prospect');

function Indicateur({ titre, valeur, ok, detail }: { titre: string; valeur: string; ok: boolean; detail?: string }) {
  return (
    <div className={cn('rounded-lg border p-3', ok ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-300 bg-amber-50/60')}>
      <p className="text-xs text-muted-foreground">{titre}</p>
      <p className="flex items-center gap-1.5 text-lg font-semibold">{ok && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{valeur}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function Pre({ ok, texte, avertissement }: { ok: boolean; texte: string; avertissement?: boolean }) {
  return <li className={cn('flex items-start gap-1.5', ok ? 'text-emerald-700' : avertissement ? 'text-amber-700' : 'text-destructive')}><span aria-hidden>{ok ? '✓' : avertissement ? '!' : '✗'}</span>{texte}</li>;
}

function BoutonPiece({ pj, lectures, onOuvrir }: { pj: PieceDossier; lectures: { acteur: { prenom: string; nom: string }; at: string }[]; onOuvrir: (p: PieceDossier) => void }) {
  const derniere = lectures[lectures.length - 1];
  return (
    <div className="flex items-center gap-2">
      {derniere && <span className="text-xs text-emerald-700" title={`${derniere.acteur.prenom} ${derniere.acteur.nom} · ${formatDateTime(derniere.at)}`}>✓ Consultée · {derniere.acteur.prenom} {derniere.acteur.nom}</span>}
      <Button size="sm" variant={derniere ? 'outline' : 'brand'} onClick={() => onOuvrir(pj)}><Eye className="mr-1.5 h-4 w-4" />{derniere ? 'Relire' : 'Consulter'}</Button>
    </div>
  );
}

/** Un contrôle : les vérifications qui l'éclairent, les pièces à lire, puis la décision motivée. */
function CarteControle({ c, dossier, conc, controlable, occupe, consultee, onOuvrir, onEvaluer }: {
  c: ControleKyc; dossier: DossierKycDetail; conc: Concordance | null; controlable: boolean; occupe: boolean;
  consultee: (id: number) => { acteur: { prenom: string; nom: string }; at: string }[];
  onOuvrir: (p: PieceDossier) => void;
  onEvaluer: (r: 'conforme' | 'non_conforme' | 'non_applicable', commentaire: string, accepte: boolean) => void;
}) {
  const [ouvert, setOuvert] = useState(c.resultat === null);
  const [observation, setObservation] = useState('');
  const [accepte, setAccepte] = useState(false);
  const liees = conc?.verifications.filter((v) => v.controles.includes(c.code)) ?? [];
  const aExaminer = liees.filter((v) => v.statut === 'ecart' || v.statut === 'manquant');
  const pieces: PieceDossier[] = c.code === 'identite_conforme'
    ? dossier.piecesIdentite.map((x) => x.pieceJointe).filter((x): x is PieceDossier => !!x)
    : ['adresse_verifiee', 'revenus_justifies', 'origine_fonds', 'activite_verifiee'].includes(c.code)
      ? dossier.piecesJointes.filter((x) => !dossier.piecesIdentite.some((i) => i.pieceJointeId === x.id))
      : [];
  const manque = observation.trim().length < 10;
  const badge = c.resultat ? <Badge variant={c.resultat === 'conforme' ? 'success' : c.resultat === 'non_conforme' ? 'destructive' : 'outline'}>{c.resultat === 'conforme' ? 'Conforme' : c.resultat === 'non_conforme' ? 'Non conforme' : 'Sans objet'}</Badge> : <Badge variant="warning">À évaluer</Badge>;

  return (
    <Card>
      <button type="button" className="flex w-full items-start justify-between gap-2 p-4 text-left" onClick={() => setOuvert(!ouvert)}>
        <div>
          <p className="font-medium">{c.libelle}</p>
          {liees.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{aExaminer.length ? <span className="text-amber-700">{aExaminer.length} point(s) à examiner</span> : 'Tout concorde avec la fiche'} · {liees.length} vérification(s)</p>}
        </div>
        {badge}
      </button>
      {ouvert && (
        <CardContent className="space-y-3 border-t pt-4">
          {liees.length > 0 && <div className="grid gap-2 lg:grid-cols-2">{liees.map((v) => <LigneVerification key={v.code} v={v} />)}</div>}
          {pieces.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pièces à lire pour ce contrôle</p>
              {pieces.map((x) => (
                <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                  <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" />{x.intitule}</span>
                  <BoutonPiece pj={x} lectures={consultee(x.id)} onOuvrir={onOuvrir} />
                </div>
              ))}
            </div>
          )}
          {pieces.length === 0 && c.code === 'identite_conforme' && <p className="text-sm text-amber-700">Aucune copie de pièce d'identité n'est jointe : le contrôle ne peut pas s'appuyer sur le document.</p>}

          {c.resultat && (
            <div className="rounded-md bg-muted/50 p-2.5 text-sm">
              <p className="text-xs text-muted-foreground">Décision{c.controlePar ? ` de ${c.controlePar.prenom} ${c.controlePar.nom}` : ''}</p>
              <p>{c.commentaire || '—'}</p>
            </div>
          )}

          {controlable && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.resultat ? 'Modifier la décision' : 'Votre décision'}</p>
              <Textarea rows={3} value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Observation obligatoire : qu'avez-vous vérifié, sur quel document, avec quel résultat ? (10 caractères minimum)" />
              {aExaminer.length > 0 && (
                <label className="flex items-start gap-2 text-xs text-amber-800">
                  <input type="checkbox" className="mt-0.5" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} />
                  Je constate les écarts ou manques ci-dessus ({aExaminer.map((v) => v.libelle).join(', ')}) et je les accepte pour une décision « conforme », justifiés dans mon observation.
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="success" disabled={occupe || manque || (aExaminer.length > 0 && !accepte)} onClick={() => onEvaluer('conforme', observation, accepte)}>Conforme</Button>
                <Button size="sm" variant="destructive" disabled={occupe || manque} onClick={() => onEvaluer('non_conforme', observation, false)}>Non conforme</Button>
                <Button size="sm" variant="ghost" disabled={occupe || manque} onClick={() => onEvaluer('non_applicable', observation, false)}>Sans objet</Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
