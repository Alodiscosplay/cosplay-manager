import { useState } from 'preact/hooks';
import { donnees, jour, faire } from '../store/store';
import { costumes, tous, ligne } from '../logique/acces';
import { regrouperAchats, SANS_FOURNISSEUR, type GroupementAchats, regrouperParNom, lignesCommande, totalCommande, euros, montant } from '../logique/budget';
import { jourCourt } from '../logique/dates';
import { STATUTS_FOURNITURE, STATUTS_COMMANDE, type Ligne } from '../modele/schema';
import { creerCommandes, changerStatutCommande, supprimer, purger, retirerDeCommande, nouvelId } from '../store/operations';
import { GroupeFourniture, EditeurFourniture } from '../composants/Fournitures';
import { Feuille, Champ, Texte, Selection, Puce, Vide, Menu } from '../composants/base';
import { Icone } from '../composants/Icone';
import { IndicateurSync } from '../app';
import { lienCostume } from '../routeur';

const CLE_GROUPEMENT = 'cosplay-planner.groupement-achats';

export function PageAchats({ onglet = 'liste' }: { onglet?: string }) {
  const d = donnees.value;
  const nbCmd = tous(d, 'Commandes').filter(c => c.statut !== 'reçue').length;
  return (
    <div class="page">
      <header class="page-tete">
        <h1>Achats</h1>
        <IndicateurSync />
      </header>
      <nav class="onglets" aria-label="Sections des achats">
        <a href="#/achats/liste" class={`onglet${onglet === 'liste' ? ' actif' : ''}`}>Liste de courses</a>
        <a href="#/achats/commandes" class={`onglet${onglet === 'commandes' ? ' actif' : ''}`}>Commandes{nbCmd ? ` (${nbCmd})` : ''}</a>
        <a href="#/achats/fournisseurs" class={`onglet${onglet === 'fournisseurs' ? ' actif' : ''}`}>Fournisseurs</a>
      </nav>
      {onglet === 'liste' && <ListeCourses />}
      {onglet === 'commandes' && <Commandes />}
      {onglet === 'fournisseurs' && <Fournisseurs />}
    </div>
  );
}

function ListeCourses() {
  const d = donnees.value;
  const [costume, setCostume] = useState('');
  // Plusieurs statuts à la fois ; vide = tous.
  const [statuts, setStatuts] = useState<Set<string>>(() => new Set(['à acheter']));
  const basculerStatut = (x: string) => { const n = new Set(statuts); if (n.has(x)) n.delete(x); else n.add(x); setStatuts(n); };
  const [fournisseur, setFournisseur] = useState('');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [ouvert, setOuvert] = useState<string | 'nouveau' | null>(null);
  const [par, setParEtat] = useState<GroupementAchats>(() => { try { return localStorage.getItem(CLE_GROUPEMENT) === 'costume' ? 'costume' : 'fournisseur'; } catch { return 'fournisseur'; } });
  const setPar = (v: GroupementAchats) => { setParEtat(v); try { localStorage.setItem(CLE_GROUPEMENT, v); } catch { /* ignoré */ } };
  // Le filtre ne propose que les fournisseurs qui ont au moins une fourniture.
  const utilises = new Set(tous(d, 'Fournitures').map(f => f.fournisseur_id).filter(Boolean));
  const groupes = regrouperAchats(d, { costumeId: costume || undefined, fournisseurId: fournisseur || undefined, statuts: statuts.size ? [...statuts] : undefined }, par);
  const nb = groupes.reduce((s, g) => s + g.lignes.length, 0);
  const choisirPlusieurs = (ids: string[], v: boolean) => { const s = new Set(selection); for (const id of ids) { if (v) s.add(id); else s.delete(id); } setSelection(s); };
  const selectionnables = (g: Ligne[]) => g.filter(f => !f.commande_id || !ligne(d, 'Commandes', f.commande_id));

  const [preparer, setPreparer] = useState(false);
  const commander = (ports: Record<string, string>) => {
    const ch = creerCommandes(d, [...selection], jour.value, ports);
    const n = ch.filter(c => c.table === 'Commandes').length;
    faire(ch, `${n} commande${n > 1 ? 's' : ''} passée${n > 1 ? 's' : ''}`);
    setSelection(new Set());
    setPreparer(false);
    location.hash = '#/achats/commandes';
  };

  return (
    <section class="contenu-onglet">
      <div class="barre-outils">
        <button class="bouton principal" onClick={() => setOuvert('nouveau')}><Icone nom="plus" />Fourniture</button>
        <Selection label="Tri" valeur={par} options={[['fournisseur', 'Tri par fournisseur'], ['costume', 'Tri par costume']]} onChange={v => setPar(v as GroupementAchats)} />
        <Selection label="Costume" valeur={costume} options={[['', 'Tous les costumes'], ...costumes(d).filter(c => c.statut !== 'archivé').map(c => [c.id, c.nom] as [string, string])]} onChange={setCostume} />
        <Selection label="Fournisseur" valeur={fournisseur} options={[['', 'Tous les fournisseurs'], ...tous(d, 'Fournisseurs').filter(f => utilises.has(f.id)).sort((a, b) => a.nom.localeCompare(b.nom)).map(f => [f.id, f.nom] as [string, string]), [SANS_FOURNISSEUR, 'Sans fournisseur']]} onChange={setFournisseur} />
        <div class="filtre-statuts" role="group" aria-label="Filtrer par statut">
          {STATUTS_FOURNITURE.map(x => (
            <label class={`puce-filtre${statuts.has(x) ? ' actif' : ''}`}>
              <input type="checkbox" checked={statuts.has(x)} onChange={() => basculerStatut(x)} />
              <span>{x}</span>
            </label>
          ))}
        </div>
      </div>
      {selection.size > 0 && (
        <div class="barre-selection" role="region" aria-label="Sélection">
          <span>{selection.size} sélectionnée{selection.size > 1 ? 's' : ''}</span>
          <button class="bouton principal" onClick={() => setPreparer(true)}><Icone nom="boite" />Créer la commande</button>
          <button class="bouton" onClick={() => setSelection(new Set())}>Tout désélectionner</button>
          <span class="petit-texte">Une commande par fournisseur ; elle peut mêler plusieurs costumes.</span>
        </div>
      )}
      {!nb && <Vide icone="achats" titre={statuts.size === 1 && statuts.has('à acheter') ? 'Rien à acheter' : 'Aucune fourniture'}><p>Ajoute des fournitures ici ou depuis l'onglet Fournitures d'un costume.</p></Vide>}
      {groupes.map(g => {
        const libres = selectionnables(g.lignes);
        const tout = libres.length > 0 && libres.every(f => selection.has(f.id));
        const nomGroupe = par === 'costume' ? g.costume?.nom ?? 'Sans costume' : g.fournisseur?.nom ?? 'Sans fournisseur';
        return (
          <div class="groupe" key={g.cle}>
            <h2 class="groupe-titre">
              {libres.length > 0 && (
                <input type="checkbox" class="selection" checked={tout} aria-label={`Tout sélectionner : ${nomGroupe}`}
                  onChange={e => { const s = new Set(selection); for (const f of libres) { if ((e.target as HTMLInputElement).checked) s.add(f.id); else s.delete(f.id); } setSelection(s); }} />
              )}
              {g.costume ? <a href={lienCostume(g.costume.id)}>{g.costume.nom}</a> : nomGroupe}
              {g.fournisseur?.url && <a class="bouton-icone petit" href={g.fournisseur.url} target="_blank" rel="noopener noreferrer" aria-label={`Site de ${g.fournisseur.nom}`}><Icone nom="lien" taille={16} /></a>}
              {g.total > 0 && <span class="compteur">{euros(g.total)}</span>}
            </h2>
            <ul class="liste-fournitures">
              {regrouperParNom(g.lignes).map(gn => (
                <GroupeFourniture key={gn.cle} g={gn} sansStatut afficherCostume={!costume && par === 'fournisseur'} afficherFournisseur={par === 'costume'} selection={selection} onSelection={choisirPlusieurs} onOuvrir={setOuvert} />
              ))}
            </ul>
          </div>
        );
      })}
      {ouvert && <EditeurFourniture id={ouvert === 'nouveau' ? undefined : ouvert} costumeId={costume || undefined} onFermer={() => setOuvert(null)} />}
      {preparer && <NouvelleCommande ids={[...selection]} onCreer={commander} onFermer={() => setPreparer(false)} />}
    </section>
  );
}

/**
 * Avant de créer : les frais de port de chaque commande (une par fournisseur). Ils seront partagés à
 * parts égales entre les fournitures de la commande, et comptés dans le budget de leurs costumes.
 */
function NouvelleCommande({ ids, onCreer, onFermer }: { ids: string[]; onCreer: (ports: Record<string, string>) => void; onFermer: () => void }) {
  const d = donnees.value;
  const parFournisseur = new Map<string, Ligne[]>();
  for (const id of ids) {
    const f = ligne(d, 'Fournitures', id);
    if (f) parFournisseur.set(f.fournisseur_id || '', [...(parFournisseur.get(f.fournisseur_id || '') ?? []), f]);
  }
  const [ports, setPorts] = useState<Record<string, string>>({});
  const plusieurs = parFournisseur.size > 1;
  return (
    <Feuille titre={plusieurs ? `Nouvelles commandes (${parFournisseur.size})` : 'Nouvelle commande'} onFermer={onFermer} pied={<>
      <button class="bouton" onClick={onFermer}>Annuler</button>
      <button class="bouton principal" onClick={() => onCreer(ports)}>{plusieurs ? 'Créer les commandes' : 'Créer la commande'}</button>
    </>}>
      {plusieurs && <p class="petit-texte">Une commande par fournisseur.</p>}
      {[...parFournisseur].sort(([a], [b]) => !a ? 1 : !b ? -1 : (ligne(d, 'Fournisseurs', a)?.nom ?? '').localeCompare(ligne(d, 'Fournisseurs', b)?.nom ?? '')).map(([fid, lignes]) => {
        const nom = ligne(d, 'Fournisseurs', fid)?.nom ?? 'Sans fournisseur';
        const articles = lignes.reduce((s, f) => s + (montant(f) ?? 0), 0);
        return (
          <div class="nouvelle-commande">
            <p><strong>{nom}</strong> · {lignes.length} fourniture{lignes.length > 1 ? 's' : ''}{articles > 0 ? ` · ${euros(articles)}` : ''}</p>
            <Champ label="Frais de port (€)">
              <input type="number" inputMode="decimal" min="0" step="0.01" value={ports[fid] ?? ''} aria-label={`Frais de port ${nom}`}
                onInput={e => setPorts({ ...ports, [fid]: (e.target as HTMLInputElement).value })} />
            </Champ>
          </div>
        );
      })}
    </Feuille>
  );
}

function Commandes() {
  const d = donnees.value;
  const [voirRecues, setVoirRecues] = useState(false);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const toutes = tous(d, 'Commandes').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const liste = toutes.filter(c => voirRecues || c.statut !== 'reçue');
  return (
    <section class="contenu-onglet">
      <div class="barre-outils">
        <label class="interrupteur"><input type="checkbox" checked={voirRecues} onChange={e => setVoirRecues((e.target as HTMLInputElement).checked)} /><span>Afficher les commandes reçues</span></label>
      </div>
      {!liste.length && <Vide icone="boite" titre="Aucune commande en cours"><p>Dans la liste de courses, sélectionne des fournitures (de n'importe quels costumes) puis « Créer la commande ».</p></Vide>}
      <div class="grille-cartes">
        {liste.map(c => {
          const four = ligne(d, 'Fournisseurs', c.fournisseur_id);
          const lignes = lignesCommande(d, c.id);
          const t = totalCommande(d, c.id);
          const nomsCostumes = [...new Set(lignes.map(f => ligne(d, 'Costumes', f.costume_id)?.nom).filter(Boolean))];
          const recue = c.statut === 'reçue';
          const idx = recue ? 1 : 0; // une ancienne commande « à passer » se lit comme passée
          return (
            <article class="carte-commande">
              <header>
                <h3>{four?.nom ?? 'Sans fournisseur'}</h3>
                <Menu label="Actions de la commande" actions={[
                  { texte: 'Modifier', icone: 'crayon', faire: () => setOuverte(c.id) },
                  { texte: 'Supprimer la commande', icone: 'poubelle', danger: true, faire: () => faire([...supprimer('Commandes', c.id), ...lignes.flatMap(f => retirerDeCommande(f.id))], 'Commande supprimée') },
                ]} />
              </header>
              <ol class="etapes-statut" aria-label="Statut">
                {STATUTS_COMMANDE.map((s, i) => <li class={i <= idx ? 'atteint' : ''}>{s}</li>)}
              </ol>
              <p class="petit-texte">{c.date ? jourCourt(c.date) : ''}{nomsCostumes.length ? ` · ${nomsCostumes.join(', ')}` : ''}</p>
              <ul class="lignes-commande">
                {lignes.map(f => {
                  const m = montant(f);
                  return <li><span>{f.libelle}{f.quantite ? ` · ${f.quantite}${f.unite ? ` ${f.unite}` : ''}` : ''}</span><span class="petit-texte">{ligne(d, 'Costumes', f.costume_id)?.nom}</span>{m !== null && <span class="montant">{euros(m)}</span>}</li>;
                })}
              </ul>
              <p class="total-commande">
                {t.port > 0 && <span class="petit-texte">port {euros(t.port)} · </span>}
                <strong>{euros(t.total)}</strong>{t.sansPrix > 0 && <span class="petit-texte"> ({t.sansPrix} sans prix)</span>}
              </p>
              <div class="ligne-actions">
                {!recue && <button class="bouton principal" onClick={() => faire(changerStatutCommande(d, c.id, 'reçue', jour.value), 'Commande reçue')}>Confirmer la réception</button>}
                {recue && <Puce ton="vert">reçue</Puce>}
              </div>
            </article>
          );
        })}
      </div>
      {ouverte && <EditeurCommande id={ouverte} onFermer={() => setOuverte(null)} />}
    </section>
  );
}

function EditeurCommande({ id, onFermer }: { id: string; onFermer: () => void }) {
  const d = donnees.value;
  const c = d.Commandes[id];
  const m = (champs: Record<string, string>) => faire([{ table: 'Commandes', id, champs }]);
  return (
    <Feuille titre="Commande" onFermer={onFermer} pied={<button class="bouton principal" onClick={onFermer}>Terminé</button>}>
      <Champ label="Fournisseur">
        <Selection label="Fournisseur" valeur={c.fournisseur_id ?? ''} options={[['', '—'], ...tous(d, 'Fournisseurs').map(f => [f.id, f.nom] as [string, string])]} onChange={v => m({ fournisseur_id: v })} />
      </Champ>
      <Champ label="Statut"><Selection label="Statut" valeur={c.statut === 'reçue' ? 'reçue' : 'passée'} options={STATUTS_COMMANDE} onChange={v => faire(changerStatutCommande(d, id, v, jour.value))} /></Champ>
      <Champ label="Frais de port (€)"><Texte type="number" valeur={c.frais_port ?? ''} onValider={v => m({ frais_port: v })} /></Champ>
      <Champ label="Notes"><Texte multiligne valeur={c.notes ?? ''} onValider={v => m({ notes: v })} /></Champ>
    </Feuille>
  );
}

const NOM_PROVISOIRE = 'Nouveau fournisseur';

function Fournisseurs() {
  const d = donnees.value;
  const [ouvert, setOuvert] = useState<string | null>(null);
  const liste = tous(d, 'Fournisseurs').sort((a, b) => a.nom.localeCompare(b.nom));
  const nbArticles = (id: string) => tous(d, 'Fournitures').filter(f => f.fournisseur_id === id && (f.statut || 'à acheter') === 'à acheter').length;
  return (
    <section class="contenu-onglet">
      <div class="barre-outils">
        <button class="bouton principal" onClick={() => { const id = nouvelId(); faire([{ table: 'Fournisseurs', id, champs: { nom: NOM_PROVISOIRE } }]); setOuvert(id); }}><Icone nom="plus" />Fournisseur</button>
      </div>
      {!liste.length && <Vide icone="boite" titre="Aucun fournisseur"><p>Ajoute ici tes fournisseurs habituels.</p></Vide>}
      <ul class="liste-simple fournisseurs">
        {liste.map(f => (
          <li>
            <button class="lien-bouton" onClick={() => setOuvert(f.id)}><strong>{f.nom}</strong></button>
            {f.type && <Puce ton="gris">{f.type}</Puce>}
            {nbArticles(f.id) > 0 && <span class="petit-texte">{nbArticles(f.id)} à acheter</span>}
            {f.url && <a class="bouton-icone petit" href={f.url} target="_blank" rel="noopener noreferrer" aria-label={`Site de ${f.nom}`}><Icone nom="lien" taille={16} /></a>}
          </li>
        ))}
      </ul>
      {ouvert && d.Fournisseurs[ouvert] && <EditeurFournisseur id={ouvert} onFermer={() => {
        // Fermé sans lui donner de nom : la fiche vide n'est pas gardée.
        const f = donnees.value.Fournisseurs[ouvert];
        if (f && f.nom === NOM_PROVISOIRE && !f.url && !f.type && !f.notes && !tous(donnees.value, 'Fournitures').some(x => x.fournisseur_id === f.id)) faire([purger('Fournisseurs', f)]);
        setOuvert(null);
      }} />}
    </section>
  );
}

function EditeurFournisseur({ id, onFermer }: { id: string; onFermer: () => void }) {
  const f = donnees.value.Fournisseurs[id];
  const m = (champs: Record<string, string>) => faire([{ table: 'Fournisseurs', id, champs }]);
  return (
    <Feuille titre="Fournisseur" onFermer={onFermer} pied={<>
      <button class="bouton danger" onClick={() => { faire(supprimer('Fournisseurs', id), `« ${f.nom} » supprimé`); onFermer(); }}>Supprimer</button>
      <button class="bouton principal" onClick={onFermer}>Terminé</button>
    </>}>
      <Champ label="Nom"><Texte valeur={f.nom} autoFocus={f.nom === NOM_PROVISOIRE} onValider={v => v && m({ nom: v })} /></Champ>
      <Champ label="Site"><Texte type="url" valeur={f.url ?? ''} placeholder="https://…" onValider={v => m({ url: v })} /></Champ>
      <Champ label="Type"><Texte valeur={f.type ?? ''} onValider={v => m({ type: v })} /></Champ>
      <Champ label="Notes"><Texte multiligne valeur={f.notes ?? ''} onValider={v => m({ notes: v })} /></Champ>
    </Feuille>
  );
}
