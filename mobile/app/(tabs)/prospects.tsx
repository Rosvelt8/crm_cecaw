import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Badge, Button, EmptyState, ErrorNote, Loading } from '../../src/components/ui';
import { listProspects, updateProspectStatut } from '../../src/api/prospects';
import { errorMessage } from '../../src/api/client';
import { formatDate } from '../../src/lib/format';
import type { Prospect, StatutProspect } from '../../src/types';
import { colors, radius, spacing } from '../../src/theme';

const STATUT_LABEL: Record<StatutProspect, string> = {
  nouveau: 'Nouveau',
  en_cours: 'En cours',
  converti: 'Converti',
  perdu: 'Perdu',
};

const STATUT_TONE: Record<StatutProspect, 'muted' | 'success' | 'warning' | 'danger'> = {
  nouveau: 'muted',
  en_cours: 'warning',
  converti: 'success',
  perdu: 'danger',
};

export default function ProspectsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await listProspects());
    } catch (e) {
      setError(errorMessage(e, 'Impossible de charger les prospects.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Recharge au retour sur l'onglet : un prospect vient peut-être d'être créé.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) =>
      `${p.prenom ?? ''} ${p.nom} ${p.telephone} ${p.ville ?? ''}`.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const changeStatut = (prospect: Prospect) => {
    const options: StatutProspect[] = ['nouveau', 'en_cours', 'converti', 'perdu'];
    Alert.alert(
      `${prospect.prenom ?? ''} ${prospect.nom}`.trim(),
      'Faire évoluer le statut de ce prospect',
      [
        ...options
          .filter((s) => s !== prospect.statut)
          .map((s) => ({
            text: STATUT_LABEL[s],
            onPress: async () => {
              try {
                await updateProspectStatut(prospect.id, s);
                setRows((prev) =>
                  prev.map((p) => (p.id === prospect.id ? { ...p, statut: s } : p)),
                );
              } catch (e) {
                Alert.alert('Erreur', errorMessage(e, 'Statut non enregistré.'));
              }
            },
          })),
        { text: 'Annuler', style: 'cancel' as const },
      ],
    );
  };

  if (loading) return <Loading label="Chargement des prospects..." />;

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Nom, téléphone, ville..."
          placeholderTextColor={colors.muted}
          style={styles.search}
        />
        <Button title="Nouveau" onPress={() => router.push('/prospect/nouveau')} />
      </View>

      {error ? <ErrorNote message={error} /> : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          load();
        }}
        ListEmptyComponent={
          <EmptyState
            title="Aucun prospect"
            hint="Créez votre premier prospect avec le bouton Nouveau."
          />
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => changeStatut(item)}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name}>
                {`${item.prenom ?? ''} ${item.nom}`.trim()}
              </Text>
              <Text style={styles.muted}>{item.telephone}</Text>
              <Text style={styles.muted}>
                {[item.ville, item.profession].filter(Boolean).join(' - ') || '--'}
              </Text>
            </View>
            <View style={styles.rowRight}>
              <Badge label={STATUT_LABEL[item.statut]} tone={STATUT_TONE[item.statut]} />
              <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, alignItems: 'center' },
  search: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowRight: { alignItems: 'flex-end', gap: spacing.xs },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 13 },
  date: { color: colors.muted, fontSize: 11 },
});
