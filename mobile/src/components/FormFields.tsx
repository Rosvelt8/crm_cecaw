import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Sheet, SheetOption } from './Modal';
import { colors, fonts, radius, spacing } from '../theme';

export interface Option<T extends string | number> {
  value: T;
  label: string;
  description?: string;
}

/**
 * Liste deroulante ouvrant une feuille modale.
 *
 * React Native n'a pas de `<select>` : le `Picker` natif rend differemment sur
 * chaque plateforme et ne se met pas aux couleurs de la marque. Une feuille
 * offre en prime la recherche, indispensable des que la liste s'allonge.
 */
export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choisir...',
  error,
  required = false,
  clearable = false,
}: {
  label: string;
  value: T | '' | null;
  options: Option<T>[];
  onChange: (value: T | '') => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value],
  );

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>

      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.control, error ? styles.controlError : null]}
      >
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Feather name="chevron-down" size={17} color={colors.mutedLight} />
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        {clearable ? (
          <SheetOption
            label={placeholder}
            selected={!selected}
            onPress={() => {
              onChange('');
              setOpen(false);
            }}
          />
        ) : null}
        {options.map((o) => (
          <SheetOption
            key={String(o.value)}
            label={o.label}
            description={o.description}
            selected={String(o.value) === String(value)}
            onPress={() => {
              onChange(o.value);
              setOpen(false);
            }}
          />
        ))}
      </Sheet>
    </View>
  );
}

/**
 * Champ date au format YYYY-MM-DD, saisi par trois zones distinctes.
 *
 * On evite `DateTimePicker` : c'est un module natif de plus a installer et a
 * maintenir, alors que trois nombres suffisent et restent rapides a saisir sur
 * le terrain.
 */
export function DateField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const [j, m, a] = useMemo(() => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
    return match ? [match[3], match[2], match[1]] : ['', '', ''];
  }, [value]);

  const compose = (jour: string, mois: string, annee: string) => {
    if (jour.length === 2 && mois.length === 2 && annee.length === 4) {
      onChange(`${annee}-${mois}-${jour}`);
    } else if (!jour && !mois && !annee) {
      onChange('');
    }
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dateRow}>
        <DatePart placeholder="JJ" max={2} value={j} onChange={(v) => compose(v, m, a)} />
        <Text style={styles.sep}>/</Text>
        <DatePart placeholder="MM" max={2} value={m} onChange={(v) => compose(j, v, a)} />
        <Text style={styles.sep}>/</Text>
        <DatePart placeholder="AAAA" max={4} value={a} onChange={(v) => compose(j, m, v)} wide />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function DatePart({
  placeholder,
  value,
  max,
  onChange,
  wide = false,
}: {
  placeholder: string;
  value: string;
  max: number;
  onChange: (v: string) => void;
  wide?: boolean;
}) {
  // `TextInput` importe ici pour garder le composant local a ce fichier.
  const { TextInput } = require('react-native') as typeof import('react-native');
  return (
    <TextInput
      value={value}
      onChangeText={(v: string) => onChange(v.replace(/[^0-9]/g, '').slice(0, max))}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedLight}
      keyboardType="number-pad"
      style={[styles.datePart, wide && { flex: 1.6 }]}
    />
  );
}

/** Titre de sous-groupe a l'interieur d'un formulaire long. */
export function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.groupTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSoft },
  required: { color: colors.danger },
  control: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  controlError: { borderColor: colors.danger, backgroundColor: colors.dangerLight },
  value: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.text },
  placeholder: { color: colors.mutedLight },
  error: { color: colors.danger, fontSize: 12, fontFamily: fonts.regular },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  datePart: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  sep: { color: colors.mutedLight, fontFamily: fonts.regular },

  groupTitle: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.brandDark,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
