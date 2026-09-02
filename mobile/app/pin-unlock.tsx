import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PinPad } from '../src/components/PinPad';
import { Button, ErrorNote } from '../src/components/ui';
import { useSession } from '../src/store/session';
import { PIN_LENGTH } from '../src/config';
import { colors, spacing } from '../src/theme';

export default function PinUnlockScreen() {
  const unlock = useSession((s) => s.unlock);
  const signOut = useSession((s) => s.signOut);
  const error = useSession((s) => s.error);
  const attemptsLeft = useSession((s) => s.attemptsLeft);
  const user = useSession((s) => s.user);

  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (pin.length !== PIN_LENGTH || checking) return;
    setChecking(true);
    unlock(pin).then((ok) => {
      if (!ok) setPin('');
      setChecking(false);
    });
  }, [pin, checking, unlock]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Application verrouillee</Text>
          <Text style={styles.subtitle}>
            {user ? `${user.prenom} ${user.nom}` : 'Saisissez votre code'}
          </Text>
        </View>

        {error ? <ErrorNote message={error} /> : null}

        <PinPad value={pin} onChange={setPin} disabled={checking} />

        <Text style={styles.attempts}>
          {attemptsLeft} tentative(s) avant effacement des donnees locales
        </Text>

        <Button title="Se deconnecter" variant="ghost" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.lg, gap: spacing.lg, justifyContent: 'center' },
  header: { alignItems: 'center', gap: spacing.xs },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  subtitle: { color: colors.muted, fontSize: 14 },
  attempts: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
