import apiClient from '@/lib/axios';

/** Message d'erreur lisible extrait d'une réponse d'API, ou texte par défaut. */
export function msg(e: unknown, defaut = 'Une erreur est survenue'): string {
  const r = e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } }; message?: string };
  const d = r?.response?.data;
  if (d?.errors) {
    const premier = Object.values(d.errors)[0]?.[0];
    if (premier) return premier;
  }
  return d?.message ?? defaut;
}

/** Corps utile d'une réponse `{ success, data }`. */
export const donnees = <T,>(r: { data: { data: T } }) => r.data.data;

/**
 * Télécharge un fichier protégé (PDF, CSV, reçu) avec le jeton de la session, puis l'ouvre ou
 * l'enregistre. Un lien direct échouerait : le navigateur n'y joint pas l'en-tête d'autorisation.
 */
export async function telecharger(chemin: string, nom?: string, ouvrir = false): Promise<void> {
  const r = await apiClient.get(chemin, { responseType: 'blob' });
  const url = URL.createObjectURL(r.data as Blob);
  if (ouvrir) {
    window.open(url, '_blank', 'noopener');
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = nom ?? 'document';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Chemin d'API d'un fichier déposé : `/uploads/x.jpg` (stocké en base) devient `/fichiers/x.jpg`. */
export const cheminFichier = (url: string) => `/fichiers/${url.split('/').pop()}`;
