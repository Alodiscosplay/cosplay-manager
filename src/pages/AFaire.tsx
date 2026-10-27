import { useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { donnees, jour, faire } from '../store/store';
import { aFaire, tailleRepli, texteAttente, type ElementAFaire } from '../logique/disponibilite';
import { alertes } from '../logique/planning';
import { datesClesAFaire, natureDe, nomEvenement, type DateCleAFaire } from '../logique/evenements';
import { EditeurEvenement } from './Evenement';
import { costumes, costumesParPriorite, ligne, tous, ordreSuivant, reordonnerParmi } from '../logique/acces';
import { jourCourt, lireJour, relatif } from '../logique/dates';
import { bool, txtBool, type Ligne } from '../modele/schema';
import { cocherEtape, nouvelId, supprimer, reordonner } from '../store/operations';
import { annulerDeplacementDom } from '../composants/glisser';
import { Case, Feuille, Champ, Texte, ChoixDate, Selection, Vide } from '../composants/base';
import { Icone } from '../composants/Icone';
import { IndicateurSync } from '../app';
import { lienCostume } from '../routeur';

export function PageAFaire() {
  const d = donnees.value;
  const j = jour.value;
  const r = aFaire(d, j);
  const al = alertes(d, j);
  const [tache, setTache] = useState<string | null>(null);
  const [evenement, setEvenement] = useState<string | null>(null);
  // Les dates clés des événements (inscriptions, envois, réponses, répétitions) : un bloc à elles.
  const dc = datesClesAFaire(d, j);
  const datesUrgentes = dc.aFaire.filter(x => bool(x.dateCle.urgent));
  const dates = dc.aFaire.filter(x => !bool(x.dateCle.urgent));
  const [nouvelle, setNouvelle] = useState('');

  // Ce qu'elle a marqué urgent remonte en tête, et n'apparaît plus plus bas.
  const urgents = r.elements.filter(e => bool(e.etape.urgent));
  const tachesUrgentes = r.taches.filter(t => bool(t.urgent));
  const taches = r.taches.filter(t => !bool(t.urgent));

  // Regroupement costume → pièce, dans l'ordre d'affichage
  const parCostume = new Map<string, { costume: Ligne; pieces: Map<string, ElementAFaire[]> }>();
  for (const e of r.elements) {
    if (bool(e.etape.urgent)) continue;
    if (!parCostume.has(e.costume.id)) parCostume.set(e.costume.id, { costume: e.costume, pieces: new Map() });
    const g = parCostume.get(e.costume.id)!;
    g.pieces.set(e.piece.id, [...(g.pieces.get(e.piece.id) ?? []), e]);
  }

  const ajouterTache = () => {
    if (!nouvelle.trim()) return;
    faire([{ table: 'Taches', id: nouvelId(), champs: { titre: nouvelle.trim(), ordre: ordreSuivant(tous(d, 'Taches')) } }]);
    setNouvelle('');
  };

  const n = tailleRepli(r.repli) + dc.plusTard.length;

  // Les costumes se glissent par ordre de priorité, propre à cette page (la page Costumes a le sien) ;
  // ceux qui ne sont pas affichés ici gardent leur place.
  const rang = new Map(costumesParPriorite(d).map((c, i) => [c.id, i]));
  const groupes = [...parCostume.values()].sort((a, b) => rang.get(a.costume.id)! - rang.get(b.costume.id)!);
  const listeCostumes = useRef<HTMLDivElement>(null);
  const cleGroupes = groupes.map(g => g.costume.id).join(',');
  useEffect(() => {
    if (!listeCostumes.current || groupes.length < 2) return;
    const s = Sortable.create(listeCostumes.current, {
      handle: '.poignee-costume', draggable: '.groupe-afaire', animation: 150,
      onEnd: evt => {
        annulerDeplacementDom(evt);
        if (evt.oldIndex === evt.newIndex) return;
        const affiches = groupes.map(g => donnees.value.Costumes[g.costume.id]);
        const [bouge] = affiches.splice(evt.oldIndex!, 1);
        affiches.splice(evt.newIndex!, 0, bouge);
        faire(reordonner('Costumes', reordonnerParmi(costumesParPriorite(donnees.value), affiches), 'priorite'));
      },
    });
    return () => s.destroy();
  }, [cleGroupes]);

  return (
    <div class="page">
      <header class="page-tete">
        <h1>À faire</h1>
        <IndicateurSync />
      </header>
      <p class="petit-texte intro">La sous-étape suivante de chaque étape, dans les pièces en cours des costumes en cours.</p>

      {!r.elements.length && !r.taches.length && !dc.aFaire.length && (
        <Vide icone="afaire" titre="Rien à faire pour l'instant">
          <p>Mets un costume « en cours », puis une de ses pièces « en cours » : sa prochaine sous-étape apparaîtra ici.</p>
        </Vide>
      )}

      {/* Les rappels d'échéances : ce qui approche ou a dépassé sa deadline. */}
      {al.length > 0 && (
        <section class="alertes" aria-label="Rappels">
          {al.map(x => (
            <a class={`alerte ${x.niveau}`} href={lienCostume(x.costumeId)}><Icone nom="alerte" taille={16} />{x.texte}</a>
          ))}
        </section>
      )}

      {r.repli.costumesSansPieceEnCours.map(c => (
        <a class="alerte orange" href={lienCostume(c.id)}><Icone nom="lecture" taille={16} />{c.nom} est en cours, mais aucune de ses pièces : choisis sur quoi tu travailles</a>
      ))}

      {(urgents.length > 0 || tachesUrgentes.length > 0 || datesUrgentes.length > 0) && (
        <section class="groupe-afaire urgent">
          <h2><Icone nom="alerte" taille={18} />Urgent</h2>
          <ul class="etapes">
            {urgents.map(e => <ElementLigne e={e} contexte />)}
            {tachesUrgentes.map(t => <TacheLigne t={t} onOuvrir={setTache} />)}
            {datesUrgentes.map(x => <DateCleLigne x={x} onOuvrir={setEvenement} />)}
          </ul>
        </section>
      )}

      <section class="groupe-afaire">
        <h2>Tâches libres</h2>
        <ul class="etapes">
          {taches.map(t => <TacheLigne t={t} onOuvrir={setTache} />)}
        </ul>
        <form class="ajout-etape" onSubmit={e => { e.preventDefault(); ajouterTache(); }}>
          <Icone nom="plus" taille={16} />
          <input value={nouvelle} placeholder="Ajouter une tâche" aria-label="Nouvelle tâche libre" onInput={e => setNouvelle((e.target as HTMLInputElement).value)} />
        </form>
      </section>

      <div class="costumes-afaire" ref={listeCostumes}>
        {groupes.map(({ costume, pieces }) => (
          <section class="groupe-afaire" key={costume.id}>
            <h2>
              {groupes.length > 1 && <span class="poignee poignee-costume" aria-label="Déplacer le costume" title="Glisser pour changer la priorité"><Icone nom="poignee" taille={18} /></span>}
              <a href={lienCostume(costume.id)}>{costume.nom}</a>
            </h2>
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
      </div>

      {dates.length > 0 && (
        <section class="groupe-afaire">
          <h2><a href="#/agenda">Événements</a></h2>
          <ul class="etapes">
            {dates.map(x => <DateCleLigne x={x} onOuvrir={setEvenement} />)}
          </ul>
        </section>
      )}

      {n > 0 && (
        <details class="repli">
          <summary>Pas dans la liste ({n})</summary>
          <ul>
            {r.repli.pistesEnPause.map(x => <li><a href={lienCostume(x.costume.id)}>{x.piece.nom}{x.piste.nom ? ` · ${x.piste.nom}` : ''}</a> ({x.costume.nom}) · étape en pause</li>)}
            {r.repli.pistesPlanifiees.map(x => <li><a href={lienCostume(x.costume.id)}>{x.piece.nom} · {x.piste.nom || 'étape'}</a> · commence le {jourCourt(x.debut)}</li>)}
            {r.repli.bloquees.map(x => <li><a href={lienCostume(x.costume.id)}>{x.piece.nom}{x.piste.nom ? ` · ${x.piste.nom}` : ''}</a>{x.etape ? ` (« ${x.etape.titre} »)` : ''} · {texteAttente(x.attente)}</li>)}
            {r.repli.piecesEnPause.map(x => <li><a href={lienCostume(x.costume.id)}>{x.piece.nom}</a> ({x.costume.nom}) · en pause{x.debut ? `, reprend le ${jourCourt(x.debut)}` : ''}</li>)}
            {r.repli.costumesEnAttente.map(c => <li><a href={lienCostume(c.id)}>{c.nom}</a> · en attente{ligne(d, 'Costumes', c.attend_costume_id) ? ` de ${ligne(d, 'Costumes', c.attend_costume_id)!.nom}` : ''}</li>)}
            {r.repli.costumesProjet.map(c => <li><a href={lienCostume(c.id)}>{c.nom}</a> · en projet{c.debut ? `, commence le ${jourCourt(c.debut)}` : ''}</li>)}
            {r.repli.costumesEnPause.map(c => <li><a href={lienCostume(c.id)}>{c.nom}</a> · en pause</li>)}
            {dc.plusTard.map(x => <li><button class="lien-bouton" onClick={() => setEvenement(x.evenement.id)}>{x.dateCle.titre}</button> ({nomEvenement(d, x.evenement)}) · apparaîtra le {jourCourt(x.apparait)}</li>)}
          </ul>
        </details>
      )}

      {tache && <EditeurTache id={tache} onFermer={() => setTache(null)} />}
      {evenement && <EditeurEvenement id={evenement} onFermer={() => setEvenement(null)} />}
    </div>
  );
}

/** Le bouton qui met une ligne en avant (ou l'en retire). */
function BoutonUrgent({ urgent, titre, onChange }: { urgent: boolean; titre: string; onChange: (v: boolean) => void }) {
  return (
    <button class={`bouton-icone petit bascule-urgent${urgent ? ' actif' : ''}`} aria-pressed={urgent}
      aria-label={urgent ? `Retirer « ${titre} » de l'urgent` : `Marquer « ${titre} » urgent`}
      title={urgent ? "Retirer de l'urgent" : 'Marquer urgent'} onClick={() => onChange(!urgent)}>
      <Icone nom="alerte" taille={16} />
    </button>
  );
}

function TacheLigne({ t, onOuvrir }: { t: Ligne; onOuvrir: (id: string) => void }) {
  const d = donnees.value;
  const j = jour.value;
  const urgent = bool(t.urgent);
  return (
    <li class="etape">
      <Case coche={false} label={t.titre} onChange={() => faire([{ table: 'Taches', id: t.id, champs: { fait: txtBool(true), fait_le: j, urgent: '' } }], `« ${t.titre} » faite`)} />
      <button class="etape-texte" onClick={() => onOuvrir(t.id)}>
        <span class="etape-titre">{t.titre}</span>
        <span class="etape-meta">
          {urgent && <span>tâche libre</span>}
          {lireJour(t.date) && <span class={lireJour(t.date) < j ? 'en-retard' : ''}><Icone nom="horloge" taille={12} />{jourCourt(t.date)} · {relatif(lireJour(t.date), j)}</span>}
          {ligne(d, 'Costumes', t.costume_id) && <span class="costume-nom">{ligne(d, 'Costumes', t.costume_id)!.nom}</span>}
        </span>
      </button>
      <BoutonUrgent urgent={urgent} titre={t.titre} onChange={v => faire([{ table: 'Taches', id: t.id, champs: { urgent: txtBool(v) } }])} />
    </li>
  );
}

/** Une date clé d'événement : on la coche ici comme sur la fiche de l'événement. */
function DateCleLigne({ x, onOuvrir }: { x: DateCleAFaire; onOuvrir: (evenementId: string) => void }) {
  const d = donnees.value;
  const j = jour.value;
  const dc = x.dateCle;
  const urgent = bool(dc.urgent);
  return (
    <li class="etape">
      <Case coche={false} label={dc.titre} onChange={() => faire([{ table: 'DatesCles', id: dc.id, champs: { fait: txtBool(true), fait_le: j, urgent: '' } }], `« ${dc.titre} » cochée`)} />
      <button class="etape-texte" onClick={() => onOuvrir(x.evenement.id)}>
        <span class="etape-titre">{dc.titre}</span>
        <span class="etape-meta">
          <span class="costume-nom">{nomEvenement(d, x.evenement)}</span>
          <span class={x.niveau === 'rouge' ? 'en-retard' : x.niveau === 'orange' ? 'bientot' : ''}><Icone nom={natureDe(dc) === 'fixe' ? 'horloge' : 'drapeau'} taille={12} />{x.texte}</span>
        </span>
      </button>
      {/^https?:\/\//.test(dc.lien ?? '') && <a class="bouton-icone petit" href={dc.lien} target="_blank" rel="noopener" aria-label={`Ouvrir le lien de « ${dc.titre} »`} title="Ouvrir le lien"><Icone nom="lien" taille={16} /></a>}
      <BoutonUrgent urgent={urgent} titre={dc.titre} onChange={v => faire([{ table: 'DatesCles', id: dc.id, champs: { urgent: txtBool(v) } }])} />
    </li>
  );
}

function ElementLigne({ e, contexte }: { e: ElementAFaire; contexte?: boolean }) {
  const d = donnees.value;
  const j = jour.value;
  const dl = lireJour(e.piste.deadline);
  return (
    <li class="etape">
      <Case coche={false} label={e.etape.titre} onChange={() => faire([...cocherEtape(d, e.etape.id, true, j), { table: 'Etapes', id: e.etape.id, champs: { urgent: '' } }], `« ${e.etape.titre} » cochée`)} />
      <a class="etape-texte" href={lienCostume(e.costume.id)}>
        <span class="etape-titre">{e.etape.titre}</span>
        <span class="etape-meta">
          {contexte && <span class="costume-nom">{e.costume.nom}</span>}
          {contexte && <span>{e.piece.nom}</span>}
          {e.plusieursPistes && <span class="piste-etiquette">{e.piste.nom || 'étape 1'}</span>}
          {e.etape.duree && e.etape.duree !== 'normal' && <span>{e.etape.duree}</span>}
          {dl && <span class={dl < j ? 'en-retard' : ''}><Icone nom="drapeau" taille={12} />{jourCourt(dl)}</span>}
        </span>
      </a>
      <BoutonUrgent urgent={bool(e.etape.urgent)} titre={e.etape.titre} onChange={v => faire([{ table: 'Etapes', id: e.etape.id, champs: { urgent: txtBool(v) } }])} />
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
      <button class="bouton danger" onClick={() => { faire(supprimer(donnees.value, 'Taches', id), 'Tâche supprimée'); onFermer(); }}>Supprimer</button>
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
