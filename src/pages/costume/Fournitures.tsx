// Onglet « Fournitures » d'un costume : une ligne par besoin (une pièce, une quantité), et l'affichage
// regroupe par nom, par ordre alphabétique, avec la quantité par pièce. Les montants sont dans l'onglet Budget.
import { useState } from 'preact/hooks';
import { donnees } from '../../store/store';
import { fournituresDe, piecesDe, piecesDeFourniture } from '../../logique/acces';
import { regrouperParNom } from '../../logique/budget';
import { STATUTS_FOURNITURE, type Ligne } from '../../modele/schema';
import { GroupeFourniture, EditeurFourniture } from '../../composants/Fournitures';
import { Selection, Vide } from '../../composants/base';
import { Icone } from '../../composants/Icone';

export function OngletFournitures({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const [ouvert, setOuvert] = useState<string | 'nouveau' | null>(null);
  const [piece, setPiece] = useState(''); // '' = toutes, '__general' = sans pièce, sinon id
  const [statut, setStatut] = useState(''); // '' = tous les statuts
  const pieces = piecesDe(d, costume.id);
  const toutes = fournituresDe(d, costume.id);
  const liste = toutes.filter(f => {
    if (statut && (f.statut || 'à acheter') !== statut) return false;
    if (!piece) return true;
    const ps = piecesDeFourniture(d, f);
    return piece === '__general' ? !ps.length : ps.some(p => p.id === piece);
  });
  const groupes = regrouperParNom(liste);

  return (
    <section>
      <div class="barre-outils">
        <button class="bouton principal" onClick={() => setOuvert('nouveau')}><Icone nom="plus" />Fourniture</button>
        {pieces.length > 0 && (
          <Selection label="Filtrer par pièce" valeur={piece} onChange={setPiece}
            options={[['', 'Tout le costume'], ...pieces.map(p => [p.id, p.nom] as [string, string]), ['__general', 'Hors pièces']]} />
        )}
        <Selection label="Filtrer par statut" valeur={statut} onChange={setStatut}
          options={[['', 'Tous les statuts'], ...STATUTS_FOURNITURE.map(x => [x, x] as [string, string])]} />
      </div>
      {!toutes.length && <Vide icone="achats" titre="Aucune fourniture"><p>Les fournitures rejoignent la liste d'achats commune à tous tes costumes.</p></Vide>}
      {toutes.length > 0 && !liste.length && <p class="petit-texte">Aucune fourniture pour ce filtre.</p>}
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
