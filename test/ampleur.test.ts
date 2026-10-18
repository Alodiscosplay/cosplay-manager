import { describe, it, expect } from 'vitest';
import { construire } from './aide';
import { avancementCostume, poidsPiece } from '../src/logique/avancement';
import { alertes } from '../src/logique/planning';

/** Une robe préparée (30 % fait sur 40 points), un chapeau et une perruque pas encore étudiés. */
function maryPoppins(chapeau: Record<string, string> = {}, perruque: Record<string, string> = {}) {
  const robe: [string, number, boolean?][] = [
    ['Patron', 4, true], ['Toile', 4, true], ['Couper', 4, true], ['Assembler', 8], ['Broder', 8], ['Ourlet', 4], ['Finitions', 8],
  ];
  return construire({
    pieces: [
      { nom: 'Robe', pistes: [{ nom: '', etapes: robe }] },
      { nom: 'Chapeau', champs: chapeau, pistes: [] },
      { nom: 'Perruque', champs: perruque, pistes: [] },
    ],
  });
}

describe('le % du costume suit le poids des pièces', () => {
  it('une pièce vide compte comme moyenne (12), au lieu de ne rien peser', () => {
    const { d, ids } = maryPoppins();
    d.Pieces[ids.Robe].preparation_finie = 'oui';
    expect(poidsPiece(d, d.Pieces[ids.Chapeau])).toEqual({ poids: 12, source: 'défaut', ampleur: 'moyenne' });
    // robe : 12 points faits sur 40 ; + chapeau 12 + perruque 12 → 12 / 64
    expect(avancementCostume(d, ids.costume).pct).toBeCloseTo(18.75);
  });

  it('l’exemple : robe préparée, chapeau moyen, perruque petite → 30 % devient 21 %', () => {
    const { d, ids } = maryPoppins({ ampleur: 'moyenne' }, { ampleur: 'petite' });
    d.Pieces[ids.Robe].preparation_finie = 'oui';
    expect(Math.round(avancementCostume(d, ids.costume).pct!)).toBe(21); // 12 / (40 + 12 + 4) — avant : 30 %
  });

  it('avec une ampleur, quelques sous-étapes ne changent pas le poids tant que la préparation n’est pas finie', () => {
    const { d, ids } = maryPoppins({ ampleur: 'grande' });
    d.Pieces[ids.Robe].preparation_finie = 'oui';
    const chapeau = d.Pieces[ids.Chapeau];
    d.Pistes.T = { id: 'T', maj: '', supprime: '', piece_id: chapeau.id, nom: '', ordre: '1' };
    d.Etapes.E1 = { id: 'E1', maj: '', supprime: '', piste_id: 'T', piece_id: chapeau.id, titre: 'Patron', poids: '2', fait: 'oui', ordre: '1' };
    d.Etapes.E2 = { id: 'E2', maj: '', supprime: '', piste_id: 'T', piece_id: chapeau.id, titre: 'Couper', poids: '2', ordre: '2' };
    expect(poidsPiece(d, chapeau)).toMatchObject({ poids: 25, source: 'ampleur' });
    // chapeau à moitié fait sur ses sous-étapes connues : 0,5 × 25
    expect(avancementCostume(d, ids.costume).fait).toBeCloseTo(12 + 12.5);
    chapeau.preparation_finie = 'oui';
    expect(poidsPiece(d, chapeau)).toMatchObject({ poids: 4, source: 'sous-étapes' });
  });

  it('sans case cochée, une pièce pèse moyenne par défaut, même avec des sous-étapes ; cochée, ses sous-étapes', () => {
    const { d, ids } = construire({ pieces: [
      { nom: 'Robe', pistes: [{ nom: '', etapes: [['A', 20, true], ['B', 20]] }] },
      { nom: 'Bas', pistes: [{ nom: '', etapes: [['C', 2, true]] }] },
    ] });
    expect(poidsPiece(d, d.Pieces[ids.Robe])).toEqual({ poids: 12, source: 'défaut', ampleur: 'moyenne' });
    expect(avancementCostume(d, ids.costume).pct).toBe(75); // (0,5 × 12 + 1 × 12) / 24
    d.Pieces[ids.Robe].preparation_finie = 'oui';
    d.Pieces[ids.Bas].preparation_finie = 'oui';
    expect(avancementCostume(d, ids.costume).pct).toBeCloseTo(100 * 22 / 42); // poids réels : 40 et 2
  });

  it('une pièce vide marquée terminée compte pour 100 %', () => {
    const { d, ids } = maryPoppins({ statut: 'terminée', ampleur: 'moyenne' }, { ampleur: 'petite' });
    d.Pieces[ids.Robe].preparation_finie = 'oui';
    expect(avancementCostume(d, ids.costume).fait).toBeCloseTo(12 + 12);
  });

  it('un costume dont toutes les sous-étapes sont cochées mais une pièce vide n’est pas à 100 % : le rappel revient', () => {
    const { d, ids } = construire({
      costume: { deadline: '2026-11-01' },
      pieces: [{ nom: 'Robe', pistes: [{ nom: '', etapes: [['A', 2, true]] }] }, { nom: 'Chapeau', pistes: [] }],
    });
    expect(avancementCostume(d, ids.costume).pct).toBeLessThan(100);
    expect(alertes(d, '2026-10-25').some(a => a.texte.includes('deadline'))).toBe(true);
  });
});
