import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import Feather from '@expo/vector-icons/Feather';
import { Badge, Button, Card, ErrorNote } from '../../src/components/ui';
import CarteTerrain, { type CarteTerrainRef, type PointCarte, type Position } from '../../src/components/CarteTerrain';
import { listClients } from '../../src/api/clients';
import { listProspects } from '../../src/api/prospects';
import { getCurrentPosition } from '../../src/tracking';
import { errorMessage } from '../../src/api/client';
import { demarrerTournee, terminerTournee } from '../../src/api/tournees';
import { flushTerrain, queueTerrain, queuedTerrainCount } from '../../src/lib/queue';
import { chargerTournees, modifierStatutTournee } from '../../src/lib/tournee';
import type { Client, Prospect, TourneeJour, VisiteTournee } from '../../src/types';
import { colors, fonts, radius, spacing } from '../../src/theme';

const TYPE_LABEL = { commerciale: 'Commerciale', collecte: 'Collecte', recouvrement: 'Recouvrement' } as const;
const STATUT_VISITE: Record<string, { label: string; tone: 'muted' | 'success' | 'warning' | 'danger' }> = {
  prevue: { label: 'A faire', tone: 'muted' },
  realisee: { label: 'Realisee', tone: 'success' },
  manquee: { label: 'Manquee', tone: 'danger' },
  annulee: { label: 'Annulee', tone: 'muted' },
};

const COULEUR_VISITE: Record<string, string> = { realisee: colors.success, manquee: colors.danger, annulee: colors.mutedLight };
/** Nombre maximal de clients et de prospects dessinés : au-delà, la carte devient illisible et lente. */
const MAX_CLIENTS = 80;
const MAX_PROSPECTS = 40;

const nombre = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/** Distance approchée en km (suffisante pour classer les points du plus proche au plus lointain). */
const distanceKm = (a: Position, lat: number, lng: number) => {
  const dx = (lng - a.lng) * Math.cos(((lat + a.lat) / 2) * (Math.PI / 180));
  const dy = lat - a.lat;
  return Math.sqrt(dx * dx + dy * dy) * 111.32;
};

export default function TourneeScreen() {
  const router = useRouter();
  const [tournees, setTournees] = useState<TourneeJour[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [horsLigne, setHorsLigne] = useState(false);
  const [enAttente, setEnAttente] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const { height } = useWindowDimensions();
  const carte = useRef<CarteTerrainRef>(null);
  const [moi, setMoi] = useState<Position | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selection, setSelection] = useState<PointCarte | null>(null);
  const [localisation, setLocalisation] = useState<'inconnue' | 'refusee' | 'ok'>('inconnue');

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

  // Position de l'agent, rafraîchie tant que l'écran est visible.
  const localiser = useCallback(async () => {
    const p = await getCurrentPosition();
    if (p) { setMoi({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocalisation('ok'); }
    else setLocalisation((l) => (l === 'ok' ? l : 'refusee'));
  }, []);

  // Clients et prospects à afficher sur la carte : indépendants de la tournée, pour voir son secteur même sans visite prévue.
  const chargerPortefeuille = useCallback(async () => {
    const [c, p] = await Promise.all([listClients().catch(() => [] as Client[]), listProspects().catch(() => [] as Prospect[])]);
    setClients(c);
    setProspects(p);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      void localiser();
      void chargerPortefeuille();
      const t = setInterval(() => { void localiser(); }, 20_000);
      return () => clearInterval(t);
    }, [load, localiser, chargerPortefeuille]),
  );

  const points = useMemo<PointCarte[]>(() => {
    const visites: PointCarte[] = [];
    for (const t of tournees) {
      if (t.statut === 'annulee') continue;
      for (const v of t.visites) {
        const lat = nombre(v.latitude), lng = nombre(v.longitude);
        if (lat === null || lng === null) continue;
        visites.push({ cle: `visite:${v.id}`, type: 'visite', lat, lng, titre: v.libelle, sousTitre: v.adresse ?? undefined, numero: v.ordre, couleur: COULEUR_VISITE[v.statut], refId: v.id });
      }
    }
    // Référence pour classer : l'agent s'il est localisé, sinon le centre de ses visites.
    const ref: Position | null = moi ?? (visites.length ? { lat: visites.reduce((s, p) => s + p.lat, 0) / visites.length, lng: visites.reduce((s, p) => s + p.lng, 0) / visites.length } : null);
    const proches = <T extends { lat: number; lng: number }>(liste: T[], max: number) =>
      (ref ? [...liste].sort((a, b) => distanceKm(ref, a.lat, a.lng) - distanceKm(ref, b.lat, b.lng)) : liste).slice(0, max);
    const cl: PointCarte[] = [];
    for (const c of clients) {
      const lat = nombre(c.latitude), lng = nombre(c.longitude);
      if (lat === null || lng === null) continue;
      cl.push({ cle: `client:${c.id}`, type: 'client', lat, lng, titre: `${c.prenom ?? ''} ${c.nom}`.trim(), sousTitre: [c.quartier, c.adresse].filter(Boolean).join(' · ') || undefined, refId: c.id, telephone: c.telephone });
    }
    const pr: PointCarte[] = [];
    for (const p of prospects) {
      const lat = nombre(p.latitude), lng = nombre(p.longitude);
      if (lat === null || lng === null) continue;
      pr.push({ cle: `prospect:${p.id}`, type: 'prospect', lat, lng, titre: `${p.prenom ?? ''} ${p.nom}`.trim(), sousTitre: [p.quartier, p.adresse].filter(Boolean).join(' · ') || undefined, refId: p.id, telephone: p.telephone });
    }
    return [...visites, ...proches(cl, MAX_CLIENTS), ...proches(pr, MAX_PROSPECTS)];
  }, [tournees, clients, prospects, moi]);

  const nbClientsGeo = useMemo(() => clients.filter((c) => nombre(c.latitude) !== null).length, [clients]);

  const ouvrirFiche = (p: PointCarte) => {
    if (p.type === 'visite') router.push({ pathname: '/visite/[id]', params: { id: String(p.refId) } });
    else if (p.type === 'client') router.push({ pathname: '/client/[id]', params: { id: String(p.refId) } });
    else router.push({ pathname: '/prospect/[id]', params: { id: String(p.refId) } });
  };
  const itineraire = (p: PointCarte) => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`).catch(() => undefined);

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

  return (
    <View style={styles.screen}>
      <View style={{ height: Math.max(280, Math.round(height * 0.42)) }}>
        <CarteTerrain points={points} moi={moi} selection={selection?.cle ?? null} onSelect={setSelection} refCarte={carte} />
        {selection ? (
          <View style={styles.fiche}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ficheTitre} numberOfLines={1}>{selection.type === 'visite' ? `${selection.numero}. ` : ''}{selection.titre}</Text>
              <Text style={styles.sous} numberOfLines={2}>
                {selection.type === 'visite' ? 'Visite' : selection.type === 'client' ? 'Client' : 'Prospect'}{selection.sousTitre ? ` · ${selection.sousTitre}` : ''}
              </Text>
            </View>
            {selection.telephone ? (
              <Pressable style={styles.ficheBtn} onPress={() => Linking.openURL(`tel:${selection.telephone}`).catch(() => undefined)} accessibilityLabel="Appeler"><Feather name="phone" size={18} color={colors.brandDark} /></Pressable>
            ) : null}
            <Pressable style={styles.ficheBtn} onPress={() => itineraire(selection)} accessibilityLabel="Itinéraire"><Feather name="navigation" size={18} color={colors.brandDark} /></Pressable>
            <Pressable style={[styles.ficheBtn, styles.ficheBtnPrincipal]} onPress={() => ouvrirFiche(selection)} accessibilityLabel="Ouvrir la fiche"><Feather name="chevron-right" size={20} color="#fff" /></Pressable>
          </View>
        ) : null}
      </View>
      <Text style={styles.infoCarte}>
        {localisation === 'refusee' ? 'Localisation indisponible : autorisez-la dans les réglages pour vous voir sur la carte. ' : ''}
        {nbClientsGeo === 0 && clients.length > 0 ? `Aucun de vos ${clients.length} clients n'est géolocalisé. ` : `${points.filter((p) => p.type === 'client').length} client(s)${nbClientsGeo > MAX_CLIENTS ? ` les plus proches sur ${nbClientsGeo}` : ''} sur la carte.`}
      </Text>
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
        ListEmptyComponent={
          <Card style={styles.vide}>
            <Text style={styles.titre}>{loading ? 'Chargement de votre tournée…' : "Aucune tournée aujourd'hui"}</Text>
            {!loading ? <Text style={styles.sous}>Votre responsable planifie vos tournées depuis le back-office. La carte ci-dessus montre malgré tout votre position et vos clients.</Text> : null}
          </Card>
        }
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
  fiche: { position: 'absolute', left: 10, right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  ficheTitre: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  ficheBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  ficheBtnPrincipal: { backgroundColor: colors.brand },
  infoCarte: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  vide: { gap: spacing.xs },
  attente: { fontFamily: fonts.medium, fontSize: 12, color: colors.warningDark, textAlign: 'center', paddingTop: spacing.sm },
});
