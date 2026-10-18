// Planification : répartir les étapes jusqu'à une deadline, repérer le retard, alimenter l'agenda.
import { type Donnees, type Ligne, bool, vivant } from '../modele/schema';
import { costumes, piecesDe, pistesDe, etapesDePiste, etapesDePiece, ligne, idsAttendus } from './acces';
import { poids, avancement, avancementCostume } from './avancement';
import { lireJour, ajouterJours, ecartJours, jourCourt, type Jour } from './dates';
import { statutCostume, pieceTerminee } from './disponibilite';
import { dateEvenementCostume, evenementsDe, natureDe, nomEvenement } from './evenements';

// ---------- Deadlines effectives ----------

export function deadlineCostume(d: Donnees, c: Ligne): Jour | '' {
  const propre = lireJour(c.deadline);
  if (propre) return propre;
  return dateEvenementCostume(d, c)?.jour ?? '';
}

export function deadlinePiece(d: Donnees, p: Ligne): Jour | '' {
  const propre = lireJour(p.deadline);
  if (propre) return propre;
  const c = ligne(d, 'Costumes', p.costume_id);
  return c ? deadlineCostume(d, c) : '';
}

export function deadlineEtape(d: Donnees, e: Ligne): Jour | '' {
  const propre = lireJour(e.deadline);
  if (propre) return propre;
  const piste = ligne(d, 'Pistes', e.piste_id);
  const dp = piste && lireJour(piste.deadline);
  if (dp) return dp;
  const piece = ligne(d, 'Pieces', e.piece_id);
  return piece ? deadlinePiece(d, piece) : '';
}

// ---------- Répartir ----------

/**
 * Un plan : la fenêtre de chaque pièce (début → deadline) et la deadline de chaque étape.
 * Les sous-étapes ne portent aucune date — on s'arrête à la maille étape.
 */
export interface Plan { pieces: Record<string, { debut: Jour; deadline: Jour }>; etapes: Record<string, Jour> }

/** Marge proposée par défaut entre la fin planifiée et la deadline du costume. */
export const MARGE_DEADLINE = 7;

/** Dernier jour planifiable pour une deadline : `marge` jours avant, mais jamais avant `depuis`. */
export function finPlanifiable(deadline: Jour, depuis: Jour, marge = MARGE_DEADLINE): Jour {
  const fin = ajouterJours(deadline, -marge);
  return fin < depuis ? depuis : fin;
}

/**
 * Une étape FINIE est figée dans le planning : sa deadline garde la trace de ce qui a été fait,
 * la répartition ne la replace pas et « Effacer le planning » ne la retire pas.
 */
export function etapeFinie(d: Donnees, pisteId: string): boolean {
  const sousEtapes = etapesDePiste(d, pisteId);
  return sousEtapes.length > 0 && sousEtapes.every(e => bool(e.fait));
}

/** Poids restant (sous-étapes non cochées) d'une étape, puis d'une pièce. */
const resteEtape = (d: Donnees, pisteId: string) =>
  etapesDePiste(d, pisteId).filter(e => !bool(e.fait)).reduce((s, e) => s + poids(e), 0);
const restePiece = (d: Donnees, pieceId: string) =>
  etapesDePiece(d, pieceId).filter(e => !bool(e.fait)).reduce((s, e) => s + poids(e), 0);

/**
 * Les vagues d'une pièce : les étapes qui ne s'attendent pas avancent ensemble, celles qui en
 * attendent d'autres viennent après, en autant de vagues qu'il y a de maillons dans la chaîne.
 */
export function vaguesDePiece(d: Donnees, pieceId: string): Ligne[][] {
  const pistes = pistesDe(d, pieceId);
  const parId = new Map(pistes.map(p => [p.id, p]));
  const profondeurs = new Map<string, number>();
  const profondeur = (p: Ligne, vus: Set<string> = new Set()): number => {
    if (profondeurs.has(p.id)) return profondeurs.get(p.id)!;
    if (vus.has(p.id)) return 0; // boucle : on ne s'y enfonce pas
    vus.add(p.id);
    const avant = idsAttendus(p).map(id => parId.get(id)).filter((x): x is Ligne => !!x);
    const n = avant.length ? Math.max(...avant.map(x => profondeur(x, vus))) + 1 : 0;
    profondeurs.set(p.id, n);
    return n;
  };
  const vagues: Ligne[][] = [];
  for (const p of pistes) (vagues[profondeur(p)] ??= []).push(p);
  return vagues.filter(v => v?.length);
}

/**
 * Planifie une pièce dans sa fenêtre : chaque vague reçoit une part de temps proportionnelle à son
 * étape la plus lourde, et toutes les étapes d'une vague partagent la deadline de leur vague.
 * Une étape qui a DÉJÀ une deadline la garde (sauf `remplacer`) et sert de point de repère.
 */
export function planifierPiece(d: Donnees, pieceId: string, depuis: Jour, jusqua: Jour, plan: Plan, remplacer = false): void {
  const vagues = vaguesDePiece(d, pieceId);
  const poidsVague = vagues.map(v => Math.max(0, ...v.map(p => resteEtape(d, p.id))));
  const total = poidsVague.reduce((a, b) => a + b, 0);
  const duree = Math.max(0, ecartJours(depuis, jusqua));
  let cumul = 0;
  vagues.forEach((vague, i) => {
    cumul += poidsVague[i];
    const finVague = ajouterJours(depuis, total ? Math.round((duree * cumul) / total) : duree);
    for (const p of vague) {
      if (etapeFinie(d, p.id)) continue; // déjà faite : sa date ne bouge plus
      const propre = lireJour(p.deadline);
      if (propre && !remplacer) continue; // sa deadline à elle fait foi
      plan.etapes[p.id] = finVague;
    }
  });
}

/** L'ordre de fabrication des pièces : celui retenu au dernier « Répartir », sinon l'ordre d'affichage. */
export function ordrePlanning(d: Donnees, costumeId: string): Ligne[] {
  const pieces = piecesDe(d, costumeId);
  const rang = (p: Ligne) => (p.ordre_planning ?? '').trim();
  return [...pieces].sort((a, b) => {
    const ra = rang(a), rb = rang(b);
    if (ra && rb) return Number(ra) - Number(rb);
    if (ra) return -1;
    if (rb) return 1;
    return 0;
  });
}

/**
 * Planifie un costume entre aujourd'hui et la fin choisie : les pièces se suivent dans l'ordre donné,
 * chacune pour une part de temps proportionnelle à son poids restant, puis chaque pièce répartit ses
 * étapes. Une pièce qui porte déjà un début ou une deadline garde sa fenêtre (sauf `remplacer`).
 */
export function planifierCostume(d: Donnees, costumeId: string, depuis: Jour, jusqua: Jour,
                                 options: { ordre?: string[]; pieces?: string[]; remplacer?: boolean } = {}): Plan {
  const plan: Plan = { pieces: {}, etapes: {} };
  const remplacer = !!options.remplacer;
  const retenues = options.pieces && new Set(options.pieces);
  const toutes = piecesDe(d, costumeId).filter(p => !pieceTerminee(d, p.id) && (!retenues || retenues.has(p.id)));
  const rang = new Map((options.ordre ?? ordrePlanning(d, costumeId).map(p => p.id)).map((id, i) => [id, i]));
  const pieces = [...toutes].sort((a, b) => (rang.get(a.id) ?? 0) - (rang.get(b.id) ?? 0));

  // Les pièces qui ont déjà leur fenêtre la gardent ; les autres se partagent le temps restant.
  const libres = pieces.filter(p => remplacer || (!lireJour(p.debut) && !lireJour(p.deadline)));
  const fixees = pieces.filter(p => !libres.includes(p));
  for (const p of fixees) {
    const debut = lireJour(p.debut) || depuis;
    const fin = lireJour(p.deadline) || jusqua;
    planifierPiece(d, p.id, debut < fin ? debut : fin, fin, plan, remplacer);
  }
  const total = libres.reduce((s, p) => s + restePiece(d, p.id), 0);
  const duree = Math.max(0, ecartJours(depuis, jusqua));
  let cumul = 0;
  for (const p of libres) {
    const debut = ajouterJours(depuis, total ? Math.round((duree * cumul) / total) : 0);
    cumul += restePiece(d, p.id);
    const fin = ajouterJours(depuis, total ? Math.round((duree * cumul) / total) : duree);
    plan.pieces[p.id] = { debut, deadline: fin };
    planifierPiece(d, p.id, debut, fin, plan, remplacer);
  }
  return plan;
}

/**
 * Début affiché d'une étape : sa pièce commence, ou la dernière deadline des étapes qu'elle attend.
 * Rien n'est stocké — une étape ne porte que sa deadline.
 */
export function debutEtape(d: Donnees, piste: Ligne): Jour | '' {
  const piece = ligne(d, 'Pieces', piste.piece_id);
  const base = (piece && lireJour(piece.debut)) || '';
  const avant = idsAttendus(piste)
    .map(id => ligne(d, 'Pistes', id))
    .filter((x): x is Ligne => !!x && x.piece_id === piste.piece_id)
    .map(x => lireJour(x.deadline))
    .filter(Boolean);
  const apres = avant.length ? avant.reduce((a, b) => (a > b ? a : b)) : '';
  if (apres && base) return apres > base ? apres : base;
  return apres || base;
}

// ---------- Retard ----------

export interface Retard { enRetard: Ligne[]; pctAttendu: number | null; pctReel: number | null }

/**
 * Le retard se mesure à la maille étape : une étape dont la deadline est passée et qui n'est pas
 * finie est en retard. Le % attendu est le poids des étapes qui devraient être finies aujourd'hui.
 */
export function retardPiece(d: Donnees, pieceId: string, jour: Jour): Retard {
  const pistes = pistesDe(d, pieceId);
  const finie = (p: Ligne) => etapesDePiste(d, p.id).every(e => bool(e.fait));
  const datees = pistes.filter(p => lireJour(p.deadline));
  const enRetard = datees.filter(p => lireJour(p.deadline) < jour && !finie(p));
  const etapes = etapesDePiece(d, pieceId);
  const total = etapes.reduce((s, e) => s + poids(e), 0);
  const attendu = datees.filter(p => lireJour(p.deadline) <= jour)
    .reduce((s, p) => s + etapesDePiste(d, p.id).reduce((x, e) => x + poids(e), 0), 0);
  return {
    enRetard,
    pctAttendu: datees.length && total ? (100 * attendu) / total : null,
    pctReel: avancement(etapes).pct,
  };
}

// ---------- Alertes ----------

export interface Alerte { niveau: 'rouge' | 'orange'; texte: string; costumeId: string }

/**
 * Les alertes de l'accueil. Une échéance entre dans la liste à `joursAvant` jours ; elle est ROUGE
 * quand elle est dépassée ou à moins de `joursRouge` jours, ORANGE au-delà. Chaque texte nomme le
 * costume, pour qu'on sache à quel projet il se rapporte.
 */
export function alertes(d: Donnees, jour: Jour, joursAvant = 14, joursRouge = 3): Alerte[] {
  const res: Alerte[] = [];
  const proche = (j: Jour) => j && ecartJours(jour, j) <= joursAvant;
  const niveau = (j: Jour): 'rouge' | 'orange' => (j < jour || ecartJours(jour, j) <= joursRouge ? 'rouge' : 'orange');

  for (const c of costumes(d)) {
    const sc = statutCostume(c, jour);
    if (sc === 'terminé' || sc === 'archivé') continue;
    const dc = deadlineCostume(d, c);
    const av = avancementCostume(d, c.id);
    if (dc && proche(dc) && av.pct !== 100) {
      res.push({ niveau: niveau(dc), costumeId: c.id,
        texte: dc < jour ? `${c.nom} : deadline dépassée (${jourCourt(dc, jour)})` : `${c.nom} : deadline le ${jourCourt(dc, jour)}` });
    }
    for (const p of piecesDe(d, c.id)) {
      if (pieceTerminee(d, p.id)) continue;
      const dp = lireJour(p.deadline);
      if (dp && proche(dp)) res.push({ niveau: niveau(dp), costumeId: c.id,
        texte: dp < jour ? `${c.nom} › ${p.nom} : deadline dépassée (${jourCourt(dp, jour)})` : `${c.nom} › ${p.nom} : à finir pour le ${jourCourt(dp, jour)}` });
      // Une pièce déjà hors délai a son alerte rouge : ses étapes en retard n'en rajoutent pas une.
      const r = retardPiece(d, p.id, jour);
      if (r.enRetard.length && !(dp && dp < jour)) res.push({ niveau: 'orange', costumeId: c.id,
        texte: `${c.nom} › ${p.nom} : ${r.enRetard.length} étape${r.enRetard.length > 1 ? 's' : ''} en retard sur le planning` });
      for (const pi of pistesDe(d, p.id)) {
        if (etapesDePiste(d, pi.id).every(e => bool(e.fait))) continue;
        const de = lireJour(pi.deadline);
        if (!de) continue;
        // Une étape datée après sa pièce : on avertit, on ne corrige pas.
        if (dp && de > dp) res.push({ niveau: 'orange', costumeId: c.id,
          texte: `${c.nom} › ${p.nom}${pi.nom ? ` › ${pi.nom}` : ''} : étape datée au ${jourCourt(de, jour)}, après la deadline de la pièce (${jourCourt(dp, jour)})` });
        // Une étape sans nom n'annonce rien de plus que sa pièce.
        if (pi.nom && proche(de) && de >= jour) res.push({ niveau: niveau(de), costumeId: c.id,
          texte: `${c.nom} › ${p.nom} › ${pi.nom} : pour le ${jourCourt(de, jour)}` });
      }
    }
  }
  return res;
}

// ---------- Agenda : les pièces sur leur durée ----------

/** Une pièce vue dans l'agenda : de son début à sa deadline, comme une barre du planning. */
export interface FenetrePiece { piece: Ligne; costume: Ligne; debut: Jour; fin: Jour; faite: boolean }

/**
 * Les pièces dont la fenêtre croise [depuis, jusqua]. Sans début, la barre tient sur le jour de la
 * deadline ; sans deadline propre, la dernière deadline de ses étapes en tient lieu.
 */
export function fenetresPieces(d: Donnees, depuis: Jour, jusqua: Jour, costumeFiltre?: string): FenetrePiece[] {
  const res: FenetrePiece[] = [];
  for (const c of costumes(d)) {
    if (c.statut === 'archivé' || (costumeFiltre && c.id !== costumeFiltre)) continue;
    for (const p of piecesDe(d, c.id)) {
      const deadlines = pistesDe(d, p.id).map(x => lireJour(x.deadline)).filter(Boolean).sort();
      const fin = lireJour(p.deadline) || deadlines[deadlines.length - 1] || '';
      if (!fin) continue;
      const debutPropre = lireJour(p.debut);
      const debut = debutPropre && debutPropre <= fin ? debutPropre : fin;
      if (fin < depuis || debut > jusqua) continue;
      res.push({ piece: p, costume: c, debut, fin, faite: pieceTerminee(d, p.id) });
    }
  }
  return res.sort((a, b) => a.debut.localeCompare(b.debut) || b.fin.localeCompare(a.fin));
}

/** Un événement sur l'agenda, en barre de son premier à son dernier jour. */
export interface FenetreEvenement { evenement: Ligne; debut: Jour; fin: Jour }

/** Les événements visibles par le filtre : ceux où le costume est porté, et leur convention. */
export function evenementsDuFiltre(d: Donnees, costumeFiltre?: string): Set<string> | undefined {
  if (!costumeFiltre) return undefined;
  const c = ligne(d, 'Costumes', costumeFiltre);
  const ids = new Set<string>();
  for (const e of c ? evenementsDe(d, c) : []) { ids.add(e.id); if (e.convention_id) ids.add(e.convention_id); }
  return ids;
}

export function fenetresEvenements(d: Donnees, depuis: Jour, jusqua: Jour, costumeFiltre?: string): FenetreEvenement[] {
  const garder = evenementsDuFiltre(d, costumeFiltre);
  const res: FenetreEvenement[] = [];
  for (const ev of Object.values(d.Evenements)) {
    if (!vivant(ev) || (garder && !garder.has(ev.id))) continue;
    const debut = lireJour(ev.date_debut);
    if (!debut) continue;
    const f = lireJour(ev.date_fin);
    const fin = f && f >= debut ? f : debut;
    if (fin < depuis || debut > jusqua) continue;
    res.push({ evenement: ev, debut, fin });
  }
  // Les conventions avant leurs activités : elles prennent la ligne du haut.
  return res.sort((a, b) => a.debut.localeCompare(b.debut) || b.fin.localeCompare(a.fin) || (a.evenement.convention_id ? 1 : 0) - (b.evenement.convention_id ? 1 : 0));
}

/** Un morceau de barre sur une semaine, rangé dans la première ligne libre. */
export interface Travee<T = FenetrePiece> { fenetre: T; de: number; a: number; ligne: number; ouvre: boolean; ferme: boolean }

/**
 * Découpe les fenêtres sur la semaine qui commence le `lundi` (colonnes 0 à 6) et les range en lignes
 * sans chevauchement : la première barre qui commence prend la première ligne libre.
 */
export function traveesSemaine<T extends { debut: Jour; fin: Jour }>(fenetres: T[], lundi: Jour): Travee<T>[] {
  const dimanche = ajouterJours(lundi, 6);
  const lignes: number[] = []; // dernière colonne occupée par ligne
  const res: Travee<T>[] = [];
  for (const f of fenetres) {
    if (f.fin < lundi || f.debut > dimanche) continue;
    const de = f.debut < lundi ? 0 : ecartJours(lundi, f.debut);
    const a = f.fin > dimanche ? 6 : ecartJours(lundi, f.fin);
    let ligne = lignes.findIndex(fin => fin < de);
    if (ligne === -1) { ligne = lignes.length; lignes.push(a); } else lignes[ligne] = a;
    res.push({ fenetre: f, de, a, ligne, ouvre: f.debut >= lundi, ferme: f.fin <= dimanche });
  }
  return res;
}

// ---------- Agenda ----------

export type TypeAgenda = 'deadline' | 'evenement' | 'datecle' | 'tache';

export interface ElementAgenda {
  jour: Jour; type: TypeAgenda; titre: string; detail: string;
  costumeId?: string; fait: boolean; ref: { table: string; id: string };
}

export function agenda(d: Donnees, depuis: Jour, jusqua: Jour, costumeFiltre?: string): ElementAgenda[] {
  const res: ElementAgenda[] = [];
  const dans = (j: Jour) => j && j >= depuis && j <= jusqua;
  const garder = (costumeId?: string) => !costumeFiltre || costumeFiltre === costumeId;

  // Les événements eux-mêmes sont des barres (fenetresEvenements) ; ici, leurs dates clés.
  const evs = evenementsDuFiltre(d, costumeFiltre);
  for (const dc of Object.values(d.DatesCles)) {
    const ev = vivant(dc) ? ligne(d, 'Evenements', dc.evenement_id) : undefined;
    if (!ev || (evs && !evs.has(ev.id))) continue;
    const pousser = (j: Jour, detail: string) => {
      if (dans(j)) res.push({ jour: j, type: 'datecle', titre: `${nomEvenement(d, ev)} — ${dc.titre}`, detail, fait: bool(dc.fait), ref: { table: 'DatesCles', id: dc.id } });
    };
    const debut = lireJour(dc.debut), fin = lireJour(dc.fin);
    switch (natureDe(dc)) {
      case 'periode':
        if (debut) pousser(debut, fin === debut ? 'ouverture et clôture' : 'ouverture');
        if (fin && fin !== debut) pousser(fin, 'clôture');
        break;
      case 'limite': if (fin) pousser(fin, 'date limite'); break;
      case 'fixe': if (fin) pousser(fin, 'date fixe'); break;
    }
  }
  // Titre toujours préfixé par le costume : « Mary Poppins — Robe » ne se confond pas avec la robe d'un autre projet.
  for (const c of costumes(d)) {
    if (!garder(c.id) || c.statut === 'archivé') continue;
    const t = (...morceaux: string[]) => `${c.nom} — ${morceaux.filter(Boolean).join(' › ')}`;
    const dc = lireJour(c.deadline);
    if (dans(dc)) res.push({ jour: dc, type: 'deadline', titre: c.nom, detail: 'deadline du costume', costumeId: c.id, fait: c.statut === 'terminé', ref: { table: 'Costumes', id: c.id } });
    for (const p of piecesDe(d, c.id)) {
      const finie = pieceTerminee(d, p.id);
      const dp = lireJour(p.deadline);
      if (dans(dp)) res.push({ jour: dp, type: 'deadline', titre: t(p.nom), detail: 'deadline de la pièce', costumeId: c.id, fait: finie, ref: { table: 'Pieces', id: p.id } });
    }
  }
  for (const t of Object.values(d.Taches)) {
    if (!vivant(t) || !garder(t.costume_id || undefined)) continue;
    const j = lireJour(t.date);
    const c = ligne(d, 'Costumes', t.costume_id);
    if (dans(j)) res.push({ jour: j, type: 'tache', titre: c ? `${c.nom} — ${t.titre}` : t.titre, detail: 'tâche', costumeId: t.costume_id || undefined, fait: bool(t.fait), ref: { table: 'Taches', id: t.id } });
  }
  const rang: Record<TypeAgenda, number> = { evenement: 0, datecle: 1, deadline: 2, tache: 3 };
  return res.sort((a, b) => a.jour.localeCompare(b.jour) || rang[a.type] - rang[b.type]);
}
