/**
 * Générateur PDF minimal, sans dépendance : texte et tableaux en Helvetica, pagination automatique.
 * Suffisant pour les relevés de compte, contrats, échéanciers et reçus ; pas de mise en page libre.
 */

import { deflateSync, inflateSync } from 'zlib';
import { LOGO_CECAW_PNG_BASE64 } from './logoCecaw';

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

/**
 * Décode un PNG 8 bits non entrelacé (gris, RVB, gris+alpha, RVBA) en niveaux de gris + opacité.
 * Le logo est rendu en noir et blanc : les PDF CECAW s'impriment en noir sur blanc.
 */
function decoderPng(png: Buffer): { w: number; h: number; gris: Buffer; alpha: Buffer } {
  let pos = 8, w = 0, h = 0, type = 0;
  const morceaux: Buffer[] = [];
  while (pos < png.length) {
    const len = png.readUInt32BE(pos), nom = png.toString('latin1', pos + 4, pos + 8), corps = png.subarray(pos + 8, pos + 8 + len);
    if (nom === 'IHDR') { w = corps.readUInt32BE(0); h = corps.readUInt32BE(4); type = corps[9]; if (corps[8] !== 8 || corps[12] !== 0) throw new Error('PNG non pris en charge (8 bits non entrelacé requis)'); }
    if (nom === 'IDAT') morceaux.push(corps);
    pos += 12 + len;
  }
  const canaux = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (!canaux) throw new Error('Type de PNG non pris en charge');
  const brut = inflateSync(Buffer.concat(morceaux));
  const ligne = w * canaux, pixels = Buffer.alloc(ligne * h);
  for (let y = 0; y < h; y++) {
    const filtre = brut[y * (ligne + 1)], src = y * (ligne + 1) + 1, dst = y * ligne;
    for (let i = 0; i < ligne; i++) {
      const x = brut[src + i];
      const a = i >= canaux ? pixels[dst + i - canaux] : 0;
      const b = y > 0 ? pixels[dst - ligne + i] : 0;
      const c = i >= canaux && y > 0 ? pixels[dst - ligne + i - canaux] : 0;
      let v: number;
      if (filtre === 0) v = x;
      else if (filtre === 1) v = x + a;
      else if (filtre === 2) v = x + b;
      else if (filtre === 3) v = x + ((a + b) >> 1);
      else { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      pixels[dst + i] = v & 255;
    }
  }
  const gris = Buffer.alloc(w * h), alpha = Buffer.alloc(w * h, 255);
  for (let i = 0; i < w * h; i++) {
    const p = i * canaux;
    gris[i] = canaux <= 2 ? pixels[p] : Math.round(0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2]);
    if (canaux === 2 || canaux === 4) alpha[i] = pixels[p + canaux - 1];
  }
  return { w, h, gris, alpha };
}

let logoCache: ReturnType<typeof decoderPng> | null | undefined;
function logo() {
  if (logoCache === undefined) {
    try { logoCache = decoderPng(Buffer.from(LOGO_CECAW_PNG_BASE64, 'base64')); } catch (e) { console.error('[pdf] logo illisible', e); logoCache = null; }
  }
  return logoCache;
}

export interface ColonnePdf { titre: string; largeur: number; alignement?: 'g' | 'd' }

type Rgb = [number, number, number];
/** Noir sur blanc : tout se lit et s'imprime sans couleur. Seuls des gris servent à hiérarchiser. */
const NUIT: Rgb = [0, 0, 0];
const GRIS: Rgb = [0.38, 0.38, 0.38];
const FILET: Rgb = [0.72, 0.72, 0.72];
const BLANC: Rgb = [1, 1, 1];
const c3 = (c: Rgb) => c.map((v) => v.toFixed(3)).join(' ');

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

  private texte(x: number, y: number, t: string, taille: number, gras = false, couleur?: Rgb, italique = false) {
    const police = gras ? 'F2' : italique ? 'F3' : 'F1';
    this.page.push(`${couleur ? `${c3(couleur)} rg ` : ''}BT /${police} ${taille} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${versWinAnsi(t)}) Tj ET${couleur ? ' 0 g' : ''}`);
  }

  /** Rectangle : `y` est le bord bas. Remplissage et/ou contour. */
  private rect(x: number, y: number, w: number, h: number, fond?: Rgb, contour?: Rgb, epaisseur = 0.6) {
    const op = fond && contour ? 'B' : fond ? 'f' : 'S';
    this.page.push(`${fond ? `${c3(fond)} rg ` : ''}${contour ? `${c3(contour)} RG ${epaisseur} w ` : ''}${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${op} 0 g`);
  }

  private trait(x1: number, y: number, x2: number, couleur: Rgb, epaisseur = 0.5) {
    this.page.push(`${c3(couleur)} RG ${epaisseur} w ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S`);
  }

  /** Mémorise où placer le logo d'en-tête : le dessin se fait à l'assemblage, quand les objets image existent. */
  private logosEntete: { page: number; x: number; y: number; taille: number }[] = [];

  /** En-tête de la première page : logo, raison sociale, type de document, référence et date, filet noir. */
  entete(o: { document: string; reference?: string; date?: string }) {
    const taille = 46, haut = HAUTEUR - MARGE;
    this.logosEntete.push({ page: this.pages.length - 1, x: MARGE, y: haut - taille + 6, taille });
    const x = MARGE + taille + 12;
    this.texte(x, haut - 14, 'CECAW FINANCE S.A', 17, true, NUIT);
    this.texte(x, haut - 32, o.document, 11, false, GRIS);
    const droite = (t: string, y: number, g = false) => this.texte(LARGEUR - MARGE - largeurTexte(t, 9), y, t, 9, g, NUIT);
    if (o.reference) droite(o.reference, haut - 12, true);
    if (o.date) droite(o.date, haut - 26);
    this.trait(MARGE, haut - taille + 2, LARGEUR - MARGE, NUIT, 1.4);
    this.y = haut - taille - 22;
  }

  /** Rangée d'indicateurs clés (libellé + valeur), pour que l'essentiel se lise d'un coup d'œil. */
  indicateurs(items: { libelle: string; valeur: string; detail?: string }[]) {
    const hauteur = 50, ecart = 8;
    this.assurerPlace(hauteur + 14);
    const w = (LARGEUR - 2 * MARGE - ecart * (items.length - 1)) / items.length;
    items.forEach((it, i) => {
      const x = MARGE + i * (w + ecart);
      this.rect(x, this.y - hauteur, w, hauteur, BLANC, NUIT, 0.9);
      this.texte(x + 9, this.y - 14, it.libelle.toUpperCase(), 7, true, GRIS);
      this.texte(x + 9, this.y - 32, it.valeur, 12, true, NUIT);
      if (it.detail) this.texte(x + 9, this.y - 43, it.detail, 7, false, GRIS);
    });
    this.y -= hauteur + 16;
  }

  /** Bloc encadré : titre de section puis paires libellé / valeur sur plusieurs colonnes. */
  bloc(titre: string, paires: [string, string][], colonnes = 2) {
    const lignes = Math.ceil(paires.length / colonnes);
    const hauteurLigne = 28;
    const hauteur = lignes * hauteurLigne + 8;
    this.assurerPlace(hauteur + 28);
    this.texte(MARGE, this.y - 8, titre.toUpperCase(), 9.5, true, NUIT);
    this.y -= 14;
    this.rect(MARGE, this.y - hauteur, LARGEUR - 2 * MARGE, hauteur, undefined, NUIT, 0.8);
    const w = (LARGEUR - 2 * MARGE) / colonnes;
    paires.forEach(([libelle, valeur], i) => {
      const col = i % colonnes, lig = Math.floor(i / colonnes);
      const x = MARGE + col * w + 12;
      const y = this.y - 8 - lig * hauteurLigne;
      this.texte(x, y - 8, libelle.toUpperCase(), 7, true, GRIS);
      let v = valeur;
      while (v.length > 1 && largeurTexte(v, 9.5) > w - 22) v = v.slice(0, -1);
      this.texte(x, y - 20, v, 9.5, false, NUIT);
      if (lig > 0 && col === 0) this.trait(MARGE + 8, y + 2, LARGEUR - MARGE - 8, FILET, 0.4);
    });
    this.y -= hauteur + 16;
  }

  /** Encadré : mise en garde (cadre noir épais, texte gras) ou note (cadre fin, italique). */
  encadre(texte: string, ton: 'alerte' | 'note' = 'note') {
    const taille = 8.5, maxLargeur = LARGEUR - 2 * MARGE - 24;
    const lignes: string[] = [];
    let courant = ton === 'alerte' ? 'ATTENTION : ' : '';
    for (const mot of texte.split(' ')) {
      const essai = courant ? `${courant}${courant.endsWith(' ') ? '' : ' '}${mot}` : mot;
      if (largeurTexte(essai, taille) > maxLargeur && courant.trim()) { lignes.push(courant); courant = mot; } else courant = essai;
    }
    if (courant) lignes.push(courant);
    const hauteur = lignes.length * 12 + 14;
    this.assurerPlace(hauteur + 10);
    this.rect(MARGE, this.y - hauteur, LARGEUR - 2 * MARGE, hauteur, BLANC, ton === 'alerte' ? NUIT : FILET, ton === 'alerte' ? 1.6 : 0.6);
    lignes.forEach((l, i) => this.texte(MARGE + 12, this.y - 16 - i * 12, l, taille, ton === 'alerte', ton === 'alerte' ? NUIT : GRIS, ton === 'note'));
    this.y -= hauteur + 12;
  }

  titre(t: string) {
    this.assurerPlace(30);
    this.texte(MARGE, this.y, t, 16, true);
    this.y -= 12;
    this.page.push(`0 G 1.2 w ${MARGE} ${this.y} m ${LARGEUR - MARGE} ${this.y} l S`);
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

  tableau(colonnes: ColonnePdf[], lignes: string[][], totaux?: string[]) {
    const total = colonnes.reduce((s, c) => s + c.largeur, 0);
    const echelle = (LARGEUR - 2 * MARGE) / total;
    const largeurTable = LARGEUR - 2 * MARGE;
    type Style = 'entete' | 'ligne' | 'total';
    const tracerLigne = (cells: string[], style: Style) => {
      this.assurerPlace(18);
      const haut = style === 'entete' ? 18 : 16;
      const bas = this.y - 5;
      if (style === 'entete') { this.trait(MARGE, bas + haut, MARGE + largeurTable, NUIT, 1.2); this.trait(MARGE, bas, MARGE + largeurTable, NUIT, 0.8); }
      else if (style === 'total') { this.trait(MARGE, bas + haut, MARGE + largeurTable, NUIT, 1); this.trait(MARGE, bas, MARGE + largeurTable, NUIT, 1.6); }
      else this.trait(MARGE, bas, MARGE + largeurTable, FILET, 0.3);
      let x = MARGE;
      colonnes.forEach((c, i) => {
        const w = c.largeur * echelle;
        let t = cells[i] ?? '';
        // Tronque plutôt que de déborder sur la colonne voisine.
        while (t.length > 1 && largeurTexte(t, 8.5) > w - 8) t = t.slice(0, -1);
        const dx = c.alignement === 'd' ? x + w - 5 - largeurTexte(t, 8.5) : x + 5;
        this.texte(dx, this.y, t, 8.5, style !== 'ligne', NUIT);
        x += w;
      });
      this.y -= haut;
    };
    tracerLigne(colonnes.map((c) => c.titre), 'entete');
    lignes.forEach((l) => {
      // En-tête répété quand un tableau chevauche une nouvelle page.
      if (this.y - 18 < MARGE + 20) { this.nouvellePage(); tracerLigne(colonnes.map((c) => c.titre), 'entete'); }
      tracerLigne(l, 'ligne');
    });
    if (totaux) tracerLigne(totaux, 'total');
    this.y -= 6;
  }

  build(): Buffer {
    const objets: string[] = [];
    const ajouter = (contenu: string) => { objets.push(contenu); return objets.length; };

    // Objets 1 à 3 : catalogue, arborescence des pages, puis polices ; les pages suivent.
    ajouter('<< /Type /Catalog /Pages 2 0 R >>');
    ajouter('__PAGES__');
    const f1 = ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const f3 = ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
    // Logo : image en niveaux de gris + masque d'opacité ; réutilisée en filigrane et dans l'en-tête.
    const lg = logo();
    let ressourcesImage = '';
    if (lg) {
      const objetImage = (d: Buffer, extra: string) => {
        const z = deflateSync(d);
        return `<< /Type /XObject /Subtype /Image /Width ${lg.w} /Height ${lg.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode ${extra}/Length ${z.length} >>\nstream\n${z.toString('latin1')}\nendstream`;
      };
      const masque = ajouter(objetImage(lg.alpha, ''));
      const image = ajouter(objetImage(lg.gris, `/SMask ${masque} 0 R `));
      const etat = ajouter('<< /Type /ExtGState /ca 0.07 /CA 0.07 >>');
      ressourcesImage = `/XObject << /Im1 ${image} 0 R >> /ExtGState << /GS1 ${etat} 0 R >> `;
    }
    const infos = ajouter(`<< /Title (${versWinAnsi(this.nomDocument)}) /Producer (CECAW Finance 360) >>`);

    const idsPages: number[] = [];
    const total = this.pages.length;
    this.pages.forEach((commandes, i) => {
      const droite = `Page ${i + 1} / ${total}`;
      const pied = [
        `${c3(NUIT)} RG 0.6 w ${MARGE} 42 m ${LARGEUR - MARGE} 42 l S`,
        `${c3(GRIS)} rg BT /F1 7.5 Tf ${MARGE} 29 Td (${versWinAnsi(`CECAW FINANCE S.A  -  ${this.nomDocument}`)}) Tj ET`,
        `BT /F1 7.5 Tf ${(LARGEUR - MARGE - largeurTexte(droite, 7.5)).toFixed(2)} 29 Td (${versWinAnsi(droite)}) Tj ET 0 g`,
      ].join('\n');
      // Filigrane : logo centré, très pâle, sous le contenu ; logo net dans l'en-tête de la première page.
      const taille = 330;
      const filigrane = lg ? `q /GS1 gs ${taille} 0 0 ${taille} ${((LARGEUR - taille) / 2).toFixed(2)} ${((HAUTEUR - taille) / 2).toFixed(2)} cm /Im1 Do Q` : '';
      const entetes = lg ? this.logosEntete.filter((l) => l.page === i).map((l) => `q ${l.taille} 0 0 ${l.taille} ${l.x.toFixed(2)} ${l.y.toFixed(2)} cm /Im1 Do Q`) : [];
      const flux = [filigrane, ...entetes, ...commandes, pied].filter(Boolean).join('\n');
      const idContenu = ajouter(`<< /Length ${Buffer.byteLength(flux, 'latin1')} >>\nstream\n${flux}\nendstream`);
      idsPages.push(ajouter(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGEUR} ${HAUTEUR}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R >> ${ressourcesImage}>> /Contents ${idContenu} 0 R >>`));
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

/** Montant du tableau : toujours deux décimales, pour que les colonnes s'alignent. */
export const nombrePdf = (n: number | string) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n)).replace(/[\u202f\u00a0]/g, ' ');

/** Montant entier arrondi, pour les indicateurs : « 1 119 441 FCFA ». */
export const montantArrondiPdf = (n: number | string) =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(Number(n))).replace(/[\u202f\u00a0]/g, ' ')} FCFA`;
