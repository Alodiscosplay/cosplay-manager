// Vue Planning : les pièces en lignes, les semaines en colonnes (dans l'esprit d'une grille de planning
// à la main). Une pièce se déplie en ses étapes, et chaque case s'ouvre pour cocher ou redater.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { donnees, jour, faire } from '../../store/store';
import { piecesDe, pistesDe, etapesDePiece, etapesDePiste } from '../../logique/acces';
import { deadlineCostume, retard } from '../../logique/planning';
import { lundi, ajouterJours, lireJour, jourCourt, ecartJours } from '../../logique/dates';
import { bool, type Ligne } from '../../modele/schema';
import { cocherEtape } from '../../store/operations';
import { Case, Feuille, ChoixDate, Vide } from '../../composants/base';
import { Icone } from '../../composants/Icone';
import { Repartir, EffacerDatesPrevues } from './editeurs';

/** Semaine ouverte dans la feuille : quelles sous-étapes, et sous quel titre. */
interface Ouvert { titre: string; semaine: string; ids: string[] }

export function OngletPlanning({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const j = jour.value;
  const [repartir, setRepartir] = useState(false);
  const [ouvert, setOuvert] = useState<Ouvert | null>(null);
  const [depliees, setDepliees] = useState<Set<string>>(new Set());
  const pieces = piecesDe(d, costume.id);
  const dl = deadlineCostume(d, costume);

  const dates: string[] = [j];
  if (dl) dates.push(dl);
  for (const p of pieces) {
    for (const x of [p.debut, p.deadline]) if (lireJour(x)) dates.push(lireJour(x));
    for (const e of etapesDePiece(d, p.id)) for (const x of [e.date_prevue, e.deadline]) if (lireJour(x)) dates.push(lireJour(x));
  }
  const debut = lundi(dates.reduce((a, b) => (a < b ? a : b)));
  const fin = dates.reduce((a, b) => (a > b ? a : b));
  const nbSemaines = Math.min(52, Math.max(1, Math.floor(ecartJours(debut, fin) / 7) + 1));
  const semaines = Array.from({ length: nbSemaines }, (_, i) => ajouterJours(debut, i * 7));
  const semaineDe = (x: string) => Math.floor(ecartJours(debut, x) / 7);
  const basculer = (id: string) => { const s = new Set(depliees); if (s.has(id)) s.delete(id); else s.add(id); setDepliees(s); };

  if (dates.length === 1) {
    return (
      <Vide icone="tableau" titre="Rien de planifié">
        <p>Donne une deadline au costume (ou à une pièce), puis « Répartir » place les sous-étapes dans le temps. Tu peux aussi dater chaque sous-étape à la main.</p>
        {dl && <button class="bouton principal" onClick={() => setRepartir(true)}>Répartir les étapes</button>}
      </Vide>
    );
  }

  /**
   * Une barre par ligne : elle s'étend de la première à la dernière semaine planifiée, pour montrer
   * la DURÉE. Chaque case reste cliquable ; le détail des sous-étapes s'ouvre dans la feuille.
   */
  const barre = (etapes: Ligne[], titre: string) => {
    const datees = etapes.filter(e => lireJour(e.date_prevue));
    if (!datees.length) return null;
    const semainesOccupees = datees.map(e => semaineDe(lireJour(e.date_prevue)));
    const de = Math.min(...semainesOccupees);
    const a = Math.max(...semainesOccupees);
    const faites = datees.filter(e => bool(e.fait)).length;
    const enRetard = datees.some(e => !bool(e.fait) && lireJour(e.date_prevue) < j);
    const ton = faites === datees.length ? 'faite' : enRetard ? 'retard' : 'prevue';
    return {
      de, a, ton, titre, ids: datees.map(e => e.id),
      texte: `${faites}/${datees.length}`,
      semaines: a - de + 1,
      deLaSemaine: (i: number) => datees.filter(e => semaineDe(lireJour(e.date_prevue)) === i).map(e => e.id),
    };
  };

  /** Les cases d'une ligne, avec la barre posée dessus. */
  const cases = (b: ReturnType<typeof barre>, marqueurs?: (i: number) => ComponentChildren) =>
    semaines.map((_, i) => {
      const dans = b && i >= b.de && i <= b.a;
      const classes = [
        semaineDe(j) === i ? 'cette-semaine' : '',
        dans ? `travee travee-${b!.ton}` : '',
        dans && i === b!.de ? 'travee-debut' : '',
        dans && i === b!.a ? 'travee-fin' : '',
      ].filter(Boolean).join(' ');
      return (
        <td class={classes}>
          {marqueurs?.(i)}
          {dans && (
            <button class="case-planning" title={`${b!.titre} · semaine du ${jourCourt(semaines[i])}`}
              aria-label={`${b!.titre} · semaine du ${jourCourt(semaines[i])} · ${b!.texte} sous-étapes faites`}
              onClick={() => setOuvert({ titre: b!.titre, semaine: semaines[i], ids: b!.deLaSemaine(i).length ? b!.deLaSemaine(i) : b!.ids })}>
              {i === b!.de && <span class="compte-case">{b!.texte}</span>}
              {i === b!.de && b!.semaines > 1 && <span class="duree-case">{b!.semaines} sem.</span>}
            </button>
          )}
        </td>
      );
    });

  return (
    <section>
      <div class="barre-outils">
        {dl && <button class="bouton" onClick={() => setRepartir(true)}>Répartir les étapes</button>}
        <EffacerDatesPrevues costumeId={costume.id} />
        <span class="petit-texte">Chaque barre court de la première à la dernière semaine planifiée. Clique dessus pour cocher ou redater. ⚑ deadline · ▶ début</span>
      </div>
      <div class="planning-defile">
        <table class="planning">
          <thead>
            <tr>
              <th scope="col">Pièce</th>
              {semaines.map((s, i) => (
                <th scope="col" class={`${semaineDe(j) === i ? 'cette-semaine' : ''}${dl && semaineDe(dl) === i ? ' semaine-deadline' : ''}`}>
                  {semaineDe(j) === i ? 'cette sem.' : jourCourt(s)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pieces.map(p => {
              const etapes = etapesDePiece(d, p.id);
              const r = retard(etapes, j);
              const pistes = pistesDe(d, p.id);
              const depliee = depliees.has(p.id);
              return (
                <>
                  <tr class="ligne-piece">
                    <th scope="row">
                      <button class="bouton-icone petit" aria-expanded={depliee} aria-label={`${depliee ? 'Replier' : 'Déplier'} ${p.nom}`}
                        onClick={() => basculer(p.id)}><Icone nom={depliee ? 'bas' : 'chevron'} taille={14} /></button>
                      <span>{p.nom}</span>
                      {r.enRetard.length > 0 && <span class="en-retard petit-texte"> · {r.enRetard.length} en retard</span>}
                    </th>
                    {cases(depliee ? null : barre(etapes, p.nom), i => <>
                      {lireJour(p.debut) && semaineDe(lireJour(p.debut)) === i && <span class="marqueur" title={`Début · ${jourCourt(p.debut)}`}>▶</span>}
                      {lireJour(p.deadline) && semaineDe(lireJour(p.deadline)) === i && <span class="marqueur rouge" title={`Deadline · ${jourCourt(p.deadline)}`}>⚑</span>}
                    </>)}
                  </tr>
                  {depliee && pistes.map(pi => (
                    <tr class="ligne-piste">
                      <th scope="row"><span class="nom-piste">{pi.nom || 'Étape principale'}</span></th>
                      {cases(barre(etapesDePiste(d, pi.id), `${p.nom} › ${pi.nom || 'Étape principale'}`))}
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
      {repartir && <Repartir costumeId={costume.id} onFermer={() => setRepartir(false)} />}
      {ouvert && <SemaineOuverte o={ouvert} onFermer={() => setOuvert(null)} />}
    </section>
  );
}

/** Les sous-étapes d'une case : cocher, décaler d'une semaine, ou changer la date. */
function SemaineOuverte({ o, onFermer }: { o: Ouvert; onFermer: () => void }) {
  const d = donnees.value;
  const j = jour.value;
  const etapes = o.ids.map(id => d.Etapes[id]).filter(Boolean);
  const dater = (e: Ligne, date: string) => faire([{ table: 'Etapes', id: e.id, champs: { date_prevue: date } }], `« ${e.titre} » déplacée`);
  return (
    <Feuille titre={`Semaine du ${jourCourt(o.semaine)}`} onFermer={onFermer} pied={<button class="bouton principal" onClick={onFermer}>Terminé</button>}>
      <p class="petit-texte">{o.titre}</p>
      <ul class="etapes">
        {etapes.map(e => {
          const prevue = lireJour(e.date_prevue);
          return (
            <li class="etape">
              <Case coche={bool(e.fait)} label={e.titre} onChange={v => faire(cocherEtape(d, e.id, v, j), v ? `« ${e.titre} » cochée` : `« ${e.titre} » décochée`)} />
              <div class="etape-texte">
                <span class="etape-titre">{e.titre}</span>
                <span class="etape-meta">
                  {e.duree && e.duree !== 'normal' && <span>{e.duree}</span>}
                  {prevue && !bool(e.fait) && prevue < j && <span class="en-retard">en retard</span>}
                </span>
              </div>
              <div class="decalage">
                <button class="bouton-icone petit" aria-label={`Reculer « ${e.titre} » d'une semaine`} title="Une semaine plus tôt"
                  onClick={() => dater(e, ajouterJours(prevue || j, -7))}><Icone nom="retour" taille={16} /></button>
                <ChoixDate label={`date prévue de ${e.titre}`} valeur={e.date_prevue ?? ''} onChange={v => dater(e, v)} />
                <button class="bouton-icone petit" aria-label={`Avancer « ${e.titre} » d'une semaine`} title="Une semaine plus tard"
                  onClick={() => dater(e, ajouterJours(prevue || j, 7))}><Icone nom="chevron" taille={16} /></button>
              </div>
            </li>
          );
        })}
      </ul>
    </Feuille>
  );
}
