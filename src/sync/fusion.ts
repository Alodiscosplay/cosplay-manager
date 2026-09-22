// Fusion copie locale ↔ Sheet. Logique PURE, testée.
//
// Règles :
//  - le Sheet fait foi, SAUF pour une ligne modifiée localement et pas encore envoyée (« en attente ») :
//    dans ce cas, la version la plus récente (colonne `maj`) gagne ;
//  - une ligne locale absente du Sheet est gardée seulement si elle est en attente (créée hors-ligne) ;
//  - on n'efface jamais de ligne dans le Sheet (suppression = marqueur), donc les numéros de ligne sont stables.
import { type Donnees, type Ligne, type NomTable, NOMS_TABLES, entetes, donneesVides } from '../modele/schema';
import { type Classeur, type Ecriture } from './sheets';

/** Lignes en attente d'envoi : clé `Table/id` → `maj` au moment de la modification. */
export type Pendants = Record<string, string>;
export const clePendant = (t: NomTable, id: string) => `${t}/${id}`;

export interface Distant { lignes: Partial<Record<NomTable, Map<string, { ligne: Ligne; numero: number }>>>; prochaine: Partial<Record<NomTable, number>> }

export function lireDistant(c: Classeur): Distant {
  const res: Distant = { lignes: {}, prochaine: {} };
  for (const t of NOMS_TABLES) {
    const o = c[t];
    const m = new Map<string, { ligne: Ligne; numero: number }>();
    res.lignes[t] = m;
    if (!o) { res.prochaine[t] = 2; continue; }
    o.valeurs.slice(1).forEach((vals, i) => {
      const l = {} as Ligne;
      for (const h of entetes(t)) l[h] = '';
      o.entetes.forEach((h, j) => { if (h) l[h] = (vals[j] ?? '').trim(); });
      if (l.id && !m.has(l.id)) m.set(l.id, { ligne: l, numero: i + 2 });
    });
    res.prochaine[t] = Math.max(2, o.valeurs.length + 1);
  }
  return res;
}

export function fusionner(local: Donnees, distant: Distant, pendants: Pendants): { donnees: Donnees; pendants: Pendants } {
  const res = donneesVides();
  const restants: Pendants = { ...pendants };
  for (const t of NOMS_TABLES) {
    const dist = distant.lignes[t] ?? new Map();
    for (const [id, { ligne }] of dist) {
      const cle = clePendant(t, id);
      const loc = local[t][id];
      if (cle in restants && loc && (loc.maj || '') >= (ligne.maj || '')) res[t][id] = loc;
      else { res[t][id] = ligne; delete restants[cle]; }
    }
    for (const [id, loc] of Object.entries(local[t])) {
      if (!dist.has(id) && clePendant(t, id) in restants) res[t][id] = loc;
    }
  }
  // Un pendant dont la ligne n'existe plus nulle part n'a plus lieu d'être.
  for (const cle of Object.keys(restants)) {
    const [t, id] = cle.split('/') as [NomTable, string];
    if (!res[t]?.[id]) delete restants[cle];
  }
  return { donnees: res, pendants: restants };
}

/** Écritures à faire pour les lignes en attente : mise à jour à leur numéro, ou nouvelle ligne à la fin. */
export function ecrituresAFaire(d: Donnees, distant: Distant, c: Classeur, pendants: Pendants): Ecriture[] {
  const res: Ecriture[] = [];
  const prochaine = { ...distant.prochaine };
  for (const cle of Object.keys(pendants).sort()) {
    const [t, id] = cle.split('/') as [NomTable, string];
    const l = d[t]?.[id];
    if (!l) continue;
    const tete = c[t]?.entetes ?? entetes(t);
    const valeurs = tete.map(h => (h ? l[h] ?? '' : ''));
    const existant = distant.lignes[t]?.get(id);
    const numero = existant?.numero ?? (prochaine[t] = (prochaine[t] ?? 2) + 1) - 1;
    res.push({ table: t, numero, valeurs });
  }
  return res;
}
