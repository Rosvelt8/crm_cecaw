import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  EMPTY_PROSPECT,
  ProspectForm,
  formToPayload,
  validateProspect,
  type ProspectFormState,
} from '../../src/components/ProspectForm';
import { createProspect } from '../../src/api/prospects';
import { listProduits } from '../../src/api/produits';
import { errorMessage } from '../../src/api/client';
import type { Produit } from '../../src/types';

export default function NouveauProspectScreen() {
  const router = useRouter();
  const [form, setForm] = useState<ProspectFormState>(EMPTY_PROSPECT);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listProduits()
      .then(setProduits)
      .catch(() => undefined);
  }, []);

  const submit = async (position?: { latitude: number; longitude: number }) => {
    const found = validateProspect(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setError('Certains champs obligatoires sont incomplets.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createProspect(formToPayload(form, position));
      router.back();
    } catch (e) {
      setError(errorMessage(e, "Le prospect n'a pas pu être enregistré."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProspectForm
      value={form}
      onChange={setForm}
      produits={produits}
      errors={errors}
      error={error}
      submitLabel="Enregistrer le prospect"
      submitting={saving}
      onSubmit={submit}
      showPosition
    />
  );
}
