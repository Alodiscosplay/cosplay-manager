// Copie de travail locale (IndexedDB) : l'appli démarre sans réseau et ne perd rien hors-ligne.
// Une base par compte (ou « demo »), pour que deux comptes sur le même appareil ne se mélangent jamais.
import { openDB, type IDBPDatabase } from 'idb';

export type Base = IDBPDatabase;

export async function ouvrirBase(nom: string): Promise<Base> {
  return openDB(`cosplay-planner-${nom}`, 1, {
    upgrade(db) {
      db.createObjectStore('kv');      // 'donnees', 'meta'
      db.createObjectStore('photos');  // id (local:… ou id Drive) → Blob
    },
  });
}

export const lireKv = <T>(b: Base, cle: string) => b.get('kv', cle) as Promise<T | undefined>;
export const ecrireKv = (b: Base, cle: string, v: unknown) => b.put('kv', v, cle);
export const lirePhoto = (b: Base, id: string) => b.get('photos', id) as Promise<Blob | undefined>;
export const ecrirePhoto = (b: Base, id: string, blob: Blob) => b.put('photos', blob, id);
export const effacerPhoto = (b: Base, id: string) => b.delete('photos', id);
