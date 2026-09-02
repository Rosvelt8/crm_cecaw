import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Badge, Card, EmptyState, ErrorNote, Loading } from '../../src/components/ui';
import { listMesObjectifs } from '../../src/api/objectifs';
import { errorMessage } from '../../src/api/client';
import { formatDate, formatMontant } from '../../src/lib/format';
import type { Objectif } from '../../src/types';
import { colors, radius, spacing } from '../../src/theme';

const STATUT_LABEL: Record<Objectif['statut'], string> = {
  en_cours: 'En cours',
  atteint: 'Atteint',
  depasse: 'Dépassé',
  echec: 'Échec',
};

const STATUT_TONE: Record<Objectif['statut'], 'muted' | 'success' | 'warning' | 'danger'> = {
  en_cours: 'warning',
  atteint: 'success',
  depasse: 'success',
  echec: 'danger',
};

export default function ObjectifsScreen() {
  const [rows, setRows] = useState<Objectif[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await listMesObjectifs());
    } catch (e) {
      setError(errorMessage(e, 'Impossible de charger vos objectifs.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loading label="Chargement de vos objectifs..." />;

  return (
    <View style={styles.screen}>
      {error ? <ErrorNote message={error} /> : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          load();
        }}
        ListEmptyComponent={
          <EmptyState
            title="Aucun objectif assigné"
            hint="Votre superviseur ne vous a pas encore attribué d'objectif."
          />
        }
        renderItem={({ item }) => {
          // Le backend calcule déjà le pourcentage ; on le borne pour la barre.
          const pct = Math.max(0, Math.min(100, Number(item.pourcentage) || 0));
          return (
            <Card>
              <View style={styles.header}>
                <Text style={styles.title}>{item.titre}</Text>
                <Badge label={STATUT_LABEL[item.statut]} tone={STATUT_TONE[item.statut]} />
              </View>

              {item.produit?.nom ? <Text style={styles.muted}>{item.produit.nom}</Text> : null}

              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${pct}%` }]} />
              </View>

              <View style={styles.footer}>
                <Text style={styles.progress}>
                  {formatMontant(item.realise)} / {formatMontant(item.cible)}
                </Text>
                <Text style={styles.pct}>{item.pourcentage}%</Text>
              </View>

              <Text style={styles.muted}>
                Du {formatDate(item.dateDebut)} au {formatDate(item.dateFin)}
              </Text>
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 12 },
  barTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: radius.full, backgroundColor: colors.brand },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progress: { fontSize: 13, fontWeight: '600', color: colors.text },
  pct: { fontSize: 13, fontWeight: '800', color: colors.brand },
});
