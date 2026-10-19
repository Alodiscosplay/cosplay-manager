// Opérations métier PURES : elles lisent les données et renvoient la liste des lignes à écrire.
// Le store (store.ts) les applique, les enregistre et les synchronise. Aucune ne modifie `d`.
import { type Donnees, type Ligne, type NomTable, type Duree, DUREES, NOMS_TABLES, OUI, txtBool, entetes, bool, liste, txtListe } from '../modele/schema';
import { piecesDe, pistesDe, etapesDePiste, ordreSuivant, ligne, tous, costumes } from '../logique/acces';
import { statutApresCoche } from '../logique/activation';
import { etapeFinie, type Plan } from '../logique/planning';
import { type ListeTexte } from '../logique/collerListe';

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

/**
 * Renumérote une liste de lignes selon l'ordre donné (pièces, pistes, costumes…). Le champ est `ordre`,
 * ou `priorite` pour l'ordre des costumes propre à « À faire ».
 */
export function reordonner(table: NomTable, lignes: Ligne[], champ: 'ordre' | 'priorite' = 'ordre'): Changement[] {
  return lignes.flatMap((l, i) => (l[champ] === String(i + 1) ? [] : [{ table, id: l.id, champs: { [champ]: String(i + 1) } }]));
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
      const existantes = pistesDe(d, idPiece);
      pisteParDefaut = existantes[0]?.id;
      // Une pièce dont la seule étape est vide et sans nom la réutilise, au lieu d'en laisser une orpheline.
      pisteNeuve = existantes.length === 1 && !existantes[0].nom && !etapesDePiste(d, existantes[0].id).length;
      if (pisteNeuve) ch.push({ table: 'Pistes', id: existantes[0].id, champs: {} });
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

export function appliquerPlan(plan: Plan, ordre?: string[]): Changement[] {
  const ch: Changement[] = [];
  for (const [id, f] of Object.entries(plan.pieces)) ch.push({ table: 'Pieces', id, champs: { debut: f.debut, deadline: f.deadline } });
  for (const [id, deadline] of Object.entries(plan.etapes)) ch.push({ table: 'Pistes', id, champs: { deadline } });
  // L'ordre de fabrication retenu sert de proposition à la prochaine répartition.
  ordre?.forEach((id, i) => ch.push({ table: 'Pieces', id, champs: { ordre_planning: String(i + 1) } }));
  return ch;
}

/**
 * Efface le planning de pièces entières : leur fenêtre et les deadlines de leurs étapes. Ce qui est
 * FAIT reste en place — une étape finie garde sa date, et une pièce finie garde sa fenêtre.
 */
export function effacerPlanning(d: Donnees, pieceIds: string[]): Changement[] {
  const ch: Changement[] = [];
  for (const id of pieceIds) {
    const pistes = pistesDe(d, id);
    const pieceFinie = pistes.length > 0 && pistes.every(p => etapeFinie(d, p.id));
    if (!pieceFinie) ch.push({ table: 'Pieces', id, champs: { debut: '', deadline: '' } });
    for (const p of pistes) if (p.deadline && !etapeFinie(d, p.id)) ch.push({ table: 'Pistes', id: p.id, champs: { deadline: '' } });
  }
  return ch;
}

// ---------- Suppression (définitive, pas de corbeille) ----------

/**
 * Supprime une ligne pour de bon : elle est vidée et marquée « purge » (cette trace minuscule fait passer
 * la suppression aux autres appareils), avec ce qui n'a pas de sens sans elle. Un costume emporte ses pièces, étapes,
 * sous-étapes, fournitures et photos ; une pièce emporte ses étapes, mais ses fournitures et ses photos
 * restent au costume (« hors pièce », « à trier »). Le bandeau « Annuler » rattrape une erreur de clic.
 */
export function supprimer(d: Donnees, table: NomTable, id: string): Changement[] {
  const racine = d[table]?.[id];
  if (!racine) return [];
  const ch: Changement[] = [];
  const vus = new Set<string>();
  const vider = (t: NomTable, l: Ligne) => {
    const k = `${t}/${l.id}`;
    if (vus.has(k) || l.supprime === 'purge') return;
    vus.add(k);
    ch.push(purger(t, l));
  };
  const retoucher = (t: NomTable, l: Ligne, champs: Record<string, string>) => {
    if (!vus.has(`${t}/${l.id}`)) ch.push({ table: t, id: l.id, champs });
  };
  const viderPiste = (p: Ligne) => {
    vider('Pistes', p);
    for (const e of Object.values(d.Etapes)) if (e.piste_id === p.id) vider('Etapes', e);
  };
  const viderPiece = (p: Ligne) => {
    vider('Pieces', p);
    for (const pi of Object.values(d.Pistes)) if (pi.piece_id === p.id) viderPiste(pi);
    for (const e of Object.values(d.Etapes)) if (e.piece_id === p.id) vider('Etapes', e);
  };
  switch (table) {
    case 'Costumes':
      vider('Costumes', racine);
      for (const p of Object.values(d.Pieces)) if (p.costume_id === id) viderPiece(p);
      for (const f of Object.values(d.Fournitures)) if (f.costume_id === id) vider('Fournitures', f);
      for (const ph of Object.values(d.Photos)) if (ph.costume_id === id) vider('Photos', ph);
      for (const t of Object.values(d.Taches)) if (t.costume_id === id) retoucher('Taches', t, { costume_id: '' });
      break;
    case 'Pieces':
      viderPiece(racine);
      for (const f of Object.values(d.Fournitures)) {
        const ps = liste(f.piece_id);
        if (ps.includes(id)) retoucher('Fournitures', f, { piece_id: txtListe(ps.filter(x => x !== id)) });
      }
      for (const ph of Object.values(d.Photos)) if (ph.piece_id === id) retoucher('Photos', ph, { piece_id: '', piste_id: '', etape_id: '' });
      break;
    case 'Pistes':
      viderPiste(racine);
      for (const ph of Object.values(d.Photos)) if (ph.piste_id === id) retoucher('Photos', ph, { piste_id: '', etape_id: '' });
      break;
    case 'Etapes':
      vider('Etapes', racine);
      for (const ph of Object.values(d.Photos)) if (ph.etape_id === id) retoucher('Photos', ph, { etape_id: '' });
      break;
    case 'Evenements': {
      // Une convention emporte ses activités ; chaque événement, ses dates clés. Les costumes restent.
      const partis = new Set([id, ...Object.values(d.Evenements).filter(e => e.convention_id === id).map(e => e.id)]);
      for (const eid of partis) vider('Evenements', d.Evenements[eid]);
      for (const dc of Object.values(d.DatesCles)) if (partis.has(dc.evenement_id)) vider('DatesCles', dc);
      for (const c of Object.values(d.Costumes)) {
        const evs = liste(c.evenement_id);
        if (evs.some(x => partis.has(x))) retoucher('Costumes', c, { evenement_id: txtListe(evs.filter(x => !partis.has(x))) });
      }
      break;
    }
    default:
      vider(table, racine);
  }
  return ch;
}

/**
 * Ce qu'avait laissé l'ancienne corbeille (lignes marquées « oui ») : supprimé pour de bon, avec
 * la même cascade. Joué au démarrage et après chaque synchro.
 */
export function viderAnciensSupprimes(d: Donnees): Changement[] {
  const ch: Changement[] = [];
  for (const t of NOMS_TABLES) for (const l of Object.values(d[t])) if (l.supprime === OUI) ch.push(...supprimer(d, t, l.id));
  return ch;
}
/** Purge : on vide la ligne et on la marque « purge », pour que la suppression atteigne les autres appareils. */
export function purger(table: NomTable, ligneActuelle: Ligne): Changement {
  const champs: Record<string, string> = {};
  for (const c of entetes(table)) if (c !== 'id') champs[c] = '';
  for (const c of Object.keys(ligneActuelle)) if (c !== 'id') champs[c] = '';
  champs.supprime = 'purge';
  return { table, id: ligneActuelle.id, champs };
}

// ---------- Achats ----------

/** Crée une commande par fournisseur à partir d'une sélection de fournitures (qui peuvent venir de plusieurs costumes). */
/** Les frais saisis à la création d'une commande. `reduction_articles` : vide = le bon vaut pour tous les articles. */
export interface FraisCommande {
  date?: string; port?: string; douane?: string; douane_repartition?: Record<string, string>;
  reduction?: string; reduction_articles?: string[];
}

/**
 * Une commande par fournisseur ; `frais` : pour chacune (clé = id du fournisseur, '' si aucun), ses
 * frais de port — ou, en entier, port, douane et bon de réduction.
 */
export function creerCommandes(d: Donnees, fournitureIds: string[], jour: Jour, frais: Record<string, string | FraisCommande> = {}): Changement[] {
  const parFournisseur = new Map<string, string[]>();
  for (const id of fournitureIds) {
    const f = ligne(d, 'Fournitures', id);
    if (!f) continue;
    const cle = f.fournisseur_id || '';
    parFournisseur.set(cle, [...(parFournisseur.get(cle) ?? []), id]);
  }
  const ch: Changement[] = [];
  for (const [fournisseurId, ids] of parFournisseur) {
    // Créée = passée : ses fournitures sont aussitôt « commandé ».
    const x = frais[fournisseurId];
    const fr: FraisCommande = typeof x === 'string' ? { port: x } : x ?? {};
    const articles = (fr.reduction_articles ?? []).filter(a => ids.includes(a));
    const repDouane = Object.fromEntries(Object.entries(fr.douane_repartition ?? {}).filter(([a, v]) => ids.includes(a) && v.trim()));
    const cmd = creer('Commandes', {
      fournisseur_id: fournisseurId, statut: 'passée', date: fr.date || jour, frais_port: fr.port ?? '', frais_douane: fr.douane ?? '',
      douane_repartition: Object.keys(repDouane).length ? JSON.stringify(repDouane) : '',
      reduction: fr.reduction ?? '', reduction_articles: articles.length < ids.length ? txtListe(articles) : '',
    });
    ch.push(cmd);
    for (const id of ids) ch.push({ table: 'Fournitures', id, champs: { commande_id: cmd.id, statut: 'commandé' } });
  }
  return ch;
}

/**
 * Passer une commande « passée » met ses lignes à « commandé », « reçue » à « reçu ». La date de la
 * commande (saisie à sa création, modifiable) n'est plus touchée : la réception ne la remplace pas.
 */
export function changerStatutCommande(d: Donnees, commandeId: string, statut: string, _jour: Jour): Changement[] {
  const ch: Changement[] = [{ table: 'Commandes', id: commandeId, champs: { statut } }];
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

/**
 * Enchaîne les étapes d'une pièce : chacune attend la précédente, dans l'ordre affiché. L'inverse
 * (`enchainer` à faux) efface ces attentes internes, et les étapes redeviennent parallèles.
 */
export function enchainerPistes(d: Donnees, pieceId: string, enchainer = true): Changement[] {
  const pistes = pistesDe(d, pieceId);
  const internes = new Set(pistes.map(p => p.id));
  const ch: Changement[] = [];
  pistes.forEach((p, i) => {
    const gardees = liste(p.attend).filter(id => !internes.has(id)); // les attentes vers d'autres pièces restent
    const voulues = enchainer && i > 0 ? [...gardees, pistes[i - 1].id] : gardees;
    if (txtListe(voulues) !== (p.attend ?? '')) ch.push({ table: 'Pistes', id: p.id, champs: { attend: txtListe(voulues) } });
  });
  return ch;
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

// ---------- Import d'une sauvegarde ----------

export interface BilanImport { ajouts: number; majs: number; ignorees: number }

/**
 * Fusionne une sauvegarde dans les données en place, ligne par ligne : une ligne inconnue est ajoutée,
 * une ligne connue n'est remplacée que si la sauvegarde est PLUS RÉCENTE (colonne `maj`). Ce qui a été
 * modifié depuis l'export est donc conservé.
 */
export function changementsImport(d: Donnees, importe: Partial<Record<NomTable, Record<string, Ligne>>>): { changements: Changement[]; bilan: BilanImport } {
  const changements: Changement[] = [];
  const bilan: BilanImport = { ajouts: 0, majs: 0, ignorees: 0 };
  for (const t of NOMS_TABLES) {
    const lignes = importe[t];
    if (!lignes) continue;
    for (const l of Object.values(lignes)) {
      if (!l?.id) continue;
      const champs: Record<string, string> = {};
      for (const c of entetes(t)) if (c !== 'id' && c !== 'maj' && l[c] !== undefined) champs[c] = String(l[c] ?? '');
      const actuelle = d[t]?.[l.id];
      if (!actuelle) { changements.push({ table: t, id: l.id, champs, nouveau: true }); bilan.ajouts++; continue; }
      if ((l.maj ?? '') > (actuelle.maj ?? '')) { changements.push({ table: t, id: l.id, champs }); bilan.majs++; }
      else bilan.ignorees++;
    }
  }
  return { changements, bilan };
}
