import { describe, it, expect } from 'vitest';
import { lireDistant, fusionner, ecrituresAFaire, clePendant } from '../src/sync/fusion';
import { entetes, donneesVides } from '../src/modele/schema';
import { type Classeur } from '../src/sync/sheets';
import { colonne } from '../src/sync/sheets';

function classeur(taches: string[][]): Classeur {
  const c: Classeur = {};
  c.Taches = { sheetId: 1, nbLignesGrille: 1000, nbColonnesGrille: 26, entetes: entetes('Taches'), valeurs: [entetes('Taches'), ...taches] };
  return c;
}
// Une ligne de l'onglet Taches, rangée d'après ses en-têtes (robuste à l'ajout d'une colonne).
const tache = (id: string, titre: string, maj: string) => {
  const v: Record<string, string> = { id, titre, ordre: '1', maj };
  return entetes('Taches').map(h => v[h] ?? '');
};

describe('fusion local ↔ Sheet', () => {
  it('le Sheet fait foi pour une ligne sans modification locale', () => {
    const local = donneesVides();
    local.Taches.a = { id: 'a', maj: '1', supprime: '', titre: 'ancien' };
    const { donnees } = fusionner(local, lireDistant(classeur([tache('a', 'nouveau', '2')])), {});
    expect(donnees.Taches.a.titre).toBe('nouveau');
  });

  it('une modification locale en attente et plus récente gagne', () => {
    const local = donneesVides();
    local.Taches.a = { id: 'a', maj: '3', supprime: '', titre: 'local' };
    const r = fusionner(local, lireDistant(classeur([tache('a', 'distant', '2')])), { [clePendant('Taches', 'a')]: '3' });
    expect(r.donnees.Taches.a.titre).toBe('local');
    expect(Object.keys(r.pendants)).toEqual(['Taches/a']);
  });

  it('une modification distante plus récente gagne, et annule l’attente', () => {
    const local = donneesVides();
    local.Taches.a = { id: 'a', maj: '1', supprime: '', titre: 'local' };
    const r = fusionner(local, lireDistant(classeur([tache('a', 'distant', '2')])), { 'Taches/a': '1' });
    expect(r.donnees.Taches.a.titre).toBe('distant');
    expect(r.pendants).toEqual({});
  });

  it('garde une ligne créée hors-ligne ; oublie une ligne ni en attente ni dans le Sheet', () => {
    const local = donneesVides();
    local.Taches.neuf = { id: 'neuf', maj: '5', supprime: '', titre: 'hors-ligne' };
    local.Taches.vieux = { id: 'vieux', maj: '1', supprime: '', titre: 'effacé à la main' };
    const r = fusionner(local, lireDistant(classeur([])), { 'Taches/neuf': '5' });
    expect(Object.keys(r.donnees.Taches)).toEqual(['neuf']);
  });

  it('écrit une ligne existante à son numéro, une nouvelle à la fin, dans l’ordre des en-têtes du Sheet', () => {
    const c = classeur([tache('a', 'A', '1'), [], tache('b', 'B', '1')]);
    c.Taches!.entetes = ['titre', 'id', ...entetes('Taches').slice(2), 'colonne perso'];
    const d = donneesVides();
    d.Taches.b = { id: 'b', maj: '2', supprime: '', titre: 'B2' };
    d.Taches.z = { id: 'z', maj: '2', supprime: '', titre: 'Z' };
    // avec les en-têtes réordonnés, l'id est en 2e colonne : on relit
    c.Taches!.valeurs = [c.Taches!.entetes, ['A', 'a'], [], ['B', 'b']];
    const dist = lireDistant(c);
    const e = ecrituresAFaire(d, dist, c, { 'Taches/b': '2', 'Taches/z': '2' });
    expect(e.map(x => [x.numero, x.valeurs[0], x.valeurs[1]])).toEqual([[4, 'B2', 'b'], [5, 'Z', 'z']]);
    expect(e[0].valeurs).toHaveLength(c.Taches!.entetes.length);
  });

  it('noms de colonnes A1', () => {
    expect([colonne(0), colonne(25), colonne(26), colonne(27)]).toEqual(['A', 'Z', 'AA', 'AB']);
  });
});
