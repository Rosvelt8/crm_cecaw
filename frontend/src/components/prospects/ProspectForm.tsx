'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { produitService } from '@/services/produitService';
import { userService } from '@/services/userService';
import type { StatutProspect, GenreProspect, SituationFamiliale } from '@/lib/storage/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LocationPicker } from '@/components/ui/location-picker';
import { AttachmentsInput, type PieceJointe } from '@/components/ui/attachments-input';

const STATUT_OPTIONS: { value: StatutProspect; label: string }[] = [
  { value: 'nouveau',   label: 'Nouveau' },
  { value: 'contacte',  label: 'Contacté' },
  { value: 'interesse', label: 'Intéressé' },
  { value: 'negocie',   label: 'Négocié' },
  { value: 'converti',  label: 'Converti' },
  { value: 'perdu',     label: 'Perdu' },
];

const VILLES_CAMEROUN = ['Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 'Maroua', 'Bamenda', 'Ngaoundéré', 'Bertoua', 'Kribi', 'Limbe'];

const SECTEURS = ['Agriculture', 'Commerce', 'Artisanat', 'Éducation', 'Santé', 'Transport', 'BTP', 'Administration', 'Industrie', 'Autre'];

const REVENUS = ['< 50 000 FCFA', '50 000 – 100 000 FCFA', '100 000 – 200 000 FCFA', '200 000 – 500 000 FCFA', '> 500 000 FCFA'];

export type ProspectFormData = {
  // Identité
  prenom: string;
  nom: string;
  genre: GenreProspect;
  dateNaissance: string;
  lieuNaissance: string;
  nationalite: string;
  numeroCNI: string;
  // Contact
  telephone: string;
  telephoneSecondaire: string;
  email: string;
  // Adresse
  adresse: string;
  quartier: string;
  ville: string;
  // Situation pro
  profession: string;
  employeur: string;
  secteurActivite: string;
  revenuMensuel: string;
  // Situation familiale
  situationFamiliale: SituationFamiliale;
  nombreEnfants: number;
  // Référent
  referentNom: string;
  referentTelephone: string;
  referentRelation: string;
  // CRM
  statut: StatutProspect;
  produitInteretId: string;
  commercialId: string;
  notes: string;
  // Localisation
  latitude: number | null;
  longitude: number | null;
  // Pièces jointes
  piecesJointes: PieceJointe[];
};

export const EMPTY_FORM: ProspectFormData = {
  prenom: '', nom: '', genre: '', dateNaissance: '', lieuNaissance: '', nationalite: 'Camerounaise', numeroCNI: '',
  telephone: '', telephoneSecondaire: '', email: '',
  adresse: '', quartier: '', ville: '',
  profession: '', employeur: '', secteurActivite: '', revenuMensuel: '',
  situationFamiliale: '', nombreEnfants: 0,
  referentNom: '', referentTelephone: '', referentRelation: '',
  statut: 'nouveau', produitInteretId: '', commercialId: '', notes: '',
  latitude: null, longitude: null,
  piecesJointes: [],
};

function Section({ title, accent, children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <div className={cn('px-4 py-3 border-b', accent ?? 'bg-muted/30')}>
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/70">{title}</h3>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children, full }: { label: string; required?: boolean; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn('space-y-1.5', full && 'sm:col-span-2 lg:col-span-3')}>
      <Label className="text-[13px] font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
    </div>
  );
}

interface Props {
  title: string;
  defaultValues?: Partial<ProspectFormData>;
  onSubmit: (data: ProspectFormData) => void;
  isSubmitting?: boolean;
  lockedCommercialId?: string; // agent mode: lock commercial to self
}

export default function ProspectForm({ title, defaultValues, onSubmit, isSubmitting, lockedCommercialId }: Props) {
  const router = useRouter();
  const [produits, setProduits] = React.useState<any[]>([]);
  const [commerciaux, setCommerciaux] = React.useState<any[]>([]);

  React.useEffect(() => {
    produitService.getProduits().then((r) => setProduits(r.data ?? [])).catch(() => {});
    userService.getUsers({ per_page: 200 }).then((r) => {
      setCommerciaux((r.data ?? []).filter((u: any) => {
        const slug = typeof u.role === 'string' ? u.role : u.role?.slug ?? '';
        return slug === 'agent' || slug === 'manager';
      }));
    }).catch(() => {});
  }, []);

  const [form, setForm] = React.useState<ProspectFormData>({ ...EMPTY_FORM, ...defaultValues });
  const set = (patch: Partial<ProspectFormData>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Sticky header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Fiche KYC complète du prospect.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row">
          <Button variant="outline" type="button" onClick={() => router.back()}>Annuler</Button>
          <Button variant="brand" type="submit" form="prospect-form" disabled={isSubmitting}>
            <Save className="mr-2 h-4 w-4" /> Enregistrer
          </Button>
        </div>
      </div>

      <form id="prospect-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* ── Identité ── */}
        <Section title="Identité" accent="bg-brand-50 border-brand-100">
          <Field label="Prénom" required>
            <Input value={form.prenom} onChange={(e) => set({ prenom: e.target.value })} placeholder="Jean" required />
          </Field>
          <Field label="Nom" required>
            <Input value={form.nom} onChange={(e) => set({ nom: e.target.value })} placeholder="MVONDO" required />
          </Field>
          <Field label="Genre">
            <Select value={form.genre || '__none__'} onValueChange={(v) => set({ genre: v === '__none__' ? '' : v as GenreProspect })}>
              <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                <SelectItem value="M">Masculin</SelectItem>
                <SelectItem value="F">Féminin</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date de naissance">
            <Input type="date" value={form.dateNaissance} onChange={(e) => set({ dateNaissance: e.target.value })} />
          </Field>
          <Field label="Lieu de naissance">
            <Input value={form.lieuNaissance} onChange={(e) => set({ lieuNaissance: e.target.value })} placeholder="Douala" />
          </Field>
          <Field label="Nationalité">
            <Input value={form.nationalite} onChange={(e) => set({ nationalite: e.target.value })} placeholder="Camerounaise" />
          </Field>
          <Field label="N° Carte Nationale d'Identité">
            <Input value={form.numeroCNI} onChange={(e) => set({ numeroCNI: e.target.value })} placeholder="Ex: 123456789" />
          </Field>
        </Section>

        {/* ── Contact ── */}
        <Section title="Contact" accent="bg-blue-50 border-blue-100">
          <Field label="Téléphone principal" required>
            <Input value={form.telephone} onChange={(e) => set({ telephone: e.target.value })} placeholder="6xx xxx xxx" required />
          </Field>
          <Field label="Téléphone secondaire">
            <Input value={form.telephoneSecondaire} onChange={(e) => set({ telephoneSecondaire: e.target.value })} placeholder="6xx xxx xxx" />
          </Field>
          <Field label="Adresse email">
            <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="exemple@mail.com" />
          </Field>
        </Section>

        {/* ── Adresse ── */}
        <Section title="Adresse de résidence" accent="bg-emerald-50 border-emerald-100">
          <Field label="Adresse">
            <Input value={form.adresse} onChange={(e) => set({ adresse: e.target.value })} placeholder="Rue, numéro…" />
          </Field>
          <Field label="Quartier">
            <Input value={form.quartier} onChange={(e) => set({ quartier: e.target.value })} placeholder="Bonanjo, Akwa…" />
          </Field>
          <Field label="Ville">
            <Select value={form.ville || '__none__'} onValueChange={(v) => set({ ville: v === '__none__' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Choisir une ville" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {VILLES_CAMEROUN.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </Section>

        {/* ── Situation professionnelle ── */}
        <Section title="Situation professionnelle" accent="bg-amber-50 border-amber-100">
          <Field label="Profession">
            <Input value={form.profession} onChange={(e) => set({ profession: e.target.value })} placeholder="Commerçant, Agriculteur…" />
          </Field>
          <Field label="Employeur / Entreprise">
            <Input value={form.employeur} onChange={(e) => set({ employeur: e.target.value })} placeholder="Nom de l'entreprise" />
          </Field>
          <Field label="Secteur d'activité">
            <Select value={form.secteurActivite || '__none__'} onValueChange={(v) => set({ secteurActivite: v === '__none__' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {SECTEURS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Revenu mensuel estimé">
            <Select value={form.revenuMensuel || '__none__'} onValueChange={(v) => set({ revenuMensuel: v === '__none__' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Tranche de revenu" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {REVENUS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </Section>

        {/* ── Situation familiale ── */}
        <Section title="Situation familiale" accent="bg-violet-50 border-violet-100">
          <Field label="Situation matrimoniale">
            <Select value={form.situationFamiliale || '__none__'} onValueChange={(v) => set({ situationFamiliale: v === '__none__' ? '' : v as SituationFamiliale })}>
              <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                <SelectItem value="celibataire">Célibataire</SelectItem>
                <SelectItem value="marie">Marié(e)</SelectItem>
                <SelectItem value="divorce">Divorcé(e)</SelectItem>
                <SelectItem value="veuf">Veuf / Veuve</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Nombre d'enfants">
            <Input type="number" min="0" max="20" value={form.nombreEnfants} onChange={(e) => set({ nombreEnfants: parseInt(e.target.value) || 0 })} />
          </Field>
        </Section>

        {/* ── Référent / garant ── */}
        <Section title="Personne de référence / Garant" accent="bg-slate-50 border-slate-100">
          <Field label="Nom complet du référent">
            <Input value={form.referentNom} onChange={(e) => set({ referentNom: e.target.value })} placeholder="Prénom NOM" />
          </Field>
          <Field label="Téléphone du référent">
            <Input value={form.referentTelephone} onChange={(e) => set({ referentTelephone: e.target.value })} placeholder="6xx xxx xxx" />
          </Field>
          <Field label="Relation">
            <Input value={form.referentRelation} onChange={(e) => set({ referentRelation: e.target.value })} placeholder="Époux/se, Parent, Collègue…" />
          </Field>
        </Section>

        {/* ── CRM ── */}
        <Section title="Suivi commercial" accent="bg-brand-50 border-brand-100">
          <Field label="Statut">
            <Select value={form.statut} onValueChange={(v) => set({ statut: v as StatutProspect })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUT_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Produit d'intérêt">
            <Select value={form.produitInteretId || '__none__'} onValueChange={(v) => set({ produitInteretId: v === '__none__' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Aucun</SelectItem>
                {produits.filter((p) => p.actif).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Commercial assigné">
            {lockedCommercialId ? (
              <div className="h-10 px-3 flex items-center rounded-lg border bg-muted text-sm text-muted-foreground">
                {(() => {
                  const c = commerciaux.find((u) => String(u.id) === lockedCommercialId);
                  return c ? `${c.prenom} ${c.nom}` : lockedCommercialId;
                })()}
              </div>
            ) : (
              <Select value={form.commercialId || '__none__'} onValueChange={(v) => set({ commercialId: v === '__none__' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Non assigné</SelectItem>
                  {commerciaux.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.prenom} {u.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Observations / Notes" full>
            <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Historique des échanges, besoins spécifiques, conditions particulières…" rows={4} />
          </Field>
        </Section>

        {/* ── Localisation GPS ── */}
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b bg-teal-50 border-teal-100">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/70">Localisation GPS <span className="normal-case font-normal text-muted-foreground">(optionnel)</span></h3>
          </div>
          <div className="p-4">
            <LocationPicker
              value={form.latitude != null && form.longitude != null ? { lat: form.latitude, lng: form.longitude } : null}
              onChange={(coords) => set({ latitude: coords?.lat ?? null, longitude: coords?.lng ?? null })}
            />
          </div>
        </div>

        {/* ── Pièces jointes ── */}
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50 border-slate-100">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground/70">Pièces jointes <span className="normal-case font-normal text-muted-foreground">(optionnel)</span></h3>
          </div>
          <div className="p-4">
            <AttachmentsInput
              value={form.piecesJointes}
              onChange={(pj) => set({ piecesJointes: pj })}
            />
          </div>
        </div>

        {/* Bottom save */}
        <div className="flex justify-end gap-2 pb-4">
          <Button variant="outline" type="button" onClick={() => router.back()}>Annuler</Button>
          <Button variant="brand" type="submit" disabled={isSubmitting}>
            <Save className="mr-2 h-4 w-4" /> Enregistrer le prospect
          </Button>
        </div>
      </form>
    </div>
  );
}
