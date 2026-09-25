/**
 * Générateur PDF minimal, sans dépendance : texte et tableaux en Helvetica, pagination automatique.
 * Suffisant pour les relevés de compte, contrats, échéanciers et reçus ; pas de mise en page libre.
 */

const LARGEUR = 595.28;
const HAUTEUR = 841.89;
const MARGE = 48;

/** Largeurs Helvetica (millièmes d'em) pour les caractères courants ; le reste vaut 556. */
const LARGEURS: Record<string, number> = {
  ' ': 278, '.': 278, ',': 278, ':': 278, ';': 278, '-': 333, '/': 278, '(': 333, ')': 333, "'": 191, i: 222, j: 222, l: 222, t: 278, f: 278, I: 278,
  m: 833, w: 722, M: 833, W: 944, '%': 889, '@': 1015,
};
const largeurTexte = (t: string, taille: number) => [...t].reduce((s, c) => s + (LARGEURS[c] ?? 556), 0) * taille / 1000;

/** Convertit en octets WinAnsi (cp1252 ≈ latin-1 pour le français) ; le reste devient « ? ». */
function versWinAnsi(texte: string): string {
  const CP1252: Record<string, number> = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, 'œ': 0x9c, 'Œ': 0x8c };
  let sortie = '';
  for (const c of texte) {
    const code = c.codePointAt(0)!;
    let octet: number;
    if (c === ' ' || c === ' ') octet = 0x20; // espaces insécables des montants formatés
    else if (CP1252[c] !== undefined) octet = CP1252[c];
    else if (code < 256) octet = code;
    else octet = 0x3f;
    if (octet === 0x28 || octet === 0x29 || octet === 0x5c) sortie += '\\' + String.fromCharCode(octet);
    else sortie += String.fromCharCode(octet);
  }
  return sortie;
}

export interface ColonnePdf { titre: string; largeur: number; alignement?: 'g' | 'd' }

export class DocumentPdf {
  private pages: string[][] = [[]];
  private y = HAUTEUR - MARGE;
  private nomDocument: string;

  constructor(titre: string) {
    this.nomDocument = titre;
  }

  private get page() { return this.pages[this.pages.length - 1]; }

  private nouvellePage() {
    this.pages.push([]);
    this.y = HAUTEUR - MARGE;
  }

  private assurerPlace(hauteur: number) {
    if (this.y - hauteur < MARGE + 20) this.nouvellePage();
  }

  private texte(x: number, y: number, t: string, taille: number, gras = false) {
    this.page.push(`BT /${gras ? 'F2' : 'F1'} ${taille} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${versWinAnsi(t)}) Tj ET`);
  }

  titre(t: string) {
    this.assurerPlace(30);
    this.texte(MARGE, this.y, t, 16, true);
    this.y -= 12;
    this.page.push(`0.72 0.53 0.04 RG 1.2 w ${MARGE} ${this.y} m ${LARGEUR - MARGE} ${this.y} l S`);
    this.y -= 18;
  }

  sousTitre(t: string) {
    this.assurerPlace(24);
    this.y -= 6;
    this.texte(MARGE, this.y, t, 11, true);
    this.y -= 16;
  }

  ligne(t: string, taille = 9.5, gras = false) {
    // Coupe aux mots pour rester dans la marge.
    const maxLargeur = LARGEUR - 2 * MARGE;
    let courant = '';
    for (const mot of t.split(' ')) {
      const essai = courant ? `${courant} ${mot}` : mot;
      if (largeurTexte(essai, taille) > maxLargeur && courant) {
        this.assurerPlace(taille + 4);
        this.texte(MARGE, this.y, courant, taille, gras);
        this.y -= taille + 4;
        courant = mot;
      } else courant = essai;
    }
    if (courant) {
      this.assurerPlace(taille + 4);
      this.texte(MARGE, this.y, courant, taille, gras);
      this.y -= taille + 4;
    }
  }

  /** Paire libellé / valeur sur une ligne. */
  champ(libelle: string, valeur: string) {
    this.assurerPlace(14);
    this.texte(MARGE, this.y, `${libelle} :`, 9.5, true);
    this.texte(MARGE + 150, this.y, valeur, 9.5);
    this.y -= 14;
  }

  espace(h = 8) { this.y -= h; }

  tableau(colonnes: ColonnePdf[], lignes: string[][]) {
    const total = colonnes.reduce((s, c) => s + c.largeur, 0);
    const echelle = (LARGEUR - 2 * MARGE) / total;
    const tracerLigne = (cells: string[], gras: boolean, fond: boolean) => {
      this.assurerPlace(16);
      if (fond) this.page.push(`0.94 0.94 0.94 rg ${MARGE} ${this.y - 4} ${LARGEUR - 2 * MARGE} 14 re f 0 g`);
      let x = MARGE;
      colonnes.forEach((c, i) => {
        const w = c.largeur * echelle;
        let t = cells[i] ?? '';
        // Tronque plutôt que de déborder sur la colonne voisine.
        while (t.length > 1 && largeurTexte(t, 8.5) > w - 6) t = t.slice(0, -1);
        const dx = c.alignement === 'd' ? x + w - 3 - largeurTexte(t, 8.5) : x + 3;
        this.texte(dx, this.y, t, 8.5, gras);
        x += w;
      });
      this.y -= 14;
    };
    tracerLigne(colonnes.map((c) => c.titre), true, true);
    lignes.forEach((l, i) => {
      // En-tête répété quand un tableau chevauche une nouvelle page.
      if (this.y - 16 < MARGE + 20) { this.nouvellePage(); tracerLigne(colonnes.map((c) => c.titre), true, true); }
      tracerLigne(l, false, i % 2 === 1);
    });
  }

  build(): Buffer {
    const objets: string[] = [];
    const ajouter = (contenu: string) => { objets.push(contenu); return objets.length; };

    // Objets 1 à 3 : catalogue, arborescence des pages, puis polices ; les pages suivent.
    ajouter('<< /Type /Catalog /Pages 2 0 R >>');
    ajouter('__PAGES__');
    const f1 = ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const infos = ajouter(`<< /Title (${versWinAnsi(this.nomDocument)}) /Producer (CECAW Finance 360) >>`);

    const idsPages: number[] = [];
    const total = this.pages.length;
    this.pages.forEach((commandes, i) => {
      const pied = `BT /F1 8 Tf ${MARGE} 28 Td (${versWinAnsi(`${this.nomDocument}  -  page ${i + 1} / ${total}`)}) Tj ET`;
      const flux = [...commandes, pied].join('\n');
      const idContenu = ajouter(`<< /Length ${Buffer.byteLength(flux, 'latin1')} >>\nstream\n${flux}\nendstream`);
      idsPages.push(ajouter(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGEUR} ${HAUTEUR}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${idContenu} 0 R >>`));
    });
    objets[1] = `<< /Type /Pages /Kids [${idsPages.map((id) => `${id} 0 R`).join(' ')}] /Count ${idsPages.length} >>`;

    let sortie = '%PDF-1.4\n';
    const offsets: number[] = [];
    objets.forEach((o, i) => {
      offsets.push(Buffer.byteLength(sortie, 'latin1'));
      sortie += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = Buffer.byteLength(sortie, 'latin1');
    sortie += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((o) => { sortie += `${String(o).padStart(10, '0')} 00000 n \n`; });
    sortie += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R /Info ${infos} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(sortie, 'latin1');
  }
}

/** Montant lisible : « 1 250 000 FCFA » (espace ordinaire, sûr pour les polices standard). */
export const montantPdf = (n: number | string) =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(n)).replace(/[  ]/g, ' ')} FCFA`;

export const datePdf = (d: Date | string) => new Date(d).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
