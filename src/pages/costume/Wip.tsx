import { useState } from 'preact/hooks';
import { donnees, mode, emplacement } from '../../store/store';
import { piecesDe, photosDe } from '../../logique/acces';
import { bool, type Ligne } from '../../modele/schema';
import { genererWip, type OptionsWip } from '../../export/dossierWip';
import { versGoogleSlides, dossierVisible } from '../../sync/drive';
import { telechargerBlob, nomFichier, Vide } from '../../composants/base';
import { Icone } from '../../composants/Icone';
import { lienCostume } from '../../routeur';

export function OngletWip({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const photos = photosDe(d, costume.id).filter(p => bool(p.dans_wip));
  const pieces = piecesDe(d, costume.id);
  const nb = (id: string) => photos.filter(p => (id ? p.piece_id === id : !p.piece_id || !pieces.some(x => x.id === p.piece_id))).length;
  const [ordre, setOrdre] = useState<string[]>(() => [...pieces.map(p => p.id), ''].filter(id => nb(id) > 0));
  const [exclues, setExclues] = useState<Set<string>>(new Set());
  const [parDiapo, setParDiapo] = useState<OptionsWip['parDiapo']>(2);
  const [etat, setEtat] = useState('');
  const [erreur, setErreur] = useState('');

  if (!photos.length) {
    return (
      <Vide icone="diapo" titre="Pas encore de photo pour le dossier WIP">
        <p>Ajoute des photos d'avancement dans l'onglet <a href={lienCostume(costume.id, 'photos')}>Photos</a> : elles sont incluses au dossier par défaut.</p>
      </Vide>
    );
  }

  const deplacer = (i: number, sens: -1 | 1) => {
    const o = [...ordre];
    [o[i], o[i + sens]] = [o[i + sens], o[i]];
    setOrdre(o);
  };
  const options = (): OptionsWip => ({ pieces: ordre.filter(id => !exclues.has(id)), parDiapo });
  const nomPptx = `${nomFichier(costume.nom)}-dossier-WIP.pptx`;

  const generer = async (versSlides: boolean) => {
    setErreur('');
    try {
      const blob = await genererWip(d, costume.id, options(), setEtat);
      const e = emplacement();
      if (versSlides && e) {
        setEtat('Envoi vers Google Slides');
        window.open(await versGoogleSlides(blob, nomPptx.replace('.pptx', ''), await dossierVisible(e)), '_blank', 'noopener');
      } else telechargerBlob(blob, nomPptx);
    } catch (e) {
      setErreur((e as Error).message);
    } finally { setEtat(''); }
  };

  return (
    <section class="wip">
      <p>Un diaporama pour présenter ton travail : titre avec l'image de référence, sommaire, une section par pièce avec ses photos dans l'ordre chronologique, puis un bilan.</p>
      <h3>Pièces et ordre</h3>
      <ul class="ordre-wip">
        {ordre.map((id, i) => (
          <li class={exclues.has(id) ? 'exclue' : ''}>
            <label class="case-ligne">
              <input type="checkbox" checked={!exclues.has(id)} onChange={e => {
                const s = new Set(exclues);
                if ((e.target as HTMLInputElement).checked) s.delete(id); else s.add(id);
                setExclues(s);
              }} />
              <span>{id ? pieces.find(p => p.id === id)?.nom : 'Général'} <span class="petit-texte">({nb(id)} photo{nb(id) > 1 ? 's' : ''})</span></span>
            </label>
            <button class="bouton-icone petit" disabled={i === 0} aria-label="Monter" onClick={() => deplacer(i, -1)}><Icone nom="haut" taille={16} /></button>
            <button class="bouton-icone petit" disabled={i === ordre.length - 1} aria-label="Descendre" onClick={() => deplacer(i, 1)}><Icone nom="bas" taille={16} /></button>
          </li>
        ))}
      </ul>
      <fieldset class="choix-segments">
        <legend>Photos par diapo</legend>
        {([1, 2, 4] as const).map(n => (
          <label><input type="radio" name="par-diapo" checked={parDiapo === n} onChange={() => setParDiapo(n)} /><span>{n}</span></label>
        ))}
      </fieldset>
      <div class="barre-outils">
        <button class="bouton principal" disabled={!!etat || !options().pieces.length} onClick={() => generer(false)}><Icone nom="telecharger" />Télécharger le PowerPoint</button>
        {mode.value === 'google' && <button class="bouton" disabled={!!etat || !options().pieces.length} onClick={() => generer(true)}><Icone nom="diapo" />Ouvrir dans Google Slides</button>}
      </div>
      {etat && <p class="petit-texte" role="status">{etat}…</p>}
      {erreur && <p class="erreur" role="alert">{erreur}</p>}
    </section>
  );
}
