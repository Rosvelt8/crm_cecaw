import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Loading } from '../src/components/ui';
import { colors } from '../src/theme';

/** Ecran d'attente pendant la relecture du disque au demarrage. */
export default function Splash() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cecaw Terrain</Text>
      <Loading label="Ouverture de la session..." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.brand },
});
