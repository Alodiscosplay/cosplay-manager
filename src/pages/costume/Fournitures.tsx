// Onglet « Fournitures » d'un costume : une ligne par besoin (une pièce, une quantité), et l'affichage
// regroupe par nom, par ordre alphabétique, avec la quantité par pièce et le total.
import { useState } from 'preact/hooks';
import { donnees } from '../../store/store';
import { fournituresDe, piecesDe, piecesDeFourniture } from '../../logique/acces';
import { montant, euros, regrouperParNom } from '../../logique/budget';
import { bool, type Ligne } from '../../modele/schema';
import { GroupeFourniture, EditeurFourniture } from '../../composants/Fournitures';
import { Selection, Vide } from '../../composants/base';
import { Icone } from '../../composants/Icone';

export function OngletFournitures({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const [ouvert, setOuvert] = useState<string | 'nouveau' | null>(null);
  const [piece, setPiece] = useState(''); // '' = toutes, '__general' = sans pièce, sinon id
  const pieces = piecesDe(d, costume.id);
  const toutes = fournituresDe(d, costume.id);
  const liste = toutes.filter(f => {
    if (!piece) return true;
    const ps = piecesDeFourniture(d, f);
    return piece === '__general' ? !ps.length : ps.some(p => p.id === piece);
  });
  const groupes = regrouperParNom(liste);
  const aAcheter = liste.filter(f => (f.statut || 'à acheter') === 'à acheter').length;
  const total = liste.reduce((s, f) => s + (f.statut === 'déjà là' ? 0 : montant(f) ?? 0), 0);

  return (
    <section>
      <div class="barre-outils">
        <button class="bouton principal" onClick={() => setOuvert('nouveau')}><Icone nom="plus" />Fourniture</button>
        {pieces.length > 0 && (
          <Selection label="Filtrer par pièce" valeur={piece} onChange={setPiece}
            options={[['', 'Toutes les pièces'], ['__general', 'Général'], ...pieces.map(p => [p.id, p.nom] as [string, string])]} />
        )}
        <a class="bouton" href="#/achats">Liste d'achats commune</a>
        <span class="petit-texte">{aAcheter} à acheter{bool(costume.suivi_budget) && total ? ` · ${euros(total)} au total` : ''}</span>
      </div>
      {!toutes.length && <Vide icone="achats" titre="Aucune fourniture"><p>Les fournitures rejoignent la liste d'achats commune à tous tes costumes.</p></Vide>}
      {toutes.length > 0 && !liste.length && <p class="petit-texte">Aucune fourniture pour cette pièce.</p>}
      {groupes.length > 0 && (
        <ul class="liste-fournitures">
          {groupes.map(g => <GroupeFourniture g={g} onOuvrir={setOuvert} />)}
        </ul>
      )}
      {ouvert && <EditeurFourniture id={ouvert === 'nouveau' ? undefined : ouvert} costumeId={costume.id}
        pieceId={piece && piece !== '__general' ? piece : undefined} onFermer={() => setOuvert(null)} />}
    </section>
  );
}
