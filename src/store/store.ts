// État de l'appli : données réactives, enregistrement local, synchro avec le fichier caché du Drive, annulation.
import { signal } from '@preact/signals';
import { type Donnees, type NomTable, donneesVides, NOMS_TABLES, VERSION_SCHEMA, vivant } from '../modele/schema';
import { appliquerChangements, viderAnciensSupprimes, type Changement } from './operations';
import { ouvrirBase, lireKv, ecrireKv, type Base, lirePhoto, ecrirePhoto } from './idb';
import { activationsDuJour } from '../logique/activation';
import { aujourdhui } from '../logique/dates';
import { MODELES_PAR_DEFAUT } from '../modele/modelesParDefaut';
import { type Pendants, clePendant, fusionner, lireFichier, versFichier } from '../sync/fusion';
import { trouverDonnees, lireDonnees, versionDonnees, ecrireDonnees, envoyerPhoto, dossierPhotosParDefaut, type Emplacement } from '../sync/drive';
import { type DossierDrive } from '../sync/picker';
import { ErreurConnexion, ErreurReseau, jetonValide, emailConnu } from '../sync/google';
import { donneesDemo } from '../demo/donneesDemo';

export type Mode = 'demo' | 'google';
const CLE_MODE = 'cosplay-planner.mode';

// Les photos vivent sur l'appareil ; `photosDrive` (coché par l'utilisatrice) en envoie une copie sur le
// Drive, dans `dossierPhotos` s'il est choisi, sinon dans le dossier Photos de l'appli.
interface Meta { pendants: Pendants; emplacement?: Emplacement; derniere?: string; photosDrive?: boolean; dossierPhotos?: DossierDrive }

export const mode = signal<Mode | null>(lireMode());
export const donnees = signal<Donnees>(donneesVides());
export const pret = signal(false);
export const jour = signal(aujourdhui());
/** Une copie des photos part-elle sur le Drive ? Non par défaut. Réglage propre à cet appareil. */
export const photosSurDrive = signal(false);
/** Dossier du Drive choisi pour les photos (sinon le dossier Photos de l'appli). */
export const dossierPhotos = signal<DossierDrive | null>(null);

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
  dossierPhotos.value = meta.dossierPhotos ?? null;
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
      const fusion = fusionner(donnees.value, lireFichier(lu?.contenu), p0);
      if (fusion.aEnvoyer || !e.donneesId) {
        if (e.donneesId && lu && (await versionDonnees(e.donneesId)) !== lu.version) continue;
        e.donneesId = await ecrireDonnees(e.donneesId, versFichier(fusion.donnees, VERSION_SCHEMA, new Date().toISOString()));
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

/** Le dossier du Drive où partent les photos ; null = le dossier Photos de l'appli. */
export async function reglerDossierPhotos(d: DossierDrive | null): Promise<void> {
  meta.dossierPhotos = d ?? undefined;
  dossierPhotos.value = d;
  await enregistrer();
}

/** Des photos qui ne vivent que sur l'appareil : on demande au navigateur de ne pas les effacer. */
export function protegerPhotosLocales(): void {
  void navigator.storage?.persist?.().catch(() => false);
}

/** Les photos prises hors-ligne (id « local:… ») partent vers le Drive avant les lignes. */
async function envoyerPhotosEnAttente(): Promise<void> {
  if (!base || !meta.emplacement || meta.photosDrive !== true) return;
  let dossier: string | undefined = meta.dossierPhotos?.id;
  const d = donnees.value;
  const locales = new Set<string>();
  for (const p of Object.values(d.Photos)) if (p.drive_id?.startsWith('local:') && vivant(p)) locales.add(p.drive_id);
  for (const c of Object.values(d.Costumes)) if (c.image_ref?.startsWith('local:') && vivant(c)) locales.add(c.image_ref);
  for (const idLocal of locales) {
    const blob = await lirePhoto(base, idLocal);
    if (!blob) continue;
    dossier ??= await dossierPhotosParDefaut(meta.emplacement);
    const idDrive = await envoyerPhoto(blob, `${idLocal.slice(6)}.jpg`, dossier);
    await ecrirePhoto(base, idDrive, blob);
    const ch: Changement[] = [];
    for (const p of Object.values(donnees.value.Photos)) if (p.drive_id === idLocal) ch.push({ table: 'Photos', id: p.id, champs: { drive_id: idDrive } });
    for (const c of Object.values(donnees.value.Costumes)) if (c.image_ref === idLocal) ch.push({ table: 'Costumes', id: c.id, champs: { image_ref: idDrive } });
    faire(ch);
  }
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
