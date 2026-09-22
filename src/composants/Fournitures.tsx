// Fournitures : une ligne de la liste de courses, un groupe de lignes de même nom, et l'éditeur.
// Partagé entre la page Achats et l'onglet Fournitures d'un costume.
import { useState } from 'preact/hooks';
import { donnees, faire } from '../store/store';
import { costumes, piecesDe, piecesDeFourniture, tous, ligne } from '../logique/acces';
import { montant, euros, texteQuantites, cleNom, type GroupeNom } from '../logique/budget';
import { STATUTS_FOURNITURE, liste, type Ligne } from '../modele/schema';
import { nouvelId, supprimer, retirerDeCommande } from '../store/operations';
import { Feuille, Champ, Selection, Puce } from './base';
import { Icone } from './Icone';

const TON_STATUT: Record<string, 'gris' | 'accent' | 'vert' | 'orange'> = { 'à acheter': 'orange', 'commandé': 'accent', 'reçu': 'vert', 'déjà là': 'gris' };

const enCommande = (d: typeof donnees.value, f: Ligne) => !!f.commande_id && !!ligne(d, 'Commandes', f.commande_id);

/**
 * Une fourniture. `detail` : affichée sous son groupe de même nom, la ligne a pour titre
 * « costume · pièce » (le nom est déjà dans l'en-tête du groupe).
 */
export function LigneFourniture({ f, afficherCostume, selectionnee, onSelection, onOuvrir, detail }: {
  f: Ligne; afficherCostume?: boolean; selectionnee?: boolean; onSelection?: (v: boolean) => void; onOuvrir: () => void; detail?: boolean;
}) {
  const d = donnees.value;
  const m = montant(f);
  const c = ligne(d, 'Costumes', f.costume_id);
  const pieces = piecesDeFourniture(d, f).map(p => p.nom).join(', ');
  const statut = f.statut || 'à acheter';
  const quantite = [f.quantite, f.unite].filter(Boolean).join(' ');
  const titre = detail ? [afficherCostume && c?.nom, pieces || 'Général'].filter(Boolean).join(' · ') : f.libelle;
  return (
    <li class={`fourniture statut-${statut.replace(/\s/g, '-')}${detail ? ' detail' : ''}`}>
      {onSelection && (
        <input type="checkbox" class="selection" checked={selectionnee} aria-label={`Sélectionner ${f.libelle}${detail ? ` (${titre})` : ''}`}
          onChange={e => onSelection((e.target as HTMLInputElement).checked)} />
      )}
      <button class="fourniture-texte" onClick={onOuvrir}>
        <span class="fourniture-libelle">{titre}</span>
        <span class="etape-meta">
          {quantite && <span>{quantite}</span>}
          {!detail && afficherCostume && c && <span class="costume-nom">{c.nom}</span>}
          {!detail && pieces && <span>{pieces}</span>}
          {enCommande(d, f) && <span><Icone nom="boite" taille={12} />en commande</span>}
        </span>
      </button>
      {m !== null && <span class="montant">{euros(m)}</span>}
      {f.lien && <a class="bouton-icone petit" href={f.lien} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir le lien de ${f.libelle}`}><Icone nom="lien" taille={16} /></a>}
      <Puce ton={TON_STATUT[statut] ?? 'gris'}>{statut}</Puce>
    </li>
  );
}

/**
 * Toutes les lignes qui portent le même nom : l'en-tête donne le total, le détail la quantité
 * par costume et par pièce. Une seule ligne : affichée telle quelle.
 */
export function GroupeFourniture({ g, afficherCostume, selection, onSelection, onOuvrir }: {
  g: GroupeNom; afficherCostume?: boolean; selection?: Set<string>; onSelection?: (ids: string[], v: boolean) => void; onOuvrir: (id: string) => void;
}) {
  const d = donnees.value;
  const selectionnables = g.lignes.filter(f => !enCommande(d, f));
  if (g.lignes.length === 1) {
    const f = g.lignes[0];
    return <LigneFourniture f={f} afficherCostume={afficherCostume} onOuvrir={() => onOuvrir(f.id)}
      selectionnee={selection?.has(f.id)} onSelection={onSelection && selectionnables.length ? v => onSelection([f.id], v) : undefined} />;
  }
  const statuts = [...new Set(g.lignes.map(f => f.statut || 'à acheter'))];
  const tout = selectionnables.length > 0 && selectionnables.every(f => selection?.has(f.id));
  return (
    <li class="groupe-nom">
      <div class="fourniture entete-groupe">
        {onSelection && selectionnables.length > 0 && (
          <input type="checkbox" class="selection" checked={tout} aria-label={`Sélectionner tout « ${g.libelle} »`}
            onChange={e => onSelection(selectionnables.map(f => f.id), (e.target as HTMLInputElement).checked)} />
        )}
        <div class="fourniture-texte">
          <span class="fourniture-libelle">{g.libelle}</span>
          <span class="etape-meta"><span class="total-quantite">Total : {texteQuantites(g.quantites)}</span><span>{g.lignes.length} besoins</span></span>
        </div>
        {g.montant > 0 && <span class="montant">{euros(g.montant)}</span>}
        {statuts.length === 1 ? <Puce ton={TON_STATUT[statuts[0]] ?? 'gris'}>{statuts[0]}</Puce> : <Puce ton="gris">mixte</Puce>}
      </div>
      <ul class="details-groupe">
        {g.lignes.map(f => (
          <LigneFourniture f={f} detail afficherCostume={afficherCostume} onOuvrir={() => onOuvrir(f.id)}
            selectionnee={selection?.has(f.id)} onSelection={onSelection && !enCommande(d, f) ? v => onSelection([f.id], v) : undefined} />
        ))}
      </ul>
    </li>
  );
}

export function EditeurFourniture({ id, costumeId, pieceId, onFermer }: { id?: string; costumeId?: string; pieceId?: string; onFermer: () => void }) {
  const d = donnees.value;
  const existant = id ? d.Fournitures[id] : undefined;
  const [v, setV] = useState<Record<string, string>>(() => ({
    libelle: '', quantite: '', unite: '', prix_unitaire: '', fournisseur_id: '', statut: 'à acheter', lien: '', piece_id: pieceId ?? '',
    costume_id: costumeId ?? costumes(d).find(c => c.statut === 'en cours')?.id ?? costumes(d)[0]?.id ?? '',
    ...(existant ?? {}),
  }));
  const [nouveauFournisseur, setNouveauFournisseur] = useState('');
  const change = (k: string) => (e: Event) => setV({ ...v, [k]: (e.target as HTMLInputElement).value });
  const listeCostumes = costumes(d).filter(c => c.statut !== 'archivé');
  const toutes = tous(d, 'Fournitures');
  // Noms et unités déjà utilisés, proposés à la saisie : même orthographe = même groupe.
  const noms = [...new Map(toutes.map(f => [cleNom(f.libelle), (f.libelle ?? '').trim()])).values()].filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'));
  const unites = [...new Set(toutes.map(f => (f.unite ?? '').trim()).filter(Boolean))].sort();
  const memeNom = toutes.filter(f => f.id !== id && v.libelle.trim() && cleNom(f.libelle) === cleNom(v.libelle));
  const plusieursPieces = liste(existant?.piece_id).length > 1; // ancienne saisie à plusieurs pièces

  // Un nom déjà connu : on reprend son unité, son prix, son fournisseur et son lien (modifiables).
  const choisirNom = (libelle: string) => {
    const modele = toutes.find(f => f.id !== id && cleNom(f.libelle) === cleNom(libelle));
    setV(x => ({
      ...x, libelle,
      ...(modele && !id ? {
        unite: x.unite || modele.unite || '', prix_unitaire: x.prix_unitaire || modele.prix_unitaire || '',
        fournisseur_id: x.fournisseur_id || modele.fournisseur_id || '', lien: x.lien || modele.lien || '',
      } : {}),
    }));
  };

  const valider = () => {
    if (!v.libelle.trim()) return;
    const ch = [];
    let fournisseur = v.fournisseur_id;
    if (fournisseur === '__nouveau' && nouveauFournisseur.trim()) {
      fournisseur = nouvelId();
      ch.push({ table: 'Fournisseurs' as const, id: fournisseur, champs: { nom: nouveauFournisseur.trim() } });
    } else if (fournisseur === '__nouveau') fournisseur = '';
    const { id: _id, maj: _maj, supprime: _s, ...champs } = v;
    ch.push({ table: 'Fournitures' as const, id: id ?? nouvelId(), champs: { ...champs, libelle: v.libelle.trim().replace(/\s+/g, ' '), fournisseur_id: fournisseur } });
    faire(ch);
    onFermer();
  };

  return (
    <Feuille titre={id ? 'Fourniture' : 'Nouvelle fourniture'} onFermer={onFermer} pied={<>
      {id && <button class="bouton danger" onClick={() => { faire(supprimer('Fournitures', id), `« ${v.libelle} » supprimé`); onFermer(); }}>Supprimer</button>}
      <button class="bouton principal" disabled={!v.libelle.trim()} onClick={valider}>Enregistrer</button>
    </>}>
      <form onSubmit={e => { e.preventDefault(); valider(); }}>
        <Champ label="Quoi" aide={memeNom.length ? `Regroupée avec ${memeNom.length} autre${memeNom.length > 1 ? 's' : ''} fourniture${memeNom.length > 1 ? 's' : ''} du même nom.` : undefined}>
          <input value={v.libelle} autoFocus list="noms-fournitures" onInput={e => choisirNom((e.target as HTMLInputElement).value)} />
          <datalist id="noms-fournitures">{noms.map(n => <option value={n} />)}</datalist>
        </Champ>
        <div class="deux-colonnes">
          <Champ label="Pour le costume">
            <Selection label="Costume" valeur={v.costume_id} options={listeCostumes.map(c => [c.id, c.nom] as [string, string])} onChange={x => setV({ ...v, costume_id: x, piece_id: '' })} />
          </Champ>
          <Champ label="Pièce (facultatif)" aide={plusieursPieces ? `Saisie pour plusieurs pièces (${piecesDeFourniture(d, existant!).map(p => p.nom).join(', ')}) : choisir une pièce la rattache à elle seule.` : undefined}>
            <Selection label="Pièce" valeur={plusieursPieces && liste(v.piece_id).length > 1 ? '__plusieurs' : v.piece_id}
              options={[['', '— Général'], ...(plusieursPieces ? [['__plusieurs', 'Plusieurs pièces'] as [string, string]] : []), ...piecesDe(d, v.costume_id).map(p => [p.id, p.nom] as [string, string])]}
              onChange={x => { if (x !== '__plusieurs') setV({ ...v, piece_id: x }); }} />
          </Champ>
        </div>
        <div class="trois-colonnes">
          <Champ label="Quantité"><input value={v.quantite} inputMode="decimal" onInput={change('quantite')} /></Champ>
          <Champ label="Unité">
            <input value={v.unite} list="unites-fournitures" onInput={change('unite')} />
            <datalist id="unites-fournitures">{unites.map(u => <option value={u} />)}</datalist>
          </Champ>
          <Champ label="Prix unitaire €"><input value={v.prix_unitaire} inputMode="decimal" placeholder="facultatif" onInput={change('prix_unitaire')} /></Champ>
        </div>
        <Champ label="Fournisseur">
          <Selection label="Fournisseur" valeur={v.fournisseur_id} onChange={x => setV({ ...v, fournisseur_id: x })}
            options={[['', '—'], ...tous(d, 'Fournisseurs').map(f => [f.id, f.nom] as [string, string]), ['__nouveau', '+ Nouveau fournisseur…']]} />
        </Champ>
        {v.fournisseur_id === '__nouveau' && <Champ label="Nom du nouveau fournisseur"><input value={nouveauFournisseur} onInput={e => setNouveauFournisseur((e.target as HTMLInputElement).value)} /></Champ>}
        <Champ label="Statut"><Selection label="Statut" valeur={v.statut || 'à acheter'} options={STATUTS_FOURNITURE} onChange={x => setV({ ...v, statut: x })} /></Champ>
        <Champ label="Lien (facultatif)"><input type="url" value={v.lien} placeholder="https://…" onInput={change('lien')} /></Champ>
        {existant && enCommande(d, existant) && (
          <p class="petit-texte">Dans une commande. <button type="button" class="bouton petit" onClick={() => { faire(retirerDeCommande(existant.id)); onFermer(); }}>Retirer de la commande</button></p>
        )}
      </form>
    </Feuille>
  );
}
