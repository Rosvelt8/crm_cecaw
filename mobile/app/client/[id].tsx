import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Card, EmptyState, ErrorNote, Loading } from '../../src/components/ui';
import { getClient, listComptes } from '../../src/api/clients';
import { errorMessage } from '../../src/api/client';
import { formatMontant } from '../../src/lib/format';
import type { Client, Compte } from '../../src/types';
import { colors, radius, spacing } from '../../src/theme';

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
  if (error) return <ErrorNote message={error} />;
  if (!client) return <EmptyState title="Client introuvable" />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.name}>{`${client.prenom ?? ''} ${client.nom}`.trim()}</Text>
        <Text style={styles.muted}>{client.telephone}</Text>
        {client.email ? <Text style={styles.muted}>{client.email}</Text> : null}
        {client.ville ? <Text style={styles.muted}>{client.ville}</Text> : null}
        <Badge label={client.statut} tone="muted" />
      </Card>

      <Text style={styles.section}>
        Comptes ({comptes.length})
      </Text>

      {comptes.length === 0 ? (
        <EmptyState
          title="Aucun compte"
          hint="Ce client n'a pas encore de compte d'épargne ouvert."
        />
      ) : (
        comptes.map((compte) => (
          <Pressable
            key={compte.id}
            style={styles.compte}
            onPress={() => router.push(`/compte/${compte.id}`)}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.numero}>{compte.numero}</Text>
              <Text style={styles.muted}>{compte.produit?.nom ?? 'Produit inconnu'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={styles.solde}>{formatMontant(compte.solde)}</Text>
              <Text style={styles.action}>Collecter</Text>
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 13 },
  section: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  compte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  numero: { fontSize: 15, fontWeight: '700', color: colors.text },
  solde: { fontSize: 15, fontWeight: '800', color: colors.brand },
  action: { fontSize: 11, color: colors.muted },
});
