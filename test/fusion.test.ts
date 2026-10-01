import { describe, it, expect } from 'vitest';
import { fusionner, lireFichier, versFichier, clePendant } from '../src/sync/fusion';
import { donneesVides, type Ligne } from '../src/modele/schema';

const tache = (id: string, titre: string, maj: string, supprime = ''): Ligne => ({ id, maj, supprime, titre });

describe('fusion appareil ↔ fichier de données', () => {
  it('le fichier fait foi pour une ligne plus récente ailleurs', () => {
    const local = donneesVides();
    local.Taches.a = tache('a', 'ancien', '1');
    const r = fusionner(local, { Taches: { a: tache('a', 'nouveau', '2') } }, {});
    expect(r.donnees.Taches.a.titre).toBe('nouveau');
    expect(r.aEnvoyer).toBe(false);
  });

  it('une modification locale plus récente gagne et part au fichier', () => {
    const local = donneesVides();
    local.Taches.a = tache('a', 'local', '3');
    const r = fusionner(local, { Taches: { a: tache('a', 'distant', '2') } }, { [clePendant('Taches', 'a')]: '3' });
    expect(r.donnees.Taches.a.titre).toBe('local');
    expect(Object.keys(r.pendants)).toEqual(['Taches/a']);
    expect(r.aEnvoyer).toBe(true);
  });

  it('une modification venue d’un autre appareil, plus récente, gagne et annule l’attente', () => {
    const local = donneesVides();
    local.Taches.a = tache('a', 'local', '1');
    const r = fusionner(local, { Taches: { a: tache('a', 'distant', '2') } }, { 'Taches/a': '1' });
    expect(r.donnees.Taches.a.titre).toBe('distant');
    expect(r.pendants).toEqual({});
  });

  it('rien ne disparaît : une ligne absente du fichier est gardée et renvoyée', () => {
    const local = donneesVides();
    local.Taches.neuf = tache('neuf', 'créée hors-ligne', '5');
    local.Taches.ancienne = tache('ancienne', 'absente du fichier', '1');
    const r = fusionner(local, {}, { 'Taches/neuf': '5' });
    expect(Object.keys(r.donnees.Taches).sort()).toEqual(['ancienne', 'neuf']);
    expect(Object.keys(r.pendants).sort()).toEqual(['Taches/ancienne', 'Taches/neuf']);
  });

  it('un fichier perdu se reconstruit entièrement depuis l’appareil', () => {
    const local = donneesVides();
    local.Costumes.c = { id: 'c', maj: '1', supprime: '', nom: 'Ariel' };
    local.Pieces.p = { id: 'p', maj: '1', supprime: '', costume_id: 'c', nom: 'Corset' };
    const r = fusionner(local, lireFichier(null), {});
    expect(r.donnees.Costumes.c.nom).toBe('Ariel');
    expect(r.donnees.Pieces.p.nom).toBe('Corset');
    expect(r.aEnvoyer).toBe(true);
  });

  it('une ligne arrivée d’un autre appareil s’ajoute', () => {
    const r = fusionner(donneesVides(), { Taches: { b: tache('b', 'du téléphone', '4') } }, {});
    expect(r.donnees.Taches.b.titre).toBe('du téléphone');
    expect(r.aEnvoyer).toBe(false);
  });

  it('une suppression se propage comme une modification', () => {
    const local = donneesVides();
    local.Taches.a = tache('a', 'à supprimer', '1');
    const r = fusionner(local, { Taches: { a: tache('a', '', '2', 'purge') } }, {});
    expect(r.donnees.Taches.a.supprime).toBe('purge');
  });

  it('lit son propre format, et ignore le reste', () => {
    const d = donneesVides();
    d.Taches.a = tache('a', 'x', '1');
    expect(lireFichier(JSON.parse(JSON.stringify(versFichier(d, 1, '2026-10-01')))).Taches?.a.titre).toBe('x');
    expect(lireFichier({ format: 'autre chose', donnees: { Taches: {} } })).toEqual({});
    expect(lireFichier('pas du JSON')).toEqual({});
  });
});
