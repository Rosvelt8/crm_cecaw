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
import { Button, ErrorNote, Field } from '../src/components/ui';
import { useSession } from '../src/store/session';
import { colors, spacing } from '../src/theme';

export default function LoginScreen() {
  const signIn = useSession((s) => s.signIn);
  const error = useSession((s) => s.error);
  const clearError = useSession((s) => s.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setSubmitting(true);
    await signIn(email, password);
    setSubmitting(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.brand}>Cecaw Terrain</Text>
            <Text style={styles.subtitle}>Application reservee aux agents de collecte</Text>
          </View>

          {error ? <ErrorNote message={error} /> : null}

          <Field
            label="Adresse email"
            value={email}
            onChangeText={(v) => {
              clearError();
              setEmail(v);
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="agent@cecaw.cm"
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
            disabled={!email.trim() || !password}
          />

          <Text style={styles.legal}>
            Un code PIN vous sera demande juste apres, afin de proteger vos donnees en cas de perte
            ou de vol du telephone.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: spacing.lg, gap: spacing.xs },
  brand: { fontSize: 26, fontWeight: '800', color: colors.brand },
  subtitle: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  legal: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: spacing.sm },
});
