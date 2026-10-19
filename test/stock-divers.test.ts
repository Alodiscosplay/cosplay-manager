import { describe, it, expect } from 'vitest';
import { vide } from './aide';
import { type Ligne } from '../src/modele/schema';
import { regrouperAchats, budgetCostume, nomDestination, horsCostume } from '../src/logique/budget';

const l = (id: string, champs: Record<string, string>): Ligne => ({ id, maj: '', supprime: '', ...champs });

describe('fournitures pour le stock ou divers', () => {
  const monde = () => {
    const d = vide();
    d.Costumes.MP = l('MP', { nom: 'Mary Poppins', statut: 'en cours', ordre: '1' });
    d.Fournitures.a = l('a', { costume_id: 'MP', libelle: 'Satin', prix_unitaire: '10', statut: 'à acheter' });
    d.Fournitures.b = l('b', { costume_id: '', destination: 'stock', libelle: 'Fil blanc', prix_unitaire: '3', statut: 'à acheter' });
    d.Fournitures.c = l('c', { costume_id: '', destination: 'divers', libelle: 'Aiguilles', prix_unitaire: '2', statut: 'à acheter' });
    d.Fournitures.e = l('e', { costume_id: '', libelle: 'Ancienne sans costume', statut: 'à acheter' });
    return d;
  };

  it('apparaissent dans les achats, après les costumes : Stock puis Divers', () => {
    const g = regrouperAchats(monde(), {}, 'costume');
    expect(g.map(x => [x.costume?.nom ?? x.hors, x.lignes.map(f => f.id)])).toEqual([['Mary Poppins', ['a']], ['stock', ['b']], ['divers', ['c', 'e']]]);
  });

  it('se filtrent comme un costume, et ne comptent dans aucun budget', () => {
    const d = monde();
    expect(regrouperAchats(d, { costumeId: '__stock' }).flatMap(x => x.lignes.map(f => f.id))).toEqual(['b']);
    expect(budgetCostume(d, 'MP').total).toBe(10);
    expect([nomDestination(d, d.Fournitures.b), nomDestination(d, d.Fournitures.e), horsCostume(d.Fournitures.a)]).toEqual(['Stock', 'Divers', '']);
  });
});
