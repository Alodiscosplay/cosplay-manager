import { useState } from 'preact/hooks';
import { donnees, faire, jour } from '../../store/store';
import { photosDe, piecesDe, pistesDe, etapesDePiste, ligne } from '../../logique/acces';
import { jourCourt } from '../../logique/dates';
import { bool, txtBool, OUI, type Ligne } from '../../modele/schema';
import { nouvelId, supprimer } from '../../store/operations';
import { ajouterImage } from '../../store/photos';
import { PhotoImg, Feuille, Champ, Texte, ChoixDate, Selection, Vide, Puce } from '../../composants/base';
import { Icone } from '../../composants/Icone';
import { maj } from '../Costume';

export function OngletPhotos({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const photos = photosDe(d, costume.id);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(0);
  const [filtre, setFiltre] = useState(''); // '' = toutes, '__divers' = à trier, sinon id de pièce
  const [ajout, setAjout] = useState(false);
  const pieces = piecesDe(d, costume.id);
  const aTrier = (p: Ligne) => !p.piece_id || !pieces.some(x => x.id === p.piece_id);
  const nbATrier = photos.filter(aTrier).length;
  const visibles = filtre === '__divers' ? photos.filter(aTrier) : filtre ? photos.filter(p => p.piece_id === filtre) : photos;

  /** Ajoute les photos avec le rattachement choisi avant de les sélectionner (pièce vide = divers, à trier). */
  const ajouter = async (fichiers: FileList | null, rattachement: { piece_id: string; piste_id: string }) => {
    if (!fichiers?.length) return;
    setAjout(false);
    setEnvoi(fichiers.length);
    const ch = [];
    for (const f of Array.from(fichiers)) {
      const id = await ajouterImage(f);
      const date = f.lastModified ? new Date(f.lastModified).toISOString().slice(0, 10) : jour.value;
      ch.push({ table: 'Photos' as const, id: nouvelId(), champs: { costume_id: costume.id, ...rattachement, drive_id: id, date, dans_wip: OUI } });
    }
    faire(ch);
    setEnvoi(0);
  };

  return (
    <section>
      <div class="barre-outils">
        <button class="bouton principal" disabled={!!envoi} onClick={() => setAjout(true)}>
          <Icone nom="photo" />{envoi ? `Ajout de ${envoi} photo${envoi > 1 ? 's' : ''}…` : 'Ajouter des photos'}
        </button>
        {pieces.length > 0 && (
          <Selection label="Filtrer par pièce" valeur={filtre} onChange={setFiltre}
            options={[['', 'Toutes les photos'], ...pieces.map(p => [p.id, p.nom] as [string, string]), ['__divers', `Divers (à trier)${nbATrier ? ` · ${nbATrier}` : ''}`]]} />
        )}
        <span class="petit-texte">{photos.filter(p => bool(p.dans_wip)).length} dans le dossier WIP</span>
      </div>
      {!visibles.length && <Vide icone="photo" titre="Aucune photo"><p>Les photos d'avancement servent au dossier WIP. Elles sont réduites avant l'envoi dans ton Drive.</p></Vide>}
      <div class="grille-photos">
        {visibles.map(p => (
          <button class="tuile-photo" onClick={() => setOuverte(p.id)}>
            <PhotoImg id={p.drive_id} alt={p.legende || 'Photo'} />
            <span class="tuile-legende">
              {bool(p.dans_wip) && <Puce ton="accent">WIP</Puce>}
              {aTrier(p) && <Puce ton="orange">à trier</Puce>}
              <span>{p.legende || ligne(d, 'Pieces', p.piece_id)?.nom || ''}</span>
              <span class="petit-texte">{jourCourt(p.date)}</span>
            </span>
          </button>
        ))}
      </div>
      {ajout && <AjoutPhotos costume={costume} pieceParDefaut={filtre && filtre !== '__divers' ? filtre : ''}
        onFichiers={ajouter} onFermer={() => setAjout(false)} />}
      {ouverte && <EditeurPhoto id={ouverte} costume={costume} onFermer={() => setOuverte(null)} />}
    </section>
  );
}

function EditeurPhoto({ id, costume, onFermer }: { id: string; costume: Ligne; onFermer: () => void }) {
  const d = donnees.value;
  const p = d.Photos[id];
  if (!p) return null;
  const m = (champs: Record<string, string>) => maj('Photos', id, champs);
  const pieces = piecesDe(d, costume.id);
  const pistes = p.piece_id ? pistesDe(d, p.piece_id) : [];
  // Étape choisie : la sienne, ou celle de la sous-étape (photos rattachées avant l'ajout du choix d'étape).
  const pisteId = p.piste_id || ligne(d, 'Etapes', p.etape_id)?.piste_id || '';
  const sousEtapes = pisteId ? etapesDePiste(d, pisteId) : [];
  return (
    <Feuille titre="Photo" large onFermer={onFermer} pied={<>
      <button class="bouton danger" onClick={() => { faire(supprimer('Photos', id), 'Photo supprimée'); onFermer(); }}>Supprimer</button>
      <button class="bouton principal" onClick={onFermer}>Terminé</button>
    </>}>
      <div class="photo-grande"><PhotoImg id={p.drive_id} alt={p.legende || 'Photo'} /></div>
      <Champ label="Légende"><Texte valeur={p.legende ?? ''} onValider={v => m({ legende: v })} /></Champ>
      <div class="deux-colonnes">
        <Champ label="Date"><ChoixDate label="date" valeur={p.date ?? ''} onChange={v => m({ date: v })} /></Champ>
        <Champ label="Pièce">
          <Selection label="Pièce" valeur={p.piece_id ?? ''} options={[['', 'Divers (à trier)'], ...pieces.map(x => [x.id, x.nom] as [string, string])]} onChange={v => m({ piece_id: v, piste_id: '', etape_id: '' })} />
        </Champ>
      </div>
      {pistes.length > 0 && (
        <div class="deux-colonnes">
          <Champ label="Étape (facultatif)">
            <Selection label="Étape" valeur={pisteId} options={[['', '—'], ...pistes.map(x => [x.id, x.nom || 'Étape principale'] as [string, string])]}
              onChange={v => m({ piste_id: v, etape_id: '' })} />
          </Champ>
          {pisteId && sousEtapes.length > 0 && (
            <Champ label="Sous-étape (facultatif)">
              <Selection label="Sous-étape" valeur={p.etape_id ?? ''} options={[['', '— toute l\'étape'], ...sousEtapes.map(e => [e.id, e.titre] as [string, string])]}
                onChange={v => m({ piste_id: pisteId, etape_id: v })} />
            </Champ>
          )}
        </div>
      )}
      <label class="interrupteur">
        <input type="checkbox" checked={bool(p.dans_wip)} onChange={e => m({ dans_wip: txtBool((e.target as HTMLInputElement).checked) })} />
        <span>Dans le dossier WIP</span>
      </label>
      <button class="bouton" onClick={() => { maj('Costumes', costume.id, { image_ref: p.drive_id }); onFermer(); }}>Utiliser comme image de référence</button>
    </Feuille>
  );
}

/** Avant de choisir les fichiers : à quelle pièce (et éventuellement quelle étape) rattacher les photos. */
function AjoutPhotos({ costume, pieceParDefaut, onFichiers, onFermer }: {
  costume: Ligne; pieceParDefaut: string; onFichiers: (f: FileList | null, r: { piece_id: string; piste_id: string }) => void; onFermer: () => void;
}) {
  const d = donnees.value;
  const [pieceId, setPieceId] = useState(pieceParDefaut);
  const [pisteId, setPisteId] = useState('');
  const pieces = piecesDe(d, costume.id);
  const pistes = pieceId ? pistesDe(d, pieceId) : [];
  return (
    <Feuille titre="Ajouter des photos" onFermer={onFermer} pied={<>
      <button class="bouton" onClick={onFermer}>Annuler</button>
      <label class="bouton principal">
        <Icone nom="photo" />Choisir les photos
        <input type="file" accept="image/*" multiple class="cache"
          onChange={e => onFichiers((e.target as HTMLInputElement).files, { piece_id: pieceId, piste_id: pisteId })} />
      </label>
    </>}>
      <Champ label="Pièce">
        <Selection label="Pièce" valeur={pieceId} onChange={v => { setPieceId(v); setPisteId(''); }}
          options={[['', 'Divers (à trier)'], ...pieces.map(p => [p.id, p.nom] as [string, string])]} />
      </Champ>
      {pistes.length > 0 && (
        <Champ label="Étape (facultatif)">
          <Selection label="Étape" valeur={pisteId} onChange={setPisteId}
            options={[['', '—'], ...pistes.map(p => [p.id, p.nom || 'Étape principale'] as [string, string])]} />
        </Champ>
      )}
      {!pieceId && <p class="petit-texte">Les photos « divers » restent à trier : ouvre-les une par une pour leur donner une pièce.</p>}
    </Feuille>
  );
}
