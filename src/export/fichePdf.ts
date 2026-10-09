// Fiche lisible d'un costume, en PDF (A4) : ce qu'on relit hors de l'appli, sur un téléphone comme sur un
// ordinateur. Seule l'image de référence y figure : les photos sont à côté, dans la sauvegarde. Elle est
// fournie par `image` (données JPEG en data URL), pour rester testable.
import type { jsPDF as JsPdf } from 'jspdf';
import { type Donnees, bool } from '../modele/schema';
import { ligne, piecesDe, pistesDe, etapesDePiste, fournituresDe } from '../logique/acces';
import { avancementCostume, avancementPiece, formatPct } from '../logique/avancement';
import { budgetCostume, montant, euros } from '../logique/budget';
import { jourCourt } from '../logique/dates';

export type ChargeurImage = (id: string) => Promise<{ url: string; w: number; h: number } | null>;

const MARGE = 15;
const LARGEUR = 210 - 2 * MARGE;
const BAS = 297 - MARGE;
const ENCRE: [number, number, number] = [43, 34, 51];
const DOUX: [number, number, number] = [110, 100, 120];
const ACCENT: [number, number, number] = [107, 63, 160];

/** Les polices de base du PDF ne connaissent que le latin courant : on remplace le reste. */
export function propre(s: string | undefined): string {
  return (s ?? '')
    .replace(/[‘’ʼ]/g, "'").replace(/[“”«»]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[   ]/g, ' ')
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/€/g, 'EUR')
    .replace(/[^\n\x20-\x7e -ÿ]/g, '');
}

export async function fichePdf(d: Donnees, costumeId: string, image: ChargeurImage): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc: JsPdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const c = ligne(d, 'Costumes', costumeId)!;
  let y = MARGE;

  const place = (h: number) => { if (y + h > BAS) { doc.addPage(); y = MARGE; } };
  const texte = (t: string, taille = 10, couleur = ENCRE, gras = false, x = MARGE, largeur = LARGEUR) => {
    doc.setFont('helvetica', gras ? 'bold' : 'normal').setFontSize(taille).setTextColor(...couleur);
    const lignes = doc.splitTextToSize(propre(t), largeur) as string[];
    const h = taille * 0.42;
    for (const l of lignes) { place(h); doc.text(l, x, y + h * 0.8); y += h; }
  };
  const titre = (t: string) => {
    place(14); y += 4;
    texte(t, 14, ACCENT, true);
    doc.setDrawColor(...ACCENT).setLineWidth(0.4).line(MARGE, y + 1, MARGE + LARGEUR, y + 1);
    y += 4;
  };
  // ---------- En-tête : image de référence et identité du costume ----------
  const ref = c.image_ref ? await image(c.image_ref) : null;
  const colTexte = ref ? MARGE + 62 : MARGE;
  const largeurTexte = ref ? LARGEUR - 62 : LARGEUR;
  const haut = y;
  if (ref) {
    const w = 55, h = Math.min(80, (w * ref.h) / ref.w);
    doc.addImage(ref.url, 'JPEG', MARGE, y, (h * ref.w) / ref.h, h);
  }
  const a = avancementCostume(d, costumeId);
  const pieces = piecesDe(d, costumeId);
  texte(c.nom, 22, ENCRE, true, colTexte, largeurTexte);
  if (c.personnage || c.oeuvre) texte([c.personnage, c.oeuvre].filter(Boolean).join(' - '), 12, DOUX, false, colTexte, largeurTexte);
  y += 3;
  texte(`${formatPct(a)} - ${a.nbFait} sous-étapes faites sur ${a.nb} - ${pieces.length} pièce${pieces.length > 1 ? 's' : ''}`, 11, ENCRE, true, colTexte, largeurTexte);
  if (c.deadline) texte(`Deadline : ${jourCourt(c.deadline, '')}`, 10, ENCRE, false, colTexte, largeurTexte);
  if (c.notes) { y += 2; texte(c.notes, 9, DOUX, false, colTexte, largeurTexte); }
  y += 2;
  texte(`Fiche enregistrée le ${jourCourt(new Date().toISOString().slice(0, 10), '')} avec Cosplay Manager.`, 8, DOUX, false, colTexte, largeurTexte);
  if (ref) y = Math.max(y, haut + 82);

  // ---------- Pièces, étapes, sous-étapes et photos ----------
  titre('Pièces, étapes et sous-étapes');
  for (const p of pieces) {
    place(12); y += 2;
    texte(`${p.nom}  -  ${formatPct(avancementPiece(d, p.id))}${p.patron ? `  -  ${p.patron}` : ''}`, 12, ENCRE, true);
    const pistes = pistesDe(d, p.id);
    for (const pi of pistes) {
      if (pistes.length > 1 || pi.nom) texte(pi.nom || 'Étape principale', 10, DOUX, true);
      for (const e of etapesDePiste(d, pi.id)) {
        const fait = bool(e.fait);
        place(5);
        doc.setDrawColor(...DOUX).setLineWidth(0.3).rect(MARGE + 1, y + 0.9, 2.6, 2.6, fait ? 'FD' : 'S');
        texte(`${e.titre}${e.fait_le ? `  (${jourCourt(e.fait_le, '')})` : ''}`, 9, fait ? DOUX : ENCRE, false, MARGE + 6, LARGEUR - 6);
      }
    }
    if (p.notes) texte(p.notes, 9, DOUX);
  }

  // ---------- Fournitures et budget ----------
  const fournitures = fournituresDe(d, costumeId);
  titre('Fournitures');
  if (!fournitures.length) texte('Aucune.', 10, DOUX);
  else {
    const cols: [string, number][] = [['Quoi', 62], ['Quantité', 28], ['Fournisseur', 40], ['Prix', 22], ['Statut', 28]];
    const rangee = (vals: string[], gras: boolean) => {
      doc.setFont('helvetica', gras ? 'bold' : 'normal').setFontSize(9).setTextColor(...(gras ? DOUX : ENCRE));
      const morceaux = vals.map((v, i) => doc.splitTextToSize(propre(v), cols[i][1] - 2) as string[]);
      const h = Math.max(...morceaux.map(m => m.length)) * 3.8 + 1.5;
      place(h);
      let x = MARGE;
      morceaux.forEach((m, i) => { m.forEach((l, k) => doc.text(l, x, y + 3.2 + k * 3.8)); x += cols[i][1]; });
      y += h;
      doc.setDrawColor(227, 220, 234).setLineWidth(0.2).line(MARGE, y, MARGE + LARGEUR, y);
    };
    rangee(cols.map(c2 => c2[0]), true);
    for (const f of fournitures) {
      const m = montant(f);
      rangee([f.libelle, [f.quantite, f.unite].filter(Boolean).join(' '), ligne(d, 'Fournisseurs', f.fournisseur_id)?.nom ?? '', m !== null ? euros(m) : '', f.statut ?? ''], false);
    }
  }
  if (bool(c.suivi_budget)) {
    const b = budgetCostume(d, costumeId);
    titre('Budget');
    texte(`Total des fournitures : ${euros(b.total)}${b.cible !== null ? `, pour un budget visé de ${euros(b.cible)}` : ''}${b.sansPrix ? ` (${b.sansPrix} sans prix)` : ''}.`, 10);
  }

  // Pied de page : pagination
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i).setFont('helvetica', 'normal').setFontSize(8).setTextColor(...DOUX);
    doc.text(propre(`${c.nom} - ${i} / ${n}`), 210 - MARGE, 297 - 7, { align: 'right' });
  }
  return doc.output('blob');
}
