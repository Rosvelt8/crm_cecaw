import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorNote, Field, Logo } from '../src/components/ui';
import { useSession } from '../src/store/session';
import { colors, fonts, radius, shadow, spacing } from '../src/theme';

export default function LoginScreen() {
  const signIn = useSession((s) => s.signIn);
  const error = useSession((s) => s.error);
  const clearError = useSession((s) => s.clearError);

  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!identifiant.trim() || !password) return;
    setSubmitting(true);
    await signIn(identifiant, password);
    setSubmitting(false);
  };

  return (
    <View style={styles.root}>
      {/* Banniere de marque, echo du panneau lateral de l'ecran de connexion web. */}
      <View style={styles.banner}>
        <SafeAreaView edges={['top']}>
          <View style={styles.bannerInner}>
            <View style={styles.mark}>
              <Logo size={46} />
            </View>
            <Text style={styles.brand}>CECAW FINANCE</Text>
            <Text style={styles.tagline}>Application de collecte terrain</Text>
          </View>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.sheet}>
            <Text style={styles.heading}>Connexion agent</Text>
            <Text style={styles.sub}>
              Réservée aux agents de collecte. Les autres profils passent par le back-office.
            </Text>

            {error ? <ErrorNote message={error} /> : null}

            <Field
              label="Matricule ou email"
              hint="Votre matricule d'agent suffit, par exemple AGT-004."
              value={identifiant}
              onChangeText={(v) => {
                clearError();
                setIdentifiant(v);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="AGT-004"
            />

            <Field
              label="Mot de passe"
              value={password}
              onChangeText={(v) => {
                clearError();
                setPassword(v);
              }}
              secureTextEntry
              placeholder="Votre mot de passe"
            />

            <Button
              title="Se connecter"
              onPress={submit}
              loading={submitting}
              disabled={!identifiant.trim() || !password}
            />

            <View style={styles.noteRow}>
              <View style={styles.noteDot} />
              <Text style={styles.note}>
                Un code PIN vous sera demandé juste après, pour protéger vos données en cas de
                perte ou de vol du téléphone.
              </Text>
            </View>
          </View>

          <Text style={styles.copyright}>© 2026 Cecaw Finance S.A. — Douala, Cameroun</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  banner: {
    backgroundColor: colors.brandDeep,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  bannerInner: { alignItems: 'center', paddingTop: spacing.lg, gap: spacing.xs },
  mark: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229,184,48,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  brand: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: 1.8,
    color: colors.onBrand,
  },
  tagline: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.brandAccent,
    letterSpacing: 0.4,
  },

  content: { padding: spacing.md, paddingBottom: spacing.xl },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: -spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.raised,
  },
  heading: { fontFamily: fonts.bold, fontSize: 20, color: colors.text },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
    marginTop: -spacing.xs,
  },

  noteRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  noteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand,
    marginTop: 6,
  },
  note: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },
  copyright: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.mutedLight,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
