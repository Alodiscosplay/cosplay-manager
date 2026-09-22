// Budget et liste d'achats. Les prix sont facultatifs partout.
import { type Donnees, type Ligne, num, vivant } from '../modele/schema';
import { fournituresDe, tous, ligne } from './acces';

/** Lit une quantité telle qu'on l'écrit vraiment : « 1,5 », « 1m20 » (= 1,20), « 4 paires ». Vide = 1. */
export function quantiteNombre(q: string | undefined): number {
  const s = (q ?? '').trim().toLowerCase();
  if (!s) return 1;
  const metres = /^(\d+)\s*m\s*(\d{1,2})\b/.exec(s); // 1m20
  if (metres) return Number(metres[1]) + Number(metres[2].padEnd(2, '0')) / 100;
  const m = /^(\d+(?:[.,]\d+)?)/.exec(s);
  return m ? num(m[1], 1) : 1;
}

/** Montant d'une ligne, ou null si pas de prix. */
export function montant(f: Ligne): number | null {
  if (!(f.prix_unitaire ?? '').trim()) return null;
  return Math.round(quantiteNombre(f.quantite) * num(f.prix_unitaire) * 100) / 100;
}

export interface Budget {
  prevu: number;   // toutes les fournitures (hors « déjà là »)
  engage: number;  // commandées ou reçues
  recu: number;
  cible: number | null;
  sansPrix: number; // lignes sans prix (le total est donc incomplet)
}

export function budgetCostume(d: Donnees, costumeId: string): Budget {
  const b: Budget = { prevu: 0, engage: 0, recu: 0, cible: null, sansPrix: 0 };
  const c = ligne(d, 'Costumes', costumeId);
  if (c && (c.budget_prevu ?? '').trim()) b.cible = num(c.budget_prevu);
  for (const f of fournituresDe(d, costumeId)) {
    if (f.statut === 'déjà là') continue;
    const m = montant(f);
    if (m === null) { b.sansPrix++; continue; }
    b.prevu += m;
    if (f.statut === 'commandé' || f.statut === 'reçu') b.engage += m;
    if (f.statut === 'reçu') b.recu += m;
  }
  return b;
}

export function lignesCommande(d: Donnees, commandeId: string): Ligne[] {
  return tous(d, 'Fournitures').filter(f => f.commande_id === commandeId);
}

export function totalCommande(d: Donnees, commandeId: string): { articles: number; port: number; total: number; sansPrix: number } {
  let articles = 0, sansPrix = 0;
  for (const f of lignesCommande(d, commandeId)) {
    const m = montant(f);
    if (m === null) sansPrix++; else articles += m;
  }
  const port = num(d.Commandes[commandeId]?.frais_port);
  return { articles, port, total: articles + port, sansPrix };
}

export interface GroupeAchats { fournisseur: Ligne | null; lignes: Ligne[]; total: number }

/** La liste de courses commune, groupée par fournisseur (« Sans fournisseur » en dernier). */
export function regrouperAchats(d: Donnees, filtre: { costumeId?: string; statuts?: string[] } = {}): GroupeAchats[] {
  const groupes = new Map<string, GroupeAchats>();
  for (const f of tous(d, 'Fournitures')) {
    if (filtre.costumeId && f.costume_id !== filtre.costumeId) continue;
    if (filtre.statuts && !filtre.statuts.includes(f.statut || 'à acheter')) continue;
    const c = ligne(d, 'Costumes', f.costume_id);
    if (c?.statut === 'archivé' || (f.costume_id && !c)) continue; // costume archivé ou supprimé
    const four = vivant(d.Fournisseurs[f.fournisseur_id]) ? d.Fournisseurs[f.fournisseur_id] : null;
    const cle = four?.id ?? '';
    if (!groupes.has(cle)) groupes.set(cle, { fournisseur: four, lignes: [], total: 0 });
    const g = groupes.get(cle)!;
    g.lignes.push(f);
    g.total += montant(f) ?? 0;
  }
  return [...groupes.values()].sort((a, b) =>
    a.fournisseur && b.fournisseur ? a.fournisseur.nom.localeCompare(b.fournisseur.nom) : a.fournisseur ? -1 : 1);
}

export function euros(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

// ---------- Regroupement par nom ----------
// Chaque fourniture est saisie pour UNE pièce d'UN costume ; les lignes qui portent le même nom
// (majuscules et espaces en trop ignorés) sont regroupées pour voir le besoin total.

export function cleNom(libelle: string | undefined): string {
  return (libelle ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');
}

/**
 * Quantité totale d'un groupe. Les unités d'une même famille s'additionnent (longueur en mètres,
 * poids en grammes, volume en millilitres) ; une unité inconnue (« coupon », « paires ») reste à part.
 */
export interface Quantite { unite: string; total: number; famille?: Famille }
export type Famille = 'longueur' | 'masse' | 'volume';

// unité → [famille, facteur vers l'unité de base (m, g, ml)]
const UNITES: Record<string, [Famille, number]> = {
  mm: ['longueur', 0.001], millimetre: ['longueur', 0.001],
  cm: ['longueur', 0.01], centimetre: ['longueur', 0.01],
  m: ['longueur', 1], mt: ['longueur', 1], mtr: ['longueur', 1], metre: ['longueur', 1],
  km: ['longueur', 1000],
  mg: ['masse', 0.001], g: ['masse', 1], gr: ['masse', 1], gramme: ['masse', 1], kg: ['masse', 1000], kilo: ['masse', 1000], kilogramme: ['masse', 1000],
  ml: ['volume', 1], millilitre: ['volume', 1], cl: ['volume', 10], centilitre: ['volume', 10], dl: ['volume', 100], l: ['volume', 1000], litre: ['volume', 1000],
};

/** Reconnaît une unité écrite librement : « m », « mètres », « Cm », « kilos »… */
export function uniteConnue(u: string): [Famille, number] | undefined {
  const s = u.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.$/, '').trim();
  return UNITES[s] ?? UNITES[s.replace(/s$/, '')];
}

const RE_MESURE = /(\d+(?:[.,]\d+)?)\s*([a-zA-Zéèêàâîôû]+)\.?/g;

/**
 * Mesure d'une ligne dans sa famille. Exemples (quantité × unité) :
 * 3 × m → 3 m ; 10 × cm → 0,1 m ; 2 × « coupon de 3 m » → 6 m ; « 1m20 » (quantité seule) → 1,2 m.
 */
export function mesure(f: Ligne): Quantite {
  const q = quantiteNombre(f.quantite);
  let u = (f.unite ?? '').trim();
  if (!u) {
    // unité tapée dans la quantité : « 3 m », « 10cm », « 1m20 »
    const m = /^\s*\d+(?:[.,]\d+)?\s*([a-zA-Zéèêàâîôû]+)/.exec(f.quantite ?? '');
    if (m) u = m[1];
  }
  const directe = uniteConnue(u);
  if (directe) return { unite: u, total: q * directe[1], famille: directe[0] };
  // une unité qui contient une mesure : « coupon de 3 m », « bobine 500 m », « sachet de 250 g »
  for (const m of u.matchAll(RE_MESURE)) {
    const connue = uniteConnue(m[2]);
    if (connue) return { unite: u, total: q * num(m[1]) * connue[1], famille: connue[0] };
  }
  return { unite: u, total: q };
}

function ajouter(quantites: Quantite[], m: Quantite): void {
  const cle = (x: Quantite) => x.famille ?? `autre:${x.unite.toLocaleLowerCase('fr')}`;
  const q = quantites.find(x => cle(x) === cle(m));
  if (q) q.total += m.total; else quantites.push({ ...m });
}

export interface GroupeNom { cle: string; libelle: string; lignes: Ligne[]; quantites: Quantite[]; montant: number; sansPrix: number }

/** Groupes triés par ordre alphabétique : deux noms presque identiques se retrouvent côte à côte. */
export function regrouperParNom(lignes: Ligne[]): GroupeNom[] {
  const groupes = new Map<string, GroupeNom>();
  for (const f of lignes) {
    const cle = cleNom(f.libelle);
    if (!groupes.has(cle)) groupes.set(cle, { cle, libelle: (f.libelle ?? '').trim(), lignes: [], quantites: [], montant: 0, sansPrix: 0 });
    const g = groupes.get(cle)!;
    g.lignes.push(f);
    ajouter(g.quantites, mesure(f));
    const m = montant(f);
    if (m === null) g.sansPrix++; else g.montant += m;
  }
  return [...groupes.values()].sort((a, b) => a.cle.localeCompare(b.cle, 'fr'));
}

const nombre = (n: number, decimales: number) => {
  const arrondi = Math.round(n * 10 ** decimales) / 10 ** decimales;
  return (Number.isInteger(arrondi) ? String(arrondi) : arrondi.toFixed(decimales)).replace('.', ',');
};

/** « 3,10 m », « 3,10 m + 250 g + 2 paires », « 3 ». */
export function texteQuantites(q: Quantite[]): string {
  return q.map(x => {
    if (x.famille === 'longueur') return x.total >= 1 ? `${nombre(x.total, 2)} m` : `${nombre(x.total * 100, 1)} cm`;
    if (x.famille === 'masse') return x.total >= 1000 ? `${nombre(x.total / 1000, 2)} kg` : `${nombre(x.total, 0)} g`;
    if (x.famille === 'volume') return x.total >= 1000 ? `${nombre(x.total / 1000, 2)} l` : `${nombre(x.total, 0)} ml`;
    return nombre(x.total, 2) + (x.unite ? ` ${x.unite}` : '');
  }).join(' + ');
}
