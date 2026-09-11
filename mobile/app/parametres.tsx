import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorNote,
  Mono,
  SectionTitle,
} from '../src/components/ui';
import { ConfirmSheet, Sheet, SheetOption } from '../src/components/Modal';
import { useSession } from '../src/store/session';
import {
  isTrackingRunning,
  lireSante,
  sendCurrentPosition,
  startTracking,
  stopTracking,
  trackingAvailable,
  SEUIL_ALERTE_MINUTES,
  type SanteSuivi,
} from '../src/tracking';
import {
  flushPositions,
  flushTransactions,
  queuedPositionCount,
  queuedTransactionCount,
} from '../src/lib/queue';
import { isWithinWorkingHours, workingHoursLabel } from '../src/lib/workingHours';
import { formatDateTime, initials } from '../src/lib/format';
import { LOCK_DELAY_CHOICES } from '../src/config';
import { colors, fonts, radius, spacing } from '../src/theme';

const PERMISSION_MESSAGES = {
  'services-off': 'Activez la localisation du téléphone, puis réessayez.',
  'foreground-denied': "L'accès à la position a été refusé.",
  'background-denied':
    "Autorisez la position « Toujours » dans les réglages : sans cela, la tournée s'interrompt dès que l'écran s'éteint.",
  unavailable:
    "Le suivi en arrière-plan n'existe pas dans Expo Go sur Android. Il faut une version installée de l'application.",
} as const;

/**
 * Profil, réglages et géolocalisation.
 *
 * Tout ce qui n'est pas le travail quotidien de l'agent est regroupé ici :
 * les onglets restent dédiés aux prospects, clients et objectifs, et cet écran
 * porte l'identité, la sécurité et le suivi de tournée.
 */
export default function ParametresScreen() {
  const user = useSession((s) => s.user);
  const agent = useSession((s) => s.agent);
  const lockDelayMin = useSession((s) => s.lockDelayMin);
  const setLockDelay = useSession((s) => s.setLockDelay);
  const signOut = useSession((s) => s.signOut);

  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [positions, setPositions] = useState(0);
  const [transactions, setTransactions] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [sante, setSante] = useState<SanteSuivi | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [delaiOpen, setDelaiOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const refresh = useCallback(async () => {
    const [running, p, t] = await Promise.all([
      isTrackingRunning(),
      queuedPositionCount(),
      queuedTransactionCount(),
    ]);
    setTracking(running);
    setPositions(p);
    setTransactions(t);
    setSante(await lireSante(running));
  }, []);

  // Le diagnostic se rafraichit seul : une coupure du service doit se voir
  // sans que l'agent ait a tirer sur la liste.
  useEffect(() => {
    const minuteur = setInterval(refresh, 30_000);
    return () => clearInterval(minuteur);
  }, [refresh]);

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
    if (result.ok) setTracking(true);
    else {
      setNotice(PERMISSION_MESSAGES[result.reason]);
      setTracking(false);
    }
    setBusy(false);
  };

  const envoyerPosition = async () => {
    if (!agent) return;
    setSendingNow(true);
    setNotice(null);
    setInfo(null);
    const result = await sendCurrentPosition(agent.id);
    setSendingNow(false);
    await refresh();

    if (!result.ok) {
      setNotice(
        result.reason === 'denied'
          ? "Activez la localisation et autorisez l'accès à la position."
          : 'Position introuvable. Placez-vous à découvert et réessayez.',
      );
      return;
    }
    setInfo(
      result.queued
        ? 'Réseau indisponible : la position partira à la prochaine synchronisation.'
        : 'Position transmise au back-office.',
    );
  };

  const synchroniser = async () => {
    if (!agent) return;
    setSyncing(true);
    setInfo(null);
    const p = await flushPositions(agent.id);
    const t = await flushTransactions();
    await refresh();
    setSyncing(false);
    setInfo(
      p + t === 0 ? 'Rien à transmettre.' : `${p} position(s) et ${t} opération(s) transmises.`,
    );
  };

  const enAttente = positions + transactions;
  const dansLesHeures = isWithinWorkingHours();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          tintColor={colors.brand}
          colors={[colors.brand]}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refresh();
            setRefreshing(false);
          }}
        />
      }
    >
      {/* ── Profil ─────────────────────────────────────────────────────── */}
      <View style={styles.hero}>
        <Avatar initials={initials(user?.prenom, user?.nom)} size={58} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.heroName}>{user ? `${user.prenom} ${user.nom}` : 'Agent'}</Text>
          <Text style={styles.heroMeta}>{user?.email ?? ''}</Text>
          {agent ? (
            <Mono style={styles.heroMono}>
              {agent.matricule}
              {agent.secteur ? `  ·  ${agent.secteur}` : ''}
            </Mono>
          ) : (
            <Text style={styles.heroWarn}>Fiche agent introuvable</Text>
          )}
        </View>
      </View>

      {notice ? <ErrorNote message={notice} /> : null}
      {info ? (
        <View style={styles.info}>
          <Feather name="check-circle" size={14} color={colors.successDark} />
          <Text style={styles.infoText}>{info}</Text>
        </View>
      ) : null}

      <Card>
        <SectionTitle>Rattachement</SectionTitle>
        <Ligne label="Agence" valeur={user?.agence?.nom ?? '--'} />
        <Ligne label="Équipe" valeur={user?.equipe?.nom ?? '--'} />
        <Ligne label="Fonction" valeur={user?.fonction ?? 'Agent de collecte'} />
      </Card>

      {/* ── Géolocalisation ────────────────────────────────────────────── */}
      <Card>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <SectionTitle>Suivi de tournée</SectionTitle>
            <Text style={styles.muted}>{workingHoursLabel()}</Text>
          </View>
          <Switch
            value={tracking}
            onValueChange={toggleTracking}
            disabled={busy || !agent || !trackingAvailable}
            thumbColor={tracking ? colors.brand : '#f4f4f5'}
            trackColor={{ true: colors.brandSoft, false: colors.border }}
          />
        </View>

        <View style={styles.statusRow}>
          <Badge label={tracking ? 'Suivi actif' : 'Suivi arrêté'} tone={tracking ? 'success' : 'muted'} />
          <Badge
            label={dansLesHeures ? 'Heures de travail' : 'Hors heures'}
            tone={dansLesHeures ? 'success' : 'warning'}
          />
        </View>

        <Text style={styles.hint}>
          {!trackingAvailable
            ? "Suivi indisponible sur cet environnement : Expo Go sur Android ne gère pas la géolocalisation en arrière-plan."
            : tracking && !dansLesHeures
              ? "Le suivi est actif, mais aucune position n'est transmise en dehors des heures de travail."
              : 'La position est transmise même téléphone en veille, pendant les heures de travail uniquement.'}
        </Text>

        {agent?.dernierePositionAt ? (
          <View style={styles.lastPos}>
            <Feather name="map-pin" size={13} color={colors.muted} />
            <Text style={styles.muted}>
              Dernière position : {formatDateTime(agent.dernierePositionAt)}
            </Text>
          </View>
        ) : null}

        <Button
          title="Envoyer ma position maintenant"
          variant="outline"
          onPress={envoyerPosition}
          loading={sendingNow}
          disabled={!agent}
        />
        <Text style={styles.hint}>
          Envoi ponctuel, valable à toute heure : pour signaler votre position hors tournée, ou
          vérifier que le back-office vous reçoit.
        </Text>
      </Card>

      {/* Diagnostic : rendre visible une coupure silencieuse du service. */}
      <Card>
        <SectionTitle>État du suivi</SectionTitle>

        <View style={styles.ligne}>
          <Text style={styles.ligneLabel}>Dernier point transmis</Text>
          <Text style={styles.ligneValeur}>
            {sante?.dernierEnvoi ? formatDateTime(sante.dernierEnvoi.toISOString()) : 'Aucun'}
          </Text>
        </View>

        {sante?.silenceMinutes !== null && sante?.silenceMinutes !== undefined ? (
          <View style={styles.ligne}>
            <Text style={styles.ligneLabel}>Silence</Text>
            <Text style={styles.ligneValeur}>
              {sante.silenceMinutes < 1 ? "moins d'une minute" : `${sante.silenceMinutes} min`}
            </Text>
          </View>
        ) : null}

        {sante?.source ? (
          <View style={styles.ligne}>
            <Text style={styles.ligneLabel}>Origine</Text>
            <Text style={styles.ligneValeur}>
              {sante.source === 'direct'
                ? 'Application ouverte'
                : sante.source === 'fond'
                  ? 'Arrière-plan'
                  : 'Envoi manuel'}
            </Text>
          </View>
        ) : null}

        {sante?.alerte ? (
          <View style={styles.alerte}>
            <Feather name="alert-triangle" size={16} color={colors.warningDark} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alerteTitre}>Le suivi semble interrompu</Text>
              <Text style={styles.alerteTexte}>
                Aucune position depuis plus de {SEUIL_ALERTE_MINUTES} minutes alors que votre
                tournée est active. Votre téléphone a probablement mis l&apos;application en
                veille. Dans les réglages Android : batterie « Sans restriction », démarrage
                automatique activé, et verrouillez l&apos;application dans les tâches récentes.
              </Text>
            </View>
          </View>
        ) : tracking && sante?.dansLesHeures ? (
          <View style={styles.ok}>
            <Feather name="check-circle" size={15} color={colors.successDark} />
            <Text style={styles.okTexte}>Le suivi transmet normalement.</Text>
          </View>
        ) : null}
      </Card>

      {/* ── File hors ligne ────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>En attente d&apos;envoi</SectionTitle>
        <View style={styles.queueRow}>
          <View style={styles.queueItem}>
            <Text style={styles.queueValue}>{positions}</Text>
            <Text style={styles.queueLabel}>positions</Text>
          </View>
          <View style={styles.queueDivider} />
          <View style={styles.queueItem}>
            <Text style={styles.queueValue}>{transactions}</Text>
            <Text style={styles.queueLabel}>opérations</Text>
          </View>
        </View>
        <Text style={styles.hint}>
          {enAttente === 0
            ? 'Tout est transmis. Rien ne reste stocké sur le téléphone.'
            : 'Conservé hors ligne, sera transmis dès le retour du réseau.'}
        </Text>
        <Button
          title="Synchroniser maintenant"
          variant={enAttente > 0 ? 'primary' : 'outline'}
          onPress={synchroniser}
          loading={syncing}
          disabled={!agent || enAttente === 0}
        />
      </Card>

      {/* ── Sécurité ───────────────────────────────────────────────────── */}
      <Card>
        <SectionTitle>Sécurité</SectionTitle>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Verrouillage automatique</Text>
            <Text style={styles.muted}>
              L&apos;application redemande le code PIN après {lockDelayMin} min sans activité.
            </Text>
          </View>
          <Button title={`${lockDelayMin} min`} variant="outline" onPress={() => setDelaiOpen(true)} />
        </View>
      </Card>

      <Button title="Se déconnecter" variant="ghost" onPress={() => setConfirmSignOut(true)} />

      <Sheet
        visible={delaiOpen}
        title="Délai de verrouillage"
        subtitle="Passé ce délai sans activité, le code PIN est redemandé."
        onClose={() => setDelaiOpen(false)}
      >
        {LOCK_DELAY_CHOICES.map((m) => (
          <SheetOption
            key={m}
            label={`${m} minute${m > 1 ? 's' : ''}`}
            selected={m === lockDelayMin}
            onPress={() => {
              setLockDelay(m);
              setDelaiOpen(false);
            }}
          />
        ))}
      </Sheet>

      <ConfirmSheet
        visible={confirmSignOut}
        title="Se déconnecter"
        message="Vos données locales et le suivi de tournée seront effacés de ce téléphone."
        confirmLabel="Se déconnecter"
        destructive
        onConfirm={() => {
          setConfirmSignOut(false);
          signOut();
        }}
        onCancel={() => setConfirmSignOut(false)}
      />
    </ScrollView>
  );
}

function Ligne({ label, valeur }: { label: string; valeur: string }) {
  return (
    <View style={styles.ligne}>
      <Text style={styles.ligneLabel}>{label}</Text>
      <Text style={styles.ligneValeur}>{valeur}</Text>
    </View>
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
  heroName: { fontFamily: fonts.bold, fontSize: 17, color: colors.onBrand },
  heroMeta: { fontFamily: fonts.regular, fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  heroMono: { color: colors.brandAccent, fontSize: 11 },
  heroWarn: { fontFamily: fonts.regular, fontSize: 12, color: colors.warning },

  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successLight,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  infoText: { flex: 1, fontFamily: fonts.regular, fontSize: 12, color: colors.successDark },

  ligne: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  ligneLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  ligneValeur: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },

  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  muted: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, lineHeight: 18 },
  lastPos: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  queueItem: { flex: 1, alignItems: 'center' },
  queueDivider: { width: 1, height: 28, backgroundColor: colors.border },
  queueValue: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  queueLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted },

  alerte: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  alerteTitre: { fontFamily: fonts.semibold, fontSize: 13, color: colors.warningDark },
  alerteTexte: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.warningDark,
    lineHeight: 17,
    marginTop: 2,
  },
  ok: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  okTexte: { fontFamily: fonts.regular, fontSize: 12, color: colors.successDark },
});
