import { describe, it, expect } from 'vitest';
import { vide, appliquer } from './aide';
import { type Ligne } from '../src/modele/schema';
import { creerCommandes, changerStatutCommande } from '../src/store/operations';
import { partDouane, partReduction, douaneNonAttribuee, totalCommande, budgetCostume, releveBudget, lireReduction } from '../src/logique/budget';

const l = (id: string, champs: Record<string, string>): Ligne => ({ id, maj: '', supprime: '', ...champs });

/** Trois articles chez un même fournisseur : 10 €, 30 € (Mary Poppins) et 20 € (Ariel). */
function monde() {
  const d = vide();
  d.Costumes.MP = l('MP', { nom: 'Mary Poppins', statut: 'en cours', ordre: '1' });
  d.Costumes.AR = l('AR', { nom: 'Ariel', statut: 'en cours', ordre: '2' });
  d.Fournisseurs.F = l('F', { nom: 'Boutique étrangère' });
  const art = (id: string, costume_id: string, prix: string) => l(id, { costume_id, libelle: id, quantite: '1', prix_unitaire: prix, fournisseur_id: 'F', statut: 'à acheter' });
  d.Fournitures.a = art('a', 'MP', '10');
  d.Fournitures.b = art('b', 'MP', '30');
  d.Fournitures.c = art('c', 'AR', '20');
  return d;
}
const commander = (frais: Parameters<typeof creerCommandes>[3]) => {
  let d = monde();
  const ch = creerCommandes(d, ['a', 'b', 'c'], '2026-10-19', frais);
  d = appliquer(d, ch);
  return { d, cmd: ch.find(x => x.table === 'Commandes')!.id };
};

describe('frais de douane et bon de réduction', () => {
  it('la date de commande : aujourd’hui par défaut, ou celle choisie ; la réception ne la change pas', () => {
    expect(commander({ F: '6' }).d.Commandes).toSatisfy((cs: Record<string, Ligne>) => Object.values(cs)[0].date === '2026-10-19');
    let { d, cmd } = commander({ F: { date: '2026-10-12', port: '6' } });
    expect(d.Commandes[cmd].date).toBe('2026-10-12');
    d = appliquer(d, changerStatutCommande(d, cmd, 'reçue', '2026-10-25'));
    expect([d.Commandes[cmd].statut, d.Commandes[cmd].date, d.Fournitures.a.statut]).toEqual(['reçue', '2026-10-12', 'reçu']);
  });

  it('les frais de port seuls restent comme avant (ancienne écriture)', () => {
    const { d, cmd } = commander({ F: '6' });
    expect(totalCommande(d, cmd)).toMatchObject({ articles: 60, port: 6, douane: 0, reduction: 0, total: 66 });
  });

  it('la douane se partage à parts égales, puis selon ce qu’on attribue', () => {
    const { d, cmd } = commander({ F: { douane: '6' } });
    expect(['a', 'b', 'c'].map(id => partDouane(d, d.Fournitures[id]))).toEqual([2, 2, 2]);
    // 5 € de frais : 2 € à l’article a, 3 € au b, rien au c
    d.Commandes[cmd].frais_douane = '5';
    d.Commandes[cmd].douane_repartition = JSON.stringify({ a: '2', b: '3' });
    expect(['a', 'b', 'c'].map(id => partDouane(d, d.Fournitures[id]))).toEqual([2, 3, 0]);
    expect(douaneNonAttribuee(d, cmd)).toBe(0);
    // seulement l’article a attribué : le reste (3 €) se partage entre b et c
    d.Commandes[cmd].douane_repartition = JSON.stringify({ a: '2' });
    expect(['a', 'b', 'c'].map(id => partDouane(d, d.Fournitures[id]))).toEqual([2, 1.5, 1.5]);
  });

  it('la taxe / douane peut être attribuée dès la création', () => {
    const { d, cmd } = commander({ F: { douane: '5', douane_repartition: { a: '2', b: '3', zz: '9' } } });
    expect(JSON.parse(d.Commandes[cmd].douane_repartition)).toEqual({ a: '2', b: '3' }); // un id hors commande est ignoré
    expect(['a', 'b', 'c'].map(id => partDouane(d, d.Fournitures[id]))).toEqual([2, 3, 0]);
  });

  it('un bon en euros se répartit au prorata des prix ; en pourcentage, sur chaque prix', () => {
    const { d, cmd } = commander({ F: { reduction: '6' } });
    expect(['a', 'b', 'c'].map(id => partReduction(d, d.Fournitures[id]))).toEqual([1, 3, 2]);
    expect(totalCommande(d, cmd).total).toBe(54);
    d.Commandes[cmd].reduction = '10 %';
    expect(['a', 'b', 'c'].map(id => partReduction(d, d.Fournitures[id]))).toEqual([1, 3, 2]);
    expect(lireReduction('10 %')).toEqual({ pct: 10 });
    expect(lireReduction('')).toBeNull();
  });

  it('un bon réservé à certains articles (options avancées)', () => {
    const { d, cmd } = commander({ F: { reduction: '8', reduction_articles: ['a', 'b'] } });
    expect(d.Commandes[cmd].reduction_articles).toBe('a,b');
    expect(['a', 'b', 'c'].map(id => partReduction(d, d.Fournitures[id]))).toEqual([2, 6, 0]);
    // tous cochés : rien n’est enregistré, le bon vaut pour tous
    expect(commander({ F: { reduction: '8', reduction_articles: ['a', 'b', 'c'] } }).d.Commandes).toSatisfy(
      (cs: Record<string, Ligne>) => Object.values(cs).every(c => c.reduction_articles === ''));
  });

  it('le budget de chaque costume et son relevé comptent la douane et retirent le bon', () => {
    const { d } = commander({ F: { port: '3', douane: '6', reduction: '6' } });
    // Mary Poppins : articles 40, port 2 (1 + 1), douane 4 (2 + 2), bon −4 (1 + 3)
    expect(budgetCostume(d, 'MP').commande).toBe(42);
    expect(budgetCostume(d, 'AR').commande).toBe(21);
    const g = releveBudget(d, 'MP', ['commandé'])[0];
    expect([g.articles, g.port, g.douane, g.reduction, g.total]).toEqual([40, 2, 4, 4, 42]);
  });
});
