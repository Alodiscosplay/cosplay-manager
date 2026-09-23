import { useState } from 'preact/hooks';
import { donnees, jour, faire } from '../store/store';
import { agenda, type ElementAgenda, type TypeAgenda } from '../logique/planning';
import { costumes, couleurCostume, teinteCouleur, TEINTES, GRIS, tous } from '../logique/acces';
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
          <div class="calendrier" role="grid" aria-label={titre}>
            {JOURS_COURTS.map(x => <div class="cal-entete" role="columnheader">{x}</div>)}
            {jours.map(x => {
              const liste = duJour(x);
              const horsMois = x.slice(0, 7) !== debutMois.slice(0, 7);
              return (
                <button role="gridcell" class={`cal-jour${horsMois ? ' hors-mois' : ''}${x === j ? ' aujourdhui' : ''}${x === choisi ? ' choisi' : ''}`}
                  aria-label={`${jourCourt(x, j)}, ${liste.length} élément${liste.length > 1 ? 's' : ''}`} onClick={() => setChoisi(x)}>
                  <span class="cal-num">{Number(x.slice(8))}</span>
                  <span class="cal-points">{liste.slice(0, 4).map(i => <span class={`point ${i.type}${i.fait ? ' fait' : ''}`} style={style(i)} />)}</span>
                  <span class="cal-textes">{liste.slice(0, 2).map(i => <span class={`cal-texte ${i.type}`} style={style(i, true)} title={`${i.titre} · ${i.detail}`}>{i.titre}</span>)}{liste.length > 2 && <span class="cal-plus">+{liste.length - 2}</span>}</span>
                </button>
              );
            })}
          </div>
          <JourDetaille jourX={choisi} items={items.filter(i => i.jour === choisi)} ouvrirEvenement={setEvenement} couleur={i => style(i)} />
        </>
      ) : (
        <div class="semaine">
          {jours.map(x => <JourDetaille jourX={x} items={duJour(x)} ouvrirEvenement={setEvenement} compact couleur={i => style(i)} />)}
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

function JourDetaille({ jourX, items, ouvrirEvenement, compact, couleur }: {
  jourX: string; items: ElementAgenda[]; ouvrirEvenement: (id: string) => void; compact?: boolean;
  couleur?: (i: ElementAgenda) => Record<string, string> | undefined;
}) {
  const j = jour.value;
  const nomJour = JOURS_COURTS[(versDate(jourX).getDay() + 6) % 7];
  return (
    <section class={`jour-detaille${compact ? ' compact' : ''}${jourX === j ? ' aujourdhui' : ''}`}>
      <h3>{nomJour} {jourCourt(jourX, j)}</h3>
      {!items.length ? <p class="petit-texte">{compact ? '—' : 'Rien ce jour-là.'}</p> : (
        <ul>
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
