// Composer le dossier WIP d'un costume : ce qu'il contient (identité, comparaisons, intercalaires,
// sommaire, recherche), les paires référence / résultat, puis les pièces — leur ordre, leur partie,
// leur origine, leurs matériaux principaux et leurs techniques. Le dossier part en Google Slides modifiable.
import { useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { donnees, mode, dossierDuCostume, montrerToast } from '../../store/store';
import { piecesDe, photosDe, fournituresDe } from '../../logique/acces';
import { liste, type Ligne } from '../../modele/schema';
import { genererWip, lireReglagesWip, photosWip, partieDe, planWip, ajusterWip, pieceIncluse, profilDe, PARTIES, ORIGINES, VUES, type ReglagesWip } from '../../export/dossierWip';
import { versGoogleSlides } from '../../sync/drive';
import { telechargerBlob, nomFichier, Feuille, Champ, Texte, Selection, PhotoImg } from '../../composants/base';
import { jourCourt } from '../../logique/dates';
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
  const aj = ajusterWip(d, costume, r);
  const lien = lireLien(costume);

  const generer = async (versSlides: boolean, seulement?: string[]) => {
    setErreur('');
    try {
      const dd = donnees.value;
      const blob = await genererWip(dd, costume.id, lireReglagesWip(dd, dd.Costumes[costume.id]), profilDe(dd), setEtat, seulement);
      const noms = (seulement ?? []).map(id => dd.Pieces[id]?.nom ?? 'Photos sans pièce').join(', ');
      const nom = seulement ? `Pages à importer – ${noms}` : `Dossier WIP – ${costume.nom} – ${new Date().toLocaleDateString('fr-FR')}`;
      if (versSlides) {
        setEtat('Envoi vers Google Slides');
        const url = await versGoogleSlides(blob, nom, await dossierDuCostume(costume.id));
        window.open(url, '_blank', 'noopener');
        // L'appli retient le dossier et les pièces qu'il contient, pour proposer ensuite d'en ajouter.
        const cr = lireReglagesWip(dd, dd.Costumes[costume.id]);
        const dedans = seulement ?? cr.ordre.filter(id => pieceIncluse(dd, dd.Costumes[costume.id], cr, id));
        const l = seulement && lien ? { ...lien, pieces: [...new Set([...lien.pieces, ...dedans])] } : { url, cree: new Date().toISOString(), pieces: dedans };
        maj('Costumes', costume.id, { wip_slides: JSON.stringify(l) });
        montrerToast(seulement ? 'Pages créées : importe-les dans ton dossier (Fichier › Importer des diapositives)' : 'Dossier WIP créé dans Google Slides, dans le dossier du costume');
      } else telechargerBlob(blob, `${nomFichier(costume.nom)}-${seulement ? 'pages-a-importer' : 'dossier-WIP'}.pptx`);
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
        <h2>{lien ? 'Recréer le dossier complet' : 'Créer le dossier'}</h2>
        <div class="deux-colonnes">
          <fieldset class="choix-segments">
            <legend>Photos par page</legend>
            {([2, 4, 6] as const).map(n => (
              <label><input type="radio" name="par-page" checked={r.parPage === n} onChange={() => regler({ parPage: n })} /><span>{n}</span></label>
            ))}
          </fieldset>
          <Champ label="Nombre de pages maximum" aide="Facultatif : la limite du règlement du concours.">
            <Texte type="number" valeur={r.pagesMax ? String(r.pagesMax) : ''} placeholder="Pas de limite" onValider={v => regler({ pagesMax: Math.max(0, Math.round(Number(v) || 0)) })} />
          </Champ>
        </div>
        <p class="petit-texte">{aj.pages} page{aj.pages > 1 ? 's' : ''}{r.pagesMax ? ` pour ${r.pagesMax} au maximum` : ''}.
          {!aj.impossible && aj.reglages.parPage !== r.parPage && ` Pour tenir, ${aj.reglages.parPage} photos par page.`}
          {!aj.impossible && aj.retirees > 0 && ` ${aj.retirees} photo${aj.retirees > 1 ? 's' : ''} laissée${aj.retirees > 1 ? 's' : ''} de côté : celles qui restent sont réparties sur toute la fabrication de chaque pièce.`}</p>
        {aj.impossible && <p class="erreur">Même avec une seule page par pièce, le dossier dépasse {r.pagesMax} pages : exclus des pièces, des comparaisons ou les intercalaires.</p>}
        <div class="ligne-actions">
          {google && <button class="bouton principal" disabled={!!etat} onClick={() => void generer(true)}><Icone nom="diapo" />{lien ? 'Créer un nouveau dossier dans Google Slides' : 'Créer dans Google Slides'}</button>}
          <button class={`bouton${google ? '' : ' principal'}`} disabled={!!etat} onClick={() => void generer(false)}><Icone nom="telecharger" />Télécharger (PowerPoint)</button>
        </div>
        {google && <p class="petit-texte">{lien
          ? "Un nouveau dossier est créé à côté de l'ancien : tes retouches dans l'ancien restent intactes."
          : "Le dossier est créé dans le dossier du costume sur ton Drive, et s'ouvre dans Google Slides : tu peux le retoucher, puis le télécharger en PDF pour le concours."}</p>}
        {etat && <p class="petit-texte" role="status">{etat}…</p>}
        {erreur && <p class="erreur" role="alert">{erreur}</p>}
      </div>

      {google && lien && <AjouterPages costume={costume} r={r} lien={lien} occupe={!!etat} onCreer={ids => void generer(true, ids)} />}

      {choixPhoto && (
        <ChoixPhotoWip costume={costume} actuelle={r.paires[choixPhoto.cle]?.[choixPhoto.cote]} reference={choixPhoto.cote === 'ref'}
          onChoix={id => { regler({ paires: { ...r.paires, [choixPhoto.cle]: { ...r.paires[choixPhoto.cle], [choixPhoto.cote]: id } } }); setChoixPhoto(null); }}
          onFermer={() => setChoixPhoto(null)} />
      )}
    </section>
  );
}

interface LienSlides { url: string; cree: string; pieces: string[] }

/** Le dossier Google Slides déjà créé pour ce costume, s'il y en a un. */
function lireLien(c: Ligne): LienSlides | null {
  try { const l = JSON.parse(c.wip_slides || 'null'); return l?.url ? l : null; } catch { return null; }
}

/**
 * Ajouter des pièces à un dossier déjà créé sans toucher à ce qu'il contient : l'appli crée une petite
 * présentation avec leurs seules pages, que l'on importe dans son dossier depuis Google Slides. (Écrire
 * directement dans le dossier obligerait à rendre les photos publiques : Google l'exige pour les insérer.)
 */
function AjouterPages({ costume, r, lien, occupe, onCreer }: { costume: Ligne; r: ReglagesWip; lien: LienSlides; occupe: boolean; onCreer: (ids: string[]) => void }) {
  const d = donnees.value;
  const avecPages = r.ordre.filter(id => planWip(d, costume, r, { seulement: [id] }).diapos.length > 0);
  const [choix, setChoix] = useState<Set<string>>(() => new Set(avecPages.filter(id => !lien.pieces.includes(id))));
  const nom = (id: string) => d.Pieces[id]?.nom ?? 'Photos sans pièce';
  return (
    <div class="carte-reglage">
      <h2>Mon dossier dans Google Slides</h2>
      <p><a class="bouton" href={lien.url} target="_blank" rel="noopener"><Icone nom="diapo" />Ouvrir mon dossier</a> <span class="petit-texte">créé le {jourCourt(lien.cree.slice(0, 10), '')}</span></p>
      <h3 class="champ-label">Ajouter des pages, sans toucher au reste</h3>
      <ul class="liste-ajout-pages">
        {avecPages.map(id => (
          <li><label class="case-ligne">
            <input type="checkbox" checked={choix.has(id)} onChange={e => { const s = new Set(choix); (e.target as HTMLInputElement).checked ? s.add(id) : s.delete(id); setChoix(s); }} />
            <span>{nom(id)}{lien.pieces.includes(id) ? <span class="petit-texte"> — déjà dans le dossier</span> : <span class="petit-texte"> — pas encore dans le dossier</span>}</span>
          </label></li>
        ))}
      </ul>
      <button class="bouton principal" disabled={occupe || !choix.size} onClick={() => onCreer(r.ordre.filter(id => choix.has(id)))}>Créer les pages à importer</button>
      <p class="petit-texte">Une petite présentation s'ouvre avec les pages de ces pièces. Dans ton dossier, place-toi où tu veux les ajouter, puis <strong>Fichier › Importer des diapositives</strong> : choisis « Pages à importer… », sélectionne toutes ses diapositives, et importe-les. Tes retouches restent intactes.</p>
    </div>
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
        const exclue = !pieceIncluse(d, costume, r, id);
        // Cocher une pièce sans photo la « force » dans le dossier ; décocher une pièce l'exclut.
        const cocher = (v: boolean) => n === 0
          ? regler({ forcees: v ? [...r.forcees, id] : r.forcees.filter(x => x !== id), exclues: r.exclues.filter(x => x !== id) })
          : regler({ exclues: v ? r.exclues.filter(x => x !== id) : [...r.exclues, id] });
        const majP = (champs: Record<string, string>) => p && maj('Pieces', p.id, champs);
        return (
          <li class={exclue ? 'exclue' : ''}>
            <div class="tete-piece-wip">
              <span class="poignee" aria-label="Déplacer" title="Glisser pour réordonner"><Icone nom="poignee" taille={18} /></span>
              <label class="case-ligne">
                <input type="checkbox" checked={!exclue} onChange={e => cocher((e.target as HTMLInputElement).checked)} />
                <span><strong>{p?.nom ?? 'Photos sans pièce'}</strong> <span class="petit-texte">{n} photo{n > 1 ? 's' : ''}</span></span>
              </label>
              {p && <Selection label={`Partie de ${p.nom}`} valeur={partieDe(p)} options={PARTIES} onChange={v => majP({ partie_wip: v })} />}
              {p && <button class="bouton-icone petit bouton-textes" aria-expanded={ouverte === id} aria-label={`Textes de ${p.nom}`} title="Origine, matériaux, techniques" onClick={() => setOuverte(ouverte === id ? null : id)}>{ouverte === id ? '−' : '+'}</button>}
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
