import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { donnees } from '../../store/store';
import { Icone } from '../../composants/Icone';
import { budgetCostume, euros, releveBudget, type Budget } from '../../logique/budget';
import { piecesDeFourniture } from '../../logique/acces';
import { jourCourt } from '../../logique/dates';
import { type Ligne } from '../../modele/schema';
import { maj } from '../Costume';
import { Texte, Feuille } from '../../composants/base';

export function OngletBudget({ costume }: { costume: Ligne }) {
  const d = donnees.value;
  const b = budgetCostume(d, costume.id);
  const depasse = b.cible !== null && b.total > b.cible;
  const [releve, setReleve] = useState<Releve | null>(null);

  return (
    <section class="budget">
      <div class="tuiles-chiffres">
        <TuileBudget nom="budget visé" aide="Le montant que tu te fixes pour ce costume. Clique sur le chiffre pour le modifier.">
          <span class="chiffre saisie-euros"><Texte type="number" class="chiffre-saisie" valeur={costume.budget_prevu ?? ''} placeholder="—" onValider={v => maj('Costumes', costume.id, { budget_prevu: v })} /> €</span>
        </TuileBudget>
        <TuileBudget nom="futur budget dépensé" aide="Les fournitures encore « à acheter »." chiffre={b.prevu} onDetail={() => setReleve(RELEVES.futur)} />
        <TuileBudget nom="budget actuel dépensé" aide="Les fournitures « commandé » et « reçu »." chiffre={b.recu + b.commande} onDetail={() => setReleve(RELEVES.actuel)} />
        <TuileBudget nom="budget réel" aide="Futur budget dépensé + budget actuel dépensé : le coût de toutes les fournitures du costume. Ne sont pas comptées : les fournitures « déjà là » et celles sans prix." chiffre={b.total} onDetail={() => setReleve(RELEVES.reel)} />
        <TuileBudget nom="budget restant" aide="Budget visé − budget réel. Il passe en rouge quand le budget visé est dépassé." depasse={depasse}>
          <span class="chiffre">{b.cible !== null ? euros(b.cible - b.total) : '—'}</span>
        </TuileBudget>
      </div>
      {b.total > 0 && <BarreBudget b={b} />}
      {b.sansPrix > 0 && <p class="petit-texte">{b.sansPrix} fourniture{b.sansPrix > 1 ? 's' : ''} sans prix : le total est incomplet.</p>}
      {releve && <FeuilleReleve costume={costume} releve={releve} onFermer={() => setReleve(null)} />}
    </section>
  );
}

interface Releve { titre: string; quoi: string; statuts: string[] }
const RELEVES = {
  futur: { titre: 'Futur budget dépensé', quoi: 'les fournitures encore « à acheter »', statuts: ['à acheter'] },
  actuel: { titre: 'Budget actuel dépensé', quoi: 'les fournitures « commandé » et « reçu »', statuts: ['commandé', 'reçu'] },
  reel: { titre: 'Budget réel', quoi: 'toutes les fournitures, sauf « déjà là »', statuts: ['à acheter', 'commandé', 'reçu'] },
} satisfies Record<string, Releve>;

/** Le détail d'un chiffre, comme un relevé de compte : par commande, avec la part des frais de port. */
function FeuilleReleve({ costume, releve, onFermer }: { costume: Ligne; releve: Releve; onFermer: () => void }) {
  const d = donnees.value;
  const groupes = releveBudget(d, costume.id, releve.statuts);
  const total = groupes.reduce((t, g) => t + g.total, 0);
  const titreGroupe = (g: (typeof groupes)[number]) => g.commande
    ? `Commande du ${g.date ? jourCourt(g.date) : '?'}${g.fournisseur ? ` · ${g.fournisseur.nom}` : ''}`
    : releve.statuts.length === 1 && releve.statuts[0] === 'à acheter' ? 'Encore à acheter' : 'Hors commande';
  return (
    <Feuille titre={`${releve.titre} — ${costume.nom}`} onFermer={onFermer} pied={<button class="bouton principal" onClick={onFermer}>Fermer</button>}>
      <p class="petit-texte">Le détail : {releve.quoi}, avec la part des frais de port de chaque commande.</p>
      {!groupes.length && <p class="petit-texte">Rien pour l'instant.</p>}
      {groupes.map(g => (
        <section class="releve-groupe">
          <h3 class="releve-ligne releve-tete"><span>{titreGroupe(g)}</span><span class="montant">{euros(g.total)}</span></h3>
          <ul class="releve">
            {g.lignes.map(({ fourniture: f, montant }) => {
              const pieces = piecesDeFourniture(d, f).map(p => p.nom).join(', ');
              const quantite = [f.quantite, f.unite].filter(Boolean).join(' ');
              return (
                <li class="releve-ligne">
                  <span>{f.libelle}<span class="petit-texte">{[quantite, pieces, f.statut || 'à acheter'].filter(Boolean).map(x => ` · ${x}`).join('')}</span></span>
                  <span class={`montant${montant === null ? ' sans-prix' : ''}`}>{montant === null ? 'sans prix' : euros(montant)}</span>
                </li>
              );
            })}
            {g.port > 0 && <li class="releve-ligne port"><span>Frais de port<span class="petit-texte">· part de ce costume</span></span><span class="montant">{euros(g.port)}</span></li>}
          </ul>
        </section>
      ))}
      {groupes.length > 0 && <p class="releve-ligne releve-total"><span>Total</span><span class="montant">{euros(total)}</span></p>}
    </Feuille>
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
function TuileBudget({ nom, aide, chiffre, depasse, children, onDetail }: { nom: string; aide: string; chiffre?: number; depasse?: boolean; children?: ComponentChildren; onDetail?: () => void }) {
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
      {children ?? (onDetail
        ? <button type="button" class="chiffre chiffre-detail" title="Voir le détail" aria-label={`${euros(chiffre ?? 0)}, voir le détail du ${nom}`} onClick={onDetail}>{euros(chiffre ?? 0)}</button>
        : <span class="chiffre">{euros(chiffre ?? 0)}</span>)}
      <span class="legende">{nom}</span>
      <button class={`bouton-info${ouvert ? ' actif' : ''}`} aria-expanded={ouvert} aria-label={`Ce que compte le ${nom}`} onClick={() => setOuvert(!ouvert)}>
        <Icone nom="info" taille={14} />
      </button>
      {ouvert && <span class="aide-tuile" role="note">{aide}</span>}
    </div>
  );
}
