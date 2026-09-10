import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PinPad } from '../src/components/PinPad';
import { Button, ErrorNote, Logo } from '../src/components/ui';
import { useSession } from '../src/store/session';
import { PIN_LENGTH } from '../src/config';
import { colors, fonts, radius, spacing } from '../src/theme';

export default function PinUnlockScreen() {
  const unlock = useSession((s) => s.unlock);
  const signOut = useSession((s) => s.signOut);
  const error = useSession((s) => s.error);
  const attemptsLeft = useSession((s) => s.attemptsLeft);
  const user = useSession((s) => s.user);
  const { height } = useWindowDimensions();

  // Ecran court : on sacrifie le medaillon, pas le pave.
  const short = height < 720;

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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={[styles.content, short && styles.contentShort]}>
        <View style={styles.header}>
          {!short ? (
            <View style={styles.mark}>
              <Logo size={34} />
            </View>
          ) : null}
          <Text style={[styles.title, short && styles.titleShort]}>Application verrouillée</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {user ? `${user.prenom} ${user.nom}` : 'Saisissez votre code'}
          </Text>
        </View>

        {error ? <ErrorNote message={error} /> : null}

        <View style={styles.middle}>
          <PinPad value={pin} onChange={setPin} disabled={checking} light />
        </View>

        <View style={styles.footer}>
          <Text style={styles.attempts} numberOfLines={2}>
            {attemptsLeft} tentative{attemptsLeft > 1 ? 's' : ''} avant effacement des données
            locales
          </Text>
          <Button title="Se déconnecter" variant="ghost" onPress={signOut} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandDeep },
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
    width: 62,
    height: 62,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229,184,48,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: { fontFamily: fonts.bold, fontSize: 19, color: colors.onBrand },
  titleShort: { fontSize: 17 },
  subtitle: { fontFamily: fonts.regular, fontSize: 13, color: colors.brandAccent },

  // Le pave prend l'espace restant et reste centre.
  middle: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  footer: { gap: 2 },
  attempts: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
});
