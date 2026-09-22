import { useState } from 'preact/hooks';
import { donnees, jour, faire } from '../store/store';
import { aFaire, tailleRepli, texteAttente, type ElementAFaire } from '../logique/disponibilite';
import { costumes, ligne, tous, ordreSuivant } from '../logique/acces';
import { jourCourt, lireJour, relatif } from '../logique/dates';
import { txtBool, type Ligne } from '../modele/schema';
import { cocherEtape, nouvelId, supprimer } from '../store/operations';
import { Case, Feuille, Champ, Texte, ChoixDate, Selection, Vide } from '../composants/base';
import { Icone } from '../composants/Icone';
import { IndicateurSync } from '../app';
import { lienCostume } from '../routeur';

export function PageAFaire() {
  const d = donnees.value;
  const j = jour.value;
  const r = aFaire(d, j);
  const [tache, setTache] = useState<string | null>(null);
  const [nouvelle, setNouvelle] = useState('');

  // Regroupement costume → pièce, dans l'ordre d'affichage
  const parCostume = new Map<string, { costume: Ligne; pieces: Map<string, ElementAFaire[]> }>();
  for (const e of r.elements) {
    if (!parCostume.has(e.costume.id)) parCostume.set(e.costume.id, { costume: e.costume, pieces: new Map() });
    const g = parCostume.get(e.costume.id)!;
    g.pieces.set(e.piece.id, [...(g.pieces.get(e.piece.id) ?? []), e]);
  }

  const ajouterTache = () => {
    if (!nouvelle.trim()) return;
    faire([{ table: 'Taches', id: nouvelId(), champs: { titre: nouvelle.trim(), ordre: ordreSuivant(tous(d, 'Taches')) } }]);
    setNouvelle('');
  };

  const n = tailleRepli(r.repli);

  return (
    <div class="page">
      <header class="page-tete">
        <h1>À faire</h1>
        <IndicateurSync />
      </header>
      <p class="petit-texte intro">L'étape suivante de chaque piste active, dans les pièces en cours des costumes en cours.</p>

      {!r.elements.length && !r.taches.length && (
        <Vide icone="afaire" titre="Rien à faire pour l'instant">
          <p>Mets un costume « en cours », puis une de ses pièces « en cours » : sa prochaine étape apparaîtra ici.</p>
        </Vide>
      )}

      {r.repli.costumesSansPieceEnCours.map(c => (
        <a class="alerte orange" href={lienCostume(c.id)}><Icone nom="lecture" taille={16} />{c.nom} est en cours, mais aucune de ses pièces : choisis sur quoi tu travailles</a>
      ))}

      {[...parCostume.values()].map(({ costume, pieces }) => (
        <section class="groupe-afaire">
          <h2><a href={lienCostume(costume.id)}>{costume.nom}</a></h2>
          {[...pieces.values()].map(elements => (
            <div class="bloc-afaire">
              <h3>{elements[0].piece.nom}</h3>
              <ul class="etapes">
                {elements.map(e => <ElementLigne e={e} />)}
              </ul>
            </div>
          ))}
        </section>
      ))}

      <section class="groupe-afaire">
        <h2>Tâches libres</h2>
        <ul class="etapes">
          {r.taches.map(t => (
            <li class="etape">
              <Case coche={false} label={t.titre} onChange={() => faire([{ table: 'Taches', id: t.id, champs: { fait: txtBool(true), fait_le: j } }], `« ${t.titre} » faite`)} />
              <button class="etape-texte" onClick={() => setTache(t.id)}>
                <span class="etape-titre">{t.titre}</span>
                <span class="etape-meta">
                  {lireJour(t.date) && <span class={lireJour(t.date) < j ? 'en-retard' : ''}><Icone nom="horloge" taille={12} />{jourCourt(t.date)} · {relatif(lireJour(t.date), j)}</span>}
                  {ligne(d, 'Costumes', t.costume_id) && <span class="costume-nom">{ligne(d, 'Costumes', t.costume_id)!.nom}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <form class="ajout-etape" onSubmit={e => { e.preventDefault(); ajouterTache(); }}>
          <Icone nom="plus" taille={16} />
          <input value={nouvelle} placeholder="Ajouter une tâche (ex. laver le tissu)" aria-label="Nouvelle tâche libre" onInput={e => setNouvelle((e.target as HTMLInputElement).value)} />
        </form>
      </section>

      {n > 0 && (
        <details class="repli">
          <summary>Pas dans la liste ({n})</summary>
          <ul>
            {r.repli.pistesPlanifiees.map(x => <li><a href={lienCostume(x.costume.id)}>{x.piece.nom} · {x.piste.nom || 'piste'}</a> · commence le {jourCourt(x.debut)}</li>)}
            {r.repli.bloquees.map(x => <li><a href={lienCostume(x.costume.id)}>{x.piece.nom}{x.piste.nom ? ` · ${x.piste.nom}` : ''}</a>{x.etape ? ` (« ${x.etape.titre} »)` : ''} · {texteAttente(x.attente)}</li>)}
            {r.repli.pistesEnPause.map(x => <li><a href={lienCostume(x.costume.id)}>{x.piece.nom} · {x.piste.nom || 'piste'}</a> · piste en pause</li>)}
            {r.repli.piecesEnPause.map(x => <li><a href={lienCostume(x.costume.id)}>{x.piece.nom}</a> ({x.costume.nom}) · en pause{x.debut ? `, reprend le ${jourCourt(x.debut)}` : ''}</li>)}
            {r.repli.costumesEnAttente.map(c => <li><a href={lienCostume(c.id)}>{c.nom}</a> · en attente{ligne(d, 'Costumes', c.attend_costume_id) ? ` de ${ligne(d, 'Costumes', c.attend_costume_id)!.nom}` : ''}</li>)}
            {r.repli.costumesProjet.map(c => <li><a href={lienCostume(c.id)}>{c.nom}</a> · en projet{c.debut ? `, commence le ${jourCourt(c.debut)}` : ''}</li>)}
            {r.repli.costumesEnPause.map(c => <li><a href={lienCostume(c.id)}>{c.nom}</a> · en pause</li>)}
          </ul>
        </details>
      )}

      {tache && <EditeurTache id={tache} onFermer={() => setTache(null)} />}
    </div>
  );
}

function ElementLigne({ e }: { e: ElementAFaire }) {
  const d = donnees.value;
  const j = jour.value;
  const prevue = lireJour(e.etape.date_prevue);
  const dl = lireJour(e.etape.deadline);
  return (
    <li class="etape">
      <Case coche={false} label={e.etape.titre} onChange={() => faire(cocherEtape(d, e.etape.id, true, j), `« ${e.etape.titre} » cochée`)} />
      <a class="etape-texte" href={lienCostume(e.costume.id)}>
        <span class="etape-titre">{e.etape.titre}</span>
        <span class="etape-meta">
          {e.plusieursPistes && <span class="piste-etiquette">{e.piste.nom || 'piste principale'}</span>}
          {e.etape.duree && e.etape.duree !== 'normal' && <span>{e.etape.duree}</span>}
          {prevue && <span class={prevue < j ? 'en-retard' : ''}><Icone nom="horloge" taille={12} />{jourCourt(prevue)}</span>}
          {dl && <span class={dl < j ? 'en-retard' : ''}><Icone nom="drapeau" taille={12} />{jourCourt(dl)}</span>}
        </span>
      </a>
    </li>
  );
}

function EditeurTache({ id, onFermer }: { id: string; onFermer: () => void }) {
  const d = donnees.value;
  const t = d.Taches[id];
  if (!t) return null;
  const m = (champs: Record<string, string>) => faire([{ table: 'Taches', id, champs }]);
  return (
    <Feuille titre="Tâche" onFermer={onFermer} pied={<>
      <button class="bouton danger" onClick={() => { faire(supprimer('Taches', id), 'Tâche supprimée'); onFermer(); }}>Supprimer</button>
      <button class="bouton principal" onClick={onFermer}>Terminé</button>
    </>}>
      <Champ label="Titre"><Texte valeur={t.titre} onValider={v => v && m({ titre: v })} /></Champ>
      <Champ label="Date (facultative)"><ChoixDate label="date" valeur={t.date ?? ''} onChange={v => m({ date: v })} /></Champ>
      <Champ label="Costume (facultatif)">
        <Selection label="Costume" valeur={t.costume_id ?? ''} options={[['', '—'], ...costumes(d).filter(c => c.statut !== 'archivé').map(c => [c.id, c.nom] as [string, string])]} onChange={v => m({ costume_id: v })} />
      </Champ>
    </Feuille>
  );
}
