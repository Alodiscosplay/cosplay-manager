import { donnees } from '../../store/store';
import { budgetCostume, euros, type Budget } from '../../logique/budget';
import { type Ligne } from '../../modele/schema';
import { maj } from '../Costume';
import { Texte } from '../../composants/base';

export function OngletBudget({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const b = budgetCostume(d, costume.id);
  const depasse = b.cible !== null && b.total > b.cible;

  return (
    <section class="budget">
      <div class="tuiles-chiffres">
        <label class="tuile-chiffre">
          <span class="chiffre saisie-euros"><Texte type="number" class="chiffre-saisie" valeur={costume.budget_prevu ?? ''} placeholder="—" onValider={v => maj('Costumes', costume.id, { budget_prevu: v })} /> €</span>
          <span class="legende">budget visé</span>
        </label>
        <div class="tuile-chiffre"><span class="chiffre">{euros(b.prevu)}</span><span class="legende">prévu</span></div>
        <div class="tuile-chiffre"><span class="chiffre">{euros(b.recu + b.commande)}</span><span class="legende">actuel dépensé</span></div>
        <div class="tuile-chiffre"><span class="chiffre">{euros(b.total)}</span><span class="legende">total</span></div>
        <div class={`tuile-chiffre${depasse ? ' depasse' : ''}`}><span class="chiffre">{b.cible !== null ? euros(b.cible - b.total) : '—'}</span><span class="legende">reste</span></div>
      </div>
      {b.total > 0 && <BarreBudget b={b} />}
      {b.sansPrix > 0 && <p class="petit-texte">{b.sansPrix} fourniture{b.sansPrix > 1 ? 's' : ''} sans prix : le total est incomplet.</p>}
    </section>
  );
}

/**
 * Où en sont les dépenses : l'actuel (reçu + commandé), puis le prévu (encore à acheter), sur l'échelle du budget visé
 * (ou du total s'il le dépasse, ou s'il n'y a pas de budget visé).
 */
function BarreBudget({ b }: { b: Budget }) {
  const echelle = Math.max(b.total, b.cible ?? 0) || 1;
  const pct = (x: number) => `${(100 * x) / echelle}%`;
  const depense = b.recu + b.commande;
  return (
    <div class="barre-budget">
      <div class="barre-budget-piste" role="img" aria-label={`actuel dépensé ${euros(depense)}, prévu ${euros(b.prevu)}${b.cible !== null ? `, sur ${euros(b.cible)} visés` : ''}`}>
        <span class="seg actuel" style={{ width: pct(depense) }} />
        <span class="seg prevu" style={{ width: pct(b.prevu) }} />
        {b.cible !== null && b.cible > 0 && <span class="repere-cible" style={{ left: pct(b.cible) }} />}
      </div>
      <p class="barre-budget-legende">
        <span><i class="pastille actuel" />actuel dépensé</span>
        <span><i class="pastille prevu" />prévu</span>
        {b.cible !== null && <span><i class="pastille cible" />budget visé</span>}
      </p>
    </div>
  );
}
