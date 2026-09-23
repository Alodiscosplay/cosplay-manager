// Vue Planning : les pièces en lignes, les semaines en colonnes (dans l'esprit d'une grille de planning
// à la main). Une pièce se déplie en ses étapes, et chaque case s'ouvre pour cocher ou redater.
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

  /** Le contenu d'une case : les sous-étapes de cette semaine, en toutes lettres ou en compte. */
  const contenuCase = (etapes: Ligne[], i: number, titre: string, detaille: boolean) => {
    const cette = etapes.filter(e => lireJour(e.date_prevue) && semaineDe(lireJour(e.date_prevue)) === i);
    if (!cette.length) return { classe: '', contenu: null };
    const faites = cette.filter(e => bool(e.fait)).length;
    const enRetard = cette.some(e => !bool(e.fait) && lireJour(e.date_prevue) < j);
    return {
      classe: faites === cette.length ? 'case-faite' : enRetard ? 'case-retard' : 'case-prevue',
      contenu: (
        <button class="case-planning" onClick={() => setOuvert({ titre, semaine: semaines[i], ids: cette.map(e => e.id) })}
          aria-label={`${cette.length} sous-étape${cette.length > 1 ? 's' : ''} · ${titre} · semaine du ${jourCourt(semaines[i])}`}>
          {detaille
            ? cette.map(e => <span class={`puce-etape${bool(e.fait) ? ' faite' : ''}`}>{bool(e.fait) ? '✓ ' : ''}{e.titre}</span>)
            : <span class="compte-case">{faites}/{cette.length}</span>}
        </button>
      ),
    };
  };

  return (
    <section>
      <div class="barre-outils">
        {dl && <button class="bouton" onClick={() => setRepartir(true)}>Répartir les étapes</button>}
        <EffacerDatesPrevues costumeId={costume.id} />
        <span class="petit-texte">Clique une case pour cocher ou redater ses sous-étapes. ⚑ deadline · ▶ début</span>
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
                    {semaines.map((_, i) => {
                      const c = depliee ? { classe: '', contenu: null } : contenuCase(etapes, i, p.nom, false);
                      return (
                        <td class={`${c.classe} ${semaineDe(j) === i ? 'cette-semaine' : ''}`}>
                          {lireJour(p.debut) && semaineDe(lireJour(p.debut)) === i && <span class="marqueur" title={`Début · ${jourCourt(p.debut)}`}>▶</span>}
                          {c.contenu}
                          {lireJour(p.deadline) && semaineDe(lireJour(p.deadline)) === i && <span class="marqueur rouge" title={`Deadline · ${jourCourt(p.deadline)}`}>⚑</span>}
                        </td>
                      );
                    })}
                  </tr>
                  {depliee && pistes.map(pi => (
                    <tr class="ligne-piste">
                      <th scope="row"><span class="nom-piste">{pi.nom || 'Étape principale'}</span></th>
                      {semaines.map((_, i) => {
                        const c = contenuCase(etapesDePiste(d, pi.id), i, `${p.nom} › ${pi.nom || 'Étape principale'}`, true);
                        return <td class={`${c.classe} ${semaineDe(j) === i ? 'cette-semaine' : ''}`}>{c.contenu}</td>;
                      })}
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
