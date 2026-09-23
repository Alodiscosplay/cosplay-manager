// Feuilles d'édition : étape, pièce, piste, attentes, « Coller une liste », modèles, Répartir.
import { useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { donnees, faire, jour } from '../../store/store';
import { piecesDe, pistesDe, etapesDePiste, ligne, tous, idsAttendus, nomAttendu, ordreSuivant, fournituresDe, piecesDeFourniture } from '../../logique/acces';
import { cleNom } from '../../logique/budget';
import { creeraitBoucle, statutStockePiece, champsStatutPiece, pieceTerminee } from '../../logique/disponibilite';
import { analyserListe, compter, versTexte } from '../../logique/collerListe';
import { planifierCostume, ordrePlanning, deadlineCostume, deadlinePiece, finPlanifiable } from '../../logique/planning';
import { jourCourt, lireJour, ecartJours } from '../../logique/dates';
import { DUREES, NOMS_DUREES, STATUTS_PIECE, bool, liste, txtListe, type Duree, type Ligne, type NomTable } from '../../modele/schema';
import { supprimer, appliquerListe, insererModele, ajouterModeleDansPiste, deplacerEtape, cocherEtape, appliquerPlan, effacerPlanning, nouvelId } from '../../store/operations';
import { Feuille, Champ, Texte, ChoixDate, Selection } from '../../composants/base';
import { maj } from '../Costume';
import { Icone } from '../../composants/Icone';

// ---------- Étape ----------

export function EditeurEtape({ id, onFermer }: { id: string; onFermer: () => void }) {
  const d = donnees.value;
  const e = d.Etapes[id];
  if (!e) return null;
  const piece = d.Pieces[e.piece_id];
  const pistes = pistesDe(d, e.piece_id);
  const m = (champs: Record<string, string>) => maj('Etapes', id, champs);
  const duree = (e.duree || 'normal') as Duree;
  const poidsPerso = e.poids && Number(e.poids) !== DUREES[duree];

  return (
    <Feuille titre="Sous-étape" onFermer={onFermer} pied={<>
      <button class="bouton danger" onClick={() => { faire(supprimer('Etapes', id), `Étape « ${e.titre} » supprimée`); onFermer(); }}>Supprimer</button>
      <button class="bouton principal" onClick={onFermer}>Terminé</button>
    </>}>
      <Champ label="Titre"><Texte valeur={e.titre} onValider={v => v && m({ titre: v })} /></Champ>
      <Champ label="Détail (facultatif)"><Texte multiligne valeur={e.detail ?? ''} onValider={v => m({ detail: v })} /></Champ>
      <label class="interrupteur">
        <input type="checkbox" checked={bool(e.fait)} onChange={ev => faire(cocherEtape(d, id, (ev.target as HTMLInputElement).checked, jour.value))} />
        <span>Faite{bool(e.fait) && e.fait_le ? ` le ${jourCourt(e.fait_le)}` : ''}</span>
      </label>
      <div class="deux-colonnes">
        <Champ label="Durée" aide="Plus c'est long, plus la sous-étape compte dans le %.">
          <Selection label="Durée" valeur={duree} options={NOMS_DUREES.map(n => [n, `${n} (${DUREES[n]})`] as [Duree, string])}
            onChange={v => m({ duree: v, poids: String(DUREES[v]) })} />
        </Champ>
        <Champ label="Poids" aide={poidsPerso ? 'Poids personnalisé.' : 'Modifiable à la main.'}>
          <Texte type="number" valeur={e.poids || String(DUREES[duree])} onValider={v => m({ poids: v })} />
        </Champ>
      </div>
      <div class="deux-colonnes">
      </div>
      {pistes.length > 1 && (
        <Champ label="Étape">
          <Selection label="Étape" valeur={e.piste_id} options={pistes.map(p => [p.id, p.nom || 'Étape principale'] as [string, string])}
            onChange={v => faire(deplacerEtape(d, id, v, etapesDePiste(d, v).length))} />
        </Champ>
      )}
      <ChoixAttentes table="Etapes" l={e} candidats={candidatsAttente(d, piece, e.piste_id)}
        aide="La sous-étape attend la fin d'une autre étape de la pièce. L'ordre entre sous-étapes se règle sur l'étape (dans l'ordre ou libre)." />
    </Feuille>
  );
}

// ---------- Pièce ----------

export function EditeurPiece({ id, onFermer }: { id: string; onFermer: () => void }) {
  const d = donnees.value;
  const p = d.Pieces[id];
  const [rattacher, setRattacher] = useState(false);
  if (!p) return null;
  const m = (champs: Record<string, string>) => maj('Pieces', id, champs);
  const autres = piecesDe(d, p.costume_id).filter(x => x.id !== id).map(x => ({ id: x.id, nom: x.nom }));
  const dl = deadlinePiece(d, p);
  return (
    <Feuille titre="Pièce" onFermer={onFermer} pied={<>
      <button class="bouton danger" onClick={() => { faire(supprimer('Pieces', id), `Pièce « ${p.nom} » supprimée`); onFermer(); }}>Supprimer</button>
      <button class="bouton principal" onClick={onFermer}>Terminé</button>
    </>}>
      <Champ label="Nom"><Texte valeur={p.nom} onValider={v => v && m({ nom: v })} /></Champ>
      <Champ label="Statut" aide="Seules les pièces « en cours » alimentent « À faire ».">
        <Selection label="Statut" valeur={statutStockePiece(p)} options={STATUTS_PIECE} onChange={v => m(champsStatutPiece(p, v, jour.value))} />
      </Champ>
      <div class="deux-colonnes">
        <Champ label="Début (facultatif)" aide="Une pièce en pause passe en cours toute seule ce jour-là.">
          <ChoixDate label="date de début" valeur={p.debut ?? ''} onChange={v => m({ debut: v })} />
        </Champ>
        <Champ label="Deadline (facultative)"><ChoixDate label="deadline" valeur={p.deadline ?? ''} min={p.debut || undefined} onChange={v => m({ deadline: v })} /></Champ>
      </div>
      <Champ label="Patron (facultatif)"><Texte valeur={p.patron ?? ''} onValider={v => m({ patron: v })} /></Champ>
      <Champ label="Notes"><Texte multiligne valeur={p.notes ?? ''} onValider={v => m({ notes: v })} /></Champ>
      <ChoixAttentes table="Pieces" l={p} candidats={autres} aide="La pièce entière attend que ces pièces soient finies." />
      <button class="bouton" onClick={() => setRattacher(true)}><Icone nom="achats" taille={16} />Fournitures de la pièce</button>
      {rattacher && <RattacherFournitures pieceId={id} onFermer={() => setRattacher(false)} />}
      {dl && <p class="petit-texte">Deadline effective : {jourCourt(dl)}. « Répartir les étapes », dans l'onglet Planning, pose les fenêtres de toutes les pièces.</p>}
    </Feuille>
  );
}

// ---------- Piste ----------

export function EditeurPiste({ id, onFermer }: { id: string; onFermer: () => void }) {
  const d = donnees.value;
  const p = d.Pistes[id];
  const [modele, setModele] = useState(false);
  const [ajoutModele, setAjoutModele] = useState(false);
  if (!p) return null;
  const piece = d.Pieces[p.piece_id];
  const m = (champs: Record<string, string>) => maj('Pistes', id, champs);
  return (
    <Feuille titre="Étape" onFermer={onFermer} pied={<>
      <button class="bouton danger" onClick={() => { faire(supprimer('Pistes', id), 'Piste supprimée'); onFermer(); }}>Supprimer</button>
      <button class="bouton principal" onClick={onFermer}>Terminé</button>
    </>}>
      <p class="petit-texte">Les étapes d'une même pièce avancent en parallèle.</p>
      <Champ label="Nom"><Texte valeur={p.nom ?? ''} onValider={v => m({ nom: v })} /></Champ>
      <fieldset class="choix-segments colonne">
        <legend>Ordre des sous-étapes</legend>
        <label><input type="radio" name="ordre-piste" checked={!bool(p.libre)} onChange={() => m({ libre: '' })} /><span><strong>Dans l'ordre</strong> — chaque sous-étape attend la précédente</span></label>
        <label><input type="radio" name="ordre-piste" checked={bool(p.libre)} onChange={() => m({ libre: 'oui' })} /><span><strong>Libre</strong> — toutes les sous-étapes sont faisables en même temps</span></label>
      </fieldset>
      <div class="deux-colonnes">
        <Champ label="Début (facultatif)"><ChoixDate label="date de début" valeur={p.debut ?? ''} onChange={v => m({ debut: v })} /></Champ>
        <Champ label="Deadline (facultative)"><ChoixDate label="deadline" valeur={p.deadline ?? ''} min={p.debut || undefined} onChange={v => m({ deadline: v })} /></Champ>
      </div>
      <ChoixAttentes table="Pistes" l={p} candidats={candidatsAttente(d, piece, id)} aide="L'étape ne commence qu'une fois ces étapes terminées. Pour attendre une autre pièce, règle-le sur la pièce." />
      <div class="ligne-actions">
        <button class="bouton" onClick={() => setAjoutModele(true)}><Icone nom="calques" taille={16} />Ajouter les sous-étapes d'un modèle</button>
        <button class="bouton" onClick={() => setModele(true)}>Enregistrer comme modèle</button>
      </div>
      {modele && <EnregistrerModele pisteId={id} onFermer={() => setModele(false)} />}
      {ajoutModele && <ChoixModele pisteId={id} onFermer={() => setAjoutModele(false)} />}
    </Feuille>
  );
}

/**
 * Ce qu'une étape (ou une sous-étape) peut attendre : les AUTRES étapes de sa pièce.
 * Attendre une autre pièce se règle au niveau de la pièce, pas de l'étape.
 */
function candidatsAttente(d: typeof donnees.value, piece: Ligne | undefined, sauf: string): { id: string; nom: string; groupe?: string }[] {
  if (!piece) return [];
  return pistesDe(d, piece.id).filter(p => p.id !== sauf).map(p => ({ id: p.id, nom: p.nom || 'Étape principale', groupe: 'Étapes de cette pièce' }));
}

export function ChoixAttentes({ table, l, candidats, aide }: { table: NomTable; l: Ligne; candidats: { id: string; nom: string; groupe?: string }[]; aide?: string }) {
  const d = donnees.value;
  const actuels = liste(l.attend);
  if (!candidats.length) return null;
  let groupe: string | undefined;
  return (
    <fieldset class="attentes">
      <legend>Attend (facultatif)</legend>
      {aide && <p class="champ-aide">{aide}</p>}
      {candidats.map(c => {
        const boucle = !actuels.includes(c.id) && creeraitBoucle(d, l.id, c.id);
        const titre = c.groupe !== groupe ? (groupe = c.groupe) : undefined;
        return (
          <>
            {titre && <p class="attentes-groupe">{titre}</p>}
            <label class={`case-ligne${boucle ? ' desactive' : ''}`} title={boucle ? 'Impossible : cela créerait une attente en boucle' : undefined}>
              <input type="checkbox" checked={actuels.includes(c.id)} disabled={boucle}
                onChange={e => {
                  const coche = (e.target as HTMLInputElement).checked;
                  const ids = coche ? [...actuels, c.id] : actuels.filter(x => x !== c.id);
                  maj(table, l.id, { attend: txtListe(ids) });
                }} />
              <span>{c.nom}</span>
            </label>
          </>
        );
      })}
      {actuels.filter(id => !candidats.some(c => c.id === id)).map(id => (
        <label class="case-ligne"><input type="checkbox" checked onChange={() => maj(table, l.id, { attend: txtListe(actuels.filter(x => x !== id)) })} /><span>{nomAttendu(d, id)}</span></label>
      ))}
    </fieldset>
  );
}

export function texteAttendus(d: typeof donnees.value, l: Ligne): string {
  return idsAttendus(l).map(id => nomAttendu(d, id)).join(', ');
}

// ---------- Rattacher des fournitures à une pièce ----------

/**
 * Fournitures du costume rattachées à aucune pièce (achetées ou saisies avant de créer la pièce),
 * plus celles déjà rattachées à cette pièce. Cocher = rattacher, décocher = remettre « hors pièces ».
 */
export function RattacherFournitures({ pieceId, onFermer, apresCreation }: { pieceId: string; onFermer: () => void; apresCreation?: boolean }) {
  const d = donnees.value;
  const piece = d.Pieces[pieceId];
  if (!piece) return null;
  const candidates = fournituresDe(d, piece.costume_id).filter(f => {
    const ids = piecesDeFourniture(d, f).map(p => p.id);
    return ids.length === 0 || ids.includes(pieceId);
  }).sort((a, b) => cleNom(a.libelle).localeCompare(cleNom(b.libelle), 'fr'));
  const basculer = (f: Ligne, coche: boolean) => {
    const autres = liste(f.piece_id).filter(x => x !== pieceId);
    maj('Fournitures', f.id, { piece_id: txtListe(coche ? [...autres, pieceId] : autres) });
  };
  return (
    <Feuille titre={`Fournitures de « ${piece.nom} »`} onFermer={onFermer} pied={
      <button class="bouton principal" onClick={onFermer}>{apresCreation ? 'Terminé' : 'Fermer'}</button>}>
      {apresCreation && <p class="petit-texte">Des fournitures de ce costume ne sont rattachées à aucune pièce. Coche celles qui concernent « {piece.nom} », ou ferme pour le faire plus tard.</p>}
      {!candidates.length && <p class="petit-texte">Aucune fourniture hors pièces dans ce costume.</p>}
      <div class="attentes">
        {candidates.map(f => (
          <label class="case-ligne">
            <input type="checkbox" checked={liste(f.piece_id).includes(pieceId)} onChange={e => basculer(f, (e.target as HTMLInputElement).checked)} />
            <span>{f.libelle}<span class="petit-texte">{[f.quantite, f.unite].filter(Boolean).length ? ` · ${[f.quantite, f.unite].filter(Boolean).join(' ')}` : ''} · {f.statut || 'à acheter'}</span></span>
          </label>
        ))}
      </div>
    </Feuille>
  );
}

/** Nombre de fournitures du costume rattachées à aucune pièce. */
export function nbFournituresHorsPieces(d: typeof donnees.value, costumeId: string): number {
  return fournituresDe(d, costumeId).filter(f => !piecesDeFourniture(d, f).length).length;
}

// ---------- Coller une liste ----------

export function CollerListe({ costumeId, pieceId, onFermer }: { costumeId: string; pieceId?: string; onFermer: () => void }) {
  const [texte, setTexte] = useState('');
  const d = donnees.value;
  const l = analyserListe(texte);
  const n = compter(l);
  const piece = pieceId ? ligne(d, 'Pieces', pieceId) : undefined;
  const sansPiece = l.pieces[0] && !l.pieces[0].nom ? l.pieces[0].pistes.reduce((s, p) => s + p.etapes.length, 0) : 0;
  const ajouter = () => {
    faire(appliquerListe(d, l, costumeId, pieceId), `${n.etapes} sous-étape${n.etapes > 1 ? 's' : ''} ajoutée${n.etapes > 1 ? 's' : ''}`);
    onFermer();
  };
  return (
    <Feuille titre={piece ? `Coller des sous-étapes dans « ${piece.nom} »` : 'Coller une liste'} large onFermer={onFermer} pied={<>
      <button class="bouton" onClick={onFermer}>Annuler</button>
      <button class="bouton principal" disabled={!n.etapes && !n.pieces} onClick={ajouter}>Ajouter</button>
    </>}>
      <p class="petit-texte">Une sous-étape par ligne. <code>## Nom</code> crée une pièce, <code>### Nom</code> une étape (les étapes avancent en parallèle). Une durée entre parenthèses en fin de ligne : <code>(rapide)</code>, <code>(long)</code>, <code>(très long)</code>.</p>
      <textarea class="zone-collage" rows={12} autoFocus value={texte} onInput={e => setTexte((e.target as HTMLTextAreaElement).value)}
 />
      <p class="apercu" aria-live="polite">
        {n.pieces > 0 && `${n.pieces} pièce${n.pieces > 1 ? 's' : ''} · `}{n.etapes} sous-étape{n.etapes > 1 ? 's' : ''}
        {sansPiece > 0 && !piece && ` · ${sansPiece} sans « ## » iront dans une nouvelle pièce`}
      </p>
    </Feuille>
  );
}

// ---------- Modèles ----------

export function ChoixModele({ pieceId, pisteId, onFermer }: { pieceId?: string; pisteId?: string; onFermer: () => void }) {
  const d = donnees.value;
  const modeles = tous(d, 'Modeles');
  const inserer = (mo: Ligne) => {
    const l = analyserListe(mo.contenu);
    if (pisteId) faire(ajouterModeleDansPiste(d, pisteId, l), `Sous-étapes « ${mo.nom} » ajoutées`);
    else faire(insererModele(d, pieceId!, mo.nom, l), `Étape « ${mo.nom} » ajoutée`);
    onFermer();
  };
  return (
    <Feuille titre={pisteId ? 'Ajouter les sous-étapes d\'un modèle à la suite' : 'Ajouter une étape depuis un modèle'} onFermer={onFermer}>
      {!modeles.length && <p>Aucun modèle. Crée-en dans Réglages, ou enregistre une étape existante comme modèle.</p>}
      <div class="menu-liste">
        {modeles.map(mo => {
          const etapes = analyserListe(mo.contenu).pieces.flatMap(p => p.pistes.flatMap(pi => pi.etapes));
          return (
            <button class="menu-action modele" onClick={() => inserer(mo)}>
              <strong>{mo.nom}</strong>
              <span class="petit-texte">{etapes.map(e => e.titre).join(' → ')}</span>
            </button>
          );
        })}
      </div>
    </Feuille>
  );
}

function EnregistrerModele({ pisteId, onFermer }: { pisteId: string; onFermer: () => void }) {
  const d = donnees.value;
  const p = d.Pistes[pisteId];
  const [nom, setNom] = useState(p.nom || d.Pieces[p.piece_id]?.nom || 'Modèle');
  const contenu = versTexte(etapesDePiste(d, pisteId));
  return (
    <Feuille titre="Enregistrer comme modèle" onFermer={onFermer} pied={<>
      <button class="bouton" onClick={onFermer}>Annuler</button>
      <button class="bouton principal" disabled={!nom.trim() || !contenu} onClick={() => {
        faire([{ table: 'Modeles', id: nouvelId(), champs: { nom: nom.trim(), contenu, ordre: ordreSuivant(tous(d, 'Modeles')) } }], `Modèle « ${nom.trim()} » enregistré`);
        onFermer();
      }}>Enregistrer</button>
    </>}>
      <Champ label="Nom du modèle"><input value={nom} autoFocus onInput={e => setNom((e.target as HTMLInputElement).value)} /></Champ>
      <pre class="apercu-modele">{contenu || '(étape vide)'}</pre>
    </Feuille>
  );
}

// ---------- Répartir ----------

export function Repartir({ costumeId, onFermer }: { costumeId: string; onFermer: () => void }) {
  const d = donnees.value;
  const costume = d.Costumes[costumeId];
  const deadline = deadlineCostume(d, costume);
  // La fin prévue du costume : la limite qu'elle se donne, forcément avant (ou à) la deadline.
  const [fin, setFin] = useState(() => lireJour(costume.fin_prevue) || finPlanifiable(deadline, jour.value));
  const [ordre, setOrdre] = useState<string[]>(() => ordrePlanning(d, costumeId).filter(p => !pieceTerminee(d, p.id)).map(p => p.id));
  const finOk = fin >= jour.value;
  const marge = ecartJours(fin, deadline);
  const plan = finOk ? planifierCostume(d, costumeId, jour.value, fin, { ordre }) : { pieces: {}, etapes: {} };
  const n = Object.keys(plan.pieces).length;
  const nEtapes = Object.keys(plan.etapes).length;
  const fixees = ordre.filter(id => !plan.pieces[id]).length;
  // L'ordre se règle en glissant les pièces (poignée à gauche).
  const listeOrdre = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!listeOrdre.current) return;
    const s = Sortable.create(listeOrdre.current, {
      handle: '.poignee', animation: 150,
      onEnd: evt => {
        // Preact rerend la liste : on remet le DOM d'origine avant de changer l'état.
        const { item, from, oldIndex, newIndex } = evt;
        const reste = [...from.children].filter(c => c !== item);
        from.insertBefore(item, reste[oldIndex!] ?? null);
        if (oldIndex === newIndex) return;
        setOrdre(o => { const copie = [...o]; const [bouge] = copie.splice(oldIndex!, 1); copie.splice(newIndex!, 0, bouge); return copie; });
      },
    });
    return () => s.destroy();
  }, [ordre.length]);
  const texteMarge = (x: number) => x > 0 ? `${x} jour${x > 1 ? 's' : ''} de marge` : x === 0 ? 'aucune marge' : `${-x} jour${-x > 1 ? 's' : ''} APRÈS la deadline`;
  return (
    <Feuille titre="Répartir les étapes" onFermer={onFermer} pied={<>
      <button class="bouton" onClick={onFermer}>Annuler</button>
      <button class="bouton principal" disabled={!nEtapes && !n}
        onClick={() => {
          faire([...appliquerPlan(plan, ordre), { table: 'Costumes' as const, id: costumeId, champs: { fin_prevue: fin } }], 'Planning mis à jour');
          onFermer();
        }}>Planifier {n} pièce{n > 1 ? 's' : ''}</button>
    </>}>
      <p class="texte-centre">Les étapes restantes de <strong>{costume.nom}</strong> reçoivent une deadline entre aujourd'hui et la fin prévue, proportionnellement à leur durée.</p>
      <Champ label="Tout terminer au plus tard le" aide={deadline ? `Deadline : ${jourCourt(deadline)} – ${texteMarge(marge)}` : undefined}>
        <ChoixDate label="fin prévue du costume" valeur={fin} min={jour.value} onChange={v => setFin(v || finPlanifiable(deadline, jour.value))} />
      </Champ>
      <Champ label="Ordre de fabrication">
        <ol class="ordre-pieces" ref={listeOrdre}>
          {ordre.map((id, i) => (
            <li key={id} data-id={id}>
              <span class="poignee" aria-label={`Déplacer ${d.Pieces[id]?.nom}`} title="Glisser pour changer l'ordre"><Icone nom="poignee" taille={16} /></span>
              <span class="rang">{i + 1}</span>
              <span class="nom">{d.Pieces[id]?.nom}</span>
              {!plan.pieces[id] && <span class="petit-texte">dates à elle</span>}
            </li>
          ))}
        </ol>
      </Champ>
      {fixees > 0 && <p class="petit-texte">{fixees} pièce{fixees > 1 ? 's gardent leur' : ' garde sa'} fenêtre : elle{fixees > 1 ? 's ont' : ' a'} déjà un début ou une deadline. « Effacer le planning » les libère.</p>}
      <p class="petit-texte">{nEtapes > 1 ? `${nEtapes} étapes recevront leur deadline` : nEtapes === 1 ? '1 étape recevra sa deadline' : 'Aucune étape à dater'}</p>
    </Feuille>
  );
}

// ---------- Effacer le planning ----------

/**
 * Bouton « Effacer le planning » : la fenêtre des pièces choisies (début, deadline) et les deadlines
 * de leurs étapes. N'apparaît que s'il y a quelque chose à effacer.
 */
export function EffacerDatesPrevues({ costumeId }: { costumeId: string }) {
  const d = donnees.value;
  const [ouvert, setOuvert] = useState(false);
  const planifiee = (p: Ligne) => !!(p.debut || p.deadline) || pistesDe(d, p.id).some(x => x.deadline);
  if (!piecesDe(d, costumeId).some(planifiee)) return null;
  return (
    <>
      <button type="button" class="bouton" onClick={() => setOuvert(true)}><Icone nom="croix" taille={16} />Effacer le planning</button>
      {ouvert && <EffacerDuCostume costumeId={costumeId} onFermer={() => setOuvert(false)} />}
    </>
  );
}

/** Tout le costume, ou seulement certaines pièces : chaque pièce planifiée a sa case, cochée par défaut. */
function EffacerDuCostume({ costumeId, onFermer }: { costumeId: string; onFermer: () => void }) {
  const d = donnees.value;
  const planifiees = piecesDe(d, costumeId)
    .map(p => ({ piece: p, dates: (p.debut ? 1 : 0) + (p.deadline ? 1 : 0) + pistesDe(d, p.id).filter(x => x.deadline).length }))
    .filter(x => x.dates);
  const [choisies, setChoisies] = useState<Set<string>>(() => new Set(planifiees.map(x => x.piece.id)));
  const basculer = (id: string, v: boolean) => { const s = new Set(choisies); if (v) s.add(id); else s.delete(id); setChoisies(s); };
  const retenues = planifiees.filter(x => choisies.has(x.piece.id));
  const dates = retenues.reduce((s, x) => s + x.dates, 0);
  return (
    <Feuille titre="Effacer le planning ?" onFermer={onFermer} pied={<>
      <button class="bouton" onClick={onFermer}>Annuler</button>
      <button class="bouton danger" disabled={!retenues.length}
        onClick={() => { faire(effacerPlanning(d, retenues.map(x => x.piece.id)), 'Planning effacé'); onFermer(); }}>
        Effacer {dates} date{dates > 1 ? 's' : ''}
      </button>
    </>}>
      <p>Choisis les pièces qui perdent leur fenêtre (début, deadline) et les deadlines de leurs étapes.</p>
      <label class="interrupteur">
        <input type="checkbox" checked={choisies.size === planifiees.length}
          onChange={e => setChoisies(new Set((e.target as HTMLInputElement).checked ? planifiees.map(x => x.piece.id) : []))} />
        <span>Tout le costume</span>
      </label>
      <ul class="liste-simple">
        {planifiees.map(x => (
          <li key={x.piece.id}>
            <label class="interrupteur">
              <input type="checkbox" checked={choisies.has(x.piece.id)} onChange={e => basculer(x.piece.id, (e.target as HTMLInputElement).checked)} />
              <span>{x.piece.nom}</span>
            </label>
            <span class="petit-texte">{x.dates} date{x.dates > 1 ? 's' : ''}</span>
          </li>
        ))}
      </ul>
      <p class="petit-texte">La deadline du costume n'est pas touchée. « Annuler » dans le bandeau revient en arrière.</p>
    </Feuille>
  );
}
