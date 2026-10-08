// Sauvegarde d'un costume, à tout moment : sur l'appareil (ZIP téléchargé) ou sur le Drive (dossier
// « Sauvegardes » du costume). Après une sauvegarde, on peut libérer de la place en retirant des photos.
// Un costume terminé peut aussi être archivé définitivement, par le même chemin.
import { useState } from 'preact/hooks';
import { donnees, faire, mode, jour, synchroniser, baseLocale, envoyerPhotosDuCostume, deposerSauvegarde, retirerPhotos, montrerToast } from '../../store/store';
import { effacerPhoto } from '../../store/idb';
import { photosDe, piecesDe } from '../../logique/acces';
import { statutCostume } from '../../logique/disponibilite';
import { jourCourt } from '../../logique/dates';
import { bool, type Ligne } from '../../modele/schema';
import { construireArchive, changementsArchivage, fichiersSauvegardeDrive, lireSauvegardes, noterSauvegarde, noterRetrait } from '../../export/archive';
import { genererWip } from '../../export/dossierWip';
import { supprimerFichier } from '../../sync/drive';
import { vignette } from '../../store/photos';
import { telechargerBlob, Confirmer, Feuille, PhotoImg } from '../../composants/base';
import { Icone } from '../../composants/Icone';
import { aller } from '../../routeur';
import { estReference } from './Photos';

type Lieu = 'appareil' | 'drive';
interface Faite { lieu: Lieu; nom: string; taille?: number; dossier?: string; manquantes: number }

const mo = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`);
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

export function OngletSauvegarde({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const google = mode.value === 'google';
  const photos = photosDe(d, costume.id);
  const [lieu, setLieu] = useState<Lieu>(google ? 'drive' : 'appareil');
  const [avecWip, setAvecWip] = useState(photos.some(p => bool(p.dans_wip)));
  const [etat, setEtat] = useState('');
  const [erreur, setErreur] = useState('');
  const [faite, setFaite] = useState<Faite | null>(null);
  const [choix, setChoix] = useState(false);
  const [confirmerArchive, setConfirmerArchive] = useState(false);
  const [zipArchive, setZipArchive] = useState<Faite | null>(null);
  const termine = statutCostume(costume, jour.value) === 'terminé';
  const lieuEffectif: Lieu = google ? lieu : 'appareil';

  /** Produit la sauvegarde au lieu choisi. */
  const produire = async (): Promise<Faite> => {
    let wip: Blob | undefined;
    if (avecWip) {
      const ids = [...piecesDe(donnees.value, costume.id).map(p => p.id), ''];
      wip = await genererWip(donnees.value, costume.id, { pieces: ids, parDiapo: 2 }, t => setEtat(`Dossier WIP : ${t}`));
    }
    if (lieuEffectif === 'appareil') {
      const r = await construireArchive(donnees.value, costume.id, wip, setEtat);
      telechargerBlob(r.blob, r.nom);
      return { lieu: 'appareil', nom: r.nom, taille: r.blob.size, manquantes: r.manquantes };
    }
    setEtat('Envoi des photos sur le Drive');
    const manquantes = await envoyerPhotosDuCostume(costume.id);
    const f = fichiersSauvegardeDrive(donnees.value, costume.id);
    const nom = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).replace(/\//g, '-').replace(':', 'h');
    setEtat('Dépôt de la sauvegarde');
    const dossier = await deposerSauvegarde(costume.id, nom, [
      { nom: 'costume.json', blob: f.donnees, donnees: true },
      { nom: 'fiche.html', blob: f.fiche },
      ...(wip ? [{ nom: 'dossier-WIP.pptx', blob: wip }] : []),
    ]);
    return { lieu: 'drive', nom, dossier, manquantes };
  };

  const sauvegarder = async () => {
    setErreur(''); setFaite(null);
    try {
      const r = await produire();
      faire([noterSauvegarde(donnees.value.Costumes[costume.id], { date: new Date().toISOString(), lieu: r.lieu, retirees: 0 })]);
      setFaite(r);
    } catch (e) {
      setErreur(`Sauvegarde interrompue : ${(e as Error).message}`);
    } finally { setEtat(''); }
  };

  /** Archivage définitif : tout le détail quitte l'appli ; le costume reste dans les Archives avec un résumé. */
  const archiver = async (r: Faite) => {
    setZipArchive(null);
    try {
      setEtat('Vignette');
      const c = donnees.value.Costumes[costume.id];
      const v = c.image_ref ? await vignette(c.image_ref) : '';
      const { changements, fichiersDrive } = changementsArchivage(donnees.value, costume.id, v);
      // Sur l'appareil, le ZIP garde tout : on libère le Drive. Sur le Drive, les photos y restent.
      if (google && r.lieu === 'appareil') {
        for (const [i, id] of fichiersDrive.entries()) { setEtat(`Suppression des photos du Drive ${i + 1} / ${fichiersDrive.length}`); await supprimerFichier(id); }
      }
      const toutes = [c.image_ref, ...photosDe(donnees.value, costume.id).map(p => p.drive_id)].filter(Boolean);
      faire([...changements, noterSauvegarde(c, { date: new Date().toISOString(), lieu: r.lieu, retirees: 0, archive: true })]);
      const base = baseLocale();
      if (base) for (const id of toutes) await effacerPhoto(base, id);
      if (google) await synchroniser();
      aller('/archives');
    } catch (e) {
      setErreur(`Archivage interrompu : ${(e as Error).message}. Rien n'a été retiré ; tu peux réessayer.`);
    } finally { setEtat(''); }
  };

  const lancerArchivage = async () => {
    setConfirmerArchive(false); setErreur('');
    try {
      const r = await produire();
      if (r.lieu === 'appareil') setZipArchive(r); // on attend qu'elle confirme que le ZIP est enregistré
      else await archiver(r);
    } catch (e) {
      setErreur(`Sauvegarde interrompue : ${(e as Error).message}. Rien n'a été retiré.`);
    } finally { setEtat(''); }
  };

  const historique = lireSauvegardes(costume).slice().reverse();

  return (
    <section class="onglet-sauvegarde">
      <div class="carte-reglage">
        <h2>Sauvegarder ce costume</h2>
        <p class="petit-texte">Une copie complète : les données (réimportables), une fiche lisible hors appli et les photos. Rien n'est retiré de l'appli.</p>
        {google && (
          <fieldset class="choix-lieu">
            <legend class="champ-label">Où ?</legend>
            <label class="interrupteur"><input type="radio" name="lieu" checked={lieu === 'drive'} onChange={() => setLieu('drive')} />
              <span>Sur mon Drive <span class="petit-texte">— dans le dossier du costume, à côté de ses photos ; rien à télécharger</span></span></label>
            <label class="interrupteur"><input type="radio" name="lieu" checked={lieu === 'appareil'} onChange={() => setLieu('appareil')} />
              <span>Sur cet appareil <span class="petit-texte">— un fichier ZIP téléchargé, photos comprises</span></span></label>
          </fieldset>
        )}
        <label class="interrupteur"><input type="checkbox" checked={avecWip} onChange={e => setAvecWip((e.target as HTMLInputElement).checked)} /><span>Inclure le dossier WIP (PowerPoint)</span></label>
        <div class="ligne-actions">
          <button class="bouton principal" disabled={!!etat} onClick={() => void sauvegarder()}><Icone nom="telecharger" />Sauvegarder</button>
        </div>
        {etat && <p class="petit-texte" role="status">{etat}…</p>}
        {erreur && <p class="erreur" role="alert">{erreur}</p>}

        {faite && (
          <div class="bandeau-info">
            <Icone nom="info" taille={16} />
            <div>
              <p>{faite.lieu === 'drive'
                ? <>Sauvegardé sur ton Drive : <strong>Sauvegardes › {faite.nom}</strong>, dans le dossier du costume.</>
                : <>Fichier téléchargé : <strong>{faite.nom}</strong> · {mo(faite.taille ?? 0)}.</>}</p>
              {faite.manquantes > 0 && <p class="erreur">{pluriel(faite.manquantes, 'photo')} n'{faite.manquantes > 1 ? 'ont' : 'a'} pas pu être {faite.lieu === 'drive' ? 'envoyée' : 'récupérée'}{faite.manquantes > 1 ? 's' : ''} (hors ligne ?). Réessaie connectée avant de retirer des photos.</p>}
              <p>Veux-tu libérer de la place en retirant des photos de l'appli ?</p>
              <div class="ligne-actions">
                <button class="bouton" onClick={() => setFaite(null)}>Non, c'est tout</button>
                <button class="bouton principal" disabled={!photos.length} onClick={() => setChoix(true)}>Choisir des photos à retirer</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {termine && (
        <div class="carte-reglage">
          <h2>Archiver définitivement</h2>
          <p class="petit-texte">Le costume est terminé. L'archiver sauvegarde tout {lieuEffectif === 'drive' ? 'sur ton Drive' : 'dans un ZIP'}, puis retire son détail et ses photos de l'appli. Il reste visible dans les Archives, avec un résumé, et peut être réimporté.</p>
          <button class="bouton danger" disabled={!!etat} onClick={() => setConfirmerArchive(true)}><Icone nom="archive" />Archiver définitivement</button>
        </div>
      )}

      {historique.length > 0 && (
        <div class="carte-reglage">
          <h2>Sauvegardes</h2>
          <ul class="liste-sauvegardes">
            {historique.map(t => (
              <li>{jourCourt(t.date.slice(0, 10), '')} · {t.lieu === 'drive' ? 'Drive' : 'appareil (ZIP)'}{t.retirees > 0 ? ` · ${pluriel(t.retirees, 'photo')} retirée${t.retirees > 1 ? 's' : ''}` : ''}{t.archive ? ' · archivage' : ''}</li>
            ))}
          </ul>
        </div>
      )}

      {choix && faite && (
        <ChoixPhotosARetirer costume={costume} faite={faite} onFermer={() => setChoix(false)}
          onFini={n => { setChoix(false); setFaite(null); faire([noterRetrait(donnees.value.Costumes[costume.id], n)]); montrerToast(`${pluriel(n, 'photo')} retirée${n > 1 ? 's' : ''} de l'appli`); }} />
      )}

      {confirmerArchive && (
        <Confirmer titre="Archiver définitivement ?" bouton="Sauvegarder et archiver" danger onNon={() => setConfirmerArchive(false)} onOui={() => void lancerArchivage()}
          texte={lieuEffectif === 'drive'
            ? <p>Une sauvegarde complète est déposée sur ton Drive. Ensuite, le détail du costume et ses photos quittent l'appli et cet appareil ; <strong>les photos restent sur ton Drive</strong>.</p>
            : <p>Un ZIP complet est téléchargé. Après ta confirmation qu'il est bien enregistré, le détail du costume et ses photos quittent l'appli{google ? <>, cet appareil <strong>et ton Drive</strong></> : ' et cet appareil'}.</p>} />
      )}

      {zipArchive && (
        <Confirmer titre="Le fichier est-il bien enregistré ?" bouton="Oui, archiver" danger onNon={() => setZipArchive(null)} onOui={() => void archiver(zipArchive)}
          texte={<>
            <p>Vérifie dans tes téléchargements : <strong>{zipArchive.nom}</strong> · {mo(zipArchive.taille ?? 0)}</p>
            {zipArchive.manquantes > 0 && <p class="erreur">{pluriel(zipArchive.manquantes, 'photo')} manque{zipArchive.manquantes > 1 ? 'nt' : ''} dans le ZIP (hors ligne ?) : mieux vaut annuler et réessayer connectée.</p>}
            <p>En confirmant, les photos de ce costume sont <strong>supprimées {google ? 'de ton Drive' : 'de cet appareil'}</strong> et son détail retiré de l'appli.</p>
          </>} />
      )}
    </section>
  );
}

/** Choisir, par groupe ou une à une, les photos à retirer de l'appli après une sauvegarde. */
function ChoixPhotosARetirer({ costume, faite, onFermer, onFini }: { costume: Ligne; faite: Faite; onFermer: () => void; onFini: (n: number) => void }) {
  const d = donnees.value;
  const google = mode.value === 'google';
  // L'image principale du costume n'est pas proposée : elle illustre sa carte.
  const photos = photosDe(d, costume.id).filter(p => p.drive_id !== costume.image_ref);
  const pieces = piecesDe(d, costume.id);
  const groupes: [string, Ligne[]][] = [
    ['Références', photos.filter(estReference)],
    ...pieces.map(pc => [`WIP · ${pc.nom}`, photos.filter(p => !estReference(p) && p.piece_id === pc.id)] as [string, Ligne[]]),
    ['WIP · à trier', photos.filter(p => !estReference(p) && !pieces.some(pc => pc.id === p.piece_id))],
  ];
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [confirmer, setConfirmer] = useState(false);
  const [etat, setEtat] = useState('');
  const [erreur, setErreur] = useState('');
  const basculer = (ids: string[], v: boolean) => { const s = new Set(coches); for (const id of ids) (v ? s.add(id) : s.delete(id)); setCoches(s); };
  const n = coches.size;

  const retirer = async () => {
    setConfirmer(false); setErreur(''); setEtat('Retrait des photos');
    try {
      await retirerPhotos([...coches], faite.lieu, faite.dossier);
      onFini(n);
    } catch (e) {
      setErreur(`Retrait interrompu : ${(e as Error).message}. Les photos déjà traitées sont retirées ; tu peux relancer pour les autres.`);
    } finally { setEtat(''); }
  };

  return (
    <Feuille titre="Photos à retirer" large onFermer={onFermer} pied={<>
      <button class="bouton" onClick={onFermer}>Annuler</button>
      <button class="bouton danger" disabled={!n || !!etat} onClick={() => setConfirmer(true)}>{etat ? `${etat}…` : n ? `Retirer ${pluriel(n, 'photo')}` : 'Retirer'}</button>
    </>}>
      <p class="petit-texte">{faite.lieu === 'drive'
        ? "Elles quittent l'appli et cet appareil, et restent sur ton Drive, dans le dossier de cette sauvegarde."
        : `Elles quittent l'appli${google ? ', cet appareil et ton Drive' : ' et cet appareil'} : elles ne resteront que dans le ZIP.`}</p>
      {erreur && <p class="erreur" role="alert">{erreur}</p>}
      {groupes.filter(([, l]) => l.length).map(([titre, l]) => {
        const toutes = l.every(p => coches.has(p.id));
        return (
          <fieldset class="groupe-retrait">
            <legend>
              <label class="interrupteur"><input type="checkbox" checked={toutes} onChange={e => basculer(l.map(p => p.id), (e.target as HTMLInputElement).checked)} />
                <span><strong>{titre}</strong> <span class="petit-texte">{pluriel(l.length, 'photo')}</span></span></label>
            </legend>
            <div class="grille-retrait">
              {l.map(p => (
                <label class={`tuile-retrait${coches.has(p.id) ? ' cochee' : ''}`}>
                  <input type="checkbox" checked={coches.has(p.id)} onChange={e => basculer([p.id], (e.target as HTMLInputElement).checked)} aria-label={p.legende || `Photo du ${jourCourt(p.date, '')}`} />
                  <PhotoImg id={p.drive_id} alt="" />
                  <span class="petit-texte">{jourCourt(p.date, '')}</span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
      {confirmer && (
        <Confirmer titre={`Retirer ${pluriel(n, 'photo')} ?`} bouton="Retirer" danger onNon={() => setConfirmer(false)} onOui={() => void retirer()}
          texte={faite.lieu === 'drive'
            ? <p>Elles quittent l'appli et cet appareil. Elles restent sur ton Drive, dans <strong>Sauvegardes › {faite.nom}</strong>.</p>
            : <>
                <p>Vérifie d'abord que <strong>{faite.nom}</strong> est bien enregistré dans tes téléchargements.</p>
                <p>Elles quittent l'appli{google ? <>, cet appareil <strong>et ton Drive</strong></> : ' et cet appareil'} : elles ne resteront que dans le ZIP.</p>
              </>} />
      )}
    </Feuille>
  );
}
