// Archiver : télécharger le ZIP, CONFIRMER qu'il est bien enregistré, puis seulement libérer le Drive.
import { useState } from 'preact/hooks';
import { donnees, faire, mode, synchroniser, baseLocale } from '../../store/store';
import { effacerPhoto } from '../../store/idb';
import { photosDe, piecesDe } from '../../logique/acces';
import { bool, type Ligne } from '../../modele/schema';
import { construireArchive, changementsArchivage } from '../../export/archive';
import { genererWip } from '../../export/dossierWip';
import { supprimerFichier } from '../../sync/drive';
import { vignette } from '../../store/photos';
import { telechargerBlob, Confirmer } from '../../composants/base';
import { Icone } from '../../composants/Icone';
import { aller } from '../../routeur';

export function OngletArchiver({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const photos = photosDe(d, costume.id);
  const [etat, setEtat] = useState('');
  const [erreur, setErreur] = useState('');
  const [avecWip, setAvecWip] = useState(photos.some(p => bool(p.dans_wip)));
  const [fichier, setFichier] = useState<{ nom: string; taille: number; manquantes: number } | null>(null);

  const telecharger = async () => {
    setErreur('');
    try {
      let wip: Blob | undefined;
      if (avecWip) {
        const ids = [...piecesDe(d, costume.id).map(p => p.id), ''];
        wip = await genererWip(d, costume.id, { pieces: ids, parDiapo: 2 }, t => setEtat(`Dossier WIP : ${t}`));
      }
      const r = await construireArchive(d, costume.id, wip, setEtat);
      telechargerBlob(r.blob, r.nom);
      setFichier({ nom: r.nom, taille: r.blob.size, manquantes: r.manquantes });
    } catch (e) {
      setErreur((e as Error).message);
    } finally { setEtat(''); }
  };

  const archiver = async () => {
    setFichier(null);
    try {
      setEtat('Vignette');
      const v = costume.image_ref ? await vignette(costume.image_ref) : '';
      const { changements, fichiersDrive } = changementsArchivage(donnees.value, costume.id, v);
      if (mode.value === 'google') {
        for (const [i, id] of fichiersDrive.entries()) { setEtat(`Suppression des photos du Drive ${i + 1} / ${fichiersDrive.length}`); await supprimerFichier(id); }
      }
      const toutes = [costume.image_ref, ...photosDe(donnees.value, costume.id).map(p => p.drive_id)].filter(Boolean);
      faire(changements);
      const base = baseLocale();
      if (base) for (const id of toutes) await effacerPhoto(base, id); // copies locales (cache ou photos pas encore envoyées)
      if (mode.value === 'google') await synchroniser();
      aller('/archives');
    } catch (e) {
      setErreur(`Archivage interrompu : ${(e as Error).message}. Rien n'a été retiré du Sheet ; tu peux réessayer.`);
    } finally { setEtat(''); }
  };

  const mo = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`);
  const ou = mode.value === 'google' ? 'de ton Drive' : 'de cet appareil';

  return (
    <section class="archiver">
      <p>Le costume est terminé. L'archiver libère la place qu'il occupe {mode.value === 'google' ? 'dans ton Drive' : 'sur cet appareil'}, en gardant tout sur ton ordinateur :</p>
      <ol>
        <li>Un fichier <strong>ZIP</strong> est téléchargé : les données du costume (réimportables), une <strong>fiche lisible</strong> hors appli, et toutes les <strong>photos</strong> ({photos.length}) en pleine taille{avecWip ? ', plus le dossier WIP' : ''}.</li>
        <li>Tu confirmes que le fichier est bien enregistré.</li>
        <li>Seulement alors, les photos sont supprimées {mode.value === 'google' ? 'du Drive' : 'de l’appareil'} et le détail du costume est retiré {mode.value === 'google' ? 'du Sheet' : 'de l’appli'}. Le costume reste visible dans les Archives, avec un résumé.</li>
      </ol>
      <label class="interrupteur"><input type="checkbox" checked={avecWip} onChange={e => setAvecWip((e.target as HTMLInputElement).checked)} /><span>Inclure le dossier WIP (PowerPoint)</span></label>
      <button class="bouton principal" disabled={!!etat} onClick={telecharger}><Icone nom="telecharger" />Télécharger l'archive</button>
      {etat && <p class="petit-texte" role="status">{etat}…</p>}
      {erreur && <p class="erreur" role="alert">{erreur}</p>}
      {fichier && (
        <Confirmer titre="Le fichier est-il bien enregistré ?" bouton="Oui, archiver" danger onNon={() => setFichier(null)} onOui={archiver}
          texte={<>
            <p>Vérifie dans ton dossier de téléchargements :</p>
            <p><strong>{fichier.nom}</strong> · {mo(fichier.taille)}</p>
            {fichier.manquantes > 0 && <p class="erreur">{fichier.manquantes} photo{fichier.manquantes > 1 ? 's n’ont' : ' n’a'} pas pu être récupérée{fichier.manquantes > 1 ? 's' : ''} (hors ligne ?). Elle{fichier.manquantes > 1 ? 's' : ''} manquera{fichier.manquantes > 1 ? 'ont' : ''} dans l'archive : mieux vaut annuler et réessayer connecté.</p>}
            <p>En confirmant, les photos de ce costume sont <strong>supprimées {ou}</strong> et son détail retiré {mode.value === 'google' ? 'du Sheet' : 'de l’appli'}. L'archive ZIP permettra de le réimporter.</p>
          </>} />
      )}
    </section>
  );
}
