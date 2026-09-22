// Ce qui peut se faire maintenant : la page « À faire ».
//
// Règles :
//  - une pièce contient des pistes ; les étapes d'une piste se suivent, les pistes avancent en parallèle ;
//  - une piste ou une étape peut « attendre » d'autres pistes ou d'autres pièces ;
//  - seuls les costumes « en cours » et, dedans, les pièces « en cours » alimentent « À faire » ;
//  - une date de début atteinte fait passer l'élément en cours tout seul ;
//  - rien n'est masqué en silence : tout ce qui est écarté est compté dans le « repli ».
import { type Donnees, type Ligne, bool, vivant } from '../modele/schema';
import { costumes, piecesDe, pistesDe, etapesDePiste, etapesDePiece, ligne, idsAttendus, nomAttendu, tous } from './acces';
import { lireJour, type Jour } from './dates';
import { avancement } from './avancement';

// ---------- Statuts effectifs (date de début prise en compte) ----------

export function statutCostume(c: Ligne, jour: Jour): string {
  const debut = lireJour(c.debut);
  if (c.statut === 'projet' && debut && debut <= jour) return 'en cours';
  return c.statut || 'projet';
}

export function statutPiece(p: Ligne, jour: Jour): string {
  const debut = lireJour(p.debut);
  if ((p.statut || 'à venir') === 'à venir' && debut && debut <= jour) return 'en cours';
  return p.statut || 'à venir';
}

/** Une piste est ouverte si elle est active et que sa date de début (s'il y en a une) est atteinte. */
export function pisteOuverte(p: Ligne, jour: Jour): boolean {
  if (!bool(p.active)) return false;
  const debut = lireJour(p.debut);
  return !debut || debut <= jour;
}

// ---------- Terminé ? ----------

/** Une piste vide compte comme terminée (elle ne bloque personne). */
export function pisteTerminee(d: Donnees, pisteId: string): boolean {
  return etapesDePiste(d, pisteId).every(e => bool(e.fait));
}

/** Une pièce est terminée quand elle a au moins une étape et qu'elles sont toutes cochées. */
export function pieceTerminee(d: Donnees, pieceId: string): boolean {
  const etapes = etapesDePiece(d, pieceId);
  return etapes.length > 0 && etapes.every(e => bool(e.fait));
}

export interface Attente { id: string; nom: string; nbFait: number; nb: number }

/** Ce qu'un élément attend encore (liste vide = rien ne bloque). Un id disparu ne bloque pas. */
export function attentes(d: Donnees, l: Ligne): Attente[] {
  const res: Attente[] = [];
  for (const id of idsAttendus(l)) {
    const piste = ligne(d, 'Pistes', id);
    if (piste) {
      if (!pisteTerminee(d, id)) {
        const a = avancement(etapesDePiste(d, id));
        res.push({ id, nom: nomAttendu(d, id), nbFait: a.nbFait, nb: a.nb });
      }
      continue;
    }
    const piece = ligne(d, 'Pieces', id);
    if (piece && !pieceTerminee(d, id)) {
      const a = avancement(etapesDePiece(d, id));
      res.push({ id, nom: piece.nom, nbFait: a.nbFait, nb: a.nb });
    }
  }
  return res;
}

export function texteAttente(a: Attente[]): string {
  return 'attend : ' + a.map(x => `${x.nom} (${x.nbFait}/${x.nb})`).join(', ');
}

// ---------- État d'une piste ----------

export interface EtatPiste {
  piste: Ligne;
  ouverte: boolean;        // active et date de début atteinte
  debutFutur: Jour | '';   // date de début pas encore atteinte
  terminee: boolean;
  bloqueePar: Attente[];   // attentes de la piste elle-même
  prochaine?: Ligne;       // première étape non cochée
  prochaineBloqueePar: Attente[];
}

export function etatPiste(d: Donnees, piste: Ligne, jour: Jour): EtatPiste {
  const etapes = etapesDePiste(d, piste.id);
  const prochaine = etapes.find(e => !bool(e.fait));
  const debut = lireJour(piste.debut);
  return {
    piste,
    ouverte: pisteOuverte(piste, jour),
    debutFutur: debut && debut > jour ? debut : '',
    terminee: !prochaine,
    bloqueePar: attentes(d, piste),
    prochaine,
    prochaineBloqueePar: prochaine ? attentes(d, prochaine) : [],
  };
}

/** L'étape est-elle faisable maintenant (hors statut pièce/costume) ? */
export function etapeDisponible(d: Donnees, etape: Ligne, jour: Jour): boolean {
  if (bool(etape.fait)) return false;
  const piste = ligne(d, 'Pistes', etape.piste_id);
  if (!piste) return false;
  const e = etatPiste(d, piste, jour);
  return e.ouverte && e.bloqueePar.length === 0 && e.prochaine?.id === etape.id && e.prochaineBloqueePar.length === 0;
}

// ---------- La page « À faire » ----------

export interface ElementAFaire { costume: Ligne; piece: Ligne; piste: Ligne; etape: Ligne; plusieursPistes: boolean }

export interface Repli {
  costumesEnAttente: Ligne[];
  costumesProjet: Ligne[];
  costumesEnPause: Ligne[];
  costumesSansPieceEnCours: Ligne[];
  piecesAVenir: { costume: Ligne; piece: Ligne; debut: Jour | '' }[];
  piecesEnPause: { costume: Ligne; piece: Ligne }[];
  pistesEnPause: { costume: Ligne; piece: Ligne; piste: Ligne }[];
  pistesPlanifiees: { costume: Ligne; piece: Ligne; piste: Ligne; debut: Jour }[];
  bloquees: { costume: Ligne; piece: Ligne; piste: Ligne; etape?: Ligne; attente: Attente[] }[];
}

export interface AFaire { elements: ElementAFaire[]; taches: Ligne[]; repli: Repli }

export function aFaire(d: Donnees, jour: Jour): AFaire {
  const repli: Repli = {
    costumesEnAttente: [], costumesProjet: [], costumesEnPause: [], costumesSansPieceEnCours: [],
    piecesAVenir: [], piecesEnPause: [], pistesEnPause: [], pistesPlanifiees: [], bloquees: [],
  };
  const elements: ElementAFaire[] = [];

  for (const costume of costumes(d)) {
    const sc = statutCostume(costume, jour);
    if (sc === 'en attente') { repli.costumesEnAttente.push(costume); continue; }
    if (sc === 'projet') { repli.costumesProjet.push(costume); continue; }
    if (sc === 'en pause') { repli.costumesEnPause.push(costume); continue; }
    if (sc !== 'en cours') continue; // terminé, archivé

    let pieceEnCours = false;
    for (const piece of piecesDe(d, costume.id)) {
      const sp = statutPiece(piece, jour);
      if (sp === 'à venir') { repli.piecesAVenir.push({ costume, piece, debut: lireJour(piece.debut) }); continue; }
      if (sp === 'en pause') { repli.piecesEnPause.push({ costume, piece }); continue; }
      if (sp !== 'en cours') continue; // terminée
      pieceEnCours = true;

      const attentePiece = attentes(d, piece);
      const pistes = pistesDe(d, piece.id);
      for (const piste of pistes) {
        const e = etatPiste(d, piste, jour);
        if (e.terminee) continue;
        if (!bool(piste.active)) { repli.pistesEnPause.push({ costume, piece, piste }); continue; }
        if (e.debutFutur) { repli.pistesPlanifiees.push({ costume, piece, piste, debut: e.debutFutur }); continue; }
        const bloque = [...attentePiece, ...e.bloqueePar];
        if (bloque.length) { repli.bloquees.push({ costume, piece, piste, attente: bloque }); continue; }
        if (e.prochaineBloqueePar.length) {
          repli.bloquees.push({ costume, piece, piste, etape: e.prochaine, attente: e.prochaineBloqueePar });
          continue;
        }
        elements.push({ costume, piece, piste, etape: e.prochaine!, plusieursPistes: pistes.length > 1 });
      }
    }
    if (!pieceEnCours) repli.costumesSansPieceEnCours.push(costume);
  }

  const taches = tous(d, 'Taches').filter(t => !bool(t.fait))
    .sort((a, b) => (lireJour(a.date) || '9999').localeCompare(lireJour(b.date) || '9999'));

  return { elements, taches, repli };
}

export function tailleRepli(r: Repli): number {
  return r.costumesEnAttente.length + r.costumesProjet.length + r.costumesEnPause.length
    + r.piecesAVenir.length + r.piecesEnPause.length + r.pistesEnPause.length
    + r.pistesPlanifiees.length + r.bloquees.length;
}

/** Est-ce que choisir `cible` comme attente de `l` créerait une boucle ? (A attend B qui attend A) */
export function creeraitBoucle(d: Donnees, depuisId: string, cibleId: string): boolean {
  const vus = new Set<string>();
  const pile = [cibleId];
  while (pile.length) {
    const id = pile.pop()!;
    if (id === depuisId) return true;
    if (vus.has(id)) continue;
    vus.add(id);
    const l = d.Pistes[id] ?? d.Pieces[id];
    if (vivant(l)) pile.push(...idsAttendus(l));
    // une pièce attend aussi à travers ses pistes
    if (d.Pieces[id]) for (const p of pistesDe(d, id)) pile.push(...idsAttendus(p));
  }
  return false;
}
