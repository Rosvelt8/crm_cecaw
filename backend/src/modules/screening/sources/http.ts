/** Téléchargement commun aux sources en ligne. */

const TAILLE_MAX = 150 * 1024 * 1024;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retire d'un texte tout secret connu et tout paramètre « token »/« sig » d'une adresse, avant journalisation ou affichage. */
export function masquer(texte: string, secrets: (string | undefined)[] = []): string {
  let t = texte.replace(/([?&](?:token|sig|signature|key|apikey)=)[^&\s"')]+/gi, '$1***');
  for (const s of secrets) if (s && s.length >= 6) t = t.split(s).join('***');
  return t;
}

/**
 * Télécharge un fichier texte, avec nouvelles tentatives sur les pannes réseau et erreurs serveur.
 * Les redirections sont suivies (l'ONU redirige vers un stockage à signature temporaire).
 * `etiquette` désigne le fichier dans les messages ; l'adresse, qui peut porter un jeton, n'y figure jamais.
 */
export async function telecharger(url: string, etiquette: string, secrets: string[] = []): Promise<string> {
  let derniere: Error = new Error(`${etiquette} : téléchargement impossible`);
  for (let essai = 0; essai < 3; essai++) {
    try {
      const rep = await fetch(url, { signal: AbortSignal.timeout(120_000), headers: { 'User-Agent': 'CECAW-CRM/1.0 (controle-sanctions)' } });
      if (!rep.ok) throw new Error(`${etiquette} : réponse HTTP ${rep.status}`);
      if (/text\/html/i.test(rep.headers.get('content-type') ?? '')) throw new Error(`${etiquette} : réponse inattendue (page HTML au lieu d'un fichier)`);
      const tampon = Buffer.from(await rep.arrayBuffer());
      if (tampon.length > TAILLE_MAX) throw new Error(`${etiquette} : fichier anormalement volumineux`);
      return tampon.toString('utf-8');
    } catch (e) {
      derniere = new Error(masquer((e as Error).message, [url, ...secrets]));
      // Une erreur 4xx (hors 408/429) ne se corrigera pas en réessayant.
      if (/HTTP 4(?!08|29)\d\d/.test(derniere.message)) break;
      if (essai < 2) await pause(2000 * 2 ** essai);
    }
  }
  throw derniere;
}
