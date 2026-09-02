import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { EmptyState, ErrorNote, Loading } from '../../src/components/ui';
import { listClients } from '../../src/api/clients';
import { errorMessage } from '../../src/api/client';
import type { Client } from '../../src/types';
import { colors, radius, spacing } from '../../src/theme';

export default function ClientsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await listClients());
    } catch (e) {
      setError(errorMessage(e, 'Impossible de charger les clients.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) =>
      `${c.prenom ?? ''} ${c.nom} ${c.telephone} ${c.ville ?? ''}`.toLowerCase().includes(q),
    );
  }, [rows, search]);

  if (loading) return <Loading label="Chargement des clients..." />;

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
            title="Aucun client"
            hint="Vos clients apparaissent ici une fois un prospect converti."
          />
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/client/${item.id}`)}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name}>{`${item.prenom ?? ''} ${item.nom}`.trim()}</Text>
              <Text style={styles.muted}>{item.telephone}</Text>
              <Text style={styles.muted}>{item.ville ?? '--'}</Text>
            </View>
            <Text style={styles.comptes}>
              {item.nb_comptes ?? 0} compte{(item.nb_comptes ?? 0) > 1 ? 's' : ''}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: { padding: spacing.md },
  search: {
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
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 13 },
  comptes: { color: colors.brand, fontSize: 12, fontWeight: '700' },
});
