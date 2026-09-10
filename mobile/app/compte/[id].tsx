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
// Import direct de la famille : l'index de @expo/vector-icons embarque
// les 20 polices d'icones, alors qu'une seule est utilisee.
import Feather from '@expo/vector-icons/Feather';
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  Loading,
  Mono,
  SectionTitle,
} from '../../src/components/ui';
import { createTransaction, listTransactions } from '../../src/api/comptes';
import { errorMessage } from '../../src/api/client';
import { queueTransaction } from '../../src/lib/queue';
import { useSession } from '../../src/store/session';
import { formatDateTime, formatMontant } from '../../src/lib/format';
import type { Transaction } from '../../src/types';
import { colors, fonts, radius, shadow, spacing } from '../../src/theme';

type TypeOperation = 'credit' | 'debit';

/** Montants proposes en un geste : les coupures les plus courantes en collecte. */
const RACCOURCIS = [1000, 2000, 5000, 10000, 25000];

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

  const value = Number(montant.replace(/[^0-9]/g, ''));

  const submit = async () => {
    if (!Number.isFinite(value) || value <= 0) {
      setError('Saisissez un montant supérieur à zéro.');
      return;
    }
    if (!agent) {
      setError('Aucune fiche agent rattachée à ce compte : opération impossible.');
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
          <SectionTitle>Type d&apos;opération</SectionTitle>
          <View style={styles.segmented}>
            {(
              [
                ['credit', 'Dépôt', 'arrow-down-left'],
                ['debit', 'Retrait', 'arrow-up-right'],
              ] as const
            ).map(([v, label, icon]) => {
              const active = type === v;
              const tint = v === 'credit' ? colors.success : colors.warning;
              return (
                <Pressable
                  key={v}
                  onPress={() => setType(v)}
                  style={[
                    styles.segment,
                    active && { borderColor: tint, backgroundColor: `${tint}14` },
                  ]}
                >
                  <Feather name={icon} size={16} color={active ? tint : colors.mutedLight} />
                  <Text style={[styles.segmentText, active && { color: tint }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Montant mis en avant : c'est le geste central de la collecte. */}
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Montant</Text>
            <View style={styles.amountRow}>
              <Mono style={styles.amountValue}>
                {value > 0 ? value.toLocaleString('fr-FR') : '0'}
              </Mono>
              <Text style={styles.amountCurrency}>FCFA</Text>
            </View>
          </View>

          <View style={styles.shortcuts}>
            {RACCOURCIS.map((m) => (
              <Pressable
                key={m}
                style={styles.shortcut}
                onPress={() => setMontant(String((value || 0) + m))}
              >
                <Text style={styles.shortcutText}>+{m.toLocaleString('fr-FR')}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.shortcut} onPress={() => setMontant('')}>
              <Feather name="rotate-ccw" size={12} color={colors.muted} />
            </Pressable>
          </View>

          <Field
            label="Saisie manuelle (FCFA)"
            value={montant}
            onChangeText={setMontant}
            keyboardType="number-pad"
            placeholder="10000"
            mono
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

        <SectionTitle>Dernières opérations</SectionTitle>

        {loading ? (
          <Loading label="Chargement de l'historique..." />
        ) : history.length === 0 ? (
          <Text style={styles.muted}>Aucune opération sur ce compte.</Text>
        ) : (
          history.slice(0, 15).map((t) => (
            <View key={t.id} style={styles.historyRow}>
              <View
                style={[
                  styles.historyIcon,
                  { backgroundColor: t.type === 'credit' ? colors.successLight : colors.warningLight },
                ]}
              >
                <Feather
                  name={t.type === 'credit' ? 'arrow-down-left' : 'arrow-up-right'}
                  size={15}
                  color={t.type === 'credit' ? colors.successDark : colors.warningDark}
                />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
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

  segmented: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  segmentText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.mutedLight },

  amountBox: {
    backgroundColor: colors.brandDeep,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  amountLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  amountValue: { fontSize: 30, color: colors.onBrand },
  amountCurrency: { fontFamily: fonts.medium, fontSize: 13, color: colors.brandAccent },

  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  shortcut: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  shortcutText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSoft },

  historyRow: {
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
  historyIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amount: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  date: { fontFamily: fonts.regular, fontSize: 10, color: colors.mutedLight },
  muted: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
});
