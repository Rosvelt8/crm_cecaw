import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../theme';
import { PIN_LENGTH } from '../config';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

/** Marge horizontale reservee autour du pave par les ecrans qui l'affichent. */
const SCREEN_PADDING = 48;

/**
 * Pave numerique dedie au code PIN.
 *
 * On n'utilise pas de `TextInput` : cela evite le clavier systeme, ses
 * suggestions et toute mise en cache du code par un clavier tiers.
 *
 * Les dimensions sont calculees a partir de l'ecran reel : sur un petit
 * telephone, des tailles fixes debordaient sous la zone visible.
 */
export function PinPad({
  value,
  onChange,
  disabled = false,
  light = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Variante sur fond sombre, pour l'ecran de deverrouillage. */
  light?: boolean;
}) {
  const { width, height } = useWindowDimensions();

  const metrics = useMemo(() => {
    // Trois touches par rangee, quatre rangees : la contrainte vient tantot de
    // la largeur, tantot de la hauteur disponible. On prend la plus serree.
    const short = height < 720;
    const gap = short ? 8 : 12;

    const byWidth = (Math.min(width, 420) - SCREEN_PADDING - gap * 2) / 3;
    // On reserve environ 45 % de la hauteur au pave, le reste au titre et aux actions.
    const byHeight = (height * 0.45 - gap * 3) / 4;

    const keyH = Math.max(44, Math.min(64, byHeight));
    const keyW = Math.max(60, Math.min(84, byWidth));

    return {
      gap,
      keyW,
      keyH,
      padWidth: keyW * 3 + gap * 2,
      dot: short ? 12 : 15,
      dotGap: short ? 12 : 16,
      wrapperGap: short ? spacing.md : spacing.xl,
      fontSize: keyH < 52 ? 19 : 22,
    };
  }, [width, height]);

  const press = (key: string) => {
    if (disabled) return;
    if (key === 'del') {
      onChange(value.slice(0, -1));
      return;
    }
    if (!key || value.length >= PIN_LENGTH) return;
    onChange(value + key);
  };

  const dotEmpty = light ? 'rgba(255,255,255,0.35)' : colors.borderStrong;
  const dotFull = light ? colors.brandAccent : colors.brand;
  const keyBg = light ? 'rgba(255,255,255,0.08)' : colors.surface;
  const keyBorder = light ? 'rgba(255,255,255,0.14)' : colors.border;
  const keyColor = light ? colors.onBrand : colors.text;

  return (
    <View style={[styles.wrapper, { gap: metrics.wrapperGap }]}>
      <View style={[styles.dots, { gap: metrics.dotGap }]}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                width: metrics.dot,
                height: metrics.dot,
                borderColor: i < value.length ? dotFull : dotEmpty,
              },
              i < value.length && { backgroundColor: dotFull },
            ]}
          />
        ))}
      </View>

      <View style={[styles.pad, { width: metrics.padWidth, gap: metrics.gap }]}>
        {KEYS.map((key, i) => (
          <Pressable
            key={`${key}-${i}`}
            disabled={disabled || key === ''}
            onPress={() => press(key)}
            accessibilityRole="button"
            accessibilityLabel={key === 'del' ? 'Effacer' : key}
            style={({ pressed }) => [
              styles.key,
              { width: metrics.keyW, height: metrics.keyH },
              { backgroundColor: keyBg, borderColor: keyBorder },
              key === '' && styles.keyHidden,
              pressed &&
                key !== '' && {
                  backgroundColor: light ? 'rgba(229,184,48,0.22)' : colors.brandLight,
                },
            ]}
          >
            <Text style={[styles.keyText, { color: keyColor, fontSize: metrics.fontSize }]}>
              {key === 'del' ? '⌫' : key}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  dots: { flexDirection: 'row' },
  dot: { borderRadius: radius.full, borderWidth: 2 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  key: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyHidden: { backgroundColor: 'transparent', borderColor: 'transparent' },
  keyText: { fontFamily: fonts.medium },
});
