import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, Map, ViewAnnotation, type CameraRef } from '@maplibre/maplibre-react-native';
import Feather from '@expo/vector-icons/Feather';
import { colors, fonts, radius, shadow } from '../theme';

/** Fond de carte gratuit, sans clé ni compte (même fournisseur que le back-office). */
const STYLE_CARTE = 'https://tiles.openfreemap.org/styles/liberty';

export type TypePoint = 'visite' | 'client' | 'prospect';

export interface PointCarte {
  /** Identifiant unique sur la carte : « type:id ». */
  cle: string;
  type: TypePoint;
  lat: number;
  lng: number;
  titre: string;
  sousTitre?: string;
  /** Numéro d'ordre affiché sur les visites de la tournée. */
  numero?: number;
  /** Couleur d'état d'une visite (réalisée, manquée, à faire). */
  couleur?: string;
  refId: number;
  telephone?: string | null;
}

export interface Position { lat: number; lng: number }

export interface CarteTerrainRef {
  recentrerSurMoi: () => void;
  cadrerTout: () => void;
}

const COULEUR_TYPE: Record<TypePoint, string> = { visite: colors.brand, client: colors.success, prospect: colors.warning };
const ICONE_TYPE: Record<TypePoint, React.ComponentProps<typeof Feather>['name']> = { visite: 'flag', client: 'user', prospect: 'user-plus' };

/** Pastille d'un point : numérotée pour les visites, avec pictogramme pour clients et prospects. */
function Pastille({ p, actif }: { p: PointCarte; actif: boolean }) {
  const fond = p.couleur ?? COULEUR_TYPE[p.type];
  return (
    <View style={[styles.pastille, { backgroundColor: fond }, actif && styles.pastilleActive]}>
      {p.numero !== undefined ? (
        <Text style={styles.numero}>{p.numero}</Text>
      ) : (
        <Feather name={ICONE_TYPE[p.type]} size={14} color="#fff" />
      )}
    </View>
  );
}

/**
 * Carte MapLibre de l'agent : sa propre position, les visites de la tournée (numérotées) et ses clients et
 * prospects géolocalisés. Un appui sur un point le sélectionne ; la fiche s'ouvre dans l'écran parent.
 */
export default function CarteTerrain({
  points, moi, selection, onSelect, refCarte,
}: {
  points: PointCarte[];
  moi: Position | null;
  selection: string | null;
  onSelect: (p: PointCarte | null) => void;
  refCarte?: React.Ref<CarteTerrainRef>;
}) {
  const camera = useRef<CameraRef>(null);
  const cadre = useRef(false);

  const cadrerTout = useCallback(() => {
    const coords: [number, number][] = points.map((p) => [p.lng, p.lat]);
    if (moi) coords.push([moi.lng, moi.lat]);
    if (coords.length === 0) return;
    if (coords.length === 1) { camera.current?.flyTo({ center: coords[0], zoom: 15, duration: 600 }); return; }
    const lngs = coords.map((c) => c[0]); const lats = coords.map((c) => c[1]);
    camera.current?.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], { padding: { top: 60, right: 50, bottom: 60, left: 50 }, duration: 700 });
  }, [points, moi]);

  const recentrerSurMoi = useCallback(() => {
    if (moi) camera.current?.flyTo({ center: [moi.lng, moi.lat], zoom: 16, duration: 600 });
  }, [moi]);

  useImperativeHandle(refCarte, () => ({ recentrerSurMoi, cadrerTout }), [recentrerSurMoi, cadrerTout]);

  // Premier cadrage dès que des éléments sont connus : l'agent voit tout, sans manipulation.
  useEffect(() => {
    if (cadre.current) return;
    if (points.length > 0 || moi) { cadre.current = true; setTimeout(cadrerTout, 400); }
  }, [points, moi, cadrerTout]);

  return (
    <View style={styles.conteneur}>
      <Map style={StyleSheet.absoluteFill} mapStyle={STYLE_CARTE} compass attribution logo={false} onPress={() => onSelect(null)}>
        <Camera ref={camera} initialViewState={{ center: moi ? [moi.lng, moi.lat] : [9.7, 4.05], zoom: 12 }} />
        {points.map((p) => (
          <ViewAnnotation key={p.cle} id={p.cle} lngLat={[p.lng, p.lat]} anchor="center" onPress={() => onSelect(p)}>
            <Pastille p={p} actif={selection === p.cle} />
          </ViewAnnotation>
        ))}
        {moi ? (
          <ViewAnnotation id="moi" lngLat={[moi.lng, moi.lat]} anchor="center">
            <View style={styles.moiHalo}><View style={styles.moiPoint} /></View>
          </ViewAnnotation>
        ) : null}
      </Map>

      <View style={styles.boutons}>
        <Pressable style={styles.bouton} onPress={cadrerTout} accessibilityLabel="Tout voir"><Feather name="maximize" size={18} color={colors.text} /></Pressable>
        <Pressable style={[styles.bouton, !moi && { opacity: 0.4 }]} onPress={recentrerSurMoi} disabled={!moi} accessibilityLabel="Me localiser"><Feather name="crosshair" size={18} color={colors.text} /></Pressable>
      </View>

      <View style={styles.legende}>
        <Legende couleur={colors.brand} libelle="Visites" />
        <Legende couleur={colors.success} libelle="Clients" />
        <Legende couleur={colors.warning} libelle="Prospects" />
        <Legende couleur="#2563eb" libelle="Moi" />
      </View>
    </View>
  );
}

function Legende({ couleur, libelle }: { couleur: string; libelle: string }) {
  return (
    <View style={styles.legendeItem}>
      <View style={[styles.legendePoint, { backgroundColor: couleur }]} />
      <Text style={styles.legendeTexte}>{libelle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: { flex: 1, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  pastille: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#fff', ...shadow.raised },
  pastilleActive: { width: 38, height: 38, borderRadius: 19, borderWidth: 3 },
  numero: { color: '#fff', fontFamily: fonts.bold, fontSize: 13 },
  moiHalo: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(37,99,235,0.22)', alignItems: 'center', justifyContent: 'center' },
  moiPoint: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#2563eb', borderWidth: 3, borderColor: '#fff' },
  boutons: { position: 'absolute', right: 10, top: 10, gap: 8 },
  bouton: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.raised },
  legende: { position: 'absolute', left: 10, top: 10, flexDirection: 'row', flexWrap: 'wrap', maxWidth: '70%', gap: 8, backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.md },
  legendeItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendePoint: { width: 9, height: 9, borderRadius: 5 },
  legendeTexte: { fontFamily: fonts.medium, fontSize: 10, color: colors.textSoft },
});
