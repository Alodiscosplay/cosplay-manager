// Lecture des données : sélections triées, sans jamais modifier.
import { type Donnees, type Ligne, num, vivant, liste } from '../modele/schema';

export function parOrdre(a: Ligne, b: Ligne): number {
  return num(a.ordre, 0) - num(b.ordre, 0) || (a.id < b.id ? -1 : 1);
}

function vivants(table: Record<string, Ligne>): Ligne[] {
  return Object.values(table).filter(vivant);
}

export function costumes(d: Donnees): Ligne[] {
  return vivants(d.Costumes).sort(parOrdre);
}

export function piecesDe(d: Donnees, costumeId: string): Ligne[] {
  return vivants(d.Pieces).filter(p => p.costume_id === costumeId).sort(parOrdre);
}

export function pistesDe(d: Donnees, pieceId: string): Ligne[] {
  return vivants(d.Pistes).filter(p => p.piece_id === pieceId).sort(parOrdre);
}

export function etapesDePiste(d: Donnees, pisteId: string): Ligne[] {
  return vivants(d.Etapes).filter(e => e.piste_id === pisteId).sort(parOrdre);
}

/** Étapes d'une pièce, dans l'ordre pistes puis étapes. */
export function etapesDePiece(d: Donnees, pieceId: string): Ligne[] {
  return pistesDe(d, pieceId).flatMap(p => etapesDePiste(d, p.id));
}

export function etapesDeCostume(d: Donnees, costumeId: string): Ligne[] {
  return piecesDe(d, costumeId).flatMap(p => etapesDePiece(d, p.id));
}

export function fournituresDe(d: Donnees, costumeId: string): Ligne[] {
  return vivants(d.Fournitures).filter(f => f.costume_id === costumeId).sort(parOrdre);
}

export function photosDe(d: Donnees, costumeId: string): Ligne[] {
  return vivants(d.Photos).filter(p => p.costume_id === costumeId)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || parOrdre(a, b));
}

export function tous(d: Donnees, table: keyof Donnees): Ligne[] {
  return vivants(d[table]).sort(parOrdre);
}

export function ligne(d: Donnees, table: keyof Donnees, id: string | undefined): Ligne | undefined {
  if (!id) return undefined;
  const l = d[table][id];
  return vivant(l) ? l : undefined;
}

/** Prochain numéro d'ordre (dernier + 1) dans une liste. */
export function ordreSuivant(lignes: Ligne[]): string {
  return String(lignes.reduce((m, l) => Math.max(m, num(l.ordre, 0)), 0) + 1);
}

/** Nom lisible d'un élément qu'on peut « attendre » (piste ou pièce). */
export function nomAttendu(d: Donnees, id: string): string {
  const piste = ligne(d, 'Pistes', id);
  if (piste) {
    const piece = ligne(d, 'Pieces', piste.piece_id);
    return piste.nom || piece?.nom || 'piste';
  }
  return ligne(d, 'Pieces', id)?.nom ?? '(supprimé)';
}

export function idsAttendus(l: Ligne): string[] {
  return liste(l.attend);
}
