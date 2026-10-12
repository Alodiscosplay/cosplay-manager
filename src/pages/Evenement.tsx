// Fiche d'un événement : une convention, ou une activité (concours, show…) seule ou dans une convention ;
// les costumes qu'on y porte et les dates clés à suivre.
import { useEffect, useRef, useState } from 'preact/hooks';
import { donnees, jour, faire } from '../store/store';
import { costumes, ordreSuivant } from '../logique/acces';
import {
  CONVENTION, activitesConnues, activiteSaisie, libelleEvenement, conventionDe, activitesDe, conventionsPossibles,
  costumesDe, costumesPrevus, datesClesDe, texteDates, NATURES, natureDe, type Nature, nomEvenement,
} from '../logique/evenements';
import { jourCourt, lireJour } from '../logique/dates';
import { bool, liste, txtBool, txtListe, type Ligne } from '../modele/schema';
import { nouvelId, supprimer } from '../store/operations';
import { Feuille, Champ, Texte, ChoixDate, Selection, Confirmer, Case } from '../composants/base';
import { Icone } from '../composants/Icone';

const AUTRE = '__autre';

/** Lier (ou délier) un costume et un événement : le costume garde la liste de ses événements. */
export function lierCostume(c: Ligne, evenementId: string, lie: boolean) {
  const ids = liste(c.evenement_id).filter(x => x !== evenementId);
  faire([{ table: 'Costumes', id: c.id, champs: { evenement_id: txtListe(lie ? [...ids, evenementId] : ids) } }]);
}

/** L'activité : une de la liste, ou « Autre… » pour en taper une. */
function ChoixActivite({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const connues = activitesConnues(donnees.value);
  const [autre, setAutre] = useState(false);
  const libre = autre || (!!valeur && !connues.includes(valeur));
  return (
    <div class="ligne-actions">
      <Selection label="Activité" valeur={libre ? AUTRE : valeur}
        options={[...(valeur || libre ? [] : [['', 'Choisir l’activité…'] as [string, string]]), ...connues.map(a => [a, a] as [string, string]), [AUTRE, 'Autre…']]}
        onChange={v => { if (v === AUTRE) setAutre(true); else { setAutre(false); onChange(v); } }} />
      {libre && <Texte valeur={connues.includes(valeur) ? '' : valeur} placeholder="Laquelle ?" autoFocus={autre} onValider={v => v && onChange(v)} />}
    </div>
  );
}

/** Crée un événement vide : une activité de `convention`, ou un événement seul. `costume` y est lié d'office. */
function creerEvenement(convention?: string, costume?: string): string {
  const d = donnees.value;
  const conv = convention ? d.Evenements[convention] : undefined;
  const eid = nouvelId();
  const jourConv = lireJour(conv?.date_debut) || '';
  faire([{ table: 'Evenements', id: eid, champs: {
    nom: '', activite: conv ? '' : CONVENTION, convention_id: conv ? conv.id : '', date_debut: jourConv, date_fin: jourConv,
    ordre: conv ? ordreSuivant(activitesDe(d, conv.id)) : '',
  } }]);
  if (costume && d.Costumes[costume]) lierCostume(donnees.value.Costumes[costume], eid, true);
  return eid;
}

/**
 * À la fermeture : une activité sans nom prend celui de son activité (« Show cosplay ») ; un événement
 * resté sans nom est oublié. Renvoie false s'il a été retiré.
 */
function nommerOuOublier(id: string): boolean {
  const e = donnees.value.Evenements[id];
  if (!e || e.supprime) return false;
  const nom = e.nom?.trim() || (e.convention_id && e.activite ? e.activite : '');
  if (!nom) { faire(supprimer(donnees.value, 'Evenements', id)); return false; }
  if (!e.nom) faire([{ table: 'Evenements', id, champs: { nom } }]);
  return true;
}


/**
 * `id` : un événement existant. Sans `id`, on en crée un vide et on ouvre directement sa fiche
 * (`costume` y est lié d'office). Fermée sans nom, la fiche ne laisse aucune trace.
 */
export function EditeurEvenement({ id, costume, onFermer }: { id?: string; costume?: string; onFermer: (id?: string) => void }) {
  const [courant] = useState(() => id ?? creerEvenement(undefined, costume));
  return <FicheEvenement id={courant} nouveau={!id} onFermer={() => onFermer(donnees.value.Evenements[courant]?.supprime ? undefined : courant)} />;
}

function FicheEvenement({ id, nouveau, onFermer }: { id: string; nouveau?: boolean; onFermer: () => void }) {
  const d = donnees.value;
  const ev = d.Evenements[id];
  // Les activités dépliées dans la fiche de la convention, et celle qu'on vient d'ajouter.
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const [ajoutee, setAjoutee] = useState('');
  const [suppression, setSuppression] = useState(false);
  if (!ev || ev.supprime) return null;
  const conv = conventionDe(d, ev);
  const activite = activiteSaisie(ev);
  const convention = activite === CONVENTION;
  const activites = activitesDe(d, id);
  const basculer = (a: string) => { const s = new Set(ouvertes); if (s.has(a)) s.delete(a); else s.add(a); setOuvertes(s); };
  const ajouterActivite = () => { const a = creerEvenement(id); setOuvertes(new Set([...ouvertes, a])); setAjoutee(a); };
  const annuler = () => { faire(supprimer(donnees.value, 'Evenements', id)); onFermer(); };
  const fermer = () => {
    // Valide le champ en cours de saisie (les champs n'enregistrent qu'à la sortie).
    (document.activeElement as HTMLElement | null)?.blur();
    for (const a of activitesDe(donnees.value, id)) nommerOuOublier(a.id);
    if (nouveau) nommerOuOublier(id);
    onFermer();
  };

  return (
    <Feuille titre={nouveau ? 'Nouvel événement' : conv ? `${activite} · ${conv.nom}` : activite} onFermer={fermer} pied={<>
      {nouveau
        ? <button class="bouton" onClick={annuler}>Annuler</button>
        : <button class="bouton danger" onClick={() => setSuppression(true)}>Supprimer</button>}
      <button class="bouton principal" onClick={fermer}>{nouveau ? 'Créer' : 'Terminé'}</button>
    </>}>
      <ChampsEvenement ev={ev} focus={nouveau} />

      {convention && (
        <section class="sous-groupe">
          <h3 class="groupe-titre">Activités dans la convention</h3>
          {/* Celle qu'on vient d'ajouter reste en bas, là où on a cliqué ; à la réouverture, tout est par date. */}
          {[...activites.filter(a => a.id !== ajoutee), ...activites.filter(a => a.id === ajoutee)].map(a => (
            <BlocActivite key={a.id} a={a} ouverte={ouvertes.has(a.id)} nouvelle={a.id === ajoutee} onBasculer={() => basculer(a.id)} />
          ))}
          <button class="bouton petit" onClick={ajouterActivite}><Icone nom="plus" taille={16} />Activité</button>
        </section>
      )}

      <SectionCostumes id={id} quoi={conv ? 'activité' : 'événement'} onQuitter={fermer} />
      <SectionDatesCles id={id} quoi={conv ? 'activité' : 'événement'} />
      <Champ label="Notes"><Texte multiligne valeur={ev.notes ?? ''} onValider={v => faire([{ table: 'Evenements', id, champs: { notes: v } }])} /></Champ>

      {suppression && <ConfirmerSuppression id={id} onNon={() => setSuppression(false)} onFait={() => { setSuppression(false); onFermer(); }} />}
    </Feuille>
  );
}

/** Activité, convention, nom, dates, lieu et lien. `dansBloc` : une activité dépliée dans sa convention. */
function ChampsEvenement({ ev, focus, dansBloc }: { ev: Ligne; focus?: boolean; dansBloc?: boolean }) {
  const d = donnees.value;
  const j = jour.value;
  const m = (champs: Record<string, string>) => faire([{ table: 'Evenements', id: ev.id, champs }]);
  const conv = conventionDe(d, ev);
  const activite = activiteSaisie(ev);
  return (
    <>
      <Champ label="Activité"><ChoixActivite valeur={activite} onChange={a => m({ activite: a, ...(a === CONVENTION && !dansBloc ? { convention_id: '' } : {}) })} /></Champ>
      {activite !== CONVENTION && !dansBloc && (
        <Champ label="Dans la convention (facultatif)" aide="Pour une activité au sein d'une convention, comme un show. Un shooting autonome (une photocon, par exemple) n'en a pas.">
          <Selection label="Convention" valeur={ev.convention_id ?? ''} options={[['', '— aucune —'], ...conventionsPossibles(d, ev.id).map(e => [e.id, e.nom] as [string, string])]}
            onChange={x => m({ convention_id: x, ...(x && !ev.date_debut ? { date_debut: d.Evenements[x]?.date_debut ?? '', date_fin: d.Evenements[x]?.date_debut ?? '' } : {}) })} />
        </Champ>
      )}
      <Champ label="Nom" aide={conv && !ev.nom ? `Laissé vide : « ${activite || 'l’activité'} ».` : undefined}>
        <Texte valeur={ev.nom} autoFocus={focus} placeholder={conv ? activite : ''} onValider={v => v && m({ nom: v })} />
      </Champ>
      {conv ? (
        <Champ label="Jour de passage">
          <ChoixDate label="jour de passage" valeur={ev.date_debut ?? ''} min={conv.date_debut || undefined} onChange={x => m({ date_debut: x, date_fin: x })} />
          <span class="champ-aide">{conv.nom} : {conv.date_debut ? jourCourt(conv.date_debut, j) : 'sans date'}{conv.date_fin && conv.date_fin !== conv.date_debut ? ` → ${jourCourt(conv.date_fin, j)}` : ''}</span>
        </Champ>
      ) : (
        <div class="deux-colonnes">
          <Champ label="Du"><ChoixDate label="date de début" valeur={ev.date_debut ?? ''}
            onChange={x => m({ date_debut: x, ...(x && (!ev.date_fin || ev.date_fin < x) ? { date_fin: x } : {}) })} /></Champ>
          <Champ label="Au"><ChoixDate label="date de fin" valeur={ev.date_fin ?? ''} min={ev.date_debut || undefined} onChange={x => m({ date_fin: x })} /></Champ>
        </div>
      )}
      {!conv && <Champ label="Lieu"><Texte valeur={ev.lieu ?? ''} onValider={v => m({ lieu: v })} /></Champ>}
      <Champ label="Lien (facultatif)">
        <div class="ligne-actions">
          <Texte type="url" valeur={ev.lien ?? ''} placeholder="https://" onValider={v => m({ lien: v })} />
          {/^https?:\/\//.test(ev.lien ?? '') && <a class="bouton-icone" href={ev.lien} target="_blank" rel="noopener" aria-label="Ouvrir le lien" title="Ouvrir le lien"><Icone nom="lien" /></a>}
        </div>
      </Champ>
    </>
  );
}

/** Une activité de la convention, dépliée sur place : la fiche de la convention reste au-dessus. */
function BlocActivite({ a, ouverte, nouvelle, onBasculer }: { a: Ligne; ouverte: boolean; nouvelle: boolean; onBasculer: () => void }) {
  const j = jour.value;
  const ref = useRef<HTMLDivElement>(null);
  const [suppression, setSuppression] = useState(false);
  // Une activité qu'on vient d'ajouter : on fait défiler la fiche jusqu'à elle (sans bouger la page derrière).
  useEffect(() => {
    const el = ref.current;
    const boite = el?.closest<HTMLElement>('.feuille-contenu');
    if (!nouvelle || !el || !boite) return;
    setTimeout(() => { boite.scrollTop += el.getBoundingClientRect().top - boite.getBoundingClientRect().top - 8; }, 0);
  }, [nouvelle]);
  const activite = activiteSaisie(a);
  const infos = [a.nom && activite && a.nom !== activite ? activite : '', a.date_debut ? jourCourt(a.date_debut, j) : 'jour à fixer'].filter(Boolean).join(' · ');
  return (
    <div class={`bloc-activite${ouverte ? ' ouverte' : ''}`} ref={ref}>
      <button type="button" class="bloc-activite-tete" aria-expanded={ouverte} onClick={onBasculer}>
        <Icone nom={ouverte ? 'bas' : 'chevron'} taille={16} />
        <span class="bloc-activite-nom">{a.nom || activite || 'Nouvelle activité'}</span>
        <span class="petit-texte">{infos}</span>
      </button>
      {ouverte && (
        <div class="bloc-activite-corps">
          <ChampsEvenement ev={a} dansBloc />
          <SectionCostumes id={a.id} quoi="activité" />
          <SectionDatesCles id={a.id} quoi="activité" />
          <Champ label="Notes"><Texte multiligne valeur={a.notes ?? ''} onValider={v => faire([{ table: 'Evenements', id: a.id, champs: { notes: v } }])} /></Champ>
          <button class="bouton petit danger" onClick={() => setSuppression(true)}><Icone nom="poubelle" taille={16} />Supprimer l'activité</button>
          {suppression && <ConfirmerSuppression id={a.id} onNon={() => setSuppression(false)} onFait={() => setSuppression(false)} />}
        </div>
      )}
    </div>
  );
}

/** `quoi` : « activité » ou « événement », pour ne pas confondre ce qui est prévu pour l'une ou pour l'autre. */
type Quoi = 'activité' | 'événement';

function SectionCostumes({ id, quoi, onQuitter }: { id: string; quoi: Quoi; onQuitter?: () => void }) {
  const d = donnees.value;
  // Un costume prévu pour une activité l'est d'office pour sa convention : il s'affiche ici, sans croix.
  const prevus = costumesPrevus(d, id);
  const ajoutables = costumes(d).filter(c => c.statut !== 'archivé' && !prevus.some(x => x.costume.id === c.id));
  return (
    <section class="sous-groupe">
      <h3 class="groupe-titre">Costumes prévus pour l'{quoi}</h3>
      <ul class="liste-simple">
        {prevus.map(({ costume: c, via }) => (
          <li><a href={`#/costume/${c.id}`} onClick={onQuitter}>{c.nom}</a>
            {via
              ? <span class="petit-texte">prévu pour l'activité « {libelleEvenement(via)} »</span>
              : <button class="bouton-icone petit" aria-label={`Retirer ${c.nom}`} title="Retirer" onClick={() => lierCostume(c, id, false)}><Icone nom="croix" taille={16} /></button>}</li>
        ))}
      </ul>
      {ajoutables.length > 0 && (
        <Selection label="Ajouter un costume" valeur="" options={[['', '+ Ajouter un costume…'], ...ajoutables.map(c => [c.id, c.nom] as [string, string])]}
          onChange={x => x && lierCostume(d.Costumes[x], id, true)} />
      )}
    </section>
  );
}

function SectionDatesCles({ id, quoi }: { id: string; quoi: Quoi }) {
  const d = donnees.value;
  const j = jour.value;
  const [dateCle, setDateCle] = useState<string | 'nouvelle' | null>(null);
  const dates = datesClesDe(d, id);
  return (
    <section class="sous-groupe">
      <h3 class="groupe-titre">Dates clés de l'{quoi}</h3>
      <ul class="etapes">
        {dates.map(dc => (
          <li class={`etape${bool(dc.fait) ? ' fait' : ''}`}>
            <Case coche={bool(dc.fait)} label={dc.titre}
              onChange={v => faire([{ table: 'DatesCles', id: dc.id, champs: { fait: txtBool(v), fait_le: v ? j : '', ...(v ? { urgent: '' } : {}) } }])} />
            <button class="etape-texte" onClick={() => setDateCle(dc.id)}>
              <span class="etape-titre">{dc.titre}</span>
              <span class="etape-meta"><span>{NATURES[natureDe(dc)]}</span><span>{texteDates(dc, j)}</span></span>
            </button>
          </li>
        ))}
      </ul>
      <button class="bouton petit" onClick={() => setDateCle('nouvelle')}><Icone nom="plus" taille={16} />Date clé</button>
      {dateCle && <EditeurDateCle id={dateCle === 'nouvelle' ? undefined : dateCle} evenementId={id} onFermer={() => setDateCle(null)} />}
    </section>
  );
}

/** Ce qu'emporte la suppression d'un événement, avant de confirmer. */
function ConfirmerSuppression({ id, onNon, onFait }: { id: string; onNon: () => void; onFait: () => void }) {
  const d = donnees.value;
  const ev = d.Evenements[id];
  if (!ev) return null;
  const activites = activitesDe(d, id);
  const dates = datesClesDe(d, id);
  const nbDatesActivites = activites.reduce((n, a) => n + datesClesDe(d, a.id).length, 0);
  // « sa date clé », « ses 3 dates clés »
  const nDates = (n: number, une: string, plusieurs: string) => (n === 1 ? `${une} date clé` : `${plusieurs} ${n} dates clés`);
  const touches = [...new Set([...costumesDe(d, id), ...activites.flatMap(a => costumesDe(d, a.id))])];
  const nom = libelleEvenement(ev);
  return (
    <Confirmer titre={`Supprimer « ${ev.nom ? nomEvenement(d, ev) : nom} » ?`} bouton="Supprimer définitivement" danger onNon={onNon}
      onOui={() => { faire(supprimer(donnees.value, 'Evenements', id), `« ${nom} » supprimé`); onFait(); }}
      texte={<>
        <p>Seront supprimés :</p>
        <ul>
          <li>{ev.convention_id ? 'l’activité' : 'l’événement'} « {nom} »{dates.length ? ` et ${nDates(dates.length, 'sa', 'ses')}` : ''}{activites.length ? ' ;' : '.'}</li>
          {activites.length > 0 && <li>{activites.length > 1 ? `ses ${activites.length} activités` : 'son activité'} ({activites.map(libelleEvenement).join(', ')}){nbDatesActivites ? ` et ${activites.length > 1 ? nDates(nbDatesActivites, 'leur', 'leurs') : nDates(nbDatesActivites, 'sa', 'ses')}` : ''}.</li>}
        </ul>
        {touches.length > 0 && <p>{touches.length > 1 ? `Les costumes (${touches.map(c => c.nom).join(', ')}) restent : ils ne seront plus liés` : `Le costume « ${touches[0].nom} » reste : il ne sera plus lié`} à {activites.length ? 'ces événements' : 'cet événement'}.</p>}
        <p>C'est définitif : seul le bouton « Annuler », juste après, permet de revenir en arrière.</p>
      </>} />
  );
}

/** Une date clé : une période (inscriptions), une date limite (envoi des références) ou une date fixe (réponse, répétition). */
function EditeurDateCle({ id, evenementId, onFermer }: { id?: string; evenementId: string; onFermer: () => void }) {
  const d = donnees.value;
  const existante = id ? d.DatesCles[id] : undefined;
  const [v, setV] = useState({
    titre: existante?.titre ?? '', nature: (existante ? natureDe(existante) : 'fixe') as Nature,
    debut: existante?.debut ?? '', fin: existante?.fin ?? '', lien: existante?.lien ?? '', notes: existante?.notes ?? '',
  });
  const [suppression, setSuppression] = useState(false);
  const valider = () => {
    if (!v.titre.trim()) return;
    const champs = { ...v, titre: v.titre.trim(), lien: v.lien.trim(), debut: v.nature === 'periode' ? v.debut : '' };
    faire([{ table: 'DatesCles', id: id ?? nouvelId(), champs: id ? champs : { ...champs, evenement_id: evenementId, ordre: ordreSuivant(datesClesDe(d, evenementId)) } }]);
    onFermer();
  };
  const libelleFin = v.nature === 'periode' ? 'Au' : v.nature === 'limite' ? 'Avant le' : 'Le';
  return (
    <Feuille titre={id ? 'Date clé' : 'Nouvelle date clé'} onFermer={onFermer} pied={<>
      {id && <button class="bouton danger" onClick={() => setSuppression(true)}>Supprimer</button>}
      <button class="bouton principal" disabled={!v.titre.trim()} onClick={valider}>Enregistrer</button>
    </>}>
      <Champ label="Intitulé"><input value={v.titre} autoFocus={!id} onInput={e => setV({ ...v, titre: (e.target as HTMLInputElement).value })} /></Champ>
      <Champ label="Nature" aide="Période : à faire pendant ces dates. Date limite : à faire avant. Date fixe : un jour précis (réponse attendue, répétition…).">
        <Selection label="Nature" valeur={v.nature} options={Object.entries(NATURES) as [Nature, string][]} onChange={x => setV({ ...v, nature: x })} />
      </Champ>
      {v.nature === 'periode' ? (
        <div class="deux-colonnes">
          <Champ label="Du"><ChoixDate label="début" valeur={v.debut} onChange={x => setV({ ...v, debut: x, fin: x && v.fin && v.fin < x ? x : v.fin })} /></Champ>
          <Champ label="Au"><ChoixDate label="fin" valeur={v.fin} min={v.debut || undefined} onChange={x => setV({ ...v, fin: x })} /></Champ>
        </div>
      ) : (
        <Champ label={libelleFin}><ChoixDate label={libelleFin.toLowerCase()} valeur={v.fin} onChange={x => setV({ ...v, fin: x })} /></Champ>
      )}
      <Champ label="Lien (facultatif)" aide="Le formulaire d'inscription, la page du règlement…">
        <input type="url" value={v.lien} placeholder="https://" onInput={e => setV({ ...v, lien: (e.target as HTMLInputElement).value })} />
      </Champ>
      <Champ label="Notes"><textarea rows={2} value={v.notes} onInput={e => setV({ ...v, notes: (e.target as HTMLTextAreaElement).value })} /></Champ>
      {suppression && id && (
        <Confirmer titre={`Supprimer « ${existante?.titre} » ?`} bouton="Supprimer définitivement" danger onNon={() => setSuppression(false)}
          onOui={() => { setSuppression(false); faire(supprimer(donnees.value, 'DatesCles', id), 'Date clé supprimée'); onFermer(); }}
          texte={<p>La date clé est supprimée. C'est définitif : seul le bouton « Annuler », juste après, permet de revenir en arrière.</p>} />
      )}
    </Feuille>
  );
}
