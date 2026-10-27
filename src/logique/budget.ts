// Budget et liste d'achats. Les prix sont facultatifs partout.
import { type Donnees, type Ligne, num, vivant, liste } from '../modele/schema';
import { costumes, fournituresDe, tous, ligne, piecesDeFourniture } from './acces';

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
  total: number;   // toutes les fournitures (hors « déjà là »)
  prevu: number;   // encore à acheter : ce qui reste à débourser
  commande: number; // commandées, pas encore reçues
  recu: number;
  erreurs: number;  // payé pour un article manquant ou pas le bon, non remboursé (compte dans l'actuel dépensé)
  cible: number | null;
  sansPrix: number; // lignes sans prix (le total est donc incomplet)
}

export function budgetCostume(d: Donnees, costumeId: string): Budget {
  const b: Budget = { total: 0, prevu: 0, commande: 0, recu: 0, erreurs: 0, cible: null, sansPrix: 0 };
  const c = ligne(d, 'Costumes', costumeId);
  if (c && (c.budget_prevu ?? '').trim()) b.cible = num(c.budget_prevu);
  for (const f of fournituresDe(d, costumeId)) {
    if (f.statut === 'déjà là') continue;
    const prix = montant(f);
    if (prix === null) b.sansPrix++;
    // sa part des frais de sa commande (port, douane, moins le bon de réduction) compte avec elle
    const m = (prix ?? 0) + fraisDeLigne(d, f);
    if (!m) continue;
    b.total += m;
    if ((f.statut || 'à acheter') === 'à acheter') b.prevu += m;
    if (f.statut === 'commandé') b.commande += m;
    if (f.statut === 'reçu') b.recu += m;
  }
  for (const e of erreursDuCostume(d, costumeId)) if (!e.rembourse) { b.erreurs += e.montant; b.total += e.montant; }
  return b;
}

// ---------- Erreurs de commande ----------

/**
 * Un problème signalé à la réception. L'article attendu, lui, repart dans la liste de courses (ou reste
 * commandé s'il doit arriver plus tard) ; ce qui a été payé pour rien reste ici, dans le budget du costume,
 * sauf s'il est remboursé.
 */
export interface ErreurCommande {
  id: string; fourniture_id: string; libelle: string; costume_id: string;
  type: 'manquant' | 'pas le bon article' | 'quantité'; detail: string;
  montant: number; rembourse: boolean; date: string;
}

export function lireErreurs(cmd: Ligne | undefined): ErreurCommande[] {
  try { const v = JSON.parse(cmd?.erreurs || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Les erreurs de commande d'un costume, avec leur commande. */
export function erreursDuCostume(d: Donnees, costumeId: string): (ErreurCommande & { commande: Ligne })[] {
  return tous(d, 'Commandes').flatMap(c => lireErreurs(c).filter(e => e.costume_id === costumeId).map(e => ({ ...e, commande: c })));
}

// ---------- Relevé : le détail d'un chiffre du budget ----------

export interface LigneReleve { fourniture: Ligne; montant: number | null; port: number; douane: number; reduction: number }
export interface GroupeReleve { commande: Ligne | null; fournisseur: Ligne | null; date: string; lignes: LigneReleve[]; articles: number; port: number; douane: number; reduction: number; total: number }

/**
 * Le détail d'un chiffre du budget, comme un relevé de compte : les fournitures du costume aux statuts
 * donnés, regroupées par commande (date, fournisseur, part des frais de port), dans l'ordre des dates ;
 * celles qui ne sont dans aucune commande viennent à la fin. Mêmes règles que budgetCostume : les
 * « déjà là » ne comptent pas. La somme des totaux est le chiffre de la tuile.
 */
export function releveBudget(d: Donnees, costumeId: string, statuts: string[]): GroupeReleve[] {
  const groupes = new Map<string, GroupeReleve>();
  for (const f of fournituresDe(d, costumeId)) {
    const statut = f.statut || 'à acheter';
    if (statut === 'déjà là' || !statuts.includes(statut)) continue;
    const cmd = ligne(d, 'Commandes', f.commande_id) ?? null;
    const cle = cmd?.id ?? '';
    if (!groupes.has(cle)) {
      const fournisseur = ligne(d, 'Fournisseurs', cmd ? cmd.fournisseur_id : '') ?? null;
      groupes.set(cle, { commande: cmd, fournisseur, date: cmd?.date ?? '', lignes: [], articles: 0, port: 0, douane: 0, reduction: 0, total: 0 });
    }
    const g = groupes.get(cle)!;
    const m = montant(f);
    const port = partFraisPort(d, f), douane = partDouane(d, f), reduction = partReduction(d, f);
    g.lignes.push({ fourniture: f, montant: m, port, douane, reduction });
    g.articles += m ?? 0;
    g.port += port;
    g.douane += douane;
    g.reduction += reduction;
    g.total += (m ?? 0) + port + douane - reduction;
  }
  for (const g of groupes.values()) g.lignes.sort((a, b) => cleNom(a.fourniture.libelle).localeCompare(cleNom(b.fourniture.libelle), 'fr'));
  return [...groupes.values()].sort((a, b) => (a.commande ? 0 : 1) - (b.commande ? 0 : 1) || a.date.localeCompare(b.date));
}

/**
 * Les frais de port se saisissent sur la commande et se partagent à parts égales entre ses fournitures
 * (une commande de 4 fournitures à 6 € de port : 1,50 € chacune, quel que soit leur costume).
 */
export function partFraisPort(d: Donnees, f: Ligne): number {
  const cmd = ligne(d, 'Commandes', f.commande_id);
  if (!cmd) return 0;
  const port = num(cmd.frais_port);
  if (!port) return 0;
  return port / Math.max(1, lignesCommande(d, cmd.id).length);
}

/**
 * Les frais d'importation / de douane d'une commande : ce qu'on a attribué à un article lui revient ;
 * le reste se partage à parts égales entre les articles sans attribution (tous, si rien n'est attribué).
 */
export function partDouane(d: Donnees, f: Ligne): number {
  const cmd = ligne(d, 'Commandes', f.commande_id);
  if (!cmd || !num(cmd.frais_douane)) return 0;
  const ids = lignesCommande(d, cmd.id).map(l => l.id);
  return repartirDouane(num(cmd.frais_douane), ids, lireJson(cmd.douane_repartition))[f.id] ?? 0;
}

/** La taxe / douane article par article : ce qui est attribué, et le reste à parts égales entre les autres. */
export function repartirDouane(total: number, ids: string[], rep: Record<string, string>): Record<string, number> {
  const attribue = (id: string) => (rep[id] ?? '').trim() !== '';
  const libres = ids.filter(id => !attribue(id));
  const deja = ids.filter(attribue).reduce((s, id) => s + num(rep[id]), 0);
  const part = libres.length ? Math.max(0, total - deja) / libres.length : 0;
  return Object.fromEntries(ids.map(id => [id, attribue(id) ? num(rep[id]) : part]));
}

/** Ce qui reste des frais de douane à attribuer, une fois les montants saisis article par article. */
export function douaneNonAttribuee(d: Donnees, commandeId: string): number {
  const cmd = ligne(d, 'Commandes', commandeId);
  if (!cmd) return 0;
  const rep = lireJson(cmd.douane_repartition);
  const ids = new Set(lignesCommande(d, commandeId).map(l => l.id));
  const deja = Object.entries(rep).filter(([id, v]) => ids.has(id) && (v ?? '').trim()).reduce((s, [, v]) => s + num(v), 0);
  return Math.round((num(cmd.frais_douane) - deja) * 100) / 100;
}

/** Un bon de réduction : « 5 » (€) ou « 10 % ». */
export function lireReduction(v: string | undefined): { montant: number } | { pct: number } | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  if (s.endsWith('%')) { const p = num(s.slice(0, -1)); return p ? { pct: p } : null; }
  const m = num(s);
  return m ? { montant: m } : null;
}

/** Les articles concernés par le bon : ceux qu'on a choisis, ou tous. */
export function articlesReduction(lignes: Ligne[], choisis: string[]): Ligne[] {
  const retenus = lignes.filter(l => choisis.includes(l.id));
  return retenus.length ? retenus : lignes;
}

/**
 * Le bon article par article : en pourcentage, sur le prix de chacun ; en euros, au prorata du prix des
 * articles concernés (à parts égales s'ils n'ont pas de prix). Un article hors du bon : 0.
 */
export function repartirReduction(reduction: string | undefined, lignes: Ligne[], choisis: string[]): Record<string, number> {
  const r = lireReduction(reduction);
  const res: Record<string, number> = Object.fromEntries(lignes.map(l => [l.id, 0]));
  if (!r) return res;
  const concernes = articlesReduction(lignes, choisis);
  const base = concernes.reduce((s, l) => s + (montant(l) ?? 0), 0);
  for (const l of concernes) {
    res[l.id] = 'pct' in r ? ((montant(l) ?? 0) * r.pct) / 100
      : base > 0 ? (r.montant * (montant(l) ?? 0)) / base : r.montant / concernes.length;
  }
  return res;
}

export function partReduction(d: Donnees, f: Ligne): number {
  const cmd = ligne(d, 'Commandes', f.commande_id);
  if (!cmd || !lireReduction(cmd.reduction)) return 0;
  return repartirReduction(cmd.reduction, lignesCommande(d, cmd.id), liste(cmd.reduction_articles))[f.id] ?? 0;
}

/** Tout ce que la commande ajoute (ou retire) au prix d'un article : port + douane − réduction. */
export function fraisDeLigne(d: Donnees, f: Ligne): number {
  return partFraisPort(d, f) + partDouane(d, f) - partReduction(d, f);
}

export function lireJson(v: string | undefined): Record<string, string> {
  try { const x = JSON.parse(v || '{}'); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; }
}

export function lignesCommande(d: Donnees, commandeId: string): Ligne[] {
  return tous(d, 'Fournitures').filter(f => f.commande_id === commandeId);
}

export function totalCommande(d: Donnees, commandeId: string): { articles: number; port: number; douane: number; reduction: number; erreurs: number; total: number; sansPrix: number } {
  let articles = 0, sansPrix = 0, reduction = 0;
  for (const f of lignesCommande(d, commandeId)) {
    const m = montant(f);
    if (m === null) sansPrix++; else articles += m;
    reduction += partReduction(d, f);
  }
  const port = num(d.Commandes[commandeId]?.frais_port);
  const douane = num(d.Commandes[commandeId]?.frais_douane);
  reduction = Math.round(reduction * 100) / 100;
  // Payé pour un article manquant ou pas le bon, non remboursé : la commande l'a bien coûté.
  const erreurs = lireErreurs(d.Commandes[commandeId]).reduce((t, e) => t + (e.rembourse ? 0 : e.montant), 0);
  return { articles, port, douane, reduction, erreurs, total: articles + port + douane - reduction + erreurs, sansPrix };
}

// ---------- Fournitures hors costume : stock et divers ----------
// Une fourniture sans costume est achetée pour le stock (à réutiliser plus tard) ou « divers » (outils,
// consommables…). Elle n'a pas de pièce et ne compte dans aucun budget de costume. Colonne
// `destination` ; une ancienne fourniture sans costume se lit « divers ».

export const HORS_COSTUME = { stock: 'Stock', divers: 'Divers' } as const;
export type HorsCostume = keyof typeof HORS_COSTUME;

export const horsCostume = (f: Ligne): HorsCostume | '' => (f.costume_id ? '' : f.destination === 'stock' ? 'stock' : 'divers');

/** La clé de sa destination, telle que les filtres la manipulent : l'id du costume, « __stock » ou « __divers ». */
export const cleDestination = (f: Ligne): string => f.costume_id || `__${horsCostume(f)}`;

/** Le nom de sa destination : le costume, « Stock » ou « Divers ». */
export function nomDestination(d: Donnees, f: Ligne): string {
  const h = horsCostume(f);
  return h ? HORS_COSTUME[h] : ligne(d, 'Costumes', f.costume_id)?.nom ?? '';
}

export const SANS_FOURNISSEUR = '__aucun';
export type GroupementAchats = 'fournisseur' | 'costume';
export interface GroupeAchats { cle: string; fournisseur: Ligne | null; costume: Ligne | null; hors?: HorsCostume; lignes: Ligne[]; total: number }

/**
 * La liste de courses commune, groupée par fournisseur (« Sans fournisseur » en dernier) ou par costume
 * (dans l'ordre des costumes, « Sans costume » en dernier).
 */
export function regrouperAchats(d: Donnees, filtre: { costumeId?: string; fournisseurId?: string; statuts?: string[] } = {}, par: GroupementAchats = 'fournisseur'): GroupeAchats[] {
  const groupes = new Map<string, GroupeAchats>();
  for (const f of tous(d, 'Fournitures')) {
    if (filtre.costumeId && cleDestination(f) !== filtre.costumeId) continue;
    if (filtre.statuts && !filtre.statuts.includes(f.statut || 'à acheter')) continue;
    const c = ligne(d, 'Costumes', f.costume_id);
    if (c?.statut === 'archivé' || (f.costume_id && !c)) continue; // costume archivé ou supprimé
    const four = vivant(d.Fournisseurs[f.fournisseur_id]) ? d.Fournisseurs[f.fournisseur_id] : null;
    // fournisseurId : un id, ou SANS_FOURNISSEUR pour les lignes sans fournisseur
    if (filtre.fournisseurId && (four?.id ?? SANS_FOURNISSEUR) !== filtre.fournisseurId) continue;
    const cle = (par === 'costume' ? cleDestination(f) : four?.id) ?? '';
    if (!groupes.has(cle)) groupes.set(cle, {
      cle, fournisseur: par === 'fournisseur' ? four : null, costume: par === 'costume' ? c ?? null : null,
      hors: par === 'costume' ? horsCostume(f) || undefined : undefined, lignes: [], total: 0,
    });
    const g = groupes.get(cle)!;
    g.lignes.push(f);
    g.total += montant(f) ?? 0;
  }
  const liste = [...groupes.values()];
  if (par === 'costume') {
    // Les costumes dans leur ordre, puis Stock, puis Divers.
    const rang = new Map(costumes(d).map((c, i) => [c.id, i]));
    const r = (g: GroupeAchats) => (g.costume ? rang.get(g.costume.id) ?? 0 : g.hors === 'stock' ? 1e6 : 1e6 + 1);
    return liste.sort((a, b) => r(a) - r(b));
  }
  return liste.sort((a, b) =>
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

// ---------- Une fourniture répartie entre plusieurs pièces ----------
// Une fourniture est ce qu'on achète (un lot de 10 m de ruban, 2 lots de 20 boutons) ; elle peut se
// répartir entre plusieurs pièces de son costume, avec la quantité prise par chacune (colonne
// `repartition` : { idPièce: « 3 » }). Les pièces font foi : `piece_id` en donne la liste, une quantité
// pour une pièce qui n'y est plus est ignorée. Entre costumes, rien ne se partage ici : c'est la
// commande et le regroupement par nom des Achats qui réunissent les besoins.

/** Le contenu acheté : 10 × m → 10 m ; 2 × « lot de 20 » → 40 ; 2 × « lot de 20 boutons » → 40 boutons. */
export function contenu(f: Ligne): Quantite {
  const m = mesure(f);
  if (m.famille) return m;
  const lot = /(\d+(?:[.,]\d+)?)\s*([a-zA-Zéèêàâîôû]*)/.exec(f.unite ?? '');
  if (lot) return { unite: lot[2], total: quantiteNombre(f.quantite) * num(lot[1]) };
  return m;
}

/** L'unité dans laquelle on saisit la quantité d'une pièce : celle de l'achat (m, g…), ou ce que contient le lot. */
export function uniteRepartition(f: Ligne): string {
  const c = contenu(f);
  if (c.famille) {
    const u = (f.unite ?? '').trim();
    return uniteConnue(u) ? u : c.famille === 'longueur' ? 'm' : c.famille === 'masse' ? 'g' : 'ml';
  }
  return c.unite;
}

export function lireRepartition(f: Ligne): Record<string, string> {
  try {
    const v = JSON.parse(f.repartition || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

/** Une quantité saisie pour une pièce, dans la base du contenu (« 50 cm » → 0,5 si l'achat est en mètres). */
export function quantitePiece(f: Ligne, texte: string | undefined): number | null {
  const s = (texte ?? '').trim();
  if (!s) return null;
  const c = contenu(f);
  const n = quantiteNombre(s);
  if (/^\d+\s*m\s*\d/.test(s.toLowerCase())) return n; // « 1m20 » : déjà en mètres
  const u = /^\s*\d+(?:[.,]\d+)?\s*([a-zA-Zéèêàâîôû]+)/.exec(s)?.[1];
  const connue = u ? uniteConnue(u) : undefined;
  if (c.famille && connue && connue[0] === c.famille) return n * connue[1];
  if (c.famille) return n * (uniteConnue(uniteRepartition(f))?.[1] ?? 1);
  return n;
}

export interface Bilan { contenu: Quantite; utilise: number; complet: boolean; reste: number | null }

/** Ce qui est pris par les pièces, et ce qui reste quand toutes les quantités sont connues. */
export function bilan(d: Donnees, f: Ligne): Bilan {
  const c = contenu(f);
  const rep = lireRepartition(f);
  let utilise = 0, complet = true;
  for (const p of piecesDeFourniture(d, f)) {
    const q = quantitePiece(f, rep[p.id]);
    if (q === null) complet = false; else utilise += q;
  }
  return { contenu: c, utilise, complet, reste: complet ? Math.round((c.total - utilise) * 1e6) / 1e6 : null };
}

/** Ce qu'on peut encore prendre pour une nouvelle pièce : tout le contenu, ou ce qui reste ('' si inconnu ou épuisé). */
export function disponibleTexte(d: Donnees, f: Ligne): string {
  const b = bilan(d, f);
  const libre = piecesDeFourniture(d, f).length ? b.reste : b.contenu.total;
  if (libre === null || libre <= 1e-9) return '';
  const base = b.contenu.famille ? uniteConnue(uniteRepartition(f))?.[1] ?? 1 : 1;
  const n = Math.round((libre / base) * 1000) / 1000;
  return String(n).replace('.', ',');
}

/** « reste 4 m », « il manque 2 m », ou rien si une quantité manque. */
export function texteReste(d: Donnees, f: Ligne): string {
  const b = bilan(d, f);
  if (b.reste === null || !piecesDeFourniture(d, f).length) return '';
  const q = (n: number) => texteQuantites([{ ...b.contenu, total: n }]);
  return b.reste > 0 ? `reste ${q(b.reste)}` : b.reste < 0 ? `il manque ${q(-b.reste)}` : 'tout est utilisé';
}

/**
 * Peut-on encore la prendre pour cette pièce ? Oui si elle n'est rattachée à rien, si elle l'est déjà à
 * cette pièce, ou s'il en reste. Une fourniture prise en entier (une pièce sans quantité) n'est plus proposée.
 */
export function disponiblePour(d: Donnees, f: Ligne, pieceId: string): boolean {
  if (!piecesDeFourniture(d, f).length || liste(f.piece_id).includes(pieceId)) return true;
  const reste = bilan(d, f).reste;
  return reste !== null && reste > 1e-9;
}
