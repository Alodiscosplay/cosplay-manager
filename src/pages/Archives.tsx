import { useEffect, useRef, useState } from 'preact/hooks';
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
  const [choixSauvegarde, setChoixSauvegarde] = useState(false);

  const reimporter = async (fichiers: File[]) => {
    if (!fichiers.length) return;
    setChoixSauvegarde(false);
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
      <header class="page-tete"><h1>Archives</h1></header>
      <section class="carte-reglage">
        <h2>Réimporter un costume</h2>
        <div class="ligne-actions">
          <button class="bouton principal" onClick={() => setChoixSauvegarde(true)}><Icone nom="archive" />Une sauvegarde (ZIP ou dossier)</button>
          {mode.value === 'google' && <button class="bouton" onClick={() => setDepuisDrive(true)}><Icone nom="nuage" />Depuis le Drive</button>}
          <label class="bouton">
            <Icone nom="coller" />Seulement le fichier costume.json
            <input type="file" accept=".json,application/json" class="cache" onChange={e => { const i = e.target as HTMLInputElement; void reimporter(i.files ? [...i.files] : []).then(() => { i.value = ''; }); }} />
          </label>
        </div>
        <p class="petit-texte">Le fichier costume.json seul ramène toutes les données du costume, mais pas ses photos.</p>
        {manquantes > 0 && <p class="erreur" role="alert">{manquantes} photo{manquantes > 1 ? 's n’ont' : ' n’a'} pas pu être reprise{manquantes > 1 ? 's' : ''}. Pour les récupérer, réimporte la sauvegarde entière : son ZIP, ou son dossier décompressé.</p>}
      </section>
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
      {choixSauvegarde && <ChoixSauvegarde onFichiers={f => void reimporter(f)} onFermer={() => setChoixSauvegarde(false)} />}
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

/**
 * Une sauvegarde faite sur l'appareil, ZIP ou dossier décompressé : l'appli reconnaît d'elle-même ce
 * qu'on lui donne. Une fenêtre de choix de fichiers ne sait prendre qu'un fichier OU un dossier : d'où
 * deux boutons, et une zone où l'on peut déposer l'un comme l'autre (sur ordinateur).
 */
function ChoixSauvegarde({ onFichiers, onFermer }: { onFichiers: (f: File[]) => void; onFermer: () => void }) {
  // Choisir un dossier n'existe que sur ordinateur : les navigateurs de téléphone ne le proposent pas.
  const ordinateur = matchMedia('(pointer: fine)').matches;
  const champDossier = useRef<HTMLInputElement>(null);
  // L'attribut doit être posé tel quel : la propriété du même nom, mise à '', le désactiverait.
  useEffect(() => { champDossier.current?.setAttribute('webkitdirectory', ''); }, []);
  const [survol, setSurvol] = useState(false);
  const deposer = async (e: DragEvent) => {
    e.preventDefault(); setSurvol(false);
    onFichiers(await fichiersDeposes(e.dataTransfer));
  };
  return (
    <Feuille titre="Réimporter une sauvegarde" onFermer={onFermer} pied={<button class="bouton" onClick={onFermer}>Annuler</button>}>
      <p class="petit-texte">Le fichier ZIP de la sauvegarde tel quel, ou son dossier une fois décompressé : l'appli reconnaît l'un et l'autre, photos comprises.</p>
      {ordinateur && (
        <div class={`zone-depot${survol ? ' survol' : ''}`} onDragOver={e => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)} onDrop={e => void deposer(e)}>
          <Icone nom="archive" taille={28} />
          <p>Glisse ici le ZIP ou le dossier de la sauvegarde</p>
        </div>
      )}
      <div class="ligne-actions">
        <label class="bouton principal">
          Choisir le fichier ZIP
          <input type="file" accept=".zip,application/zip" class="cache" onChange={e => { const i = e.target as HTMLInputElement; onFichiers(i.files ? [...i.files] : []); i.value = ''; }} />
        </label>
        {ordinateur && (
          <label class="bouton">
            Choisir le dossier décompressé
            <input ref={champDossier} type="file" class="cache" onChange={e => { const i = e.target as HTMLInputElement; onFichiers(i.files ? [...i.files] : []); i.value = ''; }} />
          </label>
        )}
      </div>
    </Feuille>
  );
}

/** Ce qui a été déposé : des fichiers, ou un dossier parcouru en entier (chemins relatifs conservés). */
async function fichiersDeposes(dt: DataTransfer | null): Promise<File[]> {
  if (!dt) return [];
  type Entree = { isFile: boolean; isDirectory: boolean; fullPath: string; file?: (ok: (f: File) => void, ko: (e: unknown) => void) => void; createReader?: () => { readEntries: (ok: (l: Entree[]) => void, ko: (e: unknown) => void) => void } };
  const entrees = [...dt.items].map(it => (it as DataTransferItem & { webkitGetAsEntry?: () => Entree | null }).webkitGetAsEntry?.()).filter(Boolean) as Entree[];
  if (!entrees.length) return [...dt.files];
  const fichiers: File[] = [];
  const parcourir = async (e: Entree): Promise<void> => {
    if (e.isFile && e.file) {
      const f = await new Promise<File>((ok, ko) => e.file!(ok, ko));
      fichiers.push(Object.defineProperty(f, 'webkitRelativePath', { value: e.fullPath.replace(/^\//, '') }));
    } else if (e.isDirectory && e.createReader) {
      const lecteur = e.createReader();
      for (;;) { // readEntries rend les entrées par lots, jusqu'à une liste vide
        const lot = await new Promise<Entree[]>((ok, ko) => lecteur.readEntries(ok, ko));
        if (!lot.length) break;
        for (const x of lot) await parcourir(x);
      }
    }
  };
  for (const e of entrees) await parcourir(e);
  return fichiers;
}
