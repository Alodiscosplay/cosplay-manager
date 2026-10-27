import { useEffect, useState } from 'preact/hooks';
import { donnees, jour, faire } from '../store/store';
import { costumes, tous, ligne } from '../logique/acces';
import { regrouperAchats, SANS_FOURNISSEUR, type GroupementAchats, regrouperParNom, lignesCommande, totalCommande, euros, montant, HORS_COSTUME, nomDestination, repartirDouane, repartirReduction, lireJson, lireErreurs } from '../logique/budget';
import { jourCourt } from '../logique/dates';
import { STATUTS_FOURNITURE, STATUTS_COMMANDE, liste, txtListe, num, type Ligne } from '../modele/schema';
import { creerCommandes, changerStatutCommande, annulerCommande, receptionPartielle, rembourserErreur, supprimer, purger, nouvelId, type FraisCommande, type ChoixReception } from '../store/operations';
import { GroupeFourniture, EditeurFourniture } from '../composants/Fournitures';
import { Feuille, Champ, Texte, Selection, Puce, Vide, Menu, ChoixDate, Confirmer } from '../composants/base';
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
  const commander = (frais: Record<string, FraisCommande>) => {
    const ch = creerCommandes(d, [...selection], jour.value, frais);
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
        <Selection label="Costume" valeur={costume} options={[['', 'Tous les costumes'], ...costumes(d).filter(c => c.statut !== 'archivé').map(c => [c.id, c.nom] as [string, string]), ['__stock', HORS_COSTUME.stock], ['__divers', HORS_COSTUME.divers]]} onChange={setCostume} />
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
        const nomGroupe = par === 'costume' ? g.costume?.nom ?? (g.hors ? HORS_COSTUME[g.hors] : 'Sans costume') : g.fournisseur?.nom ?? 'Sans fournisseur';
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
 * Avant de créer : la date et les frais de chaque commande (une par fournisseur) — port et taxe / douane,
 * partagés entre ses fournitures, et un bon de réduction (en € ou en %). Les mêmes options qu'après
 * coup : la taxe / douane attribuée à des articles, le bon réservé à certains. Le tout compte dans le
 * budget de leurs costumes.
 */
function NouvelleCommande({ ids, onCreer, onFermer }: { ids: string[]; onCreer: (frais: Record<string, FraisCommande>) => void; onFermer: () => void }) {
  const d = donnees.value;
  const parFournisseur = new Map<string, Ligne[]>();
  for (const id of ids) {
    const f = ligne(d, 'Fournitures', id);
    if (f) parFournisseur.set(f.fournisseur_id || '', [...(parFournisseur.get(f.fournisseur_id || '') ?? []), f]);
  }
  const [frais, setFrais] = useState<Record<string, FraisCommande>>({});
  const poser = (fid: string, x: Partial<FraisCommande>) => setFrais(avant => ({ ...avant, [fid]: { ...avant[fid], ...x } }));
  const plusieurs = parFournisseur.size > 1;
  return (
    <Feuille titre={plusieurs ? `Nouvelles commandes (${parFournisseur.size})` : 'Nouvelle commande'} onFermer={onFermer} pied={<>
      <button class="bouton" onClick={onFermer}>Annuler</button>
      <button class="bouton principal" onClick={() => onCreer(frais)}>{plusieurs ? 'Créer les commandes' : 'Créer la commande'}</button>
    </>}>
      {plusieurs && <p class="petit-texte">Une commande par fournisseur.</p>}
      {[...parFournisseur].sort(([a], [b]) => !a ? 1 : !b ? -1 : (ligne(d, 'Fournisseurs', a)?.nom ?? '').localeCompare(ligne(d, 'Fournisseurs', b)?.nom ?? '')).map(([fid, lignes]) => {
        const nom = ligne(d, 'Fournisseurs', fid)?.nom ?? 'Sans fournisseur';
        const articles = lignes.reduce((s, f) => s + (montant(f) ?? 0), 0);
        const fr = frais[fid] ?? {};
        return (
          <div class="nouvelle-commande">
            <p><strong>{nom}</strong> · {lignes.length} fourniture{lignes.length > 1 ? 's' : ''}{articles > 0 ? ` · ${euros(articles)}` : ''}</p>
            <Champ label="Date de la commande">
              <ChoixDate label={`date de la commande ${nom}`} valeur={fr.date || jour.value} onChange={x => poser(fid, { date: x || jour.value })} />
            </Champ>
            <div class="trois-colonnes">
              <Champ label="Frais de port (€)">
                <input type="number" inputMode="decimal" min="0" step="0.01" value={fr.port ?? ''} aria-label={`Frais de port ${nom}`}
                  onInput={e => poser(fid, { port: (e.target as HTMLInputElement).value })} />
              </Champ>
              <Champ label="Taxe / douane (€)">
                <input type="number" inputMode="decimal" min="0" step="0.01" value={fr.douane ?? ''} aria-label={`Taxe / douane ${nom}`}
                  onInput={e => poser(fid, { douane: (e.target as HTMLInputElement).value })} />
              </Champ>
              <Champ label="Bon de réduction">
                <ChampReduction label={`Bon de réduction ${nom}`} valeur={fr.reduction ?? ''} onChange={v => poser(fid, { reduction: v })} />
              </Champ>
            </div>
            <OptionsFrais lignes={lignes} douane={fr.douane ?? ''} repDouane={fr.douane_repartition ?? {}} reduction={fr.reduction ?? ''}
              articlesBon={fr.reduction_articles ?? []}
              onDouane={rep => poser(fid, { douane_repartition: rep })} onArticlesBon={a => poser(fid, { reduction_articles: a })} />
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
  const [annulee, setAnnulee] = useState<string | null>(null);
  const [probleme, setProbleme] = useState<string | null>(null); // réception partielle ou problème signalé
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
          const nomsCostumes = [...new Set(lignes.map(f => nomDestination(d, f)).filter(Boolean))];
          const recue = c.statut === 'reçue';
          const idx = recue ? 1 : 0; // une ancienne commande « à passer » se lit comme passée
          return (
            <article class="carte-commande">
              <header>
                <h3>{four?.nom ?? 'Sans fournisseur'}</h3>
                <Menu label="Actions de la commande" actions={[
                  { texte: 'Modifier', icone: 'crayon', faire: () => setOuverte(c.id) },
                  recue && { texte: 'Signaler un problème', icone: 'alerte', faire: () => setProbleme(c.id) },
                  { texte: 'Annuler la commande', icone: 'poubelle', danger: true, faire: () => setAnnulee(c.id) },
                ]} />
              </header>
              <ol class="etapes-statut" aria-label="Statut">
                {STATUTS_COMMANDE.map((s, i) => <li class={i <= idx ? 'atteint' : ''}>{s}</li>)}
              </ol>
              <p class="petit-texte">{c.date ? jourCourt(c.date) : ''}{nomsCostumes.length ? ` · ${nomsCostumes.join(', ')}` : ''}</p>
              <ul class="lignes-commande">
                {lignes.map(f => {
                  const m = montant(f);
                  return <li><span>{f.libelle}{f.quantite ? ` · ${f.quantite}${f.unite ? ` ${f.unite}` : ''}` : ''}</span><span class="petit-texte">{nomDestination(d, f)}</span>{m !== null && <span class="montant">{euros(m)}</span>}</li>;
                })}
              </ul>
              {lireErreurs(c).length > 0 && (
                <ul class="erreurs-commande">
                  {lireErreurs(c).map(e => (
                    <li><Icone nom="alerte" taille={14} /><span>{e.libelle} · {e.type}{e.detail ? ` (${e.detail})` : ''}{e.montant > 0 ? ` · ${euros(e.montant)}${e.rembourse ? ' remboursé' : ''}` : ''}</span></li>
                  ))}
                </ul>
              )}
              <p class="total-commande">
                {t.port > 0 && <span class="petit-texte">port {euros(t.port)} · </span>}
                {t.douane > 0 && <span class="petit-texte">taxe / douane {euros(t.douane)} · </span>}
                {t.reduction > 0 && <span class="petit-texte">bon −{euros(t.reduction)} · </span>}
                {t.erreurs > 0 && <span class="petit-texte">erreurs {euros(t.erreurs)} · </span>}
                <strong>{euros(t.total)}</strong>{t.sansPrix > 0 && <span class="petit-texte"> ({t.sansPrix} sans prix)</span>}
              </p>
              <div class="ligne-actions">
                {!recue && <button class="bouton principal" onClick={() => faire(changerStatutCommande(d, c.id, 'reçue', jour.value), 'Commande reçue')}>Confirmer la réception</button>}
                {!recue && <button class="bouton" onClick={() => setProbleme(c.id)}>Réception partielle / problème</button>}
                {recue && <Puce ton="vert">reçue</Puce>}
                {!recue && lignes.some(f => f.statut === 'reçu') && <Puce ton="orange">en partie reçue</Puce>}
              </div>
            </article>
          );
        })}
      </div>
      {ouverte && <EditeurCommande id={ouverte} onFermer={() => setOuverte(null)} />}
      {probleme && d.Commandes[probleme] && <FeuilleReception commandeId={probleme} onFermer={() => setProbleme(null)} />}
      {annulee && d.Commandes[annulee] && (() => {
        const n = lignesCommande(d, annulee).length;
        const nom = ligne(d, 'Fournisseurs', d.Commandes[annulee].fournisseur_id)?.nom;
        return (
          <Confirmer titre={`Annuler la commande${nom ? ` ${nom}` : ''} ?`} bouton="Annuler la commande" boutonNon="Garder la commande" danger onNon={() => setAnnulee(null)}
            onOui={() => { faire(annulerCommande(donnees.value, annulee), 'Commande annulée'); setAnnulee(null); }}
            texte={<>
              <p>{n > 1 ? `Ses ${n} fournitures retrouvent` : n === 1 ? 'Sa fourniture retrouve' : 'Ses fournitures retrouvent'} l'état d'avant la commande (« à acheter » en général) et reviennent dans la liste de courses.</p>
              <p>La commande disparaît, avec ses frais de port, sa taxe / douane et son bon de réduction. Le bouton « Annuler », juste après, permet de revenir en arrière.</p>
            </>} />
        );
      })()}
    </section>
  );
}

function EditeurCommande({ id, onFermer }: { id: string; onFermer: () => void }) {
  const d = donnees.value;
  const c = d.Commandes[id];
  const lignes = lignesCommande(d, id);
  const m = (champs: Record<string, string>) => faire([{ table: 'Commandes', id, champs }]);
  return (
    <Feuille titre="Commande" onFermer={onFermer} pied={<button class="bouton principal" onClick={onFermer}>Terminé</button>}>
      <Champ label="Fournisseur">
        <Selection label="Fournisseur" valeur={c.fournisseur_id ?? ''} options={[['', '—'], ...tous(d, 'Fournisseurs').map(f => [f.id, f.nom] as [string, string])]} onChange={v => m({ fournisseur_id: v })} />
      </Champ>
      <div class="deux-colonnes">
        <Champ label="Date de la commande"><ChoixDate label="date de la commande" valeur={c.date ?? ''} onChange={v => v && m({ date: v })} /></Champ>
        <Champ label="Statut"><Selection label="Statut" valeur={c.statut === 'reçue' ? 'reçue' : 'passée'} options={STATUTS_COMMANDE} onChange={v => faire(changerStatutCommande(d, id, v, jour.value))} /></Champ>
      </div>
      <div class="trois-colonnes">
        <Champ label="Frais de port (€)"><Texte type="number" valeur={c.frais_port ?? ''} onValider={v => m({ frais_port: v })} /></Champ>
        <Champ label="Taxe / douane (€)"><Texte type="number" valeur={c.frais_douane ?? ''} onValider={v => m({ frais_douane: v })} /></Champ>
        <Champ label="Bon de réduction"><ChampReduction label="Bon de réduction" valeur={c.reduction ?? ''} onChange={v => m({ reduction: v })} /></Champ>
      </div>
      <OptionsFrais lignes={lignes} douane={c.frais_douane ?? ''} repDouane={lireJson(c.douane_repartition)} reduction={c.reduction ?? ''}
        articlesBon={liste(c.reduction_articles)}
        onDouane={rep => m({ douane_repartition: Object.keys(rep).length ? JSON.stringify(rep) : '' })}
        onArticlesBon={a => m({ reduction_articles: a.length && a.length < lignes.length ? txtListe(a) : '' })} />
      {lireErreurs(c).length > 0 && (
        <div class="sous-reglage">
          <h3 class="groupe-titre">Problèmes signalés</h3>
          {lireErreurs(c).map(e => (
            <div class="ligne-attribution">
              <span>{e.libelle} · {e.type}<span class="petit-texte">{e.detail ? ` · ${e.detail}` : ''}{e.montant > 0 ? ` · ${euros(e.montant)}` : ''}</span></span>
              {e.montant > 0 && (
                <label class="case-ligne">
                  <input type="checkbox" checked={e.rembourse} onChange={x => faire(rembourserErreur(d, id, e.id, (x.target as HTMLInputElement).checked))} />
                  <span>remboursé</span>
                </label>
              )}
            </div>
          ))}
        </div>
      )}
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
      <button class="bouton danger" onClick={() => { faire(supprimer(donnees.value, 'Fournisseurs', id), `« ${f.nom} » supprimé`); onFermer(); }}>Supprimer</button>
      <button class="bouton principal" onClick={onFermer}>Terminé</button>
    </>}>
      <Champ label="Nom"><Texte valeur={f.nom} autoFocus={f.nom === NOM_PROVISOIRE} onValider={v => v && m({ nom: v })} /></Champ>
      <Champ label="Site"><Texte type="url" valeur={f.url ?? ''} placeholder="https://…" onValider={v => m({ url: v })} /></Champ>
      <Champ label="Type"><Texte valeur={f.type ?? ''} onValider={v => m({ type: v })} /></Champ>
      <Champ label="Notes"><Texte multiligne valeur={f.notes ?? ''} onValider={v => m({ notes: v })} /></Champ>
    </Feuille>
  );
}

/**
 * Un bon de réduction : un nombre, et le choix € ou % à côté. Il s'enregistre « 5 » (euros) ou
 * « 10 % » ; taper « % » dans la case passe aussi en pourcentage.
 */
function ChampReduction({ valeur, onChange, label }: { valeur: string; onChange: (v: string) => void; label: string }) {
  const pct = valeur.trim().endsWith('%');
  const nombre = valeur.replace('%', '').trim();
  const [texte, setTexte] = useState(nombre);
  const [enPct, setEnPct] = useState(pct);
  useEffect(() => { setTexte(nombre); setEnPct(pct); }, [valeur]);
  const valider = (t: string, p: boolean) => {
    const n = t.replace('%', '').trim();
    const v = n ? (p ? `${n} %` : n) : '';
    if (v !== valeur) onChange(v);
  };
  return (
    <div class="champ-reduction">
      <input inputMode="decimal" value={texte} placeholder="—" aria-label={label}
        onInput={e => {
          const t = (e.target as HTMLInputElement).value;
          setTexte(t.replace('%', ''));
          if (t.includes('%')) { setEnPct(true); valider(t, true); }
        }}
        onChange={e => valider((e.target as HTMLInputElement).value, enPct)} />
      <div class="segments petits" role="group" aria-label="Unité du bon">
        <button type="button" class={enPct ? '' : 'actif'} aria-pressed={!enPct} onClick={() => { setEnPct(false); valider(texte, false); }}>€</button>
        <button type="button" class={enPct ? 'actif' : ''} aria-pressed={enPct} onClick={() => { setEnPct(true); valider(texte, true); }}>%</button>
      </div>
    </div>
  );
}

/**
 * Les options d'une commande, à la création comme après : attribuer la taxe / douane à des articles, et
 * réserver le bon à certains. Avec un seul article, il n'y a rien à répartir : tout lui revient.
 */
function OptionsFrais({ lignes, douane, repDouane, reduction, articlesBon, onDouane, onArticlesBon }: {
  lignes: Ligne[]; douane: string; repDouane: Record<string, string>; reduction: string; articlesBon: string[];
  onDouane: (rep: Record<string, string>) => void; onArticlesBon: (ids: string[]) => void;
}) {
  const d = donnees.value;
  const totalDouane = num(douane);
  const aBon = reduction.trim() !== '';
  if (!totalDouane && !aBon) return null;
  if (lignes.length < 2) return <p class="petit-texte">Un seul article : la taxe / douane et le bon lui reviennent en entier.</p>;
  const ids = lignes.map(l => l.id);
  const parts = repartirDouane(totalDouane, ids, repDouane);
  const bon = repartirReduction(reduction, lignes, articlesBon);
  const coches = articlesBon.filter(x => ids.includes(x)).length ? articlesBon.filter(x => ids.includes(x)) : ids;
  const poserDouane = (fid: string, v: string) => {
    const n = { ...repDouane };
    if (v.trim()) n[fid] = v.trim(); else delete n[fid];
    onDouane(n);
  };
  const attribue = ids.filter(x => (repDouane[x] ?? '').trim()).reduce((s, x) => s + num(repDouane[x]), 0);
  const reste = Math.round((totalDouane - attribue) * 100) / 100;
  const vides = ids.filter(x => !(repDouane[x] ?? '').trim()).length;
  return (
    <>
      {totalDouane > 0 && (
        <details class="options-avancees" open={Object.keys(repDouane).length > 0}>
          <summary>Attribuer la taxe / douane à des articles</summary>
          <p class="petit-texte">Laisse vide : l'article reçoit une part égale de ce qui n'est pas attribué.</p>
          {lignes.map(f => (
            <div class="ligne-attribution">
              <span>{f.libelle}<span class="petit-texte"> · {nomDestination(d, f)}</span></span>
              <input inputMode="decimal" value={repDouane[f.id] ?? ''} placeholder={euros(parts[f.id] ?? 0)} aria-label={`Taxe / douane pour ${f.libelle}`}
                onChange={e => poserDouane(f.id, (e.target as HTMLInputElement).value)} />
            </div>
          ))}
          {reste < 0 ? <p class="petit-texte en-retard">Attribué en trop : {euros(-reste)}</p>
            : !reste ? <p class="petit-texte">Tout est attribué.</p>
            : vides ? <p class="petit-texte">{euros(reste)} {vides > 1 ? 'partagés entre les articles laissés vides' : 'attribués à l’article laissé vide'}.</p>
            : <p class="petit-texte en-retard">{euros(reste)} ne sont attribués à aucun article.</p>}
        </details>
      )}
      {aBon && (
        <details class="options-avancees" open={coches.length < ids.length}>
          <summary>Réserver le bon à certains articles</summary>
          {lignes.map(f => (
            <label class="case-ligne">
              <input type="checkbox" checked={coches.includes(f.id)}
                onChange={e => onArticlesBon((e.target as HTMLInputElement).checked ? [...coches, f.id] : coches.filter(x => x !== f.id))} />
              <span>{f.libelle}<span class="petit-texte">{montant(f) !== null ? ` · ${euros(montant(f)!)}` : ''}{(bon[f.id] ?? 0) > 0 ? ` · bon −${euros(bon[f.id])}` : ''}</span></span>
            </label>
          ))}
        </details>
      )}
    </>
  );
}

type EtatReception = 'recu' | 'manquant' | 'pas-le-bon' | 'quantite';
interface SaisieReception { etat: EtatReception; suite: 'plus-tard' | 'racheter'; rembourse: boolean; recue: string }

/**
 * Réception partielle, ou problème signalé après coup : pour chaque article, reçu, manquant (il arrivera
 * plus tard, ou il est à racheter), pas le bon article, ou une autre quantité. Ce qui a été payé pour rien
 * reste au budget du costume, rangé dans les erreurs de commande, sauf s'il est remboursé.
 */
function FeuilleReception({ commandeId, onFermer }: { commandeId: string; onFermer: () => void }) {
  const d = donnees.value;
  const c = d.Commandes[commandeId];
  const recue = c.statut === 'reçue';
  // Après réception, seuls les articles reçus peuvent poser problème ; avant, tous ceux de la commande.
  const lignes = lignesCommande(d, commandeId).filter(f => !recue || f.statut === 'reçu');
  const [saisies, setSaisies] = useState<Record<string, SaisieReception>>(() =>
    Object.fromEntries(lignes.map(f => [f.id, { etat: 'recu', suite: 'plus-tard', rembourse: false, recue: '' } as SaisieReception])));
  const poser = (fid: string, x: Partial<SaisieReception>) => setSaisies(avant => ({ ...avant, [fid]: { ...avant[fid], ...x } }));
  const valider = () => {
    const choix: Record<string, ChoixReception> = {};
    for (const [fid, s] of Object.entries(saisies)) {
      if (s.etat === 'manquant') choix[fid] = { etat: 'manquant', suite: s.suite, rembourse: s.rembourse };
      else if (s.etat === 'pas-le-bon') choix[fid] = { etat: 'pas-le-bon', rembourse: s.rembourse };
      else if (s.etat === 'quantite' && s.recue.trim()) choix[fid] = { etat: 'quantite', recue: s.recue, suite: s.suite, rembourse: s.rembourse };
    }
    faire(receptionPartielle(donnees.value, commandeId, choix, jour.value), recue ? 'Problème signalé' : 'Réception enregistrée');
    onFermer();
  };
  const four = ligne(d, 'Fournisseurs', c.fournisseur_id)?.nom;
  return (
    <Feuille titre={recue ? 'Signaler un problème' : 'Réception partielle / problème'} onFermer={onFermer} pied={<>
      <button class="bouton" onClick={onFermer}>Annuler</button>
      <button class="bouton principal" onClick={valider}>Valider</button>
    </>}>
      <p class="petit-texte">{four ? `Commande ${four}` : 'Commande'}{c.date ? ` du ${jourCourt(c.date)}` : ''}. Indique ce qui ne va pas ; le reste est reçu.</p>
      {lignes.map(f => {
        const s = saisies[f.id];
        const qte = [f.quantite, f.unite].filter(Boolean).join(' ');
        const manque = s.etat === 'quantite' && s.recue.trim() !== '' && Number(s.recue.replace(',', '.')) < Number((f.quantite || '1').replace(',', '.'));
        return (
          <div class="article-reception">
            <p><strong>{f.libelle}</strong><span class="petit-texte">{qte ? ` · ${qte}` : ''} · {nomDestination(d, f)}</span></p>
            <Selection label={`État de ${f.libelle}`} valeur={s.etat} onChange={v => poser(f.id, { etat: v as EtatReception })}
              options={[['recu', 'Reçu'], ['manquant', 'Manquant'], ['pas-le-bon', 'Pas le bon article'], ['quantite', 'Quantité différente']]} />
            {s.etat === 'quantite' && (
              <Champ label={`Quantité reçue${f.unite ? ` (${f.unite})` : ''}`}>
                <input inputMode="decimal" value={s.recue} placeholder={f.quantite || '1'} aria-label={`Quantité reçue de ${f.libelle}`}
                  onInput={e => poser(f.id, { recue: (e.target as HTMLInputElement).value })} />
              </Champ>
            )}
            {(s.etat === 'manquant' || manque) && (
              <div class="choix-segments colonne">
                <label><input type="radio" name={`suite-${f.id}`} checked={s.suite === 'plus-tard'} onChange={() => poser(f.id, { suite: 'plus-tard' })} />
                  <span><strong>Arrivera plus tard</strong> — {s.etat === 'manquant' ? 'il reste commandé' : 'le manque reste commandé'}</span></label>
                <label><input type="radio" name={`suite-${f.id}`} checked={s.suite === 'racheter'} onChange={() => poser(f.id, { suite: 'racheter' })} />
                  <span><strong>À racheter</strong> — {s.etat === 'manquant' ? 'il revient' : 'le manque revient'} dans la liste de courses</span></label>
              </div>
            )}
            {(s.etat === 'pas-le-bon' || ((s.etat === 'manquant' || manque) && s.suite === 'racheter')) && (
              <label class="case-ligne">
                <input type="checkbox" checked={s.rembourse} onChange={e => poser(f.id, { rembourse: (e.target as HTMLInputElement).checked })} />
                <span>Remboursé <span class="petit-texte">— sinon, ce qui a été payé reste au budget du costume, dans les erreurs de commande</span></span>
              </label>
            )}
            {s.etat === 'pas-le-bon' && <p class="petit-texte">L'article attendu revient dans la liste de courses, pour le racheter ou l'échanger.</p>}
          </div>
        );
      })}
    </Feuille>
  );
}

