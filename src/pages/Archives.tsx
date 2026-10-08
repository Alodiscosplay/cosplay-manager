import { useEffect, useState } from 'preact/hooks';
import { donnees, faire, mode, montrerToast } from '../store/store';
import { costumes } from '../logique/acces';
import { jourCourt } from '../logique/dates';
import { euros } from '../logique/budget';
import { lireArchive, lireContenu } from '../export/archive';
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

  const reimporter = async (f?: File) => {
    if (!f) return;
    setErreur(''); setEtat('Lecture de l\'archive');
    try {
      const { changements, photos, zip } = await lireArchive(f, donnees.value);
      faire(changements);
      for (const [i, p] of photos.entries()) {
        setEtat(`Photo ${i + 1} / ${photos.length}`);
        const blob = await zip.file(p.chemin)?.async('blob');
        if (!blob) continue;
        const id = await ajouterImage(blob);
        faire([{ table: p.table, id: p.ligneId, champs: { [p.champ]: id } }]);
      }
      const costume = changements.find(c => c.table === 'Costumes');
      montrerToast(`« ${costume?.champs.nom} » réimporté`);
      if (costume) aller(`/costume/${costume.id}`);
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
          <Icone nom="archive" />Réimporter une archive
          <input type="file" accept=".zip,application/zip" class="cache" onChange={e => reimporter((e.target as HTMLInputElement).files?.[0])} />
        </label>
      </header>
      {mode.value === 'google' && <button class="bouton" onClick={() => setDepuisDrive(true)}><Icone nom="nuage" />Réimporter depuis le Drive</button>}
      {etat && <p class="petit-texte" role="status">{etat}…</p>}
      {erreur && <p class="erreur" role="alert">{erreur}</p>}
      {!archives.length && <Vide icone="archive" titre="Aucun costume archivé"><p>Un costume terminé s'archive depuis son onglet Sauvegarde : tout est gardé dans un ZIP ou sur ton Drive, et son détail quitte l'appli.</p></Vide>}
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
