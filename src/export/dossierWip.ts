// Dossier WIP (travail en cours) : un PowerPoint généré dans le navigateur, sans IA, depuis les photos d'avancement.
import { type Donnees, type Ligne, bool } from '../modele/schema';
import { ligne, piecesDe, photosDe, etapesDePiece, etapesDeCostume } from '../logique/acces';
import { avancementCostume, avancementPiece, formatPct } from '../logique/avancement';
import { budgetCostume, euros } from '../logique/budget';
import { jourCourt, lireJour, ecartJours } from '../logique/dates';
import { blobPhoto, blobVersDataUrl, dimensions } from '../store/photos';

export interface OptionsWip { pieces: string[]; parDiapo: 1 | 2 | 4 } // pieces : ids dans l'ordre voulu ('' = Général)

const L = 13.333, H = 7.5; // format 16:9, en pouces
const ENCRE = '2B2233', ACCENT = '6B3FA0', DOUX = '6E6478', FOND = 'FAF7FC';

interface Image { data: string; w: number; h: number }

async function image(id: string): Promise<Image | null> {
  const b = await blobPhoto(id);
  if (!b) return null;
  const { w, h } = await dimensions(b);
  return { data: (await blobVersDataUrl(b)).replace(/^data:/, ''), w, h };
}

/** Place une image « contenue » dans une boîte, centrée. */
function contenir(img: Image, x: number, y: number, w: number, h: number) {
  const r = Math.min(w / img.w, h / img.h);
  const iw = img.w * r, ih = img.h * r;
  return { data: img.data, x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih };
}

export async function genererWip(d: Donnees, costumeId: string, opts: OptionsWip, progres?: (texte: string) => void): Promise<Blob> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const c = ligne(d, 'Costumes', costumeId)!;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = `${c.nom} — dossier WIP`;
  pptx.defineSlideMaster({
    title: 'WIP', background: { color: FOND },
    objects: [{ rect: { x: 0, y: H - 0.12, w: L, h: 0.12, fill: { color: ACCENT } } }],
    slideNumber: { x: L - 0.9, y: H - 0.5, fontSize: 10, color: DOUX },
  });

  // 1. Titre
  progres?.('Diapo de titre');
  const titre = pptx.addSlide({ masterName: 'WIP' });
  const ref = c.image_ref ? await image(c.image_ref) : null;
  const largeurTexte = ref ? 6.6 : L - 1.6;
  titre.addText('Dossier de travail en cours', { x: 0.8, y: 1.2, w: largeurTexte, h: 0.5, fontSize: 16, color: ACCENT, bold: true });
  titre.addText(c.nom, { x: 0.8, y: 1.8, w: largeurTexte, h: 1.4, fontSize: 40, color: ENCRE, bold: true, fit: 'shrink' });
  const sous = [c.personnage, c.oeuvre].filter(Boolean).join(' — ');
  if (sous) titre.addText(sous, { x: 0.8, y: 3.3, w: largeurTexte, h: 0.6, fontSize: 20, color: DOUX });
  const etapes = etapesDeCostume(d, costumeId);
  const faites = etapes.map(e => lireJour(e.fait_le)).filter(Boolean).sort();
  if (faites.length) titre.addText(`Réalisation : ${jourCourt(faites[0], '')} → ${jourCourt(faites[faites.length - 1], '')}`, { x: 0.8, y: 4.2, w: largeurTexte, h: 0.4, fontSize: 14, color: DOUX });
  if (ref) titre.addImage(contenir(ref, 7.8, 0.6, 4.9, 6.1));

  // 2. Sommaire des pièces
  const noms = opts.pieces.map(id => (id ? ligne(d, 'Pieces', id)?.nom ?? '' : 'Général')).filter(Boolean);
  if (noms.length > 1) {
    const s = pptx.addSlide({ masterName: 'WIP' });
    s.addText('Les pièces du costume', { x: 0.8, y: 0.6, w: L - 1.6, h: 0.8, fontSize: 28, color: ENCRE, bold: true });
    s.addText(opts.pieces.map(id => {
      const nom = id ? ligne(d, 'Pieces', id)?.nom ?? '' : 'Général';
      const a = id ? avancementPiece(d, id) : null;
      return { text: `${nom}${a && a.pct !== null ? `  ·  ${formatPct(a)}` : ''}`, options: { bullet: true, breakLine: true } };
    }), { x: 0.8, y: 1.6, w: L - 1.6, h: H - 2.4, fontSize: 20, color: ENCRE, valign: 'top', paraSpaceAfter: 8 });
  }

  // 3. Une section par pièce, puis ses photos dans l'ordre chronologique
  const photos = photosDe(d, costumeId).filter(p => bool(p.dans_wip));
  for (const pieceId of opts.pieces) {
    const piece = pieceId ? ligne(d, 'Pieces', pieceId) : undefined;
    const nom = piece?.nom ?? 'Général';
    const siennes = photos.filter(p => (pieceId ? p.piece_id === pieceId : !p.piece_id || !ligne(d, 'Pieces', p.piece_id)));
    if (!siennes.length) continue;
    progres?.(`Pièce « ${nom} »`);
    const sec = pptx.addSlide({ masterName: 'WIP' });
    sec.addText(nom, { x: 0.8, y: 2.6, w: L - 1.6, h: 1.2, fontSize: 40, color: ACCENT, bold: true });
    const infos = [piece?.patron ? `Patron : ${piece.patron}` : '', piece ? `${etapesDePiece(d, piece.id).length} sous-étapes · ${formatPct(avancementPiece(d, piece.id))}` : ''].filter(Boolean).join('   ·   ');
    if (infos) sec.addText(infos, { x: 0.8, y: 3.8, w: L - 1.6, h: 0.5, fontSize: 16, color: DOUX });

    for (let i = 0; i < siennes.length; i += opts.parDiapo) {
      const lot = siennes.slice(i, i + opts.parDiapo);
      const s = pptx.addSlide({ masterName: 'WIP' });
      s.addText(nom, { x: 0.5, y: 0.25, w: L - 1, h: 0.5, fontSize: 14, color: ACCENT, bold: true });
      const cases = disposition(lot.length);
      for (let k = 0; k < lot.length; k++) {
        const p = lot[k];
        const [x, y, w, h] = cases[k];
        const img = await image(p.drive_id);
        const hauteurTexte = opts.parDiapo === 1 ? 1.4 : 0.8;
        if (img) s.addImage(contenir(img, x, y, w, h - hauteurTexte));
        s.addText(legende(d, p, piece, opts.parDiapo === 1), { x, y: y + h - hauteurTexte + 0.05, w, h: hauteurTexte - 0.05, fontSize: opts.parDiapo === 4 ? 10 : 12, color: ENCRE, valign: 'top', fit: 'shrink' });
      }
    }
  }

  // 4. Fin
  progres?.('Diapo de fin');
  const fin = pptx.addSlide({ masterName: 'WIP' });
  const a = avancementCostume(d, costumeId);
  fin.addText('Bilan', { x: 0.8, y: 0.8, w: L - 1.6, h: 0.8, fontSize: 32, color: ENCRE, bold: true });
  const lignes = [
    `Avancement : ${formatPct(a)} (${a.nbFait} sous-étapes sur ${a.nb})`,
    `${piecesDe(d, costumeId).length} pièces · ${photos.length} photos de travail`,
  ];
  if (bool(c.suivi_budget)) {
    const b = budgetCostume(d, costumeId);
    lignes.push(`Budget : ${euros(b.prevu)}${b.cible !== null ? ` pour ${euros(b.cible)} prévus` : ''}${b.sansPrix ? ' (hors fournitures sans prix)' : ''}`);
  }
  fin.addText(lignes.map(t => ({ text: t, options: { bullet: true, breakLine: true } })), { x: 0.8, y: 1.9, w: L - 1.6, h: 3, fontSize: 20, color: ENCRE, valign: 'top', paraSpaceAfter: 10 });

  progres?.('Écriture du fichier');
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}

/** Cases [x, y, w, h] pour 1, 2 ou 4 photos. */
function disposition(n: number): [number, number, number, number][] {
  const m = 0.5, haut = 0.9, W = L - 2 * m, Hh = H - haut - 0.5;
  if (n <= 1) return [[m, haut, W, Hh]];
  if (n === 2) return [[m, haut, W / 2 - 0.15, Hh], [m + W / 2 + 0.15, haut, W / 2 - 0.15, Hh]];
  const w = W / 2 - 0.15, h = Hh / 2 - 0.1;
  return [[m, haut, w, h], [m + w + 0.3, haut, w, h], [m, haut + h + 0.2, w, h], [m + w + 0.3, haut + h + 0.2, w, h]].slice(0, n) as [number, number, number, number][];
}

/** Légende d'une photo : sa date, sa légende, et les étapes cochées dans les 3 jours autour. */
function legende(d: Donnees, p: Ligne, piece: Ligne | undefined, detaille: boolean): string {
  const date = lireJour(p.date);
  const morceaux = [[date ? jourCourt(date, '') : '', p.legende].filter(Boolean).join(' — ')];
  const etape = ligne(d, 'Etapes', p.etape_id);
  const piste = ligne(d, 'Pistes', p.piste_id || etape?.piste_id);
  const nomEtape = piste ? piste.nom || 'Étape principale' : '';
  if (etape) morceaux.push(`${nomEtape} › ${etape.titre}`);
  else if (piste) morceaux.push(`Étape : ${nomEtape}`);
  else if (piece && date) {
    const proches = etapesDePiece(d, piece.id).filter(e => bool(e.fait) && lireJour(e.fait_le) && Math.abs(ecartJours(lireJour(e.fait_le), date)) <= 3);
    if (proches.length) morceaux.push(`Sous-étapes : ${proches.slice(0, detaille ? 5 : 2).map(e => e.titre).join(', ')}`);
  }
  return morceaux.filter(Boolean).join('\n');
}
