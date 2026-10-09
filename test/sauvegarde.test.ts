import { describe, it, expect } from 'vitest';
import { lireContenu, lireSauvegarde, noterSauvegarde, noterRetrait, lireSauvegardes, FORMAT } from '../src/export/archive';
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

describe('réimport et statut', () => {
  it('un costume sauvegardé en cours revient en cours ; un costume archivé revient terminé', () => {
    const avec = (statut: string) => ({ format: FORMAT, version: 1, exporte_le: '', fichiers: {}, lignes: { Costumes: [{ id: 'c', nom: 'Ariel', statut }] } });
    const statut = (s: string) => lireContenu(avec(s), donneesVides()).changements.find(c => c.table === 'Costumes')!.champs.statut;
    expect(statut('en cours')).toBe('en cours');
    expect(statut('archivé')).toBe('terminé');
  });
});

describe('réimport d’une sauvegarde sur l’appareil : ZIP, dossier décompressé ou costume.json seul', () => {
  const contenuZip = {
    format: FORMAT, version: 1, exporte_le: '', fichiers: { 'local:a': 'photos/robe/1.jpg' },
    lignes: { Costumes: [{ id: 'c', nom: 'Ariel', statut: 'en cours' }], Photos: [{ id: 'p', costume_id: 'c', drive_id: 'local:a' }] },
  };
  const json = () => new File([JSON.stringify(contenuZip)], 'costume.json');
  const dansDossier = (f: File, chemin: string) => Object.defineProperty(f, 'webkitRelativePath', { value: chemin });

  it('ZIP tel quel, même si tout est rangé dans un sous-dossier', async () => {
    const { default: Zip } = await import('jszip');
    const zip = new Zip();
    zip.file('Ariel/costume.json', JSON.stringify(contenuZip));
    zip.file('Ariel/photos/robe/1.jpg', 'jpg');
    const f = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'ariel.zip');
    const r = await lireSauvegarde([f], donneesVides());
    expect(r.photos.map(p => !!p.blob)).toEqual([true]);
  });

  it('dossier décompressé : les photos sont retrouvées par leur chemin', async () => {
    const r = await lireSauvegarde([
      dansDossier(json(), 'ariel-sauvegarde/costume.json'),
      dansDossier(new File(['jpg'], '1.jpg'), 'ariel-sauvegarde/photos/robe/1.jpg'),
    ], donneesVides());
    expect(r.photos.map(p => !!p.blob)).toEqual([true]);
    expect(r.changements.find(c => c.table === 'Costumes')!.champs.nom).toBe('Ariel');
  });

  it('costume.json seul : les données reviennent, les photos manquent', async () => {
    const r = await lireSauvegarde([json()], donneesVides());
    expect(r.changements.some(c => c.table === 'Photos')).toBe(true);
    expect(r.photos.map(p => p.blob)).toEqual([null]);
  });

  it('refuse ce qui ne contient pas de costume.json', async () => {
    await expect(lireSauvegarde([new File(['x'], 'photo.jpg')], donneesVides())).rejects.toThrow();
  });
});
