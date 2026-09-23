// Vue Planning : les pièces en lignes, les semaines en colonnes. Une pièce s'étend de son début à sa
// deadline ; dépliée, chaque étape dessine sa propre barre, de son début calculé à sa deadline.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { donnees, jour, faire } from '../../store/store';
import { piecesDe, pistesDe, etapesDePiste } from '../../logique/acces';
import { deadlineCostume, deadlinePiece, debutEtape, retardPiece } from '../../logique/planning';
import { lundi, ajouterJours, lireJour, jourCourt, ecartJours } from '../../logique/dates';
import { bool, type Ligne } from '../../modele/schema';
import { cocherEtape } from '../../store/operations';
import { Case, Feuille, Champ, ChoixDate, Vide } from '../../composants/base';
import { Icone } from '../../composants/Icone';
import { Repartir, EffacerDatesPrevues } from './editeurs';

/** Une barre du planning : de `du` à `au`, avec son état et ce qu'elle ouvre au clic. */
interface Barre { du: string; au: string; ton: string; texte: string; titre: string; ouvre?: string }

export function OngletPlanning({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const j = jour.value;
  const [repartir, setRepartir] = useState(false);
  const [ouverte, setOuverte] = useState<string | null>(null); // étape ouverte dans la feuille
  const [depliees, setDepliees] = useState<Set<string>>(new Set());
  const pieces = piecesDe(d, costume.id);
  const dl = deadlineCostume(d, costume);

  const dates: string[] = [j];
  if (dl) dates.push(dl);
  if (lireJour(costume.fin_prevue)) dates.push(lireJour(costume.fin_prevue));
  for (const p of pieces) {
    for (const x of [p.debut, p.deadline]) if (lireJour(x)) dates.push(lireJour(x));
    for (const pi of pistesDe(d, p.id)) if (lireJour(pi.deadline)) dates.push(lireJour(pi.deadline));
  }
  const debut = lundi(dates.reduce((a, b) => (a < b ? a : b)));
  const fin = dates.reduce((a, b) => (a > b ? a : b));
  const nbSemaines = Math.min(80, Math.max(1, Math.floor(ecartJours(debut, fin) / 7) + 1));
  const semaines = Array.from({ length: nbSemaines }, (_, i) => ajouterJours(debut, i * 7));
  const semaineDe = (x: string) => Math.max(0, Math.min(nbSemaines - 1, Math.floor(ecartJours(debut, x) / 7)));
  const basculer = (id: string) => { const s = new Set(depliees); if (s.has(id)) s.delete(id); else s.add(id); setDepliees(s); };

  const cases = (b: Barre | null, marqueurs?: (i: number) => ComponentChildren) => {
    const de = b ? semaineDe(b.du) : -1;
    const a = b ? semaineDe(b.au) : -2;
    return semaines.map((_, i) => {
      const dans = b && i >= de && i <= a;
      const classes = [
        semaineDe(j) === i ? 'cette-semaine' : '',
        dans ? `travee travee-${b!.ton}` : '',
        dans && i === de ? 'travee-debut' : '',
        dans && i === a ? 'travee-fin' : '',
      ].filter(Boolean).join(' ');
      return (
        <td class={classes}>
          {marqueurs?.(i)}
          {dans && (
            <button class="case-planning" title={`${b!.titre} · du ${jourCourt(b!.du)} au ${jourCourt(b!.au)}`}
              aria-label={`${b!.titre} · du ${jourCourt(b!.du)} au ${jourCourt(b!.au)}`}
              onClick={() => b!.ouvre && setOuverte(b!.ouvre)}>
              {i === de && <span class="compte-case">{b!.texte}</span>}
              {i === de && a > de && <span class="duree-case">{a - de + 1} sem.</span>}
            </button>
          )}
        </td>
      );
    });
  };

  /** Barre d'une étape : de son début calculé à sa deadline. */
  const barreEtape = (piste: Ligne, piece: Ligne): Barre | null => {
    const au = lireJour(piste.deadline);
    if (!au) return null;
    const sousEtapes = etapesDePiste(d, piste.id);
    const faites = sousEtapes.filter(e => bool(e.fait)).length;
    const du = debutEtape(d, piste) || lireJour(piece.debut) || j;
    return {
      du: du < au ? du : au, au,
      ton: sousEtapes.length && faites === sousEtapes.length ? 'faite' : au < j ? 'retard' : 'prevue',
      texte: `${faites}/${sousEtapes.length}`,
      titre: `${piece.nom} › ${piste.nom || 'Étape principale'}`,
      ouvre: piste.id,
    };
  };

  /** Barre d'une pièce : sa fenêtre, ou l'étendue de ses étapes planifiées. */
  const barrePiece = (p: Ligne): Barre | null => {
    const deadlines = pistesDe(d, p.id).map(x => lireJour(x.deadline)).filter(Boolean);
    const au = lireJour(p.deadline) || (deadlines.length ? deadlines.reduce((a, b) => (a > b ? a : b)) : '');
    if (!au) return null;
    const du = lireJour(p.debut) || j;
    const sousEtapes = pistesDe(d, p.id).flatMap(x => etapesDePiste(d, x.id));
    const faites = sousEtapes.filter(e => bool(e.fait)).length;
    return {
      du: du < au ? du : au, au,
      ton: sousEtapes.length && faites === sousEtapes.length ? 'faite' : au < j ? 'retard' : 'prevue',
      texte: `${faites}/${sousEtapes.length}`,
      titre: p.nom,
    };
  };

  if (!pieces.some(p => p.debut || p.deadline || pistesDe(d, p.id).some(x => x.deadline))) {
    // La feuille reste HORS du bloc « Vide », qui centre son contenu.
    return (
      <section>
        <Vide icone="tableau" titre="Rien de planifié">
          <p>Donne une deadline au costume, puis « Répartir les étapes » pose la fenêtre de chaque pièce et la deadline de chaque étape.</p>
          {dl && <button class="bouton principal" onClick={() => setRepartir(true)}>Répartir les étapes</button>}
        </Vide>
        {repartir && <Repartir costumeId={costume.id} onFermer={() => setRepartir(false)} />}
      </section>
    );
  }

  return (
    <section>
      <div class="barre-outils">
        {dl && <button class="bouton" onClick={() => setRepartir(true)}>Répartir les étapes</button>}
        <EffacerDatesPrevues costumeId={costume.id} />
        <span class="petit-texte">Chaque barre va du début à la deadline. Déplie une pièce pour voir ses étapes, clique une barre d'étape pour la dater ou cocher.</span>
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
              const r = retardPiece(d, p.id, j);
              const depliee = depliees.has(p.id);
              return (
                <>
                  <tr class="ligne-piece">
                    <th scope="row">
                      <div class="tete-ligne">
                        <button class="bouton-icone petit" aria-expanded={depliee} aria-label={`${depliee ? 'Replier' : 'Déplier'} ${p.nom}`}
                          onClick={() => basculer(p.id)}><Icone nom={depliee ? 'bas' : 'chevron'} taille={14} /></button>
                        <span>{p.nom}</span>
                        {r.enRetard.length > 0 && <span class="en-retard petit-texte"> · {r.enRetard.length} en retard</span>}
                      </div>
                    </th>
                    {cases(depliee ? null : barrePiece(p), i => <>
                      {lireJour(p.debut) && semaineDe(lireJour(p.debut)) === i && <span class="marqueur" title={`Début · ${jourCourt(p.debut)}`}>▶</span>}
                      {lireJour(p.deadline) && semaineDe(lireJour(p.deadline)) === i && <span class="marqueur rouge" title={`Deadline · ${jourCourt(p.deadline)}`}>⚑</span>}
                    </>)}
                  </tr>
                  {depliee && pistesDe(d, p.id).map(pi => (
                    <tr class="ligne-piste">
                      <th scope="row"><div class="tete-ligne"><span class="nom-piste">{pi.nom || 'Étape principale'}</span></div></th>
                      {cases(barreEtape(pi, p))}
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
      {repartir && <Repartir costumeId={costume.id} onFermer={() => setRepartir(false)} />}
      {ouverte && <EtapeOuverte id={ouverte} onFermer={() => setOuverte(null)} />}
    </section>
  );
}

/** Une étape depuis le planning : sa deadline, et ses sous-étapes à cocher. */
function EtapeOuverte({ id, onFermer }: { id: string; onFermer: () => void }) {
  const d = donnees.value;
  const j = jour.value;
  const piste = d.Pistes[id];
  if (!piste) return null;
  const piece = d.Pieces[piste.piece_id];
  const du = debutEtape(d, piste) || lireJour(piece?.debut) || '';
  const limitePiece = piece ? deadlinePiece(d, piece) : '';
  const dater = (v: string) => faire([{ table: 'Pistes', id, champs: { deadline: v } }], 'Deadline modifiée');
  return (
    <Feuille titre={piste.nom || 'Étape principale'} onFermer={onFermer} pied={<button class="bouton principal" onClick={onFermer}>Terminé</button>}>
      <p class="petit-texte">{piece?.nom}{du ? ` · commence le ${jourCourt(du)}` : ''}</p>
      <Champ label="Deadline de l'étape" aide={limitePiece ? `La pièce est attendue pour le ${jourCourt(limitePiece)}` : undefined}>
        <ChoixDate label={`deadline de ${piste.nom || 'étape'}`} valeur={piste.deadline ?? ''} min={du || undefined} onChange={dater} />
      </Champ>
      <div class="ligne-actions">
        <button class="bouton" onClick={() => dater(ajouterJours(lireJour(piste.deadline) || j, -7))}><Icone nom="retour" taille={16} />Une semaine plus tôt</button>
        <button class="bouton" onClick={() => dater(ajouterJours(lireJour(piste.deadline) || j, 7))}>Une semaine plus tard<Icone nom="chevron" taille={16} /></button>
      </div>
      <ul class="etapes">
        {etapesDePiste(d, id).map(e => (
          <li class="etape">
            <Case coche={bool(e.fait)} label={e.titre} onChange={v => faire(cocherEtape(d, e.id, v, j), v ? `« ${e.titre} » cochée` : `« ${e.titre} » décochée`)} />
            <div class="etape-texte">
              <span class="etape-titre">{e.titre}</span>
              <span class="etape-meta">{e.duree && e.duree !== 'normal' && <span>{e.duree}</span>}</span>
            </div>
          </li>
        ))}
      </ul>
    </Feuille>
  );
}
