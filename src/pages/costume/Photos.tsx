import { useState } from 'preact/hooks';
import { donnees, faire, jour } from '../../store/store';
import { photosDe, piecesDe, etapesDePiece, ligne } from '../../logique/acces';
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
  const [filtre, setFiltre] = useState('');
  const pieces = piecesDe(d, costume.id);
  const visibles = filtre ? photos.filter(p => p.piece_id === filtre) : photos;

  const ajouter = async (fichiers: FileList | null) => {
    if (!fichiers?.length) return;
    setEnvoi(fichiers.length);
    const ch = [];
    for (const f of Array.from(fichiers)) {
      const id = await ajouterImage(f);
      const date = f.lastModified ? new Date(f.lastModified).toISOString().slice(0, 10) : jour.value;
      ch.push({ table: 'Photos' as const, id: nouvelId(), champs: { costume_id: costume.id, piece_id: filtre, drive_id: id, date, dans_wip: OUI } });
    }
    faire(ch);
    setEnvoi(0);
  };

  return (
    <section>
      <div class="barre-outils">
        <label class="bouton principal">
          <Icone nom="photo" />{envoi ? `Ajout de ${envoi} photo${envoi > 1 ? 's' : ''}…` : 'Ajouter des photos'}
          <input type="file" accept="image/*" multiple class="cache" onChange={e => ajouter((e.target as HTMLInputElement).files)} />
        </label>
        {pieces.length > 0 && (
          <Selection label="Filtrer par pièce" valeur={filtre} options={[['', 'Toutes les pièces'], ...pieces.map(p => [p.id, p.nom] as [string, string])]} onChange={setFiltre} />
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
              <span>{p.legende || ligne(d, 'Pieces', p.piece_id)?.nom || ''}</span>
              <span class="petit-texte">{jourCourt(p.date)}</span>
            </span>
          </button>
        ))}
      </div>
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
  const etapes = p.piece_id ? etapesDePiece(d, p.piece_id) : [];
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
          <Selection label="Pièce" valeur={p.piece_id ?? ''} options={[['', '— Général'], ...pieces.map(x => [x.id, x.nom] as [string, string])]} onChange={v => m({ piece_id: v, etape_id: '' })} />
        </Champ>
      </div>
      {etapes.length > 0 && (
        <Champ label="Sous-étape (facultatif)">
          <Selection label="Sous-étape" valeur={p.etape_id ?? ''} options={[['', '—'], ...etapes.map(e => [e.id, e.titre] as [string, string])]} onChange={v => m({ etape_id: v })} />
        </Champ>
      )}
      <label class="interrupteur">
        <input type="checkbox" checked={bool(p.dans_wip)} onChange={e => m({ dans_wip: txtBool((e.target as HTMLInputElement).checked) })} />
        <span>Dans le dossier WIP</span>
      </label>
      <button class="bouton" onClick={() => { maj('Costumes', costume.id, { image_ref: p.drive_id }); onFermer(); }}>Utiliser comme image de référence</button>
    </Feuille>
  );
}
