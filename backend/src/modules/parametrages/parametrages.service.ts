import prisma from '../../lib/prisma';
import { ModeAmortissement, TypeProduit } from '@prisma/client';
import { createLog } from '../../lib/logger';
import { JwtPayload } from '../../middleware/auth';
import { ErreurMetier } from '../../lib/rbac';
import { parametrageEnVigueur } from '../credit/credit.service';

export interface CorpsParametrage {
  produit_id: number;
  date_effet: string;
  taux_interet_annuel?: number | null;
  taux_penalite_retard?: number | null;
  taux_remuneration_epargne?: number | null;
  frais_dossier?: number | null;
  frais_dossier_pct?: number | null;
  commission?: number | null;
  montant_min?: number | null;
  montant_max?: number | null;
  duree_min_mois?: number | null;
  duree_max_mois?: number | null;
  mode_amortissement?: ModeAmortissement | null;
  age_min?: number | null;
  age_max?: number | null;
  anciennete_activite_min_mois?: number | null;
  quotite_cessible_max_pct?: number | null;
  conditions_eligibilite?: unknown;
}

export const lister = (produitId: number) =>
  prisma.parametrageProduit.findMany({
    where: { produitId },
    orderBy: { dateEffet: 'desc' },
    include: { creePar: { select: { id: true, prenom: true, nom: true } } },
  });

export const enVigueur = (produitId: number) => parametrageEnVigueur(produitId);

/**
 * Crée une nouvelle version du paramétrage. La version précédente est close la
 * veille de la date d'effet : les crédits déjà accordés gardent le paramétrage
 * sous lequel ils ont été montés, seuls les nouveaux dossiers voient le nouveau.
 */
export async function creer(actor: JwtPayload, c: CorpsParametrage) {
  const produit = await prisma.produit.findUnique({ where: { id: c.produit_id } });
  if (!produit) throw new ErreurMetier('Produit introuvable', 404);

  const dateEffet = new Date(c.date_effet);
  if (Number.isNaN(dateEffet.getTime())) throw new ErreurMetier("Date d'effet invalide", 422);
  if (c.montant_min != null && c.montant_max != null && c.montant_min > c.montant_max) throw new ErreurMetier('Le montant minimum dépasse le maximum.', 422);
  if (c.duree_min_mois != null && c.duree_max_mois != null && c.duree_min_mois > c.duree_max_mois) throw new ErreurMetier('La durée minimum dépasse le maximum.', 422);
  if (produit.type === 'credit' && c.taux_interet_annuel == null) throw new ErreurMetier("Le taux d'intérêt est obligatoire pour un produit de crédit.", 422);

  const posterieure = await prisma.parametrageProduit.findFirst({ where: { produitId: c.produit_id, dateEffet: { gte: dateEffet } } });
  if (posterieure) throw new ErreurMetier("Une version existe déjà à cette date ou après : choisissez une date d'effet plus récente.", 409);

  const veille = new Date(dateEffet);
  veille.setUTCDate(veille.getUTCDate() - 1);

  const p = await prisma.$transaction(async (tx) => {
    await tx.parametrageProduit.updateMany({ where: { produitId: c.produit_id, dateFin: null }, data: { dateFin: veille } });
    return tx.parametrageProduit.create({
      data: {
        produitId: c.produit_id, dateEffet, creeParId: actor.sub,
        tauxInteretAnnuel: c.taux_interet_annuel ?? null, tauxPenaliteRetard: c.taux_penalite_retard ?? null,
        tauxRemunerationEpargne: c.taux_remuneration_epargne ?? null, fraisDossier: c.frais_dossier ?? null,
        fraisDossierPct: c.frais_dossier_pct ?? null, commission: c.commission ?? null,
        montantMin: c.montant_min ?? null, montantMax: c.montant_max ?? null,
        dureeMinMois: c.duree_min_mois ?? null, dureeMaxMois: c.duree_max_mois ?? null,
        modeAmortissement: c.mode_amortissement ?? null, ageMin: c.age_min ?? null, ageMax: c.age_max ?? null,
        ancienneteActiviteMinMois: c.anciennete_activite_min_mois ?? null, quotiteCessibleMaxPct: c.quotite_cessible_max_pct ?? null,
        conditionsEligibilite: (c.conditions_eligibilite ?? undefined) as never,
      },
    });
  });

  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'parametres', action: 'CONFIGURE_PRODUIT', entiteType: 'produit', entiteId: c.produit_id,
    description: `Nouveau paramétrage de « ${produit.nom} » à effet du ${c.date_effet}`,
  });
  return p;
}

export async function definirType(actor: JwtPayload, produitId: number, type: TypeProduit) {
  const p = await prisma.produit.update({ where: { id: produitId }, data: { type } });
  await createLog({
    utilisateurId: actor.sub, utilisateurLabel: actor.email, agenceId: actor.agenceId ?? undefined,
    module: 'parametres', action: 'CONFIGURE_PRODUIT', entiteType: 'produit', entiteId: produitId, description: `Type de « ${p.nom} » : ${type}`,
  });
  return p;
}
