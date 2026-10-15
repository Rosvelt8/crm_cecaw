import type { ListeSanction } from '@prisma/client';
import { ofacNonSdn, ofacSdn } from './ofac';
import { locale } from './locale';
import { onu } from './onu';
import { ue } from './ue';
import type { SourceSanctions } from './types';

/** Registre des sources. Ajouter une source = écrire un connecteur et l'inscrire ici (et dans l'enum `ListeSanction`). */
export const SOURCES: SourceSanctions[] = [ofacSdn, ofacNonSdn, onu, ue, locale];

export const sourceDe = (liste: ListeSanction): SourceSanctions => {
  const s = SOURCES.find((x) => x.liste === liste);
  if (!s) throw new Error(`Source de sanctions inconnue : ${liste}`);
  return s;
};

export type { SourceSanctions } from './types';
