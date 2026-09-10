import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Logo } from '../src/components/ui';
import { colors, fonts, spacing } from '../src/theme';

/** Ecran d'attente pendant la relecture du disque au demarrage. */
export default function Splash() {
  return (
    <View style={styles.container}>
      <View style={styles.mark}>
        <Logo size={78} />
      </View>
      <Text style={styles.brand}>CECAW FINANCE</Text>
      <Text style={styles.tagline}>Terrain</Text>
      <ActivityIndicator color={colors.brandAccent} style={{ marginTop: spacing.xl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.brandDeep,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  mark: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  brand: {
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: 2,
    color: colors.onBrand,
  },
  tagline: {
    fontFamily: fonts.medium,
    fontSize: 13,
    letterSpacing: 6,
    color: colors.brandAccent,
    textTransform: 'uppercase',
  },
});
