import { useEffect, useState } from 'preact/hooks';
import { donnees, faire, jour, mode, montrerToast, photosSurDrive } from '../../store/store';
import { mettreALaCorbeille } from '../../sync/drive';
import { photosDe, piecesDe, pistesDe, etapesDePiste, ligne } from '../../logique/acces';
import { jourCourt } from '../../logique/dates';
import { bool, txtBool, OUI, vivant, type Ligne } from '../../modele/schema';
import { nouvelId, supprimer } from '../../store/operations';
import { ajouterImage } from '../../store/photos';
import { PhotoImg, Feuille, Champ, Texte, ChoixDate, Selection, Vide, Puce, Confirmer } from '../../composants/base';
import { Icone } from '../../composants/Icone';
import { maj } from '../Costume';

/** Deux sections : les photos de référence (le modèle) et les photos d'avancement (le WIP). */
export const REFERENCE = 'reference';
export const estReference = (p: Ligne) => p.type === REFERENCE;

export function OngletPhotos({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const photos = photosDe(d, costume.id);
  const [ouverte, setOuverte] = useState<string | null>(null);
  // Liste figée à l'ouverture : trier une photo « divers » ne la fait pas disparaître de la navigation.
  const [parcours, setParcours] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(0);
  const [filtre, setFiltre] = useState(''); // '' = toutes, '__divers' = à trier, sinon id de pièce
  const [ajout, setAjout] = useState(false);
  const pieces = piecesDe(d, costume.id);
  const references = photos.filter(estReference);
  const avancement = photos.filter(p => !estReference(p));
  const aTrier = (p: Ligne) => !p.piece_id || !pieces.some(x => x.id === p.piece_id);
  const nbATrier = avancement.filter(aTrier).length;
  const visibles = filtre === '__divers' ? avancement.filter(aTrier) : filtre ? avancement.filter(p => p.piece_id === filtre) : avancement;

  /** Ajoute les photos avec le rattachement choisi avant de les sélectionner (pièce vide = divers, à trier). */
  const ajouter = async (fichiers: FileList | null, rattachement: { piece_id: string; piste_id: string; type?: string }) => {
    if (!fichiers?.length) return;
    setAjout(false);
    setEnvoi(fichiers.length);
    const ch = [];
    for (const f of Array.from(fichiers)) {
      const id = await ajouterImage(f);
      const date = f.lastModified ? new Date(f.lastModified).toISOString().slice(0, 10) : jour.value;
      const reference = rattachement.type === REFERENCE;
      ch.push({ table: 'Photos' as const, id: nouvelId(), champs: { costume_id: costume.id, ...rattachement, drive_id: id, date, dans_wip: reference ? '' : OUI } });
    }
    faire(ch);
    setEnvoi(0);
  };

  const tuile = (p: Ligne, source: Ligne[]) => (
    <button class="tuile-photo" onClick={() => { setParcours(source.map(x => x.id)); setOuverte(p.id); }}>
      <PhotoImg id={p.drive_id} alt={p.legende || 'Photo'} />
      <span class="tuile-legende">
        {costume.image_ref === p.drive_id && <Puce ton="accent">image du costume</Puce>}
        {!estReference(p) && bool(p.dans_wip) && <Puce ton="accent">WIP</Puce>}
        {!estReference(p) && aTrier(p) && <Puce ton="orange">à trier</Puce>}
        <span>{p.legende || ligne(d, 'Pieces', p.piece_id)?.nom || ''}</span>
        <span class="petit-texte">{jourCourt(p.date)}</span>
      </span>
    </button>
  );

  return (
    <section class="onglet-photos">
      {!photosSurDrive.value && (
        <p class="bandeau-info"><Icone nom="info" taille={16} /><span>Tes photos sont stockées sur cet appareil. Pour en envoyer une copie sur ton Drive : <a href="#/reglages">Réglages › Photos</a>.</span></p>
      )}
      <h3 class="titre-section">Photos de référence</h3>
      <p class="petit-texte">Le personnage, les détails du costume d'origine, les croquis : ce qui sert de modèle. Elles ne vont pas dans le dossier WIP.</p>
      <div class="barre-outils">
        <label class="bouton principal">
          <Icone nom="photo" />Ajouter des références
          <input type="file" accept="image/*" multiple class="cache" disabled={!!envoi}
            onChange={e => ajouter((e.target as HTMLInputElement).files, { piece_id: '', piste_id: '', type: REFERENCE })} />
        </label>
      </div>
      {!references.length && <p class="petit-texte">Aucune photo de référence.</p>}
      <div class="grille-photos">{references.map(p => tuile(p, references))}</div>

      <h3 class="titre-section">Photos d'avancement (WIP)</h3>
      <p class="petit-texte">Le travail en cours, rattaché à une pièce et à une étape. C'est ce qui alimente le dossier WIP.</p>
      <div class="barre-outils">
        <button class="bouton principal" disabled={!!envoi} onClick={() => setAjout(true)}>
          <Icone nom="photo" />{envoi ? `Ajout de ${envoi} photo${envoi > 1 ? 's' : ''}…` : 'Ajouter des photos'}
        </button>
        {pieces.length > 0 && (
          <Selection label="Filtrer par pièce" valeur={filtre} onChange={setFiltre}
            options={[['', 'Toutes les photos'], ...pieces.map(p => [p.id, p.nom] as [string, string]), ['__divers', `Divers (à trier)${nbATrier ? ` · ${nbATrier}` : ''}`]]} />
        )}
        <span class="petit-texte">{avancement.filter(p => bool(p.dans_wip)).length} dans le dossier WIP</span>
      </div>
      {!visibles.length && <Vide icone="photo" titre="Aucune photo d'avancement"><p>Elles sont réduites avant l'envoi dans ton Drive.</p></Vide>}
      <div class="grille-photos">{visibles.map(p => tuile(p, visibles))}</div>
      {ajout && <AjoutPhotos costume={costume} pieceParDefaut={filtre && filtre !== '__divers' ? filtre : ''}
        onFichiers={ajouter} onFermer={() => setAjout(false)} />}
      {ouverte && <EditeurPhoto id={ouverte} costume={costume} parcours={parcours} onAller={setOuverte} onFermer={() => setOuverte(null)} />}
    </section>
  );
}

function EditeurPhoto({ id, costume, parcours, onAller, onFermer }: {
  id: string; costume: Ligne; parcours: string[]; onAller: (id: string) => void; onFermer: () => void;
}) {
  const d = donnees.value;
  const ids = parcours.filter(x => vivant(d.Photos[x]));
  const rang = ids.indexOf(id);
  const precedente = rang > 0 ? ids[rang - 1] : undefined;
  const suivante = rang >= 0 && rang < ids.length - 1 ? ids[rang + 1] : undefined;
  // ← → pour passer d'une photo à l'autre (sauf pendant la saisie d'un champ)
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName)) return;
      if (e.key === 'ArrowLeft' && precedente) { e.preventDefault(); aller(precedente); }
      if (e.key === 'ArrowRight' && suivante) { e.preventDefault(); aller(suivante); }
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [precedente, suivante]);
  // Valide le champ en cours (légende) avant de changer de photo.
  const aller = (x: string) => { (document.activeElement as HTMLElement | null)?.blur(); onAller(x); };
  const [suppression, setSuppression] = useState(false);
  const [aussiDrive, setAussiDrive] = useState(false);
  const p = d.Photos[id];
  if (!p) return null;
  const m = (champs: Record<string, string>) => maj('Photos', id, champs);
  const reference = estReference(p);
  const pieces = piecesDe(d, costume.id);
  const pistes = p.piece_id ? pistesDe(d, p.piece_id) : [];
  // Étape choisie : la sienne, ou celle de la sous-étape (photos rattachées avant l'ajout du choix d'étape).
  const pisteId = p.piste_id || ligne(d, 'Etapes', p.etape_id)?.piste_id || '';
  const sousEtapes = pisteId ? etapesDePiste(d, pisteId) : [];
  const copieDrive = mode.value === 'google' && !!p.drive_id && !p.drive_id.startsWith('local:');
  const supprimerPhoto = (aussiDrive: boolean) => {
    if (aussiDrive) mettreALaCorbeille(p.drive_id).catch((e: Error) => montrerToast(`Copie du Drive non supprimée : ${e.message}`));
    faire(supprimer(donnees.value, 'Photos', id), 'Photo supprimée');
    onFermer();
  };
  return (
    <Feuille titre="Photo" large onFermer={onFermer} pied={<>
      <button class="bouton danger" onClick={() => setSuppression(true)}>Supprimer</button>
      <button class="bouton principal" onClick={onFermer}>Terminé</button>
    </>}>
      <div class="photo-grande">
        <PhotoImg id={p.drive_id} alt={p.legende || 'Photo'} />
        {ids.length > 1 && <>
          <button class="fleche-photo gauche" disabled={!precedente} aria-label="Photo précédente" onClick={() => precedente && aller(precedente)}><Icone nom="retour" taille={24} /></button>
          <button class="fleche-photo droite" disabled={!suivante} aria-label="Photo suivante" onClick={() => suivante && aller(suivante)}><Icone nom="chevron" taille={24} /></button>
          <span class="rang-photo">{rang + 1} / {ids.length}</span>
        </>}
      </div>
      <Champ label="Légende"><Texte valeur={p.legende ?? ''} onValider={v => m({ legende: v })} /></Champ>
      <div class="deux-colonnes">
        <Champ label="Date"><ChoixDate label="date" valeur={p.date ?? ''} onChange={v => m({ date: v })} /></Champ>
        <Champ label="Section">
          <Selection label="Section" valeur={reference ? REFERENCE : 'avancement'}
            options={[['avancement', "Avancement (WIP)"], [REFERENCE, 'Référence']]}
            onChange={v => m(v === REFERENCE ? { type: REFERENCE, dans_wip: '', piece_id: '', piste_id: '', etape_id: '' } : { type: '', dans_wip: OUI })} />
        </Champ>
      </div>
      {!reference && <div class="deux-colonnes">
        <Champ label="Pièce">
          <Selection label="Pièce" valeur={p.piece_id ?? ''} options={[['', 'Divers (à trier)'], ...pieces.map(x => [x.id, x.nom] as [string, string])]} onChange={v => m({ piece_id: v, piste_id: '', etape_id: '' })} />
        </Champ>
      </div>}
      {!reference && pistes.length > 0 && (
        <div class="deux-colonnes">
          <Champ label="Étape (facultatif)">
            <Selection label="Étape" valeur={pisteId} options={[['', '—'], ...pistes.map(x => [x.id, x.nom || 'Étape 1'] as [string, string])]}
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
      {!reference && <label class="interrupteur">
        <input type="checkbox" checked={bool(p.dans_wip)} onChange={e => m({ dans_wip: txtBool((e.target as HTMLInputElement).checked) })} />
        <span>Dans le dossier WIP</span>
      </label>}
      <button class="bouton" onClick={() => { maj('Costumes', costume.id, { image_ref: p.drive_id }); onFermer(); }}>Utiliser comme image de référence</button>
      {suppression && (
        <Confirmer titre="Supprimer cette photo ?" bouton="Supprimer" danger onNon={() => setSuppression(false)} onOui={() => supprimerPhoto(copieDrive && aussiDrive)}
          texte={<>
            <p>Elle quitte l'appli et cet appareil.</p>
            {copieDrive && (
              <label class="interrupteur"><input type="checkbox" checked={aussiDrive} onChange={e => setAussiDrive((e.target as HTMLInputElement).checked)} />
                <span>Supprimer aussi sa copie sur mon Drive <span class="petit-texte">(elle va dans la corbeille du Drive, récupérable 30 jours)</span></span></label>
            )}
          </>} />
      )}
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
            options={[['', '—'], ...pistes.map(p => [p.id, p.nom || 'Étape 1'] as [string, string])]} />
        </Champ>
      )}
      {!pieceId && <p class="petit-texte">Les photos « divers » restent à trier : ouvre-les une par une pour leur donner une pièce.</p>}
    </Feuille>
  );
}
