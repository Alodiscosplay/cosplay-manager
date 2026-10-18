// Avancement pondéré : % = Σ poids des étapes cochées ÷ Σ poids de toutes les étapes.
// Plus le poids est grand, plus l'étape compte. Exemple : poids 1, 2, 1 → cocher l'étape
// de poids 2 donne 50 %.
// Le costume, lui, fait la moyenne de ses pièces, chacune comptant selon son poids (voir poidsPiece) :
// une pièce pas encore préparée ne disparaît plus du calcul.
import { type Donnees, type Ligne, DUREES, type Duree, bool, num } from '../modele/schema';
import { etapesDePiece, etapesDePiste, piecesDe } from './acces';

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

// ---------- Poids d'une pièce dans le % du costume ----------

/**
 * L'ampleur estimée d'une pièce dont on n'a pas encore préparé les sous-étapes, en points de sous-étape
 * (une sous-étape normale vaut 2). Calée sur des pièces réelles : perruque à coiffer ~4, chapeau ~12,
 * corset ~25, robe brodée ~50.
 */
export const AMPLEURS = { 'petite': 4, 'moyenne': 12, 'grande': 25, 'très grande': 50 } as const;
export type Ampleur = keyof typeof AMPLEURS;
export const NOMS_AMPLEURS = Object.keys(AMPLEURS) as Ampleur[];
/** Toute pièce a une ampleur : moyenne tant qu'on n'en a pas choisi une autre. */
export const AMPLEUR_PAR_DEFAUT: Ampleur = 'moyenne';

export const ampleurDe = (p: Ligne): Ampleur => ((p.ampleur ?? '') in AMPLEURS ? p.ampleur as Ampleur : AMPLEUR_PAR_DEFAUT);

export interface PoidsPiece { poids: number; source: 'sous-étapes' | 'ampleur' | 'défaut'; ampleur?: Ampleur }

/**
 * Le poids d'une pièce dans le % de son costume : le poids de ses sous-étapes une fois leur préparation
 * terminée (case cochée) ; avant, son ampleur estimée — moyenne si on n'en a pas choisi d'autre.
 */
export function poidsPiece(d: Donnees, p: Ligne): PoidsPiece {
  const a = avancement(etapesDePiece(d, p.id));
  if (bool(p.preparation_finie) && a.total > 0) return { poids: a.total, source: 'sous-étapes' };
  const ampleur = ampleurDe(p);
  return { poids: AMPLEURS[ampleur], source: (p.ampleur ?? '') in AMPLEURS ? 'ampleur' : 'défaut', ampleur };
}

/** La part faite d'une pièce (0 à 1) : ses sous-étapes cochées ; sans sous-étape, 1 si elle est terminée. */
export function fractionPiece(d: Donnees, p: Ligne): number {
  const a = avancement(etapesDePiece(d, p.id));
  if (a.total > 0) return a.fait / a.total;
  return p.statut === 'terminée' ? 1 : 0;
}

/**
 * L'avancement d'un costume : la moyenne du % de ses pièces, pondérée par leur poids. `fait` et `total`
 * sont en points (poids des pièces) ; `nb` et `nbFait` comptent les sous-étapes. Sans pièce : « — ».
 */
export function avancementCostume(d: Donnees, costumeId: string): Avancement {
  let fait = 0, total = 0, nb = 0, nbFait = 0;
  for (const p of piecesDe(d, costumeId)) {
    const { poids: w } = poidsPiece(d, p);
    total += w;
    fait += w * fractionPiece(d, p);
    const a = avancement(etapesDePiece(d, p.id));
    nb += a.nb; nbFait += a.nbFait;
  }
  return { fait, total, nbFait, nb, pct: total > 0 ? (100 * fait) / total : null };
}

export function formatPct(a: Avancement): string {
  if (a.pct === null) return '—';
  if (a.pct > 0 && a.pct < 1) return '<1 %';
  if (a.pct < 100 && a.pct > 99) return '99 %';
  return `${Math.round(a.pct)} %`;
}
