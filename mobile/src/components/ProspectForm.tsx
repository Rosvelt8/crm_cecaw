import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Button, Card, ErrorNote, Field, SectionTitle } from './ui';
import { DateField, FieldGroup, SelectField } from './FormFields';
import { getCurrentPosition } from '../tracking';
import type { ProspectPayload } from '../api/prospects';
import type { Genre, Produit, Prospect, SituationFamiliale, TypePersonne } from '../types';
import { colors, fonts, spacing } from '../theme';

/** Etat local du formulaire : tout en chaines, converti a l'envoi. */
export interface ProspectFormState {
  typePersonne: TypePersonne;
  nom: string;
  prenom: string;
  genre: Genre;
  dateNaissance: string;
  lieuNaissance: string;
  nationalite: string;
  numeroCni: string;
  nui: string;
  sigle: string;
  formeJuridique: string;
  rccm: string;
  capitalSocial: string;
  telephone: string;
  telephoneSecondaire: string;
  email: string;
  adresse: string;
  quartier: string;
  ville: string;
  profession: string;
  employeur: string;
  secteurActivite: string;
  revenuMensuel: string;
  situationFamiliale: SituationFamiliale;
  nombreEnfants: string;
  referentNom: string;
  referentTelephone: string;
  referentRelation: string;
  produitInteretId: string;
  notes: string;
}

export const EMPTY_PROSPECT: ProspectFormState = {
  typePersonne: 'physique',
  nom: '', prenom: '', genre: '', dateNaissance: '', lieuNaissance: '',
  nationalite: 'Camerounaise', numeroCni: '', nui: '',
  sigle: '', formeJuridique: '', rccm: '', capitalSocial: '',
  telephone: '', telephoneSecondaire: '', email: '',
  adresse: '', quartier: '', ville: '',
  profession: '', employeur: '', secteurActivite: '', revenuMensuel: '',
  situationFamiliale: '', nombreEnfants: '0',
  referentNom: '', referentTelephone: '', referentRelation: '',
  produitInteretId: '', notes: '',
};

/** Prepare l'etat du formulaire a partir d'une fiche existante. */
export function prospectToForm(p: Prospect): ProspectFormState {
  const date = (v: string | null) => (v ? String(v).slice(0, 10) : '');
  return {
    typePersonne: p.typePersonne ?? 'physique',
    nom: p.nom ?? '',
    prenom: p.prenom ?? '',
    genre: (p.genre ?? '') as Genre,
    dateNaissance: date(p.dateNaissance),
    lieuNaissance: p.lieuNaissance ?? '',
    nationalite: p.nationalite ?? '',
    numeroCni: p.numeroCni ?? '',
    nui: p.nui ?? '',
    sigle: p.sigle ?? '',
    formeJuridique: p.formeJuridique ?? '',
    rccm: p.rccm ?? '',
    capitalSocial: p.capitalSocial ?? '',
    telephone: p.telephone ?? '',
    telephoneSecondaire: p.telephoneSecondaire ?? '',
    email: p.email ?? '',
    adresse: p.adresse ?? '',
    quartier: p.quartier ?? '',
    ville: p.ville ?? '',
    profession: p.profession ?? '',
    employeur: p.employeur ?? '',
    secteurActivite: p.secteurActivite ?? '',
    revenuMensuel: p.revenuMensuel ?? '',
    situationFamiliale: (p.situationFamiliale ?? '') as SituationFamiliale,
    nombreEnfants: String(p.nombreEnfants ?? 0),
    referentNom: p.referentNom ?? '',
    referentTelephone: p.referentTelephone ?? '',
    referentRelation: p.referentRelation ?? '',
    produitInteretId: p.produitInteretId ? String(p.produitInteretId) : '',
    notes: p.notes ?? '',
  };
}

const GENRES = [
  { value: 'M' as const, label: 'Masculin' },
  { value: 'F' as const, label: 'Féminin' },
];

const SITUATIONS = [
  { value: 'celibataire' as const, label: 'Célibataire' },
  { value: 'marie' as const, label: 'Marié(e)' },
  { value: 'divorce' as const, label: 'Divorcé(e)' },
  { value: 'veuf' as const, label: 'Veuf / Veuve' },
];

const TYPES = [
  { value: 'physique' as const, label: 'Personne physique', description: 'Un particulier' },
  { value: 'morale' as const, label: 'Personne morale', description: 'Une entreprise, une association' },
];

/**
 * Regles de validation reprises du back-office, y compris les deux exigences
 * conditionnelles : prenom pour une personne physique, forme juridique pour
 * une personne morale.
 */
export function validateProspect(f: ProspectFormState): Record<string, string> {
  const e: Record<string, string> = {};
  const morale = f.typePersonne === 'morale';

  if (!f.nom.trim()) e.nom = morale ? 'Raison sociale requise' : 'Nom requis';
  else if (f.nom.trim().length > 100) e.nom = 'Maximum 100 caractères';

  if (!morale && !f.prenom.trim()) e.prenom = 'Prénom requis pour une personne physique';
  if (morale && !f.formeJuridique.trim()) e.formeJuridique = 'Forme juridique requise';

  const tel = f.telephone.trim();
  if (tel.length < 8) e.telephone = 'Numéro de téléphone invalide';
  else if (tel.length > 30) e.telephone = 'Maximum 30 caractères';

  if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) {
    e.email = 'Adresse email invalide';
  }

  const enfants = Number(f.nombreEnfants || 0);
  if (!Number.isInteger(enfants) || enfants < 0) e.nombreEnfants = 'Doit être positif';
  else if (enfants > 30) e.nombreEnfants = 'Valeur trop élevée';

  return e;
}

/** Convertit l'etat du formulaire en charge snake_case pour l'API. */
export function formToPayload(
  f: ProspectFormState,
  position?: { latitude: number; longitude: number },
): ProspectPayload {
  const t = (v: string) => (v.trim() ? v.trim() : undefined);
  const morale = f.typePersonne === 'morale';

  return {
    type_personne: f.typePersonne,
    nom: f.nom.trim(),
    // Les champs propres a l'autre type de personne ne sont pas transmis :
    // ils n'auraient aucun sens sur la fiche et brouilleraient le back-office.
    prenom: morale ? undefined : t(f.prenom),
    genre: morale ? undefined : (f.genre || undefined),
    date_naissance: morale ? undefined : t(f.dateNaissance),
    lieu_naissance: morale ? undefined : t(f.lieuNaissance),
    nationalite: t(f.nationalite),
    numero_cni: morale ? undefined : t(f.numeroCni),
    nui: t(f.nui),
    sigle: morale ? t(f.sigle) : undefined,
    forme_juridique: morale ? t(f.formeJuridique) : undefined,
    rccm: morale ? t(f.rccm) : undefined,
    capital_social: morale ? t(f.capitalSocial) : undefined,
    telephone: f.telephone.trim(),
    telephone_secondaire: t(f.telephoneSecondaire),
    email: t(f.email),
    adresse: t(f.adresse),
    quartier: t(f.quartier),
    ville: t(f.ville),
    profession: morale ? undefined : t(f.profession),
    employeur: morale ? undefined : t(f.employeur),
    secteur_activite: t(f.secteurActivite),
    revenu_mensuel: t(f.revenuMensuel),
    situation_familiale: morale ? undefined : (f.situationFamiliale || undefined),
    nombre_enfants: morale ? undefined : Number(f.nombreEnfants || 0),
    referent_nom: t(f.referentNom),
    referent_telephone: t(f.referentTelephone),
    referent_relation: t(f.referentRelation),
    produit_interet_id: f.produitInteretId ? Number(f.produitInteretId) : null,
    notes: t(f.notes),
    ...(position ?? {}),
  };
}

export function ProspectForm({
  value,
  onChange,
  produits,
  errors,
  submitLabel,
  submitting,
  onSubmit,
  error,
  showPosition = false,
}: {
  value: ProspectFormState;
  onChange: (next: ProspectFormState) => void;
  produits: Produit[];
  errors: Record<string, string>;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (position?: { latitude: number; longitude: number }) => void;
  error?: string | null;
  /** Propose de joindre la position GPS, uniquement a la creation. */
  showPosition?: boolean;
}) {
  const [attachPosition, setAttachPosition] = useState(showPosition);
  const [locating, setLocating] = useState(false);
  const morale = value.typePersonne === 'morale';
  const set = (patch: Partial<ProspectFormState>) => onChange({ ...value, ...patch });

  const produitOptions = useMemo(
    () => produits.map((p) => ({ value: String(p.id), label: p.nom })),
    [produits],
  );

  const submit = async () => {
    if (!showPosition || !attachPosition) {
      onSubmit();
      return;
    }
    setLocating(true);
    const pos = await getCurrentPosition();
    setLocating(false);
    onSubmit(
      pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : undefined,
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <ErrorNote message={error} /> : null}

        <Card>
          <SectionTitle>Type de prospect</SectionTitle>
          <SelectField
            label="Nature"
            value={value.typePersonne}
            options={TYPES}
            onChange={(v) => set({ typePersonne: (v || 'physique') as TypePersonne })}
            required
          />
        </Card>

        <Card>
          <SectionTitle>{morale ? "Identité de l'entreprise" : 'Identité'}</SectionTitle>

          <Field
            label={morale ? 'Raison sociale *' : 'Nom *'}
            value={value.nom}
            onChangeText={(v) => set({ nom: v })}
            error={errors.nom}
            placeholder={morale ? 'CECAW SARL' : 'NKOMO'}
          />

          {morale ? (
            <>
              <Field
                label="Sigle"
                value={value.sigle}
                onChangeText={(v) => set({ sigle: v })}
                placeholder="CSA"
              />
              <Field
                label="Forme juridique *"
                value={value.formeJuridique}
                onChangeText={(v) => set({ formeJuridique: v })}
                error={errors.formeJuridique}
                placeholder="SARL, SA, GIC..."
              />
              <Field
                label="N° RCCM"
                value={value.rccm}
                onChangeText={(v) => set({ rccm: v })}
                mono
              />
              <Field
                label="Capital social (FCFA)"
                value={value.capitalSocial}
                onChangeText={(v) => set({ capitalSocial: v })}
                keyboardType="number-pad"
                mono
              />
            </>
          ) : (
            <>
              <Field
                label="Prénom *"
                value={value.prenom}
                onChangeText={(v) => set({ prenom: v })}
                error={errors.prenom}
                placeholder="Marie"
              />
              <SelectField
                label="Genre"
                value={value.genre}
                options={GENRES}
                onChange={(v) => set({ genre: v as Genre })}
                clearable
                placeholder="Non renseigné"
              />
              <DateField
                label="Date de naissance"
                value={value.dateNaissance}
                onChange={(v) => set({ dateNaissance: v })}
              />
              <Field
                label="Lieu de naissance"
                value={value.lieuNaissance}
                onChangeText={(v) => set({ lieuNaissance: v })}
              />
              <Field
                label="N° Carte Nationale d'Identité"
                value={value.numeroCni}
                onChangeText={(v) => set({ numeroCni: v })}
                mono
              />
            </>
          )}

          <Field
            label="Nationalité"
            value={value.nationalite}
            onChangeText={(v) => set({ nationalite: v })}
          />
          <Field
            label="NUI (Identifiant Unique)"
            value={value.nui}
            onChangeText={(v) => set({ nui: v })}
            mono
          />
        </Card>

        <Card>
          <SectionTitle>Contact</SectionTitle>
          <Field
            label="Téléphone principal *"
            value={value.telephone}
            onChangeText={(v) => set({ telephone: v })}
            error={errors.telephone}
            keyboardType="phone-pad"
            placeholder="6XX XX XX XX"
            mono
          />
          <Field
            label="Téléphone secondaire"
            value={value.telephoneSecondaire}
            onChangeText={(v) => set({ telephoneSecondaire: v })}
            keyboardType="phone-pad"
            mono
          />
          <Field
            label="Adresse email"
            value={value.email}
            onChangeText={(v) => set({ email: v })}
            error={errors.email}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Field label="Adresse" value={value.adresse} onChangeText={(v) => set({ adresse: v })} />
          <Field label="Quartier" value={value.quartier} onChangeText={(v) => set({ quartier: v })} />
          <Field label="Ville" value={value.ville} onChangeText={(v) => set({ ville: v })} />
        </Card>

        <Card>
          <SectionTitle>{morale ? 'Activité' : 'Activité et situation'}</SectionTitle>
          {!morale ? (
            <>
              <Field
                label="Profession"
                value={value.profession}
                onChangeText={(v) => set({ profession: v })}
              />
              <Field
                label="Employeur / Entreprise"
                value={value.employeur}
                onChangeText={(v) => set({ employeur: v })}
              />
            </>
          ) : null}
          <Field
            label="Secteur d'activité"
            value={value.secteurActivite}
            onChangeText={(v) => set({ secteurActivite: v })}
          />
          <Field
            label="Revenu mensuel (FCFA)"
            value={value.revenuMensuel}
            onChangeText={(v) => set({ revenuMensuel: v })}
            keyboardType="number-pad"
            mono
          />
          {!morale ? (
            <>
              <SelectField
                label="Situation matrimoniale"
                value={value.situationFamiliale}
                options={SITUATIONS}
                onChange={(v) => set({ situationFamiliale: v as SituationFamiliale })}
                clearable
                placeholder="Non renseignée"
              />
              <Field
                label="Nombre d'enfants"
                value={value.nombreEnfants}
                onChangeText={(v) => set({ nombreEnfants: v.replace(/[^0-9]/g, '') })}
                error={errors.nombreEnfants}
                keyboardType="number-pad"
                mono
              />
            </>
          ) : null}
        </Card>

        <Card>
          <SectionTitle>Personne à contacter</SectionTitle>
          <FieldGroup title="Référent">
            <Field
              label="Nom du référent"
              value={value.referentNom}
              onChangeText={(v) => set({ referentNom: v })}
            />
            <Field
              label="Téléphone"
              value={value.referentTelephone}
              onChangeText={(v) => set({ referentTelephone: v })}
              keyboardType="phone-pad"
              mono
            />
            <Field
              label="Lien / relation"
              value={value.referentRelation}
              onChangeText={(v) => set({ referentRelation: v })}
              placeholder="Conjoint, associé, voisin..."
            />
          </FieldGroup>
        </Card>

        <Card>
          <SectionTitle>Suivi commercial</SectionTitle>
          <SelectField
            label="Produit d'intérêt"
            value={value.produitInteretId}
            options={produitOptions}
            onChange={(v) => set({ produitInteretId: String(v ?? '') })}
            clearable
            placeholder="Aucun produit"
          />
          <Field
            label="Observations / Notes"
            value={value.notes}
            onChangeText={(v) => set({ notes: v })}
            multiline
            numberOfLines={4}
            style={styles.notes}
          />
        </Card>

        {showPosition ? (
          <Card>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <View style={styles.posTitle}>
                  <Feather name="map-pin" size={14} color={colors.brand} />
                  <Text style={styles.label}>Enregistrer le lieu de contact</Text>
                </View>
                <Text style={styles.muted}>
                  La position GPS actuelle sera jointe à la fiche du prospect.
                </Text>
              </View>
              <Switch
                value={attachPosition}
                onValueChange={setAttachPosition}
                thumbColor={attachPosition ? colors.brand : '#f4f4f5'}
                trackColor={{ true: colors.brandSoft, false: colors.border }}
              />
            </View>
          </Card>
        ) : null}

        <Button
          title={submitLabel}
          onPress={submit}
          loading={submitting || locating}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  notes: { height: 96, textAlignVertical: 'top', paddingTop: spacing.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  posTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, lineHeight: 17 },
});
