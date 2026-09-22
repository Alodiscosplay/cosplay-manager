import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { donnees } from '../../store/store';
import { Icone } from '../../composants/Icone';
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
        <TuileBudget nom="budget visé" aide="Le montant que tu te fixes pour ce costume. Clique sur le chiffre pour le modifier.">
          <span class="chiffre saisie-euros"><Texte type="number" class="chiffre-saisie" valeur={costume.budget_prevu ?? ''} placeholder="—" onValider={v => maj('Costumes', costume.id, { budget_prevu: v })} /> €</span>
        </TuileBudget>
        <TuileBudget nom="futur budget dépensé" aide="Les fournitures encore « à acheter »." chiffre={b.prevu} />
        <TuileBudget nom="budget actuel dépensé" aide="Les fournitures « commandé » et « reçu »." chiffre={b.recu + b.commande} />
        <TuileBudget nom="budget réel" aide="Futur budget dépensé + budget actuel dépensé : le coût de toutes les fournitures du costume. Ne sont pas comptées : les fournitures « déjà là » et celles sans prix." chiffre={b.total} />
        <TuileBudget nom="budget restant" aide="Budget visé − budget réel. Il passe en rouge quand le budget visé est dépassé." depasse={depasse}>
          <span class="chiffre">{b.cible !== null ? euros(b.cible - b.total) : '—'}</span>
        </TuileBudget>
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
      <div class="barre-budget-piste" role="img" aria-label={`actuel dépensé ${euros(depense)}, futur dépensé ${euros(b.prevu)}${b.cible !== null ? `, sur ${euros(b.cible)} visés` : ''}`}>
        <span class="seg actuel" style={{ width: pct(depense) }} />
        <span class="seg prevu" style={{ width: pct(b.prevu) }} />
        {b.cible !== null && b.cible > 0 && <span class="repere-cible" style={{ left: pct(b.cible) }} />}
      </div>
      <p class="barre-budget-legende">
        <span><i class="pastille actuel" />budget actuel dépensé</span>
        <span><i class="pastille prevu" />futur budget dépensé</span>
        {b.cible !== null && <span><i class="pastille cible" />budget visé</span>}
      </p>
    </div>
  );
}

/** Un encadré du budget, avec son explication derrière l'icône info. */
function TuileBudget({ nom, aide, chiffre, depasse, children }: { nom: string; aide: string; chiffre?: number; depasse?: boolean; children?: ComponentChildren }) {
  const [ouvert, setOuvert] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  // Un clic ailleurs ou Échap referme l'explication.
  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: MouseEvent) => { if (!zone.current?.contains(e.target as Node)) setOuvert(false); };
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', clic);
    document.addEventListener('keydown', touche);
    return () => { document.removeEventListener('mousedown', clic); document.removeEventListener('keydown', touche); };
  }, [ouvert]);
  return (
    <div ref={zone} class={`tuile-chiffre${depasse ? ' depasse' : ''}`}>
      {children ?? <span class="chiffre">{euros(chiffre ?? 0)}</span>}
      <span class="legende">
        {nom}
        <button class={`bouton-info${ouvert ? ' actif' : ''}`} aria-expanded={ouvert} aria-label={`Ce que compte le ${nom}`} onClick={() => setOuvert(!ouvert)}>
          <Icone nom="info" taille={14} />
        </button>
      </span>
      {ouvert && <span class="aide-tuile" role="note">{aide}</span>}
    </div>
  );
}
