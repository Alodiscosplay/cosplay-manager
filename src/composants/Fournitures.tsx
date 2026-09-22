// Fournitures : une ligne de la liste de courses, et son éditeur. Partagé entre la page Achats et le costume.
import { useState } from 'preact/hooks';
import { donnees, faire } from '../store/store';
import { costumes, piecesDe, tous, ligne } from '../logique/acces';
import { montant, euros } from '../logique/budget';
import { STATUTS_FOURNITURE, type Ligne } from '../modele/schema';
import { nouvelId, supprimer, retirerDeCommande } from '../store/operations';
import { Feuille, Champ, Selection, Puce } from './base';
import { Icone } from './Icone';

const TON_STATUT: Record<string, 'gris' | 'accent' | 'vert' | 'orange'> = { 'à acheter': 'orange', 'commandé': 'accent', 'reçu': 'vert', 'déjà là': 'gris' };

export function LigneFourniture({ f, afficherCostume, selectionnee, onSelection, onOuvrir }: {
  f: Ligne; afficherCostume?: boolean; selectionnee?: boolean; onSelection?: (v: boolean) => void; onOuvrir: () => void;
}) {
  const d = donnees.value;
  const m = montant(f);
  const c = ligne(d, 'Costumes', f.costume_id);
  const piece = ligne(d, 'Pieces', f.piece_id);
  const statut = f.statut || 'à acheter';
  return (
    <li class={`fourniture statut-${statut.replace(/\s/g, '-')}`}>
      {onSelection && (
        <input type="checkbox" class="selection" checked={selectionnee} aria-label={`Sélectionner ${f.libelle}`}
          onChange={e => onSelection((e.target as HTMLInputElement).checked)} />
      )}
      <button class="fourniture-texte" onClick={onOuvrir}>
        <span class="fourniture-libelle">{f.libelle}</span>
        <span class="etape-meta">
          {(f.quantite || f.unite) && <span>{[f.quantite, f.unite].filter(Boolean).join(' ')}</span>}
          {afficherCostume && c && <span class="costume-nom">{c.nom}</span>}
          {piece && <span>{piece.nom}</span>}
          {f.commande_id && ligne(d, 'Commandes', f.commande_id) && <span><Icone nom="boite" taille={12} />en commande</span>}
        </span>
      </button>
      {m !== null && <span class="montant">{euros(m)}</span>}
      {f.lien && <a class="bouton-icone petit" href={f.lien} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir le lien de ${f.libelle}`}><Icone nom="lien" taille={16} /></a>}
      <Puce ton={TON_STATUT[statut] ?? 'gris'}>{statut}</Puce>
    </li>
  );
}

export function EditeurFourniture({ id, costumeId, onFermer }: { id?: string; costumeId?: string; onFermer: () => void }) {
  const d = donnees.value;
  const existant = id ? d.Fournitures[id] : undefined;
  const [v, setV] = useState<Record<string, string>>(() => ({
    libelle: '', quantite: '', unite: '', prix_unitaire: '', fournisseur_id: '', statut: 'à acheter', lien: '', piece_id: '',
    costume_id: costumeId ?? costumes(d).find(c => c.statut === 'en cours')?.id ?? costumes(d)[0]?.id ?? '',
    ...(existant ?? {}),
  }));
  const [nouveauFournisseur, setNouveauFournisseur] = useState('');
  const change = (k: string) => (e: Event) => setV({ ...v, [k]: (e.target as HTMLInputElement).value });
  const listeCostumes = costumes(d).filter(c => c.statut !== 'archivé');

  const valider = () => {
    if (!v.libelle.trim()) return;
    const ch = [];
    let fournisseur = v.fournisseur_id;
    if (fournisseur === '__nouveau' && nouveauFournisseur.trim()) {
      fournisseur = nouvelId();
      ch.push({ table: 'Fournisseurs' as const, id: fournisseur, champs: { nom: nouveauFournisseur.trim() } });
    } else if (fournisseur === '__nouveau') fournisseur = '';
    const { id: _id, maj: _maj, supprime: _s, ...champs } = v;
    ch.push({ table: 'Fournitures' as const, id: id ?? nouvelId(), champs: { ...champs, libelle: v.libelle.trim(), fournisseur_id: fournisseur } });
    faire(ch);
    onFermer();
  };

  return (
    <Feuille titre={id ? 'Fourniture' : 'Nouvelle fourniture'} onFermer={onFermer} pied={<>
      {id && <button class="bouton danger" onClick={() => { faire(supprimer('Fournitures', id), `« ${v.libelle} » supprimé`); onFermer(); }}>Supprimer</button>}
      <button class="bouton principal" disabled={!v.libelle.trim()} onClick={valider}>Enregistrer</button>
    </>}>
      <form onSubmit={e => { e.preventDefault(); valider(); }}>
        <Champ label="Quoi"><input value={v.libelle} autoFocus placeholder="ex. Suédine verte" onInput={change('libelle')} /></Champ>
        <div class="deux-colonnes">
          <Champ label="Pour le costume">
            <Selection label="Costume" valeur={v.costume_id} options={listeCostumes.map(c => [c.id, c.nom] as [string, string])} onChange={x => setV({ ...v, costume_id: x, piece_id: '' })} />
          </Champ>
          <Champ label="Pièce (facultatif)">
            <Selection label="Pièce" valeur={v.piece_id} options={[['', '—'], ...piecesDe(d, v.costume_id).map(p => [p.id, p.nom] as [string, string])]} onChange={x => setV({ ...v, piece_id: x })} />
          </Champ>
        </div>
        <div class="trois-colonnes">
          <Champ label="Quantité"><input value={v.quantite} placeholder="ex. 1,20" onInput={change('quantite')} /></Champ>
          <Champ label="Unité"><input value={v.unite} placeholder="m, paires…" onInput={change('unite')} /></Champ>
          <Champ label="Prix unitaire €"><input value={v.prix_unitaire} inputMode="decimal" placeholder="facultatif" onInput={change('prix_unitaire')} /></Champ>
        </div>
        <Champ label="Fournisseur">
          <Selection label="Fournisseur" valeur={v.fournisseur_id} onChange={x => setV({ ...v, fournisseur_id: x })}
            options={[['', '—'], ...tous(d, 'Fournisseurs').map(f => [f.id, f.nom] as [string, string]), ['__nouveau', '+ Nouveau fournisseur…']]} />
        </Champ>
        {v.fournisseur_id === '__nouveau' && <Champ label="Nom du nouveau fournisseur"><input value={nouveauFournisseur} onInput={e => setNouveauFournisseur((e.target as HTMLInputElement).value)} /></Champ>}
        <Champ label="Statut"><Selection label="Statut" valeur={v.statut || 'à acheter'} options={STATUTS_FOURNITURE} onChange={x => setV({ ...v, statut: x })} /></Champ>
        <Champ label="Lien (facultatif)"><input type="url" value={v.lien} placeholder="https://…" onInput={change('lien')} /></Champ>
        {existant?.commande_id && ligne(d, 'Commandes', existant.commande_id) && (
          <p class="petit-texte">Dans une commande. <button type="button" class="bouton petit" onClick={() => { faire(retirerDeCommande(existant.id)); onFermer(); }}>Retirer de la commande</button></p>
        )}
      </form>
    </Feuille>
  );
}
