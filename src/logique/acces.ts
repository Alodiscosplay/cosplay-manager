// Lecture des données : sélections triées, sans jamais modifier.
import { type Donnees, type Ligne, num, vivant, liste } from '../modele/schema';

export function parOrdre(a: Ligne, b: Ligne): number {
  return num(a.ordre, 0) - num(b.ordre, 0) || (a.id < b.id ? -1 : 1);
}

function vivants(table: Record<string, Ligne>): Ligne[] {
  return Object.values(table).filter(vivant);
}

/** Teintes proposées pour distinguer les projets (agenda, repères), plus un gris. */
export const GRIS = 'gris';
export const TEINTES = [0, 18, 35, 52, 95, 130, 160, 185, 205, 230, 255, 275, 300, 320, 340];

/** Ordre des teintes attribuées d'office, choisi pour que deux projets voisins ne se ressemblent pas. */
const AUTO = [275, 130, 18, 205, 320, 52, 160, 300, 95, 230, 0, 185, 255, 35, 340];

/** Couleur d'un costume : la sienne si elle est choisie, sinon une teinte de la palette selon son rang. */
export function couleurCostume(c: Ligne, rang = 0): string {
  const teinte = (c.couleur ?? '').trim();
  if (teinte === GRIS) return 'hsl(230 8% 52%)';
  return `hsl(${teinte || AUTO[rang % AUTO.length]} 62% 48%)`;
}

/** La couleur d'une pastille de choix. */
export function teinteCouleur(t: string | number): string {
  return t === GRIS ? 'hsl(230 8% 52%)' : `hsl(${t} 62% 48%)`;
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

/** Pièces concernées par une fourniture (0, 1 ou plusieurs ; les pièces supprimées sont ignorées). */
export function piecesDeFourniture(d: Donnees, f: Ligne): Ligne[] {
  return liste(f.piece_id).map(id => ligne(d, 'Pieces', id)).filter((p): p is Ligne => !!p);
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

/** Nom lisible d'un élément qu'on peut « attendre » (étape, piste ou pièce). */
export function nomAttendu(d: Donnees, id: string): string {
  const etape = ligne(d, 'Etapes', id);
  if (etape) return `« ${etape.titre} »`;
  const piste = ligne(d, 'Pistes', id);
  if (piste) {
    const piece = ligne(d, 'Pieces', piste.piece_id);
    return piste.nom || piece?.nom || 'étape';
  }
  return ligne(d, 'Pieces', id)?.nom ?? '(supprimé)';
}

export function idsAttendus(l: Ligne): string[] {
  return liste(l.attend);
}
