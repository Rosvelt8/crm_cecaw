import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PinPad } from '../src/components/PinPad';
import { Button, ErrorNote } from '../src/components/ui';
import { useSession } from '../src/store/session';
import { DEFAULT_LOCK_DELAY_MIN, LOCK_DELAY_CHOICES, PIN_LENGTH } from '../src/config';
import { colors, radius, spacing } from '../src/theme';

type Step = 'choose' | 'confirm' | 'delay';

/** Codes trop devinables : ils annulent l'interet du verrouillage. */
function isWeak(pin: string): boolean {
  if (new Set(pin).size === 1) return true;
  const ascending = pin.split('').every((d, i, arr) => i === 0 || Number(d) === Number(arr[i - 1]) + 1);
  const descending = pin.split('').every((d, i, arr) => i === 0 || Number(d) === Number(arr[i - 1]) - 1);
  return ascending || descending;
}

export default function PinSetupScreen() {
  const configurePin = useSession((s) => s.configurePin);
  const signOut = useSession((s) => s.signOut);

  const [step, setStep] = useState<Step>('choose');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [delay, setDelay] = useState<number>(DEFAULT_LOCK_DELAY_MIN);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onChooseChange = (next: string) => {
    setError(null);
    setFirst(next);
    if (next.length === PIN_LENGTH) {
      if (isWeak(next)) {
        setError('Evitez un code trop simple (0000, 1234...).');
        setFirst('');
        return;
      }
      setStep('confirm');
    }
  };

  const onConfirmChange = (next: string) => {
    setError(null);
    setSecond(next);
    if (next.length === PIN_LENGTH) {
      if (next !== first) {
        setError('Les deux codes ne correspondent pas.');
        setFirst('');
        setSecond('');
        setStep('choose');
        return;
      }
      setStep('delay');
    }
  };

  const save = async () => {
    setSaving(true);
    await configurePin(first, delay);
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {step === 'choose' && 'Choisissez votre code'}
            {step === 'confirm' && 'Confirmez votre code'}
            {step === 'delay' && 'Delai de verrouillage'}
          </Text>
          <Text style={styles.subtitle}>
            {step === 'delay'
              ? "Passe ce delai sans activite, ou apres un retour d'arriere-plan, l'application se reverrouille."
              : `Ce code a ${PIN_LENGTH} chiffres protege vos donnees si le telephone est perdu ou vole.`}
          </Text>
        </View>

        {error ? <ErrorNote message={error} /> : null}

        {step === 'delay' ? (
          <View style={styles.choices}>
            {LOCK_DELAY_CHOICES.map((minutes) => (
              <Pressable
                key={minutes}
                onPress={() => setDelay(minutes)}
                style={[styles.choice, delay === minutes && styles.choiceActive]}
              >
                <Text style={[styles.choiceText, delay === minutes && styles.choiceTextActive]}>
                  {minutes} min
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <PinPad
            value={step === 'choose' ? first : second}
            onChange={step === 'choose' ? onChooseChange : onConfirmChange}
          />
        )}

        <View style={styles.actions}>
          {step === 'delay' ? (
            <Button title="Activer la protection" onPress={save} loading={saving} />
          ) : null}
          <Button title="Changer de compte" variant="ghost" onPress={signOut} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1, justifyContent: 'center' },
  header: { alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  subtitle: { color: colors.muted, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.md },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  choice: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choiceActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  choiceText: { color: colors.text, fontWeight: '600' },
  choiceTextActive: { color: colors.brandDark },
  actions: { gap: spacing.sm },
});
