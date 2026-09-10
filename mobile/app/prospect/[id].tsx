import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  Mono,
  SectionTitle,
} from '../../src/components/ui';
import { ConfirmSheet, Sheet, SheetOption } from '../../src/components/Modal';
import {
  ProspectForm,
  formToPayload,
  prospectToForm,
  validateProspect,
  type ProspectFormState,
} from '../../src/components/ProspectForm';
import {
  getProspect,
  removeProspect,
  updateProspect,
  updateProspectStatut,
} from '../../src/api/prospects';
import { listProduits } from '../../src/api/produits';
import { errorMessage } from '../../src/api/client';
import { formatDate } from '../../src/lib/format';
import {
  LABEL_STATUT_PROSPECT,
  TRANSITIONS_PROSPECT,
  type Produit,
  type Prospect,
  type StatutProspect,
} from '../../src/types';
import { colors, fonts, radius, spacing } from '../../src/theme';

const TONE_COLOR: Record<StatutProspect, string> = {
  nouveau: colors.mutedLight,
  contacte: colors.brand,
  interesse: colors.warning,
  negocie: colors.warning,
  converti: colors.success,
  perdu: colors.danger,
};

const TONE: Record<StatutProspect, 'muted' | 'success' | 'warning' | 'danger' | 'brand'> = {
  nouveau: 'muted',
  contacte: 'brand',
  interesse: 'warning',
  negocie: 'warning',
  converti: 'success',
  perdu: 'danger',
};

export default function ProspectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const prospectId = Number(id);

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProspectFormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [statutOpen, setStatutOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(prospectId)) return;
    setError(null);
    try {
      const p = await getProspect(prospectId);
      setProspect(p);
      setForm(prospectToForm(p));
    } catch (e) {
      setError(errorMessage(e, 'Impossible de charger ce prospect.'));
    } finally {
      setLoading(false);
    }
  }, [prospectId]);

  useEffect(() => {
    load();
    listProduits()
      .then(setProduits)
      .catch(() => undefined);
  }, [load]);

  const save = async () => {
    if (!form) return;
    const found = validateProspect(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setError('Certains champs obligatoires sont incomplets.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProspect(prospectId, formToPayload(form));
      await load();
      setEditing(false);
    } catch (e) {
      setError(errorMessage(e, "La modification n'a pas pu être enregistrée."));
    } finally {
      setSaving(false);
    }
  };

  const changeStatut = async (statut: StatutProspect) => {
    setStatutOpen(false);
    setError(null);
    try {
      await updateProspectStatut(prospectId, statut);
      await load();
    } catch (e) {
      setError(errorMessage(e, "Le statut n'a pas pu être modifié."));
    }
  };

  const supprimer = async () => {
    setConfirmDelete(false);
    try {
      await removeProspect(prospectId);
      router.back();
    } catch (e) {
      setError(errorMessage(e, 'Suppression impossible.'));
    }
  };

  if (loading) return <Loading label="Chargement de la fiche..." />;
  if (!prospect || !form) {
    return (
      <View style={{ padding: spacing.md }}>
        {error ? <ErrorNote message={error} /> : <EmptyState title="Prospect introuvable" />}
      </View>
    );
  }

  // Le backend refuse les transitions non prevues : on ne propose que les
  // statuts reellement atteignables depuis le statut courant.
  const transitions = TRANSITIONS_PROSPECT[prospect.statut] ?? [];
  const morale = prospect.typePersonne === 'morale';

  if (editing) {
    return (
      <>
        <ProspectForm
          value={form}
          onChange={setForm}
          produits={produits}
          errors={errors}
          error={error}
          submitLabel="Enregistrer les modifications"
          submitting={saving}
          onSubmit={save}
        />
        <View style={styles.cancelBar}>
          <Button
            title="Annuler"
            variant="ghost"
            onPress={() => {
              setForm(prospectToForm(prospect));
              setErrors({});
              setError(null);
              setEditing(false);
            }}
          />
        </View>
      </>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {error ? <ErrorNote message={error} /> : null}

      <View style={styles.hero}>
        <Avatar initials={`${(prospect.prenom ?? prospect.nom)[0] ?? '?'}${prospect.nom[0] ?? '?'}`} size={58} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.heroName}>
            {`${prospect.prenom ?? ''} ${prospect.nom}`.trim()}
          </Text>
          <Mono style={styles.heroMono}>{prospect.telephone}</Mono>
          <Text style={styles.heroMeta}>
            {morale ? 'Personne morale' : 'Personne physique'}
            {prospect.ville ? ` · ${prospect.ville}` : ''}
          </Text>
        </View>
        <Badge label={LABEL_STATUT_PROSPECT[prospect.statut]} tone={TONE[prospect.statut]} />
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => setEditing(true)}>
          <Feather name="edit-2" size={16} color={colors.brandDark} />
          <Text style={styles.actionText}>Modifier</Text>
        </Pressable>
        <Pressable
          style={[styles.action, transitions.length === 0 && styles.actionDisabled]}
          disabled={transitions.length === 0}
          onPress={() => setStatutOpen(true)}
        >
          <Feather name="flag" size={16} color={colors.brandDark} />
          <Text style={styles.actionText}>Statut</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => setConfirmDelete(true)}>
          <Feather name="trash-2" size={16} color={colors.danger} />
          <Text style={[styles.actionText, { color: colors.danger }]}>Supprimer</Text>
        </Pressable>
      </View>

      {transitions.length === 0 ? (
        <Text style={styles.note}>
          Un prospect converti ne change plus de statut : il est devenu client.
        </Text>
      ) : null}

      <Card>
        <SectionTitle>{morale ? "Identité de l'entreprise" : 'Identité'}</SectionTitle>
        {morale ? (
          <>
            <Info label="Raison sociale" value={prospect.nom} />
            <Info label="Sigle" value={prospect.sigle} />
            <Info label="Forme juridique" value={prospect.formeJuridique} />
            <Info label="RCCM" value={prospect.rccm} mono />
            <Info label="Capital social" value={prospect.capitalSocial} mono />
          </>
        ) : (
          <>
            <Info label="Genre" value={prospect.genre === 'M' ? 'Masculin' : prospect.genre === 'F' ? 'Féminin' : null} />
            <Info label="Date de naissance" value={formatDate(prospect.dateNaissance)} />
            <Info label="Lieu de naissance" value={prospect.lieuNaissance} />
            <Info label="N° CNI" value={prospect.numeroCni} mono />
          </>
        )}
        <Info label="Nationalité" value={prospect.nationalite} />
        <Info label="NUI" value={prospect.nui} mono />
      </Card>

      <Card>
        <SectionTitle>Contact</SectionTitle>
        <Info label="Téléphone secondaire" value={prospect.telephoneSecondaire} mono />
        <Info label="Email" value={prospect.email} />
        <Info label="Adresse" value={prospect.adresse} />
        <Info label="Quartier" value={prospect.quartier} />
        <Info label="Ville" value={prospect.ville} />
      </Card>

      <Card>
        <SectionTitle>Activité</SectionTitle>
        {!morale ? (
          <>
            <Info label="Profession" value={prospect.profession} />
            <Info label="Employeur" value={prospect.employeur} />
            <Info
              label="Situation matrimoniale"
              value={prospect.situationFamiliale || null}
            />
            <Info label="Nombre d'enfants" value={String(prospect.nombreEnfants ?? 0)} />
          </>
        ) : null}
        <Info label="Secteur d'activité" value={prospect.secteurActivite} />
        <Info label="Revenu mensuel" value={prospect.revenuMensuel} mono />
      </Card>

      <Card>
        <SectionTitle>Référent</SectionTitle>
        <Info label="Nom" value={prospect.referentNom} />
        <Info label="Téléphone" value={prospect.referentTelephone} mono />
        <Info label="Relation" value={prospect.referentRelation} />
      </Card>

      <Card>
        <SectionTitle>Suivi commercial</SectionTitle>
        <Info label="Produit d'intérêt" value={prospect.produitInteret?.nom} />
        <Info label="Créé le" value={formatDate(prospect.createdAt)} />
        <Info label="Notes" value={prospect.notes} />
      </Card>

      <Sheet
        visible={statutOpen}
        title="Faire évoluer le statut"
        subtitle={`Actuellement : ${LABEL_STATUT_PROSPECT[prospect.statut]}`}
        onClose={() => setStatutOpen(false)}
      >
        {transitions.map((s) => (
          <SheetOption
            key={s}
            label={LABEL_STATUT_PROSPECT[s]}
            description={s === 'converti' ? 'Crée automatiquement la fiche client' : undefined}
            tone={TONE_COLOR[s]}
            onPress={() => changeStatut(s)}
          />
        ))}
      </Sheet>

      <ConfirmSheet
        visible={confirmDelete}
        title="Supprimer ce prospect"
        message={`La fiche de ${`${prospect.prenom ?? ''} ${prospect.nom}`.trim()} sera définitivement supprimée.`}
        confirmLabel="Supprimer"
        destructive
        onConfirm={supprimer}
        onCancel={() => setConfirmDelete(false)}
      />
    </ScrollView>
  );
}

/** Ligne d'information, masquee quand la valeur est absente. */
function Info({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  if (!value || value === '--') return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      {mono ? (
        <Mono style={styles.infoValue}>{value}</Mono>
      ) : (
        <Text style={styles.infoValue}>{value}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brandDeep,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  heroName: { fontFamily: fonts.bold, fontSize: 18, color: colors.onBrand },
  heroMono: { color: colors.brandAccent, fontSize: 12 },
  heroMeta: { fontFamily: fonts.regular, fontSize: 12, color: 'rgba(255,255,255,0.6)' },

  actions: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flex: 1,
    height: 46,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionDisabled: { opacity: 0.4 },
  actionText: { fontFamily: fonts.medium, fontSize: 13, color: colors.brandDark },
  note: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: -spacing.xs,
  },

  infoRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  infoLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  infoValue: {
    flex: 1.3,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text,
    textAlign: 'right',
  },
  cancelBar: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
