'use client';
/* eslint-disable react/no-unescaped-entities -- texte français : les apostrophes sont légitimes dans le JSX */

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { fcfa } from '@/components/ui/kpi';

type Fiche = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const GENRE: Record<string, string> = { M: 'Homme', F: 'Femme', VIDE: '' };
const dateOuVide = (v: unknown) => (v ? formatDate(v as string) : '');

/** Lecture complète de la fiche du client ou du prospect, telle qu'enregistrée : base de comparaison du contrôleur. */
export default function FichePersonne({ type, fiche }: { type: 'client' | 'prospect'; fiche: Fiche }) {
  const morale = fiche.typePersonne === 'morale';
  const sections: { titre: string; champs: [string, unknown][] }[] = [
    { titre: 'Identité', champs: morale ? [
      ['Raison sociale', fiche.nom], ['Sigle', fiche.sigle], ['Forme juridique', fiche.formeJuridique], ['RCCM', fiche.rccm], ['NUI', fiche.nui], ['Capital social', fiche.capitalSocial],
    ] : [
      ['Nom', fiche.nom], ['Prénom', fiche.prenom], ['Genre', GENRE[fiche.genre] ?? fiche.genre], ['Date de naissance', dateOuVide(fiche.dateNaissance)], ['Lieu de naissance', fiche.lieuNaissance],
      ['Nationalité', fiche.nationalite], ['N° de pièce (CNI)', fiche.numeroCni], ['NUI', fiche.nui], ['Situation familiale', fiche.situationFamiliale === 'VIDE' ? '' : fiche.situationFamiliale], ['Enfants à charge', fiche.nombreEnfants],
    ] },
    { titre: 'Coordonnées', champs: [
      ['Téléphone', fiche.telephone], ['Téléphone secondaire', fiche.telephoneSecondaire], ['E-mail', fiche.email], ['Adresse', fiche.adresse], ['Quartier', fiche.quartier], ['Ville', fiche.ville],
      ['Géolocalisation du domicile', fiche.latitude != null ? `${Number(fiche.latitude).toFixed(5)}, ${Number(fiche.longitude).toFixed(5)}` : ''],
    ] },
    { titre: 'Activité et revenus', champs: [
      ['Profession', fiche.profession], ['Employeur', fiche.employeur], ["Secteur d'activité", fiche.secteurActivite],
      ['Revenus mensuels', fiche.revenusMensuels != null ? fcfa(Number(fiche.revenusMensuels)) : ''], ['Charges mensuelles', fiche.chargesMensuelles != null ? fcfa(Number(fiche.chargesMensuelles)) : ''],
      ["Ancienneté de l'activité", fiche.ancienneteActiviteMois != null ? `${fiche.ancienneteActiviteMois} mois` : ''],
      ["Localisation de l'activité", fiche.latitudeActivite != null ? `${Number(fiche.latitudeActivite).toFixed(5)}, ${Number(fiche.longitudeActivite).toFixed(5)}` : ''],
    ] },
    { titre: 'Personne de référence', champs: [['Nom', fiche.referentNom], ['Téléphone', fiche.referentTelephone], ['Lien', fiche.referentRelation]] },
    { titre: 'Rattachement', champs: [
      ['Agence', fiche.agence?.nom], ['Commercial', fiche.commercial ? `${fiche.commercial.prenom} ${fiche.commercial.nom}` : ''], ['Zone', fiche.zone?.nom],
      ['Créée le', dateOuVide(fiche.createdAt)], ['Modifiée le', dateOuVide(fiche.updatedAt)],
    ] },
  ];
  const lien = type === 'client' ? `/dashboard/marketing/clients/${fiche.id}` : `/dashboard/prospects/${fiche.id}/modifier`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Fiche {type === 'client' ? 'du client' : 'du prospect'} en l'état actuel. Une erreur se corrige sur la fiche, pas dans le dossier.</p>
        <Link href={lien} target="_blank" className="inline-flex shrink-0 items-center gap-1 text-sm text-brand-700 hover:underline">Ouvrir / corriger la fiche<ExternalLink className="h-3.5 w-3.5" /></Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map((sec) => (
          <section key={sec.titre} className="rounded-lg border">
            <h3 className="border-b bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sec.titre}</h3>
            <dl className="divide-y text-sm">
              {sec.champs.map(([label, valeur]) => {
                const vide = valeur === null || valeur === undefined || valeur === '';
                return (
                  <div key={label} className="grid grid-cols-5 gap-2 px-3 py-1.5">
                    <dt className="col-span-2 text-muted-foreground">{label}</dt>
                    <dd className={`col-span-3 break-words ${vide ? 'text-red-600/80 italic' : ''}`}>{vide ? 'Non renseigné' : String(valeur)}</dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
