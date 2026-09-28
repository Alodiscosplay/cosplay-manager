import { useState } from 'preact/hooks';
import { donnees, jour, faire } from '../store/store';
import { agenda, fenetresPieces, traveesSemaine, type ElementAgenda, type FenetrePiece, type TypeAgenda } from '../logique/planning';
import { costumes, couleurCostume, teinteCouleur, TEINTES, GRIS, tous } from '../logique/acces';
import { bool } from '../modele/schema';
import { lundi, ajouterJours, versDate, MOIS, JOURS_COURTS, jourCourt, lireJour } from '../logique/dates';
import { Feuille, Selection } from '../composants/base';
import { Icone } from '../composants/Icone';
import { IndicateurSync } from '../app';
import { lienCostume } from '../routeur';
import { EditeurEvenement } from './Costume';

const LIBELLES: Record<TypeAgenda, string> = { evenement: 'Événement', deadline: 'Deadline', tache: 'Tâche' };
const CLE_VUE = 'cosplay-planner.vue-agenda';

export function PageAgenda() {
  const d = donnees.value;
  const j = jour.value;
  const [vue, setVueEtat] = useState<'mois' | 'semaine'>(() => { try { return (localStorage.getItem(CLE_VUE) as 'mois') || 'mois'; } catch { return 'mois'; } });
  const [ancre, setAncre] = useState(j);
  const [choisi, setChoisi] = useState(j);
  const [filtre, setFiltre] = useState('');
  const [evenement, setEvenement] = useState<string | 'nouveau' | null>(null);
  const [couleurDe, setCouleurDe] = useState<string | null>(null); // costume dont on choisit la couleur
  const setVue = (v: 'mois' | 'semaine') => { setVueEtat(v); try { localStorage.setItem(CLE_VUE, v); } catch { /* ignoré */ } };

  const debutMois = `${ancre.slice(0, 7)}-01`;
  const debutGrille = vue === 'mois' ? lundi(debutMois) : lundi(ancre);
  const nbJours = vue === 'mois' ? 42 : 7;
  const jours = Array.from({ length: nbJours }, (_, i) => ajouterJours(debutGrille, i));
  const items = agenda(d, jours[0], jours[jours.length - 1], filtre || undefined);
  // couleur par costume, dans l'ordre d'affichage des costumes
  const tous_costumes = costumes(d).filter(c => c.statut !== 'archivé');
  const couleurs = new Map(tous_costumes.map((c, i) => [c.id, couleurCostume(c, i)]));
  const style = (i: ElementAgenda, fond = false): Record<string, string> | undefined => {
    const c = i.costumeId ? couleurs.get(i.costumeId) : undefined;
    if (!c) return undefined;
    // le texte se mélange à l'encre du thème : lisible en clair comme en sombre
    return fond
      ? { background: `color-mix(in srgb, ${c} 18%, var(--surface))`, color: `color-mix(in srgb, ${c} 55%, var(--encre))` }
      : { background: c };
  };
  const duJour = (x: string) => items.filter(i => i.jour === x);
  // Les pièces s'étirent sur leur durée ; leurs deadlines ne sont donc plus des puces à part.
  const fenetres = fenetresPieces(d, jours[0], jours[jours.length - 1], filtre || undefined);
  const pucesDuJour = (x: string) => duJour(x).filter(i => i.ref.table !== 'Pieces');
  const piecesDuJour = (x: string) => fenetres.filter(f => f.debut <= x && f.fin >= x);
  const semainesGrille = Array.from({ length: nbJours / 7 }, (_, i) => jours[i * 7]);

  const naviguer = (sens: -1 | 1) => {
    if (vue === 'semaine') { setAncre(ajouterJours(ancre, 7 * sens)); return; }
    const dt = versDate(debutMois);
    dt.setMonth(dt.getMonth() + sens);
    setAncre(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-01`);
  };
  const titre = vue === 'mois'
    ? `${MOIS[Number(debutMois.slice(5, 7)) - 1]} ${debutMois.slice(0, 4)}`
    : `Semaine du ${jourCourt(jours[0], j)}`;

  return (
    <div class="page">
      <header class="page-tete">
        <h1>Agenda</h1>
        <IndicateurSync />
        <button class="bouton" onClick={() => setEvenement('nouveau')}><Icone nom="plus" />Événement</button>
      </header>
      <div class="barre-outils">
        <div class="segments" role="group" aria-label="Vue">
          <button class={vue === 'mois' ? 'actif' : ''} aria-pressed={vue === 'mois'} onClick={() => setVue('mois')}>Mois</button>
          <button class={vue === 'semaine' ? 'actif' : ''} aria-pressed={vue === 'semaine'} onClick={() => setVue('semaine')}>Semaine</button>
        </div>
        <Selection label="Filtrer par costume" valeur={filtre} options={[['', 'Tous les costumes'], ...costumes(d).filter(c => c.statut !== 'archivé').map(c => [c.id, c.nom] as [string, string])]} onChange={setFiltre} />
      </div>
      <div class="agenda-nav">
        <button class="bouton-icone" aria-label="Précédent" onClick={() => naviguer(-1)}><Icone nom="retour" /></button>
        <h2>{titre}</h2>
        <button class="bouton-icone" aria-label="Suivant" onClick={() => naviguer(1)}><Icone nom="chevron" /></button>
        <button class="bouton petit" onClick={() => { setAncre(j); setChoisi(j); }}>Aujourd'hui</button>
      </div>

      {vue === 'mois' ? (
        <>
          <div class="calendrier-mois" aria-label={titre}>
            <div class="cal-entetes">{JOURS_COURTS.map(x => <div class="cal-entete">{x}</div>)}</div>
            {semainesGrille.map(l => (
              <SemaineAgenda lundiS={l} jourJ={j} choisi={choisi} moisCourant={debutMois.slice(0, 7)} fenetres={fenetres}
                puces={pucesDuJour} style={style} couleurs={couleurs} onChoisir={setChoisi} />
            ))}
          </div>
          <JourDetaille jourX={choisi} items={pucesDuJour(choisi)} pieces={piecesDuJour(choisi)} couleurs={couleurs}
            ouvrirEvenement={setEvenement} couleur={i => style(i)} />
        </>
      ) : (
        <div class="semaine">
          <div class="calendrier-mois grand">
            <div class="cal-entetes">{JOURS_COURTS.map(x => <div class="cal-entete">{x}</div>)}</div>
            <SemaineAgenda lundiS={jours[0]} jourJ={j} choisi={choisi} fenetres={fenetres}
              puces={pucesDuJour} style={style} couleurs={couleurs} onChoisir={setChoisi} />
          </div>
          {jours.map(x => <JourDetaille jourX={x} items={pucesDuJour(x)} pieces={piecesDuJour(x)} couleurs={couleurs}
            ouvrirEvenement={setEvenement} compact couleur={i => style(i)} />)}
        </div>
      )}

      <p class="legende-agenda">
        <span><span class="point evenement" />Événement</span>
        {tous_costumes.map((c, i) => (
          <button class="legende-costume" title="Changer la couleur du projet" onClick={() => setCouleurDe(c.id)}>
            <span class="point" style={{ background: couleurCostume(c, i) }} />{c.nom}
          </button>
        ))}
      </p>

      <section class="groupe">
        <h2 class="groupe-titre">Événements</h2>
        <ul class="liste-simple">
          {tous(d, 'Evenements').sort((a, b) => (a.date_debut || '').localeCompare(b.date_debut || '')).map(e => (
            <li><button class="lien-bouton" onClick={() => setEvenement(e.id)}>{e.nom}</button> <span class="petit-texte">{e.date_debut ? jourCourt(lireJour(e.date_debut), j) : 'sans date'}{e.lieu ? ` · ${e.lieu}` : ''}</span></li>
          ))}
        </ul>
      </section>

      {evenement && <EditeurEvenement id={evenement === 'nouveau' ? undefined : evenement} onFermer={() => setEvenement(null)} />}
      {couleurDe && <ChoixCouleur id={couleurDe} rang={tous_costumes.findIndex(c => c.id === couleurDe)} onFermer={() => setCouleurDe(null)} />}
    </div>
  );
}

function JourDetaille({ jourX, items, pieces = [], couleurs, ouvrirEvenement, compact, couleur }: {
  jourX: string; items: ElementAgenda[]; pieces?: FenetrePiece[]; couleurs?: Map<string, string>;
  ouvrirEvenement: (id: string) => void; compact?: boolean;
  couleur?: (i: ElementAgenda) => Record<string, string> | undefined;
}) {
  const j = jour.value;
  const nomJour = JOURS_COURTS[(versDate(jourX).getDay() + 6) % 7];
  return (
    <section class={`jour-detaille${compact ? ' compact' : ''}${jourX === j ? ' aujourdhui' : ''}`}>
      <h3>{nomJour} {jourCourt(jourX, j)}</h3>
      {!items.length && !pieces.length ? <p class="petit-texte">{compact ? '—' : 'Rien ce jour-là.'}</p> : (
        <ul>
          {pieces.map(f => (
            <li class={`item-agenda piece${f.faite ? ' fait' : ''}`}>
              <span class="point" style={{ background: couleurs?.get(f.costume.id) }} />
              <a href={lienCostume(f.costume.id, bool(f.costume.suivi_planning) ? 'planning' : 'pieces')}>{f.costume.nom} — {f.piece.nom}</a>
              <span class="petit-texte"> · {f.fin === jourX ? 'deadline de la pièce' : `jusqu’au ${jourCourt(f.fin, j)}`}{f.faite ? ' · faite' : ''}</span>
            </li>
          ))}
          {items.map(i => (
            <li class={`item-agenda ${i.type}${i.fait ? ' fait' : ''}`}>
              <span class={`point ${i.type}`} style={couleur?.(i)} />
              {i.type === 'evenement'
                ? <button class="lien-bouton" onClick={() => ouvrirEvenement(i.ref.id)}>{i.titre}</button>
                : i.costumeId ? <a href={lienCostume(i.costumeId)}>{i.titre}</a> : <a href="#/afaire">{i.titre}</a>}
              <span class="petit-texte"> · {LIBELLES[i.type]}{i.detail ? ` · ${i.detail}` : ''}{i.fait ? ' · fait' : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** La couleur d'un projet, choisie depuis la légende de l'agenda. */
function ChoixCouleur({ id, rang, onFermer }: { id: string; rang: number; onFermer: () => void }) {
  const c = donnees.value.Costumes[id];
  if (!c) return null;
  const choisie = (c.couleur ?? '').trim();
  const poser = (v: string) => faire([{ table: 'Costumes', id, champs: { couleur: v } }]);
  return (
    <Feuille titre={`Couleur de « ${c.nom} »`} onFermer={onFermer} pied={<button class="bouton principal" onClick={onFermer}>Terminé</button>}>
      <div class="choix-couleur">
        <button type="button" class={`pastille-couleur${choisie === '' ? ' actif' : ''}`} title="Automatique"
          aria-label="Couleur automatique" aria-pressed={choisie === ''} onClick={() => poser('')}>auto</button>
        {[...TEINTES.map(String), GRIS].map(t => (
          <button type="button" class={`pastille-couleur${t === choisie ? ' actif' : ''}`} style={{ background: teinteCouleur(t) }}
            aria-pressed={t === choisie} aria-label={t === GRIS ? 'Gris' : `Teinte ${t}`} title={t === GRIS ? 'Gris' : undefined}
            onClick={() => poser(t)} />
        ))}
      </div>
      <p class="petit-texte">Aperçu : <span class="cal-texte" style={{ background: `color-mix(in srgb, ${couleurCostume(c, rang)} 18%, var(--surface))`, color: `color-mix(in srgb, ${couleurCostume(c, rang)} 55%, var(--encre))` }}>{c.nom} — deadline</span></p>
    </Feuille>
  );
}

/**
 * Une semaine de l'agenda : sept jours cliquables, et par-dessus les pièces en cours, chacune en barre
 * de son début à sa deadline, à la couleur de son projet.
 */
function SemaineAgenda({ lundiS, jourJ, choisi, moisCourant, fenetres, puces, style, couleurs, onChoisir }: {
  lundiS: string; jourJ: string; choisi: string; moisCourant?: string; fenetres: FenetrePiece[];
  puces: (x: string) => ElementAgenda[]; style: (i: ElementAgenda, fond?: boolean) => Record<string, string> | undefined;
  couleurs: Map<string, string>; onChoisir: (x: string) => void;
}) {
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(lundiS, i));
  const travees = traveesSemaine(fenetres, lundiS);
  const n = travees.reduce((m, t) => Math.max(m, t.ligne + 1), 0);
  return (
    <div class="cal-semaine" style={{ gridTemplateRows: `var(--haut-num) repeat(${n}, var(--haut-barre)) minmax(var(--haut-bas), auto)` }}>
      {jours.map((x, i) => {
        const liste = puces(x);
        const horsMois = moisCourant ? x.slice(0, 7) !== moisCourant : false;
        return (
          <button class={`cal-jour${horsMois ? ' hors-mois' : ''}${x === jourJ ? ' aujourdhui' : ''}${x === choisi ? ' choisi' : ''}`}
            style={{ gridColumn: `${i + 1}`, gridRow: '1 / -1' }}
            aria-label={`${jourCourt(x, jourJ)}, ${liste.length} élément${liste.length > 1 ? 's' : ''}`} onClick={() => onChoisir(x)}>
            <span class="cal-num">{Number(x.slice(8))}</span>
            <span class="cal-espace" style={{ height: `calc(${n} * (var(--haut-barre) + 2px))` }} />
            <span class="cal-points">{liste.slice(0, 4).map(it => <span class={`point ${it.type}${it.fait ? ' fait' : ''}`} style={style(it)} />)}</span>
            <span class="cal-textes">{liste.slice(0, 2).map(it => <span class={`cal-texte ${it.type}`} style={style(it, true)} title={`${it.titre} · ${it.detail}`}>{it.titre}</span>)}{liste.length > 2 && <span class="cal-plus">+{liste.length - 2}</span>}</span>
          </button>
        );
      })}
      {travees.map(t => {
        const c = couleurs.get(t.fenetre.costume.id) ?? 'var(--accent)';
        const f = t.fenetre;
        return (
          <a class={`cal-barre${t.ouvre ? ' ouvre' : ''}${t.ferme ? ' ferme' : ''}${f.faite ? ' faite' : ''}`}
            href={lienCostume(f.costume.id, bool(f.costume.suivi_planning) ? 'planning' : 'pieces')}
            style={{ gridColumn: `${t.de + 1} / ${t.a + 2}`, gridRow: `${t.ligne + 2}`,
              background: `color-mix(in srgb, ${c} 28%, var(--surface))`, color: `color-mix(in srgb, ${c} 60%, var(--encre))`, borderColor: c }}
            title={`${f.costume.nom} — ${f.piece.nom} · du ${jourCourt(f.debut, jourJ)} au ${jourCourt(f.fin, jourJ)}`}>
            <span class="cal-barre-texte">{f.costume.nom} — {f.piece.nom}</span>
            {t.ferme && !f.faite && <span class="cal-barre-fin" aria-hidden="true">⚑</span>}
          </a>
        );
      })}
    </div>
  );
}
