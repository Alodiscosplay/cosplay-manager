import { useState } from 'preact/hooks';
import { donnees, jour, faire } from '../store/store';
import { ligne, costumes, tous, piecesDe } from '../logique/acces';
import { avancementCostume } from '../logique/avancement';
import { statutCostume, pieceTerminee } from '../logique/disponibilite';
import { deadlineCostume } from '../logique/planning';
import { relatif, jourCourt, ajouterJours } from '../logique/dates';
import { STATUTS_COSTUME, bool, txtBool, type NomTable } from '../modele/schema';
import { supprimer, nouvelId, purger } from '../store/operations';
import { ajouterImage } from '../store/photos';
import { aller, lienCostume } from '../routeur';
import { Barre, Pct, Puce, Feuille, Champ, Texte, ChoixDate, Selection, Menu, Vide, Confirmer } from '../composants/base';
import { ImageCadree, EditeurCadrage } from '../composants/Cadrage';
import { Icone } from '../composants/Icone';
import { OngletPieces } from './costume/Pieces';
import { OngletFournitures } from './costume/Fournitures';
import { OngletPhotos } from './costume/Photos';
import { OngletBudget } from './costume/Budget';
import { OngletPlanning } from './costume/Planning';
import { OngletWip } from './costume/Wip';
import { FeuilleSauvegarde } from './costume/Sauvegarde';

const purgerNouveau = (id: string) => [purger('Costumes', donnees.value.Costumes[id])];

export const maj = (table: NomTable, id: string, champs: Record<string, string>) => faire([{ table, id, champs }]);

export function PageCostume({ id, onglet = 'pieces' }: { id: string; onglet?: string }) {
  const d = donnees.value;
  const c = ligne(d, 'Costumes', id);
  const [fiche, setFiche] = useState(false);
  const [menuImage, setMenuImage] = useState(false);
  const [recadrer, setRecadrer] = useState(false);
  const [sauvegarde, setSauvegarde] = useState<'sauvegarde' | 'archive' | null>(null);
  const [suppression, setSuppression] = useState(false);
  if (!c) return <div class="page"><Vide icone="boite" titre="Costume introuvable"><a href="#/">Retour aux costumes</a></Vide></div>;
  if (c.statut === 'archivé') aller('/archives');

  const a = avancementCostume(d, id);
  const piecesCostume = piecesDe(d, id);
  const nbTerminees = piecesCostume.filter(p => pieceTerminee(d, p.id)).length;
  const sc = statutCostume(c, jour.value);
  const dl = deadlineCostume(d, c);
  const ev = ligne(d, 'Evenements', c.evenement_id);
  const suivi = bool(c.suivi_budget);
  const planifie = bool(c.suivi_planning);
  const onglets: [string, string][] = [
    ['pieces', 'Pièces'], ['fournitures', 'Fournitures'], ['photos', 'Photos'],
    ...(suivi ? [['budget', 'Budget'] as [string, string]] : []),
    ...(planifie ? [['planning', 'Planning'] as [string, string]] : []),
    ['wip', 'Dossier WIP'],
  ];

  // Onglet demandé mais masqué (planning non suivi, par exemple) : on retombe sur les pièces.
  const vu = onglets.some(([cle]) => cle === onglet) ? onglet : 'pieces';

  const changerImage = async (f?: File) => {
    if (!f) return;
    maj('Costumes', id, { image_ref: await ajouterImage(f), cadrage: '' });
    setMenuImage(false);
    setRecadrer(true); // on propose tout de suite de recadrer la nouvelle image
  };
  const choixFichier = (
    <input type="file" accept="image/*" class="cache" onChange={e => changerImage((e.target as HTMLInputElement).files?.[0])} />
  );

  return (
    <div class="page page-costume">
      <a class="lien-retour" href="#/"><Icone nom="retour" taille={16} />Costumes</a>
      <header class="costume-tete">
        {c.image_ref ? (
          <button class="costume-image" title="Image de référence : recadrer ou changer" onClick={() => setMenuImage(true)}>
            <ImageCadree id={c.image_ref} cadrage={c.cadrage} alt={`Référence ${c.nom}`} />
          </button>
        ) : (
          <label class="costume-image" title="Ajouter une image de référence">
            <div class="photo-vide"><Icone nom="photo" taille={28} /><span>Image de référence</span></div>
            {choixFichier}
          </label>
        )}
        <div class="costume-infos">
          <div class="titre-ligne">
            <h1>{c.nom}</h1>
            <Menu actions={[
              { texte: 'Modifier la fiche', icone: 'crayon', faire: () => setFiche(true) },
              sc !== 'terminé' && { texte: 'Marquer terminé', icone: 'afaire', faire: () => maj('Costumes', id, { statut: 'terminé' }) },
              { texte: 'Réaliser une sauvegarde', icone: 'telecharger', faire: () => setSauvegarde('sauvegarde') },
              sc === 'terminé' && { texte: 'Archiver définitivement', icone: 'archive', faire: () => setSauvegarde('archive') },
              { texte: 'Supprimer le costume', icone: 'poubelle', danger: true, faire: () => setSuppression(true) },
            ]} />
          </div>
          {(c.personnage || c.oeuvre) && <p class="sous-titre">{[c.personnage, c.oeuvre].filter(Boolean).join(' · ')}</p>}
          <div class="ligne-avancement grande"><Barre a={a} /><Pct a={a} /></div>
          <div class="puces">
            <button class="puce-bouton" onClick={() => setFiche(true)}><Puce ton={sc === 'en cours' ? 'accent' : 'gris'}>{sc}</Puce></button>
            {c.statut === 'en attente' && c.attend_costume_id && <Puce ton="gris">attend {ligne(d, 'Costumes', c.attend_costume_id)?.nom ?? '?'}</Puce>}
            {dl && <Puce ton={dl < jour.value ? 'rouge' : 'accent'}><Icone nom="drapeau" taille={12} />{ev ? `${ev.nom} · ` : ''}{jourCourt(dl)} ({relatif(dl, jour.value)})</Puce>}
            {c.debut && c.statut === 'projet' && <Puce ton="gris">début {jourCourt(c.debut)}</Puce>}
            <Puce ton="gris">{nbTerminees}/{piecesCostume.length} pièce{piecesCostume.length > 1 ? 's' : ''} terminée{piecesCostume.length > 1 ? 's' : ''}</Puce>
          </div>
        </div>
      </header>

      <nav class="onglets" aria-label="Sections du costume">
        {onglets.map(([cle, texte]) => (
          <a href={lienCostume(id, cle)} class={`onglet${vu === cle ? ' actif' : ''}`} aria-current={vu === cle ? 'page' : undefined}>{texte}</a>
        ))}
      </nav>

      {vu === 'pieces' && <OngletPieces costume={c} />}
      {vu === 'fournitures' && <OngletFournitures costume={c} />}
      {vu === 'photos' && <OngletPhotos costume={c} />}
      {vu === 'budget' && <OngletBudget costume={c} />}
      {vu === 'planning' && <OngletPlanning costume={c} />}
      {vu === 'wip' && <OngletWip costume={c} />}

      {fiche && <FicheCostume id={id} onFermer={() => setFiche(false)} />}
      {suppression && (
        <Confirmer titre={`Supprimer « ${c.nom} » ?`} bouton="Supprimer" danger onNon={() => setSuppression(false)}
          onOui={() => { setSuppression(false); faire(supprimer(donnees.value, 'Costumes', id), `« ${c.nom} » supprimé`); aller('/'); }}
          texte={<>
            <p>Le costume est supprimé avec ses pièces, ses étapes, ses fournitures et ses photos. C'est définitif : seul le bouton « Annuler », juste après, permet de revenir en arrière.</p>
            <p>Pour le garder, fais d'abord une sauvegarde (menu « … » › Réaliser une sauvegarde).</p>
          </>} />
      )}
      {sauvegarde && <FeuilleSauvegarde costume={c} archive={sauvegarde === 'archive'} onFermer={() => setSauvegarde(null)} />}
      {menuImage && (
        <Feuille titre="Image de référence" onFermer={() => setMenuImage(false)}>
          <div class="menu-liste">
            <button class="menu-action" onClick={() => { setMenuImage(false); setRecadrer(true); }}><Icone nom="photo" /><span>Recadrer</span></button>
            <label class="menu-action"><Icone nom="telecharger" /><span>Changer d'image</span>{choixFichier}</label>
            <button class="menu-action danger" onClick={() => { maj('Costumes', id, { image_ref: '', cadrage: '' }); setMenuImage(false); }}><Icone nom="poubelle" /><span>Retirer l'image</span></button>
          </div>
        </Feuille>
      )}
      {recadrer && c.image_ref && (
        <EditeurCadrage id={c.image_ref} cadrage={c.cadrage} onValider={v => maj('Costumes', id, { cadrage: v })} onFermer={() => setRecadrer(false)} />
      )}
    </div>
  );
}

/**
 * Fiche du costume. `nouveau` : à la création, le costume existe déjà (vide) ; si on ferme sans lui
 * donner de nom, il est retiré sans laisser de trace, sinon on ouvre sa page.
 */
export function FicheCostume({ id, onFermer, nouveau }: { id: string; onFermer: () => void; nouveau?: boolean }) {
  const d = donnees.value;
  const c = d.Costumes[id];
  const m = (champs: Record<string, string>) => maj('Costumes', id, champs);
  const autres = costumes(d).filter(x => x.id !== id && x.statut !== 'archivé');
  const evenements = tous(d, 'Evenements');
  const [nouvelEv, setNouvelEv] = useState(false);
  const fermer = () => {
    // Valide le champ en cours de saisie (les champs n'enregistrent qu'à la sortie).
    (document.activeElement as HTMLElement | null)?.blur();
    if (!nouveau) { onFermer(); return; }
    if (!donnees.value.Costumes[id]?.nom) faire(purgerNouveau(id)); // fermé sans nom : on oublie
    else aller(`/costume/${id}`);
    onFermer();
  };

  return (
    <Feuille titre={nouveau ? 'Nouveau costume' : 'Fiche du costume'} onFermer={fermer} pied={<>
      {nouveau && <button class="bouton" onClick={() => { faire(purgerNouveau(id)); onFermer(); }}>Annuler</button>}
      <button class="bouton principal" onClick={fermer}>{nouveau ? 'Créer' : 'Terminé'}</button>
    </>}>
      <Champ label="Nom"><Texte valeur={c.nom} autoFocus={nouveau} onValider={v => v && m({ nom: v })} /></Champ>
      <div class="deux-colonnes">
        <Champ label="Personnage"><Texte valeur={c.personnage ?? ''} onValider={v => m({ personnage: v })} /></Champ>
        <Champ label="Œuvre"><Texte valeur={c.oeuvre ?? ''} onValider={v => m({ oeuvre: v })} /></Champ>
      </div>
      <Champ label="Statut" aide="« En attente » : créé, mais attend un autre costume. N'apparaît pas dans « À faire ».">
        <Selection label="Statut" valeur={c.statut || 'projet'} options={STATUTS_COSTUME.filter(s => s !== 'archivé')} onChange={v => m({ statut: v })} />
      </Champ>
      {c.statut === 'en attente' && (
        <Champ label="Attend le costume">
          <Selection label="Attend le costume" valeur={c.attend_costume_id ?? ''} options={[['', '—'], ...autres.map(x => [x.id, x.nom] as [string, string])]} onChange={v => m({ attend_costume_id: v })} />
        </Champ>
      )}
      <div class="deux-colonnes">
        <Champ label="Date de début (facultative)" aide="Le jour venu, un costume « en projet » passe en cours tout seul.">
          <ChoixDate label="date de début" valeur={c.debut ?? ''} onChange={v => m({ debut: v })} />
        </Champ>
        <Champ label="Deadline (facultative)">
          <ChoixDate label="deadline" valeur={c.deadline ?? ''} min={c.debut || undefined} onChange={v => m({ deadline: v })} />
        </Champ>
      </div>
      <Champ label="Convention / événement (facultatif)" aide="Sans deadline, la date de l'événement sert de deadline.">
        <div class="ligne-actions">
          <Selection label="Événement" valeur={c.evenement_id ?? ''} options={[['', '—'], ...evenements.map(e => [e.id, `${e.nom}${e.date_debut ? ` (${jourCourt(e.date_debut)})` : ''}`] as [string, string])]} onChange={v => m({ evenement_id: v })} />
          <button class="bouton petit" onClick={() => setNouvelEv(true)}><Icone nom="plus" taille={16} />Nouveau</button>
        </div>
      </Champ>
      <label class="interrupteur">
        <input type="checkbox" checked={bool(c.suivi_budget)} onChange={e => m({ suivi_budget: txtBool((e.target as HTMLInputElement).checked) })} />
        <span>Suivre le budget de ce costume</span>
      </label>
      <label class="interrupteur">
        <input type="checkbox" checked={bool(c.suivi_planning)} onChange={e => m({ suivi_planning: txtBool((e.target as HTMLInputElement).checked) })} />
        <span>Suivre le planning de ce costume</span>
      </label>
      {bool(c.suivi_budget) && <Champ label="Budget prévu (€, facultatif)"><Texte type="number" valeur={c.budget_prevu ?? ''} onValider={v => m({ budget_prevu: v })} /></Champ>}
      <Champ label="Notes"><Texte multiligne valeur={c.notes ?? ''} onValider={v => m({ notes: v })} /></Champ>
      {nouvelEv && <EditeurEvenement onFermer={id2 => { setNouvelEv(false); if (id2) m({ evenement_id: id2 }); }} />}
    </Feuille>
  );
}

export function EditeurEvenement({ id, onFermer }: { id?: string; onFermer: (id?: string) => void }) {
  const existant = id ? donnees.value.Evenements[id] : undefined;
  const [v, setV] = useState({ nom: existant?.nom ?? '', date_debut: existant?.date_debut ?? '', date_fin: existant?.date_fin ?? '', lieu: existant?.lieu ?? '', notes: existant?.notes ?? '' });
  const valider = () => {
    if (!v.nom.trim()) return;
    const eid = id ?? nouvelId();
    faire([{ table: 'Evenements', id: eid, champs: { ...v, nom: v.nom.trim() } }]);
    onFermer(eid);
  };
  return (
    <Feuille titre={id ? "Modifier l'événement" : 'Nouvel événement'} onFermer={() => onFermer()} pied={<>
      {id && <button class="bouton danger" onClick={() => { faire(supprimer(donnees.value, 'Evenements', id), 'Événement supprimé'); onFermer(); }}>Supprimer</button>}
      <button class="bouton principal" disabled={!v.nom.trim()} onClick={valider}>Enregistrer</button>
    </>}>
      <Champ label="Nom"><input value={v.nom} autoFocus onInput={e => setV({ ...v, nom: (e.target as HTMLInputElement).value })} /></Champ>
      <div class="deux-colonnes">
        <Champ label="Du"><ChoixDate label="date de début" valeur={v.date_debut}
          onChange={x => setV({ ...v, date_debut: x, date_fin: x && (!v.date_fin || v.date_fin < x) ? ajouterJours(x, 1) : v.date_fin })} /></Champ>
        <Champ label="Au"><ChoixDate label="date de fin" valeur={v.date_fin} min={v.date_debut || undefined} onChange={x => setV({ ...v, date_fin: x })} /></Champ>
      </div>
      <Champ label="Lieu"><input value={v.lieu} onInput={e => setV({ ...v, lieu: (e.target as HTMLInputElement).value })} /></Champ>
      <Champ label="Notes"><textarea rows={2} value={v.notes} onInput={e => setV({ ...v, notes: (e.target as HTMLTextAreaElement).value })} /></Champ>
    </Feuille>
  );
}
