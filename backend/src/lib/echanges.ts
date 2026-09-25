import prisma from './prisma';

/**
 * Journal technique des échanges avec les systèmes externes (TR-09) : référence,
 * statut, code HTTP et durée, sans jamais stocker de secret ni de corps volumineux.
 */

const tronquer = (t: string | undefined, max = 1000) => (t && t.length > max ? `${t.slice(0, max)}…` : t);

/** Retire les valeurs sensibles courantes avant écriture dans le journal. */
export function masquer(texte: string): string {
  return texte
    .replace(/("?(?:password|secret|token|authorization|api[_-]?key)"?\s*[:=]\s*)"?[^",}\s]+"?/gi, '$1"***"')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer ***');
}

export async function journaliser(e: {
  systeme: string; direction: 'sortant' | 'entrant'; reference?: string; statut: 'ok' | 'echec';
  codeHttp?: number; dureeMs?: number; requete?: string; reponse?: string;
}) {
  try {
    await prisma.journalEchange.create({
      data: {
        systeme: e.systeme, direction: e.direction, reference: e.reference ?? null, statut: e.statut,
        codeHttp: e.codeHttp ?? null, dureeMs: e.dureeMs ?? null,
        requete: e.requete ? tronquer(masquer(e.requete)) : null,
        reponse: e.reponse ? tronquer(masquer(e.reponse)) : null,
      },
    });
  } catch {
    // Le journal ne doit jamais faire échouer l'échange qu'il décrit.
  }
}

/** Appel HTTP sortant tracé : délai maximal, journalisation systématique, jamais d'exception. */
export async function appelerSysteme(
  systeme: string,
  url: string,
  init: { method?: string; headers?: Record<string, string>; corps?: string; reference?: string; delaiMs?: number },
): Promise<{ ok: boolean; statut: number | null; corps: string; erreur?: string }> {
  const debut = Date.now();
  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), init.delaiMs ?? 10_000);
  try {
    const r = await fetch(url, { method: init.method ?? 'POST', headers: init.headers, body: init.corps, signal: controleur.signal });
    const texte = await r.text().catch(() => '');
    await journaliser({
      systeme, direction: 'sortant', reference: init.reference, statut: r.ok ? 'ok' : 'echec', codeHttp: r.status,
      dureeMs: Date.now() - debut, requete: init.corps, reponse: texte,
    });
    return { ok: r.ok, statut: r.status, corps: texte };
  } catch (e) {
    const erreur = (e as Error).name === 'AbortError' ? 'Délai dépassé' : (e as Error).message;
    await journaliser({ systeme, direction: 'sortant', reference: init.reference, statut: 'echec', dureeMs: Date.now() - debut, requete: init.corps, reponse: erreur });
    return { ok: false, statut: null, corps: '', erreur };
  } finally {
    clearTimeout(minuterie);
  }
}
