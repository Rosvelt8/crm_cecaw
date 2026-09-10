import React from 'react';
import {
  Modal as RNModal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { colors, fonts, radius, shadow, spacing } from '../theme';

/**
 * Feuille modale aux couleurs de CECAW, en remplacement de `Alert.alert`.
 *
 * L'alerte native ne se personnalise pas : ni typographie, ni couleur de
 * marque, et son apparence change d'un fabricant a l'autre. Celle-ci monte
 * depuis le bas, se ferme par le fond ou la croix, et laisse la place a du
 * contenu riche (listes de choix, confirmations, formulaires courts).
 */
export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { height } = useWindowDimensions();

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Fond assombri : un appui a cote ferme, comme attendu sur mobile. */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={[styles.sheet, { maxHeight: height * 0.85 }]}>
        <View style={styles.grabber} />

        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
            <Feather name="x" size={18} color={colors.muted} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    </RNModal>
  );
}

/** Ligne d'option dans une feuille de choix. */
export function SheetOption({
  label,
  description,
  selected = false,
  tone,
  onPress,
}: {
  label: string;
  description?: string;
  selected?: boolean;
  tone?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        pressed && { backgroundColor: colors.brandLight },
      ]}
    >
      {tone ? <View style={[styles.dot, { backgroundColor: tone }]} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionLabel, selected && { color: colors.brandDark }]}>{label}</Text>
        {description ? <Text style={styles.optionDesc}>{description}</Text> : null}
      </View>
      {selected ? <Feather name="check" size={17} color={colors.brand} /> : null}
    </Pressable>
  );
}

/** Confirmation destructive ou engageante, en remplacement d'`Alert`. */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = 'Confirmer',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet visible={visible} title={title} onClose={onCancel}>
      <Text style={styles.message}>{message}</Text>
      <Pressable
        onPress={onConfirm}
        style={({ pressed }) => [
          styles.confirm,
          destructive && { backgroundColor: colors.danger },
          pressed && { opacity: 0.9 },
        ]}
      >
        <Text style={styles.confirmText}>{confirmLabel}</Text>
      </Pressable>
      <Pressable onPress={onCancel} style={styles.cancel}>
        <Text style={styles.cancelText}>Annuler</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.lg,
    ...shadow.raised,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { fontFamily: fonts.bold, fontSize: 17, color: colors.text },
  subtitle: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
  close: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: spacing.md, gap: spacing.xs, paddingBottom: spacing.sm },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  optionLabel: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  optionDesc: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 1 },
  dot: { width: 9, height: 9, borderRadius: radius.full },

  message: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSoft,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  confirm: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.onBrand },
  cancel: { height: 46, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
});
