import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, ErrorNote, Field } from '../../src/components/ui';
import { createProspect } from '../../src/api/prospects';
import { errorMessage } from '../../src/api/client';
import { getCurrentPosition } from '../../src/tracking';
import { colors, spacing } from '../../src/theme';

interface FormState {
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  ville: string;
  quartier: string;
  profession: string;
  notes: string;
}

const EMPTY: FormState = {
  nom: '',
  prenom: '',
  telephone: '',
  email: '',
  ville: '',
  quartier: '',
  profession: '',
  notes: '',
};

export default function NouveauProspectScreen() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [attachPosition, setAttachPosition] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.nom.trim()) next.nom = 'Le nom est obligatoire.';
    if (!form.telephone.trim()) next.telephone = 'Le téléphone est obligatoire.';
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      next.email = 'Adresse email invalide.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    setError(null);

    // Relevé du point de contact : utile au superviseur pour situer la prospection.
    let latitude: number | undefined;
    let longitude: number | undefined;
    if (attachPosition) {
      const position = await getCurrentPosition();
      if (position) {
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      }
    }

    try {
      await createProspect({
        type_personne: 'physique',
        nom: form.nom.trim(),
        prenom: form.prenom.trim() || undefined,
        telephone: form.telephone.trim(),
        email: form.email.trim() || undefined,
        ville: form.ville.trim() || undefined,
        quartier: form.quartier.trim() || undefined,
        profession: form.profession.trim() || undefined,
        notes: form.notes.trim() || undefined,
        latitude,
        longitude,
      });
      router.back();
    } catch (e) {
      setError(errorMessage(e, 'Le prospect n a pas pu être enregistré.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <ErrorNote message={error} /> : null}

        <Card>
          <Field
            label="Nom *"
            value={form.nom}
            onChangeText={(v) => set({ nom: v })}
            error={errors.nom}
            placeholder="NKOMO"
          />
          <Field
            label="Prénom"
            value={form.prenom}
            onChangeText={(v) => set({ prenom: v })}
            placeholder="Marie"
          />
          <Field
            label="Téléphone *"
            value={form.telephone}
            onChangeText={(v) => set({ telephone: v })}
            error={errors.telephone}
            keyboardType="phone-pad"
            placeholder="6XX XX XX XX"
          />
          <Field
            label="Email"
            value={form.email}
            onChangeText={(v) => set({ email: v })}
            error={errors.email}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </Card>

        <Card>
          <Field label="Ville" value={form.ville} onChangeText={(v) => set({ ville: v })} />
          <Field
            label="Quartier"
            value={form.quartier}
            onChangeText={(v) => set({ quartier: v })}
          />
          <Field
            label="Profession"
            value={form.profession}
            onChangeText={(v) => set({ profession: v })}
          />
          <Field
            label="Notes"
            value={form.notes}
            onChangeText={(v) => set({ notes: v })}
            multiline
            numberOfLines={3}
            style={styles.notes}
          />
        </Card>

        <Card>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Enregistrer le lieu de contact</Text>
              <Text style={styles.muted}>
                La position GPS actuelle sera jointe à la fiche du prospect.
              </Text>
            </View>
            <Switch
              value={attachPosition}
              onValueChange={setAttachPosition}
              trackColor={{ true: colors.brand, false: colors.border }}
            />
          </View>
        </Card>

        <Button title="Enregistrer le prospect" onPress={submit} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  notes: { height: 88, textAlignVertical: 'top', paddingTop: spacing.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  muted: { color: colors.muted, fontSize: 12 },
});
