import { useState } from 'preact/hooks';
import { donnees } from '../../store/store';
import { fournituresDe, piecesDe } from '../../logique/acces';
import { montant, euros } from '../../logique/budget';
import { bool, type Ligne } from '../../modele/schema';
import { LigneFourniture, EditeurFourniture } from '../../composants/Fournitures';
import { Vide } from '../../composants/base';
import { Icone } from '../../composants/Icone';

export function OngletFournitures({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const [ouvert, setOuvert] = useState<string | 'nouveau' | null>(null);
  const liste = fournituresDe(d, costume.id);
  const pieces = piecesDe(d, costume.id);
  const groupes: [string, Ligne[]][] = [
    ['Général', liste.filter(f => !f.piece_id || !pieces.some(p => p.id === f.piece_id))],
    ...pieces.map(p => [p.nom, liste.filter(f => f.piece_id === p.id)] as [string, Ligne[]]),
  ];
  const aAcheter = liste.filter(f => (f.statut || 'à acheter') === 'à acheter').length;
  const total = liste.reduce((s, f) => s + (f.statut === 'déjà là' ? 0 : montant(f) ?? 0), 0);

  return (
    <section>
      <div class="barre-outils">
        <button class="bouton principal" onClick={() => setOuvert('nouveau')}><Icone nom="plus" />Fourniture</button>
        <a class="bouton" href="#/achats">Liste d'achats commune</a>
        <span class="petit-texte">{aAcheter} à acheter{bool(costume.suivi_budget) && total ? ` · ${euros(total)} au total` : ''}</span>
      </div>
      {!liste.length && <Vide icone="achats" titre="Aucune fourniture"><p>Les fournitures rejoignent la liste d'achats commune à tous tes costumes.</p></Vide>}
      {groupes.filter(([, l]) => l.length).map(([titre, l]) => (
        <div class="groupe">
          <h3 class="groupe-titre">{titre}</h3>
          <ul class="liste-fournitures">{l.map(f => <LigneFourniture f={f} onOuvrir={() => setOuvert(f.id)} />)}</ul>
        </div>
      ))}
      {ouvert && <EditeurFourniture id={ouvert === 'nouveau' ? undefined : ouvert} costumeId={costume.id} onFermer={() => setOuvert(null)} />}
    </section>
  );
}
