import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
// Import direct de la famille : l'index de @expo/vector-icons embarque
// les 20 polices d'icones, alors qu'une seule est utilisee.
import Feather from '@expo/vector-icons/Feather';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  Mono,
  SectionTitle,
} from '../../src/components/ui';
import { getClient, listComptes } from '../../src/api/clients';
import { errorMessage } from '../../src/api/client';
import { formatMontant, initials } from '../../src/lib/format';
import type { Client, Compte } from '../../src/types';
import { colors, fonts, radius, shadow, spacing } from '../../src/theme';

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const clientId = Number(id);

  const [client, setClient] = useState<Client | null>(null);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(clientId)) return;
    setError(null);
    try {
      const [c, cp] = await Promise.all([getClient(clientId), listComptes(clientId)]);
      setClient(c);
      setComptes(cp);
    } catch (e) {
      setError(errorMessage(e, 'Impossible de charger ce client.'));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loading label="Chargement de la fiche..." />;
  if (error) {
    return (
      <View style={{ padding: spacing.md }}>
        <ErrorNote message={error} />
      </View>
    );
  }
  if (!client) return <EmptyState title="Client introuvable" />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Bandeau identite, dans l'or profond de la marque. */}
      <View style={styles.hero}>
        <Avatar initials={initials(client.prenom, client.nom)} size={58} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.heroName}>
            {`${client.prenom ?? ''} ${client.nom}`.trim()}
          </Text>
          <Mono style={styles.heroMono}>{client.telephone}</Mono>
          {client.ville ? <Text style={styles.heroMeta}>{client.ville}</Text> : null}
        </View>
        <Badge label={client.statut} tone="brand" />
      </View>

      {client.email ? (
        <Card>
          <View style={styles.infoRow}>
            <Feather name="mail" size={14} color={colors.muted} />
            <Text style={styles.info}>{client.email}</Text>
          </View>
        </Card>
      ) : null}

      <SectionTitle>Comptes ({comptes.length})</SectionTitle>

      {comptes.length === 0 ? (
        <EmptyState
          title="Aucun compte"
          hint="Ce client n'a pas encore de compte d'épargne ouvert."
        />
      ) : (
        comptes.map((compte) => (
          <Pressable
            key={compte.id}
            style={({ pressed }) => [styles.compte, pressed && styles.comptePressed]}
            onPress={() => router.push(`/compte/${compte.id}`)}
          >
            <View style={styles.compteIcon}>
              <Feather name="credit-card" size={17} color={colors.brandDark} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Mono style={styles.numero}>{compte.numero}</Mono>
              <Text style={styles.muted}>{compte.produit?.nom ?? 'Produit inconnu'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={styles.solde}>{formatMontant(compte.solde)}</Text>
              <View style={styles.collecteRow}>
                <Text style={styles.action}>Collecter</Text>
                <Feather name="chevron-right" size={13} color={colors.brand} />
              </View>
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brandDeep,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  heroName: { fontFamily: fonts.bold, fontSize: 18, color: colors.onBrand },
  heroMono: { color: colors.brandAccent, fontSize: 12 },
  heroMeta: { fontFamily: fonts.regular, fontSize: 12, color: 'rgba(255,255,255,0.6)' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  info: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSoft },

  compte: {
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
  comptePressed: { backgroundColor: colors.brandLight },
  compteIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numero: { fontSize: 14, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  solde: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  collecteRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  action: { fontFamily: fonts.medium, fontSize: 11, color: colors.brand },
});
