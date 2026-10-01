// Fichiers de l'appli dans le Drive de l'utilisatrice.
//  - Les DONNÉES : un seul fichier JSON dans l'espace caché réservé à l'appli (`appDataFolder`, portée
//    `drive.appdata`). Invisible dans le Drive, inaccessible aux autres applis, et sans corbeille.
//  - Ce qu'elle doit voir : un dossier « Cosplay Planner » (portée `drive.file`), créé seulement s'il sert
//    — copie des photos, export vers Google Slides — avec un sous-dossier « Photos ».
import { gjson, gfetch, ErreurIntrouvable } from './google';

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const DOSSIER = 'application/vnd.google-apps.folder';
const CLE = 'cosplayPlanner';
const NOM_DONNEES = 'donnees.json';

/** Où vivent les fichiers de l'appli. Le dossier visible et ses Photos n'existent que s'ils ont servi. */
export interface Emplacement { donneesId?: string; dossierId?: string; photosId?: string }

// ---------- Données (espace caché) ----------

/** Le fichier de données, s'il existe déjà (un autre appareil a pu le créer). */
export async function trouverDonnees(): Promise<string | undefined> {
  const q = encodeURIComponent(`name='${NOM_DONNEES}' and trashed=false`);
  const r = await gjson<{ files: { id: string }[] }>(`${DRIVE}?spaces=appDataFolder&q=${q}&fields=files(id)&orderBy=createdTime`);
  return r.files[0]?.id;
}

/** Numéro de version du fichier : il augmente à chaque écriture, d'où qu'elle vienne. */
export async function versionDonnees(id: string): Promise<string> {
  return (await gjson<{ version: string }>(`${DRIVE}/${id}?fields=version`)).version;
}

/** Le contenu et sa version ; null si le fichier n'existe plus. */
export async function lireDonnees(id: string): Promise<{ contenu: unknown; version: string } | null> {
  try {
    const version = await versionDonnees(id);
    const texte = await (await gfetch(`${DRIVE}/${id}?alt=media`)).text();
    let contenu: unknown = null;
    try { contenu = JSON.parse(texte); } catch { /* fichier abîmé : lu comme vide, il sera réécrit */ }
    return { contenu, version };
  } catch (e) {
    if (e instanceof ErreurIntrouvable) return null;
    throw e;
  }
}

/** Écrit le fichier de données (le crée dans l'espace caché s'il n'existe pas) ; renvoie son id. */
export async function ecrireDonnees(id: string | undefined, contenu: unknown): Promise<string> {
  const corps = new Blob([JSON.stringify(contenu)], { type: 'application/json' });
  if (id) {
    try {
      await gjson(`${UPLOAD}/${id}?uploadType=media&fields=id`, { method: 'PATCH', body: corps });
      return id;
    } catch (e) {
      if (!(e instanceof ErreurIntrouvable)) throw e; // disparu entre-temps : on le recrée
    }
  }
  return envoyerMultipart({ name: NOM_DONNEES, parents: ['appDataFolder'], mimeType: 'application/json' }, corps);
}

/** Poids du fichier de données, en octets. */
export async function tailleDonnees(id: string): Promise<number> {
  return Number((await gjson<{ size?: string }>(`${DRIVE}/${id}?fields=size`)).size ?? 0);
}

// ---------- Dossier visible (créé à la demande) ----------

async function chercher(role: string): Promise<string | undefined> {
  const q = encodeURIComponent(`appProperties has { key='${CLE}' and value='${role}' } and trashed=false`);
  const r = await gjson<{ files: { id: string }[] }>(`${DRIVE}?q=${q}&fields=files(id)&spaces=drive`);
  return r.files[0]?.id;
}

async function creerDossier(nom: string, role: string, parent?: string): Promise<string> {
  const r = await gjson<{ id: string }>(`${DRIVE}?fields=id`, {
    method: 'POST',
    body: JSON.stringify({ name: nom, mimeType: DOSSIER, appProperties: { [CLE]: role }, ...(parent ? { parents: [parent] } : {}) }),
  });
  return r.id;
}

/** Le dossier « Cosplay Planner » visible dans le Drive ; créé la première fois qu'il sert. */
export async function dossierVisible(e: Emplacement): Promise<string> {
  e.dossierId ??= (await chercher('dossier')) ?? (await creerDossier('Cosplay Planner', 'dossier'));
  return e.dossierId;
}

/** Son sous-dossier « Photos », destination par défaut des copies de photos. */
export async function dossierPhotosParDefaut(e: Emplacement): Promise<string> {
  e.photosId ??= (await chercher('photos')) ?? (await creerDossier('Photos', 'photos', await dossierVisible(e)));
  return e.photosId;
}

// ---------- Photos et exports ----------

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
    if (!(e instanceof ErreurIntrouvable)) throw e; // déjà supprimé : rien à faire
  }
}

/** Place occupée par les copies de photos de l'appli, en octets. */
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
