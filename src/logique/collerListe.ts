// « Coller une liste » : transforme un texte en pièces, pistes et étapes. Sert aussi de format aux modèles.
//
//   ## Chapeau            → une pièce
//   ### Bijoux            → une piste dans la pièce en cours
//   Modéliser (long)      → une étape ; la durée entre parenthèses en fin de ligne est facultative
//
// Les puces (-, *, •, 1., a), [ ]) sont ignorées. Les lignes vides aussi.
import { type Duree, NOMS_DUREES } from '../modele/schema';

export interface EtapeTexte { titre: string; duree: Duree }
export interface PisteTexte { nom: string; etapes: EtapeTexte[] }
export interface PieceTexte { nom: string; pistes: PisteTexte[] }
/** `pieces[0].nom === ''` : étapes écrites avant tout « ## » (à mettre dans la pièce choisie). */
export interface ListeTexte { pieces: PieceTexte[] }

const RE_DUREE = /\s*\((rapide|normal|long|tr[eè]s[\s-]long)\)\s*$/i;
const RE_PUCE = /^\s*(?:[-*•–]|\d+[.)]|[a-z][.)]|\[[ xX]?\])\s+/;

export function normaliserDuree(s: string): Duree {
  const t = s.toLowerCase().replace(/[\s-]+/g, ' ').replace('tres', 'très');
  return (NOMS_DUREES as string[]).includes(t) ? (t as Duree) : 'normal';
}

export function analyserListe(texte: string): ListeTexte {
  const pieces: PieceTexte[] = [];
  let piece: PieceTexte | null = null;
  let piste: PisteTexte | null = null;

  const assurerPiece = () => {
    if (!piece) { piece = { nom: '', pistes: [] }; pieces.push(piece); }
    return piece;
  };
  const assurerPiste = () => {
    const p = assurerPiece();
    if (!piste) { piste = { nom: '', etapes: [] }; p.pistes.push(piste); }
    return piste;
  };

  for (const brute of texte.split(/\r?\n/)) {
    const l = brute.trim();
    if (!l) continue;
    const titre3 = /^###\s*(.*)$/.exec(l);
    if (titre3) { const p = assurerPiece(); piste = { nom: titre3[1].trim(), etapes: [] }; p.pistes.push(piste); continue; }
    const titre2 = /^##\s*(.*)$/.exec(l);
    if (titre2) { piece = { nom: titre2[1].trim(), pistes: [] }; pieces.push(piece); piste = null; continue; }
    let t = l.replace(RE_PUCE, '');
    let duree: Duree = 'normal';
    const m = RE_DUREE.exec(t);
    if (m) { duree = normaliserDuree(m[1]); t = t.slice(0, m.index); }
    t = t.trim();
    if (t) assurerPiste().etapes.push({ titre: t, duree });
  }
  // Une pièce déclarée sans aucune étape reste utile (on la crée vide).
  return { pieces };
}

/** Texte d'une piste, au format « Coller une liste » (pour « Enregistrer comme modèle »). */
export function versTexte(etapes: Record<string, string | undefined>[]): string {
  return etapes.map(e => (e.duree && e.duree !== 'normal' ? `${e.titre} (${e.duree})` : e.titre ?? '')).join('\n');
}

export function compter(l: ListeTexte): { pieces: number; pistes: number; etapes: number } {
  return {
    pieces: l.pieces.filter(p => p.nom).length,
    pistes: l.pieces.reduce((s, p) => s + p.pistes.length, 0),
    etapes: l.pieces.reduce((s, p) => s + p.pistes.reduce((t, pi) => t + pi.etapes.length, 0), 0),
  };
}
