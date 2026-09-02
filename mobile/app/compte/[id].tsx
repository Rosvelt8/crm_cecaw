import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, ErrorNote, Field, Loading } from '../../src/components/ui';
import { createTransaction, listTransactions } from '../../src/api/comptes';
import { errorMessage } from '../../src/api/client';
import { queueTransaction } from '../../src/lib/queue';
import { useSession } from '../../src/store/session';
import { formatDateTime, formatMontant } from '../../src/lib/format';
import type { Transaction } from '../../src/types';
import { colors, radius, spacing } from '../../src/theme';

type TypeOperation = 'credit' | 'debit';

export default function CollecteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const compteId = Number(id);
  const agent = useSession((s) => s.agent);

  const [type, setType] = useState<TypeOperation>('credit');
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!Number.isFinite(compteId)) return;
    try {
      setHistory(await listTransactions(compteId));
    } catch {
      // L'historique est un confort : son absence ne doit pas bloquer la saisie.
    } finally {
      setLoading(false);
    }
  }, [compteId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    const value = Number(montant.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Saisissez un montant supérieur à zéro.');
      return;
    }
    if (!agent) {
      setError("Aucune fiche agent rattachée à ce compte : opération impossible.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      type,
      montant: value,
      motif: motif.trim() || undefined,
      agent_id: agent.id,
    };

    try {
      await createTransaction(compteId, payload);
      Alert.alert('Opération enregistrée', `${formatMontant(value)} sur le compte.`);
      router.back();
    } catch (e) {
      // Hors couverture, l'opération est conservée et rejouée depuis l'onglet Tournée :
      // une collecte encaissée sur le terrain ne doit jamais être perdue.
      await queueTransaction({
        compteId,
        type,
        montant: value,
        motif: motif.trim() || undefined,
        agentId: agent.id,
        at: new Date().toISOString(),
      });
      Alert.alert(
        'Enregistré hors ligne',
        `${errorMessage(e)}\n\nL'opération est conservée sur le téléphone et sera transmise à la prochaine synchronisation.`,
      );
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <ErrorNote message={error} /> : null}

        <Card>
          <Text style={styles.label}>Type d&apos;opération</Text>
          <View style={styles.segmented}>
            {(
              [
                ['credit', 'Dépôt'],
                ['debit', 'Retrait'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => setType(value)}
                style={[styles.segment, type === value && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, type === value && styles.segmentTextActive]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Field
            label="Montant (FCFA)"
            value={montant}
            onChangeText={setMontant}
            keyboardType="number-pad"
            placeholder="10000"
          />

          <Field
            label="Motif (facultatif)"
            value={motif}
            onChangeText={setMotif}
            placeholder="Collecte journalière"
          />

          <Button
            title={type === 'credit' ? 'Enregistrer le dépôt' : 'Enregistrer le retrait'}
            onPress={submit}
            loading={saving}
            disabled={!agent}
          />
        </Card>

        <Text style={styles.section}>Dernières opérations</Text>

        {loading ? (
          <Loading label="Chargement de l'historique..." />
        ) : history.length === 0 ? (
          <Text style={styles.muted}>Aucune opération sur ce compte.</Text>
        ) : (
          history.slice(0, 15).map((t) => (
            <View key={t.id} style={styles.historyRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Badge
                  label={t.type === 'credit' ? 'Dépôt' : 'Retrait'}
                  tone={t.type === 'credit' ? 'success' : 'warning'}
                />
                <Text style={styles.muted}>{t.motif ?? '--'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={styles.amount}>{formatMontant(t.montant)}</Text>
                <Text style={styles.date}>{formatDateTime(t.createdAt)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  segmented: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  segmentActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  segmentText: { fontWeight: '600', color: colors.muted },
  segmentTextActive: { color: colors.brandDark },
  section: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  historyRow: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  amount: { fontSize: 15, fontWeight: '800', color: colors.text },
  date: { fontSize: 11, color: colors.muted },
  muted: { color: colors.muted, fontSize: 13 },
});
