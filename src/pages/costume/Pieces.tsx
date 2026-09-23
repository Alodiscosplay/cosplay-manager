// Onglet « Pièces » : pièces → pistes → étapes à cocher, réordonnables par glisser.
import { useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { donnees, jour, faire } from '../../store/store';
import { piecesDe, pistesDe, etapesDePiste } from '../../logique/acces';
import { avancementPiece, avancementPiste, poids } from '../../logique/avancement';
import { statutPiece, statutStockePiece, champsStatutPiece, pisteEnPause, champsPausePiste, etatPiste, attentes, texteAttente } from '../../logique/disponibilite';
import { deadlineCostume } from '../../logique/planning';
import { jourCourt, relatif, lireJour } from '../../logique/dates';
import { DUREES, NOMS_DUREES, bool, txtBool, type Duree, type Ligne } from '../../modele/schema';
import { creerPiece, creerPiste, creerEtape, cocherEtape, deplacerEtape, reordonner } from '../../store/operations';
import { Barre, Pct, Puce, Case, Menu, Vide } from '../../composants/base';
import { Icone } from '../../composants/Icone';
import { EditeurEtape, EditeurPiece, EditeurPiste, CollerListe, ChoixModele, Repartir, RattacherFournitures, nbFournituresHorsPieces, EffacerDatesPrevues } from './editeurs';
import { maj } from '../Costume';

type Ouvert = { type: 'etape' | 'piece' | 'piste' | 'coller' | 'modele' | 'repartir' | 'fournitures' | 'fournitures-creation'; id?: string } | null;

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
      handle: '.poignee-piece', draggable: '.carte-piece', animation: 150,
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
    const ch = creerPiece(d, costume.id, nouvelle.trim(), pieces.length ? 'en pause' : 'en cours');
    faire(ch);
    // Fournitures déjà saisies (ou reçues) avant la pièce : proposer de les rattacher tout de suite.
    if (nbFournituresHorsPieces(donnees.value, costume.id)) setOuvert({ type: 'fournitures-creation', id: ch[0].id });
    setNouvelle('');
  };

  return (
    <section>
      <div class="barre-outils">
        <form class="ajout-rapide" onSubmit={e => { e.preventDefault(); ajouterPiece(); }}>
          <input value={nouvelle} placeholder="Nouvelle pièce" aria-label="Nom de la nouvelle pièce" onInput={e => setNouvelle((e.target as HTMLInputElement).value)} />
          <button class="bouton principal" disabled={!nouvelle.trim()}><Icone nom="plus" />Pièce</button>
        </form>
        {dl && pieces.length > 0 && <button class="bouton" onClick={() => setOuvert({ type: 'repartir' })}><Icone nom="agenda" />Répartir les étapes</button>}
        <EffacerDatesPrevues costumeId={costume.id} />
      </div>

      {!pieces.length && (
        <Vide icone="calques" titre="Aucune pièce">
          <p>Découpe le costume en pièces, puis en étapes et sous-étapes.</p>
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
      {(ouvert?.type === 'fournitures' || ouvert?.type === 'fournitures-creation') && (
        <RattacherFournitures pieceId={ouvert.id!} apresCreation={ouvert.type === 'fournitures-creation'} onFermer={() => setOuvert(null)} />
      )}
    </section>
  );
}

/** Sortable déplace le DOM lui-même ; on le remet en place et on laisse Preact redessiner depuis les données. */
function annulerDeplacementDom(evt: Sortable.SortableEvent): void {
  const { item, from, oldIndex } = evt;
  // Les frères de l'élément, sans lui, sont dans l'ordre d'origine : on le remet à son ancien rang.
  const reste = [...from.children].filter(c => c !== item);
  from.insertBefore(item, reste[oldIndex!] ?? null);
}

const CLE_REPLI = 'cosplay-planner.pieces-repliees';
function lireReplis(): Record<string, boolean> { try { return JSON.parse(localStorage.getItem(CLE_REPLI) ?? '{}'); } catch { return {}; } }
/** Mémorise sur l'appareil qu'une pièce ou une étape est repliée (préférence d'affichage, non synchronisée). */
function memoriserRepli(id: string, replie: boolean): void {
  const r = lireReplis(); r[id] = replie;
  try { localStorage.setItem(CLE_REPLI, JSON.stringify(r)); } catch { /* stockage indisponible */ }
}

function CartePiece({ piece, ouvrir }: { piece: Ligne; ouvrir: (o: Ouvert) => void }) {
  const d = donnees.value;
  const j = jour.value;
  const sp = statutPiece(piece, j);
  const [replie, setReplie] = useState(() => lireReplis()[piece.id] ?? (sp === 'terminée'));
  const [nouvellePiste, setNouvellePiste] = useState('');
  const conteneur = useRef<HTMLDivElement>(null);
  const a = avancementPiece(d, piece.id);
  const pistes = pistesDe(d, piece.id);
  const att = attentes(d, piece);
  const dl = lireJour(piece.deadline);
  const debutFutur = statutStockePiece(piece) === 'en pause' && lireJour(piece.debut) > j ? lireJour(piece.debut) : '';
  const basculer = () => { memoriserRepli(piece.id, !replie); setReplie(!replie); };
  const statut = (s: string) => maj('Pieces', piece.id, champsStatutPiece(piece, s, j));

  // Réordonner les pistes de la pièce
  useEffect(() => {
    if (!conteneur.current) return;
    const s = Sortable.create(conteneur.current, {
      handle: '.poignee-piste', draggable: '.piste', animation: 150,
      onEnd: evt => {
        annulerDeplacementDom(evt);
        if (evt.oldIndex === evt.newIndex) return;
        const ordre = pistesDe(donnees.value, piece.id);
        const [bouge] = ordre.splice(evt.oldIndex!, 1);
        ordre.splice(evt.newIndex!, 0, bouge);
        faire(reordonner('Pistes', ordre));
      },
    });
    return () => s.destroy();
  }, [piece.id, replie, pistes.length]);

  const ajouterPiste = () => {
    faire(creerPiste(d, piece.id, nouvellePiste.trim() || `Étape ${pistes.length + 1}`));
    setNouvellePiste('');
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
          {/* Le bouton montre l'état ACTUEL de la pièce ; un clic le fait basculer. */}
          {sp !== 'terminée' && (
            <button class={`bascule-etat${sp === 'en cours' ? ' actif' : ' pause'}`} aria-pressed={sp === 'en cours'}
              aria-label={sp === 'en cours' ? 'Pièce en cours, cliquer pour la mettre en pause' : 'Pièce en pause, cliquer pour la reprendre'}
              title={sp === 'en cours' ? 'Pièce en cours — cliquer pour la mettre en pause' : 'Pièce en pause — cliquer pour la reprendre'}
              onClick={() => statut(sp === 'en cours' ? 'en pause' : 'en cours')}>
              {sp === 'en cours' ? <><Icone nom="lecture" taille={14} />En cours</> : <Icone nom="pause" taille={16} />}
            </button>
          )}
          <Menu label={`Actions pour ${piece.nom}`} actions={[
            { texte: 'Modifier la pièce', icone: 'crayon', faire: () => ouvrir({ type: 'piece', id: piece.id }) },
            { texte: 'Fournitures de la pièce', icone: 'achats', faire: () => ouvrir({ type: 'fournitures', id: piece.id }) },
            { texte: 'Ajouter une étape depuis un modèle', icone: 'calques', faire: () => ouvrir({ type: 'modele', id: piece.id }) },
            { texte: 'Coller des sous-étapes', icone: 'coller', faire: () => ouvrir({ type: 'coller', id: piece.id }) },
          ]} />
        </div>
      </header>
      <div class="piece-resume">
        <Barre a={a} fine />
        <div class="puces">
          {sp === 'terminée' && <Puce ton="vert">terminée</Puce>}
          {debutFutur && <Puce ton="gris"><Icone nom="horloge" taille={12} />reprend le {jourCourt(debutFutur)}</Puce>}
          {dl && <Puce ton={dl < j && a.pct !== 100 ? 'rouge' : 'gris'}><Icone nom="drapeau" taille={12} />{jourCourt(dl)} · {relatif(dl, j)}</Puce>}
          {piece.patron
            ? <button class="puce-bouton" title="Modifier le patron" onClick={() => ouvrir({ type: 'piece', id: piece.id })}><Puce ton="accent">Patron : {piece.patron}</Puce></button>
            : <button class="puce-bouton ajout" onClick={() => ouvrir({ type: 'piece', id: piece.id })}><Puce ton="gris"><Icone nom="plus" taille={12} />Patron</Puce></button>}
          {att.length > 0 && <Puce ton="orange"><Icone nom="cadenas" taille={12} />{texteAttente(att)}</Puce>}
        </div>
      </div>
      {!replie && (
        <div class="piece-contenu">
          <div class="pistes" ref={conteneur}>
            {pistes.map(p => <BlocPiste key={p.id} piste={p} piece={piece} ouvrir={ouvrir} />)}
          </div>
          <div class="ajout-piste">
            <form class="ajout-etape" onSubmit={ev => { ev.preventDefault(); ajouterPiste(); }}>
              <Icone nom="calques" taille={16} />
              <input value={nouvellePiste} placeholder="Ajouter une étape" aria-label={`Ajouter une étape à ${piece.nom}`}
                onInput={ev => setNouvellePiste((ev.target as HTMLInputElement).value)} />
            </form>
            <button class="bouton petit" onClick={() => ouvrir({ type: 'modele', id: piece.id })}><Icone nom="plus" taille={14} />Depuis un modèle</button>
          </div>
        </div>
      )}
    </article>
  );
}

function BlocPiste({ piste, piece, ouvrir }: { piste: Ligne; piece: Ligne; ouvrir: (o: Ouvert) => void }) {
  const d = donnees.value;
  const j = jour.value;
  const etapes = etapesDePiste(d, piste.id);
  const e = etatPiste(d, piste, j);
  const a = avancementPiste(d, piste.id);
  const liste = useRef<HTMLUListElement>(null);
  const [texte, setTexte] = useState('');
  const pieceActive = statutPiece(piece, j) === 'en cours';
  const disponibles = new Set(pieceActive && e.ouverte && !e.bloqueePar.length ? e.disponibles.map(x => x.id) : []);
  const libre = bool(piste.libre);
  // Une étape terminée est repliée par défaut ; le choix de l'utilisateur est ensuite mémorisé.
  const [replie, setReplie] = useState(() => lireReplis()[piste.id] ?? (e.terminee && etapes.length > 0));
  const basculer = () => { memoriserRepli(piste.id, !replie); setReplie(!replie); };

  useEffect(() => {
    if (!liste.current) return;
    const s = Sortable.create(liste.current, {
      group: `etapes-${piece.id}`, handle: '.poignee', draggable: '.etape', animation: 150,
      onEnd: evt => {
        annulerDeplacementDom(evt);
        const id = (evt.item as HTMLElement).dataset.id!;
        const vers = (evt.to as HTMLElement).dataset.piste!;
        if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;
        faire(deplacerEtape(donnees.value, id, vers, evt.newIndex!));
      },
    });
    return () => s.destroy();
  }, [piste.id, piece.id, replie]);

  const ajouter = () => {
    const t = texte.trim();
    if (!t) return;
    faire(creerEtape(d, piste.id, t));
    setTexte('');
  };
  const enPause = pisteEnPause(piste, j);

  return (
    <div class={`piste${enPause ? ' en-pause' : ''}`} data-id={piste.id}>
      <div class="piste-tete">
        <button class="bouton-icone petit" onClick={basculer} aria-expanded={!replie}
          aria-label={`${replie ? 'Déplier' : 'Replier'} l'étape ${piste.nom || 'principale'}`}><Icone nom={replie ? 'chevron' : 'bas'} taille={16} /></button>
        <span class="poignee poignee-piste" aria-label="Déplacer l'étape" title="Glisser pour réordonner les étapes"><Icone nom="poignee" taille={16} /></span>
        <button class="piste-nom" onClick={() => ouvrir({ type: 'piste', id: piste.id })}>{piste.nom || 'Étape principale'}</button>
        <span class="piste-compte">{a.nbFait}/{a.nb}</span>
        <button class={`bascule-ordre${libre ? ' libre' : ''}`} onClick={() => maj('Pistes', piste.id, { libre: txtBool(!libre) })}
          title={libre ? 'Libre : toutes les sous-étapes sont faisables en même temps. Cliquer pour imposer l\'ordre.' : 'Dans l\'ordre : chaque sous-étape attend la précédente. Cliquer pour rendre libre.'}>
          {libre ? '⇉ libre' : '→ dans l\'ordre'}
        </button>
        <button class={`bascule-etat petit${enPause ? ' pause' : ' actif'}`} aria-pressed={!enPause}
          aria-label={enPause ? `Étape ${piste.nom || 'principale'} en pause, cliquer pour la reprendre` : `Étape ${piste.nom || 'principale'} en cours, cliquer pour la mettre en pause`}
          title={enPause ? 'Étape en pause — cliquer pour la reprendre' : 'Étape en cours — cliquer pour la mettre en pause'}
          onClick={() => faire([{ table: 'Pistes', id: piste.id, champs: champsPausePiste(piste, !enPause, j) }], enPause ? `« ${piste.nom || 'Étape'} » reprise` : `« ${piste.nom || 'Étape'} » en pause`)}>
          {enPause ? <Icone nom="pause" taille={16} /> : <Icone nom="lecture" taille={14} />}
        </button>
        <button class="bouton-icone petit" aria-label={`Modifier l'étape ${piste.nom}`} onClick={() => ouvrir({ type: 'piste', id: piste.id })}><Icone nom="crayon" taille={16} /></button>
      </div>
      {enPause && <p class="piste-bloquee"><Icone nom="pause" taille={14} />en pause{lireJour(piste.debut) ? `, reprend le ${jourCourt(piste.debut)}` : ''}</p>}
      {e.bloqueePar.length > 0 && !e.terminee && <p class="piste-bloquee"><Icone nom="cadenas" taille={14} />{texteAttente(e.bloqueePar)}</p>}
      {e.debutFutur && <p class="piste-bloquee"><Icone nom="horloge" taille={14} />commence le {jourCourt(e.debutFutur)}</p>}
      {!replie && (
        <>
          <ul class="etapes" ref={liste} data-piste={piste.id}>
            {etapes.map(et => <LigneEtape key={et.id} etape={et} suivante={disponibles.has(et.id)} ouvrir={() => ouvrir({ type: 'etape', id: et.id })} />)}
          </ul>
          <form class="ajout-etape" onSubmit={ev => { ev.preventDefault(); ajouter(); }}>
            <Icone nom="plus" taille={16} />
            <input value={texte} placeholder="Ajouter une sous-étape" aria-label={`Ajouter une sous-étape à ${piste.nom || piece.nom}`}
              onInput={ev => setTexte((ev.target as HTMLInputElement).value)} />
          </form>
        </>
      )}
    </div>
  );
}

/** Choix rapide de la durée (= poids) d'une étape, directement dans la liste. */
function ChoixDuree({ etape }: { etape: Ligne }) {
  const duree = (etape.duree || 'normal') as Duree;
  const p = poids(etape);
  const perso = p !== DUREES[duree];
  return (
    <select class={`choix-duree duree-${duree.replace(' ', '-')}`} value={perso ? 'perso' : duree} aria-label={`Durée de « ${etape.titre} »`}
      title="Durée : plus c'est long, plus la sous-étape compte dans le %"
      onClick={e => e.stopPropagation()}
      onChange={e => { const v = (e.target as HTMLSelectElement).value as Duree; maj('Etapes', etape.id, { duree: v, poids: String(DUREES[v]) }); }}>
      {NOMS_DUREES.map(n => <option value={n}>{n} ({DUREES[n]})</option>)}
      {perso && <option value="perso" disabled>poids {p}</option>}
    </select>
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
      <span class="poignee" aria-label="Déplacer la sous-étape" title="Glisser pour réordonner ou changer d'étape"><Icone nom="poignee" taille={16} /></span>
      <Case coche={fait} label={etape.titre} onChange={v => faire(cocherEtape(d, etape.id, v, j))} />
      <button class="etape-texte" onClick={ouvrir}>
        <span class="etape-titre">{etape.titre}</span>
        <span class="etape-meta">
          {suivante && <span class="marque-suivante">à faire</span>}
          {prevue && !fait && <span class={prevue < j ? 'en-retard' : ''}><Icone nom="horloge" taille={12} />{jourCourt(prevue)}</span>}
          {dl && !fait && <span class={dl < j ? 'en-retard' : ''}><Icone nom="drapeau" taille={12} />{jourCourt(dl)}</span>}
          {att.length > 0 && <span class="attente"><Icone nom="cadenas" taille={12} />{att.map(x => x.nom).join(', ')}</span>}
          {etape.detail && <span class="a-detail" title={etape.detail}>note</span>}
        </span>
      </button>
      <ChoixDuree etape={etape} />
    </li>
  );
}
