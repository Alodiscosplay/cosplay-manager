import { describe, it, expect } from 'vitest';
import { vide, appliquer } from './aide';
import { type Donnees, type Ligne } from '../src/modele/schema';
import { dateEvenementCostume, datesClesAFaire, activitesConnues, evenementsDe, costumesDe, costumesPrevus, nomEvenement, activiteDe } from '../src/logique/evenements';
import { deadlineCostume, agenda, fenetresEvenements } from '../src/logique/planning';
import { supprimer } from '../src/store/operations';
import { lignesDuCostume, lireContenu } from '../src/export/archive';

const l = (id: string, champs: Record<string, string>): Ligne => ({ id, maj: '', supprime: '', ...champs });

/** Mangazur (convention, 24-25 avril) et son show du samedi ; Hydrasil ; la photocon Click and Cosplay. */
function monde(): Donnees {
  const d = vide();
  d.Evenements.MZ = l('MZ', { nom: 'Mangazur', date_debut: '2027-04-24', date_fin: '2027-04-25', activite: '' });
  d.Evenements.SH = l('SH', { nom: 'Show cosplay', activite: 'Show cosplay', convention_id: 'MZ', date_debut: '2027-04-24', date_fin: '2027-04-24' });
  d.Evenements.HY = l('HY', { nom: 'Hydrasil', activite: 'Show cosplay', date_debut: '2027-03-06', date_fin: '2027-03-07' });
  d.Evenements.CC = l('CC', { nom: 'Click and Cosplay', activite: 'Photocon', date_debut: '2027-03-27' });
  d.Costumes.ARI = l('ARI', { nom: 'Ariel historique', statut: 'en cours', ordre: '1', evenement_id: 'CC,HY' });
  d.Costumes.MP = l('MP', { nom: 'Mary Poppins', statut: 'en cours', ordre: '2', evenement_id: 'MZ,SH' });
  d.Costumes.MG = l('MG', { nom: 'Margarita', statut: 'en cours', ordre: '3', evenement_id: 'SH' });
  return d;
}

describe('événements', () => {
  it('un événement sans activité (créé avant) est une convention', () => {
    const d = monde();
    expect(activiteDe(d.Evenements.MZ)).toBe('Convention');
    expect(nomEvenement(d, d.Evenements.SH)).toBe('Show cosplay · Mangazur');
  });

  it('une activité tapée à la main revient dans la liste', () => {
    const d = monde();
    d.Evenements.K = l('K', { nom: 'Karaoké', activite: 'Karaoké' });
    expect(activitesConnues(d)).toEqual(['Convention', 'Show cosplay', 'Concours cosplay', 'Défilé cosplay', 'Shooting', 'Karaoké']);
  });

  it('un costume porté à plusieurs événements, plusieurs costumes à un événement', () => {
    const d = monde();
    expect(evenementsDe(d, d.Costumes.ARI).map(e => e.id)).toEqual(['HY', 'CC']);
    expect(costumesDe(d, 'SH').map(c => c.id)).toEqual(['MP', 'MG']);
  });

  it('un costume prévu pour une activité l’est aussi pour sa convention', () => {
    const d = monde();
    expect(costumesPrevus(d, 'MZ').map(x => [x.costume.id, x.via?.id ?? ''])).toEqual([['MP', ''], ['MG', 'SH']]);
  });

  it('la deadline vient du premier événement, et ne glisse pas une fois passé', () => {
    const d = monde();
    expect(deadlineCostume(d, d.Costumes.ARI)).toBe('2027-03-06'); // Hydrasil, avant la photocon
    d.Costumes.ARI.deadline = '2027-03-20';
    expect(deadlineCostume(d, d.Costumes.ARI)).toBe('2027-03-20'); // la sienne fait foi
  });

  it('dans une convention, c’est le jour de passage qui fait foi', () => {
    const d = monde();
    d.Evenements.SH.date_debut = d.Evenements.SH.date_fin = '2027-04-25';
    expect(dateEvenementCostume(d, d.Costumes.MP)?.evenement.id).toBe('SH');
    expect(deadlineCostume(d, d.Costumes.MP)).toBe('2027-04-25');
  });

  it('un ancien lien vers un seul événement se lit toujours', () => {
    const d = monde();
    d.Costumes.X = l('X', { nom: 'X', statut: 'en cours', evenement_id: 'MZ' });
    expect(deadlineCostume(d, d.Costumes.X)).toBe('2027-04-24');
  });
});

describe('dates clés dans « À faire »', () => {
  const avec = (dcs: Record<string, Record<string, string>>) => {
    const d = monde();
    for (const [id, c] of Object.entries(dcs)) d.DatesCles[id] = l(id, { evenement_id: 'SH', ...c });
    return d;
  };

  it('une période apparaît à son ouverture, rougit 3 jours avant la clôture', () => {
    const d = avec({ I: { titre: 'Inscriptions', nature: 'periode', debut: '2027-02-01', fin: '2027-02-15' } });
    expect(datesClesAFaire(d, '2027-01-31').aFaire).toHaveLength(0);
    expect(datesClesAFaire(d, '2027-01-31').plusTard[0].apparait).toBe('2027-02-01');
    expect(datesClesAFaire(d, '2027-02-01').aFaire[0]).toMatchObject({ niveau: 'orange' });
    expect(datesClesAFaire(d, '2027-02-13').aFaire[0]).toMatchObject({ niveau: 'rouge' });
    expect(datesClesAFaire(d, '2027-02-16').aFaire[0].texte).toMatch(/^clôturé/);
  });

  it('une date limite apparaît 14 jours avant ; une date cochée disparaît', () => {
    const d = avec({ R: { titre: 'Références', nature: 'limite', fin: '2027-03-01' } });
    expect(datesClesAFaire(d, '2027-02-14').aFaire).toHaveLength(0);
    expect(datesClesAFaire(d, '2027-02-15').aFaire).toHaveLength(1);
    d.DatesCles.R.fait = 'oui';
    expect(datesClesAFaire(d, '2027-02-20')).toEqual({ aFaire: [], plusTard: [] });
  });

  it('une date fixe apparaît 14 jours avant, orange à 3 jours, rouge une fois passée', () => {
    const d = avec({ R: { titre: 'Répétition', nature: 'fixe', fin: '2027-04-10' } });
    expect(datesClesAFaire(d, '2027-03-26').aFaire).toHaveLength(0);
    expect(datesClesAFaire(d, '2027-03-27').aFaire[0]).toMatchObject({ niveau: '', texte: 'le 10 avr.' });
    expect(datesClesAFaire(d, '2027-04-08').aFaire[0]).toMatchObject({ niveau: 'orange' });
    expect(datesClesAFaire(d, '2027-04-10').aFaire[0]).toMatchObject({ texte: "aujourd'hui" });
    expect(datesClesAFaire(d, '2027-04-12').aFaire[0]).toMatchObject({ niveau: 'rouge', texte: "c'était le 10 avr." });
  });

  it('une ancienne date « à recevoir » se lit comme une date fixe', () => {
    const d = avec({ B: { titre: 'Billet', nature: 'attendu', fin: '2027-04-10' } });
    expect(datesClesAFaire(d, '2027-04-12').aFaire[0]).toMatchObject({ niveau: 'rouge' });
  });
});

describe('agenda', () => {
  it('un événement s’étend sur ses jours ; une période donne ouverture et clôture', () => {
    const d = monde();
    d.DatesCles.I = l('I', { evenement_id: 'SH', titre: 'Inscriptions', nature: 'periode', debut: '2027-02-01', fin: '2027-02-15' });
    expect(fenetresEvenements(d, '2027-04-19', '2027-04-25').map(f => [f.evenement.id, f.debut, f.fin]))
      .toEqual([['MZ', '2027-04-24', '2027-04-25'], ['SH', '2027-04-24', '2027-04-24']]);
    expect(agenda(d, '2027-02-01', '2027-02-28').map(i => [i.jour, i.detail, i.titre]))
      .toEqual([['2027-02-01', 'ouverture', 'Show cosplay · Mangazur — Inscriptions'], ['2027-02-15', 'clôture', 'Show cosplay · Mangazur — Inscriptions']]);
  });

  it('filtré par costume : ses événements et leur convention', () => {
    const d = monde();
    expect(fenetresEvenements(d, '2027-01-01', '2027-12-31', 'MG').map(f => f.evenement.id)).toEqual(['MZ', 'SH']);
    expect(fenetresEvenements(d, '2027-01-01', '2027-12-31', 'ARI').map(f => f.evenement.id)).toEqual(['HY', 'CC']);
  });
});

describe('suppression et sauvegarde', () => {
  it('supprimer une convention emporte ses activités et leurs dates clés, pas les costumes', () => {
    let d = monde();
    d.DatesCles.I = l('I', { evenement_id: 'SH', titre: 'Inscriptions' });
    d.DatesCles.B = l('B', { evenement_id: 'MZ', titre: 'Billet' });
    d = appliquer(d, supprimer(d, 'Evenements', 'MZ'));
    expect(['MZ', 'SH'].map(id => d.Evenements[id].supprime)).toEqual(['purge', 'purge']);
    expect(['I', 'B'].map(id => d.DatesCles[id].supprime)).toEqual(['purge', 'purge']);
    expect(d.Costumes.MP).toMatchObject({ supprime: '', evenement_id: '' });
    expect(d.Costumes.ARI.evenement_id).toBe('CC,HY');
  });

  it('la sauvegarde emporte événements, convention et dates clés ; le réimport les recrée liés', () => {
    const d = monde();
    d.DatesCles.I = l('I', { evenement_id: 'SH', titre: 'Inscriptions', nature: 'periode' });
    const lignes = lignesDuCostume(d, 'MG');
    expect(lignes.Evenements!.map(e => e.id).sort()).toEqual(['MZ', 'SH']);
    expect(lignes.DatesCles!.map(x => x.id)).toEqual(['I']);

    const ailleurs = vide(); // un autre appareil, sans ces événements
    const r = lireContenu({ format: 'cosplay-planner-archive', version: 1, exporte_le: '', lignes, fichiers: {} }, ailleurs);
    const apres = appliquer(ailleurs, r.changements);
    const show = Object.values(apres.Evenements).find(e => e.nom === 'Show cosplay')!;
    const conv = Object.values(apres.Evenements).find(e => e.nom === 'Mangazur')!;
    expect(show.convention_id).toBe(conv.id);
    expect(Object.values(apres.DatesCles)[0].evenement_id).toBe(show.id);
    expect(Object.values(apres.Costumes)[0].evenement_id).toBe(show.id);

    const ici = lireContenu({ format: 'cosplay-planner-archive', version: 1, exporte_le: '', lignes, fichiers: {} }, d);
    expect(ici.changements.filter(c => c.table === 'Evenements' || c.table === 'DatesCles')).toHaveLength(0); // déjà là : réutilisés
  });
});
