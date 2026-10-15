import type { ListeSanction } from '@prisma/client';
import { analyserListe } from '../ofac.parse';
import { telecharger } from './http';
import type { SourceSanctions } from './types';

/** OFAC (États-Unis) : Sanctions List Service, fichiers CSV historiques. */

const URL_OFAC_DEFAUT = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports';
const base = () => (process.env.OFAC_BASE_URL ?? URL_OFAC_DEFAUT).replace(/\/$/, '');

function connecteur(liste: ListeSanction, libelle: string, f: { principal: string; alias: string; adresses: string; commentaires: string }, minimum: number): SourceSanctions {
  return {
    liste, libelle, autorite: 'OFAC (États-Unis)', minimum, configuree: () => true,
    pageOfficielle: 'https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists',
    async recuperer() {
      const [principal, alias, adresses] = await Promise.all([f.principal, f.alias, f.adresses].map((n) => telecharger(`${base()}/${n}`, n)));
      // La suite des remarques est un complément : son absence dégrade seulement le détail des remarques longues.
      const commentaires = await telecharger(`${base()}/${f.commentaires}`, f.commentaires).catch(() => '');
      return [principal, alias, adresses, commentaires];
    },
    analyser: ([principal, alias, adresses, commentaires]) => analyserListe({ principal, alias, adresses, commentaires }),
    lienFiche: (e) => `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=${e.uid}`,
  };
}

export const ofacSdn = connecteur('sdn', 'OFAC — SDN (Specially Designated Nationals and Blocked Persons)',
  { principal: 'SDN.CSV', alias: 'ALT.CSV', adresses: 'ADD.CSV', commentaires: 'SDN_COMMENTS.CSV' }, 1000);
export const ofacNonSdn = connecteur('non_sdn', 'OFAC — liste consolidée non-SDN (SSI, NS-PLC, CAPTA…)',
  { principal: 'CONS_PRIM.CSV', alias: 'CONS_ALT.CSV', adresses: 'CONS_ADD.CSV', commentaires: 'CONS_COMMENTS.CSV' }, 50);
