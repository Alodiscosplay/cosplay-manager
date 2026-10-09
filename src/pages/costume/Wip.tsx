// Composer le dossier WIP d'un costume : ce qu'il contient (identité, comparaisons, intercalaires,
// sommaire, recherche), les paires référence / résultat, puis les pièces — leur ordre, leur partie,
// leur origine, leurs matériaux principaux et leurs techniques. Le dossier part en Google Slides modifiable.
import { useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { donnees, mode, dossierDuCostume, montrerToast } from '../../store/store';
import { piecesDe, photosDe, fournituresDe } from '../../logique/acces';
import { liste, type Ligne } from '../../modele/schema';
import { genererWip, lireReglagesWip, photosWip, partieDe, planWip, profilDe, PARTIES, ORIGINES, VUES, type ReglagesWip } from '../../export/dossierWip';
import { versGoogleSlides } from '../../sync/drive';
import { telechargerBlob, nomFichier, Feuille, Champ, Texte, Selection, PhotoImg } from '../../composants/base';
import { annulerDeplacementDom } from '../../composants/glisser';
import { Icone } from '../../composants/Icone';
import { estReference } from './Photos';
import { maj } from '../Costume';

export function OngletWip({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const r = lireReglagesWip(d, costume);
  const regler = (champs: Partial<ReglagesWip>) => maj('Costumes', costume.id, { wip: JSON.stringify({ ...r, ...champs }) });
  const pieces = piecesDe(d, costume.id);
  const profil = profilDe(d);
  const [etat, setEtat] = useState('');
  const [erreur, setErreur] = useState('');
  const [choixPhoto, setChoixPhoto] = useState<{ cle: string; cote: 'ref' | 'res' } | null>(null);
  const google = mode.value === 'google';
  const nbPages = planWip(d, costume, r).diapos.length;

  const generer = async (versSlides: boolean) => {
    setErreur('');
    try {
      const dd = donnees.value;
      const blob = await genererWip(dd, costume.id, lireReglagesWip(dd, dd.Costumes[costume.id]), profilDe(dd), setEtat);
      const nom = `Dossier WIP – ${costume.nom} – ${new Date().toLocaleDateString('fr-FR')}`;
      if (versSlides) {
        setEtat('Envoi vers Google Slides');
        const url = await versGoogleSlides(blob, nom, await dossierDuCostume(costume.id));
        window.open(url, '_blank', 'noopener');
        montrerToast('Dossier WIP créé dans Google Slides, dans le dossier du costume');
      } else telechargerBlob(blob, `${nomFichier(costume.nom)}-dossier-WIP.pptx`);
    } catch (e) {
      setErreur((e as Error).message);
    } finally { setEtat(''); }
  };

  const option = (cle: keyof ReglagesWip, texte: string, aide?: string) => (
    <label class="interrupteur">
      <input type="checkbox" checked={r[cle] as boolean} onChange={e => regler({ [cle]: (e.target as HTMLInputElement).checked })} />
      <span>{texte}{aide && <span class="petit-texte"> — {aide}</span>}</span>
    </label>
  );

  return (
    <section class="wip">
      <div class="carte-reglage">
        <h2>Ce que contient le dossier</h2>
        {option('identite', "Page d'identité du cosplayeur", 'pour les grands concours ; sinon, une page avec le personnage et son image de référence')}
        {r.identite && !profil.pseudo && !profil.nom && <p class="petit-texte">Ton identité se remplit une fois pour toutes dans <a href="#/reglages">Réglages › Mon identité de cosplayeur</a>.</p>}
        {option('comparaisons', 'Comparaisons référence / résultat', 'costume, wig, make-up, hand props ; un concours général peut aller directement aux WIP')}
        {option('intercalaires', 'Intercalaires entre les parties')}
        {option('sommaire', 'Sommaire')}
        {option('recherche', 'Recherche documentée', 'contexte, inspirations, choix de la référence')}
        {r.recherche && (
          <Champ label="Recherche documentée">
            <Texte multiligne valeur={costume.recherche ?? ''} placeholder="Ce que tu as cherché avant de commencer : le contexte de l'œuvre, la costumière, l'époque, les écarts assumés avec la référence…" onValider={v => maj('Costumes', costume.id, { recherche: v })} />
          </Champ>
        )}
      </div>

      {r.comparaisons && (
        <div class="carte-reglage">
          <h2>Comparaisons</h2>
          <p class="petit-texte">Ne remplis que les cases voulues : une case vide n'apparaît pas dans le dossier.</p>
          <div class="grille-comparaisons">
            {VUES.map(v => (
              <div class="case-comparaison">
                <span class="champ-label">{v.titre}{v.vue ? ` · ${v.vue}` : ''}</span>
                <div class="paire">
                  {(['ref', 'res'] as const).map(cote => {
                    const id = r.paires[v.cle]?.[cote];
                    return (
                      <button class="choix-photo" onClick={() => setChoixPhoto({ cle: v.cle, cote })} aria-label={`${cote === 'ref' ? 'Référence' : 'Résultat'} ${v.titre} ${v.vue}`}>
                        {id ? <PhotoImg id={id} alt="" /> : <span class="petit-texte">+ {cote === 'ref' ? 'Référence' : 'Résultat'}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div class="carte-reglage">
        <h2>Pièces</h2>
        <p class="petit-texte">Glisse pour l'ordre. Pour chaque pièce : sa partie dans le dossier, son origine, ses matériaux principaux et ses techniques. Ses photos d'avancement viennent de l'onglet Photos.</p>
        <ListePieces costume={costume} r={r} regler={regler} pieces={pieces} />
      </div>

      <div class="carte-reglage">
        <fieldset class="choix-segments">
          <legend>Photos par page</legend>
          {([2, 4, 6] as const).map(n => (
            <label><input type="radio" name="par-page" checked={r.parPage === n} onChange={() => regler({ parPage: n })} /><span>{n}</span></label>
          ))}
        </fieldset>
        <p class="petit-texte">Environ {nbPages} page{nbPages > 1 ? 's' : ''}.</p>
        <div class="ligne-actions">
          {google && <button class="bouton principal" disabled={!!etat} onClick={() => void generer(true)}><Icone nom="diapo" />Créer dans Google Slides</button>}
          <button class={`bouton${google ? '' : ' principal'}`} disabled={!!etat} onClick={() => void generer(false)}><Icone nom="telecharger" />Télécharger (PowerPoint)</button>
        </div>
        {google && <p class="petit-texte">Le dossier est créé dans le dossier du costume sur ton Drive, et s'ouvre dans Google Slides : tu peux le retoucher, puis le télécharger en PDF pour le concours.</p>}
        {etat && <p class="petit-texte" role="status">{etat}…</p>}
        {erreur && <p class="erreur" role="alert">{erreur}</p>}
      </div>

      {choixPhoto && (
        <ChoixPhotoWip costume={costume} actuelle={r.paires[choixPhoto.cle]?.[choixPhoto.cote]} reference={choixPhoto.cote === 'ref'}
          onChoix={id => { regler({ paires: { ...r.paires, [choixPhoto.cle]: { ...r.paires[choixPhoto.cle], [choixPhoto.cote]: id } } }); setChoixPhoto(null); }}
          onFermer={() => setChoixPhoto(null)} />
      )}
    </section>
  );
}

function ListePieces({ costume, r, regler, pieces }: { costume: Ligne; r: ReglagesWip; regler: (c: Partial<ReglagesWip>) => void; pieces: Ligne[] }) {
  const d = donnees.value;
  const conteneur = useRef<HTMLUListElement>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const cle = r.ordre.join(',');
  useEffect(() => {
    if (!conteneur.current) return;
    const s = Sortable.create(conteneur.current, {
      handle: '.poignee', draggable: 'li', animation: 150,
      onEnd: evt => {
        annulerDeplacementDom(evt);
        if (evt.oldIndex === evt.newIndex) return;
        const o = [...r.ordre];
        const [x] = o.splice(evt.oldIndex!, 1);
        o.splice(evt.newIndex!, 0, x);
        regler({ ordre: o });
      },
    });
    return () => s.destroy();
  }, [cle]);
  return (
    <ul class="pieces-wip" ref={conteneur}>
      {r.ordre.map(id => {
        const p = pieces.find(x => x.id === id);
        const n = photosWip(d, costume.id, id).length;
        if (!p && !n) return <li hidden />; // photos sans pièce : seulement s'il y en a
        const exclue = r.exclues.includes(id);
        const majP = (champs: Record<string, string>) => p && maj('Pieces', p.id, champs);
        return (
          <li class={exclue ? 'exclue' : ''}>
            <div class="tete-piece-wip">
              <span class="poignee" aria-label="Déplacer" title="Glisser pour réordonner"><Icone nom="poignee" taille={18} /></span>
              <label class="case-ligne">
                <input type="checkbox" checked={!exclue} onChange={e => regler({ exclues: (e.target as HTMLInputElement).checked ? r.exclues.filter(x => x !== id) : [...r.exclues, id] })} />
                <span><strong>{p?.nom ?? 'Photos sans pièce'}</strong> <span class="petit-texte">{n} photo{n > 1 ? 's' : ''}</span></span>
              </label>
              {p && <Selection label={`Partie de ${p.nom}`} valeur={partieDe(p)} options={PARTIES} onChange={v => majP({ partie_wip: v })} />}
              {p && <button class="bouton petit" onClick={() => setOuverte(ouverte === id ? null : id)}>{ouverte === id ? 'Fermer' : 'Textes'}</button>}
            </div>
            {p && ouverte === id && <TextesPiece costume={costume} piece={p} />}
          </li>
        );
      })}
    </ul>
  );
}

function TextesPiece({ costume, piece }: { costume: Ligne; piece: Ligne }) {
  const d = donnees.value;
  const m = (champs: Record<string, string>) => maj('Pieces', piece.id, champs);
  // Les fournitures de la pièce, pour reprendre les principales d'un geste (pas toutes : rester léger).
  const fournitures = fournituresDe(d, costume.id).filter(f => liste(f.piece_id).includes(piece.id));
  const deja = (piece.materiaux ?? '').toLowerCase();
  return (
    <div class="textes-piece-wip">
      <div class="deux-colonnes">
        <Champ label="Origine"><Selection label="Origine" valeur={piece.origine ?? ''} options={ORIGINES} onChange={v => m({ origine: v })} /></Champ>
        {(piece.origine === 'aide' || piece.origine === 'modifie' || piece.origine === 'achete') && (
          <Champ label={piece.origine === 'aide' ? 'Par qui, pour quoi' : 'Précision'}><Texte valeur={piece.origine_detail ?? ''} onValider={v => m({ origine_detail: v })} /></Champ>
        )}
      </div>
      <Champ label="Matériaux principaux" aide="Les principaux seulement : le tissu, la mousse, la résine… pas toute la liste des fournitures.">
        <Texte multiligne valeur={piece.materiaux ?? ''} onValider={v => m({ materiaux: v })} />
      </Champ>
      {fournitures.length > 0 && (
        <div class="puces-fournitures">
          <span class="petit-texte">Reprendre une fourniture :</span>
          {fournitures.map(f => {
            const pris = deja.includes(f.libelle.toLowerCase());
            return <button class={`puce-filtre${pris ? ' actif' : ''}`} disabled={pris} onClick={() => m({ materiaux: [piece.materiaux?.trim(), f.libelle].filter(Boolean).join(', ') })}>{f.libelle}</button>;
          })}
        </div>
      )}
      <Champ label="Techniques utilisées, commentaires" aide="Comment et surtout pourquoi : le jury note le savoir-faire. Le patron de la pièce s'ajoute tout seul.">
        <Texte multiligne valeur={piece.techniques ?? ''} onValider={v => m({ techniques: v })} />
      </Champ>
    </div>
  );
}

/** Choisir une photo du costume pour une case de comparaison. */
function ChoixPhotoWip({ costume, actuelle, reference, onChoix, onFermer }: { costume: Ligne; actuelle?: string; reference: boolean; onChoix: (id: string | undefined) => void; onFermer: () => void }) {
  const d = donnees.value;
  const photos = photosDe(d, costume.id);
  const refs = [...(costume.image_ref ? [costume.image_ref] : []), ...photos.filter(estReference).map(p => p.drive_id)];
  const autres = photos.filter(p => !estReference(p)).map(p => p.drive_id).reverse(); // les plus récentes d'abord
  const groupes: [string, string[]][] = reference ? [['Références', refs], ['Photos du costume', autres]] : [['Photos du costume', autres], ['Références', refs]];
  return (
    <Feuille titre={reference ? 'Image de référence' : 'Photo du résultat'} large onFermer={onFermer} pied={<>
      {actuelle && <button class="bouton" onClick={() => onChoix(undefined)}>Vider la case</button>}
      <button class="bouton" onClick={onFermer}>Annuler</button>
    </>}>
      {groupes.filter(([, l]) => l.length).map(([titre, l]) => (
        <>
          <h3 class="champ-label">{titre}</h3>
          <div class="grille-retrait">
            {[...new Set(l)].map(id => (
              <button class={`tuile-retrait${id === actuelle ? ' cochee' : ''}`} onClick={() => onChoix(id)}><PhotoImg id={id} alt="" /></button>
            ))}
          </div>
        </>
      ))}
      {!refs.length && !autres.length && <p class="petit-texte">Aucune photo pour ce costume : ajoute-en dans l'onglet Photos.</p>}
    </Feuille>
  );
}
