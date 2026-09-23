// Planification : répartir les étapes jusqu'à une deadline, repérer le retard, alimenter l'agenda.
import { type Donnees, type Ligne, bool, vivant } from '../modele/schema';
import { costumes, piecesDe, pistesDe, etapesDePiste, etapesDePiece, ligne, idsAttendus } from './acces';
import { poids, avancement } from './avancement';
import { lireJour, ajouterJours, ecartJours, type Jour } from './dates';
import { statutCostume, pieceTerminee } from './disponibilite';

// ---------- Deadlines effectives ----------

export function deadlineCostume(d: Donnees, c: Ligne): Jour | '' {
  const propre = lireJour(c.deadline);
  if (propre) return propre;
  const ev = ligne(d, 'Evenements', c.evenement_id);
  return ev ? lireJour(ev.date_debut) : '';
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

export type Repartition = Record<string, Jour>; // id d'étape → date prévue

/** Marge proposée par défaut avant une deadline quand on répartit : une semaine, modifiable à la répartition. */
export const MARGE_DEADLINE = 7;

/** Dernier jour planifiable pour une deadline : une semaine avant, mais jamais avant `depuis`. */
export function finPlanifiable(deadline: Jour, depuis: Jour, marge = MARGE_DEADLINE): Jour {
  const fin = ajouterJours(deadline, -marge);
  return fin < depuis ? depuis : fin;
}

/** Place un bloc d'étapes entre deux dates, proportionnellement à leur poids. */
function placerBloc(bloc: Ligne[], depuis: Jour, jusqua: Jour, res: Repartition): void {
  const total = bloc.reduce((s, e) => s + poids(e), 0);
  const duree = Math.max(0, ecartJours(depuis, jusqua));
  let cumul = 0;
  for (const e of bloc) {
    cumul += poids(e);
    res[e.id] = ajouterJours(depuis, total ? Math.round((duree * cumul) / total) : duree);
  }
}

/**
 * Place des étapes (dans l'ordre) entre deux dates, proportionnellement à leur poids.
 * Une sous-étape qui porte DÉJÀ une date prévue est un point fixe : sa date est gardée telle quelle,
 * et les autres se répartissent autour d'elle. C'est l'outil qui s'adapte au choix de l'utilisateur.
 */
export function repartirSuite(etapes: Ligne[], depuis: Jour, jusqua: Jour, res: Repartition = {}, remplacer = false): Repartition {
  const aFaire = etapes.filter(e => !bool(e.fait));
  if (remplacer) { placerBloc(aFaire, depuis, jusqua, res); return res; }
  let curseur = depuis;
  let i = 0;
  while (i < aFaire.length) {
    let j = i;
    while (j < aFaire.length && !lireJour(aFaire[j].date_prevue)) j++;
    const ancre = j < aFaire.length ? lireJour(aFaire[j].date_prevue) : '';
    // le bloc libre court jusqu'au point fixe suivant (jamais avant le curseur), sinon jusqu'à la fin
    const fin = ancre ? (ancre > curseur ? ancre : curseur) : jusqua;
    if (j > i) placerBloc(aFaire.slice(i, j), curseur, fin, res);
    if (!ancre) break;
    curseur = fin;
    i = j + 1;
  }
  return res;
}

/**
 * Répartit une pièce. Les étapes qui ne s'attendent pas avancent en parallèle ; celles qui en
 * attendent d'autres viennent après, en autant de vagues qu'il y a de maillons dans la chaîne
 * (Doublure → Montage → Finitions fait trois vagues). Chaque vague reçoit une part de temps
 * proportionnelle à son étape la plus lourde.
 */
export function repartirPiece(d: Donnees, pieceId: string, depuis: Jour, jusqua: Jour, res: Repartition = {}, remplacer = false): Repartition {
  // Rien n'est planifié avant la date de début de la pièce.
  const debutPiece = lireJour(d.Pieces[pieceId]?.debut);
  if (debutPiece && debutPiece > depuis) depuis = debutPiece < jusqua ? debutPiece : jusqua;
  const pistes = pistesDe(d, pieceId);
  const parId = new Map(pistes.map(p => [p.id, p]));
  const reste = (p: Ligne) => etapesDePiste(d, p.id).filter(e => !bool(e.fait)).reduce((s, e) => s + poids(e), 0);

  // Profondeur d'une étape = longueur de sa chaîne d'attentes dans la pièce (0 = rien à attendre).
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
  for (const p of pistes) profondeur(p);

  // Une vague par profondeur, dans l'ordre ; son poids est celui de son étape la plus lourde.
  const vagues: Ligne[][] = [];
  for (const p of pistes) (vagues[profondeurs.get(p.id)!] ??= []).push(p);
  const presentes = vagues.filter(v => v?.length);
  const poidsVague = presentes.map(v => Math.max(0, ...v.map(reste)));
  const total = poidsVague.reduce((a, b) => a + b, 0);
  const duree = Math.max(0, ecartJours(depuis, jusqua));

  let cumul = 0;
  presentes.forEach((vague, i) => {
    const debutVague = ajouterJours(depuis, total ? Math.round((duree * cumul) / total) : 0);
    cumul += poidsVague[i];
    const finVague = ajouterJours(depuis, total ? Math.round((duree * cumul) / total) : duree);
    for (const p of vague) {
      const dp = lireJour(p.debut); // une étape qui commence plus tard aussi
      const a = dp && dp > debutVague ? (dp < finVague ? dp : finVague) : debutVague;
      repartirSuite(etapesDePiste(d, p.id), a, finVague, res, remplacer);
    }
  });
  return res;
}

/**
 * Répartit un costume : une pièce qui a ses propres dates (début ou deadline) garde sa fenêtre
 * [son début ou aujourd'hui, sa deadline ou celle du costume] ; les autres se suivent dans l'ordre
 * jusqu'à la deadline du costume, chacune pour une part proportionnelle à son poids restant.
 */
export function repartirCostume(d: Donnees, costumeId: string, depuis: Jour, jusqua: Jour, marge = MARGE_DEADLINE, remplacer = false): Repartition {
  const res: Repartition = {};
  const pieces = piecesDe(d, costumeId).filter(p => !pieceTerminee(d, p.id));
  const libres: Ligne[] = [];
  for (const p of pieces) {
    const propre = lireJour(p.deadline);
    // `jusqua` a déjà sa marge ; une deadline propre à la pièce reçoit la sienne.
    if (propre || lireJour(p.debut)) repartirPiece(d, p.id, depuis, propre ? finPlanifiable(propre, depuis, marge) : jusqua, res, remplacer);
    else libres.push(p);
  }
  const reste = (p: Ligne) => etapesDePiece(d, p.id).filter(e => !bool(e.fait)).reduce((s, e) => s + poids(e), 0);
  const total = libres.reduce((s, p) => s + reste(p), 0);
  const duree = Math.max(0, ecartJours(depuis, jusqua));
  let cumul = 0;
  for (const p of libres) {
    const debut = ajouterJours(depuis, total ? Math.round((duree * cumul) / total) : 0);
    cumul += reste(p);
    const fin = ajouterJours(depuis, total ? Math.round((duree * cumul) / total) : duree);
    repartirPiece(d, p.id, debut, fin, res, remplacer);
  }
  return res;
}

// ---------- Retard ----------

export interface Retard { enRetard: Ligne[]; pctAttendu: number | null; pctReel: number | null }

/** Une étape est en retard si sa date prévue est passée et qu'elle n'est pas cochée. */
export function retard(etapes: Ligne[], jour: Jour): Retard {
  const planifiees = etapes.filter(e => lireJour(e.date_prevue));
  const enRetard = planifiees.filter(e => !bool(e.fait) && lireJour(e.date_prevue) < jour);
  const total = etapes.reduce((s, e) => s + poids(e), 0);
  const attendu = etapes.filter(e => { const j = lireJour(e.date_prevue); return j && j <= jour; })
    .reduce((s, e) => s + poids(e), 0);
  return {
    enRetard,
    pctAttendu: planifiees.length && total ? (100 * attendu) / total : null,
    pctReel: avancement(etapes).pct,
  };
}

// ---------- Alertes ----------

export interface Alerte { niveau: 'rouge' | 'orange'; texte: string; costumeId: string }

export function alertes(d: Donnees, jour: Jour, joursAvant = 14): Alerte[] {
  const res: Alerte[] = [];
  const proche = (j: Jour) => j && ecartJours(jour, j) <= joursAvant;
  const niveau = (j: Jour): 'rouge' | 'orange' => (j < jour || ecartJours(jour, j) <= 3 ? 'rouge' : 'orange');

  for (const c of costumes(d)) {
    const sc = statutCostume(c, jour);
    if (sc === 'terminé' || sc === 'archivé') continue;
    const dc = deadlineCostume(d, c);
    const av = avancement(piecesDe(d, c.id).flatMap(p => etapesDePiece(d, p.id)));
    if (dc && proche(dc) && av.pct !== 100) {
      res.push({ niveau: niveau(dc), costumeId: c.id,
        texte: dc < jour ? `${c.nom} : deadline dépassée` : `${c.nom} : deadline le ${dc}` });
    }
    for (const p of piecesDe(d, c.id)) {
      if (pieceTerminee(d, p.id)) continue;
      const dp = lireJour(p.deadline);
      if (dp && proche(dp)) res.push({ niveau: niveau(dp), costumeId: c.id,
        texte: dp < jour ? `${p.nom} (${c.nom}) : deadline dépassée` : `${p.nom} (${c.nom}) : à finir pour le ${dp}` });
      const etapes = etapesDePiece(d, p.id);
      const r = retard(etapes, jour);
      if (r.enRetard.length) res.push({ niveau: 'orange', costumeId: c.id,
        texte: `${p.nom} (${c.nom}) : ${r.enRetard.length} sous-étape${r.enRetard.length > 1 ? 's' : ''} en retard sur le planning` });
      for (const e of etapes) {
        if (bool(e.fait)) continue;
        const prevue = lireJour(e.date_prevue);
        const limite = deadlineEtape(d, e);
        if (prevue && limite && prevue > limite) res.push({ niveau: 'orange', costumeId: c.id,
          texte: `« ${e.titre} » (${p.nom}) est prévue après sa deadline` });
        const de = lireJour(e.deadline);
        if (de && proche(de)) res.push({ niveau: niveau(de), costumeId: c.id,
          texte: de < jour ? `« ${e.titre} » (${p.nom}) : deadline dépassée` : `« ${e.titre} » (${p.nom}) : pour le ${de}` });
      }
    }
  }
  return res;
}

// ---------- Agenda ----------

export type TypeAgenda = 'deadline' | 'debut' | 'prevue' | 'evenement' | 'tache';

export interface ElementAgenda {
  jour: Jour; type: TypeAgenda; titre: string; detail: string;
  costumeId?: string; fait: boolean; ref: { table: string; id: string };
}

export function agenda(d: Donnees, depuis: Jour, jusqua: Jour, costumeFiltre?: string): ElementAgenda[] {
  const res: ElementAgenda[] = [];
  const dans = (j: Jour) => j && j >= depuis && j <= jusqua;
  const garder = (costumeId?: string) => !costumeFiltre || costumeFiltre === costumeId;

  for (const ev of Object.values(d.Evenements)) {
    if (!vivant(ev)) continue;
    const j = lireJour(ev.date_debut);
    if (!costumeFiltre && dans(j)) res.push({ jour: j, type: 'evenement', titre: ev.nom, detail: ev.lieu || '', fait: false, ref: { table: 'Evenements', id: ev.id } });
  }
  // Titre toujours préfixé par le costume : « Mary Poppins — Robe » ne se confond pas avec la robe d'un autre projet.
  for (const c of costumes(d)) {
    if (!garder(c.id) || c.statut === 'archivé') continue;
    const t = (...morceaux: string[]) => `${c.nom} — ${morceaux.filter(Boolean).join(' › ')}`;
    const dc = lireJour(c.deadline);
    if (dans(dc)) res.push({ jour: dc, type: 'deadline', titre: c.nom, detail: 'deadline du costume', costumeId: c.id, fait: c.statut === 'terminé', ref: { table: 'Costumes', id: c.id } });
    const db = lireJour(c.debut);
    if (dans(db)) res.push({ jour: db, type: 'debut', titre: c.nom, detail: 'début du costume', costumeId: c.id, fait: false, ref: { table: 'Costumes', id: c.id } });
    for (const p of piecesDe(d, c.id)) {
      const finie = pieceTerminee(d, p.id);
      const dp = lireJour(p.deadline);
      if (dans(dp)) res.push({ jour: dp, type: 'deadline', titre: t(p.nom), detail: 'deadline de la pièce', costumeId: c.id, fait: finie, ref: { table: 'Pieces', id: p.id } });
      const bp = lireJour(p.debut);
      if (dans(bp)) res.push({ jour: bp, type: 'debut', titre: t(p.nom), detail: 'début de la pièce', costumeId: c.id, fait: false, ref: { table: 'Pieces', id: p.id } });
      for (const pi of pistesDe(d, p.id)) {
        const nomEtape = pi.nom || 'étape principale';
        const bpi = lireJour(pi.debut);
        if (dans(bpi)) res.push({ jour: bpi, type: 'debut', titre: t(p.nom, nomEtape), detail: "début de l'étape", costumeId: c.id, fait: false, ref: { table: 'Pistes', id: pi.id } });
        const dpi = lireJour(pi.deadline);
        if (dans(dpi)) res.push({ jour: dpi, type: 'deadline', titre: t(p.nom, nomEtape), detail: "deadline de l'étape", costumeId: c.id, fait: false, ref: { table: 'Pistes', id: pi.id } });
        for (const e of etapesDePiste(d, pi.id)) {
          const fait = bool(e.fait);
          const jp = lireJour(e.date_prevue);
          if (dans(jp)) res.push({ jour: jp, type: 'prevue', titre: t(p.nom, e.titre), detail: `étape ${nomEtape}`, costumeId: c.id, fait, ref: { table: 'Etapes', id: e.id } });
          const jd = lireJour(e.deadline);
          if (dans(jd)) res.push({ jour: jd, type: 'deadline', titre: t(p.nom, e.titre), detail: `étape ${nomEtape}`, costumeId: c.id, fait, ref: { table: 'Etapes', id: e.id } });
        }
      }
    }
  }
  for (const t of Object.values(d.Taches)) {
    if (!vivant(t) || !garder(t.costume_id || undefined)) continue;
    const j = lireJour(t.date);
    const c = ligne(d, 'Costumes', t.costume_id);
    if (dans(j)) res.push({ jour: j, type: 'tache', titre: c ? `${c.nom} — ${t.titre}` : t.titre, detail: 'tâche', costumeId: t.costume_id || undefined, fait: bool(t.fait), ref: { table: 'Taches', id: t.id } });
  }
  const rang: Record<TypeAgenda, number> = { evenement: 0, deadline: 1, debut: 2, tache: 3, prevue: 4 };
  return res.sort((a, b) => a.jour.localeCompare(b.jour) || rang[a.type] - rang[b.type]);
}
