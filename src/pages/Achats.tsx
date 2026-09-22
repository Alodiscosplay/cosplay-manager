import { useState } from 'preact/hooks';
import { donnees, jour, faire } from '../store/store';
import { costumes, tous, ligne } from '../logique/acces';
import { regrouperAchats, lignesCommande, totalCommande, euros, montant } from '../logique/budget';
import { jourCourt } from '../logique/dates';
import { STATUTS_FOURNITURE, STATUTS_COMMANDE, num, type Ligne } from '../modele/schema';
import { creerCommandes, changerStatutCommande, supprimer, retirerDeCommande, nouvelId } from '../store/operations';
import { LigneFourniture, EditeurFourniture } from '../composants/Fournitures';
import { Feuille, Champ, Texte, Selection, Puce, Vide, Menu } from '../composants/base';
import { Icone } from '../composants/Icone';
import { IndicateurSync } from '../app';

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
  const [statut, setStatut] = useState('à acheter');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [ouvert, setOuvert] = useState<string | 'nouveau' | null>(null);
  const groupes = regrouperAchats(d, { costumeId: costume || undefined, statuts: statut ? [statut] : undefined });
  const nb = groupes.reduce((s, g) => s + g.lignes.length, 0);
  const choisir = (id: string, v: boolean) => { const s = new Set(selection); if (v) s.add(id); else s.delete(id); setSelection(s); };
  const selectionnables = (g: Ligne[]) => g.filter(f => !f.commande_id || !ligne(d, 'Commandes', f.commande_id));

  const commander = () => {
    const ch = creerCommandes(d, [...selection], jour.value);
    const n = ch.filter(c => c.table === 'Commandes').length;
    faire(ch, `${n} commande${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}`);
    setSelection(new Set());
    location.hash = '#/achats/commandes';
  };

  return (
    <section>
      <div class="barre-outils">
        <button class="bouton principal" onClick={() => setOuvert('nouveau')}><Icone nom="plus" />Fourniture</button>
        <Selection label="Costume" valeur={costume} options={[['', 'Tous les costumes'], ...costumes(d).filter(c => c.statut !== 'archivé').map(c => [c.id, c.nom] as [string, string])]} onChange={setCostume} />
        <Selection label="Statut" valeur={statut} options={[['', 'Tous les statuts'], ...STATUTS_FOURNITURE.map(s => [s, s] as [string, string])]} onChange={setStatut} />
      </div>
      {selection.size > 0 && (
        <div class="barre-selection" role="region" aria-label="Sélection">
          <span>{selection.size} sélectionnée{selection.size > 1 ? 's' : ''}</span>
          <button class="bouton principal" onClick={commander}><Icone nom="boite" />Créer la commande</button>
          <button class="bouton" onClick={() => setSelection(new Set())}>Tout désélectionner</button>
          <span class="petit-texte">Une commande par fournisseur ; elle peut mêler plusieurs costumes.</span>
        </div>
      )}
      {!nb && <Vide icone="achats" titre={statut === 'à acheter' ? 'Rien à acheter' : 'Aucune fourniture'}><p>Ajoute des fournitures ici ou depuis l'onglet Fournitures d'un costume.</p></Vide>}
      {groupes.map(g => {
        const libres = selectionnables(g.lignes);
        const tout = libres.length > 0 && libres.every(f => selection.has(f.id));
        return (
          <div class="groupe">
            <h2 class="groupe-titre">
              {libres.length > 0 && (
                <input type="checkbox" class="selection" checked={tout} aria-label={`Tout sélectionner chez ${g.fournisseur?.nom ?? 'sans fournisseur'}`}
                  onChange={e => { const s = new Set(selection); for (const f of libres) { if ((e.target as HTMLInputElement).checked) s.add(f.id); else s.delete(f.id); } setSelection(s); }} />
              )}
              {g.fournisseur ? g.fournisseur.nom : 'Sans fournisseur'}
              {g.fournisseur?.url && <a class="bouton-icone petit" href={g.fournisseur.url} target="_blank" rel="noopener noreferrer" aria-label={`Site de ${g.fournisseur.nom}`}><Icone nom="lien" taille={16} /></a>}
              {g.total > 0 && <span class="compteur">{euros(g.total)}</span>}
              {g.fournisseur?.franco && g.total > 0 && num(g.fournisseur.franco) > g.total && <span class="petit-texte">franco à {euros(num(g.fournisseur.franco))}</span>}
            </h2>
            <ul class="liste-fournitures">
              {g.lignes.map(f => {
                const enCommande = !!f.commande_id && !!ligne(d, 'Commandes', f.commande_id);
                return <LigneFourniture f={f} afficherCostume={!costume} selectionnee={selection.has(f.id)}
                  onSelection={enCommande ? undefined : v => choisir(f.id, v)} onOuvrir={() => setOuvert(f.id)} />;
              })}
            </ul>
          </div>
        );
      })}
      {ouvert && <EditeurFourniture id={ouvert === 'nouveau' ? undefined : ouvert} costumeId={costume || undefined} onFermer={() => setOuvert(null)} />}
    </section>
  );
}

function Commandes() {
  const d = donnees.value;
  const [voirRecues, setVoirRecues] = useState(false);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const toutes = tous(d, 'Commandes').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const liste = toutes.filter(c => voirRecues || c.statut !== 'reçue');
  return (
    <section>
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
          const idx = STATUTS_COMMANDE.indexOf(c.statut as typeof STATUTS_COMMANDE[number]);
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
                {c.statut === 'à passer' && <button class="bouton principal" onClick={() => faire(changerStatutCommande(d, c.id, 'passée', jour.value), 'Commande passée')}>Marquer passée</button>}
                {c.statut === 'passée' && <button class="bouton principal" onClick={() => faire(changerStatutCommande(d, c.id, 'reçue', jour.value), 'Commande reçue')}>Marquer reçue</button>}
                {c.statut === 'reçue' && <Puce ton="vert">reçue</Puce>}
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
      <Champ label="Statut"><Selection label="Statut" valeur={c.statut} options={STATUTS_COMMANDE} onChange={v => faire(changerStatutCommande(d, id, v, jour.value))} /></Champ>
      <Champ label="Frais de port (€)"><Texte type="number" valeur={c.frais_port ?? ''} onValider={v => m({ frais_port: v })} /></Champ>
      <Champ label="Notes"><Texte multiligne valeur={c.notes ?? ''} placeholder="n° de commande, suivi colis…" onValider={v => m({ notes: v })} /></Champ>
    </Feuille>
  );
}

function Fournisseurs() {
  const d = donnees.value;
  const [ouvert, setOuvert] = useState<string | null>(null);
  const liste = tous(d, 'Fournisseurs').sort((a, b) => a.nom.localeCompare(b.nom));
  const nbArticles = (id: string) => tous(d, 'Fournitures').filter(f => f.fournisseur_id === id && (f.statut || 'à acheter') === 'à acheter').length;
  return (
    <section>
      <div class="barre-outils">
        <button class="bouton principal" onClick={() => { const id = nouvelId(); faire([{ table: 'Fournisseurs', id, champs: { nom: 'Nouveau fournisseur' } }]); setOuvert(id); }}><Icone nom="plus" />Fournisseur</button>
      </div>
      {!liste.length && <Vide icone="boite" titre="Aucun fournisseur"><p>Tes fournisseurs habituels : merceries, magasins de tissus, boutiques en ligne…</p></Vide>}
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
      {ouvert && d.Fournisseurs[ouvert] && <EditeurFournisseur id={ouvert} onFermer={() => setOuvert(null)} />}
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
      <Champ label="Nom"><Texte valeur={f.nom} autoFocus={f.nom === 'Nouveau fournisseur'} onValider={v => v && m({ nom: v })} /></Champ>
      <Champ label="Site"><Texte type="url" valeur={f.url ?? ''} placeholder="https://…" onValider={v => m({ url: v })} /></Champ>
      <Champ label="Type"><Texte valeur={f.type ?? ''} placeholder="tissus, mercerie, perruques…" onValider={v => m({ type: v })} /></Champ>
      <div class="deux-colonnes">
        <Champ label="Frais de port habituels (€)"><Texte type="number" valeur={f.frais_port ?? ''} onValider={v => m({ frais_port: v })} /></Champ>
        <Champ label="Franco de port à (€)"><Texte type="number" valeur={f.franco ?? ''} onValider={v => m({ franco: v })} /></Champ>
      </div>
      <Champ label="Notes"><Texte multiligne valeur={f.notes ?? ''} onValider={v => m({ notes: v })} /></Champ>
    </Feuille>
  );
}
