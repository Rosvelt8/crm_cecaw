import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';

export type Trait = number[][];

interface Props {
  /** Appele a chaque changement : traits (points [x, y] en pixels) et dimensions de la zone. */
  onChange: (traits: Trait[], largeur: number, hauteur: number) => void;
  /** Permet au parent de figer son defilement pendant le trace. */
  onDessin?: (actif: boolean) => void;
  hauteur?: number;
}

const PAS_MIN = 3; // px : evite d'empiler des points quasi identiques (poids de la signature)

/**
 * Zone de signature au doigt, sans dependance graphique : chaque segment est une petite vue
 * pivotee. Suffisant pour une signature (quelques centaines de points).
 */
export default function SignaturePad({ onChange, onDessin, hauteur = 160 }: Props) {
  const [traits, setTraits] = useState<Trait[]>([]);
  const [largeur, setLargeur] = useState(0);
  const courant = useRef<Trait[]>([]);
  const dims = useRef({ l: 0, h: hauteur });

  const publier = (t: Trait[]) => {
    courant.current = t;
    setTraits(t);
    onChange(t, dims.current.l, dims.current.h);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          onDessin?.(true);
          const { locationX: x, locationY: y } = e.nativeEvent;
          publier([...courant.current, [[Math.round(x), Math.round(y)]]]);
        },
        onPanResponderMove: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          const t = courant.current;
          const dernier = t[t.length - 1];
          if (!dernier) return;
          const p = dernier[dernier.length - 1];
          if (Math.hypot(x - p[0], y - p[1]) < PAS_MIN) return;
          publier([...t.slice(0, -1), [...dernier, [Math.round(x), Math.round(y)]]]);
        },
        onPanResponderRelease: () => onDessin?.(false),
        onPanResponderTerminate: () => onDessin?.(false),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const effacer = () => publier([]);

  return (
    <View>
      <View
        style={[styles.zone, { height: hauteur }]}
        onLayout={(e) => {
          dims.current = { l: Math.round(e.nativeEvent.layout.width), h: hauteur };
          setLargeur(dims.current.l);
        }}
        {...pan.panHandlers}
      >
        {traits.length === 0 ? <Text style={styles.invite}>Signez ici avec le doigt</Text> : null}
        {traits.map((t, i) =>
          t.length === 1 ? (
            <View key={`p${i}`} pointerEvents="none" style={[styles.point, { left: t[0][0] - 1.5, top: t[0][1] - 1.5 }]} />
          ) : (
            t.slice(1).map((q, j) => {
              const p = t[j];
              const dx = q[0] - p[0];
              const dy = q[1] - p[1];
              const l = Math.hypot(dx, dy);
              return (
                <View
                  key={`${i}-${j}`}
                  pointerEvents="none"
                  style={[
                    styles.segment,
                    { width: l + 1, left: (p[0] + q[0]) / 2 - (l + 1) / 2, top: (p[1] + q[1]) / 2 - 1, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] },
                  ]}
                />
              );
            })
          ),
        )}
      </View>
      <View style={styles.pied}>
        <Text style={styles.aide}>{largeur > 0 ? `${traits.length} trait(s)` : ''}</Text>
        <Text style={styles.effacer} onPress={effacer} accessibilityRole="button">
          Effacer
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  invite: { position: 'absolute', alignSelf: 'center', top: '42%', color: colors.mutedLight, fontFamily: fonts.regular, fontSize: 13 },
  segment: { position: 'absolute', height: 2.5, borderRadius: 1.5, backgroundColor: colors.text },
  point: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.text },
  pied: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  aide: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted },
  effacer: { fontFamily: fonts.medium, fontSize: 13, color: colors.brand },
});
