// Données d'exemple du mode démo : pour essayer l'appli sans compte Google.
import { donneesVides, type Donnees, type NomTable } from '../modele/schema';
import { appliquerChangements, creerCostume, creerPiece, appliquerListe, insererModele, nouvelId, type Changement } from '../store/operations';
import { analyserListe } from '../logique/collerListe';
import { ajouterJours, type Jour } from '../logique/dates';
import { MODELES_PAR_DEFAUT } from '../modele/modelesParDefaut';
import { piecesDe, pistesDe } from '../logique/acces';

export function donneesDemo(jour: Jour): Donnees {
  let d = donneesVides();
  const maj = new Date().toISOString();
  const faire = (ch: Changement[]) => { d = appliquerChangements(d, ch, maj); return ch; };
  const maj1 = (table: NomTable, id: string, champs: Record<string, string>) => faire([{ table, id, champs }]);

  MODELES_PAR_DEFAUT.forEach((m, i) => faire([{ table: 'Modeles', id: nouvelId(), champs: { nom: m.nom, contenu: m.contenu, ordre: String(i + 1) } }]));

  const conv = nouvelId();
  faire([{ table: 'Evenements', id: conv, champs: { nom: 'Convention (exemple)', date_debut: ajouterJours(jour, 60), date_fin: ajouterJours(jour, 61), lieu: 'Parc des expositions' } }]);

  // Costume 1 : en cours, avec pistes parallèles
  const c1 = faire(creerCostume(d, 'Fée des bois (exemple)'))[0].id;
  maj1('Costumes', c1, { statut: 'en cours', personnage: 'Fée des bois', oeuvre: 'Exemple', evenement_id: conv, suivi_budget: 'oui', budget_prevu: '120' });
  faire(appliquerListe(d, analyserListe(`## Chapeau
### Tissu
Patronner le chapeau (long)
Couper le feutre (rapide)
Coudre la calotte
Coudre le bord
### Bijoux
Modéliser les fleurs (long)
Couler en Fimo
Cuire et peindre
### Montage
Assembler le chapeau
Finitions (rapide)
## Robe
Toile et essayage (long)
Couper le tissu
Assembler la robe (très long)
Ourlet
Perles sur le corsage (long)`), c1));
  const [chapeau, robe] = piecesDe(d, c1);
  const [tissu, bijoux, montage] = pistesDe(d, chapeau.id);
  maj1('Pieces', chapeau.id, { statut: 'en cours', deadline: ajouterJours(jour, 30), patron: 'Patron maison' });
  maj1('Pistes', montage.id, { attend: `${tissu.id},${bijoux.id}` });
  // Patronage libre : deux patrons indépendants, vérifiables dans n'importe quel ordre ;
  // chaque coupe attend SON patron.
  faire(appliquerListe(d, analyserListe(`### Patronage
Vérifier le patron de la jupe
Vérifier le patron du haut
### Coupe
Couper le satin (rapide)
Couper l'organza (rapide)`), c1, robe.id));
  const [, patronage, coupe] = pistesDe(d, robe.id);
  maj1('Pistes', patronage.id, { libre: 'oui' });
  maj1('Pistes', coupe.id, { libre: 'oui' });
  const et = (titre: string) => Object.values(d.Etapes).find(e => e.titre === titre)!.id;
  maj1('Etapes', et('Couper le satin'), { attend: et('Vérifier le patron de la jupe') });
  maj1('Etapes', et("Couper l'organza"), { attend: et('Vérifier le patron du haut') });
  maj1('Pieces', robe.id, { statut: 'en pause', debut: ajouterJours(jour, 10), patron: 'TV341 vue B' });
  const premiere = Object.values(d.Etapes).find(e => e.titre === 'Patronner le chapeau')!;
  maj1('Etapes', premiere.id, { fait: 'oui', fait_le: ajouterJours(jour, -2) });

  const perruque = faire(creerPiece(d, c1, 'Perruque', 'en cours'))[0].id;
  faire(insererModele(d, perruque, 'Perruque', analyserListe(MODELES_PAR_DEFAUT[1].contenu)));

  // Costume 2 : en attente du premier
  const c2 = faire(creerCostume(d, 'Chevalier (exemple)'))[0].id;
  maj1('Costumes', c2, { statut: 'en attente', attend_costume_id: c1, personnage: 'Chevalier' });
  const epee = faire(creerPiece(d, c2, 'Épée'))[0].id;
  faire(insererModele(d, epee, 'Impression 3D', analyserListe(MODELES_PAR_DEFAUT[0].contenu)));

  // Achats : un fournisseur, des fournitures de deux costumes
  const merc = nouvelId(), tissus = nouvelId();
  faire([
    { table: 'Fournisseurs', id: merc, champs: { nom: 'Mercerie du coin', type: 'mercerie', frais_port: '4,90', franco: '40' } },
    { table: 'Fournisseurs', id: tissus, champs: { nom: 'Magasin de tissus', type: 'tissus', url: 'https://exemple.fr' } },
  ]);
  const fourniture = (costume: string, libelle: string, quantite: string, unite: string, prix: string, fournisseur: string, piece = '') =>
    faire([{ table: 'Fournitures', id: nouvelId(), champs: { costume_id: costume, piece_id: piece, libelle, quantite, unite, prix_unitaire: prix, fournisseur_id: fournisseur, statut: 'à acheter' } }]);
  fourniture(c1, 'Feutre vert', '0,5', 'm', '14', tissus, chapeau.id);
  fourniture(c1, 'Crêpe de soie', '3', 'm', '18', tissus, robe.id);
  fourniture(c1, 'Perles nacrées', '2', 'sachets', '3,50', merc, robe.id);
  fourniture(c1, 'Fermeture invisible 35 cm', '1', '', '2,80', merc, robe.id);
  fourniture(c2, 'Fil PLA gris', '1', 'bobine', '', '');

  faire([{ table: 'Taches', id: nouvelId(), champs: { titre: 'Laver le tissu de la robe', costume_id: c1, date: ajouterJours(jour, 3), ordre: '1' } }]);
  return d;
}
