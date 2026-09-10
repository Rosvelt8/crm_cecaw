import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PinPad } from '../src/components/PinPad';
import { Button, ErrorNote, Logo } from '../src/components/ui';
import { useSession } from '../src/store/session';
import { DEFAULT_LOCK_DELAY_MIN, LOCK_DELAY_CHOICES, PIN_LENGTH } from '../src/config';
import { colors, fonts, radius, spacing } from '../src/theme';

type Step = 'choose' | 'confirm' | 'delay';

/** Codes trop devinables : ils annulent l'interet du verrouillage. */
function isWeak(pin: string): boolean {
  if (new Set(pin).size === 1) return true;
  const ascending = pin.split('').every((d, i, arr) => i === 0 || Number(d) === Number(arr[i - 1]) + 1);
  const descending = pin.split('').every((d, i, arr) => i === 0 || Number(d) === Number(arr[i - 1]) - 1);
  return ascending || descending;
}

const STEP_INDEX: Record<Step, number> = { choose: 0, confirm: 1, delay: 2 };

export default function PinSetupScreen() {
  const configurePin = useSession((s) => s.configurePin);
  const signOut = useSession((s) => s.signOut);
  const { height } = useWindowDimensions();

  // Sur un ecran court, le logo et les textes secondaires cedent la place
  // au pave : c'est lui qui doit rester entierement visible.
  const short = height < 720;

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
        setError('Évitez un code trop simple (0000, 1234...).');
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={[styles.content, short && styles.contentShort]}>
        <View style={styles.header}>
          {!short ? (
            <View style={styles.mark}>
              <Logo size={34} />
            </View>
          ) : null}

          {/* Progression en trois temps : choix, confirmation, delai. */}
          <View style={styles.steps}>
            {([0, 1, 2] as const).map((i) => (
              <View
                key={i}
                style={[styles.stepDash, i <= STEP_INDEX[step] && styles.stepDashActive]}
              />
            ))}
          </View>

          <Text style={[styles.title, short && styles.titleShort]}>
            {step === 'choose' && 'Choisissez votre code'}
            {step === 'confirm' && 'Confirmez votre code'}
            {step === 'delay' && 'Délai de verrouillage'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={short ? 2 : 3}>
            {step === 'delay'
              ? "Passé ce délai sans activité, l'application se reverrouille."
              : `Code à ${PIN_LENGTH} chiffres, il protège vos données en cas de perte ou de vol.`}
          </Text>
        </View>

        {error ? <ErrorNote message={error} /> : null}

        <View style={styles.middle}>
          {step === 'delay' ? (
            <View style={styles.choices}>
              {LOCK_DELAY_CHOICES.map((minutes) => (
                <Pressable
                  key={minutes}
                  onPress={() => setDelay(minutes)}
                  style={[styles.choice, delay === minutes && styles.choiceActive]}
                >
                  <Text
                    style={[styles.choiceValue, delay === minutes && styles.choiceValueActive]}
                  >
                    {minutes}
                  </Text>
                  <Text style={[styles.choiceUnit, delay === minutes && styles.choiceUnitActive]}>
                    min
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
        </View>

        <View style={styles.actions}>
          {step === 'delay' ? (
            <Button title="Activer la protection" onPress={save} loading={saving} />
          ) : null}
          <Button title="Changer de compte" variant="ghost" onPress={signOut} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  contentShort: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },

  header: { alignItems: 'center', gap: spacing.xs },
  mark: {
    width: 58,
    height: 58,
    borderRadius: radius.full,
    backgroundColor: colors.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  steps: { flexDirection: 'row', gap: 6 },
  stepDash: { width: 24, height: 3, borderRadius: radius.full, backgroundColor: colors.border },
  stepDashActive: { backgroundColor: colors.brand },
  title: { fontFamily: fonts.bold, fontSize: 19, color: colors.text, marginTop: spacing.xs },
  titleShort: { fontSize: 17, marginTop: 2 },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 17,
  },

  // Le pave occupe l'espace restant et reste centre quel que soit le gabarit.
  middle: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  choices: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', flexWrap: 'wrap' },
  choice: {
    width: 68,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  choiceActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  choiceValue: { fontFamily: fonts.bold, fontSize: 19, color: colors.textSoft },
  choiceValueActive: { color: colors.brandDark },
  choiceUnit: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted },
  choiceUnitActive: { color: colors.brandDark },

  actions: { gap: 2 },
});
