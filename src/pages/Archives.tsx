import { useState } from 'preact/hooks';
import { donnees, faire, montrerToast } from '../store/store';
import { costumes } from '../logique/acces';
import { jourCourt } from '../logique/dates';
import { euros } from '../logique/budget';
import { lireArchive } from '../export/archive';
import { ajouterImage } from '../store/photos';
import { supprimer } from '../store/operations';
import { Vide, Menu } from '../composants/base';
import { Icone } from '../composants/Icone';
import { aller } from '../routeur';

interface Resume { pct: number | null; etapes: number; pieces: number; photos: number; debut: string; fin: string; budget: number | null }

export function PageArchives() {
  const d = donnees.value;
  const archives = costumes(d).filter(c => c.statut === 'archivé').sort((a, b) => (b.archive_le || '').localeCompare(a.archive_le || ''));
  const [etat, setEtat] = useState('');
  const [erreur, setErreur] = useState('');

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
      {etat && <p class="petit-texte" role="status">{etat}…</p>}
      {erreur && <p class="erreur" role="alert">{erreur}</p>}
      {!archives.length && <Vide icone="archive" titre="Aucun costume archivé"><p>Un costume terminé peut être archivé depuis sa page : tout part dans un ZIP sur ton ordinateur, et ses photos libèrent ton Drive.</p></Vide>}
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
                    { texte: 'Retirer des archives', icone: 'poubelle', danger: true, faire: () => faire(supprimer('Costumes', c.id), `« ${c.nom} » retiré`) },
                  ]} />
                </div>
                {(c.personnage || c.oeuvre) && <p class="sous-titre">{[c.personnage, c.oeuvre].filter(Boolean).join(' · ')}</p>}
                {r && <p class="petit-texte">{r.pct ?? '—'} % · {r.pieces} pièces · {r.etapes} étapes · {r.photos} photos{r.budget !== null ? ` · ${euros(r.budget)}` : ''}</p>}
                {r?.debut && <p class="petit-texte">Réalisé du {jourCourt(r.debut, '')} au {jourCourt(r.fin, '')}</p>}
                <p class="petit-texte">Archivé le {c.archive_le ? jourCourt(c.archive_le, '') : '?'}</p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
