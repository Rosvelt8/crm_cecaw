import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Badge, Button, Card, ErrorNote } from '../../src/components/ui';
import { useSession } from '../../src/store/session';
import { isTrackingRunning, startTracking, stopTracking, trackingAvailable } from '../../src/tracking';
import {
  flushPositions,
  flushTransactions,
  queuedPositionCount,
  queuedTransactionCount,
} from '../../src/lib/queue';
import { isWithinWorkingHours, workingHoursLabel } from '../../src/lib/workingHours';
import { formatDateTime, initials } from '../../src/lib/format';
import { colors, radius, spacing } from '../../src/theme';

const PERMISSION_MESSAGES = {
  'services-off': 'Activez la localisation du téléphone, puis réessayez.',
  'foreground-denied': "L'accès à la position a été refusé.",
  'background-denied':
    "Autorisez la position « Toujours » dans les réglages : sans cela, la tournée s'interrompt dès que l'écran s'éteint.",
  unavailable:
    "Le suivi en arrière-plan n'existe pas dans Expo Go sur Android. Il faut une version installée de l'application (development build ou APK).",
} as const;

export default function TourneeScreen() {
  const user = useSession((s) => s.user);
  const agent = useSession((s) => s.agent);
  const signOut = useSession((s) => s.signOut);

  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingPositions, setPendingPositions] = useState(0);
  const [pendingTransactions, setPendingTransactions] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [running, positions, transactions] = await Promise.all([
      isTrackingRunning(),
      queuedPositionCount(),
      queuedTransactionCount(),
    ]);
    setTracking(running);
    setPendingPositions(positions);
    setPendingTransactions(transactions);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleTracking = async (next: boolean) => {
    if (!agent) {
      setNotice('Aucune fiche agent rattachée à ce compte : le suivi ne peut pas démarrer.');
      return;
    }
    setBusy(true);
    setNotice(null);

    if (!next) {
      await stopTracking();
      setTracking(false);
      setBusy(false);
      return;
    }

    const result = await startTracking(agent.id);
    if (result.ok) {
      setTracking(true);
    } else {
      setNotice(PERMISSION_MESSAGES[result.reason]);
      setTracking(false);
    }
    setBusy(false);
  };

  const sync = async () => {
    if (!agent) return;
    setSyncing(true);
    const positions = await flushPositions(agent.id);
    const transactions = await flushTransactions();
    await refresh();
    setSyncing(false);
    Alert.alert(
      'Synchronisation',
      positions + transactions === 0
        ? 'Rien à transmettre.'
        : `${positions} position(s) et ${transactions} opération(s) transmises.`,
    );
  };

  const withinHours = isWithinWorkingHours();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refresh();
            setRefreshing(false);
          }}
        />
      }
    >
      <Card>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(user?.prenom, user?.nom)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user ? `${user.prenom} ${user.nom}` : 'Agent'}</Text>
            <Text style={styles.muted}>
              {agent
                ? `${agent.matricule}${agent.secteur ? ` - ${agent.secteur}` : ''}`
                : 'Fiche agent introuvable'}
            </Text>
            <Text style={styles.muted}>{user?.agence?.nom ?? ''}</Text>
          </View>
        </View>
      </Card>

      {notice ? <ErrorNote message={notice} /> : null}

      <Card>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Suivi de tournée</Text>
            <Text style={styles.muted}>{workingHoursLabel()}</Text>
          </View>
          <Switch
            value={tracking}
            onValueChange={toggleTracking}
            disabled={busy || !agent || !trackingAvailable}
            trackColor={{ true: colors.brand, false: colors.border }}
          />
        </View>

        <View style={styles.statusRow}>
          <Badge
            label={tracking ? 'Suivi actif' : 'Suivi arrêté'}
            tone={tracking ? 'success' : 'muted'}
          />
          <Badge
            label={withinHours ? 'Heures de travail' : 'Hors heures'}
            tone={withinHours ? 'success' : 'warning'}
          />
        </View>

        <Text style={styles.hint}>
          {!trackingAvailable
            ? "Suivi indisponible sur cet environnement : Expo Go sur Android ne gère pas la géolocalisation en arrière-plan. Le reste de l'application fonctionne normalement."
            : tracking && !withinHours
            ? "Le suivi est actif, mais aucune position n'est transmise en dehors des heures de travail."
            : 'La position est transmise même téléphone en veille, pendant les heures de travail uniquement.'}
        </Text>

        {agent?.dernierePositionAt ? (
          <Text style={styles.muted}>
            Dernière position connue : {formatDateTime(agent.dernierePositionAt)}
          </Text>
        ) : null}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>En attente d&apos;envoi</Text>
        <Text style={styles.muted}>
          {pendingPositions} position(s) et {pendingTransactions} opération(s) conservées hors
          ligne.
        </Text>
        <Button
          title="Synchroniser maintenant"
          onPress={sync}
          loading={syncing}
          disabled={!agent || pendingPositions + pendingTransactions === 0}
        />
      </Card>

      <Button title="Se déconnecter" variant="ghost" onPress={signOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.brandDark, fontWeight: '800' },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 13 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
