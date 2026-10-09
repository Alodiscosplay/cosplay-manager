// Sauvegarde et archivage d'un costume. Deux lieux :
//  - un ZIP téléchargé sur l'appareil (données réimportables, fiche lisible hors appli, photos pleine taille) ;
//  - le Drive : données et fiche dans « Sauvegardes » du dossier du costume, les photos restant à côté
//    (les données gardent leurs identifiants Drive, ce qui permet le réimport sans les recopier).
import { type Donnees, type Ligne, type NomTable, bool, liste, txtListe } from '../modele/schema';
import { ligne, piecesDe, pistesDe, etapesDePiste, fournituresDe, photosDe, tous } from '../logique/acces';
import { avancementCostume } from '../logique/avancement';
import { budgetCostume } from '../logique/budget';
import { lireJour } from '../logique/dates';
import { blobPhoto, imagePourPdf } from '../store/photos';
import { fichePdf } from './fichePdf';
import { nouvelId, purger, type Changement } from '../store/operations';
import { nomFichier } from '../composants/base';
import type JSZip from 'jszip';

export const FORMAT = 'cosplay-planner-archive';

interface ContenuArchive {
  format: typeof FORMAT; version: 1; exporte_le: string;
  lignes: Partial<Record<NomTable, Ligne[]>>;
  fichiers: Record<string, string>; // id de photo (Drive ou local) → chemin dans le ZIP
  lieu?: 'drive';                   // sauvegarde sur le Drive : les photos restent des fichiers du Drive
}

/** Sauvegarde sur le Drive : les données réimportables et la fiche, sans les photos (déjà sur le Drive). */
export async function fichiersSauvegardeDrive(d: Donnees, costumeId: string): Promise<{ donnees: Blob; fiche: Blob }> {
  const contenu: ContenuArchive = { format: FORMAT, version: 1, exporte_le: new Date().toISOString(), lignes: lignesDuCostume(d, costumeId), fichiers: {}, lieu: 'drive' };
  return {
    donnees: new Blob([JSON.stringify(contenu, null, 2)], { type: 'application/json' }),
    fiche: await fichePdf(d, costumeId, imagePourPdf),
  };
}

/** Toutes les lignes vivantes qui appartiennent au costume. */
export function lignesDuCostume(d: Donnees, costumeId: string): Partial<Record<NomTable, Ligne[]>> {
  const c = ligne(d, 'Costumes', costumeId)!;
  const pieces = piecesDe(d, costumeId);
  const pistes = pieces.flatMap(p => pistesDe(d, p.id));
  const etapes = pistes.flatMap(p => etapesDePiste(d, p.id));
  const ev = ligne(d, 'Evenements', c.evenement_id);
  return {
    Costumes: [c], Pieces: pieces, Pistes: pistes, Etapes: etapes,
    Fournitures: fournituresDe(d, costumeId), Photos: photosDe(d, costumeId),
    Taches: tous(d, 'Taches').filter(t => t.costume_id === costumeId),
    Evenements: ev ? [ev] : [],
  };
}

export async function construireArchive(d: Donnees, costumeId: string, wip?: Blob, progres?: (t: string) => void): Promise<{ blob: Blob; nom: string; manquantes: number }> {
  const { default: Zip } = await import('jszip');
  const zip = new Zip();
  const c = ligne(d, 'Costumes', costumeId)!;
  const lignes = lignesDuCostume(d, costumeId);
  const fichiers: Record<string, string> = {};
  let manquantes = 0;

  if (c.image_ref) {
    progres?.('Image de référence');
    const b = await blobPhoto(c.image_ref);
    if (b) { fichiers[c.image_ref] = 'photos/reference.jpg'; zip.file('photos/reference.jpg', b); } else manquantes++;
  }
  const photos = lignes.Photos ?? [];
  const compteurs: Record<string, number> = {};
  for (const [i, p] of photos.entries()) {
    progres?.(`Photo ${i + 1} / ${photos.length}`);
    const b = await blobPhoto(p.drive_id);
    if (!b) { manquantes++; continue; }
    const dossier = nomFichier(ligne(d, 'Pieces', p.piece_id)?.nom ?? 'general');
    const n = (compteurs[dossier] = (compteurs[dossier] ?? 0) + 1);
    const chemin = `photos/${dossier}/${lireJour(p.date) || 'sans-date'}-${String(n).padStart(2, '0')}.jpg`;
    fichiers[p.drive_id] = chemin;
    zip.file(chemin, b);
  }
  const contenu: ContenuArchive = { format: FORMAT, version: 1, exporte_le: new Date().toISOString(), lignes, fichiers };
  zip.file('costume.json', JSON.stringify(contenu, null, 2));
  progres?.('Fiche PDF');
  zip.file('fiche.pdf', await fichePdf(d, costumeId, imagePourPdf));
  if (wip) zip.file('dossier-WIP.pptx', wip);
  progres?.('Compression');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
  return { blob, nom: `${nomFichier(c.nom)}-sauvegarde-${new Date().toISOString().slice(0, 10)}.zip`, manquantes };
}

/** Après confirmation : on vide les lignes détaillées ; le costume reste, archivé, avec un résumé et une vignette. */
export function changementsArchivage(d: Donnees, costumeId: string, vignetteDataUrl: string): { changements: Changement[]; fichiersDrive: string[] } {
  const lignes = lignesDuCostume(d, costumeId);
  const c = lignes.Costumes![0];
  const a = avancementCostume(d, costumeId);
  const b = budgetCostume(d, costumeId);
  const faites = (lignes.Etapes ?? []).map(e => lireJour(e.fait_le)).filter(Boolean).sort();
  const resume = {
    pct: a.pct === null ? null : Math.round(a.pct), etapes: a.nb, pieces: lignes.Pieces?.length ?? 0, photos: lignes.Photos?.length ?? 0,
    debut: faites[0] ?? '', fin: faites[faites.length - 1] ?? '',
    budget: bool(c.suivi_budget) ? Math.round(b.total * 100) / 100 : null,
  };
  const changements: Changement[] = [];
  for (const t of ['Pieces', 'Pistes', 'Etapes', 'Fournitures', 'Photos', 'Taches'] as NomTable[]) {
    for (const l of lignes[t] ?? []) changements.push(purger(t, l));
  }
  changements.push({ table: 'Costumes', id: costumeId, champs: {
    statut: 'archivé', archive_le: new Date().toISOString().slice(0, 10), resume_archive: JSON.stringify(resume), vignette: vignetteDataUrl, image_ref: '',
  } });
  const fichiersDrive = [c.image_ref, ...(lignes.Photos ?? []).map(p => p.drive_id)].filter(id => id && !id.startsWith('local:'));
  return { changements, fichiersDrive };
}

type PhotoARecopier = { chemin: string; ligneId: string; champ: 'drive_id' | 'image_ref'; table: NomTable };

/** Relit un ZIP d'archive et recrée le costume avec de NOUVEAUX identifiants (aucune collision possible). */
export async function lireArchive(fichier: Blob, d: Donnees): Promise<{ changements: Changement[]; photos: PhotoARecopier[]; zip: JSZip }> {
  const { default: Zip } = await import('jszip');
  const zip = await Zip.loadAsync(fichier);
  const brut = await zip.file('costume.json')?.async('string');
  if (!brut) throw new Error("Ce fichier n'est pas une archive Cosplay Manager (costume.json absent).");
  return { ...lireContenu(JSON.parse(brut), d), zip };
}

/**
 * Recrée un costume depuis le contenu d'une sauvegarde (ZIP ou Drive). Sauvegarde du Drive : les photos
 * gardent leur identifiant Drive (rien à recopier) ; ZIP : `photos` dit quels fichiers du ZIP recopier.
 */
export function lireContenu(brut: unknown, d: Donnees): { changements: Changement[]; photos: PhotoARecopier[] } {
  const contenu = brut as ContenuArchive;
  if (contenu?.format !== FORMAT) throw new Error("Ce fichier n'est pas une sauvegarde Cosplay Manager.");
  const surDrive = contenu.lieu === 'drive';
  const idDrive = (id: string) => (surDrive && id && !id.startsWith('local:') ? id : '');

  const nouveaux = new Map<string, string>();
  const nid = (ancien: string) => { if (!ancien) return ''; if (!nouveaux.has(ancien)) nouveaux.set(ancien, nouvelId()); return nouveaux.get(ancien)!; };
  const changements: Changement[] = [];
  const photos: PhotoARecopier[] = [];

  // Un événement qui existe encore est réutilisé tel quel.
  for (const ev of contenu.lignes.Evenements ?? []) {
    if (d.Evenements[ev.id]) nouveaux.set(ev.id, ev.id);
    else changements.push({ table: 'Evenements', id: nid(ev.id), champs: sansTechnique(ev) });
  }
  const refs: Record<string, string[]> = { Costumes: ['attend_costume_id', 'evenement_id'], Pieces: ['costume_id'], Pistes: ['piece_id'], Etapes: ['piste_id', 'piece_id'], Fournitures: ['costume_id', 'piece_id'], Photos: ['costume_id', 'piece_id', 'piste_id', 'etape_id'], Taches: ['costume_id'] };
  // Premier passage : réserver tous les identifiants (les références peuvent pointer « en avant »).
  for (const t of Object.keys(refs)) for (const l of contenu.lignes[t as NomTable] ?? []) nid(l.id);
  for (const [t, champsRef] of Object.entries(refs) as [NomTable, string[]][]) {
    for (const l of contenu.lignes[t] ?? []) {
      const champs = sansTechnique(l);
      for (const k of champsRef) {
        if (k === 'attend_costume_id' && !nouveaux.has(l[k])) champs[k] = d.Costumes[l[k]] ? l[k] : '';
        else champs[k] = txtListe(liste(l[k]).map(nid)); // un champ peut contenir plusieurs ids (pièces d'une fourniture)
      }
      if (l.attend) champs.attend = txtListe(liste(l.attend).map(x => nouveaux.get(x) ?? '').filter(Boolean));
      if (t === 'Costumes') {
        champs.statut = 'terminé';
        champs.archive_le = ''; champs.resume_archive = ''; champs.vignette = ''; champs.sauvegardes = '';
        champs.image_ref = idDrive(l.image_ref);
        if (l.image_ref && contenu.fichiers[l.image_ref]) photos.push({ chemin: contenu.fichiers[l.image_ref], ligneId: nid(l.id), champ: 'image_ref', table: 'Costumes' });
      }
      if (t === 'Photos') {
        champs.drive_id = idDrive(l.drive_id);
        if (contenu.fichiers[l.drive_id]) photos.push({ chemin: contenu.fichiers[l.drive_id], ligneId: nid(l.id), champ: 'drive_id', table: 'Photos' });
      }
      if (t === 'Fournitures') champs.commande_id = '';
      changements.push({ table: t, id: nid(l.id), champs, nouveau: true });
    }
  }
  return { changements, photos };
}

function sansTechnique(l: Ligne): Record<string, string> {
  const { id: _i, maj: _m, supprime: _s, ...reste } = l;
  return { ...reste };
}

// ---------- Historique des sauvegardes d'un costume ----------

export interface TraceSauvegarde { date: string; lieu: 'appareil' | 'drive'; retirees: number; archive?: boolean }

export function lireSauvegardes(c: Ligne): TraceSauvegarde[] {
  try {
    const v = JSON.parse(c.sauvegardes || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function noterSauvegarde(c: Ligne, t: TraceSauvegarde): Changement {
  return { table: 'Costumes', id: c.id, champs: { sauvegardes: JSON.stringify([...lireSauvegardes(c), t]) } };
}

/** Des photos ont été retirées après la dernière sauvegarde : on l'ajoute à sa trace. */
export function noterRetrait(c: Ligne, n: number): Changement {
  const l = lireSauvegardes(c);
  if (l.length) l[l.length - 1] = { ...l[l.length - 1], retirees: l[l.length - 1].retirees + n };
  return { table: 'Costumes', id: c.id, champs: { sauvegardes: JSON.stringify(l) } };
}
