// État de l'appli : données réactives, enregistrement local, synchro avec le fichier caché du Drive, annulation.
import { signal } from '@preact/signals';
import { type Donnees, type NomTable, donneesVides, NOMS_TABLES, VERSION_SCHEMA, vivant } from '../modele/schema';
import { appliquerChangements, viderAnciensSupprimes, supprimer, type Changement } from './operations';
import { ouvrirBase, lireKv, ecrireKv, type Base, lirePhoto, ecrirePhoto, effacerPhoto } from './idb';
import { activationsDuJour } from '../logique/activation';
import { aujourdhui } from '../logique/dates';
import { MODELES_PAR_DEFAUT } from '../modele/modelesParDefaut';
import { type Pendants, clePendant, fusionner, lireFichier, versFichier, tablesInconnues } from '../sync/fusion';
import { trouverDonnees, lireDonnees, versionDonnees, ecrireDonnees, envoyerPhoto, nomDossierAppli, nommerDossierAppli, dossierRange, dossierDe, deplacer, dossierDeSauvegarde, deposerFichier, supprimerFichier, type Emplacement, type PlaceDossier } from '../sync/drive';
import { ErreurConnexion, ErreurReseau, ErreurIntrouvable, jetonValide, emailConnu } from '../sync/google';
import { donneesDemo } from '../demo/donneesDemo';

export type Mode = 'demo' | 'google';
const CLE_MODE = 'cosplay-planner.mode';

// Les photos vivent sur l'appareil ; `photosDrive` (coché par l'utilisatrice) en envoie une copie dans
// le dossier de l'appli sur le Drive, dont `nomDossierPhotos` garde le dernier nom connu, pour l'affichage.
interface Meta { pendants: Pendants; emplacement?: Emplacement; derniere?: string; photosDrive?: boolean; nomDossierPhotos?: string }

export const mode = signal<Mode | null>(lireMode());
export const donnees = signal<Donnees>(donneesVides());
export const pret = signal(false);
export const jour = signal(aujourdhui());
/** Une copie des photos part-elle sur le Drive ? Non par défaut. Réglage propre à cet appareil. */
export const photosSurDrive = signal(false);
/** Nom du dossier des photos sur le Drive ; null tant qu'il n'existe pas. */
export const dossierPhotos = signal<string | null>(null);

export type EtatSync = 'local' | 'ok' | 'envoi' | 'hors-ligne' | 'reconnexion' | 'erreur';
export const sync = signal<{ etat: EtatSync; message?: string; derniere?: string; attente: number }>({ etat: 'local', attente: 0 });

export interface Toast { texte: string; annuler?: () => void; id: number }
export const toast = signal<Toast | null>(null);

let base: Base | null = null;
let meta: Meta = { pendants: {} };

function lireMode(): Mode | null {
  try { const m = localStorage.getItem(CLE_MODE); return m === 'demo' || m === 'google' ? m : null; } catch { return null; }
}

export const emplacement = () => meta.emplacement;
export const baseLocale = () => base;

// ---------- Démarrage ----------

export async function demarrer(m: Mode): Promise<void> {
  pret.value = false;
  const nomBase = m === 'demo' ? 'demo' : (emailConnu() ?? 'google');
  base = await ouvrirBase(nomBase);
  const d = await lireKv<Donnees>(base, 'donnees');
  meta = (await lireKv<Meta>(base, 'meta')) ?? { pendants: {} };
  photosSurDrive.value = meta.photosDrive === true;
  dossierPhotos.value = meta.nomDossierPhotos ?? null;
  const complet = donneesVides();
  if (d) for (const t of NOMS_TABLES) complet[t] = d[t] ?? {};
  donnees.value = complet;
  mode.value = m;
  localStorage.setItem(CLE_MODE, m);

  if (m === 'demo' && !d) donnees.value = donneesDemo(aujourdhui());
  jour.value = aujourdhui();
  appliquerActivations();
  { const vieux = viderAnciensSupprimes(donnees.value); if (vieux.length) faire(vieux); }
  majEtatSync();
  pret.value = true;
  if (!photosSurDrive.value) protegerPhotosLocales();
  if (m === 'google') void synchroniser();
  else await enregistrer();
}

export async function quitter(): Promise<void> {
  localStorage.removeItem(CLE_MODE);
  base?.close();
  base = null;
  mode.value = null;
  donnees.value = donneesVides();
}

/** Remet le mode démo à zéro. */
export async function reinitialiserDemo(): Promise<void> {
  donnees.value = donneesDemo(aujourdhui());
  await enregistrer();
}

// ---------- Modifier ----------

let dernierToast = 0;

/**
 * Applique des changements : mise à jour immédiate de l'écran, enregistrement local,
 * puis envoi vers le Drive un peu plus tard. `annulable` affiche un bandeau « Annuler ».
 */
export function faire(changements: Changement[], annulable?: string): void {
  if (!changements.length) return;
  const avant = donnees.value;
  const maj = new Date().toISOString();
  donnees.value = appliquerChangements(avant, changements, maj);
  if (mode.value === 'google') for (const c of changements) meta.pendants[clePendant(c.table, c.id)] = maj;
  void enregistrer();
  majEtatSync();
  planifierSync();
  if (annulable) {
    const retour: Changement[] = [];
    const vus = new Set<string>();
    for (const c of changements) {
      const k = clePendant(c.table, c.id);
      if (vus.has(k)) continue;
      vus.add(k);
      const l = avant[c.table][c.id];
      retour.push(l ? { table: c.table, id: c.id, champs: { ...l } } : { table: c.table, id: c.id, champs: { supprime: 'purge' } });
    }
    montrerToast(annulable, () => faire(retour));
  }
}

export function montrerToast(texte: string, annuler?: () => void): void {
  const id = ++dernierToast;
  toast.value = { texte, annuler, id };
  setTimeout(() => { if (toast.value?.id === id) toast.value = null; }, annuler ? 6000 : 3500);
}

let minuteurEnregistrement: ReturnType<typeof setTimeout> | undefined;
function enregistrer(): Promise<void> {
  clearTimeout(minuteurEnregistrement);
  return new Promise(ok => {
    minuteurEnregistrement = setTimeout(async () => {
      if (base) { await ecrireKv(base, 'donnees', donnees.value); await ecrireKv(base, 'meta', meta); }
      ok();
    }, 250);
  });
}

function appliquerActivations(): void {
  const ch = activationsDuJour(donnees.value, jour.value);
  if (ch.length) faire(ch);
}

// ---------- Synchronisation ----------

let minuteurSync: ReturnType<typeof setTimeout> | undefined;
export function planifierSync(delai = 2000): void {
  if (mode.value !== 'google') return;
  clearTimeout(minuteurSync);
  minuteurSync = setTimeout(() => void synchroniser(), delai);
}

function majEtatSync(partiel: Partial<typeof sync.value> = {}): void {
  const attente = Object.keys(meta.pendants).length;
  const base_ = mode.value === 'google' ? sync.value : { etat: 'local' as EtatSync };
  sync.value = { ...base_, derniere: meta.derniere, ...partiel, attente };
}

let enCours = false;
let relancer = false;

export async function synchroniser(): Promise<void> {
  if (mode.value !== 'google' || !base) return;
  if (enCours) { relancer = true; return; }
  enCours = true;
  majEtatSync({ etat: 'envoi', message: undefined });
  try {
    if (!jetonValide()) throw new ErreurConnexion();
    meta.emplacement ??= {};
    const e = meta.emplacement;
    if (!e.donneesId) e.donneesId = await trouverDonnees();
    await envoyerPhotosEnAttente();

    // Lire, fusionner, écrire. Si un autre appareil a écrit entre la lecture et l'écriture, on recommence
    // avec sa version : aucune modification ne se perd, la plus récente gagne ligne par ligne.
    let p0: Pendants = {};
    let f: ReturnType<typeof fusionner> | null = null;
    for (let essai = 0; essai < 3 && !f; essai++) {
      p0 = { ...meta.pendants };
      const lu = e.donneesId ? await lireDonnees(e.donneesId) : null;
      if (!lu) e.donneesId = undefined; // pas encore créé, ou supprimé : il sera recréé depuis l'appareil
      const fichier = lireFichier(lu?.contenu);
      const fusion = fusionner(donnees.value, fichier, p0);
      if (fusion.aEnvoyer || !e.donneesId) {
        if (e.donneesId && lu && (await versionDonnees(e.donneesId)) !== lu.version) continue;
        e.donneesId = await ecrireDonnees(e.donneesId, versFichier(fusion.donnees, VERSION_SCHEMA, new Date().toISOString(), tablesInconnues(fichier)));
      }
      f = fusion;
    }
    if (!f) throw new Error('Le fichier de données change trop vite : nouvel essai bientôt');
    // Rien nulle part : premier appareil d'une nouvelle utilisatrice → modèles par défaut.
    if (!Object.keys(f.donnees.Modeles).length && !Object.keys(donnees.value.Modeles).length) semerModeles();

    // Ce qui a été modifié PENDANT la synchro reste en attente et garde sa version locale.
    const actuels = meta.pendants;
    const restants: Pendants = {};
    for (const [k, v] of Object.entries(actuels)) if (!(k in p0 && p0[k] === v)) restants[k] = v;
    const final = f.donnees;
    for (const k of Object.keys(restants)) {
      const [t, id] = k.split('/') as [NomTable, string];
      const l = donnees.value[t][id];
      if (l) final[t] = { ...final[t], [id]: l };
    }
    donnees.value = final;
    meta.pendants = restants;
    meta.derniere = new Date().toISOString();
    await enregistrer();
    majEtatSync({ etat: 'ok' });
    appliquerActivations();
    { const vieux = viderAnciensSupprimes(donnees.value); if (vieux.length) faire(vieux); }
  } catch (e) {
    if (e instanceof ErreurConnexion) majEtatSync({ etat: 'reconnexion', message: e.message });
    else if (e instanceof ErreurReseau) majEtatSync({ etat: 'hors-ligne' });
    else { console.error(e); majEtatSync({ etat: 'erreur', message: String((e as Error).message ?? e) }); }
  } finally {
    enCours = false;
    if (relancer) { relancer = false; planifierSync(500); }
  }
}

function semerModeles(): void {
  faire(MODELES_PAR_DEFAUT.map((m, i) => ({ table: 'Modeles' as NomTable, id: crypto.randomUUID(), nouveau: true,
    champs: { nom: m.nom, contenu: m.contenu, ordre: String(i + 1) } })));
}

/**
 * Envoyer ou non une copie des photos sur le Drive. Coupé, rien ne part (ce qui est déjà envoyé y
 * reste) ; allumé, les photos gardées sur l'appareil partent à la synchro suivante.
 */
export async function reglerPhotosDrive(v: boolean): Promise<void> {
  meta.photosDrive = v;
  photosSurDrive.value = v;
  await enregistrer();
  if (v) planifierSync(200);
}

/** Relit le nom du dossier des photos (il a pu être renommé depuis le Drive ou un autre appareil). */
export async function lireNomDossierPhotos(): Promise<void> {
  if (mode.value !== 'google' || !base) return;
  meta.emplacement ??= {};
  const nom = await nomDossierAppli(meta.emplacement);
  if (nom === (meta.nomDossierPhotos ?? null)) return;
  meta.nomDossierPhotos = nom ?? undefined;
  dossierPhotos.value = nom;
  await enregistrer();
}

/** Renomme le dossier des photos sur le Drive (ou le crée sous ce nom). */
export async function renommerDossierPhotos(nom: string): Promise<void> {
  if (mode.value !== 'google' || !base) return;
  meta.emplacement ??= {};
  await nommerDossierAppli(meta.emplacement, nom);
  meta.nomDossierPhotos = nom;
  dossierPhotos.value = nom;
  await enregistrer();
}

/** Des photos qui ne vivent que sur l'appareil : on demande au navigateur de ne pas les effacer. */
export function protegerPhotosLocales(): void {
  void navigator.storage?.persist?.().catch(() => false);
}

/**
 * Après l'import, dans un compte, d'une sauvegarde faite en démo : les photos ne voyagent pas dans le
 * fichier, mais elles sont encore dans la base démo de cet appareil. On y recopie celles qui manquent ;
 * la base démo est seulement lue. Renvoie le nombre de photos récupérées.
 */
export async function recupererPhotosDemo(): Promise<number> {
  if (!base || mode.value !== 'google') return 0;
  const bases = await indexedDB.databases?.().catch(() => []) ?? [];
  if (!bases.some(b => b.name === 'cosplay-planner-demo')) return 0;
  const d = donnees.value;
  const voulues = new Set<string>();
  for (const p of Object.values(d.Photos)) if (p.drive_id?.startsWith('local:') && vivant(p)) voulues.add(p.drive_id);
  for (const c of Object.values(d.Costumes)) if (c.image_ref?.startsWith('local:') && vivant(c)) voulues.add(c.image_ref);
  const demo = await ouvrirBase('demo');
  let n = 0;
  try {
    for (const id of voulues) {
      if (await lirePhoto(base, id)) continue;
      const blob = await lirePhoto(demo, id);
      if (blob) { await ecrirePhoto(base, id, blob); n++; }
    }
  } finally { demo.close(); }
  if (n) protegerPhotosLocales();
  return n;
}

/** Où ranger une photo : Photos / costume / Références ou WIP / pièce (sans pièce : à la racine de Références ou WIP). */
function cheminPhoto(d: Donnees, costumeId: string, pieceId: string, reference: boolean): PlaceDossier[] {
  const c = d.Costumes[costumeId];
  const chemin: PlaceDossier[] = [
    { role: 'costume', ref: costumeId, nom: c?.nom || 'Sans nom' },
    reference ? { role: 'references', ref: costumeId, nom: 'Références' } : { role: 'wip', ref: costumeId, nom: 'WIP' },
  ];
  const p = pieceId ? d.Pieces[pieceId] : undefined;
  if (p && vivant(p) && p.costume_id === costumeId) chemin.push({ role: reference ? 'piece-ref' : 'piece-wip', ref: pieceId, nom: p.nom || 'Sans nom' });
  return chemin;
}

/**
 * Copie des photos sur le Drive : celles qui ne sont que sur l'appareil (id « local:… ») partent, et
 * toutes sont rangées par costume puis Références / WIP puis pièce. Une photo changée de pièce ou de
 * type, un costume ou une pièce renommés : le Drive suit. Un échec de rangement n'empêche pas la synchro.
 */
async function envoyerPhotosEnAttente(costumeId?: string): Promise<void> {
  // Sans copie Drive cochée, rien ne part — sauf pour une sauvegarde sur le Drive d'un costume.
  if (!base || !meta.emplacement || (meta.photosDrive !== true && !costumeId)) return;
  const e = meta.emplacement;
  e.places ??= {};
  const d = donnees.value;
  const voulues = new Map<string, PlaceDossier[]>();
  for (const p of Object.values(d.Photos)) if (p.drive_id && p.costume_id && vivant(p) && (!costumeId || p.costume_id === costumeId)) voulues.set(p.drive_id, cheminPhoto(d, p.costume_id, p.piece_id, p.type === 'reference'));
  for (const c of Object.values(d.Costumes)) if (c.image_ref && vivant(c) && (!costumeId || c.id === costumeId) && !voulues.has(c.image_ref)) voulues.set(c.image_ref, cheminPhoto(d, c.id, '', true));
  for (const [id, chemin] of voulues) {
    try {
      const dossier = await dossierRange(e, chemin);
      if (id.startsWith('local:')) {
        const blob = await lirePhoto(base, id);
        if (!blob) continue;
        const idDrive = await envoyerPhoto(blob, `${id.slice(6)}.jpg`, dossier);
        await ecrirePhoto(base, idDrive, blob);
        e.places[idDrive] = dossier;
        const ch: Changement[] = [];
        for (const p of Object.values(donnees.value.Photos)) if (p.drive_id === id) ch.push({ table: 'Photos', id: p.id, champs: { drive_id: idDrive } });
        for (const c of Object.values(donnees.value.Costumes)) if (c.image_ref === id) ch.push({ table: 'Costumes', id: c.id, champs: { image_ref: idDrive } });
        faire(ch);
      } else if (e.places[id] !== dossier) {
        let actuel: string | undefined;
        try {
          actuel = e.places[id] ?? (await dossierDe(id));
        } catch (x) {
          // La copie a été supprimée à la main dans le Drive : on ne la cherche plus.
          if (x instanceof ErreurIntrouvable) { e.places[id] = dossier; continue; }
          throw x;
        }
        if (actuel !== dossier) await deplacer(id, dossier, actuel);
        e.places[id] = dossier;
      }
    } catch (x) {
      if (x instanceof ErreurConnexion || x instanceof ErreurReseau) throw x;
      // Un dossier supprimé à la main dans le Drive : on oublie les mémos, les dossiers seront
      // retrouvés ou recréés à la prochaine synchro.
      if (x instanceof ErreurIntrouvable) { e.dossiers = {}; e.dossierId = undefined; delete e.places[id]; }
      console.warn('Rangement des photos :', x);
    }
  }
}

// ---------- Sauvegarde d'un costume ----------

/** Exécute `f` sans chevaucher une synchro, qui envoie et range elle aussi les photos. */
async function horsSynchro<T>(f: () => Promise<T>): Promise<T> {
  while (enCours) await new Promise(ok => setTimeout(ok, 200));
  enCours = true;
  try {
    return await f();
  } finally {
    enCours = false;
    await enregistrer();
    if (relancer) { relancer = false; planifierSync(500); }
  }
}

/**
 * Avant une sauvegarde sur le Drive : toutes les photos du costume y sont envoyées et rangées, quel que
 * soit le réglage de copie. Renvoie le nombre de photos restées sur l'appareil seulement (échec d'envoi).
 */
export function envoyerPhotosDuCostume(costumeId: string): Promise<number> {
  return horsSynchro(async () => {
    if (!jetonValide()) throw new ErreurConnexion();
    meta.emplacement ??= {};
    await envoyerPhotosEnAttente(costumeId);
    const d = donnees.value;
    const c = d.Costumes[costumeId];
    return Object.values(d.Photos).filter(p => p.costume_id === costumeId && vivant(p) && p.drive_id?.startsWith('local:')).length
      + (c?.image_ref?.startsWith('local:') ? 1 : 0);
  });
}

/** Le dossier d'un costume sur le Drive (créé s'il le faut) : on y range son dossier WIP. */
export function dossierDuCostume(costumeId: string): Promise<string> {
  return horsSynchro(async () => {
    if (!jetonValide()) throw new ErreurConnexion();
    return dossierRange((meta.emplacement ??= {}), [cheminPhoto(donnees.value, costumeId, '', true)[0]]);
  });
}

/** Dépose les fichiers d'une sauvegarde dans « Sauvegardes › nomDossier » du dossier du costume ; renvoie ce dossier. */
export function deposerSauvegarde(costumeId: string, nomDossier: string, fichiers: { nom: string; blob: Blob; donnees?: boolean }[]): Promise<string> {
  return horsSynchro(async () => {
    if (!jetonValide()) throw new ErreurConnexion();
    const e = (meta.emplacement ??= {});
    const d = donnees.value;
    const chemin = [cheminPhoto(d, costumeId, '', true)[0], { role: 'sauvegardes', ref: costumeId, nom: 'Sauvegardes' }];
    let parent: string;
    try {
      parent = await dossierRange(e, chemin);
    } catch (x) {
      if (!(x instanceof ErreurIntrouvable)) throw x;
      e.dossiers = {}; e.dossierId = undefined; // un dossier supprimé à la main : on le retrouve ou le recrée
      parent = await dossierRange(e, chemin);
    }
    const dossier = await dossierDeSauvegarde(nomDossier, parent);
    for (const f of fichiers) await deposerFichier(f.nom, f.blob, dossier, f.donnees ? { costume: d.Costumes[costumeId]?.nom ?? '' } : undefined);
    return dossier;
  });
}

/**
 * Retire des photos de l'appli après une sauvegarde, pour libérer de la place. Sauvegarde sur l'appareil
 * (ZIP) : leurs copies sont supprimées du Drive. Sauvegarde sur le Drive : elles y restent, rangées dans
 * le dossier de la sauvegarde. Dans les deux cas, elles quittent l'appareil.
 */
export function retirerPhotos(photoIds: string[], lieu: 'appareil' | 'drive', dossierSauvegarde?: string): Promise<void> {
  return horsSynchro(async () => {
    const e = (meta.emplacement ??= {});
    for (const pid of photoIds) {
      const p = donnees.value.Photos[pid];
      if (!p) continue;
      const id = p.drive_id;
      if (mode.value === 'google' && id && !id.startsWith('local:')) {
        if (!jetonValide()) throw new ErreurConnexion();
        if (lieu === 'drive' && dossierSauvegarde) {
          let actuel: string | undefined | null = e.places?.[id];
          if (!actuel) actuel = await dossierDe(id).catch(x => { if (x instanceof ErreurIntrouvable) return null; throw x; });
          if (actuel !== null && actuel !== dossierSauvegarde) await deplacer(id, dossierSauvegarde, actuel);
        } else {
          await supprimerFichier(id);
        }
        if (e.places) delete e.places[id];
      }
      if (base && id) await effacerPhoto(base, id);
      faire(supprimer(donnees.value, 'Photos', pid));
    }
  });
}

// ---------- Événements du navigateur ----------

export function brancherEvenements(): void {
  window.addEventListener('online', () => planifierSync(200));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !pret.value) return;
    const j = aujourdhui();
    if (j !== jour.value) jour.value = j;
    appliquerActivations();
    { const vieux = viderAnciensSupprimes(donnees.value); if (vieux.length) faire(vieux); }
    planifierSync(200);
  });
  setInterval(() => { if (document.visibilityState === 'visible') planifierSync(0); }, 3 * 60_000);
}
