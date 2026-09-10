import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { colors, fonts, radius, shadow, spacing } from '../theme';

/** Logo CECAW, identique a celui du back-office. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/logo.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityLabel="Cecaw Finance"
    />
  );
}

/** En-tete de marque : logo, nom, et sous-titre optionnel. */
export function BrandHeader({ subtitle, light = false }: { subtitle?: string; light?: boolean }) {
  return (
    <View style={styles.brandHeader}>
      <Logo size={52} />
      <Text style={[styles.brandName, light && { color: colors.onBrand }]}>CECAW FINANCE</Text>
      {subtitle ? (
        <Text style={[styles.brandSubtitle, light && { color: 'rgba(255,255,255,0.75)' }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}) {
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

/** Titre de section, avec un filet or discret comme sur le web. */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionAccent} />
      <Text style={styles.sectionTitle}>{children}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const inactive = disabled || loading;
  const isFilled = variant === 'primary' || variant === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'outline' && styles.buttonOutline,
        variant === 'ghost' && styles.buttonGhost,
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isFilled ? colors.onBrand : colors.brand} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            !isFilled && { color: variant === 'ghost' ? colors.muted : colors.brand },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  hint,
  mono = false,
  ...props
}: TextInputProps & { label: string; error?: string; hint?: string; mono?: boolean }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.mutedLight}
        style={[
          styles.input,
          mono && { fontFamily: fonts.mono },
          error ? styles.inputError : null,
        ]}
        {...props}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.hintText}>{hint}</Text> : null}
    </View>
  );
}

type Tone = 'brand' | 'muted' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  brand: { bg: colors.brandLight, fg: colors.brandDark },
  muted: { bg: colors.surfaceAlt, fg: colors.muted },
  success: { bg: colors.successLight, fg: colors.successDark },
  warning: { bg: colors.warningLight, fg: colors.warningDark },
  danger: { bg: colors.dangerLight, fg: colors.dangerDark },
};

export function Badge({ label, tone = 'muted' }: { label: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/** Pastille ronde avec les initiales, reprise du back-office. */
export function Avatar({ initials, size = 44 }: { initials: string; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{initials}</Text>
    </View>
  );
}

/** Valeur alignee en chiffres tabulaires : montants, matricules, compteurs. */
export function Mono({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.mono, style]}>{children}</Text>;
}

export function Loading({ label = 'Chargement...' }: { label?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.brand} size="large" />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.centered}>
      <View style={styles.emptyMark}>
        <Logo size={34} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.muted}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <View style={styles.errorNote}>
      <View style={styles.errorBar} />
      <Text style={styles.errorNoteText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brandHeader: { alignItems: 'center', gap: spacing.sm },
  brandName: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: 1.5,
    color: colors.brandDark,
  },
  brandSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardPadded: { padding: spacing.md, gap: spacing.sm },

  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionAccent: {
    width: 3,
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.brand,
  },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },

  button: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  buttonPrimary: { backgroundColor: colors.brand, ...shadow.card },
  buttonDanger: { backgroundColor: colors.danger },
  buttonOutline: { borderWidth: 1.5, borderColor: colors.brand, backgroundColor: colors.surface },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  buttonText: { color: colors.onBrand, fontSize: 15, fontFamily: fonts.semibold },

  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSoft },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerLight },
  errorText: { color: colors.danger, fontSize: 12, fontFamily: fonts.regular },
  hintText: { color: colors.mutedLight, fontSize: 12, fontFamily: fonts.regular },

  badge: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontFamily: fonts.semibold, letterSpacing: 0.2 },

  avatar: {
    backgroundColor: colors.brandLight,
    borderWidth: 1.5,
    borderColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.brandDark, fontFamily: fonts.bold },

  mono: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSoft },

  centered: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyMark: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: 'center',
    lineHeight: 19,
  },

  errorNote: {
    flexDirection: 'row',
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  errorBar: { width: 4, backgroundColor: colors.danger },
  errorNoteText: {
    flex: 1,
    color: colors.dangerDark,
    fontSize: 13,
    fontFamily: fonts.regular,
    padding: spacing.sm,
    lineHeight: 18,
  },
});
