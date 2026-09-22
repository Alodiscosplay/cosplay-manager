import { describe, it, expect } from 'vitest';
import { construire, appliquer, vide } from './aide';
import { avancement, avancementPiece, formatPct } from '../src/logique/avancement';
import { aFaire, etapeDisponible, creeraitBoucle } from '../src/logique/disponibilite';
import { activationsDuJour } from '../src/logique/activation';
import { repartirSuite, repartirPiece, repartirCostume, retard } from '../src/logique/planning';
import { quantiteNombre, budgetCostume, totalCommande } from '../src/logique/budget';
import { analyserListe, versTexte } from '../src/logique/collerListe';
import { cocherEtape, creerCommandes, changerStatutCommande, appliquerListe, insererModele, deplacerEtape, creerCostume } from '../src/store/operations';
import { etapesDePiste, pistesDe, piecesDe, etapesDePiece } from '../src/logique/acces';

const titres = (r: ReturnType<typeof aFaire>) => r.elements.map(e => e.etape.titre);

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
      { nom: 'Robe', statut: 'à venir', pistes: [{ nom: '', etapes: ['couper la robe'] }] },
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

  it('une piste en pause disparaît de « À faire » mais reste comptée', () => {
    const { d, ids } = chapeau();
    d.Pistes[ids['Chapeau/Bijoux']].active = '';
    const r = aFaire(d, '2026-10-01');
    expect(titres(r)).toEqual(['patronner', 'assembler']);
    expect(r.repli.pistesEnPause.map(p => p.piste.nom)).toEqual(['Bijoux']);
  });

  it('une pièce non focus n’apparaît pas, mais est comptée dans le repli', () => {
    const { d } = chapeau();
    const r = aFaire(d, '2026-10-01');
    expect(titres(r)).not.toContain('couper la robe');
    expect(r.repli.piecesAVenir.map(p => p.piece.nom)).toEqual(['Robe']);
  });

  it('une pièce à venir qui commence le 3 novembre : absente le 2, présente le 3', () => {
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

describe('cocher : statut de la pièce', () => {
  it('passe « terminée » à 100 % et redevient « en cours » si on décoche', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Jupe', pistes: [{ nom: '', etapes: [['a', 1, true], ['b', 1]] }] }] });
    const d2 = appliquer(d, cocherEtape(d, ids['Jupe//b'], true, '2026-10-01'));
    expect(d2.Pieces[ids.Jupe].statut).toBe('terminée');
    const d3 = appliquer(d2, cocherEtape(d2, ids['Jupe//b'], false, '2026-10-01'));
    expect(d3.Pieces[ids.Jupe].statut).toBe('en cours');
  });
});

describe('Répartir', () => {
  it('proportionnel aux poids avant la deadline', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Jupe', pistes: [{ nom: '', etapes: [['a', 1], ['b', 2], ['c', 1]] }] }] });
    const r = repartirSuite(etapesDePiste(d, `${ids.Jupe}T0`), '2026-10-01', '2026-10-09');
    expect(Object.values(r)).toEqual(['2026-10-03', '2026-10-07', '2026-10-09']);
  });
  it('les étapes déjà faites ne sont pas replanifiées', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Jupe', pistes: [{ nom: '', etapes: [['a', 1, true], ['b', 1]] }] }] });
    const r = repartirSuite(etapesDePiste(d, `${ids.Jupe}T0`), '2026-10-01', '2026-10-09');
    expect(r).toEqual({ [ids['Jupe//b']]: '2026-10-09' });
  });
  it('les pistes parallèles partagent la même fenêtre, le montage vient après', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Chapeau', pistes: [
      { nom: 'Tissu', etapes: [['couper', 2], ['coudre', 2]] },
      { nom: 'Bijoux', etapes: [['modéliser', 2]] },
      { nom: 'Montage', etapes: [['assembler', 4]] },
    ] }] });
    d.Pistes[ids['Chapeau/Montage']].attend = `${ids['Chapeau/Tissu']},${ids['Chapeau/Bijoux']}`;
    const r = repartirPiece(d, ids.Chapeau, '2026-10-01', '2026-10-09');
    expect(r[ids['Chapeau/Tissu/coudre']]).toBe('2026-10-05');
    expect(r[ids['Chapeau/Bijoux/modéliser']]).toBe('2026-10-05');
    expect(r[ids['Chapeau/Montage/assembler']]).toBe('2026-10-09');
  });
  it('ne planifie rien avant la date de début de la pièce', () => {
    const { d, ids } = construire({
      costume: { deadline: '2026-11-21' },
      pieces: [
        { nom: 'Robe', statut: 'à venir', champs: { debut: '2026-10-02' }, pistes: [{ nom: '', etapes: [['a', 1], ['b', 1]] }] },
        { nom: 'Perruque', pistes: [{ nom: '', etapes: [['c', 1]] }] },
      ],
    });
    const r = repartirCostume(d, ids.costume, '2026-09-22', '2026-11-21');
    expect(r[ids['Robe//a']] >= '2026-10-02').toBe(true);
    expect(r[ids['Robe//b']]).toBe('2026-11-21');
    expect(r[ids['Perruque//c']]).toBe('2026-11-21');
  });
  it('retard : une étape prévue hier et non cochée', () => {
    const { d, ids } = construire({ pieces: [{ nom: 'Jupe', pistes: [{ nom: '', etapes: ['a', 'b'] }] }] });
    d.Etapes[ids['Jupe//a']].date_prevue = '2026-09-30';
    d.Etapes[ids['Jupe//b']].date_prevue = '2026-10-05';
    expect(retard(etapesDePiece(d, ids.Jupe), '2026-10-01').enRetard.map(e => e.titre)).toEqual(['a']);
  });
});

describe('achats et budget', () => {
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
    d.Fournisseurs.F = { id: 'F', maj: '', supprime: '', nom: 'Mercerie', frais_port: '4,90' };
    d.Fournitures.x = { id: 'x', maj: '', supprime: '', costume_id: 'A', libelle: 'Zip', quantite: '1', prix_unitaire: '3', fournisseur_id: 'F', statut: 'à acheter' };
    d.Fournitures.y = { id: 'y', maj: '', supprime: '', costume_id: 'B', libelle: 'Biais', quantite: '4m60', prix_unitaire: '1', fournisseur_id: 'F', statut: 'à acheter' };
    const ch = creerCommandes(d, ['x', 'y'], '2026-10-01');
    d = appliquer(d, ch);
    const cmd = ch.find(c => c.table === 'Commandes')!.id;
    expect(ch.filter(c => c.table === 'Commandes')).toHaveLength(1);
    expect(totalCommande(d, cmd)).toMatchObject({ articles: 7.6, port: 4.9 });
    d = appliquer(d, changerStatutCommande(d, cmd, 'reçue', '2026-10-05'));
    expect([d.Fournitures.x.statut, d.Fournitures.y.statut]).toEqual(['reçu', 'reçu']);
    expect(budgetCostume(d, 'A')).toMatchObject({ prevu: 3, engage: 3, recu: 3 });
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
