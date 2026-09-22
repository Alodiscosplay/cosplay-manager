// Accès brut au Google Sheet : lire tous les onglets, compléter la structure, écrire des lignes.
import { gjson } from './google';
import { NOMS_TABLES, entetes, type NomTable } from '../modele/schema';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface Onglet { sheetId: number; nbLignesGrille: number; nbColonnesGrille: number; entetes: string[]; valeurs: string[][] }
export type Classeur = Partial<Record<NomTable, Onglet>>;

interface Proprietes { sheetId: number; title: string; gridProperties: { rowCount: number; columnCount: number } }

async function proprietes(id: string): Promise<Proprietes[]> {
  const r = await gjson<{ sheets: { properties: Proprietes }[] }>(
    `${API}/${id}?fields=sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))`);
  return r.sheets.map(s => s.properties);
}

/** Lit toutes les tables en deux appels. Les onglets absents sont créés, les en-têtes manquants ajoutés. */
export async function lireClasseur(id: string): Promise<Classeur> {
  let props = await proprietes(id);
  const manquants = NOMS_TABLES.filter(t => !props.some(p => p.title === t));
  if (manquants.length) {
    await gjson(`${API}/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({
      requests: manquants.map(t => ({ addSheet: { properties: { title: t, gridProperties: { frozenRowCount: 1 } } } })),
    }) });
    props = await proprietes(id);
  }
  const ranges = NOMS_TABLES.map(t => `ranges=${encodeURIComponent(`'${t}'`)}`).join('&');
  const r = await gjson<{ valueRanges: { values?: string[][] }[] }>(
    `${API}/${id}/values:batchGet?${ranges}&valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`);
  const res: Classeur = {};
  const ajoutsEntetes: { range: string; values: string[][] }[] = [];
  NOMS_TABLES.forEach((t, i) => {
    const p = props.find(x => x.title === t)!;
    const valeurs = (r.valueRanges[i]?.values ?? []).map(l => l.map(v => String(v ?? '')));
    const tete = (valeurs[0] ?? []).map(h => h.trim());
    const aAjouter = entetes(t).filter(h => !tete.includes(h));
    if (aAjouter.length) {
      ajoutsEntetes.push({ range: `'${t}'!${colonne(tete.length)}1`, values: [aAjouter] });
      tete.push(...aAjouter);
    }
    res[t] = { sheetId: p.sheetId, nbLignesGrille: p.gridProperties.rowCount, nbColonnesGrille: p.gridProperties.columnCount, entetes: tete, valeurs };
  });
  if (ajoutsEntetes.length) await ecrireValeurs(id, ajoutsEntetes, res);
  return res;
}

export interface Ecriture { table: NomTable; numero: number; valeurs: string[] } // numero : ligne du Sheet (1 = en-têtes)

export async function ecrireLignes(id: string, classeur: Classeur, ecritures: Ecriture[]): Promise<void> {
  if (!ecritures.length) return;
  await ecrireValeurs(id, ecritures.map(e => ({ range: `'${e.table}'!A${e.numero}`, values: [e.valeurs] })), classeur);
}

/** Écrit des plages, en agrandissant d'abord la grille si nécessaire (sinon l'API refuse). */
async function ecrireValeurs(id: string, data: { range: string; values: string[][] }[], classeur: Classeur): Promise<void> {
  const agrandir: unknown[] = [];
  for (const t of NOMS_TABLES) {
    const o = classeur[t];
    if (!o) continue;
    let maxLigne = 0, maxCol = 0;
    for (const d of data) {
      const m = /^'(.+)'!([A-Z]+)(\d+)$/.exec(d.range);
      if (!m || m[1] !== t) continue;
      maxLigne = Math.max(maxLigne, Number(m[3]) + d.values.length - 1);
      maxCol = Math.max(maxCol, indiceColonne(m[2]) + Math.max(...d.values.map(v => v.length)));
    }
    if (maxLigne > o.nbLignesGrille) {
      agrandir.push({ appendDimension: { sheetId: o.sheetId, dimension: 'ROWS', length: maxLigne - o.nbLignesGrille + 200 } });
      o.nbLignesGrille = maxLigne + 200;
    }
    if (maxCol > o.nbColonnesGrille) {
      agrandir.push({ appendDimension: { sheetId: o.sheetId, dimension: 'COLUMNS', length: maxCol - o.nbColonnesGrille } });
      o.nbColonnesGrille = maxCol;
    }
  }
  if (agrandir.length) await gjson(`${API}/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: agrandir }) });
  await gjson(`${API}/${id}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) });
}

/** 0 → A, 25 → Z, 26 → AA */
export function colonne(i: number): string {
  let s = '';
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}
function indiceColonne(c: string): number {
  return [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}
