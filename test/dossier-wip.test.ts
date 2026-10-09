import { describe, it, expect } from 'vitest';
import { construire } from './aide';
import { planWip, lireReglagesWip, genererWip, couleurHex } from '../src/export/dossierWip';
import type { Ligne } from '../src/modele/schema';

const donnees = () => {
  const { d, ids } = construire({
    costume: { nom: 'Reine rouge', personnage: 'La Reine rouge', oeuvre: 'Alice au pays des merveilles', couleur: '0' },
    pieces: [
      { nom: 'Corset', pistes: [{ nom: '', etapes: ['Toile'] }], champs: { materiaux: 'Coutil, baleines spirales', techniques: 'Triplure', origine: 'fait-main' } },
      { nom: 'Perruque', pistes: [{ nom: '', etapes: ['Coiffage'] }], champs: { partie_wip: 'wig' } },
      { nom: 'Chaussures', pistes: [{ nom: '', etapes: ['Peinture'] }], champs: { partie_wip: 'divers', origine: 'modifie' } },
    ],
  });
  const photo = (id: string, piece: string, date: string, extra: Record<string, string> = {}) =>
    (d.Photos[id] = { id, maj: '', supprime: '', costume_id: ids.costume, piece_id: piece, drive_id: `x-${id}`, date, dans_wip: 'oui', ...extra } as Ligne);
  for (let i = 1; i <= 7; i++) photo(`c${i}`, ids['Corset'], `2026-09-0${i}`);
  photo('w1', ids['Perruque'], '2026-09-10');
  photo('r1', '', '2026-08-01', { type: 'reference', dans_wip: '' });
  return { d, c: d.Costumes[ids.costume], ids };
};
const types = (p: ReturnType<typeof planWip>) => p.diapos.map(x => (x.t === 'intercalaire' ? `[${x.titre}]` : x.t === 'piece' ? `piece${x.suite ? '+' : ''}` : x.t));

describe('dossier WIP : le plan suit ce qu’on a demandé', () => {
  it('par défaut : couverture, identité, sommaire, puis les parties avec intercalaires', () => {
    const { d, c } = donnees();
    const p = planWip(d, c, lireReglagesWip(d, c));
    // Corset : 7 photos → 4 sur la page aux textes, 3 sur la suite ; pas de comparaison remplie.
    expect(types(p)).toEqual(['couverture', 'identite', 'sommaire', '[WIP Costume]', 'piece', 'piece+', '[WIP Wig]', 'piece']);
    expect(p.sections).toEqual([['WIP Costume', 4], ['WIP Wig', 7]]);
  });

  it('concours général : page du personnage, sans intercalaires ni sommaire ; une pièce sans photo ni texte disparaît', () => {
    const { d, c } = donnees();
    const r = { ...lireReglagesWip(d, c), identite: false, intercalaires: false, sommaire: false };
    expect(types(planWip(d, c, r))).toEqual(['couverture', 'personnage', 'piece', 'piece+', 'piece']);
  });

  it('les comparaisons remplies passent en tête, la recherche documentée aussi', () => {
    const { d, c } = donnees();
    c.recherche = 'Élisabeth Iʳᵉ…';
    const r = { ...lireReglagesWip(d, c), recherche: true, sommaire: false, paires: { 'costume-face': { ref: 'x-r1', res: 'x-c7' }, 'wig-dos': {} } };
    expect(types(planWip(d, c, r)).slice(0, 5)).toEqual(['couverture', 'identite', 'recherche', '[Images et photos globales]', 'comparaison']);
  });

  it('une pièce exclue et l’ordre choisi sont respectés', () => {
    const { d, c, ids } = donnees();
    const r = { ...lireReglagesWip(d, c), intercalaires: false, sommaire: false, exclues: [ids['Corset']] };
    expect(types(planWip(d, c, r))).toEqual(['couverture', 'identite', 'piece']);
  });

  it('produit un fichier PowerPoint', async () => {
    const { d, c } = donnees();
    const b = await genererWip(d, c.id, lireReglagesWip(d, c), { pseudo: 'Alodis' });
    expect(b.size).toBeGreaterThan(10_000);
  });

  it('la couleur du projet sert d’accent', () => {
    expect(couleurHex({ id: 'c', maj: '', supprime: '', couleur: '0' })).toBe('AE2929');
    expect(couleurHex({ id: 'c', maj: '', supprime: '', couleur: 'gris' })).toBe('7A7F8F');
  });
});

describe('partie d’une pièce', () => {
  it('se devine d’après son nom tant qu’on ne l’a pas choisie', async () => {
    const { partieDe } = await import('../src/export/dossierWip');
    const p = (nom: string, partie_wip = '') => ({ id: 'x', maj: '', supprime: '', nom, partie_wip });
    expect([partieDe(p('Perruque')), partieDe(p('Wig casque')), partieDe(p('Maquillage')), partieDe(p('Corset')), partieDe(p('Perruque', 'divers'))])
      .toEqual(['wig', 'wig', 'makeup', 'costume', 'divers']);
  });
});
