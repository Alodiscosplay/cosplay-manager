import { donnees } from '../../store/store';
import { fournituresDe, piecesDe, piecesDeFourniture } from '../../logique/acces';
import { budgetCostume, montant, euros } from '../../logique/budget';
import { type Ligne } from '../../modele/schema';
import { maj } from '../Costume';
import { Texte } from '../../composants/base';
import { type Budget } from '../../logique/budget';

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
  const depasse = b.cible !== null && b.total > b.cible;

  return (
    <section class="budget">
      <div class="tuiles-chiffres">
        <div class="tuile-chiffre"><span class="chiffre">{euros(b.prevu)}</span><span class="legende">prévu (reste à acheter)</span></div>
        <div class="tuile-chiffre"><span class="chiffre">{euros(b.commande)}</span><span class="legende">commandé</span></div>
        <div class="tuile-chiffre"><span class="chiffre">{euros(b.recu)}</span><span class="legende">reçu</span></div>
        <label class={`tuile-chiffre${depasse ? ' depasse' : ''}`}>
          <span class="chiffre saisie-euros"><Texte type="number" class="chiffre-saisie" valeur={costume.budget_prevu ?? ''} placeholder="—" onValider={v => maj('Costumes', costume.id, { budget_prevu: v })} /> €</span>
          <span class="legende">budget visé{depasse ? ` · dépassé de ${euros(b.total - b.cible!)}` : ''}</span>
        </label>
      </div>
      {b.total > 0 && <BarreBudget b={b} />}
      {b.sansPrix > 0 && <p class="petit-texte">{b.sansPrix} fourniture{b.sansPrix > 1 ? 's' : ''} sans prix : le total est incomplet.</p>}
      {parPiece.length > 0 && <>
        <h3 class="titre-section">Coût par pièce</h3>
        <p class="petit-texte">Ce que coûtent les fournitures de chaque pièce, pour voir laquelle pèse le plus. « Général » : les fournitures qui ne sont rattachées à aucune pièce.</p>
        <div class="barres-horizontales" role="list" aria-label="Coût par pièce">
          {parPiece.map(x => (
            <div class="barre-h" role="listitem">
              <span class="barre-h-nom">{x.nom}</span>
              <span class="barre-h-piste"><span style={{ width: `${(100 * x.total) / max}%` }} /></span>
              <span class="barre-h-valeur">{euros(x.total)}</span>
            </div>
          ))}
        </div>
      </>}
    </section>
  );
}

/**
 * Où en sont les dépenses : reçu, puis commandé, puis encore à acheter, sur l'échelle du budget visé
 * (ou du total s'il le dépasse, ou s'il n'y a pas de budget visé).
 */
function BarreBudget({ b }: { b: Budget }) {
  const echelle = Math.max(b.total, b.cible ?? 0) || 1;
  const pct = (x: number) => `${(100 * x) / echelle}%`;
  const depense = b.recu + b.commande;
  return (
    <div class="barre-budget">
      <div class="barre-budget-piste" role="img" aria-label={`${euros(depense)} reçus ou commandés, ${euros(b.prevu)} encore à acheter${b.cible !== null ? `, sur ${euros(b.cible)} visés` : ''}`}>
        <span class="seg recu" style={{ width: pct(b.recu) }} />
        <span class="seg commande" style={{ width: pct(b.commande) }} />
        <span class="seg prevu" style={{ width: pct(b.prevu) }} />
        {b.cible !== null && b.cible > 0 && <span class="repere-cible" style={{ left: pct(b.cible) }} />}
      </div>
      <p class="barre-budget-legende">
        <span><i class="pastille recu" />reçu {euros(b.recu)}</span>
        <span><i class="pastille commande" />commandé {euros(b.commande)}</span>
        <span><i class="pastille prevu" />à acheter {euros(b.prevu)}</span>
        {b.cible !== null && (b.total > b.cible
          ? <strong class="erreur">{euros(b.total - b.cible)} au-dessus du budget</strong>
          : <span>marge {euros(b.cible - b.total)}</span>)}
      </p>
    </div>
  );
}
