// Fusion copie locale ↔ fichier de données du Drive. Logique PURE, testée.
//
// Les données vivent dans un seul fichier JSON, caché dans l'espace réservé à l'appli sur le Drive.
// Règles :
//  - une ligne présente des deux côtés : la version la plus récente (colonne `maj`) gagne ; à égalité,
//    le fichier, sauf si la ligne locale attend d'être envoyée ;
//  - une ligne présente d'un seul côté est GARDÉE. Rien ne disparaît par la synchro : une suppression est
//    une ligne vidée et marquée « purge », qui se propage comme une modification. Une ligne qui n'existe
//    que sur l'appareil repart donc vers le fichier — c'est ce qui protège d'un fichier perdu ou écrasé ;
//  - une table que cette version ne connaît pas (ajoutée par une version plus récente, sur un autre
//    appareil) est réécrite telle quelle : un appareil pas encore à jour ne l'efface plus.
import { type Donnees, type Ligne, type NomTable, NOMS_TABLES, donneesVides } from '../modele/schema';

/** Lignes en attente d'envoi : clé `Table/id` → `maj` au moment de la modification. */
export type Pendants = Record<string, string>;
export const clePendant = (t: NomTable, id: string) => `${t}/${id}`;

/** Le contenu du fichier de données. */
export interface Fichier {
  format: 'cosplay-planner-donnees';
  schema: number;
  maj: string;
  donnees: Partial<Record<NomTable, Record<string, Ligne>>>;
}

export interface Fusion {
  donnees: Donnees;
  /** Lignes à (r)envoyer : celles où la version locale gagne, ou qui manquent au fichier. */
  pendants: Pendants;
  /** Faut-il réécrire le fichier ? */
  aEnvoyer: boolean;
}

export function fusionner(local: Donnees, distant: Fichier['donnees'], pendants: Pendants): Fusion {
  const res = donneesVides();
  const restants: Pendants = {};
  for (const t of NOMS_TABLES) {
    const dist = distant[t] ?? {};
    const loc = local[t] ?? {};
    for (const id of new Set([...Object.keys(dist), ...Object.keys(loc)])) {
      const d = dist[id];
      const l = loc[id];
      const cle = clePendant(t, id);
      if (d && !l) { res[t][id] = d; continue; }
      if (l && !d) { res[t][id] = l; restants[cle] = l.maj || ''; continue; } // absente du fichier : on la renvoie
      const majL = l!.maj || '';
      const majD = d!.maj || '';
      const localGagne = majL > majD || (majL === majD && cle in pendants);
      res[t][id] = localGagne ? l! : d!;
      if (localGagne && majL !== majD) restants[cle] = majL;
    }
  }
  return { donnees: res, pendants: restants, aEnvoyer: Object.keys(restants).length > 0 };
}

/** Les tables du fichier que cette version de l'appli ne connaît pas. */
export function tablesInconnues(distant: Fichier['donnees']): Record<string, unknown> {
  const connues = new Set<string>(NOMS_TABLES);
  return Object.fromEntries(Object.entries(distant).filter(([t]) => !connues.has(t)));
}

/** Le fichier à écrire pour des données, en y gardant les tables inconnues lues dans le fichier. */
export function versFichier(d: Donnees, schema: number, maj: string, inconnues: Record<string, unknown> = {}): Fichier {
  return { format: 'cosplay-planner-donnees', schema, maj, donnees: { ...inconnues, ...d } as Fichier['donnees'] };
}

/** Lit un fichier téléchargé ; un contenu illisible ou d'un autre format compte comme vide. */
export function lireFichier(brut: unknown): Fichier['donnees'] {
  const f = brut as Partial<Fichier> | null;
  if (!f || f.format !== 'cosplay-planner-donnees' || typeof f.donnees !== 'object' || !f.donnees) return {};
  return f.donnees;
}
