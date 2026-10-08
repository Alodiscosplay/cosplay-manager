import { describe, it, expect } from 'vitest';
import { lireContenu, noterSauvegarde, noterRetrait, lireSauvegardes, FORMAT } from '../src/export/archive';
import { donneesVides, type Ligne } from '../src/modele/schema';

const contenu = (lieu?: 'drive') => ({
  format: FORMAT, version: 1, exporte_le: '2026-10-08', fichiers: {}, ...(lieu ? { lieu } : {}),
  lignes: {
    Costumes: [{ id: 'c', nom: 'Mary', statut: 'en cours', image_ref: 'drv-ref' }],
    Photos: [{ id: 'p', costume_id: 'c', drive_id: 'drv-1' }, { id: 'q', costume_id: 'c', drive_id: 'local:x' }],
  },
});

describe('sauvegarde d’un costume', () => {
  it('réimport depuis le Drive : les photos gardent leur identifiant Drive', () => {
    const { changements, photos } = lireContenu(contenu('drive'), donneesVides());
    const ph = changements.filter(c => c.table === 'Photos').map(c => c.champs.drive_id);
    expect(ph).toEqual(['drv-1', '']); // une photo restée locale n'a pas de copie à retrouver
    expect(changements.find(c => c.table === 'Costumes')!.champs.image_ref).toBe('drv-ref');
    expect(photos).toEqual([]);
  });

  it('réimport d’un ZIP : aucun identifiant Drive repris (les fichiers ont pu être supprimés)', () => {
    const { changements } = lireContenu(contenu(), donneesVides());
    expect(changements.filter(c => c.table === 'Photos').map(c => c.champs.drive_id)).toEqual(['', '']);
  });

  it('refuse un fichier qui n’est pas une sauvegarde', () => {
    expect(() => lireContenu({ format: 'autre' }, donneesVides())).toThrow();
  });

  it('garde l’historique des sauvegardes et compte les photos retirées sur la dernière', () => {
    let c: Ligne = { id: 'c', maj: '', supprime: '', sauvegardes: '' };
    const appliquer = (ch: { champs: Record<string, string> }) => { c = { ...c, ...ch.champs }; };
    appliquer(noterSauvegarde(c, { date: '2026-10-01T10:00', lieu: 'appareil', retirees: 0 }));
    appliquer(noterSauvegarde(c, { date: '2026-10-08T10:00', lieu: 'drive', retirees: 0 }));
    appliquer(noterRetrait(c, 12));
    expect(lireSauvegardes(c).map(t => [t.lieu, t.retirees])).toEqual([['appareil', 0], ['drive', 12]]);
  });
});
