// Vue Planning : les pièces en lignes, les semaines en colonnes (dans l'esprit d'une grille de planning à la main).
import { useState } from 'preact/hooks';
import { donnees, jour } from '../../store/store';
import { piecesDe, etapesDePiece } from '../../logique/acces';
import { deadlineCostume, retard } from '../../logique/planning';
import { lundi, ajouterJours, lireJour, jourCourt, ecartJours } from '../../logique/dates';
import { bool, type Ligne } from '../../modele/schema';
import { Vide } from '../../composants/base';
import { Repartir } from './editeurs';

export function OngletPlanning({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const j = jour.value;
  const [repartir, setRepartir] = useState(false);
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

  if (dates.length === 1) {
    return (
      <Vide icone="tableau" titre="Rien de planifié">
        <p>Donne une deadline au costume (ou à une pièce), puis « Répartir » place les sous-étapes dans le temps. Tu peux aussi dater chaque sous-étape à la main.</p>
        {dl && <button class="bouton principal" onClick={() => setRepartir(true)}>Répartir</button>}
      </Vide>
    );
  }

  return (
    <section>
      <div class="barre-outils">
        {dl && <button class="bouton" onClick={() => setRepartir(true)}>Répartir jusqu'au {jourCourt(dl)}</button>}
        <span class="petit-texte">Chaque case : sous-étapes prévues cette semaine (faites / prévues). ⚑ deadline · ▶ début</span>
      </div>
      <div class="planning-defile">
        <table class="planning">
          <thead>
            <tr>
              <th scope="col">Pièce</th>
              {semaines.map((s, i) => (
                <th scope="col" class={`${semaineDe(j) === i ? 'cette-semaine' : ''}${dl && semaineDe(dl) === i ? ' semaine-deadline' : ''}`}>
                  {jourCourt(s)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pieces.map(p => {
              const etapes = etapesDePiece(d, p.id);
              const r = retard(etapes, j);
              return (
                <tr>
                  <th scope="row">
                    <span>{p.nom}</span>
                    {r.enRetard.length > 0 && <span class="en-retard petit-texte"> · {r.enRetard.length} en retard</span>}
                  </th>
                  {semaines.map((_, i) => {
                    const cette = etapes.filter(e => lireJour(e.date_prevue) && semaineDe(lireJour(e.date_prevue)) === i);
                    const faites = cette.filter(e => bool(e.fait)).length;
                    const dlP = lireJour(p.deadline) && semaineDe(lireJour(p.deadline)) === i;
                    const deb = lireJour(p.debut) && semaineDe(lireJour(p.debut)) === i;
                    const titre = cette.map(e => `${bool(e.fait) ? '✓' : '○'} ${e.titre}`).join('\n');
                    return (
                      <td class={`${cette.length ? (faites === cette.length ? 'case-faite' : 'case-prevue') : ''}${semaineDe(j) === i ? ' cette-semaine' : ''}`} title={titre}>
                        {deb && <span class="marqueur">▶</span>}
                        {cette.length > 0 && <span>{faites}/{cette.length}</span>}
                        {dlP && <span class="marqueur rouge">⚑</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {repartir && <Repartir costumeId={costume.id} onFermer={() => setRepartir(false)} />}
    </section>
  );
}
