import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
// Import direct de la famille : l'index de @expo/vector-icons embarque
// les 20 polices d'icones, alors qu'une seule est utilisee.
import Feather from '@expo/vector-icons/Feather';
import { Avatar, EmptyState, ErrorNote, Loading, Mono } from '../../src/components/ui';
import { listClients } from '../../src/api/clients';
import { errorMessage } from '../../src/api/client';
import { initials } from '../../src/lib/format';
import type { Client } from '../../src/types';
import { colors, fonts, radius, shadow, spacing } from '../../src/theme';

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
      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={colors.mutedLight} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Nom, téléphone, ville..."
          placeholderTextColor={colors.mutedLight}
          style={styles.search}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Feather name="x" size={16} color={colors.mutedLight} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <View style={{ paddingHorizontal: spacing.md }}>
          <ErrorNote message={error} />
        </View>
      ) : null}

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
        renderItem={({ item }) => {
          const nbComptes = item.nb_comptes ?? 0;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => router.push(`/client/${item.id}`)}
            >
              <Avatar initials={initials(item.prenom, item.nom)} size={42} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name}>{`${item.prenom ?? ''} ${item.nom}`.trim()}</Text>
                <Mono>{item.telephone}</Mono>
                <Text style={styles.muted}>{item.ville ?? '--'}</Text>
              </View>
              <View style={styles.rowRight}>
                <View style={styles.comptePill}>
                  <Feather name="credit-card" size={12} color={colors.brandDark} />
                  <Text style={styles.comptePillText}>{nbComptes}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedLight} />
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  search: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  rowPressed: { backgroundColor: colors.brandLight },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  comptePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brandLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  comptePillText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.brandDark },
});
