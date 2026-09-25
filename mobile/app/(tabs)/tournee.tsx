import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import Feather from '@expo/vector-icons/Feather';
import { Badge, Button, Card, EmptyState, ErrorNote, Loading } from '../../src/components/ui';
import { errorMessage } from '../../src/api/client';
import { demarrerTournee, terminerTournee } from '../../src/api/tournees';
import { flushTerrain, queueTerrain, queuedTerrainCount } from '../../src/lib/queue';
import { chargerTournees, modifierStatutTournee } from '../../src/lib/tournee';
import type { TourneeJour, VisiteTournee } from '../../src/types';
import { colors, fonts, radius, spacing } from '../../src/theme';

const TYPE_LABEL = { commerciale: 'Commerciale', collecte: 'Collecte', recouvrement: 'Recouvrement' } as const;
const STATUT_VISITE: Record<string, { label: string; tone: 'muted' | 'success' | 'warning' | 'danger' }> = {
  prevue: { label: 'A faire', tone: 'muted' },
  realisee: { label: 'Realisee', tone: 'success' },
  manquee: { label: 'Manquee', tone: 'danger' },
  annulee: { label: 'Annulee', tone: 'muted' },
};

export default function TourneeScreen() {
  const router = useRouter();
  const [tournees, setTournees] = useState<TourneeJour[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [horsLigne, setHorsLigne] = useState(false);
  const [enAttente, setEnAttente] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setMessage(null);
    // Les saisies faites hors ligne partent d'abord : la lecture qui suit refletera leur effet.
    const bilan = await flushTerrain().catch(() => null);
    if (bilan && (bilan.conflits > 0 || bilan.refusees > 0)) {
      setMessage(
        [
          bilan.conflits ? `${bilan.conflits} saisie(s) en conflit, soumises a votre superviseur.` : '',
          bilan.refusees ? `${bilan.refusees} saisie(s) refusee(s) par le serveur.` : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
    }
    const r = await chargerTournees();
    setTournees(r.tournees);
    setHorsLigne(r.horsLigne);
    setEnAttente(await queuedTerrainCount());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const changerEtat = async (t: TourneeJour, action: 'demarrer' | 'terminer') => {
    const statut = action === 'demarrer' ? 'en_cours' : 'terminee';
    try {
      await (action === 'demarrer' ? demarrerTournee(t.id) : terminerTournee(t.id));
    } catch (e) {
      if ((e as { response?: unknown })?.response) {
        Alert.alert('Action impossible', errorMessage(e));
        return;
      }
      await queueTerrain({ uid: Crypto.randomUUID(), kind: action, tourneeId: t.id });
    }
    await modifierStatutTournee(t.id, statut);
    load();
  };

  if (loading) return <Loading label="Chargement de votre tournee..." />;

  return (
    <View style={styles.screen}>
      {horsLigne ? <ErrorNote message="Hors connexion : derniere tournee connue. Vos saisies seront envoyees au retour du reseau." /> : null}
      {message ? <ErrorNote message={message} /> : null}
      {enAttente > 0 ? <Text style={styles.attente}>{enAttente} operation(s) en attente d&apos;envoi</Text> : null}
      <FlatList
        data={tournees}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          load();
        }}
        ListEmptyComponent={<EmptyState title="Aucune tournee aujourd'hui" hint="Votre responsable planifie vos tournees depuis le back-office." />}
        renderItem={({ item: t }) => (
          <Card style={styles.card}>
            <View style={styles.entete}>
              <View style={{ flex: 1 }}>
                <Text style={styles.titre}>
                  {TYPE_LABEL[t.type]}
                  {t.zone ? ` · ${t.zone.nom}` : ''}
                </Text>
                <Text style={styles.sous}>
                  {t.reference} · {Number(t.distancePrevueKm).toFixed(1)} km · {t.dureePrevueMin} min
                </Text>
              </View>
              <Badge
                label={t.statut === 'en_cours' ? 'En cours' : t.statut === 'terminee' ? 'Terminee' : 'Planifiee'}
                tone={t.statut === 'terminee' ? 'success' : t.statut === 'en_cours' ? 'warning' : 'muted'}
              />
            </View>
            {t.visites.map((v: VisiteTournee) => (
              <Pressable key={v.id} style={styles.visite} onPress={() => router.push({ pathname: '/visite/[id]', params: { id: String(v.id) } })}>
                <View style={styles.ordre}>
                  <Text style={styles.ordreTxt}>{v.ordre}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.visiteTitre} numberOfLines={1}>
                    {v.libelle}
                  </Text>
                  <Text style={styles.sous} numberOfLines={1}>
                    {v.adresse ?? 'Adresse non renseignee'}
                  </Text>
                  {v.arriveeAt ? (
                    <Text style={[styles.sous, { color: v.presenceValidee ? colors.successDark : colors.warningDark }]}>
                      {v.presenceValidee ? 'Presence validee' : 'Arrivee hors zone'}
                    </Text>
                  ) : null}
                </View>
                <Badge label={STATUT_VISITE[v.statut]?.label ?? v.statut} tone={STATUT_VISITE[v.statut]?.tone ?? 'muted'} />
                <Feather name="chevron-right" size={18} color={colors.mutedLight} />
              </Pressable>
            ))}
            {t.statut === 'planifiee' ? <Button title="Demarrer la tournee" onPress={() => changerEtat(t, 'demarrer')} /> : null}
            {t.statut === 'en_cours' ? (
              <Button
                title="Terminer la tournee"
                variant="outline"
                onPress={() => {
                  const restantes = t.visites.filter((v) => v.statut === 'prevue').length;
                  Alert.alert('Terminer la tournee', restantes ? `${restantes} visite(s) ne sont pas cloturees. Terminer quand meme ?` : 'Confirmer la fin de la tournee ?', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Terminer', onPress: () => changerEtat(t, 'terminer') },
                  ]);
                }}
              />
            ) : null}
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.md },
  card: { gap: spacing.sm },
  entete: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titre: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  sous: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  visite: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  ordre: { width: 26, height: 26, borderRadius: radius.full, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  ordreTxt: { fontFamily: fonts.semibold, fontSize: 12, color: colors.brandDark },
  visiteTitre: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  attente: { fontFamily: fonts.medium, fontSize: 12, color: colors.warningDark, textAlign: 'center', paddingTop: spacing.sm },
});
