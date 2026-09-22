// Avancement pondéré : % = Σ poids des étapes cochées ÷ Σ poids de toutes les étapes.
// Plus le poids est grand, plus l'étape compte. Exemple : poids 1, 2, 1 → cocher l'étape
// de poids 2 donne 50 %.
import { type Donnees, type Ligne, DUREES, type Duree, bool, num } from '../modele/schema';
import { etapesDePiece, etapesDeCostume, etapesDePiste } from './acces';

export function poids(etape: Ligne): number {
  const p = num(etape.poids, NaN);
  if (Number.isFinite(p) && p > 0) return p;
  return DUREES[etape.duree as Duree] ?? DUREES.normal;
}

export interface Avancement {
  fait: number;       // poids coché
  total: number;      // poids total
  nbFait: number;     // nombre d'étapes cochées
  nb: number;         // nombre d'étapes
  pct: number | null; // null quand il n'y a aucune étape : on affiche « — »
}

export function avancement(etapes: Ligne[]): Avancement {
  let fait = 0, total = 0, nbFait = 0;
  for (const e of etapes) {
    const p = poids(e);
    total += p;
    if (bool(e.fait)) { fait += p; nbFait++; }
  }
  return { fait, total, nbFait, nb: etapes.length, pct: total > 0 ? (100 * fait) / total : null };
}

export const avancementPiste = (d: Donnees, pisteId: string) => avancement(etapesDePiste(d, pisteId));
export const avancementPiece = (d: Donnees, pieceId: string) => avancement(etapesDePiece(d, pieceId));
export const avancementCostume = (d: Donnees, costumeId: string) => avancement(etapesDeCostume(d, costumeId));

export function formatPct(a: Avancement): string {
  if (a.pct === null) return '—';
  if (a.pct > 0 && a.pct < 1) return '<1 %';
  if (a.pct < 100 && a.pct > 99) return '99 %';
  return `${Math.round(a.pct)} %`;
}
