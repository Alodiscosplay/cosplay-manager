// Bascules automatiques, appliquées à l'ouverture de l'appli (une PWA ne tourne pas en arrière-plan) :
//  - date de début atteinte : costume « projet » → « en cours », pièce « à venir » → « en cours » ;
//  - pièce à 100 % → « terminée », et retour « en cours » si on décoche une étape.
import { type Donnees } from '../modele/schema';
import { costumes, piecesDe } from './acces';
import { lireJour, type Jour } from './dates';
import { pieceTerminee } from './disponibilite';
import { etapesDePiece } from './acces';

export interface Changement { table: 'Costumes' | 'Pieces'; id: string; champs: Record<string, string> }

export function activationsDuJour(d: Donnees, jour: Jour): Changement[] {
  const res: Changement[] = [];
  for (const c of costumes(d)) {
    const debut = lireJour(c.debut);
    if (c.statut === 'projet' && debut && debut <= jour) res.push({ table: 'Costumes', id: c.id, champs: { statut: 'en cours' } });
    for (const p of piecesDe(d, c.id)) {
      const dp = lireJour(p.debut);
      if ((p.statut || 'à venir') === 'à venir' && dp && dp <= jour) res.push({ table: 'Pieces', id: p.id, champs: { statut: 'en cours' } });
    }
  }
  return res;
}

/** Statut à donner à une pièce après qu'on a coché ou décoché une de ses étapes (null = ne rien changer). */
export function statutApresCoche(d: Donnees, pieceId: string): string | null {
  const piece = d.Pieces[pieceId];
  if (!piece) return null;
  const finie = pieceTerminee(d, pieceId);
  if (finie && piece.statut !== 'terminée') return 'terminée';
  if (!finie && piece.statut === 'terminée' && etapesDePiece(d, pieceId).length > 0) return 'en cours';
  return null;
}
