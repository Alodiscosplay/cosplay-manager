import { describe, it, expect } from 'vitest';
import { construire, appliquer, vide } from './aide';
import { lireJourSaisi, jourSaisi } from '../src/logique/dates';
import { avancement, avancementPiece, formatPct } from '../src/logique/avancement';
import { aFaire, etapeDisponible, creeraitBoucle, texteAttente, champsStatutPiece } from '../src/logique/disponibilite';
import { activationsDuJour } from '../src/logique/activation';
import { planifierCostume, debutEtape, retardPiece, finPlanifiable, alertes } from '../src/logique/planning';
import { effacerPlanning } from '../src/store/operations';
import { quantiteNombre, regrouperAchats, budgetCostume, totalCommande, regrouperParNom, texteQuantites } from '../src/logique/budget';
import { analyserListe, versTexte, modeleVersTexte, texteVersModele } from '../src/logique/collerListe';
import { changementsImport, enchainerPistes, cocherEtape, creerCommandes, changerStatutCommande, appliquerListe, insererModele, deplacerEtape, creerCostume } from '../src/store/operations';
import { etapesDePiste, pistesDe, piecesDe, etapesDePiece, piecesDeFourniture } from '../src/logique/acces';

const titres = (r: ReturnType<typeof aFaire>) => r.elements.map(e => e.etape.titre);

describe('dates tapées au clavier', () => {
  it('lit les formats courants et refuse les dates impossibles', () => {
    for (const x of ['3/11/2026', '03/11/26', '3-11-2026', '3.11.26', '03112026', '031126', '2026-11-03', ' 3 11 2026 '])
      expect(lireJourSaisi(x)).toBe('2026-11-03');
    expect(lireJourSaisi('31/02/2026')).toBe('');
    expect(lireJourSaisi('hier')).toBe('');
    expect(jourSaisi('2026-11-03')).toBe('03/11/2026');
  });
});

describe('avancement pondéré', () => {
  it('poids 1/2/1 : cocher l’étape de poids 2 donne 50 %', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Jupe', pistes: [{ nom: '', etapes: [['a', 1], ['b', 2, true], ['c', 1]] }] }] });
    expect(avancementPiece(d, ids.Jupe).pct).toBe(50);
  });
  it('cocher une étape de poids 1 sur 4 donne 25 %', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Jupe', pistes: [{ nom: '', etapes: [['a', 1, true], ['b', 2], ['c', 1]] }] }] });
    expect(avancementPiece(d, ids.Jupe).pct).toBe(25);
  });
  it('pièce vide : « — »', () => {
    expect(formatPct(avancement([]))).toBe('—');
  });
  it('la durée donne le poids quand le poids est vide', () => {
    const e = (duree: string, fait = '') => ({ id: duree, maj: '', supprime: '', duree, poids: '', fait });
    expect(avancement([e('long', 'oui'), e('rapide')]).pct).toBe(80); // 4 / (4 + 1)
  });
});

describe('À faire : pistes, ordre, focus', () => {
  const chapeau = () => construire({
    pieces: [
      { nom: 'Chapeau', pistes: [
        { nom: 'Tissu', etapes: ['patronner', 'couper', 'coudre'] },
        { nom: 'Bijoux', etapes: ['modéliser', 'couler en Fimo'] },
        { nom: 'Montage', etapes: ['assembler'] },
      ] },
      { nom: 'Robe', statut: 'en pause', pistes: [{ nom: '', etapes: ['couper la robe'] }] },
    ],
  });

  it('dans une piste, une étape attend la précédente ; les pistes avancent en parallèle', () => {
    const { d, ids } = chapeau();
    d.Pistes[ids['Chapeau/Montage']].attend = `${ids['Chapeau/Tissu']},${ids['Chapeau/Bijoux']}`;
    const r = aFaire(d, '2026-10-01');
    expect(titres(r)).toEqual(['patronner', 'modéliser']);
    expect(etapeDisponible(d, d.Etapes[ids['Chapeau/Tissu/couper']], '2026-10-01')).toBe(false);
  });

  it('la piste Montage attend Tissu et Bijoux, puis se libère', () => {
    const { d, ids } = chapeau();
    d.Pistes[ids['Chapeau/Montage']].attend = `${ids['Chapeau/Tissu']},${ids['Chapeau/Bijoux']}`;
    let r = aFaire(d, '2026-10-01');
    expect(r.repli.bloquees.map(b => b.piste.nom)).toEqual(['Montage']);
    for (const e of Object.values(d.Etapes)) if (e.piste_id !== ids['Chapeau/Montage']) e.fait = 'oui';
    r = aFaire(d, '2026-10-01');
    expect(titres(r)).toEqual(['assembler']);
  });

  it('une étape en pause sort de « À faire » et passe dans le repli, les autres avancent', () => {
    const { d, ids } = chapeau();
    d.Pistes[ids['Chapeau/Bijoux']].pause = 'oui';
    const r = aFaire(d, '2026-10-01');
    expect(titres(r)).toEqual(['patronner', 'assembler']);
    expect(r.repli.pistesEnPause.map(x => x.piste.nom)).toEqual(['Bijoux']);
  });

  it('une date de début atteinte réveille une étape en pause', () => {
    const { d, ids } = chapeau();
    Object.assign(d.Pistes[ids['Chapeau/Bijoux']], { pause: 'oui', debut: '2026-10-01' });
    expect(titres(aFaire(d, '2026-09-30'))).toEqual(['patronner', 'assembler']);
    expect(titres(aFaire(d, '2026-10-01'))).toEqual(['patronner', 'modéliser', 'assembler']);
  });

  it('une pièce non focus n’apparaît pas, mais est comptée dans le repli', () => {
    const { d } = chapeau();
    const r = aFaire(d, '2026-10-01');
    expect(titres(r)).not.toContain('couper la robe');
    expect(r.repli.piecesEnPause.map(p => p.piece.nom)).toEqual(['Robe']);
  });

  it('une pièce en pause qui commence le 3 novembre : absente le 2, présente le 3', () => {
    const { d, ids } = chapeau();
    d.Pieces[ids.Robe].debut = '2026-11-03';
    expect(titres(aFaire(d, '2026-11-02'))).not.toContain('couper la robe');
    expect(titres(aFaire(d, '2026-11-03'))).toContain('couper la robe');
    expect(activationsDuJour(d, '2026-11-03')).toEqual([{ table: 'Pieces', id: ids.Robe, champs: { statut: 'en cours' } }]);
    expect(activationsDuJour(d, '2026-11-02')).toEqual([]);
  });

  it('un « attend » vers une autre pièce bloque jusqu’à ce qu’elle soit finie', () => {
    const { d, ids } = chapeau();
    d.Pieces[ids.Robe].statut = 'en cours';
    d.Pistes[`${ids.Robe}T0`].attend = ids.Chapeau;
    let r = aFaire(d, '2026-10-01');
    expect(titres(r)).not.toContain('couper la robe');
    expect(r.repli.bloquees.some(b => b.piece.nom === 'Robe')).toBe(true);
    for (const e of Object.values(d.Etapes)) if (e.piece_id === ids.Chapeau) e.fait = 'oui';
    r = aFaire(d, '2026-10-01');
    expect(titres(r)).toContain('couper la robe');
  });

  it('un costume « en attente » est exclu, et compté', () => {
    const { d, ids } = chapeau();
    d.Costumes[ids.costume].statut = 'en attente';
    const r = aFaire(d, '2026-10-01');
    expect(r.elements).toEqual([]);
    expect(r.repli.costumesEnAttente).toHaveLength(1);
  });

  it('une piste avec date de début future attend son jour', () => {
    const { d, ids } = chapeau();
    d.Pistes[ids['Chapeau/Bijoux']].debut = '2026-12-01';
    expect(titres(aFaire(d, '2026-10-01'))).toEqual(['patronner', 'assembler']);
    expect(titres(aFaire(d, '2026-12-01'))).toContain('modéliser');
  });

  it('détecte une attente circulaire', () => {
    const { d, ids } = chapeau();
    d.Pistes[ids['Chapeau/Montage']].attend = ids['Chapeau/Tissu'];
    expect(creeraitBoucle(d, ids['Chapeau/Tissu'], ids['Chapeau/Montage'])).toBe(true);
    expect(creeraitBoucle(d, ids['Chapeau/Bijoux'], ids['Chapeau/Tissu'])).toBe(false);
  });
});

describe('pistes libres et attentes d’étape', () => {
  const robe = () => construire({ pieces: [{ nom: 'Robe', pistes: [
    { nom: 'Patronage', champs: { libre: 'oui' }, etapes: ['patron Belle', 'patron organza'] },
    { nom: 'Coupe', champs: { libre: 'oui' }, etapes: ['couper satin', 'couper organza'] },
    { nom: 'Montage', etapes: ['assembler'] },
  ] }] });

  it('une piste libre propose toutes ses étapes à la fois', () => {
    const { d, ids } = robe();
    d.Etapes[ids['Robe/Coupe/couper satin']].attend = ids['Robe/Patronage/patron Belle'];
    d.Etapes[ids['Robe/Coupe/couper organza']].attend = ids['Robe/Patronage/patron organza'];
    d.Pistes[ids['Robe/Montage']].attend = ids['Robe/Coupe'];
    expect(titres(aFaire(d, '2026-10-01'))).toEqual(['patron Belle', 'patron organza']);
  });

  it('une étape qui attend une étape précise se libère dès que celle-ci est cochée', () => {
    const { d, ids } = robe();
    d.Etapes[ids['Robe/Coupe/couper satin']].attend = ids['Robe/Patronage/patron Belle'];
    d.Etapes[ids['Robe/Coupe/couper organza']].attend = ids['Robe/Patronage/patron organza'];
    d.Pistes[ids['Robe/Montage']].attend = ids['Robe/Coupe'];
    d.Etapes[ids['Robe/Patronage/patron Belle']].fait = 'oui';
    const r = aFaire(d, '2026-10-01');
    expect(titres(r)).toEqual(['patron organza', 'couper satin']);
    expect(texteAttente(r.repli.bloquees.find(b => b.piste.nom === 'Montage')!.attente)).toBe('attend : Coupe (0/2)');
  });

  it('mettre en pause une pièce dont la date de début est passée efface la date', () => {
    const { d, ids } = robe();
    d.Pieces[ids.Robe].debut = '2026-09-01';
    expect(champsStatutPiece(d.Pieces[ids.Robe], 'en pause', '2026-10-01')).toEqual({ statut: 'en pause', debut: '' });
    expect(champsStatutPiece(d.Pieces[ids.Robe], 'en pause', '2026-08-01')).toEqual({ statut: 'en pause' });
  });

  it('l’ancien statut « à venir » se lit « en pause »', () => {
    const { d, ids } = robe();
    d.Pieces[ids.Robe].statut = 'à venir';
    expect(aFaire(d, '2026-10-01').repli.piecesEnPause).toHaveLength(1);
  });
});

describe('cocher : statut de la pièce', () => {
  it('passe « terminée » à 100 % et redevient « en cours » si on décoche', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Jupe', pistes: [{ nom: '', etapes: [['a', 1, true], ['b', 1]] }] }] });
    const d2 = appliquer(d, cocherEtape(d, ids['Jupe//b'], true, '2026-10-01'));
    expect(d2.Pieces[ids.Jupe].statut).toBe('terminée');
    const d3 = appliquer(d2, cocherEtape(d2, ids['Jupe//b'], false, '2026-10-01'));
    expect(d3.Pieces[ids.Jupe].statut).toBe('en cours');
  });
});

describe('Planifier', () => {
  it('les pièces se suivent dans l’ordre donné, proportionnellement à ce qu’il leur reste', () => {
    const { d, ids } = construire({ pieces: [
      { nom: 'Robe', pistes: [{ nom: '', etapes: [['a', 1], ['b', 1]] }] },
      { nom: 'Perruque', pistes: [{ nom: '', etapes: [['c', 1]] }] },
    ] });
    const plan = planifierCostume(d, ids.costume, '2026-10-01', '2026-10-31', { ordre: [ids.Perruque, ids.Robe] });
    expect(plan.pieces[ids.Perruque].debut).toBe('2026-10-01');
    expect(plan.pieces[ids.Perruque].deadline < plan.pieces[ids.Robe].debut
      || plan.pieces[ids.Perruque].deadline === plan.pieces[ids.Robe].debut).toBe(true);
    expect(plan.pieces[ids.Robe].deadline).toBe('2026-10-31');
  });

  it('une chaîne d’étapes reçoit une deadline par vague', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Corset', pistes: [
      { nom: 'Patron', etapes: [['tracer', 2]] },
      { nom: 'Coupe', etapes: [['couper', 2]] },
      { nom: 'Montage', etapes: [['assembler', 2]] },
    ] }] });
    const d2 = appliquer(d, enchainerPistes(d, ids.Corset));
    const plan = planifierCostume(d2, ids.costume, '2026-10-01', '2026-10-30');
    const [a, b, c] = [plan.etapes[ids['Corset/Patron']], plan.etapes[ids['Corset/Coupe']], plan.etapes[ids['Corset/Montage']]];
    expect(a < b && b < c).toBe(true);
    expect(c).toBe('2026-10-30');
    // rendues parallèles, les trois partagent la même deadline
    const d3 = appliquer(d2, enchainerPistes(d2, ids.Corset, false));
    const plan2 = planifierCostume(d3, ids.costume, '2026-10-01', '2026-10-30');
    expect(new Set(Object.values(plan2.etapes)).size).toBe(1);
  });

  it('une pièce qui a déjà sa fenêtre la garde, sauf si on replanifie tout', () => {
    const { d, ids } = construire({ pieces: [
      { nom: 'Robe', champs: { debut: '2026-10-02', deadline: '2026-10-10' }, pistes: [{ nom: '', etapes: [['a', 1]] }] },
      { nom: 'Perruque', pistes: [{ nom: '', etapes: [['c', 1]] }] },
    ] });
    const plan = planifierCostume(d, ids.costume, '2026-10-01', '2026-10-31');
    expect(plan.pieces[ids.Robe]).toBeUndefined();               // sa fenêtre n'est pas touchée
    expect(plan.etapes[ids['Robe/']]).toBe('2026-10-10');        // son étape finit avec elle
    expect(plan.pieces[ids.Perruque].deadline).toBe('2026-10-31');
    const force = planifierCostume(d, ids.costume, '2026-10-01', '2026-10-31', { remplacer: true });
    expect(force.pieces[ids.Robe]).toBeDefined();
  });

  it('laisse la marge voulue entre la fin prévue et la deadline', () => {
    expect(finPlanifiable('2026-11-21', '2026-09-22')).toBe('2026-11-14');
    expect(finPlanifiable('2026-09-25', '2026-09-22')).toBe('2026-09-22'); // deadline trop proche
    expect(finPlanifiable('2026-11-21', '2026-09-22', 21)).toBe('2026-10-31');
  });

  it('le début d’une étape se déduit de la pièce et de ce qu’elle attend', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Corset', champs: { debut: '2026-10-01' }, pistes: [
      { nom: 'Patron', etapes: [['tracer', 1]] },
      { nom: 'Coupe', etapes: [['couper', 1]] },
    ] }] });
    const d2 = appliquer(d, enchainerPistes(d, ids.Corset));
    d2.Pistes[ids['Corset/Patron']].deadline = '2026-10-08';
    expect(debutEtape(d2, d2.Pistes[ids['Corset/Patron']])).toBe('2026-10-01');
    expect(debutEtape(d2, d2.Pistes[ids['Corset/Coupe']])).toBe('2026-10-08');
  });

  it('une étape finie est figée : ni replanifiée, ni effacée', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Corset', pistes: [
      { nom: 'Patron', etapes: [['tracer', 2, true]] },
      { nom: 'Coupe', etapes: [['couper', 2]] },
    ] }] });
    d.Pistes[ids['Corset/Patron']].deadline = '2026-09-15';
    d.Pistes[ids['Corset/Coupe']].deadline = '2026-10-20';
    d.Pieces[ids.Corset].deadline = '2026-10-30';
    const plan = planifierCostume(d, ids.costume, '2026-10-01', '2026-10-30', { remplacer: true });
    expect(plan.etapes[ids['Corset/Patron']]).toBeUndefined();  // la faite garde sa date
    expect(plan.etapes[ids['Corset/Coupe']]).toBe('2026-10-30');
    const ch = effacerPlanning(d, [ids.Corset]);
    expect(ch.some(c => c.id === ids['Corset/Patron'])).toBe(false);
    expect(ch.some(c => c.id === ids['Corset/Coupe'])).toBe(true);
  });

  it('avertit quand une étape est datée après la deadline de sa pièce', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Crinoline', champs: { deadline: '2026-09-24' }, pistes: [
      { nom: 'Baleines', etapes: [['changer', 2]] },
    ] }] });
    d.Pistes[ids['Crinoline/Baleines']].deadline = '2026-10-01';
    const textes = alertes(d, '2026-09-24').map(a => a.texte);
    expect(textes.some(t => t.includes('après la deadline de la pièce'))).toBe(true);
  });

  it('retard : une étape dont la deadline est passée et qui n’est pas finie', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Jupe', pistes: [
      { nom: 'Coupe', etapes: ['a'] },
      { nom: 'Montage', etapes: ['b'] },
    ] }] });
    d.Pistes[ids['Jupe/Coupe']].deadline = '2026-09-30';
    d.Pistes[ids['Jupe/Montage']].deadline = '2026-10-05';
    expect(retardPiece(d, ids.Jupe, '2026-10-01').enRetard.map(p => p.nom)).toEqual(['Coupe']);
  });
});

describe('achats et budget', () => {
  it('une fourniture peut concerner plusieurs pièces (et une ancienne valeur à une seule pièce reste lue)', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Robe', pistes: [] }, { nom: 'Corset', pistes: [] }, { nom: 'Jupon', pistes: [] }] });
    d.Fournitures.f = { id: 'f', maj: '', supprime: '', costume_id: ids.costume, libelle: 'Biais', piece_id: `${ids.Robe},${ids.Corset}` };
    d.Fournitures.g = { id: 'g', maj: '', supprime: '', costume_id: ids.costume, libelle: 'Zip', piece_id: ids.Jupon };
    expect(piecesDeFourniture(d, d.Fournitures.f).map(p => p.nom)).toEqual(['Robe', 'Corset']);
    expect(piecesDeFourniture(d, d.Fournitures.g).map(p => p.nom)).toEqual(['Jupon']);
  });

  it('regroupe les fournitures de même nom (majuscules et espaces ignorés), triées par ordre alphabétique', () => {
    const f = (id: string, libelle: string, quantite: string, unite: string, costume = 'A') =>
      ({ id, maj: '', supprime: '', costume_id: costume, libelle, quantite, unite });
    const g = regrouperParNom([
      f('1', 'Satin blanc', '3', 'm'), f('2', 'Biais', '4', 'm'), f('3', '  satin   Blanc ', '5', 'm', 'B'), f('4', 'Satin blanc', '2', 'coupons'),
    ]);
    expect(g.map(x => x.libelle)).toEqual(['Biais', 'Satin blanc']);
    expect(g[1].lignes.map(l => l.id)).toEqual(['1', '3', '4']);
    expect(texteQuantites(g[1].quantites)).toBe('8 m + 2 coupons');
  });

  it('additionne les unités d’une même famille, et laisse à part ce qui ne se convertit pas', () => {
    const f = (quantite: string, unite: string) => ({ id: quantite + unite, maj: '', supprime: '', libelle: 'Satin', quantite, unite });
    const total = (...l: ReturnType<typeof f>[]) => texteQuantites(regrouperParNom(l)[0].quantites);
    expect(total(f('3', 'm'), f('10', 'cm'))).toBe('3,10 m');
    expect(total(f('2', 'coupon de 3 m'), f('50', 'cm'))).toBe('6,50 m');
    expect(total(f('1m20', ''), f('1', 'mètre'))).toBe('2,20 m');
    expect(total(f('250', 'g'), f('1', 'kg'))).toBe('1,25 kg');
    expect(total(f('3', 'm'), f('250', 'g'), f('2', 'paires'))).toBe('3 m + 250 g + 2 paires');
    expect(total(f('2', 'coupons'), f('1', 'Coupons'))).toBe('3 coupons');
    expect(total(f('30', 'cm'))).toBe('30 cm');
  });

  it('lit les quantités écrites à la main', () => {
    expect(quantiteNombre('1m20')).toBeCloseTo(1.2);
    expect(quantiteNombre('1,5')).toBe(1.5);
    expect(quantiteNombre('4 paires')).toBe(4);
    expect(quantiteNombre('')).toBe(1);
  });

  it('une commande regroupe les fournitures de deux costumes, et la réception met les lignes à « reçu »', () => {
    let d = vide();
    d.Costumes.A = { id: 'A', maj: '', supprime: '', nom: 'Bridget', statut: 'en cours', suivi_budget: 'oui' };
    d.Costumes.B = { id: 'B', maj: '', supprime: '', nom: 'Furina', statut: 'en cours' };
    d.Fournisseurs.F = { id: 'F', maj: '', supprime: '', nom: 'Mercerie' };
    d.Fournitures.x = { id: 'x', maj: '', supprime: '', costume_id: 'A', libelle: 'Zip', quantite: '1', prix_unitaire: '3', fournisseur_id: 'F', statut: 'à acheter' };
    d.Fournitures.y = { id: 'y', maj: '', supprime: '', costume_id: 'B', libelle: 'Biais', quantite: '4m60', prix_unitaire: '1', fournisseur_id: 'F', statut: 'à acheter' };
    const ch = creerCommandes(d, ['x', 'y'], '2026-10-01', { F: '4,90' });
    d = appliquer(d, ch);
    const cmd = ch.find(c => c.table === 'Commandes')!.id;
    expect(ch.filter(c => c.table === 'Commandes')).toHaveLength(1);
    expect(totalCommande(d, cmd)).toMatchObject({ articles: 7.6, port: 4.9 });
    d = appliquer(d, changerStatutCommande(d, cmd, 'reçue', '2026-10-05'));
    expect([d.Fournitures.x.statut, d.Fournitures.y.statut]).toEqual(['reçu', 'reçu']);
    expect(budgetCostume(d, 'A')).toMatchObject({ total: 5.45, prevu: 0, commande: 0, recu: 5.45 });
  });

  it('les frais de port d’une commande se partagent à parts égales entre ses fournitures, et comptent dans le budget de leur costume', () => {
    let d = vide();
    d.Costumes.A = { id: 'A', maj: '', supprime: '', nom: 'Bridget', statut: 'en cours' };
    d.Costumes.B = { id: 'B', maj: '', supprime: '', nom: 'Furina', statut: 'en cours' };
    const f = (id: string, costume_id: string, prix_unitaire: string) => ({ id, maj: '', supprime: '', costume_id, libelle: id, quantite: '1', prix_unitaire, fournisseur_id: 'F', statut: 'à acheter' });
    d.Fournitures.a1 = f('a1', 'A', '10'); d.Fournitures.a2 = f('a2', 'A', '5'); d.Fournitures.a3 = f('a3', 'A', ''); d.Fournitures.b1 = f('b1', 'B', '20');
    d = appliquer(d, creerCommandes(d, ['a1', 'a2', 'a3', 'b1'], '2026-10-01', { F: '6' }));
    // 6 € pour 4 fournitures : 1,50 € chacune, 3 pour Bridget et 1 pour Furina
    expect(budgetCostume(d, 'A')).toMatchObject({ total: 19.5, prevu: 19.5, sansPrix: 1 });
    expect(budgetCostume(d, 'B')).toMatchObject({ total: 21.5 });
    // commande passée : la part de port suit la fourniture dans « commandé »
    const cmd = d.Fournitures.a1.commande_id;
    d = appliquer(d, changerStatutCommande(d, cmd, 'passée', '2026-10-02'));
    expect(budgetCostume(d, 'A')).toMatchObject({ prevu: 0, commande: 19.5 });
  });

  it('la liste de courses se groupe par fournisseur ou par costume (dans l’ordre des costumes, « sans » en dernier)', () => {
    const d = vide();
    d.Costumes.A = { id: 'A', maj: '', supprime: '', nom: 'Bridget', statut: 'en cours', ordre: '2' };
    d.Costumes.B = { id: 'B', maj: '', supprime: '', nom: 'Furina', statut: 'en cours', ordre: '1' };
    d.Fournisseurs.F = { id: 'F', maj: '', supprime: '', nom: 'Mercerie' };
    const f = (id: string, costume_id: string, fournisseur_id: string) => ({ id, maj: '', supprime: '', costume_id, libelle: id, fournisseur_id, statut: 'à acheter' });
    d.Fournitures.x = f('x', 'A', 'F'); d.Fournitures.y = f('y', 'B', ''); d.Fournitures.z = f('z', '', 'F'); d.Fournitures.w = f('w', 'A', '');
    expect(regrouperAchats(d).map(g => [g.fournisseur?.nom ?? '—', g.lignes.map(l => l.id).sort().join('')]))
      .toEqual([['Mercerie', 'xz'], ['—', 'wy']]);
    expect(regrouperAchats(d, {}, 'costume').map(g => [g.costume?.nom ?? '—', g.lignes.map(l => l.id).sort().join('')]))
      .toEqual([['Furina', 'y'], ['Bridget', 'wx'], ['—', 'z']]);
    expect(regrouperAchats(d, { fournisseurId: 'F' }, 'costume').flatMap(g => g.lignes.map(l => l.id)).sort()).toEqual(['x', 'z']);
    expect(regrouperAchats(d, { fournisseurId: '__aucun', costumeId: 'A' }).flatMap(g => g.lignes.map(l => l.id))).toEqual(['w']);
  });
});

describe('Import d’une sauvegarde', () => {
  it('ajoute les lignes inconnues, garde les lignes locales plus récentes', () => {
    let d = vide();
    d.Taches.a = { id: 'a', maj: '2026-09-23T12:00:00Z', supprime: '', titre: 'saisi après l’export' };
    d.Taches.b = { id: 'b', maj: '2026-09-23T09:00:00Z', supprime: '', titre: 'ancien' };
    const sauvegarde = {
      Taches: {
        a: { id: 'a', maj: '2026-09-23T10:00:00Z', supprime: '', titre: 'version de la sauvegarde' },
        b: { id: 'b', maj: '2026-09-23T11:00:00Z', supprime: '', titre: 'corrigé' },
        c: { id: 'c', maj: '2026-09-23T11:00:00Z', supprime: '', titre: 'nouvelle' },
      },
    };
    const { changements, bilan } = changementsImport(d, sauvegarde);
    expect(bilan).toEqual({ ajouts: 1, majs: 1, ignorees: 1 });
    d = appliquer(d, changements);
    expect(d.Taches.a.titre).toBe('saisi après l’export');
    expect(d.Taches.b.titre).toBe('corrigé');
    expect(d.Taches.c.titre).toBe('nouvelle');
  });
});

describe('Coller une liste', () => {
  const texte = `## Chapeau
### Tissu
- patronner
- couper
### Bijoux
1. modéliser (long)
2. couler en Fimo (très long)
## Robe
couper la robe (rapide)`;

  it('analyse pièces, pistes, étapes et durées', () => {
    const l = analyserListe(texte);
    expect(l.pieces.map(p => p.nom)).toEqual(['Chapeau', 'Robe']);
    expect(l.pieces[0].pistes.map(p => p.nom)).toEqual(['Tissu', 'Bijoux']);
    expect(l.pieces[0].pistes[1].etapes).toEqual([{ titre: 'modéliser', duree: 'long' }, { titre: 'couler en Fimo', duree: 'très long' }]);
    expect(l.pieces[1].pistes[0].etapes).toEqual([{ titre: 'couper la robe', duree: 'rapide' }]);
  });

  it('crée tout dans le costume, sans piste vide en trop', () => {
    let d = vide();
    const cc = creerCostume(d, 'Test');
    d = appliquer(d, cc);
    const cid = cc[0].id;
    d = appliquer(d, appliquerListe(d, analyserListe(texte), cid));
    const [chapeau, robe] = piecesDe(d, cid);
    expect(pistesDe(d, chapeau.id).map(p => p.nom)).toEqual(['Tissu', 'Bijoux']);
    expect(pistesDe(d, robe.id)).toHaveLength(1);
    expect(etapesDePiece(d, chapeau.id).map(e => e.titre)).toEqual(['patronner', 'couper', 'modéliser', 'couler en Fimo']);
  });

  it('des étapes sans « ## » vont dans la pièce choisie', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Jupe', pistes: [{ nom: '', etapes: ['a'] }] }] });
    const d2 = appliquer(d, appliquerListe(d, analyserListe('b\nc (long)'), ids.costume, ids.Jupe));
    expect(etapesDePiece(d2, ids.Jupe).map(e => `${e.titre}:${e.poids}`)).toEqual(['a:1', 'b:2', 'c:4']);
  });

  it('le formulaire de modèle et son texte font l’aller-retour', () => {
    const une = [{ nom: '', etapes: [{ titre: 'Modéliser', duree: 'long' as const }, { titre: 'Imprimer', duree: 'normal' as const }] }];
    expect(modeleVersTexte(une)).toBe('Modéliser (long)\nImprimer');
    const deux = [
      { nom: 'Broderie', etapes: [{ titre: 'Motif', duree: 'rapide' as const }] },
      { nom: 'Couture', etapes: [{ titre: 'Couper', duree: 'normal' as const }, { titre: ' ', duree: 'normal' as const }] },
    ];
    const texte = modeleVersTexte(deux);
    expect(texte).toBe('### Broderie\nMotif (rapide)\n### Couture\nCouper');
    expect(texteVersModele(texte)).toEqual([
      { nom: 'Broderie', etapes: [{ titre: 'Motif', duree: 'rapide' }] },
      { nom: 'Couture', etapes: [{ titre: 'Couper', duree: 'normal' }] },
    ]);
  });

  it('un modèle s’insère comme piste parallèle, et l’aller-retour texte est stable', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Épée', pistes: [{ nom: '', etapes: ['patronner'] }] }] });
    const modele = 'Modéliser (long)\nImprimer\nPoncer (rapide)';
    const d2 = appliquer(d, insererModele(d, ids['Épée'], 'Impression 3D', analyserListe(modele)));
    const pistes = pistesDe(d2, ids['Épée']);
    expect(pistes.map(p => p.nom)).toEqual(['', 'Impression 3D']);
    expect(versTexte(etapesDePiste(d2, pistes[1].id))).toBe(modele);
    expect(titres(aFaire(d2, '2026-10-01'))).toEqual(['patronner', 'Modéliser']);
  });
});

describe('déplacer une étape', () => {
  it('change de piste et renumérote', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'P', pistes: [{ nom: 'A', etapes: ['a1', 'a2'] }, { nom: 'B', etapes: ['b1'] }] }] });
    const d2 = appliquer(d, deplacerEtape(d, ids['P/A/a2'], ids['P/B'], 0));
    expect(etapesDePiste(d2, ids['P/B']).map(e => e.titre)).toEqual(['a2', 'b1']);
    expect(etapesDePiste(d2, ids['P/A']).map(e => e.titre)).toEqual(['a1']);
  });
});
