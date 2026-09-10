import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
// Import direct de la famille : l'index de @expo/vector-icons embarque
// les 20 polices d'icones, alors qu'une seule est utilisee.
import Feather from '@expo/vector-icons/Feather';
import { Badge, Card, EmptyState, ErrorNote, Loading } from '../../src/components/ui';
import { listMesObjectifs } from '../../src/api/objectifs';
import { errorMessage } from '../../src/api/client';
import { formatDate, formatMontant } from '../../src/lib/format';
import type { Objectif } from '../../src/types';
import { colors, fonts, radius, spacing } from '../../src/theme';

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

/** La barre passe au vert une fois la cible franchie, à l'or avant. */
function barColor(statut: Objectif['statut']): string {
  if (statut === 'atteint' || statut === 'depasse') return colors.success;
  if (statut === 'echec') return colors.danger;
  return colors.brand;
}

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
      {error ? (
        <View style={{ padding: spacing.md }}>
          <ErrorNote message={error} />
        </View>
      ) : null}

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
          const tint = barColor(item.statut);
          return (
            <Card>
              <View style={styles.header}>
                <Text style={styles.title}>{item.titre}</Text>
                <Badge label={STATUT_LABEL[item.statut]} tone={STATUT_TONE[item.statut]} />
              </View>

              {item.produit?.nom ? (
                <View style={styles.produitRow}>
                  <Feather name="package" size={12} color={colors.muted} />
                  <Text style={styles.muted}>{item.produit.nom}</Text>
                </View>
              ) : null}

              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: tint }]} />
              </View>

              <View style={styles.footer}>
                <Text style={styles.progress}>
                  {formatMontant(item.realise)}
                  <Text style={styles.progressTotal}> / {formatMontant(item.cible)}</Text>
                </Text>
                <Text style={[styles.pct, { color: tint }]}>{item.pourcentage}%</Text>
              </View>

              <View style={styles.produitRow}>
                <Feather name="calendar" size={12} color={colors.mutedLight} />
                <Text style={styles.dates}>
                  Du {formatDate(item.dateDebut)} au {formatDate(item.dateFin)}
                </Text>
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.md, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.text, lineHeight: 21 },
  produitRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  dates: { fontFamily: fonts.regular, fontSize: 11, color: colors.mutedLight },
  barTrack: {
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  barFill: { height: 10, borderRadius: radius.full },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progress: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  progressTotal: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  pct: { fontFamily: fonts.bold, fontSize: 16 },
});
