'use client';
/* eslint-disable react/no-unescaped-entities -- texte français : les apostrophes sont légitimes dans le JSX */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { kycService, type ControleKyc, type DossierKycDetail } from '@/services/kycService';
import { useCan } from '@/hooks/useCan';
import { formatDate, formatDateTime } from '@/lib/utils';
import { RISQUE, STATUT_KYC } from '@/lib/kycLabels';
import { telecharger, cheminFichier } from '@/lib/apiHelpers';

const message = (e: unknown, defaut: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? defaut;
const TYPES_PIECE = [['cni', "Carte nationale d'identité"], ['passeport', 'Passeport'], ['permis', 'Permis de conduire'], ['carte_sejour', 'Carte de séjour'], ['recepisse', 'Récépissé'], ['autre', 'Autre']] as const;
const ETAPES: Record<string, string> = {
  kyc_creation: 'Ouverture du dossier', kyc_soumission: 'Soumission au contrôle', kyc_validation: 'Validation', kyc_rejet: 'Rejet',
  kyc_reouverture: 'Réouverture', kyc_archivage: 'Archivage',
};

export default function KycDetailPage() {
  const { id } = useParams<{ id: string }>();
  const dossierId = Number(id);
  const { can } = useCan();
  const [d, setD] = useState<DossierKycDetail | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [piece, setPiece] = useState({ type: 'cni', numero: '', expiration: '' });
  const [fichier, setFichier] = useState<File | null>(null);
  const [document, setDocument] = useState<{ intitule: string; fichier: File | null }>({ intitule: '', fichier: null });

  const charger = useCallback(async () => {
    try { setD(await kycService.obtenir(dossierId)); setErreur(null); } catch (e) { setErreur(message(e, 'Dossier introuvable')); }
  }, [dossierId]);
  useEffect(() => { void charger(); }, [charger]);

  const agir = async (fn: () => Promise<unknown>, ok: string) => {
    setOccupe(true);
    try { await fn(); toast.success(ok); await charger(); } catch (e) { toast.error(message(e, 'Action impossible')); } finally { setOccupe(false); }
  };

  if (erreur) return <div className="space-y-3"><Link href="/dashboard/kyc" className="text-sm text-muted-foreground inline-flex items-center"><ArrowLeft className="h-4 w-4 mr-1" />Retour</Link><p className="text-destructive">{erreur}</p></div>;
  if (!d) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Chargement…</div>;

  const p = d.client ?? d.prospect;
  const ouvert = d.statut === 'brouillon' || d.statut === 'en_controle';
  const nonEvalues = d.controles.filter((c) => c.resultat === null).length;

  const evaluer = (c: ControleKyc, resultat: 'conforme' | 'non_conforme' | 'non_applicable') => {
    let commentaire: string | undefined;
    if (resultat === 'non_conforme') {
      const saisi = window.prompt('Motif de la non-conformité (obligatoire) :');
      if (!saisi?.trim()) return;
      commentaire = saisi.trim();
    }
    void agir(() => kycService.evaluerControle(d.id, c.id, { resultat, commentaire }), 'Contrôle enregistré');
  };

  return (
    <div className="space-y-4">
      <Link href="/dashboard/kyc" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4 mr-1" />Dossiers KYC</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{d.reference}</h1>
        <Badge variant={STATUT_KYC[d.statut].v}>{STATUT_KYC[d.statut].l}</Badge>
        {d.niveauRisque && <Badge variant={RISQUE[d.niveauRisque].v}>Risque {RISQUE[d.niveauRisque].l}{d.scoreLcbft != null ? ` · ${d.scoreLcbft}/100` : ''}</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">{p ? `${p.prenom ?? ''} ${p.nom}` : ''} · constitué par {d.creePar.prenom} {d.creePar.nom}{d.validePar ? ` · traité par ${d.validePar.prenom} ${d.validePar.nom}` : ''}</p>
      {d.motifRejet && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">Motif du rejet : {d.motifRejet}</p>}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Pièces d'identité</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {d.piecesIdentite.length === 0 && <p className="text-sm text-muted-foreground">Aucune pièce enregistrée.</p>}
              {d.piecesIdentite.map((x) => (
                <p key={x.id} className="text-sm rounded-md border p-2">{TYPES_PIECE.find((t) => t[0] === x.type)?.[1]} · n° {x.numero}{x.dateExpiration ? ` · expire le ${formatDate(x.dateExpiration)}` : ''}</p>
              ))}
              {ouvert && can('kyc:CREATE', 'kyc:UPDATE') && (
                <div className="grid sm:grid-cols-4 gap-2 pt-2 border-t">
                  <select className="h-9 rounded-md border bg-background px-2 text-sm" value={piece.type} onChange={(e) => setPiece({ ...piece, type: e.target.value })}>{TYPES_PIECE.map((t) => <option key={t[0]} value={t[0]}>{t[1]}</option>)}</select>
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
            <CardHeader><CardTitle className="text-base">Contrôles KYC et LCB-FT</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {d.statut === 'brouillon' && <p className="text-sm text-muted-foreground">Les contrôles s'évaluent une fois le dossier soumis.</p>}
              {d.controles.map((c) => (
                <div key={c.id} className="rounded-md border p-3 text-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p>{c.libelle}</p>
                    {c.resultat ? <Badge variant={c.resultat === 'conforme' ? 'success' : c.resultat === 'non_conforme' ? 'destructive' : 'outline'}>{c.resultat === 'conforme' ? 'Conforme' : c.resultat === 'non_conforme' ? 'Non conforme' : 'Sans objet'}</Badge> : <Badge variant="warning">À évaluer</Badge>}
                  </div>
                  {c.commentaire && <p className="text-xs text-muted-foreground">{c.commentaire}</p>}
                  {d.statut === 'en_controle' && can('kyc:EXECUTE') && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={occupe} onClick={() => evaluer(c, 'conforme')}>Conforme</Button>
                      <Button size="sm" variant="outline" disabled={occupe} onClick={() => evaluer(c, 'non_conforme')}>Non conforme</Button>
                      <Button size="sm" variant="ghost" disabled={occupe} onClick={() => evaluer(c, 'non_applicable')}>Sans objet</Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Justificatifs</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {d.piecesJointes.filter((x) => x.intitule !== "Pièce d'identité cni").length === 0 && <p className="text-sm text-muted-foreground">Aucun document.</p>}
              {d.piecesJointes.map((x) => <p key={x.id} className="text-sm"><button type="button" onClick={() => telecharger(cheminFichier(x.url), x.nomFichier, true).catch((e) => toast.error(message(e, 'Fichier indisponible')))} className="text-brand-700 hover:underline">{x.intitule}</button> <span className="text-xs text-muted-foreground">v{x.version} · {x.nomFichier}</span></p>)}
              {ouvert && can('kyc:CREATE', 'kyc:UPDATE') && (
                <div className="grid sm:grid-cols-3 gap-2 pt-2 border-t">
                  <Input placeholder="Intitulé (ex. Facture d'eau)" value={document.intitule} onChange={(e) => setDocument({ ...document, intitule: e.target.value })} />
                  <Input type="file" onChange={(e) => setDocument({ ...document, fichier: e.target.files?.[0] ?? null })} />
                  <Button size="sm" disabled={occupe || !document.fichier}
                    onClick={() => agir(async () => { const f = new FormData(); f.append('fichier', document.fichier!); if (document.intitule) f.append('intitule', document.intitule); await kycService.joindre(d.id, f); setDocument({ intitule: '', fichier: null }); }, 'Document ajouté')}>Joindre</Button>
                  <p className="sm:col-span-3 text-xs text-muted-foreground">Un document de même intitulé remplace le précédent, qui reste conservé en version antérieure.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {d.statut === 'brouillon' && can('kyc:SUBMIT') && <Button className="w-full" variant="brand" disabled={occupe} onClick={() => agir(() => kycService.soumettre(d.id), 'Dossier soumis au contrôle')}>Soumettre au contrôle</Button>}
              {d.statut === 'en_controle' && can('kyc:APPROVE') && (
                <>
                  <Button className="w-full" variant="success" disabled={occupe || nonEvalues > 0} onClick={() => agir(async () => { const r = await kycService.valider(d.id); toast.info(`Risque ${r.niveau_risque} (${r.score_lcbft}/100)`); }, 'Dossier validé')}>Valider le dossier</Button>
                  {nonEvalues > 0 && <p className="text-xs text-muted-foreground">{nonEvalues} contrôle(s) restent à évaluer.</p>}
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
