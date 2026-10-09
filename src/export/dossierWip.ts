// Dossier WIP (travail en cours) pour un concours : un diaporama généré dans le navigateur, sans IA, puis
// converti en Google Slides modifiable. Le contenu se compose à la demande (page d'identité ou du
// personnage, comparaisons référence / résultat, intercalaires, sommaire, recherche documentée) ; la
// fabrication se présente pièce par pièce, rangées en parties (costume, wig, hand props, make-up, divers).
// Règles tirées de l'étude des dossiers de concours : Wiki, [[dossier-wip-cosplay]].
import { type Donnees, type Ligne, bool } from '../modele/schema';
import { ligne, piecesDe, photosDe, etapesDePiece } from '../logique/acces';
import { lireJour, ecartJours } from '../logique/dates';
import { blobPhoto, blobVersDataUrl, dimensions, reduire } from '../store/photos';

export type Partie = 'costume' | 'wig' | 'props' | 'makeup' | 'divers';
export const PARTIES: [Partie, string][] = [['costume', 'Costume'], ['wig', 'Wig'], ['props', 'Hand props'], ['makeup', 'Make-up'], ['divers', 'Divers']];
export const ORIGINES: [string, string][] = [['', 'Non précisée'], ['fait-main', 'Fait main'], ['modifie', 'Acheté puis modifié'], ['achete', 'Acheté'], ['aide', "Fait avec de l'aide"]];

/** Les cases de comparaison référence / résultat, dans l'ordre des dossiers de concours. */
export const VUES: { cle: string; titre: string; vue: string }[] = [
  { cle: 'costume-face', titre: 'Costume', vue: 'face' }, { cle: 'costume-dos', titre: 'Costume', vue: 'dos' }, { cle: 'costume-cote', titre: 'Costume', vue: 'côté' },
  { cle: 'wig-face', titre: 'Wig', vue: 'face' }, { cle: 'wig-cote', titre: 'Wig', vue: 'côté' }, { cle: 'wig-dos', titre: 'Wig', vue: 'dos' },
  { cle: 'makeup-visage', titre: 'Make-up', vue: 'visage' }, { cle: 'makeup-corps', titre: 'Make-up', vue: 'corps' },
  { cle: 'props-1', titre: 'Hand props', vue: '' }, { cle: 'props-2', titre: 'Hand props', vue: '' }, { cle: 'props-3', titre: 'Hand props', vue: '' },
];

/** Ce que l'utilisatrice veut dans le dossier, gardé sur le costume (champ `wip`). */
export interface ReglagesWip {
  identite: boolean; comparaisons: boolean; intercalaires: boolean; sommaire: boolean; recherche: boolean;
  ordre: string[];          // ids des pièces dans l'ordre voulu ('' = photos sans pièce)
  exclues: string[];
  parPage: 2 | 4 | 6;
  paires: Record<string, { ref?: string; res?: string }>; // clé de VUES → ids de photos (drive_id)
}

export function lireReglagesWip(d: Donnees, c: Ligne): ReglagesWip {
  let r: Partial<ReglagesWip> = {};
  try { r = JSON.parse(c.wip || '{}'); } catch { /* réglages illisibles : valeurs par défaut */ }
  const ids = [...piecesDe(d, c.id).map(p => p.id), ''];
  const ordre = [...(r.ordre ?? []).filter(id => ids.includes(id)), ...ids.filter(id => !(r.ordre ?? []).includes(id))];
  return {
    identite: r.identite ?? true, comparaisons: r.comparaisons ?? true, intercalaires: r.intercalaires ?? true,
    sommaire: r.sommaire ?? true, recherche: r.recherche ?? false,
    ordre, exclues: r.exclues ?? [], parPage: r.parPage ?? 4, paires: r.paires ?? {},
  };
}

/** La partie d'une pièce : celle choisie, sinon devinée d'après son nom (perruque, maquillage), sinon « costume ». */
export function partieDe(p: Ligne | undefined): Partie {
  if (!p) return 'divers';
  if (PARTIES.some(([k]) => k === p.partie_wip)) return p.partie_wip as Partie;
  if (/perruque|\bwig\b/i.test(p.nom)) return 'wig';
  if (/maquillage|make-?up/i.test(p.nom)) return 'makeup';
  if (/ombrelle|parapluie|[ée]ventail|\bsac\b|sacoche|panier|baguette|b[âa]ton|sceptre|[ée]p[ée]e|\barme\b|bouclier|\blance\b|\barc\b|\blivre\b|lanterne|\bprops?\b/i.test(p.nom)) return 'props';
  return 'costume';
}

/** Les photos de fabrication d'une pièce (ou, pour '', celles sans pièce), dans l'ordre chronologique. */
export function photosWip(d: Donnees, costumeId: string, pieceId: string): Ligne[] {
  const pieces = piecesDe(d, costumeId);
  return photosDe(d, costumeId)
    .filter(p => bool(p.dans_wip) && p.type !== 'reference')
    .filter(p => (pieceId ? p.piece_id === pieceId : !pieces.some(x => x.id === p.piece_id)))
    .sort((a, b) => (lireJour(a.date) || '').localeCompare(lireJour(b.date) || ''));
}

// ---------- Mise en page ----------

const L = 13.333, H = 7.5; // 16:9, en pouces
const ENCRE = '2B2233', DOUX = '6E6478', FOND = 'FFFFFF', PALE = 'F4F0F8';

interface Image { data: string; w: number; h: number }

async function image(id: string | undefined): Promise<Image | null> {
  if (!id) return null;
  const b = await blobPhoto(id).catch(() => null);
  if (!b) return null;
  const r = await reduire(b, 1600, 0.85); // un dossier ne doit pas peser des centaines de Mo
  const { w, h } = await dimensions(r);
  return { data: (await blobVersDataUrl(r)).replace(/^data:/, ''), w, h };
}

/** Place une image « contenue » dans une boîte, centrée. */
function contenir(img: Image, x: number, y: number, w: number, h: number) {
  const r = Math.min(w / img.w, h / img.h);
  const iw = img.w * r, ih = img.h * r;
  return { data: img.data, x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih };
}

/** La couleur du projet (hsl de l'agenda) en hexadécimal, pour l'accent du dossier. */
export function couleurHex(c: Ligne): string {
  const t = (c.couleur ?? '').trim();
  if (t === 'gris') return '7A7F8F';
  const h = t === '' || Number.isNaN(Number(t)) ? 275 : Number(t), s = 0.62, l = 0.42;
  const f = (n: number) => { const k = (n + h / 30) % 12; const v = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(v * 255).toString(16).padStart(2, '0'); };
  return (f(0) + f(8) + f(4)).toUpperCase();
}

export interface Profil { nom?: string; prenom?: string; pseudo?: string; pays?: string }

/** L'identité de cosplayeur, réglée une fois (table Profil, ligne « moi »). */
export const profilDe = (d: Donnees): Profil => (d.Profil?.moi ?? {}) as Profil;

/** Le plan du dossier, calculé avant de dessiner : il donne aussi les numéros de page du sommaire. */
type Diapo =
  | { t: 'couverture' } | { t: 'identite' } | { t: 'personnage' } | { t: 'sommaire' } | { t: 'recherche' }
  | { t: 'intercalaire'; titre: string } | { t: 'comparaison'; cle: string }
  | { t: 'piece'; pieceId: string; photos: Ligne[]; suite: boolean };

export function planWip(d: Donnees, c: Ligne, r: ReglagesWip): { diapos: Diapo[]; sections: [string, number][] } {
  const diapos: Diapo[] = [{ t: 'couverture' }, r.identite ? { t: 'identite' } : { t: 'personnage' }];
  const sections: [string, number][] = [];
  if (r.sommaire) diapos.push({ t: 'sommaire' });
  const section = (titre: string) => { sections.push([titre, diapos.length + 1]); if (r.intercalaires) diapos.push({ t: 'intercalaire', titre }); };
  if (r.recherche && (c.recherche ?? '').trim()) { sections.push(['Recherches et références', diapos.length + 1]); diapos.push({ t: 'recherche' }); }
  const paires = VUES.filter(v => r.paires[v.cle]?.ref || r.paires[v.cle]?.res);
  if (r.comparaisons && paires.length) {
    section('Images et photos globales');
    for (const v of paires) diapos.push({ t: 'comparaison', cle: v.cle });
  }
  const retenues = r.ordre.filter(id => !r.exclues.includes(id));
  for (const [partie, nom] of PARTIES) {
    const pieces = retenues.filter(id => partieDe(id ? ligne(d, 'Pieces', id) : undefined) === partie);
    const pages: Diapo[] = [];
    for (const id of pieces) {
      const p = id ? ligne(d, 'Pieces', id) : undefined;
      const photos = photosWip(d, c.id, id);
      const texte = !!(p?.materiaux || p?.techniques || p?.patron);
      if (!photos.length && !texte) continue;
      // La première page porte les textes et peu de photos ; les suivantes, des photos seulement.
      const premiere = Math.min(photos.length, r.parPage === 2 ? 2 : 4);
      pages.push({ t: 'piece', pieceId: id, photos: photos.slice(0, premiere), suite: false });
      for (let i = premiere; i < photos.length; i += r.parPage) pages.push({ t: 'piece', pieceId: id, photos: photos.slice(i, i + r.parPage), suite: true });
    }
    if (!pages.length) continue;
    section(`WIP ${nom}`);
    diapos.push(...pages);
  }
  return { diapos, sections };
}

export async function genererWip(d: Donnees, costumeId: string, r: ReglagesWip, profil: Profil, progres?: (texte: string) => void): Promise<Blob> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const c = ligne(d, 'Costumes', costumeId)!;
  const ACCENT = couleurHex(c);
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = `${c.nom} — dossier WIP`;
  pptx.defineSlideMaster({
    title: 'WIP', background: { color: FOND },
    objects: [{ rect: { x: 0, y: 0, w: L, h: 0.12, fill: { color: ACCENT } } }],
    slideNumber: { x: L - 0.9, y: H - 0.45, fontSize: 10, color: DOUX },
  });
  const { diapos, sections } = planWip(d, c, r);
  const ref = await image(c.image_ref);
  const perso = [c.personnage, c.oeuvre].filter(Boolean).join(' — ');
  const titrePage = (s: ReturnType<typeof pptx.addSlide>, t: string) =>
    s.addText(t, { x: 0.5, y: 0.3, w: L - 1, h: 0.7, fontSize: 26, color: ENCRE, bold: true, fit: 'shrink' });

  for (const [n, dia] of diapos.entries()) {
    progres?.(`Page ${n + 1} / ${diapos.length}`);
    const s = pptx.addSlide({ masterName: 'WIP' });
    switch (dia.t) {
      case 'couverture': {
        s.background = { color: ACCENT };
        const w = ref ? 7 : L - 1.6;
        s.addText('DOSSIER DE WORK IN PROGRESS', { x: 0.8, y: 1.6, w, h: 0.6, fontSize: 18, color: 'FFFFFF', bold: true, charSpacing: 2 });
        s.addText(c.nom, { x: 0.8, y: 2.3, w, h: 1.6, fontSize: 44, color: 'FFFFFF', bold: true, fit: 'shrink' });
        if (perso) s.addText(perso, { x: 0.8, y: 4.0, w, h: 0.7, fontSize: 22, color: 'FFFFFF' });
        if (ref) s.addImage(contenir(ref, 8.3, 0.5, 4.5, 6.5));
        break;
      }
      case 'identite': case 'personnage': {
        const lignes = (dia.t === 'identite'
          ? [['Nom du cosplayeur', profil.nom], ['Prénom du cosplayeur', profil.prenom], ['Pseudo du cosplayeur', profil.pseudo], ['Pays', profil.pays], ['', ''], ['Œuvre', c.oeuvre], ['Personnage', c.personnage || c.nom]]
          : [['Personnage', c.personnage || c.nom], ['Œuvre', c.oeuvre]]).filter(([k, v]) => !k || v);
        const texte = lignes.flatMap(([k, v], i) => {
          const fin = i < lignes.length - 1;
          return k ? [{ text: `${k} : `, options: { bold: true } }, { text: v ?? '', options: { breakLine: fin } }] : [{ text: ' ', options: { breakLine: fin } }];
        });
        s.addText(texte as never, { x: 0.9, y: 1.6, w: ref ? 6.6 : L - 1.8, h: 4.5, fontSize: 22, color: ENCRE, valign: 'middle', paraSpaceAfter: 6 });
        if (ref) s.addImage(contenir(ref, 8, 0.6, 4.8, 6.3));
        break;
      }
      case 'sommaire': {
        titrePage(s, 'Sommaire');
        s.addText(sections.map(([t, p]) => ({ text: `${t}   ·   p. ${p}`, options: { bullet: true, breakLine: true } })),
          { x: 0.9, y: 1.4, w: L - 1.8, h: H - 2.2, fontSize: 22, color: ENCRE, valign: 'top', paraSpaceAfter: 10 });
        break;
      }
      case 'recherche': {
        titrePage(s, 'Recherches et références');
        const refs = photosDe(d, costumeId).filter(p => p.type === 'reference' && p.drive_id !== c.image_ref).slice(0, 4);
        const imgs = (await Promise.all(refs.map(p => image(p.drive_id)))).filter(Boolean) as Image[];
        const largeurTexte = imgs.length ? 6.6 : L - 1;
        s.addText(c.recherche ?? '', { x: 0.5, y: 1.2, w: largeurTexte, h: H - 1.9, fontSize: 16, color: ENCRE, valign: 'top', fit: 'shrink' });
        imgs.forEach((im, k) => s.addImage(contenir(im, 7.4 + (k % 2) * 2.85, 1.2 + Math.floor(k / 2) * 2.95, 2.7, 2.8)));
        break;
      }
      case 'intercalaire': {
        s.background = { color: ACCENT };
        s.addText(dia.titre.toUpperCase(), { x: 0.8, y: 2.8, w: L - 1.6, h: 1.4, fontSize: 40, color: 'FFFFFF', bold: true, align: 'center' });
        break;
      }
      case 'comparaison': {
        const v = VUES.find(x => x.cle === dia.cle)!;
        const p = r.paires[dia.cle];
        titrePage(s, v.titre.toUpperCase());
        const suffixe = v.vue ? ` (${v.vue})` : '';
        const cases: [string, string | undefined, number][] = [[`Image de référence${suffixe}`, p.ref, 0.5], [`Photo du résultat final${suffixe}`, p.res, L / 2 + 0.15]];
        for (const [legende, id, x] of cases) {
          s.addText(legende, { x, y: 1.05, w: L / 2 - 0.65, h: 0.45, fontSize: 15, color: DOUX, bold: true, align: 'center' });
          const im = await image(id);
          if (im) s.addImage(contenir(im, x, 1.6, L / 2 - 0.65, H - 2.3));
          else s.addShape('rect', { x, y: 1.6, w: L / 2 - 0.65, h: H - 2.3, fill: { color: PALE }, line: { color: PALE } });
        }
        break;
      }
      case 'piece': {
        const p = dia.pieceId ? ligne(d, 'Pieces', dia.pieceId) : undefined;
        const partie = PARTIES.find(([k]) => k === partieDe(p))![1];
        titrePage(s, `WIP ${partie.toUpperCase()} – ${p?.nom ?? 'Divers'}${dia.suite ? ' (suite)' : ''}`);
        const origine = ORIGINES.find(([k]) => k === p?.origine)?.[1];
        if (p?.origine && origine) {
          const txt = p.origine_detail ? `${origine} : ${p.origine_detail}` : origine;
          s.addText(txt, { x: L - 4.3, y: 0.38, w: 3.8, h: 0.45, fontSize: 12, color: 'FFFFFF', bold: true, align: 'center', fill: { color: ACCENT }, fit: 'shrink' });
        }
        let x0 = 0.5;
        if (!dia.suite && p) {
          const blocs: { text: string; options?: Record<string, unknown> }[] = [];
          const bloc = (titre: string, corps?: string) => {
            if (!corps?.trim()) return;
            blocs.push({ text: titre, options: { bold: true, color: ACCENT, breakLine: true, fontSize: 15 } });
            blocs.push({ text: corps.trim(), options: { breakLine: true, paraSpaceAfter: 10 } });
          };
          bloc('Matériaux utilisés', p.materiaux);
          bloc('Techniques utilisées, commentaires', [p.patron ? `Patron : ${p.patron}` : '', p.techniques ?? ''].filter(Boolean).join('\n'));
          if (blocs.length) {
            const large = !dia.photos.length;
            s.addText(blocs as never, { x: 0.5, y: 1.15, w: large ? L - 1 : 4.6, h: H - 1.85, fontSize: 13, color: ENCRE, valign: 'top', fit: 'shrink' });
            if (!large) x0 = 5.4;
          }
        }
        await grillePhotos(s, d, dia.photos, p, x0, L - x0 - 0.5, photosWip(d, costumeId, dia.pieceId));
        break;
      }
    }
  }
  progres?.('Écriture du fichier');
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}

/** Les photos d'une page, en grille, chacune numérotée (rang dans la pièce) et légendée. */
async function grillePhotos(s: { addImage: (o: object) => void; addText: (t: string, o: object) => void }, d: Donnees, photos: Ligne[], piece: Ligne | undefined, x: number, w: number, toutes: Ligne[]) {
  if (!photos.length) return;
  const n = photos.length;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  const rangs = Math.ceil(n / cols);
  const y0 = 1.15, h = H - y0 - 0.6, ecart = 0.2;
  const cw = (w - ecart * (cols - 1)) / cols, ch = (h - ecart * (rangs - 1)) / rangs;
  const hLegende = Math.min(0.75, ch * 0.28);
  for (const [k, p] of photos.entries()) {
    const cx = x + (k % cols) * (cw + ecart), cy = y0 + Math.floor(k / cols) * (ch + ecart);
    const im = await image(p.drive_id);
    if (im) s.addImage(contenir(im, cx, cy, cw, ch - hLegende));
    s.addText(`${toutes.indexOf(p) + 1}.${legende(d, p, piece) ? ` ${legende(d, p, piece)}` : ''}`, { x: cx, y: cy + ch - hLegende, w: cw, h: hLegende, fontSize: 11, color: ENCRE, valign: 'top', fit: 'shrink' });
  }
}

/** Légende d'une photo : sa légende, sinon ce qu'elle montre (l'étape). Pas de date : le jury n'en a pas besoin. */
function legende(d: Donnees, p: Ligne, piece: Ligne | undefined): string {
  const date = lireJour(p.date);
  let quoi = p.legende ?? '';
  if (!quoi) {
    const etape = ligne(d, 'Etapes', p.etape_id);
    if (etape) quoi = etape.titre;
    else if (piece && date) {
      const proche = etapesDePiece(d, piece.id).find(e => bool(e.fait) && lireJour(e.fait_le) && Math.abs(ecartJours(lireJour(e.fait_le), date)) <= 3);
      if (proche) quoi = proche.titre;
    }
  }
  return quoi;
}
