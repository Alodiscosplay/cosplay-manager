// Événements : conventions, activités (concours, show…) et leurs dates clés.
// Une activité peut vivre seule (un shooting, comme une photocon) ou dans une convention (le show de Mangazur).
import { type Donnees, type Ligne, bool, liste, vivant } from '../modele/schema';
import { ligne, parOrdre } from './acces';
import { lireJour, ecartJours, ajouterJours, jourCourt, type Jour } from './dates';

export const CONVENTION = 'Convention';
/** Proposées d'office ; « Autre… » permet d'en taper une, qui revient ensuite dans la liste. */
export const ACTIVITES = [CONVENTION, 'Show cosplay', 'Concours cosplay', 'Défilé cosplay', 'Shooting'];

/** « Photocon », proposé au début, s'appelle désormais « Shooting ». */
const lue = (ev: Ligne): string => { const a = (ev.activite ?? '').trim(); return a.toLowerCase() === 'photocon' ? 'Shooting' : a; };
/** Sans activité choisie (événements d'avant), un événement est une convention. */
export const activiteDe = (ev: Ligne): string => lue(ev) || CONVENTION;
export const estConvention = (ev: Ligne): boolean => activiteDe(ev) === CONVENTION;
/** L'activité telle que saisie : vide pour une activité tout juste ajoutée à une convention. */
export const activiteSaisie = (ev: Ligne): string => lue(ev) || (ev.convention_id ? '' : CONVENTION);
/** Le nom à afficher, même pour un événement resté sans nom (fiche fermée par un rechargement). */
export const libelleEvenement = (ev: Ligne): string =>
  ev.nom || (ev.convention_id ? activiteSaisie(ev) || 'Activité sans nom' : 'Événement sans nom');

/** Les activités proposées, plus celles déjà tapées à la main. */
export function activitesConnues(d: Donnees): string[] {
  const res = [...ACTIVITES];
  for (const ev of Object.values(d.Evenements)) {
    const a = vivant(ev) ? activiteDe(ev) : '';
    if (a && !res.some(x => x.toLowerCase() === a.toLowerCase())) res.push(a);
  }
  return res;
}

const parDate = (a: Ligne, b: Ligne) => (a.date_debut || '9999').localeCompare(b.date_debut || '9999') || a.nom.localeCompare(b.nom);

export function evenements(d: Donnees): Ligne[] {
  return Object.values(d.Evenements).filter(vivant).sort(parDate);
}

/** La convention qui contient cet événement, s'il y en a une. */
export const conventionDe = (d: Donnees, ev: Ligne): Ligne | undefined => ligne(d, 'Evenements', ev.convention_id);

/** Les activités rattachées à une convention. */
export function activitesDe(d: Donnees, conventionId: string): Ligne[] {
  return evenements(d).filter(e => e.convention_id === conventionId);
}

/** Les conventions où l'on peut rattacher une activité (pas l'événement lui-même). */
export function conventionsPossibles(d: Donnees, sauf?: string): Ligne[] {
  return evenements(d).filter(e => e.id !== sauf && estConvention(e) && !e.convention_id);
}

/** Nom complet : « Show cosplay · Mangazur » pour une activité sans nom propre dans une convention. */
export function nomEvenement(d: Donnees, ev: Ligne): string {
  const conv = conventionDe(d, ev);
  return conv && ev.nom !== conv.nom ? `${libelleEvenement(ev)} · ${conv.nom}` : libelleEvenement(ev);
}

/** Les événements où le costume est porté, par date. */
export function evenementsDe(d: Donnees, costume: Ligne): Ligne[] {
  return liste(costume.evenement_id).map(id => ligne(d, 'Evenements', id)).filter((e): e is Ligne => !!e).sort(parDate);
}

/** Les costumes portés à cet événement. */
export function costumesDe(d: Donnees, evenementId: string): Ligne[] {
  return Object.values(d.Costumes).filter(c => vivant(c) && liste(c.evenement_id).includes(evenementId)).sort(parOrdre);
}

/**
 * Les costumes prévus pour un événement : les siens, puis ceux de ses activités (`via`), qui le sont
 * d'office pour la convention qui les contient.
 */
export function costumesPrevus(d: Donnees, evenementId: string): { costume: Ligne; via?: Ligne }[] {
  const res: { costume: Ligne; via?: Ligne }[] = costumesDe(d, evenementId).map(costume => ({ costume }));
  for (const a of activitesDe(d, evenementId)) {
    for (const costume of costumesDe(d, a.id)) if (!res.some(x => x.costume.id === costume.id)) res.push({ costume, via: a });
  }
  return res;
}

/**
 * La date d'événement qui sert de deadline à un costume qui n'en a pas : le premier événement où il
 * est porté. Elle ne glisse pas d'elle-même vers le suivant une fois passée : c'est à l'utilisatrice
 * de poser une deadline si le costume est repris. Une convention qui contient une autre de ses
 * activités ne compte pas : c'est le jour de passage qui fait foi.
 */
export function dateEvenementCostume(d: Donnees, costume: Ligne): { jour: Jour; evenement: Ligne } | undefined {
  const evs = evenementsDe(d, costume);
  const contenantes = new Set(evs.map(e => e.convention_id).filter(Boolean));
  let res: { jour: Jour; evenement: Ligne } | undefined;
  for (const e of evs) {
    const j = lireJour(e.date_debut);
    if (!j || contenantes.has(e.id)) continue;
    if (!res || j < res.jour) res = { jour: j, evenement: e };
  }
  return res;
}

// ---------- Dates clés ----------

export const NATURES = { periode: 'Période', limite: 'Date limite', fixe: 'Date fixe' } as const;
export type Nature = keyof typeof NATURES;
/** « attendu » (à recevoir, essayé avant la date fixe) se lit comme une date fixe. */
export const natureDe = (dc: Ligne): Nature => (dc.nature === 'attendu' ? 'fixe' : dc.nature in NATURES ? dc.nature as Nature : 'limite');

export function datesClesDe(d: Donnees, evenementId: string): Ligne[] {
  return Object.values(d.DatesCles).filter(x => vivant(x) && x.evenement_id === evenementId)
    .sort((a, b) => (a.debut || a.fin || '9999').localeCompare(b.debut || b.fin || '9999') || parOrdre(a, b));
}

/** Une date clé sur la fiche : « du 1 au 15 févr. », « avant le 1 mars », « le 10 avr. ». */
export function texteDates(dc: Ligne, ref?: Jour): string {
  const debut = lireJour(dc.debut), fin = lireJour(dc.fin);
  switch (natureDe(dc)) {
    case 'periode':
      if (debut && fin) return `du ${jourCourt(debut, ref)} au ${jourCourt(fin, ref)}`;
      if (debut) return `à partir du ${jourCourt(debut, ref)}`;
      return fin ? `jusqu'au ${jourCourt(fin, ref)}` : 'sans date';
    case 'limite': return fin ? `avant le ${jourCourt(fin, ref)}` : 'sans date';
    case 'fixe': return fin ? `le ${jourCourt(fin, ref)}` : 'sans date';
  }
}

/** Une date limite, une date fixe (ou la clôture d'une période) remonte dans « À faire » 14 jours avant. */
export const JOURS_AVANT = 14;
const JOURS_ROUGE = 3;

export interface DateCleAFaire { dateCle: Ligne; evenement: Ligne; niveau: 'rouge' | 'orange' | ''; texte: string }
export interface DateClePlusTard { dateCle: Ligne; evenement: Ligne; apparait: Jour }

/** Le jour où une date clé non faite apparaît dans « À faire » ('' : tout de suite). */
export function apparitionDateCle(dc: Ligne): Jour | '' {
  const debut = lireJour(dc.debut), fin = lireJour(dc.fin);
  const avant = (j: Jour) => ajouterJours(j, -JOURS_AVANT);
  switch (natureDe(dc)) {
    case 'periode': return debut || (fin ? avant(fin) : '');
    case 'limite':
    case 'fixe': return fin ? avant(fin) : '';
  }
}

/**
 * Les dates clés à traiter aujourd'hui (le bloc « Événements » de « À faire ») et celles qui viendront
 * plus tard (dans le repli, pour que rien ne soit masqué en silence). Une date cochée disparaît.
 */
export function datesClesAFaire(d: Donnees, jour: Jour): { aFaire: DateCleAFaire[]; plusTard: DateClePlusTard[] } {
  const aFaire: DateCleAFaire[] = [];
  const plusTard: DateClePlusTard[] = [];
  for (const dc of Object.values(d.DatesCles)) {
    if (!vivant(dc) || bool(dc.fait)) continue;
    const ev = ligne(d, 'Evenements', dc.evenement_id);
    if (!ev) continue;
    const apparait = apparitionDateCle(dc);
    if (apparait && apparait > jour) { plusTard.push({ dateCle: dc, evenement: ev, apparait }); continue; }
    const fin = lireJour(dc.fin);
    const nature = natureDe(dc);
    let niveau: DateCleAFaire['niveau'] = '';
    let texte: string;
    if (nature === 'fixe') {
      // Un jour précis (réponse attendue, répétition) : orange à l'approche, rouge s'il est passé sans être coché.
      if (fin) niveau = fin < jour ? 'rouge' : ecartJours(jour, fin) <= JOURS_ROUGE ? 'orange' : '';
      texte = !fin ? 'sans date' : fin === jour ? "aujourd'hui" : fin < jour ? `c'était le ${jourCourt(fin, jour)}` : `le ${jourCourt(fin, jour)}`;
    } else {
      if (fin) niveau = fin < jour || ecartJours(jour, fin) <= JOURS_ROUGE ? 'rouge' : ecartJours(jour, fin) <= JOURS_AVANT ? 'orange' : '';
      if (fin && fin < jour) texte = nature === 'periode' ? `clôturé le ${jourCourt(fin, jour)}` : `dépassée depuis le ${jourCourt(fin, jour)}`;
      else if (nature === 'periode') texte = fin ? `ouvert jusqu'au ${jourCourt(fin, jour)}` : 'ouvert';
      else texte = fin ? `avant le ${jourCourt(fin, jour)}` : 'sans date';
    }
    aFaire.push({ dateCle: dc, evenement: ev, niveau, texte });
  }
  const cle = (dc: Ligne) => lireJour(dc.fin) || lireJour(dc.debut) || '9999';
  aFaire.sort((a, b) => cle(a.dateCle).localeCompare(cle(b.dateCle)));
  plusTard.sort((a, b) => a.apparait.localeCompare(b.apparait));
  return { aFaire, plusTard };
}
