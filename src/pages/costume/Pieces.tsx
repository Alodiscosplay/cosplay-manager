// Onglet « Pièces » : pièces → pistes → étapes à cocher, réordonnables par glisser.
import { useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { donnees, jour, faire } from '../../store/store';
import { piecesDe, pistesDe, etapesDePiste } from '../../logique/acces';
import { avancementPiece, avancementPiste } from '../../logique/avancement';
import { statutPiece, etatPiste, attentes, texteAttente } from '../../logique/disponibilite';
import { deadlineCostume, deadlinePiece } from '../../logique/planning';
import { jourCourt, relatif, lireJour } from '../../logique/dates';
import { bool, txtBool, type Ligne } from '../../modele/schema';
import { creerPiece, creerPiste, creerEtape, cocherEtape, deplacerEtape, reordonner } from '../../store/operations';
import { Barre, Pct, Puce, Case, Menu, Vide } from '../../composants/base';
import { Icone } from '../../composants/Icone';
import { EditeurEtape, EditeurPiece, EditeurPiste, CollerListe, ChoixModele, Repartir } from './editeurs';
import { maj } from '../Costume';

type Ouvert = { type: 'etape' | 'piece' | 'piste' | 'coller' | 'modele' | 'repartir'; id?: string } | null;

export function OngletPieces({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const pieces = piecesDe(d, costume.id);
  const [ouvert, setOuvert] = useState<Ouvert>(null);
  const [nouvelle, setNouvelle] = useState('');
  const liste = useRef<HTMLDivElement>(null);
  const dl = deadlineCostume(d, costume);

  useEffect(() => {
    if (!liste.current) return;
    const s = Sortable.create(liste.current, {
      handle: '.poignee-piece', animation: 150,
      onEnd: evt => {
        annulerDeplacementDom(evt);
        const ordre = piecesDe(donnees.value, costume.id);
        const [bouge] = ordre.splice(evt.oldIndex!, 1);
        ordre.splice(evt.newIndex!, 0, bouge);
        faire(reordonner('Pieces', ordre));
      },
    });
    return () => s.destroy();
  }, [costume.id, pieces.length]);

  const ajouterPiece = () => {
    if (!nouvelle.trim()) return;
    faire(creerPiece(d, costume.id, nouvelle.trim(), pieces.length ? 'à venir' : 'en cours'));
    setNouvelle('');
  };

  return (
    <section>
      <div class="barre-outils">
        <form class="ajout-rapide" onSubmit={e => { e.preventDefault(); ajouterPiece(); }}>
          <input value={nouvelle} placeholder="Nouvelle pièce (ex. Jupe)" aria-label="Nom de la nouvelle pièce" onInput={e => setNouvelle((e.target as HTMLInputElement).value)} />
          <button class="bouton principal" disabled={!nouvelle.trim()}><Icone nom="plus" />Pièce</button>
        </form>
        <button class="bouton" onClick={() => setOuvert({ type: 'coller' })}><Icone nom="coller" />Coller une liste</button>
        {dl && pieces.length > 0 && <button class="bouton" onClick={() => setOuvert({ type: 'repartir' })}><Icone nom="agenda" />Répartir jusqu'au {jourCourt(dl)}</button>}
      </div>

      {!pieces.length && (
        <Vide icone="calques" titre="Aucune pièce">
          <p>Découpe le costume en pièces (jupe, corset, perruque, accessoires…), puis ajoute leurs étapes. Tu peux aussi tout coller d'un coup depuis une liste.</p>
        </Vide>
      )}

      <div class="liste-pieces" ref={liste}>
        {pieces.map(p => <CartePiece key={p.id} piece={p} ouvrir={setOuvert} />)}
      </div>

      {ouvert?.type === 'etape' && <EditeurEtape id={ouvert.id!} onFermer={() => setOuvert(null)} />}
      {ouvert?.type === 'piece' && <EditeurPiece id={ouvert.id!} onFermer={() => setOuvert(null)} />}
      {ouvert?.type === 'piste' && <EditeurPiste id={ouvert.id!} onFermer={() => setOuvert(null)} />}
      {ouvert?.type === 'coller' && <CollerListe costumeId={costume.id} pieceId={ouvert.id} onFermer={() => setOuvert(null)} />}
      {ouvert?.type === 'modele' && <ChoixModele pieceId={ouvert.id!} onFermer={() => setOuvert(null)} />}
      {ouvert?.type === 'repartir' && <Repartir costumeId={costume.id} onFermer={() => setOuvert(null)} />}
    </section>
  );
}

/** Sortable déplace le DOM lui-même ; on le remet en place et on laisse Preact redessiner depuis les données. */
function annulerDeplacementDom(evt: Sortable.SortableEvent): void {
  const { item, from, to, oldIndex, newIndex } = evt;
  if (from === to) from.insertBefore(item, from.children[oldIndex! > newIndex! ? oldIndex! + 1 : oldIndex!] ?? null);
  else from.insertBefore(item, from.children[oldIndex!] ?? null);
}

const CLE_REPLI = 'cosplay-planner.pieces-repliees';
function lireReplis(): Record<string, boolean> { try { return JSON.parse(localStorage.getItem(CLE_REPLI) ?? '{}'); } catch { return {}; } }

function CartePiece({ piece, ouvrir }: { piece: Ligne; ouvrir: (o: Ouvert) => void }) {
  const d = donnees.value;
  const j = jour.value;
  const sp = statutPiece(piece, j);
  const [replie, setReplie] = useState(() => lireReplis()[piece.id] ?? (sp === 'terminée'));
  const a = avancementPiece(d, piece.id);
  const pistes = pistesDe(d, piece.id);
  const plusieurs = pistes.length > 1 || pistes.some(p => p.nom);
  const att = attentes(d, piece);
  const dl = lireJour(piece.deadline);
  const basculer = () => {
    const r = lireReplis(); r[piece.id] = !replie;
    try { localStorage.setItem(CLE_REPLI, JSON.stringify(r)); } catch { /* stockage indisponible */ }
    setReplie(!replie);
  };

  return (
    <article class={`carte-piece statut-${sp.replace(/\s/g, '-')}`} data-id={piece.id}>
      <header class="piece-tete">
        <span class="poignee poignee-piece" aria-label="Déplacer la pièce" title="Glisser pour réordonner"><Icone nom="poignee" taille={18} /></span>
        <button class="piece-titre" onClick={basculer} aria-expanded={!replie}>
          <Icone nom={replie ? 'chevron' : 'bas'} taille={18} />
          <h3>{piece.nom}</h3>
        </button>
        <div class="piece-droite">
          <Pct a={a} />
          {sp === 'en cours'
            ? <button class="bouton-icone" title="Mettre en pause" aria-label="Mettre la pièce en pause" onClick={() => maj('Pieces', piece.id, { statut: 'en pause' })}><Icone nom="pause" taille={18} /></button>
            : sp !== 'terminée' && <button class="bouton petit" title="Travailler sur cette pièce" onClick={() => maj('Pieces', piece.id, { statut: 'en cours' })}><Icone nom="lecture" taille={14} />En cours</button>}
          <Menu label={`Actions pour ${piece.nom}`} actions={[
            { texte: 'Modifier la pièce', icone: 'crayon', faire: () => ouvrir({ type: 'piece', id: piece.id }) },
            { texte: 'Ajouter une piste parallèle', icone: 'calques', faire: () => faire(creerPiste(d, piece.id, 'Nouvelle piste')) },
            { texte: 'Ajouter une piste depuis un modèle', icone: 'calques', faire: () => ouvrir({ type: 'modele', id: piece.id }) },
            { texte: 'Coller des étapes', icone: 'coller', faire: () => ouvrir({ type: 'coller', id: piece.id }) },
          ]} />
        </div>
      </header>
      <div class="piece-resume">
        <Barre a={a} fine />
        <div class="puces">
          <Puce ton={sp === 'en cours' ? 'accent' : sp === 'terminée' ? 'vert' : 'gris'}>{sp}</Puce>
          {piece.statut === 'à venir' && piece.debut && <Puce ton="gris">début {jourCourt(piece.debut)}</Puce>}
          {dl && <Puce ton={dl < j && a.pct !== 100 ? 'rouge' : 'gris'}><Icone nom="drapeau" taille={12} />{jourCourt(dl)} · {relatif(dl, j)}</Puce>}
          {!dl && deadlinePiece(d, piece) && null}
          {piece.patron && <Puce ton="gris">{piece.patron}</Puce>}
          {att.length > 0 && <Puce ton="orange"><Icone nom="cadenas" taille={12} />{texteAttente(att)}</Puce>}
        </div>
      </div>
      {!replie && (
        <div class="piece-contenu">
          {pistes.map(p => <BlocPiste key={p.id} piste={p} piece={piece} plusieurs={plusieurs} ouvrir={ouvrir} />)}
          {!pistes.length && <button class="bouton petit" onClick={() => faire(creerPiste(d, piece.id, ''))}><Icone nom="plus" taille={16} />Ajouter une piste</button>}
        </div>
      )}
    </article>
  );
}

function BlocPiste({ piste, piece, plusieurs, ouvrir }: { piste: Ligne; piece: Ligne; plusieurs: boolean; ouvrir: (o: Ouvert) => void }) {
  const d = donnees.value;
  const j = jour.value;
  const etapes = etapesDePiste(d, piste.id);
  const e = etatPiste(d, piste, j);
  const a = avancementPiste(d, piste.id);
  const liste = useRef<HTMLUListElement>(null);
  const [texte, setTexte] = useState('');
  const pieceActive = statutPiece(piece, j) === 'en cours';

  useEffect(() => {
    if (!liste.current) return;
    const s = Sortable.create(liste.current, {
      group: `etapes-${piece.id}`, handle: '.poignee', animation: 150,
      onEnd: evt => {
        annulerDeplacementDom(evt);
        const id = (evt.item as HTMLElement).dataset.id!;
        const vers = (evt.to as HTMLElement).dataset.piste!;
        if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;
        faire(deplacerEtape(donnees.value, id, vers, evt.newIndex!));
      },
    });
    return () => s.destroy();
  }, [piste.id, piece.id]);

  const ajouter = () => {
    const t = texte.trim();
    if (!t) return;
    faire(creerEtape(d, piste.id, t));
    setTexte('');
  };

  return (
    <div class={`piste${bool(piste.active) ? '' : ' en-pause'}`}>
      {plusieurs && (
        <div class="piste-tete">
          <button class="piste-nom" onClick={() => ouvrir({ type: 'piste', id: piste.id })}>{piste.nom || 'Piste principale'}</button>
          <span class="piste-compte">{a.nbFait}/{a.nb}</span>
          <label class="bascule" title={bool(piste.active) ? 'Active : remonte dans « À faire »' : 'En pause : ne remonte pas dans « À faire »'}>
            <input type="checkbox" checked={bool(piste.active)} onChange={ev => maj('Pistes', piste.id, { active: txtBool((ev.target as HTMLInputElement).checked) })} />
            <span>{bool(piste.active) ? 'Active' : 'En pause'}</span>
          </label>
          <button class="bouton-icone petit" aria-label={`Modifier la piste ${piste.nom}`} onClick={() => ouvrir({ type: 'piste', id: piste.id })}><Icone nom="crayon" taille={16} /></button>
        </div>
      )}
      {e.bloqueePar.length > 0 && !e.terminee && <p class="piste-bloquee"><Icone nom="cadenas" taille={14} />{texteAttente(e.bloqueePar)}</p>}
      {e.debutFutur && <p class="piste-bloquee"><Icone nom="horloge" taille={14} />commence le {jourCourt(e.debutFutur)}</p>}
      <ul class="etapes" ref={liste} data-piste={piste.id}>
        {etapes.map(et => {
          const suivante = pieceActive && e.ouverte && !e.bloqueePar.length && e.prochaine?.id === et.id;
          return <LigneEtape key={et.id} etape={et} suivante={suivante} ouvrir={() => ouvrir({ type: 'etape', id: et.id })} />;
        })}
      </ul>
      <form class="ajout-etape" onSubmit={ev => { ev.preventDefault(); ajouter(); }}>
        <Icone nom="plus" taille={16} />
        <input value={texte} placeholder="Ajouter une étape" aria-label={`Ajouter une étape à ${piste.nom || piece.nom}`}
          onInput={ev => setTexte((ev.target as HTMLInputElement).value)} />
      </form>
    </div>
  );
}

function LigneEtape({ etape, suivante, ouvrir }: { etape: Ligne; suivante: boolean; ouvrir: () => void }) {
  const d = donnees.value;
  const j = jour.value;
  const fait = bool(etape.fait);
  const att = fait ? [] : attentes(d, etape);
  const prevue = lireJour(etape.date_prevue);
  const dl = lireJour(etape.deadline);
  return (
    <li class={`etape${fait ? ' faite' : ''}${suivante ? ' suivante' : ''}`} data-id={etape.id}>
      <span class="poignee" aria-label="Déplacer l'étape" title="Glisser pour réordonner ou changer de piste"><Icone nom="poignee" taille={16} /></span>
      <Case coche={fait} label={etape.titre} onChange={v => faire(cocherEtape(d, etape.id, v, j))} />
      <button class="etape-texte" onClick={ouvrir}>
        <span class="etape-titre">{etape.titre}</span>
        <span class="etape-meta">
          {suivante && <span class="marque-suivante">à faire</span>}
          {etape.duree && etape.duree !== 'normal' && <span>{etape.duree}</span>}
          {prevue && !fait && <span class={prevue < j ? 'en-retard' : ''}><Icone nom="horloge" taille={12} />{jourCourt(prevue)}</span>}
          {dl && !fait && <span class={dl < j ? 'en-retard' : ''}><Icone nom="drapeau" taille={12} />{jourCourt(dl)}</span>}
          {att.length > 0 && <span class="attente"><Icone nom="cadenas" taille={12} />{att.map(x => x.nom).join(', ')}</span>}
          {etape.detail && <span class="a-detail" title={etape.detail}>note</span>}
        </span>
      </button>
    </li>
  );
}
