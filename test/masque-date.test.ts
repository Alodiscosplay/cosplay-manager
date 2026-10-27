import { describe, it, expect } from 'vitest';
import { masqueDate, lireJourSaisi } from '../src/logique/dates';

/** Tape les caractères un par un, comme sur le clavier numérique d'un téléphone. */
const taper = (touches: string, depart = '') => [...touches].reduce((v, t) => masqueDate(v + t, v), depart);
/** Efface n caractères à la fin. */
const effacer = (v: string, n: number) => Array.from({ length: n }).reduce<string>(x => masqueDate(x.slice(0, -1), x), v);

describe('les « / » d’une date s’ajoutent pendant la frappe', () => {
  it('deux chiffres, une barre : 24042027 → 24/04/2027', () => {
    expect(taper('24')).toBe('24/');
    expect(taper('2404')).toBe('24/04/');
    expect(taper('24042027')).toBe('24/04/2027');
    expect(lireJourSaisi(taper('24042027'))).toBe('2027-04-24');
    expect(taper('2404202799')).toBe('24/04/2027'); // pas plus de 8 chiffres
  });

  it('en effaçant, la barre ne revient pas', () => {
    expect(effacer('24/04/', 1)).toBe('24/04');
    expect(effacer('24/04/', 3)).toBe('24/');
    expect(effacer('24/', 1)).toBe('24');
    expect(effacer('24/', 2)).toBe('2');
  });

  it('sur ordinateur, les autres saisies restent possibles', () => {
    expect(taper('3/11/2026')).toBe('03/11/2026');
    expect(lireJourSaisi(taper('3/11/2026'))).toBe('2026-11-03');
    expect(taper('3-11-2026')).toBe('3-11-2026');
    expect(masqueDate('2026-11-03', '')).toBe('2026-11-03'); // collée d’un bloc
    expect(taper('241126')).toBe('24/11/26');
    expect(lireJourSaisi('24/11/26')).toBe('2026-11-24');
  });
});
