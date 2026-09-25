'use client';
/* eslint-disable react/no-unescaped-entities -- texte français : les apostrophes sont légitimes dans le JSX */

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { produitService } from '@/services/produitService';
import { adminService, type Parametrage } from '@/services/adminService';
import { useCan } from '@/hooks/useCan';
import { cn, formatDate } from '@/lib/utils';

interface ProduitLigne { id: number; nom: string; type?: 'epargne' | 'credit' | 'autre'; actif: boolean }

const message = (e: unknown, defaut: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? defaut;
const num = (v: string) => (v.trim() === '' ? null : Number(v));

const FORM_VIDE = {
  date_effet: new Date().toISOString().slice(0, 10),
  taux_interet_annuel: '', taux_penalite_retard: '', taux_remuneration_epargne: '', frais_dossier: '', frais_dossier_pct: '', commission: '',
  montant_min: '', montant_max: '', duree_min_mois: '', duree_max_mois: '', mode_amortissement: 'constant',
  age_min: '', age_max: '', anciennete_activite_min_mois: '', quotite_cessible_max_pct: '',
};

export default function ParametrageFinancierPage() {
  const { can } = useCan();
  const peutConfigurer = can('produits:CONFIGURE');
  const [produits, setProduits] = useState<ProduitLigne[]>([]);
  const [choisi, setChoisi] = useState<ProduitLigne | null>(null);
  const [versions, setVersions] = useState<Parametrage[]>([]);
  const [form, setForm] = useState(FORM_VIDE);
  const [occupe, setOccupe] = useState(false);
  const [chargement, setChargement] = useState(true);

  const chargerProduits = useCallback(async () => {
    try { setProduits((await produitService.getProduits({ per_page: 100 } as never)).data as ProduitLigne[]); }
    catch { toast.error('Produits indisponibles'); }
    finally { setChargement(false); }
  }, []);
  useEffect(() => { void chargerProduits(); }, [chargerProduits]);

  const chargerVersions = useCallback(async (id: number) => {
    try { setVersions(await adminService.parametrages(id)); } catch (e) { toast.error(message(e, 'Historique indisponible')); }
  }, []);
  useEffect(() => { if (choisi) void chargerVersions(choisi.id); }, [choisi, chargerVersions]);

  const definirType = async (type: 'epargne' | 'credit' | 'autre') => {
    if (!choisi) return;
    try { await adminService.definirTypeProduit(choisi.id, type); setChoisi({ ...choisi, type }); await chargerProduits(); toast.success('Type mis à jour'); }
    catch (e) { toast.error(message(e, 'Mise à jour impossible')); }
  };

  const enregistrer = async () => {
    if (!choisi) return;
    setOccupe(true);
    try {
      await adminService.creerParametrage({
        produit_id: choisi.id, date_effet: form.date_effet,
        taux_interet_annuel: num(form.taux_interet_annuel), taux_penalite_retard: num(form.taux_penalite_retard),
        taux_remuneration_epargne: num(form.taux_remuneration_epargne), frais_dossier: num(form.frais_dossier),
        frais_dossier_pct: num(form.frais_dossier_pct), commission: num(form.commission),
        montant_min: num(form.montant_min), montant_max: num(form.montant_max),
        duree_min_mois: num(form.duree_min_mois), duree_max_mois: num(form.duree_max_mois),
        mode_amortissement: choisi.type === 'credit' ? form.mode_amortissement : null,
        age_min: num(form.age_min), age_max: num(form.age_max),
        anciennete_activite_min_mois: num(form.anciennete_activite_min_mois), quotite_cessible_max_pct: num(form.quotite_cessible_max_pct),
      });
      toast.success('Nouveau paramétrage enregistré');
      await chargerVersions(choisi.id);
    } catch (e) { toast.error(message(e, 'Enregistrement impossible')); }
    finally { setOccupe(false); }
  };

  const champ = (label: string, cle: keyof typeof FORM_VIDE, type = 'number') => (
    <div className="space-y-1.5" key={cle}>
      <Label>{label}</Label>
      <Input type={type} min={type === 'number' ? 0 : undefined} step="any" value={form[cle]} onChange={(e) => setForm({ ...form, [cle]: e.target.value })} />
    </div>
  );

  if (chargement) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Chargement…</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Paramétrage financier</h1>
        <p className="text-sm text-muted-foreground">Taux, frais, pénalités et conditions d'éligibilité. Chaque modification crée une nouvelle version datée : les crédits déjà accordés gardent leurs conditions d'origine.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Produits</CardTitle></CardHeader>
          <CardContent className="p-2 max-h-[70vh] overflow-y-auto">
            {produits.map((p) => (
              <button key={p.id} onClick={() => setChoisi(p)}
                className={cn('w-full flex items-center justify-between rounded-md px-3 py-2 text-sm text-left hover:bg-muted', choisi?.id === p.id && 'bg-brand-50 font-medium')}>
                <span>{p.nom}</span>
                <Badge variant={p.type === 'credit' ? 'info' : p.type === 'epargne' ? 'success' : 'outline'}>{p.type ?? 'autre'}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {!choisi ? <p className="text-sm text-muted-foreground py-8 text-center">Sélectionnez un produit.</p> : (
            <>
              <Card>
                <CardHeader><CardTitle className="text-base">{choisi.nom}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">Nature du produit :</span>
                    <select disabled={!peutConfigurer} className="h-9 rounded-md border bg-background px-2" value={choisi.type ?? 'autre'} onChange={(e) => definirType(e.target.value as 'epargne' | 'credit' | 'autre')}>
                      <option value="credit">Crédit</option><option value="epargne">Épargne</option><option value="autre">Autre</option>
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground">Seuls les produits de nature « Crédit » peuvent faire l'objet d'une demande de crédit.</p>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Historique des versions</p>
                    {versions.length === 0 && <p className="text-sm text-muted-foreground">Aucun paramétrage.</p>}
                    {versions.map((v) => (
                      <div key={v.id} className="rounded-md border p-2 text-xs grid sm:grid-cols-4 gap-1">
                        <span className="font-medium">Depuis le {formatDate(v.dateEffet)}{v.dateFin ? ` jusqu'au ${formatDate(v.dateFin)}` : ''}</span>
                        {v.tauxInteretAnnuel && <span>Taux {v.tauxInteretAnnuel} %</span>}
                        {v.tauxPenaliteRetard && <span>Pénalité {v.tauxPenaliteRetard} %</span>}
                        {(v.montantMin || v.montantMax) && <span>{v.montantMin ?? 0} à {v.montantMax ?? '∞'}</span>}
                        {(v.dureeMinMois || v.dureeMaxMois) && <span>{v.dureeMinMois ?? 0} à {v.dureeMaxMois ?? '∞'} mois</span>}
                        {!v.dateFin && <Badge variant="success" className="w-fit">En vigueur</Badge>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {peutConfigurer ? (
                <Card>
                  <CardHeader><CardTitle className="text-base">Nouvelle version</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-3 gap-3">
                      {champ("Date d'effet", 'date_effet', 'date')}
                      {choisi.type === 'credit' && champ("Taux d'intérêt annuel (%)", 'taux_interet_annuel')}
                      {choisi.type === 'credit' && champ('Pénalité de retard (%)', 'taux_penalite_retard')}
                      {choisi.type === 'epargne' && champ("Rémunération de l'épargne (%)", 'taux_remuneration_epargne')}
                      {champ('Frais de dossier fixes', 'frais_dossier')}
                      {champ('Frais de dossier (% du montant)', 'frais_dossier_pct')}
                      {champ('Commission', 'commission')}
                      {champ('Montant minimum', 'montant_min')}
                      {champ('Montant maximum', 'montant_max')}
                      {champ('Durée minimum (mois)', 'duree_min_mois')}
                      {champ('Durée maximum (mois)', 'duree_max_mois')}
                    </div>
                    {choisi.type === 'credit' && (
                      <div className="grid sm:grid-cols-3 gap-3">
                        <div className="space-y-1.5"><Label>Mode d'amortissement</Label>
                          <select className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={form.mode_amortissement} onChange={(e) => setForm({ ...form, mode_amortissement: e.target.value })}>
                            <option value="constant">Annuités constantes</option><option value="degressif">Capital constant (dégressif)</option><option value="in_fine">In fine</option>
                          </select></div>
                        {champ('Âge minimum', 'age_min')}
                        {champ('Âge maximum', 'age_max')}
                        {champ("Ancienneté d'activité minimum (mois)", 'anciennete_activite_min_mois')}
                        {champ('Quotité maximale de la capacité (%)', 'quotite_cessible_max_pct')}
                      </div>
                    )}
                    <Button variant="brand" disabled={occupe} onClick={enregistrer}>{occupe && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Enregistrer la nouvelle version</Button>
                  </CardContent>
                </Card>
              ) : <p className="text-sm text-muted-foreground">Vous pouvez consulter le paramétrage mais pas le modifier.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
