import { describe, it, expect } from 'vitest';
import { vide } from './aide';
import { type Donnees, type Ligne } from '../src/modele/schema';
import { contenu, quantitePiece, bilan, texteReste, disponiblePour, disponibleTexte, budgetCostume } from '../src/logique/budget';
import { lignesDuCostume, lireContenu } from '../src/export/archive';
import { appliquer } from './aide';

const l = (id: string, champs: Record<string, string>): Ligne => ({ id, maj: '', supprime: '', ...champs });

/** Mary Poppins (chapeau, robe, gants) et Ariel (robe). */
function monde(): Donnees {
  const d = vide();
  d.Costumes.MP = l('MP', { nom: 'Mary Poppins', statut: 'en cours', ordre: '1' });
  d.Costumes.AR = l('AR', { nom: 'Ariel', statut: 'en cours', ordre: '2' });
  d.Pieces.CH = l('CH', { costume_id: 'MP', nom: 'Chapeau' });
  d.Pieces.RO = l('RO', { costume_id: 'MP', nom: 'Robe' });
  d.Pieces.GA = l('GA', { costume_id: 'MP', nom: 'Gants' });
  d.Pieces.AR1 = l('AR1', { costume_id: 'AR', nom: 'Robe' });
  return d;
}
const ruban = (champs: Record<string, string> = {}) =>
  l('RU', { costume_id: 'MP', libelle: 'Ruban', quantite: '1', unite: 'lot de 10 m', prix_unitaire: '12', statut: 'reçu', ...champs });

describe('fourniture répartie entre plusieurs pièces', () => {
  it('le contenu d’un achat : mètres, lots, lots de quelque chose', () => {
    expect(contenu(l('a', { quantite: '10', unite: 'm' }))).toMatchObject({ total: 10, famille: 'longueur' });
    expect(contenu(ruban())).toMatchObject({ total: 10, famille: 'longueur' });
    expect(contenu(l('b', { quantite: '2', unite: 'lot de 20' }))).toMatchObject({ total: 40, unite: '' });
    expect(contenu(l('c', { quantite: '2', unite: 'lot de 20 boutons' }))).toMatchObject({ total: 40, unite: 'boutons' });
    expect(contenu(l('e', { quantite: '1', unite: 'par 10m', prix_unitaire: '5.56' }))).toMatchObject({ total: 10, famille: 'longueur' }); // dentelle « par 10m »
  });

  it('une quantité par pièce se lit dans l’unité de l’achat, ou avec la sienne', () => {
    const f = ruban();
    expect([quantitePiece(f, '3'), quantitePiece(f, '50 cm'), quantitePiece(f, '1m20'), quantitePiece(f, '')]).toEqual([3, 0.5, 1.2, null]);
  });

  it('ruban de 10 m : 3 m chapeau, 2 m robe, 1 m gants → reste 4 m', () => {
    const d = monde();
    d.Fournitures.RU = ruban({ piece_id: 'CH,RO,GA', repartition: JSON.stringify({ CH: '3', RO: '2', GA: '1' }) });
    expect(bilan(d, d.Fournitures.RU)).toMatchObject({ utilise: 6, complet: true, reste: 4 });
    expect(texteReste(d, d.Fournitures.RU)).toBe('reste 4 m');
  });

  it('une fourniture prise en entier n’est plus proposée aux autres pièces ; il en reste : oui', () => {
    const d = monde();
    d.Fournitures.RU = ruban({ piece_id: 'CH' }); // sans quantité : prise en entier
    expect(disponiblePour(d, d.Fournitures.RU, 'RO')).toBe(false);
    expect(disponiblePour(d, d.Fournitures.RU, 'CH')).toBe(true);
    d.Fournitures.RU.repartition = JSON.stringify({ CH: '3' });
    expect(disponiblePour(d, d.Fournitures.RU, 'RO')).toBe(true);
    d.Fournitures.RU.repartition = JSON.stringify({ CH: '10' });
    expect(disponiblePour(d, d.Fournitures.RU, 'RO')).toBe(false);
  });

  it('il en manque : la répartition dépasse l’achat', () => {
    const d = monde();
    d.Fournitures.RU = ruban({ piece_id: 'CH,RO', repartition: JSON.stringify({ CH: '8', RO: '4' }) });
    expect(texteReste(d, d.Fournitures.RU)).toBe('il manque 2 m');
  });

  it('le prix entier va au costume, surplus compris (une fourniture ne se partage pas entre costumes)', () => {
    const d = monde();
    d.Fournitures.RU = ruban({ piece_id: 'CH,RO', repartition: JSON.stringify({ CH: '3', RO: '2' }) });
    expect(budgetCostume(d, 'MP').recu).toBe(12);
    expect(budgetCostume(d, 'AR').total).toBe(0);
  });

  it('une pièce ajoutée reçoit d’office ce qui reste, dans l’unité de saisie', () => {
    const d = monde();
    d.Fournitures.RU = ruban();
    expect(disponibleTexte(d, d.Fournitures.RU)).toBe('10');
    d.Fournitures.RU = ruban({ piece_id: 'CH,RO', repartition: JSON.stringify({ CH: '3', RO: '2,5' }) });
    expect(disponibleTexte(d, d.Fournitures.RU)).toBe('4,5');
    d.Fournitures.RU = ruban({ piece_id: 'CH' }); // prise en entier : plus rien
    expect(disponibleTexte(d, d.Fournitures.RU)).toBe('');
    d.Fournitures.B = l('B', { costume_id: 'MP', libelle: 'Boutons', quantite: '2', unite: 'lot de 20', piece_id: 'RO', repartition: JSON.stringify({ RO: '12' }) });
    expect(disponibleTexte(d, d.Fournitures.B)).toBe('28');
  });

  it('une ancienne fourniture d’une seule pièce reste comme avant', () => {
    const d = monde();
    d.Fournitures.X = l('X', { costume_id: 'MP', piece_id: 'RO', libelle: 'Boutons rouges', quantite: '2', unite: 'lot de 20', prix_unitaire: '7.98', statut: 'reçu' });
    expect(budgetCostume(d, 'MP').recu).toBeCloseTo(15.96);
    expect(texteReste(d, d.Fournitures.X)).toBe('');
  });

  it('la sauvegarde d’un costume garde la répartition, sur les nouveaux ids des pièces', () => {
    const d = monde();
    d.Pieces.CH.ordre = '1'; d.Pieces.RO.ordre = '2';
    d.Fournitures.RU = ruban({ piece_id: 'CH,RO', repartition: JSON.stringify({ CH: '3', RO: '2' }) });
    const ailleurs = vide();
    const r = lireContenu({ format: 'cosplay-planner-archive', version: 1, exporte_le: '', lignes: lignesDuCostume(d, 'MP'), fichiers: {} }, ailleurs);
    const apres = appliquer(ailleurs, r.changements);
    const f = Object.values(apres.Fournitures)[0];
    expect(bilan(apres, f)).toMatchObject({ utilise: 5, reste: 5 });
    expect(Object.values(apres.Pieces).map(p => p.nom).sort()).toEqual(['Chapeau', 'Gants', 'Robe']);
  });
});
