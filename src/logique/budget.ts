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

export interface Quantite { unite: string; total: number }
export interface GroupeNom { cle: string; libelle: string; lignes: Ligne[]; quantites: Quantite[]; montant: number; sansPrix: number }

/** Groupes triés par ordre alphabétique : deux noms presque identiques se retrouvent côte à côte. */
export function regrouperParNom(lignes: Ligne[]): GroupeNom[] {
  const groupes = new Map<string, GroupeNom>();
  for (const f of lignes) {
    const cle = cleNom(f.libelle);
    if (!groupes.has(cle)) groupes.set(cle, { cle, libelle: (f.libelle ?? '').trim(), lignes: [], quantites: [], montant: 0, sansPrix: 0 });
    const g = groupes.get(cle)!;
    g.lignes.push(f);
    const unite = (f.unite ?? '').trim();
    const q = g.quantites.find(x => x.unite.toLocaleLowerCase('fr') === unite.toLocaleLowerCase('fr'));
    if (q) q.total += quantiteNombre(f.quantite); else g.quantites.push({ unite, total: quantiteNombre(f.quantite) });
    const m = montant(f);
    if (m === null) g.sansPrix++; else g.montant += m;
  }
  return [...groupes.values()].sort((a, b) => a.cle.localeCompare(b.cle, 'fr'));
}

/** « 8 m », « 8 m + 2 sachets », « 3 ». */
export function texteQuantites(q: Quantite[]): string {
  return q.map(x => `${Math.round(x.total * 100) / 100}`.replace('.', ',') + (x.unite ? ` ${x.unite}` : '')).join(' + ');
}
