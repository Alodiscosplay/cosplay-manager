// Photos : réduites dans le navigateur, gardées en local (IndexedDB), envoyées au Drive à la synchro.
// Un id « local:… » désigne une photo pas encore envoyée ; sinon c'est l'id du fichier Drive.
import { signal } from '@preact/signals';
import { lirePhoto, ecrirePhoto } from './idb';
import { baseLocale, mode } from './store';
import { telecharger } from '../sync/drive';
import { jetonValide } from '../sync/google';

const urls = new Map<string, string>();
const enCours = new Map<string, Promise<string | null>>();
/** Incrémenté quand une photo arrive : les composants qui attendent se redessinent. */
export const photosChargees = signal(0);

export function urlConnue(id: string): string | undefined { return urls.get(id); }

export async function blobPhoto(id: string): Promise<Blob | null> {
  const base = baseLocale();
  if (!base || !id) return null;
  const local = await lirePhoto(base, id);
  if (local) return local;
  if (id.startsWith('local:') || mode.value !== 'google' || !jetonValide()) return null;
  const blob = await telecharger(id);
  await ecrirePhoto(base, id, blob);
  return blob;
}

export function chargerPhoto(id: string): Promise<string | null> {
  if (urls.has(id)) return Promise.resolve(urls.get(id)!);
  if (!enCours.has(id)) {
    enCours.set(id, blobPhoto(id).then(b => {
      enCours.delete(id);
      if (!b) return null;
      const u = URL.createObjectURL(b);
      urls.set(id, u);
      photosChargees.value++;
      return u;
    }).catch(() => { enCours.delete(id); return null; }));
  }
  return enCours.get(id)!;
}

/** Réduit une image (1600 px max, JPEG), l'enregistre en local et renvoie son id « local:… ». */
export async function ajouterImage(fichier: Blob, cote = 1600): Promise<string> {
  const blob = await reduire(fichier, cote, 0.85);
  const id = `local:${crypto.randomUUID()}`;
  const base = baseLocale();
  if (base) await ecrirePhoto(base, id, blob);
  urls.set(id, URL.createObjectURL(blob));
  photosChargees.value++;
  return id;
}

export async function reduire(fichier: Blob, cote: number, qualite: number): Promise<Blob> {
  const img = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
  const echelle = Math.min(1, cote / Math.max(img.width, img.height));
  const w = Math.round(img.width * echelle), h = Math.round(img.height * echelle);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  img.close();
  return new Promise((ok, ko) => canvas.toBlob(b => (b ? ok(b) : ko(new Error('Image illisible'))), 'image/jpeg', qualite));
}

export function blobVersDataUrl(b: Blob): Promise<string> {
  return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = ko; r.readAsDataURL(b); });
}

/** Vignette légère (pour garder une trace d'un costume archivé dans les données : < 50 000 caractères). */
export async function vignette(id: string): Promise<string> {
  const b = await blobPhoto(id);
  if (!b) return '';
  for (const [cote, q] of [[240, 0.7], [180, 0.6], [120, 0.5]] as const) {
    const url = await blobVersDataUrl(await reduire(b, cote, q));
    if (url.length < 45000) return url;
  }
  return '';
}

/** Dimensions d'une image (pour la mise en page du dossier WIP). */
export async function dimensions(b: Blob): Promise<{ w: number; h: number }> {
  const img = await createImageBitmap(b);
  const r = { w: img.width, h: img.height };
  img.close();
  return r;
}

/** Une photo prête pour la fiche PDF : réduite (900 px), en JPEG, avec ses dimensions ; null si introuvable. */
export async function imagePourPdf(id: string): Promise<{ url: string; w: number; h: number } | null> {
  const b = await blobPhoto(id).catch(() => null);
  if (!b) return null;
  const r = await reduire(b, 900, 0.8);
  const { w, h } = await dimensions(r);
  return { url: await blobVersDataUrl(r), w, h };
}
