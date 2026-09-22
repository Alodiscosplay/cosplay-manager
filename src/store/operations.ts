// Opérations métier PURES : elles lisent les données et renvoient la liste des lignes à écrire.
// Le store (store.ts) les applique, les enregistre et les synchronise. Aucune ne modifie `d`.
import { type Donnees, type Ligne, type NomTable, type Duree, DUREES, OUI, txtBool, entetes, bool, liste, txtListe } from '../modele/schema';
import { piecesDe, pistesDe, etapesDePiste, ordreSuivant, ligne, tous, costumes } from '../logique/acces';
import { statutApresCoche } from '../logique/activation';
import { type ListeTexte } from '../logique/collerListe';
import { type Repartition } from '../logique/planning';
import { type Jour } from '../logique/dates';

export interface Changement { table: NomTable; id: string; champs: Record<string, string>; nouveau?: boolean }

export const nouvelId = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/** Ligne complète avec toutes les colonnes (vides par défaut). */
export function ligneVide(table: NomTable, id = nouvelId()): Ligne {
  const l = {} as Ligne;
  for (const c of entetes(table)) l[c] = '';
  l.id = id;
  return l;
}

function creer(table: NomTable, champs: Record<string, string>, id = nouvelId()): Changement {
  return { table, id, champs, nouveau: true };
}

/** Lit la valeur d'un champ en tenant compte des changements déjà prévus dans la même opération. */
function vue(d: Donnees, changements: Changement[]): Donnees {
  if (!changements.length) return d;
  const v = { ...d } as Donnees;
  for (const ch of changements) {
    v[ch.table] = v[ch.table] === d[ch.table] ? { ...d[ch.table] } : v[ch.table];
    v[ch.table][ch.id] = { ...(v[ch.table][ch.id] ?? ligneVide(ch.table, ch.id)), ...ch.champs };
  }
  return v;
}

// ---------- Costumes, pièces, pistes, étapes ----------

export function creerCostume(d: Donnees, nom: string): Changement[] {
  return [creer('Costumes', { nom, statut: 'projet', ordre: ordreSuivant(costumes(d)) })];
}

export function creerPiece(d: Donnees, costumeId: string, nom: string, statut = 'en pause'): Changement[] {
  const piece = creer('Pieces', { costume_id: costumeId, nom, statut, ordre: ordreSuivant(piecesDe(d, costumeId)) });
  const piste = creer('Pistes', { piece_id: piece.id, nom: '', active: OUI, ordre: '1' });
  return [piece, piste];
}

export function creerPiste(d: Donnees, pieceId: string, nom: string): Changement[] {
  return [creer('Pistes', { piece_id: pieceId, nom, active: OUI, ordre: ordreSuivant(pistesDe(d, pieceId)) })];
}

export function creerEtape(d: Donnees, pisteId: string, titre: string, duree: Duree = 'normal'): Changement[] {
  const piste = d.Pistes[pisteId];
  const ch = [creer('Etapes', {
    piste_id: pisteId, piece_id: piste?.piece_id ?? '', titre, duree, poids: String(DUREES[duree]), fait: '',
    ordre: ordreSuivant(etapesDePiste(d, pisteId)),
  })];
  // Ajouter une étape à une pièce terminée la rouvre.
  if (piste) ch.push(...statutPieceApres(d, ch, piste.piece_id));
  return ch;
}

function statutPieceApres(d: Donnees, changements: Changement[], pieceId: string): Changement[] {
  const s = statutApresCoche(vue(d, changements), pieceId);
  return s ? [{ table: 'Pieces', id: pieceId, champs: { statut: s } }] : [];
}

export function cocherEtape(d: Donnees, etapeId: string, fait: boolean, jour: Jour): Changement[] {
  const e = d.Etapes[etapeId];
  if (!e) return [];
  const ch: Changement[] = [{ table: 'Etapes', id: etapeId, champs: { fait: txtBool(fait), fait_le: fait ? jour : '' } }];
  ch.push(...statutPieceApres(d, ch, e.piece_id));
  return ch;
}

/** Déplace une étape dans une piste (éventuellement une autre) à la position `index`, et renumérote. */
export function deplacerEtape(d: Donnees, etapeId: string, pisteId: string, index: number): Changement[] {
  const e = d.Etapes[etapeId];
  const piste = d.Pistes[pisteId];
  if (!e || !piste) return [];
  const cible = etapesDePiste(d, pisteId).filter(x => x.id !== etapeId);
  cible.splice(Math.max(0, Math.min(index, cible.length)), 0, e);
  const ch: Changement[] = [];
  cible.forEach((x, i) => {
    const champs: Record<string, string> = {};
    if (x.ordre !== String(i + 1)) champs.ordre = String(i + 1);
    if (x.id === etapeId && e.piste_id !== pisteId) { champs.piste_id = pisteId; champs.piece_id = piste.piece_id; }
    if (Object.keys(champs).length) ch.push({ table: 'Etapes', id: x.id, champs });
  });
  if (e.piece_id !== piste.piece_id) ch.push(...statutPieceApres(d, ch, e.piece_id));
  ch.push(...statutPieceApres(d, ch, piste.piece_id));
  return ch;
}

/** Renumérote une liste de lignes selon l'ordre donné (pièces, pistes, costumes…). */
export function reordonner(table: NomTable, lignes: Ligne[]): Changement[] {
  return lignes.flatMap((l, i) => (l.ordre === String(i + 1) ? [] : [{ table, id: l.id, champs: { ordre: String(i + 1) } }]));
}

/** Crée pièces, pistes et étapes à partir d'un texte collé. `pieceId` reçoit les étapes écrites avant tout « ## ». */
export function appliquerListe(d: Donnees, l: ListeTexte, costumeId: string, pieceId?: string): Changement[] {
  const ch: Changement[] = [];
  for (const pt of l.pieces) {
    let idPiece: string;
    let pisteParDefaut: string | undefined;
    let pisteNeuve = false; // piste créée d'office avec la pièce, encore inutilisée
    if (pt.nom || !pieceId) {
      const cp = creerPiece(vue(d, ch), costumeId, pt.nom || 'Nouvelle pièce');
      ch.push(...cp);
      idPiece = cp[0].id;
      pisteParDefaut = cp[1].id;
      pisteNeuve = true;
    } else {
      idPiece = pieceId;
      pisteParDefaut = pistesDe(d, idPiece)[0]?.id;
    }
    for (const pi of pt.pistes) {
      let idPiste: string;
      if (pisteNeuve && pisteParDefaut) {
        // La piste créée avec la pièce sert en premier, et prend le nom de la « ### » s'il y en a une.
        idPiste = pisteParDefaut;
        if (pi.nom) ch.find(x => x.id === idPiste)!.champs.nom = pi.nom;
      } else if (!pi.nom && pisteParDefaut) {
        idPiste = pisteParDefaut;
      } else {
        const cp = creerPiste(vue(d, ch), idPiece, pi.nom);
        ch.push(...cp);
        idPiste = cp[0].id;
        pisteParDefaut ??= idPiste;
      }
      pisteNeuve = false;
      for (const et of pi.etapes) ch.push(...creerEtape(vue(d, ch), idPiste, et.titre, et.duree));
    }
  }
  return ch;
}

/** Insère un modèle comme nouvelle(s) piste(s) d'une pièce. Une pièce dont la seule piste est vide la réutilise. */
export function insererModele(d: Donnees, pieceId: string, nom: string, l: ListeTexte): Changement[] {
  const ch: Changement[] = [];
  const pistes = pistesDe(d, pieceId);
  let libre = pistes.length === 1 && !etapesDePiste(d, pistes[0].id).length ? pistes[0].id : undefined;
  for (const pt of l.pieces) for (const pi of pt.pistes) {
    const nomPiste = pi.nom || nom;
    let idPiste: string;
    if (libre) { idPiste = libre; ch.push({ table: 'Pistes', id: libre, champs: { nom: nomPiste } }); libre = undefined; }
    else { const cp = creerPiste(vue(d, ch), pieceId, nomPiste); ch.push(...cp); idPiste = cp[0].id; }
    for (const et of pi.etapes) ch.push(...creerEtape(vue(d, ch), idPiste, et.titre, et.duree));
  }
  return ch;
}

/** Ajoute les étapes d'un modèle à la fin d'une piste existante (ex. une broderie avant la couture). */
export function ajouterModeleDansPiste(d: Donnees, pisteId: string, l: ListeTexte): Changement[] {
  const ch: Changement[] = [];
  for (const pt of l.pieces) for (const pi of pt.pistes) for (const et of pi.etapes) ch.push(...creerEtape(vue(d, ch), pisteId, et.titre, et.duree));
  return ch;
}

export function appliquerRepartition(r: Repartition): Changement[] {
  return Object.entries(r).map(([id, jour]) => ({ table: 'Etapes' as NomTable, id, champs: { date_prevue: jour } }));
}

// ---------- Suppression douce, restauration, purge ----------

export function supprimer(table: NomTable, id: string): Changement[] {
  return [{ table, id, champs: { supprime: OUI } }];
}
export function restaurer(table: NomTable, id: string): Changement[] {
  return [{ table, id, champs: { supprime: '' } }];
}
/** Purge : on vide la ligne (le Sheet garde une ligne marquée « purge » pour ne pas décaler les numéros). */
export function purger(table: NomTable, ligneActuelle: Ligne): Changement {
  const champs: Record<string, string> = {};
  for (const c of entetes(table)) if (c !== 'id') champs[c] = '';
  for (const c of Object.keys(ligneActuelle)) if (c !== 'id') champs[c] = '';
  champs.supprime = 'purge';
  return { table, id: ligneActuelle.id, champs };
}

// ---------- Achats ----------

/** Crée une commande par fournisseur à partir d'une sélection de fournitures (qui peuvent venir de plusieurs costumes). */
/** Une commande par fournisseur ; `ports` : frais de port saisis pour chacune (clé = id du fournisseur, '' si aucun). */
export function creerCommandes(d: Donnees, fournitureIds: string[], jour: Jour, ports: Record<string, string> = {}): Changement[] {
  const parFournisseur = new Map<string, string[]>();
  for (const id of fournitureIds) {
    const f = ligne(d, 'Fournitures', id);
    if (!f) continue;
    const cle = f.fournisseur_id || '';
    parFournisseur.set(cle, [...(parFournisseur.get(cle) ?? []), id]);
  }
  const ch: Changement[] = [];
  for (const [fournisseurId, ids] of parFournisseur) {
    const cmd = creer('Commandes', { fournisseur_id: fournisseurId, statut: 'à passer', date: jour, frais_port: ports[fournisseurId] ?? '' });
    ch.push(cmd);
    for (const id of ids) ch.push({ table: 'Fournitures', id, champs: { commande_id: cmd.id } });
  }
  return ch;
}

/** Passer une commande « passée » met ses lignes à « commandé », « reçue » à « reçu ». */
export function changerStatutCommande(d: Donnees, commandeId: string, statut: string, jour: Jour): Changement[] {
  const ch: Changement[] = [{ table: 'Commandes', id: commandeId, champs: { statut, ...(statut !== 'à passer' ? { date: jour } : {}) } }];
  const statutLigne = statut === 'reçue' ? 'reçu' : statut === 'passée' ? 'commandé' : 'à acheter';
  for (const f of tous(d, 'Fournitures').filter(f => f.commande_id === commandeId)) {
    if (f.statut !== 'déjà là' && f.statut !== statutLigne) ch.push({ table: 'Fournitures', id: f.id, champs: { statut: statutLigne } });
  }
  return ch;
}

/** Retirer une fourniture de sa commande. */
export function retirerDeCommande(fournitureId: string): Changement[] {
  return [{ table: 'Fournitures', id: fournitureId, champs: { commande_id: '', statut: 'à acheter' } }];
}

// ---------- Attentes ----------

export function basculerAttente(l: Ligne, table: NomTable, id: string): Changement[] {
  const ids = liste(l.attend);
  const nouveaux = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
  return [{ table, id: l.id, champs: { attend: txtListe(nouveaux) } }];
}

/** Applique des changements et renvoie de NOUVELLES données (les tables touchées sont recopiées). */
export function appliquerChangements(d: Donnees, changements: Changement[], maj: string): Donnees {
  const res = { ...d } as Donnees;
  for (const ch of changements) {
    if (res[ch.table] === d[ch.table]) res[ch.table] = { ...d[ch.table] };
    const avant = res[ch.table][ch.id] ?? ligneVide(ch.table, ch.id);
    res[ch.table][ch.id] = { ...avant, ...ch.champs, id: ch.id, maj };
  }
  return res;
}

export const estFait = (l: Ligne) => bool(l.fait);
