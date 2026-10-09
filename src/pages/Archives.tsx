import { useEffect, useState } from 'preact/hooks';
import { donnees, faire, mode, montrerToast } from '../store/store';
import { costumes } from '../logique/acces';
import { jourCourt } from '../logique/dates';
import { euros } from '../logique/budget';
import { lireSauvegarde, lireContenu } from '../export/archive';
import { listerSauvegardes, telecharger, type SauvegardeDrive } from '../sync/drive';
import { ajouterImage } from '../store/photos';
import { supprimer } from '../store/operations';
import { Vide, Menu, Feuille } from '../composants/base';
import { Icone } from '../composants/Icone';
import { aller } from '../routeur';

interface Resume { pct: number | null; etapes: number; pieces: number; photos: number; debut: string; fin: string; budget: number | null }

export function PageArchives() {
  const d = donnees.value;
  const archives = costumes(d).filter(c => c.statut === 'archivé').sort((a, b) => (b.archive_le || '').localeCompare(a.archive_le || ''));
  const [etat, setEtat] = useState('');
  const [erreur, setErreur] = useState('');
  const [depuisDrive, setDepuisDrive] = useState(false);

  const [manquantes, setManquantes] = useState(0);
  // Choisir un dossier n'existe que sur ordinateur (les navigateurs de téléphone ne le proposent pas).
  const dossierPossible = 'webkitdirectory' in document.createElement('input') && matchMedia('(pointer: fine)').matches;

  const reimporter = async (liste: FileList | null) => {
    const fichiers = liste ? [...liste] : [];
    if (!fichiers.length) return;
    setErreur(''); setManquantes(0); setEtat('Lecture de la sauvegarde');
    try {
      const { changements, photos } = await lireSauvegarde(fichiers, donnees.value);
      faire(changements);
      let perdues = 0;
      for (const [i, p] of photos.entries()) {
        setEtat(`Photo ${i + 1} / ${photos.length}`);
        if (!p.blob) { perdues++; continue; }
        const id = await ajouterImage(p.blob);
        faire([{ table: p.table, id: p.ligneId, champs: { [p.champ]: id } }]);
      }
      const costume = changements.find(c => c.table === 'Costumes');
      montrerToast(`« ${costume?.champs.nom} » réimporté${perdues ? `, sans ${perdues} photo${perdues > 1 ? 's' : ''}` : ''}`);
      if (perdues) setManquantes(perdues);
      else if (costume) aller(`/costume/${costume.id}`);
    } catch (e) {
      setErreur((e as Error).message);
    } finally { setEtat(''); }
  };

  return (
    <div class="page">
      <a class="lien-retour" href="#/"><Icone nom="retour" taille={16} />Costumes</a>
      <header class="page-tete">
        <h1>Archives</h1>
        <label class="bouton">
          <Icone nom="archive" />Réimporter une sauvegarde
          <input type="file" accept=".zip,application/zip,.json,application/json" class="cache" onChange={e => { const i = e.target as HTMLInputElement; void reimporter(i.files).then(() => { i.value = ''; }); }} />
        </label>
      </header>
      <p class="petit-texte">Choisis le fichier ZIP de la sauvegarde tel quel{dossierPossible ? ', ou son dossier décompressé' : ''}. Le fichier costume.json seul fonctionne aussi, mais sans les photos.</p>
      {dossierPossible && (
        <label class="bouton">
          <Icone nom="archive" />Réimporter un dossier décompressé
          <input type="file" class="cache" {...{ webkitdirectory: '' }} onChange={e => { const i = e.target as HTMLInputElement; void reimporter(i.files).then(() => { i.value = ''; }); }} />
        </label>
      )}
      {manquantes > 0 && <p class="erreur" role="alert">{manquantes} photo{manquantes > 1 ? 's n’ont' : ' n’a'} pas pu être reprise{manquantes > 1 ? 's' : ''} : elle{manquantes > 1 ? 's' : ''} n'étai{manquantes > 1 ? 'ent' : 't'} pas dans ce que tu as choisi. Recompresse le dossier de la sauvegarde en ZIP (clic droit › Compresser), puis réimporte-le pour les récupérer.</p>}
      {mode.value === 'google' && <button class="bouton" onClick={() => setDepuisDrive(true)}><Icone nom="nuage" />Réimporter depuis le Drive</button>}
      {etat && <p class="petit-texte" role="status">{etat}…</p>}
      {erreur && <p class="erreur" role="alert">{erreur}</p>}
      {!archives.length && <Vide icone="archive" titre="Aucun costume archivé"><p>Un costume terminé s'archive depuis le menu « … » de sa fiche : tout est gardé dans un ZIP ou sur ton Drive, et son détail quitte l'appli.</p></Vide>}
      <div class="grille-cartes">
        {archives.map(c => {
          let r: Resume | null = null;
          try { r = JSON.parse(c.resume_archive || 'null'); } catch { /* résumé illisible */ }
          return (
            <article class="carte-costume archive">
              <div class="carte-image">{c.vignette ? <img src={c.vignette} alt={`Vignette ${c.nom}`} /> : <div class="photo-vide"><span aria-hidden="true">✂</span></div>}</div>
              <div class="carte-corps">
                <div class="titre-ligne">
                  <h3>{c.nom}</h3>
                  <Menu label={`Actions pour ${c.nom}`} actions={[
                    { texte: 'Retirer des archives', icone: 'poubelle', danger: true, faire: () => faire(supprimer(donnees.value, 'Costumes', c.id), `« ${c.nom} » retiré`) },
                  ]} />
                </div>
                {(c.personnage || c.oeuvre) && <p class="sous-titre">{[c.personnage, c.oeuvre].filter(Boolean).join(' · ')}</p>}
                {r && <p class="petit-texte">{r.pct ?? '—'} % · {r.pieces} pièces · {r.etapes} sous-étapes · {r.photos} photos{r.budget !== null ? ` · ${euros(r.budget)}` : ''}</p>}
                {r?.debut && <p class="petit-texte">Réalisé du {jourCourt(r.debut, '')} au {jourCourt(r.fin, '')}</p>}
                <p class="petit-texte">Archivé le {c.archive_le ? jourCourt(c.archive_le, '') : '?'}</p>
              </div>
            </article>
          );
        })}
      </div>
      {depuisDrive && <ReimportDrive onFermer={() => setDepuisDrive(false)} />}
    </div>
  );
}

/** Les sauvegardes déposées sur le Drive ; en choisir une recrée le costume (ses photos restent sur le Drive). */
function ReimportDrive({ onFermer }: { onFermer: () => void }) {
  const [liste, setListe] = useState<SauvegardeDrive[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [etat, setEtat] = useState('');
  useEffect(() => { listerSauvegardes().then(setListe).catch(e => setErreur((e as Error).message)); }, []);
  const choisir = async (s: SauvegardeDrive) => {
    setErreur(''); setEtat('Lecture de la sauvegarde');
    try {
      const { changements } = lireContenu(JSON.parse(await (await telecharger(s.id)).text()), donnees.value);
      faire(changements);
      const costume = changements.find(c => c.table === 'Costumes');
      montrerToast(`« ${costume?.champs.nom} » réimporté`);
      onFermer();
      if (costume) aller(`/costume/${costume.id}`);
    } catch (e) {
      setErreur((e as Error).message);
    } finally { setEtat(''); }
  };
  return (
    <Feuille titre="Réimporter depuis le Drive" onFermer={onFermer} pied={<button class="bouton" onClick={onFermer}>Fermer</button>}>
      <p class="petit-texte">Le costume est recréé tel qu'il était à la sauvegarde, à côté de ceux qui existent déjà. Ses photos restent sur ton Drive.</p>
      {!liste && !erreur && <p class="petit-texte" role="status">Recherche des sauvegardes…</p>}
      {liste && !liste.length && <p class="petit-texte">Aucune sauvegarde sur ton Drive.</p>}
      {etat && <p class="petit-texte" role="status">{etat}…</p>}
      {erreur && <p class="erreur" role="alert">{erreur}</p>}
      {liste && liste.length > 0 && (
        <ul class="liste-sauvegardes">
          {liste.map(s => (
            <li><button class="lien-bouton" disabled={!!etat} onClick={() => void choisir(s)}><strong>{s.costume || 'Costume'}</strong></button>
              {' '}<span class="petit-texte">{new Date(s.date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span></li>
          ))}
        </ul>
      )}
    </Feuille>
  );
}
