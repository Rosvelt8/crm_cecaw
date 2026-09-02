import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { PIN_LENGTH } from '../config';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

/**
 * Pave numerique dedie au code PIN.
 *
 * On n'utilise pas de `TextInput` : cela evite le clavier systeme, ses
 * suggestions et toute mise en cache du code par le clavier tiers.
 */
export function PinPad({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const press = (key: string) => {
    if (disabled) return;
    if (key === 'del') {
      onChange(value.slice(0, -1));
      return;
    }
    if (!key || value.length >= PIN_LENGTH) return;
    onChange(value + key);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.dots}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.dot, i < value.length && styles.dotFilled]} />
        ))}
      </View>

      <View style={styles.pad}>
        {KEYS.map((key, i) => (
          <Pressable
            key={`${key}-${i}`}
            disabled={disabled || key === ''}
            onPress={() => press(key)}
            accessibilityRole="button"
            accessibilityLabel={key === 'del' ? 'Effacer' : key}
            style={({ pressed }) => [
              styles.key,
              key === '' && styles.keyHidden,
              pressed && key !== '' && styles.keyPressed,
            ]}
          >
            <Text style={styles.keyText}>{key === 'del' ? '<' : key}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xl, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: spacing.md },
  dot: {
    width: 16,
    height: 16,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.brand,
  },
  dotFilled: { backgroundColor: colors.brand },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 260, gap: spacing.md, justifyContent: 'center' },
  key: {
    width: 76,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyHidden: { backgroundColor: 'transparent', borderColor: 'transparent' },
  keyPressed: { backgroundColor: colors.brandLight },
  keyText: { fontSize: 24, fontWeight: '600', color: colors.text },
});
