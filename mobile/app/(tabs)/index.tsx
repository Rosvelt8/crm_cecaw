import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Avatar, Badge, EmptyState, ErrorNote, Loading, Mono } from '../../src/components/ui';
import { SelectField } from '../../src/components/FormFields';
import { listProspects } from '../../src/api/prospects';
import { errorMessage } from '../../src/api/client';
import { formatDate, initials } from '../../src/lib/format';
import { LABEL_STATUT_PROSPECT, type Prospect, type StatutProspect } from '../../src/types';
import { colors, fonts, radius, shadow, spacing } from '../../src/theme';

const TONE: Record<StatutProspect, 'muted' | 'success' | 'warning' | 'danger' | 'brand'> = {
  nouveau: 'muted',
  contacte: 'brand',
  interesse: 'warning',
  negocie: 'warning',
  converti: 'success',
  perdu: 'danger',
};

const FILTRES = (Object.keys(LABEL_STATUT_PROSPECT) as StatutProspect[]).map((s) => ({
  value: s,
  label: LABEL_STATUT_PROSPECT[s],
}));

export default function ProspectsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState<StatutProspect | ''>('');
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

  // Recharge au retour sur l'onglet : une fiche vient peut-être d'être modifiée.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((p) => {
      if (statut && p.statut !== statut) return false;
      if (!q) return true;
      return `${p.prenom ?? ''} ${p.nom} ${p.telephone} ${p.ville ?? ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, statut]);

  if (loading) return <Loading label="Chargement des prospects..." />;

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
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
        <SelectField
          label="Statut"
          value={statut}
          options={FILTRES}
          onChange={(v) => setStatut(v as StatutProspect | '')}
          clearable
          placeholder="Tous les statuts"
        />
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
            title="Aucun prospect"
            hint="Créez votre premier prospect avec le bouton en bas à droite."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push(`/prospect/${item.id}`)}
          >
            <Avatar initials={initials(item.prenom ?? item.nom, item.nom)} size={42} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name}>
                {`${item.prenom ?? ''} ${item.nom}`.trim()}
                {item.typePersonne === 'morale' ? ' (Sté)' : ''}
              </Text>
              <Mono>{item.telephone}</Mono>
              <Text style={styles.muted}>
                {[item.ville, item.profession].filter(Boolean).join(' · ') || '--'}
              </Text>
            </View>
            <View style={styles.rowRight}>
              <Badge label={LABEL_STATUT_PROSPECT[item.statut]} tone={TONE[item.statut]} />
              <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
            </View>
          </Pressable>
        )}
      />

      {/* Action principale flottante, dans l'or de la marque. */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.9 }]}
        onPress={() => router.push('/prospect/nouveau')}
        accessibilityRole="button"
        accessibilityLabel="Nouveau prospect"
      >
        <Feather name="plus" size={24} color={colors.onBrand} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  toolbar: { padding: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  search: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  list: { paddingHorizontal: spacing.md, paddingBottom: 96, gap: spacing.sm, flexGrow: 1 },
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
  rowRight: { alignItems: 'flex-end', gap: spacing.xs },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  date: { fontFamily: fonts.regular, fontSize: 10, color: colors.mutedLight },
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },
});
