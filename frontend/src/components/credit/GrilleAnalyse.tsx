'use client';
/* eslint-disable react/no-unescaped-entities -- texte français : les apostrophes sont légitimes dans le JSX */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Printer, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { creditService } from '@/services/creditService';
import type { GrilleForm, HypotheseRetenue, ResultatBilan, ResultatGrille } from '@/types/credit';

const VIDE: GrilleForm = {
  moisAnnee: new Date().toISOString().slice(0, 7),
  caHypotheseHaute: 0, caHypotheseBasse: 0, hypotheseRetenue: 'basse', caCommentaire: '',
  achatsMarchandises: 0, transportApprovisionnement: 0,
  loyerLocal: 0, impotsTaxes: 0, salaires: 0, eauElectricite: 0, reparationsMaintenance: 0, autresDepensesActivite: 0,
  loyerDomicile: 0, autresDepensesFamiliales: 0,
  echeancesCecaw: 0, echeancesAutresEmf: 0, detteAutresEmf: 0, autresRevenusNets: 0, detailCalculs: '',
  bilan: {
    localTerrain: 0, equipement: 0, stockMarchandises: 0, creancesClients: 0, liquidites: 0, autresActifs: 0,
    dettes: 0, actifCommentaire: '', passifCommentaire: '',
  },
};

type Stocke = Record<string, unknown>;
const nombre = (v: unknown) => (v == null || v === '' ? 0 : Number(v));
const montant = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);

/** Reconstruit le formulaire depuis la grille enregistrée (les décimaux arrivent en chaînes). */
function versFormulaire(g: Stocke, b: Stocke | null): GrilleForm {
  const bilan = b ?? {};
  return {
    moisAnnee: g.moisAnnee ? String(g.moisAnnee).slice(0, 7) : VIDE.moisAnnee,
    caHypotheseHaute: nombre(g.caHypotheseHaute), caHypotheseBasse: nombre(g.caHypotheseBasse),
    hypotheseRetenue: (g.hypotheseRetenue as HypotheseRetenue) ?? 'basse', caCommentaire: (g.caCommentaire as string) ?? '',
    achatsMarchandises: nombre(g.achatsMarchandises), transportApprovisionnement: nombre(g.transportApprovisionnement),
    loyerLocal: nombre(g.loyerLocal), impotsTaxes: nombre(g.impotsTaxes), salaires: nombre(g.salaires),
    eauElectricite: nombre(g.eauElectricite), reparationsMaintenance: nombre(g.reparationsMaintenance), autresDepensesActivite: nombre(g.autresDepensesActivite),
    loyerDomicile: nombre(g.loyerDomicile), autresDepensesFamiliales: nombre(g.autresDepensesFamiliales),
    echeancesCecaw: nombre(g.echeancesCecaw), echeancesAutresEmf: nombre(g.echeancesAutresEmf),
    detteAutresEmf: nombre(g.detteAutresEmf), autresRevenusNets: nombre(g.autresRevenusNets),
    detailCalculs: (g.detailCalculs as string) ?? '',
    bilan: {
      localTerrain: nombre(bilan.localTerrain), equipement: nombre(bilan.equipement), stockMarchandises: nombre(bilan.stockMarchandises),
      creancesClients: nombre(bilan.creancesClients), liquidites: nombre(bilan.liquidites), autresActifs: nombre(bilan.autresActifs),
      dettes: nombre(bilan.dettes), actifCommentaire: (bilan.actifCommentaire as string) ?? '', passifCommentaire: (bilan.passifCommentaire as string) ?? '',
    },
  };
}

interface Props {
  demandeId: number;
  reference: string;
  clientNom: string;
  /** Vrai si le statut du dossier et les droits de l'utilisateur autorisent la saisie. */
  editable: boolean;
  peutTransmettre: boolean;
  onChange?: () => void;
}

export default function GrilleAnalyse({ demandeId, reference, clientNom, editable, peutTransmettre, onChange }: Props) {
  const [form, setForm] = useState<GrilleForm>(VIDE);
  const [precedente, setPrecedente] = useState<{ ref: string; g: Stocke; b: Stocke | null } | null>(null);
  const [calcul, setCalcul] = useState<{ grille: ResultatGrille; bilan: ResultatBilan; mensualite: number | null } | null>(null);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [sale, setSale] = useState(false);
  const versionApercu = useRef(0);

  // Chargement initial de la grille existante et de la colonne « demande précédente ».
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const r = await creditService.obtenirGrille(demandeId);
        if (annule) return;
        if (r.grille) setForm(versFormulaire(r.grille, r.grille.bilan));
        if (r.precedente) setPrecedente({ ref: r.precedente.demande.reference, g: r.precedente, b: r.precedente.bilan });
      } catch {
        if (!annule) toast.error("Impossible de charger la grille d'analyse.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => { annule = true; };
  }, [demandeId]);

  // Aperçu calculé par le serveur : les mêmes formules que l'enregistrement, donc aucun écart possible.
  // Les réponses arrivant dans le désordre sont écartées grâce au numéro de version.
  useEffect(() => {
    if (chargement) return;
    const version = ++versionApercu.current;
    const t = setTimeout(async () => {
      try {
        const r = await creditService.apercuGrille(form, demandeId);
        if (version === versionApercu.current) setCalcul({ grille: r.grille, bilan: r.bilan, mensualite: r.mensualite_proposee });
      } catch {
        /* l'aperçu est un confort : l'enregistrement revalidera de toute façon */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [form, chargement, demandeId]);

  const maj = useCallback(<K extends keyof GrilleForm>(cle: K, valeur: GrilleForm[K]) => {
    setForm((f) => ({ ...f, [cle]: valeur }));
    setSale(true);
  }, []);
  const majBilan = useCallback(<K extends keyof GrilleForm['bilan']>(cle: K, valeur: GrilleForm['bilan'][K]) => {
    setForm((f) => ({ ...f, bilan: { ...f.bilan, [cle]: valeur } }));
    setSale(true);
  }, []);

  const enregistrer = async () => {
    setEnregistrement(true);
    try {
      await creditService.sauvegarderGrille(demandeId, form);
      setSale(false);
      toast.success("Grille d'analyse enregistrée");
      onChange?.();
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Enregistrement impossible");
    } finally {
      setEnregistrement(false);
    }
  };

  const transmettre = async () => {
    if (sale) { toast.error("Enregistrez d'abord vos modifications."); return; }
    setEnregistrement(true);
    try {
      const r = await creditService.terminerAnalyse(demandeId);
      toast.success(`Dossier transmis au comité. Score indicatif : ${r.score.valeur}/100 (${r.score.classe})`);
      onChange?.();
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Transmission impossible');
    } finally {
      setEnregistrement(false);
    }
  };

  const c = calcul?.grille;
  const b = calcul?.bilan;
  const alertes = useMemo(() => [...(c?.alertes ?? []), ...(b?.alertes ?? [])], [c, b]);
  const prec = (cle: string) => (precedente ? nombre(precedente.g[cle]) : null);
  const precBilan = (cle: string) => (precedente?.b ? nombre(precedente.b[cle]) : null);

  if (chargement) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement de la grille…</div>;
  }

  /** Ligne de saisie : libellé, montant actuel modifiable, montant précédent en lecture seule. */
  const ligne = ({ label, cle, precCle, indent = false }: { label: string; cle: keyof GrilleForm; precCle?: string; indent?: boolean }) => (
    <tr key={label} className="border-t">
      <td className={cn('px-3 py-1.5 text-sm', indent && 'pl-8')}>{label}</td>
      <td className="px-3 py-1.5 w-44">
        {editable ? (
          <Input type="number" min={0} inputMode="decimal" className="h-8 text-right" value={(form[cle] as number) || ''} placeholder="0"
            onChange={(e) => maj(cle, (e.target.value === '' ? 0 : Number(e.target.value)) as never)} />
        ) : <span className="block text-right tabular-nums">{montant(form[cle] as number)}</span>}
      </td>
      <td className="px-3 py-1.5 w-40 text-right text-sm text-muted-foreground tabular-nums">{montant(prec(precCle ?? String(cle)))}</td>
    </tr>
  );

  /** Ligne calculée par le serveur, mise en évidence. */
  const calculee = ({ label, valeur, precCle, fort = false, suffixe = '' }: { label: string; valeur: number | null | undefined; precCle?: string; fort?: boolean; suffixe?: string }) => (
    <tr key={label} className={cn('border-t bg-muted/40', fort && 'bg-brand-50/60 font-semibold')}>
      <td className="px-3 py-1.5 text-sm">{label}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{montant(valeur)}{suffixe}</td>
      <td className="px-3 py-1.5 text-right text-sm text-muted-foreground tabular-nums">{precCle ? `${montant(prec(precCle))}${prec(precCle) != null ? suffixe : ''}` : '—'}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <style>{`@media print {
        body * { visibility: hidden; }
        #grille-imprimable, #grille-imprimable * { visibility: visible; }
        #grille-imprimable { position: absolute; left: 0; top: 0; width: 100%; }
        .no-print { display: none !important; }
      }`}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {sale && <Badge variant="warning">Modifications non enregistrées</Badge>}
          {!editable && <Badge variant="outline">Lecture seule</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Imprimer</Button>
          {editable && <Button size="sm" onClick={enregistrer} disabled={enregistrement || !sale}>{enregistrement ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}Enregistrer</Button>}
          {peutTransmettre && <Button size="sm" variant="brand" onClick={transmettre} disabled={enregistrement}><Send className="h-4 w-4 mr-1.5" />Transmettre au comité</Button>}
        </div>
      </div>

      {alertes.length > 0 && (
        <div className="no-print rounded-lg border border-warning/40 bg-warning-50 p-3 text-sm text-warning-700 space-y-1">
          {alertes.map((a) => <p key={a} className="flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{a}</p>)}
        </div>
      )}

      <div id="grille-imprimable" className="space-y-6">
        <div className="hidden print:block">
          <h2 className="text-lg font-bold">CECAW FINANCE — Grille d'analyse</h2>
          <p className="text-sm">Dossier {reference} · {clientNom}</p>
        </div>

        {/* ───────────── Compte d'exploitation ───────────── */}
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted px-3 py-2 text-sm font-semibold">
            Analyse chiffre d'affaires et dépenses mensuels de l'activité (avant impact du crédit)
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase">
                <th className="px-3 py-2 text-left">Chiffre d'affaires</th>
                <th className="px-3 py-2 text-right">
                  Demande actuelle
                  <div className="mt-1 normal-case">
                    {editable
                      ? <Input type="month" className="h-7 text-xs" value={form.moisAnnee} onChange={(e) => maj('moisAnnee', e.target.value)} />
                      : <span>{form.moisAnnee}</span>}
                  </div>
                </th>
                <th className="px-3 py-2 text-right">
                  Demande précédente
                  <div className="mt-1 normal-case">{precedente ? `${precedente.ref} · ${String(precedente.g.moisAnnee ?? '').slice(0, 7)}` : 'Aucune'}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {ligne({ label: "Chiffre d'affaires — hypothèse haute", cle: "caHypotheseHaute" })}
              {ligne({ label: "Chiffre d'affaires — hypothèse basse", cle: "caHypotheseBasse" })}
              <tr className="border-t">
                <td className="px-3 py-1.5 text-sm">Hypothèse retenue</td>
                <td className="px-3 py-1.5 text-right">
                  {editable ? (
                    <select className="h-8 rounded-md border bg-background px-2 text-sm" value={form.hypotheseRetenue} onChange={(e) => maj('hypotheseRetenue', e.target.value as HypotheseRetenue)}>
                      <option value="basse">Basse</option><option value="moyenne">Moyenne</option><option value="haute">Haute</option>
                    </select>
                  ) : <span className="capitalize">{form.hypotheseRetenue}</span>}
                </td>
                <td />
              </tr>
              {calculee({ label: "Chiffre d'affaires retenu (A)", valeur: c?.caRetenu, precCle: "caRetenu", fort: true })}

              <tr className="border-t bg-muted"><td colSpan={3} className="px-3 py-1.5 text-xs font-semibold uppercase">Dépenses</td></tr>
              {ligne({ label: "Achats marchandises et matières premières (correspondant au CA retenu en (A))", cle: "achatsMarchandises" })}
              {ligne({ label: "Transport / frais d'approvisionnement", cle: "transportApprovisionnement" })}
              {calculee({ label: "Marge brute", valeur: c?.margeBrute, precCle: "margeBrute" })}
              {calculee({ label: "Taux de marge", valeur: c?.tauxMarge, precCle: "tauxMarge", suffixe: " %" })}

              <tr className="border-t"><td colSpan={3} className="px-3 py-1.5 text-xs font-semibold uppercase text-muted-foreground">Charges fixes</td></tr>
              {ligne({ label: "Loyer (local commercial)", cle: "loyerLocal", indent: true })}
              {ligne({ label: "Impôts et taxes", cle: "impotsTaxes", indent: true })}
              {ligne({ label: "Salaires", cle: "salaires", indent: true })}
              {ligne({ label: "Eau, électricité…", cle: "eauElectricite", indent: true })}
              {ligne({ label: "Réparations et maintenance", cle: "reparationsMaintenance", indent: true })}
              {ligne({ label: "Autres dépenses activité", cle: "autresDepensesActivite", indent: true })}
              {calculee({ label: "TOTAL DÉPENSES (B)", valeur: c?.totalDepenses, precCle: "totalDepenses", fort: true })}
              {calculee({ label: "CASH FLOW (A) − (B) = (C)", valeur: c?.cashFlow, precCle: "cashFlow", fort: true })}
            </tbody>
          </table>
          <div className="border-t p-3 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Détail et explications des calculs</label>
            <Textarea rows={3} disabled={!editable} value={form.caCommentaire} onChange={(e) => maj('caCommentaire', e.target.value)}
              placeholder="Ex. moyenne des 6 derniers mois du cahier des ventes, ajustée de la saisonnalité…" />
          </div>
        </div>

        {/* ───────────── Hors activité et capacité ───────────── */}
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full">
            <tbody>
              {ligne({ label: "Loyer domicile", cle: "loyerDomicile" })}
              {ligne({ label: "Autres dépenses familiales et personnelles", cle: "autresDepensesFamiliales" })}
              {calculee({ label: "Total dépenses hors activité (D)", valeur: c?.totalHorsActivite, precCle: "totalHorsActivite", fort: true })}
              {ligne({ label: "Échéances des prêts en cours à CECAW", cle: "echeancesCecaw" })}
              {ligne({ label: "Échéances des prêts dans d'autres EMF ou banques", cle: "echeancesAutresEmf" })}
              {ligne({ label: "Autres revenus nets", cle: "autresRevenusNets" })}
              {ligne({ label: "Dettes auprès d'autres EMF ou banques (encours)", cle: "detteAutresEmf" })}
              {calculee({ label: "CAPACITÉ DE REMBOURSEMENT (C) − (D) − échéances en cours + autres revenus", valeur: c?.capaciteRemboursement, precCle: "capaciteRemboursement", fort: true })}
              {calculee({ label: "Mensualité du crédit demandé", valeur: calcul?.mensualite })}
              {calculee({ label: "Taux de couverture (capacité / mensualité)", valeur: c?.tauxCouverture, suffixe: " ×" })}
              {calculee({ label: "Part de la capacité absorbée par la mensualité", valeur: c?.ratioEndettement, suffixe: " %" })}
            </tbody>
          </table>
        </div>

        {/* ───────────── Bilan ───────────── */}
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted px-3 py-2 text-sm font-semibold">I. Analyse bilan</div>
          <div className="grid md:grid-cols-2 gap-0 md:divide-x">
            <div>
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase">
                    <th className="px-3 py-2 text-left">Actifs professionnels (fonds de commerce)</th>
                    <th className="px-3 py-2 text-right">Actuelle</th>
                    <th className="px-3 py-2 text-right">Précédente</th>
                  </tr>
                </thead>
                <tbody>
                  {([['Local / Terrain', 'localTerrain'], ['Équipement', 'equipement'], ['Stock (marchandises)', 'stockMarchandises'], ['Créances clients', 'creancesClients'], ['Liquidités', 'liquidites'], ['Autres', 'autresActifs']] as const).map(([label, cle]) => (
                    <tr key={cle} className="border-t">
                      <td className="px-3 py-1.5 text-sm">{label}</td>
                      <td className="px-3 py-1.5 w-40">
                        {editable
                          ? <Input type="number" min={0} className="h-8 text-right" value={form.bilan[cle] || ''} placeholder="0" onChange={(e) => majBilan(cle, e.target.value === '' ? 0 : Number(e.target.value))} />
                          : <span className="block text-right tabular-nums">{montant(form.bilan[cle])}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right text-sm text-muted-foreground tabular-nums">{montant(precBilan(cle))}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-brand-50/60 font-semibold">
                    <td className="px-3 py-1.5 text-sm">TOTAL FONDS DE COMMERCE</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{montant(b?.totalFondsCommerce)}</td>
                    <td className="px-3 py-1.5 text-right text-sm text-muted-foreground tabular-nums">{montant(precBilan('totalFondsCommerce'))}</td>
                  </tr>
                </tbody>
              </table>
              <div className="border-t p-3"><label className="text-xs font-medium text-muted-foreground">Description et commentaires</label>
                <Textarea rows={2} disabled={!editable} value={form.bilan.actifCommentaire} onChange={(e) => majBilan('actifCommentaire', e.target.value)} /></div>
            </div>
            <div>
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase">
                    <th className="px-3 py-2 text-left">Passif</th>
                    <th className="px-3 py-2 text-right">Actuelle</th>
                    <th className="px-3 py-2 text-right">Précédente</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="px-3 py-1.5 text-sm">Dettes</td>
                    <td className="px-3 py-1.5 w-40">
                      {editable
                        ? <Input type="number" min={0} className="h-8 text-right" value={form.bilan.dettes || ''} placeholder="0" onChange={(e) => majBilan('dettes', e.target.value === '' ? 0 : Number(e.target.value))} />
                        : <span className="block text-right tabular-nums">{montant(form.bilan.dettes)}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right text-sm text-muted-foreground tabular-nums">{montant(precBilan('dettes'))}</td>
                  </tr>
                  <tr className="border-t bg-muted/40">
                    <td className="px-3 py-1.5 text-sm">Fonds propres <span className="text-xs text-muted-foreground">(total actif − dettes)</span></td>
                    <td className={cn('px-3 py-1.5 text-right tabular-nums', (b?.fondsPropres ?? 0) < 0 && 'text-destructive')}>{montant(b?.fondsPropres)}</td>
                    <td className="px-3 py-1.5 text-right text-sm text-muted-foreground tabular-nums">{montant(precBilan('fondsPropres'))}</td>
                  </tr>
                  <tr className="border-t bg-brand-50/60 font-semibold">
                    <td className="px-3 py-1.5 text-sm">TOTAL PASSIF</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{montant(b?.totalPassif)}</td>
                    <td className="px-3 py-1.5 text-right text-sm text-muted-foreground tabular-nums">{montant(precBilan('totalPassif'))}</td>
                  </tr>
                </tbody>
              </table>
              <div className="border-t p-3"><label className="text-xs font-medium text-muted-foreground">Description et commentaires</label>
                <Textarea rows={2} disabled={!editable} value={form.bilan.passifCommentaire} onChange={(e) => majBilan('passifCommentaire', e.target.value)} /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
