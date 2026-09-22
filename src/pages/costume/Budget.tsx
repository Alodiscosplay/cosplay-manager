import { donnees } from '../../store/store';
import { fournituresDe, piecesDe, piecesDeFourniture } from '../../logique/acces';
import { budgetCostume, montant, euros } from '../../logique/budget';
import { type Ligne } from '../../modele/schema';
import { maj } from '../Costume';
import { Champ, Texte } from '../../composants/base';

export function OngletBudget({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const b = budgetCostume(d, costume.id);
  const pieces = piecesDe(d, costume.id);
  const liste = fournituresDe(d, costume.id).filter(f => f.statut !== 'déjà là');
  const parPiece = [
    { nom: 'Général', total: liste.filter(f => !piecesDeFourniture(d, f).length).reduce((s, f) => s + (montant(f) ?? 0), 0) },
    // une fourniture partagée entre plusieurs pièces compte pour une part égale dans chacune
    ...pieces.map(p => ({ nom: p.nom, total: liste.reduce((s, f) => {
      const concernees = piecesDeFourniture(d, f);
      return concernees.some(x => x.id === p.id) ? s + (montant(f) ?? 0) / concernees.length : s;
    }, 0) })),
  ].filter(x => x.total > 0);
  const max = Math.max(1, ...parPiece.map(x => x.total));
  const depasse = b.cible !== null && b.prevu > b.cible;

  return (
    <section class="budget">
      <div class="tuiles-chiffres">
        <div class="tuile-chiffre"><span class="chiffre">{euros(b.prevu)}</span><span class="legende">prévu (toutes fournitures)</span></div>
        <div class="tuile-chiffre"><span class="chiffre">{euros(b.engage)}</span><span class="legende">engagé (commandé ou reçu)</span></div>
        <div class="tuile-chiffre"><span class="chiffre">{euros(b.recu)}</span><span class="legende">reçu</span></div>
        <div class={`tuile-chiffre${depasse ? ' depasse' : ''}`}>
          <span class="chiffre">{b.cible !== null ? euros(b.cible) : '—'}</span>
          <span class="legende">budget visé{depasse ? ` · dépassé de ${euros(b.prevu - b.cible!)}` : ''}</span>
        </div>
      </div>
      <Champ label="Budget visé (€)"><Texte type="number" valeur={costume.budget_prevu ?? ''} onValider={v => maj('Costumes', costume.id, { budget_prevu: v })} /></Champ>
      {b.sansPrix > 0 && <p class="petit-texte">{b.sansPrix} fourniture{b.sansPrix > 1 ? 's' : ''} sans prix : le total est incomplet.</p>}
      {parPiece.length > 0 && (
        <div class="barres-horizontales" role="list" aria-label="Montant par pièce">
          {parPiece.map(x => (
            <div class="barre-h" role="listitem">
              <span class="barre-h-nom">{x.nom}</span>
              <span class="barre-h-piste"><span style={{ width: `${(100 * x.total) / max}%` }} /></span>
              <span class="barre-h-valeur">{euros(x.total)}</span>
            </div>
          ))}
        </div>
      )}
      <p class="petit-texte">Les frais de port restent au niveau des commandes (page Achats).</p>
    </section>
  );
}
