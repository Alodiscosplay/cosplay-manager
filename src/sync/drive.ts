// Fichiers de l'appli dans le Drive de l'utilisatrice.
//  - Les DONNÉES : un seul fichier JSON dans l'espace caché réservé à l'appli (`appDataFolder`, portée
//    `drive.appdata`). Invisible dans le Drive, inaccessible aux autres applis, et sans corbeille.
//  - Ce qu'elle doit voir : un dossier « Cosplay Manager » (portée `drive.file`), créé seulement s'il sert
//    — copie des photos, sauvegardes, export vers Google Slides — rangé par costume :
//    Cosplay Manager / <costume> / Références | WIP / <pièce>, et <costume> / Sauvegardes.
import { gjson, gfetch, ErreurIntrouvable } from './google';

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const DOSSIER = 'application/vnd.google-apps.folder';
const CLE = 'cosplayPlanner';
const NOM_DONNEES = 'donnees.json';

/**
 * Où vivent les fichiers de l'appli. Le dossier visible n'existe que s'il a servi. `photosId` : l'ancien
 * niveau « Photos » (avant le 2026-10-09), vidé et retiré par `migrerSansPhotos`.
 * `dossiers` et `places` sont des mémos propres à l'appareil (dossiers rangés déjà trouvés, dossier
 * où se trouve chaque photo) : ils évitent de redemander au Drive ce qu'on sait déjà.
 */
export interface Emplacement {
  donneesId?: string; dossierId?: string; photosId?: string;
  dossiers?: Record<string, { id: string; nom: string }>;
  places?: Record<string, string>;
  sansPhotos?: boolean;
}

/** Un dossier du rangement des photos : son rôle, l'id de ce qu'il représente, et son nom. */
export interface PlaceDossier { role: string; ref: string; nom: string }

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

async function creerDossier(nom: string, role: string, parent?: string, plus: Record<string, string> = {}): Promise<string> {
  const r = await gjson<{ id: string }>(`${DRIVE}?fields=id`, {
    method: 'POST',
    body: JSON.stringify({ name: nom, mimeType: DOSSIER, appProperties: { [CLE]: role, ...plus }, ...(parent ? { parents: [parent] } : {}) }),
  });
  return r.id;
}

/** Le dossier « Cosplay Manager » visible dans le Drive ; créé la première fois qu'il sert. */
export async function dossierVisible(e: Emplacement): Promise<string> {
  e.dossierId ??= (await chercher('dossier')) ?? (await creerDossier('Cosplay Manager', 'dossier'));
  return e.dossierId;
}

/**
 * Le dossier de l'appli est retrouvé par son marqueur et non par son nom ou sa place : on peut le renommer
 * depuis l'appli et le déplacer dans le Drive. Nom actuel ; null s'il n'existe pas encore.
 */
export async function nomDossierAppli(e: Emplacement): Promise<string | null> {
  e.dossierId ??= await chercher('dossier');
  if (!e.dossierId) return null;
  try {
    return (await gjson<{ name: string }>(`${DRIVE}/${e.dossierId}?fields=name`)).name;
  } catch (x) {
    if (!(x instanceof ErreurIntrouvable)) throw x;
    e.dossierId = undefined; // supprimé pour de bon : il sera recréé quand il servira
    return null;
  }
}

/** Renomme le dossier de l'appli ; s'il n'existe pas encore, le crée à la racine du Drive sous ce nom. */
export async function nommerDossierAppli(e: Emplacement, nom: string): Promise<void> {
  e.dossierId ??= await chercher('dossier');
  if (e.dossierId) {
    try {
      await gjson(`${DRIVE}/${e.dossierId}?fields=id`, { method: 'PATCH', body: JSON.stringify({ name: nom }) });
      return;
    } catch (x) {
      if (!(x instanceof ErreurIntrouvable)) throw x;
    }
  }
  e.dossierId = await creerDossier(nom, 'dossier');
}

/**
 * Avant le 2026-10-09, les costumes étaient rangés dans un niveau « Photos » du dossier de l'appli. On
 * remonte son contenu d'un cran, puis on met le dossier vide à la corbeille. Une seule fois par appareil.
 */
async function migrerSansPhotos(e: Emplacement): Promise<void> {
  if (e.sansPhotos) return;
  const ancien = e.photosId ?? (await chercher('photos'));
  if (ancien) {
    const racine = await dossierVisible(e);
    const q = encodeURIComponent(`'${ancien}' in parents and trashed=false`);
    let page = '';
    do {
      const r = await gjson<{ files: { id: string }[]; nextPageToken?: string }>(`${DRIVE}?q=${q}&fields=nextPageToken,files(id)&pageSize=200${page ? `&pageToken=${page}` : ''}`);
      for (const f of r.files) await deplacer(f.id, racine, ancien);
      page = r.nextPageToken ?? '';
    } while (page);
    await gjson(`${DRIVE}/${ancien}?fields=id`, { method: 'PATCH', body: JSON.stringify({ trashed: true }) }).catch(() => undefined);
  }
  e.photosId = undefined;
  e.sansPhotos = true;
}

/**
 * La chaîne de dossiers sous le dossier des photos (du plus haut au plus bas) ; renvoie l'id du dernier.
 * Chaque dossier est retrouvé par son rôle et l'id du costume ou de la pièce, jamais par son nom : un
 * costume renommé renomme son dossier, et on peut déplacer les dossiers dans le Drive.
 */
export async function dossierRange(e: Emplacement, chemin: PlaceDossier[]): Promise<string> {
  await migrerSansPhotos(e);
  let parent = await dossierVisible(e);
  e.dossiers ??= {};
  for (const p of chemin) {
    const cle = `${p.role}:${p.ref}`;
    let connu = e.dossiers[cle];
    if (!connu) {
      const q = encodeURIComponent(`appProperties has { key='${CLE}' and value='${p.role}' } and appProperties has { key='ref' and value='${p.ref}' } and trashed=false`);
      const id = (await gjson<{ files: { id: string }[] }>(`${DRIVE}?q=${q}&fields=files(id,name)&spaces=drive`)).files[0]?.id;
      connu = id ? { id, nom: '' } : { id: await creerDossier(p.nom, p.role, parent, { ref: p.ref }), nom: p.nom };
      e.dossiers[cle] = connu;
    }
    if (connu.nom !== p.nom) {
      await gjson(`${DRIVE}/${connu.id}?fields=id`, { method: 'PATCH', body: JSON.stringify({ name: p.nom }) });
      connu.nom = p.nom;
    }
    parent = connu.id;
  }
  return parent;
}

// ---------- Sauvegardes d'un costume (dossier « Sauvegardes » du costume) ----------

/** Un sous-dossier daté pour une sauvegarde, dans le dossier `parent`. */
export async function dossierDeSauvegarde(nom: string, parent: string): Promise<string> {
  return creerDossier(nom, 'sauvegarde-dossier', parent);
}

/**
 * Dépose un fichier d'une sauvegarde. Les données réimportables (`costume.json`) portent le marqueur
 * « sauvegarde » et le nom du costume : c'est par eux qu'on les retrouve pour un réimport.
 */
export async function deposerFichier(nom: string, blob: Blob, parent: string, donnees?: { costume: string }): Promise<string> {
  const props: Record<string, string> = { [CLE]: donnees ? 'sauvegarde' : 'sauvegarde-fichier' };
  if (donnees) props.costume = donnees.costume.slice(0, 80);
  return envoyerMultipart({ name: nom, parents: [parent], mimeType: blob.type || undefined, appProperties: props }, blob);
}

export interface SauvegardeDrive { id: string; costume: string; date: string }

/** Les sauvegardes de costume présentes sur le Drive, les plus récentes d'abord. */
export async function listerSauvegardes(): Promise<SauvegardeDrive[]> {
  const q = encodeURIComponent(`appProperties has { key='${CLE}' and value='sauvegarde' } and trashed=false`);
  const r = await gjson<{ files: { id: string; createdTime: string; appProperties?: Record<string, string> }[] }>(
    `${DRIVE}?q=${q}&fields=files(id,createdTime,appProperties)&orderBy=createdTime desc&pageSize=200&spaces=drive`);
  return r.files.map(f => ({ id: f.id, costume: f.appProperties?.costume ?? '', date: f.createdTime }));
}

/** Met un fichier dans la corbeille du Drive (récupérable 30 jours depuis le Drive). */
export async function mettreALaCorbeille(id: string): Promise<void> {
  try {
    await gjson(`${DRIVE}/${id}?fields=id`, { method: 'PATCH', body: JSON.stringify({ trashed: true }) });
  } catch (e) {
    if (!(e instanceof ErreurIntrouvable)) throw e;
  }
}

/** Le dossier où se trouve un fichier. */
export async function dossierDe(id: string): Promise<string | undefined> {
  return (await gjson<{ parents?: string[] }>(`${DRIVE}/${id}?fields=parents`)).parents?.[0];
}

/** Déplace un fichier d'un dossier à un autre. */
export async function deplacer(id: string, vers: string, depuis: string | undefined): Promise<void> {
  await gjson(`${DRIVE}/${id}?addParents=${vers}${depuis ? `&removeParents=${depuis}` : ''}&fields=id`, { method: 'PATCH', body: '{}' });
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
