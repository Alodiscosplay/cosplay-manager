// Dates « jour » sans heure, stockées en ISO (2026-11-03).
// On accepte aussi le format français (03/11/2026) : quelqu'un peut taper une date à la main dans le Sheet.

export type Jour = string; // 'YYYY-MM-DD'

export function aujourdhui(maintenant: Date = new Date()): Jour {
  return versJour(maintenant);
}

export function versJour(d: Date): Jour {
  const y = d.getFullYear(), m = d.getMonth() + 1, j = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
}

/** Normalise une date saisie ; renvoie '' si illisible. */
export function lireJour(v: string | undefined): Jour {
  const s = (v ?? '').trim();
  if (!s) return '';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

export function versDate(j: Jour): Date {
  const [y, m, d] = j.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Nombre de jours de a à b (b - a). */
export function ecartJours(a: Jour, b: Jour): number {
  return Math.round((versDate(b).getTime() - versDate(a).getTime()) / 86400000);
}

export function ajouterJours(j: Jour, n: number): Jour {
  const d = versDate(j);
  d.setDate(d.getDate() + n);
  return versJour(d);
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

/** « 3 nov. » ou « 3 nov. 2027 » si l'année diffère. */
export function jourCourt(j: Jour, reference: Jour = aujourdhui()): string {
  if (!j) return '';
  const [y, m, d] = j.split('-').map(Number);
  const annee = reference.slice(0, 4) === String(y) ? '' : ` ${y}`;
  return `${d} ${MOIS_COURTS[m - 1]}${annee}`;
}

/** « dans 12 j », « demain », « aujourd'hui », « il y a 3 j ». */
export function relatif(j: Jour, reference: Jour = aujourdhui()): string {
  const n = ecartJours(reference, j);
  if (n === 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  if (n === -1) return 'hier';
  if (n > 0) return n < 60 ? `dans ${n} j` : `dans ${Math.round(n / 7)} sem.`;
  return `il y a ${-n} j`;
}

/** Lundi de la semaine qui contient j. */
export function lundi(j: Jour): Jour {
  const d = versDate(j);
  const decalage = (d.getDay() + 6) % 7;
  return ajouterJours(j, -decalage);
}

/**
 * Date tapée au clavier : « 3/11/2026 », « 03/11/26 », « 3-11-2026 », « 3.11.26 », « 03112026 », « 2026-11-03 ».
 * Renvoie '' si illisible ou si la date n'existe pas (31/02).
 */
export function lireJourSaisi(v: string): Jour {
  const s = v.trim();
  if (!s) return '';
  let j: number, m: number, a: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (r) { a = +r[1]; m = +r[2]; j = +r[3]; }
  else if ((r = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/.exec(s))) { j = +r[1]; m = +r[2]; a = +r[3]; }
  else if ((r = /^(\d{2})(\d{2})(\d{2}|\d{4})$/.exec(s))) { j = +r[1]; m = +r[2]; a = +r[3]; }
  else return '';
  if (a < 100) a += 2000;
  const d = new Date(a, m - 1, j);
  if (d.getFullYear() !== a || d.getMonth() !== m - 1 || d.getDate() !== j) return '';
  return versJour(d);
}

/** « 03/11/2026 » pour l'affichage dans un champ. */
export function jourSaisi(j: Jour): string {
  if (!j) return '';
  const [a, m, d] = j.split('-');
  return `${d}/${m}/${a}`;
}
