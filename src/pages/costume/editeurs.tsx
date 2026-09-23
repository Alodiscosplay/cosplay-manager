// Feuilles d'édition : étape, pièce, piste, attentes, « Coller une liste », modèles, Répartir.
import { useState } from 'preact/hooks';
import { donnees, faire, jour } from '../../store/store';
import { piecesDe, pistesDe, etapesDePiste, etapesDePiece, ligne, tous, idsAttendus, nomAttendu, ordreSuivant, fournituresDe, piecesDeFourniture } from '../../logique/acces';
import { cleNom } from '../../logique/budget';
import { creeraitBoucle, statutStockePiece, champsStatutPiece } from '../../logique/disponibilite';
import { analyserListe, compter, versTexte } from '../../logique/collerListe';
import { repartirPiece, repartirCostume, deadlinePiece, deadlineCostume, finPlanifiable } from '../../logique/planning';
import { jourCourt, ecartJours } from '../../logique/dates';
import { DUREES, NOMS_DUREES, STATUTS_PIECE, bool, liste, txtListe, type Duree, type Ligne, type NomTable } from '../../modele/schema';
import { supprimer, appliquerListe, insererModele, ajouterModeleDansPiste, deplacerEtape, cocherEtape, appliquerRepartition, nouvelId } from '../../store/operations';
import { Feuille, Champ, Texte, ChoixDate, Selection, Confirmer } from '../../composants/base';
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
        <Champ label="Prévue le"><ChoixDate label="date prévue" valeur={e.date_prevue ?? ''} onChange={v => m({ date_prevue: v })} /></Champ>
        <Champ label="Deadline"><ChoixDate label="deadline" valeur={e.deadline ?? ''} onChange={v => m({ deadline: v })} /></Champ>
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
  const [repartir, setRepartir] = useState(false);
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
      {dl && <button class="bouton" onClick={() => setRepartir(true)}>Répartir les étapes</button>}
      {repartir && <Repartir pieceId={id} onFermer={() => setRepartir(false)} />}
      <EffacerDatesPrevues pieceId={id} />
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

export function Repartir({ pieceId, costumeId, onFermer }: { pieceId?: string; costumeId?: string; onFermer: () => void }) {
  const d = donnees.value;
  const cible = pieceId ? d.Pieces[pieceId] : d.Costumes[costumeId!];
  const deadline = pieceId ? deadlinePiece(d, cible) : deadlineCostume(d, cible);
  // Par défaut, une semaine de marge avant la deadline — mais c'est à elle de fixer sa limite.
  const [fin, setFin] = useState(() => finPlanifiable(deadline, jour.value));
  const finOk = fin >= jour.value;
  const marge = ecartJours(fin, deadline);
  const r = finOk
    ? (pieceId ? repartirPiece(d, pieceId, jour.value, fin) : repartirCostume(d, costumeId!, jour.value, fin, Math.max(0, marge)))
    : {};
  const n = Object.keys(r).length;
  const deja = (pieceId ? etapesDePiece(d, pieceId) : piecesDe(d, costumeId!).flatMap(p => etapesDePiece(d, p.id)))
    .filter(e => !bool(e.fait) && e.date_prevue).length;
  return (
    <Feuille titre="Répartir les étapes" onFermer={onFermer} pied={<>
      <button class="bouton" onClick={onFermer}>Annuler</button>
      <button class="bouton principal" disabled={!n} onClick={() => { faire(appliquerRepartition(r), 'Sous-étapes planifiées'); onFermer(); }}>
        Planifier {n} sous-étape{n > 1 ? 's' : ''}
      </button>
    </>}>
      <p>Les sous-étapes restantes de <strong>{cible.nom}</strong> reçoivent une date prévue entre aujourd'hui et la limite choisie, proportionnellement à leur durée, dans l'ordre de chaque étape. Les étapes avancent en parallèle ; une étape qui en attend d'autres vient après.</p>
      <Champ label="Tout terminer au plus tard le" aide={deadline ? `Deadline : ${jourCourt(deadline)} — garde de la marge en cas de retard` : undefined}>
        <ChoixDate label="limite de planification" valeur={fin} min={jour.value} onChange={v => setFin(v || finPlanifiable(deadline, jour.value))} />
      </Champ>
      {finOk && deadline && (marge > 0
        ? <p class="petit-texte">{marge} jour{marge > 1 ? 's' : ''} de marge avant la deadline du {jourCourt(deadline)}</p>
        : marge === 0
          ? <p class="petit-texte">Aucune marge : la dernière sous-étape tombe le jour de la deadline.</p>
          : <p class="erreur">Cette limite est {-marge} jour{-marge > 1 ? 's' : ''} APRÈS la deadline du {jourCourt(deadline)}</p>)}
      {deja > 0 && <p>{deja} sous-étape{deja > 1 ? 's avaient' : ' avait'} déjà une date prévue : elle{deja > 1 ? 's seront remplacées' : ' sera remplacée'}.</p>}
      <p class="petit-texte">Tu pourras ensuite corriger chaque date à la main. « Annuler » dans le bandeau revient en arrière.</p>
    </Feuille>
  );
}


// ---------- Annuler une répartition ----------

/**
 * Bouton « Effacer les dates prévues » (d'une pièce ou de tout le costume), avec confirmation.
 * N'apparaît que s'il y a des dates prévues. Deadlines et dates de début ne sont pas touchées.
 */
export function EffacerDatesPrevues({ costumeId, pieceId }: { costumeId?: string; pieceId?: string }) {
  const d = donnees.value;
  const [ouvert, setOuvert] = useState(false);
  const etapes = pieceId ? etapesDePiece(d, pieceId) : piecesDe(d, costumeId!).flatMap(p => etapesDePiece(d, p.id));
  if (!etapes.some(e => e.date_prevue)) return null;
  return (
    <>
      <button type="button" class="bouton" onClick={() => setOuvert(true)}><Icone nom="croix" taille={16} />Effacer les dates prévues</button>
      {ouvert && (pieceId
        ? <EffacerDUnePiece pieceId={pieceId} onFermer={() => setOuvert(false)} />
        : <EffacerDuCostume costumeId={costumeId!} onFermer={() => setOuvert(false)} />)}
    </>
  );
}

const effacerDates = (etapes: Ligne[]) =>
  etapes.map(e => ({ table: 'Etapes' as const, id: e.id, champs: { date_prevue: '' } }));

const PIED_EFFACER = 'Les deadlines et les dates de début ne sont pas touchées. « Annuler » dans le bandeau revient en arrière.';

function EffacerDUnePiece({ pieceId, onFermer }: { pieceId: string; onFermer: () => void }) {
  const d = donnees.value;
  const datees = etapesDePiece(d, pieceId).filter(e => e.date_prevue);
  return (
    <Confirmer titre="Effacer les dates prévues ?" bouton={`Effacer ${datees.length} date${datees.length > 1 ? 's' : ''}`} danger
      onNon={onFermer}
      onOui={() => { faire(effacerDates(datees), 'Dates prévues effacées'); onFermer(); }}
      texte={<>
        <p>Les {datees.length} sous-étape{datees.length > 1 ? 's' : ''} de la pièce « {d.Pieces[pieceId]?.nom} » qui ont une date prévue la perdent, qu'elle vienne de « Répartir » ou d'une saisie à la main.</p>
        <p class="petit-texte">{PIED_EFFACER}</p>
      </>} />
  );
}

/** Tout le costume, ou seulement certaines pièces : chaque pièce datée a sa case, cochée par défaut. */
function EffacerDuCostume({ costumeId, onFermer }: { costumeId: string; onFermer: () => void }) {
  const d = donnees.value;
  const parPiece = piecesDe(d, costumeId)
    .map(p => ({ piece: p, datees: etapesDePiece(d, p.id).filter(e => e.date_prevue) }))
    .filter(x => x.datees.length);
  const [choisies, setChoisies] = useState<Set<string>>(() => new Set(parPiece.map(x => x.piece.id)));
  const basculer = (id: string, v: boolean) => { const s = new Set(choisies); if (v) s.add(id); else s.delete(id); setChoisies(s); };
  const retenues = parPiece.filter(x => choisies.has(x.piece.id)).flatMap(x => x.datees);
  const toutes = choisies.size === parPiece.length;
  return (
    <Feuille titre="Effacer les dates prévues ?" onFermer={onFermer} pied={<>
      <button class="bouton" onClick={onFermer}>Annuler</button>
      <button class="bouton danger" disabled={!retenues.length}
        onClick={() => { faire(effacerDates(retenues), 'Dates prévues effacées'); onFermer(); }}>
        Effacer {retenues.length} date{retenues.length > 1 ? 's' : ''}
      </button>
    </>}>
      <p>Choisis les pièces dont les sous-étapes perdent leur date prévue, qu'elle vienne de « Répartir » ou d'une saisie à la main.</p>
      <label class="interrupteur">
        <input type="checkbox" checked={toutes} onChange={e => setChoisies(new Set((e.target as HTMLInputElement).checked ? parPiece.map(x => x.piece.id) : []))} />
        <span>Tout le costume</span>
      </label>
      <ul class="liste-simple">
        {parPiece.map(x => (
          <li key={x.piece.id}>
            <label class="interrupteur">
              <input type="checkbox" checked={choisies.has(x.piece.id)} onChange={e => basculer(x.piece.id, (e.target as HTMLInputElement).checked)} />
              <span>{x.piece.nom}</span>
            </label>
            <span class="petit-texte">{x.datees.length} date{x.datees.length > 1 ? 's' : ''}</span>
          </li>
        ))}
      </ul>
      <p class="petit-texte">{PIED_EFFACER}</p>
    </Feuille>
  );
}
