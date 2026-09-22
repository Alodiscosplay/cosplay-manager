// Fichiers de l'appli dans le Drive de l'utilisateur : un dossier « Cosplay Planner »,
// le Sheet de données dedans, et un sous-dossier « Photos ». Retrouvés par leurs appProperties.
import { gjson, gfetch } from './google';
import { NOMS_TABLES, entetes, VERSION_SCHEMA } from '../modele/schema';

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const DOSSIER = 'application/vnd.google-apps.folder';
const CLE = 'cosplayPlanner';

export interface Emplacement { classeurId: string; dossierId: string; photosId: string }

async function chercher(role: string): Promise<string | undefined> {
  const q = encodeURIComponent(`appProperties has { key='${CLE}' and value='${role}' } and trashed=false`);
  const r = await gjson<{ files: { id: string }[] }>(`${DRIVE}?q=${q}&fields=files(id)&spaces=drive`);
  return r.files[0]?.id;
}

async function creerFichier(meta: Record<string, unknown>): Promise<string> {
  const r = await gjson<{ id: string }>(`${DRIVE}?fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta),
  });
  return r.id;
}

/** Retrouve le Sheet de l'utilisateur, ou le crée (première connexion). `cree` = il vient d'être créé. */
export async function trouverOuCreer(): Promise<Emplacement & { cree: boolean }> {
  let dossierId = await chercher('dossier');
  if (!dossierId) dossierId = await creerFichier({ name: 'Cosplay Planner', mimeType: DOSSIER, appProperties: { [CLE]: 'dossier' } });
  let photosId = await chercher('photos');
  if (!photosId) photosId = await creerFichier({ name: 'Photos', mimeType: DOSSIER, parents: [dossierId], appProperties: { [CLE]: 'photos' } });
  let classeurId = await chercher('classeur');
  let cree = false;
  if (!classeurId) {
    classeurId = await creerFichier({
      name: 'Cosplay Planner — données', mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [dossierId], appProperties: { [CLE]: 'classeur' },
    });
    await initialiserClasseur(classeurId);
    cree = true;
  }
  return { classeurId, dossierId, photosId, cree };
}

/** Crée un onglet par table avec sa ligne d'en-têtes, plus `_meta`, et retire la feuille par défaut. */
async function initialiserClasseur(id: string): Promise<void> {
  const SHEETS = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
  const info = await gjson<{ sheets: { properties: { sheetId: number } }[] }>(`${SHEETS}?fields=sheets.properties.sheetId`);
  const requests: unknown[] = [...NOMS_TABLES, '_meta'].map(t => ({
    addSheet: { properties: { title: t, gridProperties: { frozenRowCount: 1 } } },
  }));
  requests.push(...info.sheets.map(s => ({ deleteSheet: { sheetId: s.properties.sheetId } })));
  await gjson(`${SHEETS}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
  await gjson(`${SHEETS}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: [
        ...NOMS_TABLES.map(t => ({ range: `'${t}'!A1`, values: [entetes(t)] })),
        { range: `'_meta'!A1`, values: [['cle', 'valeur'], ['version_schema', String(VERSION_SCHEMA)],
          ['note', "Données de l'appli Cosplay Planner. Modifiable à la main : ne pas renommer les en-têtes ni la colonne id."]] },
      ],
    }),
  });
}

export async function envoyerPhoto(blob: Blob, nom: string, parent: string): Promise<string> {
  return envoyerMultipart({ name: nom, parents: [parent], appProperties: { [CLE]: 'photo' } }, blob);
}

async function envoyerMultipart(meta: Record<string, unknown>, blob: Blob): Promise<string> {
  const corps = new FormData();
  corps.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  corps.append('file', blob);
  const r = await gjson<{ id: string }>(`${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', body: corps });
  return r.id;
}

export async function telecharger(id: string): Promise<Blob> {
  return (await gfetch(`${DRIVE}/${id}?alt=media`)).blob();
}

export async function supprimerFichier(id: string): Promise<void> {
  try {
    await gfetch(`${DRIVE}/${id}`, { method: 'DELETE' });
  } catch (e) {
    if (!String(e).includes('404')) throw e; // déjà supprimé : rien à faire
  }
}

/** Place occupée par les photos de l'appli, en octets. */
export async function placePhotos(): Promise<{ octets: number; nb: number }> {
  let octets = 0, nb = 0, page = '';
  const q = encodeURIComponent(`appProperties has { key='${CLE}' and value='photo' } and trashed=false`);
  do {
    const r = await gjson<{ files: { size?: string }[]; nextPageToken?: string }>(
      `${DRIVE}?q=${q}&fields=nextPageToken,files(size)&pageSize=1000${page ? `&pageToken=${page}` : ''}`);
    for (const f of r.files) { octets += Number(f.size ?? 0); nb++; }
    page = r.nextPageToken ?? '';
  } while (page);
  return { octets, nb };
}

/** Envoie un .pptx dans le Drive en le convertissant en Google Slides ; renvoie l'URL à ouvrir. */
export async function versGoogleSlides(pptx: Blob, nom: string, parent: string): Promise<string> {
  const id = await envoyerMultipart({ name: nom, parents: [parent], mimeType: 'application/vnd.google-apps.presentation' },
    new Blob([pptx], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }));
  return `https://docs.google.com/presentation/d/${id}/edit`;
}

export const urlClasseur = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
