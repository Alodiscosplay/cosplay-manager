// Changer l'ordre d'une liste dans une fenêtre à part, où ne figurent que les noms : plus simple que de
// glisser des cartes pleines d'étapes, et sans risque de déplacer quelque chose par erreur.
import { useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { annulerDeplacementDom } from './glisser';
import { Feuille } from './base';
import { Icone } from './Icone';

export interface ElementOrdre { id: string; nom: string; detail?: string }

/**
 * La liste se réordonne en glissant la poignée, ou avec les flèches (plus précises au téléphone).
 * Chaque changement est enregistré aussitôt par `onOrdre`, avec les ids dans le nouvel ordre.
 */
export function FeuilleOrdre({ titre, aide, elements, onOrdre, onFermer }: {
  titre: string; aide?: string; elements: ElementOrdre[]; onOrdre: (ids: string[]) => void; onFermer: () => void;
}) {
  const [ordre, setOrdre] = useState(() => elements.map(e => e.id));
  const liste = useRef<HTMLOListElement>(null);
  const actuel = useRef(ordre);
  actuel.current = ordre;
  const poser = (ids: string[]) => { setOrdre(ids); onOrdre(ids); };
  const deplacer = (de: number, vers: number) => {
    if (vers < 0 || vers >= ordre.length || de === vers) return;
    const ids = [...ordre];
    const [x] = ids.splice(de, 1);
    ids.splice(vers, 0, x);
    poser(ids);
  };
  useEffect(() => {
    if (!liste.current) return;
    const s = Sortable.create(liste.current, {
      handle: '.poignee', animation: 150,
      onEnd: evt => {
        annulerDeplacementDom(evt);
        if (evt.oldIndex === evt.newIndex) return;
        const ids = [...actuel.current];
        const [x] = ids.splice(evt.oldIndex!, 1);
        ids.splice(evt.newIndex!, 0, x);
        poser(ids);
      },
    });
    return () => s.destroy();
  }, []);
  const parId = new Map(elements.map(e => [e.id, e]));
  return (
    <Feuille titre={titre} onFermer={onFermer} pied={<button class="bouton principal" onClick={onFermer}>Terminé</button>}>
      {aide && <p class="petit-texte">{aide}</p>}
      <ol class="liste-ordre" ref={liste}>
        {ordre.map((id, i) => {
          const e = parId.get(id);
          if (!e) return null;
          return (
            <li key={id} class="ligne-ordre">
              <span class="poignee" aria-hidden="true" title="Glisser pour déplacer"><Icone nom="poignee" taille={18} /></span>
              <span class="rang-ordre">{i + 1}</span>
              <span class="nom-ordre">{e.nom}{e.detail && <span class="petit-texte"> · {e.detail}</span>}</span>
              <button type="button" class="bouton-icone petit" aria-label={`Monter ${e.nom}`} disabled={i === 0} onClick={() => deplacer(i, i - 1)}><Icone nom="haut" taille={16} /></button>
              <button type="button" class="bouton-icone petit" aria-label={`Descendre ${e.nom}`} disabled={i === ordre.length - 1} onClick={() => deplacer(i, i + 1)}><Icone nom="bas" taille={16} /></button>
            </li>
          );
        })}
      </ol>
    </Feuille>
  );
}
