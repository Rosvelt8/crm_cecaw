import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Badge, Button, Card, ErrorNote, Field, Loading, SectionTitle } from '../../src/components/ui';
import SignaturePad, { Trait } from '../../src/components/SignaturePad';
import { arriveeVisite, clotureVisite, photoVisite } from '../../src/api/tournees';
import { errorMessage } from '../../src/api/client';
import { queueTerrain } from '../../src/lib/queue';
import { modifierVisiteCache, trouverVisite } from '../../src/lib/tournee';
import type { CorpsCloture, VisiteTournee } from '../../src/types';
import { colors, fonts, spacing } from '../../src/theme';

const estRefus = (e: unknown) => Boolean((e as { response?: unknown })?.response);

async function positionCourante(): Promise<{ latitude: number; longitude: number } | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') return null;
  try {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { latitude: p.coords.latitude, longitude: p.coords.longitude };
  } catch {
    return null;
  }
}

export default function VisiteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const visiteId = Number(id);
  const router = useRouter();

  const [visite, setVisite] = useState<VisiteTournee | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [nbPhotos, setNbPhotos] = useState(0);
  const [compteRendu, setCompteRendu] = useState('');
  const [nomSignataire, setNomSignataire] = useState('');
  const [traits, setTraits] = useState<Trait[]>([]);
  const [dims, setDims] = useState({ l: 0, h: 160 });
  const [defilement, setDefilement] = useState(true);

  const charger = useCallback(async () => {
    const v = await trouverVisite(visiteId);
    setVisite(v);
    if (v) {
      setNbPhotos(v.photos.length);
      setCompteRendu((c) => c || v.compteRendu || '');
    }
    setLoading(false);
  }, [visiteId]);

  useEffect(() => {
    charger();
  }, [charger]);

  if (loading) return <Loading />;
  if (!visite) return <View style={styles.centre}><Text style={styles.texte}>Visite introuvable dans votre tournee du jour.</Text></View>;

  const cloturee = visite.statut === 'realisee' || visite.statut === 'manquee';

  const arrivee = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const pos = await positionCourante();
      if (!pos) {
        setError('Position indisponible. Autorisez la localisation et reessayez a l\'exterieur.');
        return;
      }
      const effectueLe = new Date().toISOString();
      try {
        const r = await arriveeVisite(visiteId, pos.latitude, pos.longitude, effectueLe);
        if (r.conflit) setInfo('Cette visite a ete modifiee entre-temps : votre saisie est soumise a votre superviseur.');
        const patch = { arriveeAt: effectueLe, presenceValidee: r.presence_validee, distanceCibleM: r.distance_cible_m };
        await modifierVisiteCache(visiteId, patch);
        setVisite({ ...visite, ...patch });
        if (!r.presence_validee) setInfo(`Vous etes a ${r.distance_cible_m ?? '?'} m du lieu prevu (rayon ${r.rayon_m ?? '?'} m) : la presence n'est pas validee.`);
      } catch (e) {
        if (estRefus(e)) throw e;
        await queueTerrain({ uid: Crypto.randomUUID(), kind: 'arrivee', visiteId, latitude: pos.latitude, longitude: pos.longitude, effectueLe });
        const patch = { arriveeAt: effectueLe };
        await modifierVisiteCache(visiteId, patch);
        setVisite({ ...visite, ...patch });
        setInfo('Arrivee enregistree hors ligne : la presence sera controlee a la synchronisation.');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const photo = async () => {
    setBusy(true);
    setError(null);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setError("Autorisez l'appareil photo pour ajouter une preuve de visite.");
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
      if (res.canceled || !res.assets[0]) return;
      const pos = await positionCourante(); // la photo est geolocalisee : elle prouve l'endroit
      const prisLe = new Date().toISOString();
      const uri = res.assets[0].uri;
      try {
        await photoVisite(visiteId, uri, prisLe, pos?.latitude, pos?.longitude);
      } catch (e) {
        if (estRefus(e)) throw e;
        await queueTerrain({ uid: Crypto.randomUUID(), kind: 'photo', visiteId, uri, latitude: pos?.latitude, longitude: pos?.longitude, prisLe });
        setInfo('Photo conservee sur le telephone, elle partira au retour du reseau.');
      }
      setNbPhotos((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cloturer = async (resultat: 'realisee' | 'manquee') => {
    if (resultat === 'realisee' && !visite.arriveeAt) {
      setError("Enregistrez d'abord votre arrivee : la presence sur place est requise.");
      return;
    }
    if (traits.length > 0 && !nomSignataire.trim()) {
      setError('Indiquez le nom du signataire.');
      return;
    }
    setBusy(true);
    setError(null);
    const pos = await positionCourante();
    const corps: CorpsCloture = {
      resultat,
      compte_rendu: compteRendu.trim() || undefined,
      latitude: pos?.latitude,
      longitude: pos?.longitude,
      client_uid: Crypto.randomUUID(),
      base_version: visite.version,
      effectue_le: new Date().toISOString(),
      ...(traits.length > 0 && nomSignataire.trim() ? { signature: { points: traits.slice(0, 200), nom: nomSignataire.trim(), largeur: dims.l || 300, hauteur: dims.h } } : {}),
    };
    try {
      let conflit = false;
      try {
        const r = await clotureVisite(visiteId, corps);
        conflit = r.conflit;
      } catch (e) {
        if (estRefus(e)) throw e;
        await queueTerrain({ uid: corps.client_uid, kind: 'cloture', visiteId, corps });
        Alert.alert('Enregistre hors ligne', 'La cloture de la visite sera transmise au retour du reseau.');
      }
      await modifierVisiteCache(visiteId, { statut: resultat, compteRendu: corps.compte_rendu ?? null });
      if (conflit) Alert.alert('Conflit', "Cette visite a ete modifiee par ailleurs. Votre saisie est conservee et soumise a votre superviseur.");
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" scrollEnabled={defilement}>
      {error ? <ErrorNote message={error} /> : null}
      {info ? <Text style={styles.info}>{info}</Text> : null}

      <Card>
        <Text style={styles.titre}>{visite.libelle}</Text>
        <Text style={styles.texte}>{visite.adresse ?? 'Adresse non renseignee'}</Text>
        {visite.motifPriorite ? <Text style={styles.texte}>Priorite : {visite.motifPriorite}</Text> : null}
        <View style={styles.ligne}>
          <Badge label={cloturee ? (visite.statut === 'realisee' ? 'Realisee' : 'Manquee') : 'A faire'} tone={visite.statut === 'realisee' ? 'success' : visite.statut === 'manquee' ? 'danger' : 'muted'} />
          {visite.arriveeAt ? <Badge label={visite.presenceValidee ? 'Presence validee' : 'Arrivee a controler'} tone={visite.presenceValidee ? 'success' : 'warning'} /> : null}
        </View>
      </Card>

      {cloturee ? (
        <Card>
          <Text style={styles.texte}>Cette visite est cloturee.{visite.compteRendu ? `\n\n${visite.compteRendu}` : ''}</Text>
        </Card>
      ) : (
        <>
          <Card>
            <SectionTitle>Arrivee</SectionTitle>
            <Text style={styles.texte}>Votre position est comparee au lieu de la visite : c&apos;est la preuve de presence.</Text>
            <Button title={visite.arriveeAt ? 'Enregistrer a nouveau mon arrivee' : "Je suis arrive"} onPress={arrivee} loading={busy} variant={visite.arriveeAt ? 'outline' : 'primary'} />
          </Card>

          <Card>
            <SectionTitle>Photo de preuve</SectionTitle>
            <Text style={styles.texte}>{nbPhotos} photo(s) enregistree(s). Chaque photo est geolocalisee et horodatee.</Text>
            <Button title="Prendre une photo" variant="outline" onPress={photo} disabled={busy} />
          </Card>

          <Card>
            <SectionTitle>Compte rendu</SectionTitle>
            <Field label="Ce qui a ete fait ou convenu" value={compteRendu} onChangeText={setCompteRendu} multiline numberOfLines={4} placeholder="Ex. Encaissement effectue, prochain passage jeudi" />
          </Card>

          <Card>
            <SectionTitle>Signature du client</SectionTitle>
            <Field label="Nom du signataire" value={nomSignataire} onChangeText={setNomSignataire} placeholder="Nom et prenom" />
            <SignaturePad
              onChange={(t, l, h) => {
                setTraits(t);
                setDims({ l, h });
              }}
              onDessin={(actif) => setDefilement(!actif)}
            />
          </Card>

          <Button title="Cloturer : visite realisee" onPress={() => cloturer('realisee')} loading={busy} />
          <Button title="Visite manquee (client absent)" variant="danger" onPress={() => cloturer('manquee')} disabled={busy} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  titre: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text },
  texte: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, lineHeight: 19 },
  ligne: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  info: { fontFamily: fonts.medium, fontSize: 12, color: colors.warningDark, backgroundColor: colors.warningLight, padding: spacing.sm, borderRadius: 8 },
});
