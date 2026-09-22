// Feuilles d'édition : étape, pièce, piste, attentes, « Coller une liste », modèles, Répartir.
import { useState } from 'preact/hooks';
import { donnees, faire, jour } from '../../store/store';
import { piecesDe, pistesDe, etapesDePiste, etapesDePiece, ligne, tous, idsAttendus, nomAttendu, ordreSuivant } from '../../logique/acces';
import { creeraitBoucle } from '../../logique/disponibilite';
import { analyserListe, compter, versTexte } from '../../logique/collerListe';
import { repartirPiece, repartirCostume, deadlinePiece, deadlineCostume } from '../../logique/planning';
import { jourCourt } from '../../logique/dates';
import { DUREES, NOMS_DUREES, STATUTS_PIECE, bool, txtBool, liste, txtListe, type Duree, type Ligne, type NomTable } from '../../modele/schema';
import { supprimer, appliquerListe, insererModele, deplacerEtape, cocherEtape, appliquerRepartition, nouvelId } from '../../store/operations';
import { Feuille, Champ, Texte, ChoixDate, Selection, Confirmer } from '../../composants/base';
import { maj } from '../Costume';

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
    <Feuille titre="Étape" onFermer={onFermer} pied={<>
      <button class="bouton danger" onClick={() => { faire(supprimer('Etapes', id), `Étape « ${e.titre} » supprimée`); onFermer(); }}>Supprimer</button>
      <button class="bouton principal" onClick={onFermer}>Terminé</button>
    </>}>
      <Champ label="Titre"><Texte valeur={e.titre} onValider={v => v && m({ titre: v })} /></Champ>
      <Champ label="Détail (facultatif)"><Texte multiligne valeur={e.detail ?? ''} onValider={v => m({ detail: v })} placeholder="Précisions, mesures, référence de la notice…" /></Champ>
      <label class="interrupteur">
        <input type="checkbox" checked={bool(e.fait)} onChange={ev => faire(cocherEtape(d, id, (ev.target as HTMLInputElement).checked, jour.value))} />
        <span>Faite{bool(e.fait) && e.fait_le ? ` le ${jourCourt(e.fait_le)}` : ''}</span>
      </label>
      <div class="deux-colonnes">
        <Champ label="Durée" aide="Plus c'est long, plus l'étape compte dans le %.">
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
        <Champ label="Piste">
          <Selection label="Piste" valeur={e.piste_id} options={pistes.map(p => [p.id, p.nom || 'Piste principale'] as [string, string])}
            onChange={v => faire(deplacerEtape(d, id, v, etapesDePiste(d, v).length))} />
        </Champ>
      )}
      <ChoixAttentes table="Etapes" l={e} candidats={candidatsAttente(d, piece, e.piste_id)}
        aide="Cas particulier : cette étape attend aussi la fin d'autres pistes ou pièces." />
    </Feuille>
  );
}

// ---------- Pièce ----------

export function EditeurPiece({ id, onFermer }: { id: string; onFermer: () => void }) {
  const d = donnees.value;
  const p = d.Pieces[id];
  const [repartir, setRepartir] = useState(false);
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
        <Selection label="Statut" valeur={p.statut || 'à venir'} options={STATUTS_PIECE} onChange={v => m({ statut: v })} />
      </Champ>
      <div class="deux-colonnes">
        <Champ label="Début (facultatif)" aide="Le jour venu, la pièce passe en cours toute seule.">
          <ChoixDate label="date de début" valeur={p.debut ?? ''} onChange={v => m({ debut: v })} />
        </Champ>
        <Champ label="Deadline (facultative)"><ChoixDate label="deadline" valeur={p.deadline ?? ''} onChange={v => m({ deadline: v })} /></Champ>
      </div>
      <Champ label="Patron (facultatif)"><Texte valeur={p.patron ?? ''} placeholder="ex. TV341 vue B" onValider={v => m({ patron: v })} /></Champ>
      <Champ label="Notes"><Texte multiligne valeur={p.notes ?? ''} onValider={v => m({ notes: v })} /></Champ>
      <ChoixAttentes table="Pieces" l={p} candidats={autres} aide="La pièce entière attend que ces pièces soient finies." />
      {dl && <button class="bouton" onClick={() => setRepartir(true)}>Répartir les étapes jusqu'au {jourCourt(dl)}</button>}
      {repartir && <Repartir pieceId={id} onFermer={() => setRepartir(false)} />}
    </Feuille>
  );
}

// ---------- Piste ----------

export function EditeurPiste({ id, onFermer }: { id: string; onFermer: () => void }) {
  const d = donnees.value;
  const p = d.Pistes[id];
  const [modele, setModele] = useState(false);
  if (!p) return null;
  const piece = d.Pieces[p.piece_id];
  const m = (champs: Record<string, string>) => maj('Pistes', id, champs);
  return (
    <Feuille titre="Piste" onFermer={onFermer} pied={<>
      <button class="bouton danger" onClick={() => { faire(supprimer('Pistes', id), 'Piste supprimée'); onFermer(); }}>Supprimer</button>
      <button class="bouton principal" onClick={onFermer}>Terminé</button>
    </>}>
      <p class="petit-texte">Les étapes d'une piste se suivent ; les pistes d'une même pièce avancent en parallèle.</p>
      <Champ label="Nom"><Texte valeur={p.nom ?? ''} placeholder="ex. Bijoux" onValider={v => m({ nom: v })} /></Champ>
      <label class="interrupteur">
        <input type="checkbox" checked={bool(p.active)} onChange={e => m({ active: txtBool((e.target as HTMLInputElement).checked) })} />
        <span>Active : sa prochaine étape remonte dans « À faire »</span>
      </label>
      <div class="deux-colonnes">
        <Champ label="Début (facultatif)"><ChoixDate label="date de début" valeur={p.debut ?? ''} onChange={v => m({ debut: v })} /></Champ>
        <Champ label="Deadline (facultative)"><ChoixDate label="deadline" valeur={p.deadline ?? ''} onChange={v => m({ deadline: v })} /></Champ>
      </div>
      <ChoixAttentes table="Pistes" l={p} candidats={candidatsAttente(d, piece, id)} aide="ex. « Montage » attend « Tissu » et « Bijoux »." />
      <button class="bouton" onClick={() => setModele(true)}>Enregistrer comme modèle</button>
      {modele && <EnregistrerModele pisteId={id} onFermer={() => setModele(false)} />}
    </Feuille>
  );
}

/** Ce qu'on peut attendre : les autres pistes de la pièce, et les autres pièces du costume. */
function candidatsAttente(d: typeof donnees.value, piece: Ligne | undefined, sauf: string): { id: string; nom: string; groupe?: string }[] {
  if (!piece) return [];
  const pistes = pistesDe(d, piece.id).filter(p => p.id !== sauf).map(p => ({ id: p.id, nom: p.nom || 'Piste principale', groupe: 'Pistes de cette pièce' }));
  const pieces = piecesDe(d, piece.costume_id).filter(p => p.id !== piece.id).map(p => ({ id: p.id, nom: p.nom, groupe: 'Autres pièces' }));
  return [...pistes, ...pieces];
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

// ---------- Coller une liste ----------

export function CollerListe({ costumeId, pieceId, onFermer }: { costumeId: string; pieceId?: string; onFermer: () => void }) {
  const [texte, setTexte] = useState('');
  const d = donnees.value;
  const l = analyserListe(texte);
  const n = compter(l);
  const piece = pieceId ? ligne(d, 'Pieces', pieceId) : undefined;
  const sansPiece = l.pieces[0] && !l.pieces[0].nom ? l.pieces[0].pistes.reduce((s, p) => s + p.etapes.length, 0) : 0;
  const ajouter = () => {
    faire(appliquerListe(d, l, costumeId, pieceId), `${n.etapes} étape${n.etapes > 1 ? 's' : ''} ajoutée${n.etapes > 1 ? 's' : ''}`);
    onFermer();
  };
  return (
    <Feuille titre={piece ? `Coller des étapes dans « ${piece.nom} »` : 'Coller une liste'} large onFermer={onFermer} pied={<>
      <button class="bouton" onClick={onFermer}>Annuler</button>
      <button class="bouton principal" disabled={!n.etapes && !n.pieces} onClick={ajouter}>Ajouter</button>
    </>}>
      <p class="petit-texte">Une étape par ligne. <code>## Nom</code> crée une pièce, <code>### Nom</code> une piste (en parallèle). Une durée entre parenthèses en fin de ligne : <code>(rapide)</code>, <code>(long)</code>, <code>(très long)</code>.</p>
      <textarea class="zone-collage" rows={12} autoFocus value={texte} onInput={e => setTexte((e.target as HTMLTextAreaElement).value)}
        placeholder={piece ? 'Couper le tissu\nAssembler (long)\nPerles sur le col (très long)' : '## Chapeau\n### Tissu\nPatronner\nCouper\n### Bijoux\nModéliser (long)\nCouler en Fimo\n## Robe\nToile et essayage (long)'} />
      <p class="apercu" aria-live="polite">
        {n.pieces > 0 && `${n.pieces} pièce${n.pieces > 1 ? 's' : ''} · `}{n.etapes} étape{n.etapes > 1 ? 's' : ''}
        {sansPiece > 0 && !piece && ` · ${sansPiece} sans « ## » iront dans une nouvelle pièce`}
      </p>
    </Feuille>
  );
}

// ---------- Modèles ----------

export function ChoixModele({ pieceId, onFermer }: { pieceId: string; onFermer: () => void }) {
  const d = donnees.value;
  const modeles = tous(d, 'Modeles');
  return (
    <Feuille titre="Ajouter une piste depuis un modèle" onFermer={onFermer}>
      {!modeles.length && <p>Aucun modèle. Crée-en dans Réglages, ou enregistre une piste existante comme modèle.</p>}
      <div class="menu-liste">
        {modeles.map(mo => {
          const etapes = analyserListe(mo.contenu).pieces.flatMap(p => p.pistes.flatMap(pi => pi.etapes));
          return (
            <button class="menu-action modele" onClick={() => { faire(insererModele(d, pieceId, mo.nom, analyserListe(mo.contenu)), `Piste « ${mo.nom} » ajoutée`); onFermer(); }}>
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
      <pre class="apercu-modele">{contenu || '(piste vide)'}</pre>
    </Feuille>
  );
}

// ---------- Répartir ----------

export function Repartir({ pieceId, costumeId, onFermer }: { pieceId?: string; costumeId?: string; onFermer: () => void }) {
  const d = donnees.value;
  const cible = pieceId ? d.Pieces[pieceId] : d.Costumes[costumeId!];
  const fin = pieceId ? deadlinePiece(d, cible) : deadlineCostume(d, cible);
  const r = pieceId ? repartirPiece(d, pieceId, jour.value, fin) : repartirCostume(d, costumeId!, jour.value, fin);
  const n = Object.keys(r).length;
  const deja = (pieceId ? etapesDePiece(d, pieceId) : piecesDe(d, costumeId!).flatMap(p => etapesDePiece(d, p.id)))
    .filter(e => !bool(e.fait) && e.date_prevue).length;
  return (
    <Confirmer titre="Répartir les étapes" bouton={`Planifier ${n} étape${n > 1 ? 's' : ''}`} onNon={onFermer}
      onOui={() => { faire(appliquerRepartition(r), 'Étapes planifiées'); onFermer(); }}
      texte={<>
        <p>Les étapes restantes de <strong>{cible.nom}</strong> reçoivent une date prévue entre aujourd'hui et le <strong>{jourCourt(fin)}</strong>, proportionnellement à leur durée, dans l'ordre de chaque piste. Les pistes avancent en parallèle ; une piste qui en attend d'autres vient après.</p>
        {deja > 0 && <p>{deja} étape{deja > 1 ? 's avaient' : ' avait'} déjà une date prévue : elle{deja > 1 ? 's seront remplacées' : ' sera remplacée'}.</p>}
        <p class="petit-texte">Tu pourras ensuite corriger chaque date à la main. « Annuler » dans le bandeau revient en arrière.</p>
      </>} />
  );
}

