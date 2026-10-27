import { describe, it, expect } from 'vitest';
import { vide, appliquer } from './aide';
import { type Donnees, type Ligne } from '../src/modele/schema';
import { creerCommandes, changerStatutCommande, receptionPartielle, rembourserErreur } from '../src/store/operations';
import { budgetCostume, lireErreurs, erreursDuCostume } from '../src/logique/budget';

const l = (id: string, champs: Record<string, string>): Ligne => ({ id, maj: '', supprime: '', ...champs });

/** Une commande de trois articles pour Mary Poppins : satin (3 m à 10 €), boutons (20 à 0,5 €), dentelle (1 à 8 €). */
function commande(): { d: Donnees; cmd: string } {
  let d = vide();
  d.Costumes.MP = l('MP', { nom: 'Mary Poppins', statut: 'en cours', ordre: '1' });
  d.Fournisseurs.F = l('F', { nom: 'Mercerie' });
  d.Fournitures.s = l('s', { costume_id: 'MP', libelle: 'Satin', quantite: '3', unite: 'm', prix_unitaire: '10', fournisseur_id: 'F', statut: 'à acheter' });
  d.Fournitures.b = l('b', { costume_id: 'MP', libelle: 'Boutons', quantite: '20', prix_unitaire: '0.5', fournisseur_id: 'F', statut: 'à acheter' });
  d.Fournitures.t = l('t', { costume_id: 'MP', libelle: 'Dentelle', quantite: '1', prix_unitaire: '8', fournisseur_id: 'F', statut: 'à acheter' });
  const ch = creerCommandes(d, ['s', 'b', 't'], '2026-10-20');
  d = appliquer(d, ch);
  return { d, cmd: ch.find(x => x.table === 'Commandes')!.id };
}
const lignesDe = (d: Donnees, cmd: string) => Object.values(d.Fournitures).filter(f => f.commande_id === cmd);

describe('réception partielle et problèmes de commande', () => {
  it('tout reçu : comme « Confirmer la réception »', () => {
    let { d, cmd } = commande();
    d = appliquer(d, receptionPartielle(d, cmd, {}, '2026-10-27'));
    expect(d.Commandes[cmd].statut).toBe('reçue');
    expect(lignesDe(d, cmd).map(f => f.statut)).toEqual(['reçu', 'reçu', 'reçu']);
  });

  it('un article manquant qui arrivera plus tard reste commandé, la commande reste ouverte', () => {
    let { d, cmd } = commande();
    d = appliquer(d, receptionPartielle(d, cmd, { t: { etat: 'manquant', suite: 'plus-tard' } }, '2026-10-27'));
    expect(d.Commandes[cmd].statut).toBe('passée');
    expect([d.Fournitures.s.statut, d.Fournitures.t.statut]).toEqual(['reçu', 'commandé']);
    expect(lireErreurs(d.Commandes[cmd])).toEqual([]);
    // la suite arrive : « Confirmer la réception » termine
    d = appliquer(d, changerStatutCommande(d, cmd, 'reçue', '2026-11-02'));
    expect(d.Fournitures.t.statut).toBe('reçu');
  });

  it('pas le bon article : il repasse à acheter, l’argent reste au budget (catégorie erreurs) tant qu’il n’est pas remboursé', () => {
    let { d, cmd } = commande();
    d = appliquer(d, receptionPartielle(d, cmd, { t: { etat: 'pas-le-bon' } }, '2026-10-27'));
    expect(d.Fournitures.t).toMatchObject({ statut: 'à acheter', commande_id: '' });
    expect(d.Commandes[cmd].statut).toBe('reçue');
    const [e] = lireErreurs(d.Commandes[cmd]);
    expect(e).toMatchObject({ type: 'pas le bon article', libelle: 'Dentelle', montant: 8, rembourse: false });
    // payé 30 + 10 pour le reçu, 8 pour rien ; et la dentelle à racheter (8) dans le futur budget
    expect(budgetCostume(d, 'MP')).toMatchObject({ recu: 40, erreurs: 8, prevu: 8, total: 56 });
    d = appliquer(d, rembourserErreur(d, cmd, e.id, true));
    expect(budgetCostume(d, 'MP')).toMatchObject({ erreurs: 0, total: 48 });
    expect(erreursDuCostume(d, 'MP')[0].rembourse).toBe(true);
  });

  it('manquant à racheter, avec remboursement coché', () => {
    let { d, cmd } = commande();
    d = appliquer(d, receptionPartielle(d, cmd, { t: { etat: 'manquant', suite: 'racheter', rembourse: true } }, '2026-10-27'));
    expect(d.Fournitures.t.statut).toBe('à acheter');
    expect(lireErreurs(d.Commandes[cmd])[0]).toMatchObject({ type: 'manquant', rembourse: true });
    expect(budgetCostume(d, 'MP').erreurs).toBe(0);
  });

  it('quantité reçue inférieure : la part reçue est reçue, le manque arrive plus tard ou repasse à acheter', () => {
    let { d, cmd } = commande();
    d = appliquer(d, receptionPartielle(d, cmd, { b: { etat: 'quantite', recue: '12', suite: 'plus-tard' } }, '2026-10-27'));
    expect(d.Fournitures.b).toMatchObject({ statut: 'reçu', quantite: '12' });
    const reste = Object.values(d.Fournitures).find(f => f.libelle === 'Boutons' && f.id !== 'b')!;
    expect(reste).toMatchObject({ quantite: '8', statut: 'commandé', commande_id: cmd });
    expect(d.Commandes[cmd].statut).toBe('passée');

    ({ d, cmd } = commande());
    d = appliquer(d, receptionPartielle(d, cmd, { b: { etat: 'quantite', recue: '12', suite: 'racheter' } }, '2026-10-27'));
    const aRacheter = Object.values(d.Fournitures).find(f => f.libelle === 'Boutons' && f.id !== 'b')!;
    expect(aRacheter).toMatchObject({ quantite: '8', statut: 'à acheter', commande_id: '' });
    expect(lireErreurs(d.Commandes[cmd])[0]).toMatchObject({ type: 'quantité', montant: 4 });
  });

  it('signalé après réception : un article déjà « reçu » peut repartir', () => {
    let { d, cmd } = commande();
    d = appliquer(d, changerStatutCommande(d, cmd, 'reçue', '2026-10-27'));
    d = appliquer(d, receptionPartielle(d, cmd, { s: { etat: 'pas-le-bon', rembourse: false } }, '2026-10-30'));
    expect(d.Fournitures.s).toMatchObject({ statut: 'à acheter', commande_id: '' });
    expect(budgetCostume(d, 'MP').erreurs).toBe(30);
  });
});
