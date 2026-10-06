import { useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { donnees, jour, faire } from '../store/store';
import { costumes, piecesDe, ligne, reordonnerParmi } from '../logique/acces';
import { avancementCostume } from '../logique/avancement';
import { statutCostume, pieceTerminee } from '../logique/disponibilite';
import { deadlineCostume } from '../logique/planning';
import { relatif, jourCourt } from '../logique/dates';
import { creerCostume, reordonner } from '../store/operations';
import { annulerDeplacementDom } from '../composants/glisser';
import { lienCostume } from '../routeur';
import { FicheCostume } from './Costume';
import { ImageCadree } from '../composants/Cadrage';
import { Barre, Pct, Puce, Vide } from '../composants/base';
import { Icone } from '../composants/Icone';
import { IndicateurSync } from '../app';
import { type Ligne } from '../modele/schema';

const GROUPES: [string, string][] = [
  ['en cours', 'En cours'], ['projet', 'En projet'], ['en attente', 'En attente'], ['en pause', 'En pause'], ['terminé', 'Terminés'],
];

export function Accueil() {
  const d = donnees.value;
  const j = jour.value;
  const [creation, setCreation] = useState(false);
  const liste = costumes(d).filter(c => c.statut !== 'archivé');
  const nbArchives = costumes(d).length - liste.length;

  return (
    <div class="page">
      <header class="page-tete">
        <h1>Mes costumes</h1>
        <IndicateurSync />
        <button class="bouton principal" onClick={() => setCreation(true)}><Icone nom="plus" />Nouveau costume</button>
      </header>

      {liste.length === 0 && (
        <Vide icone="boite" titre="Aucun costume pour l'instant">
          <p>Crée ton premier costume, puis détaille-le pièce par pièce.</p>
          <button class="bouton principal" onClick={() => setCreation(true)}>Créer un costume</button>
        </Vide>
      )}

      {GROUPES.map(([statut, titre]) => {
        const groupe = liste.filter(c => statutCostume(c, j) === statut);
        if (!groupe.length) return null;
        return (
          <section class="groupe">
            <h2 class="groupe-titre">{titre} <span class="compteur">{groupe.length}</span></h2>
            <GrilleCostumes groupe={groupe} />
          </section>
        );
      })}

      {nbArchives > 0 && <a class="lien-discret" href="#/archives"><Icone nom="archive" taille={16} />{nbArchives} costume{nbArchives > 1 ? 's' : ''} archivé{nbArchives > 1 ? 's' : ''}</a>}

      {creation && <NouveauCostume onFermer={() => setCreation(false)} />}
    </div>
  );
}

/** Les cartes d'un groupe, réordonnables en glissant leur poignée (ordre propre à cette page). */
function GrilleCostumes({ groupe }: { groupe: Ligne[] }) {
  const grille = useRef<HTMLDivElement>(null);
  const cle = groupe.map(c => c.id).join(',');
  useEffect(() => {
    if (!grille.current || groupe.length < 2) return;
    const s = Sortable.create(grille.current, {
      handle: '.poignee-carte', draggable: '.carte-costume', animation: 150,
      onEnd: evt => {
        annulerDeplacementDom(evt);
        if (evt.oldIndex === evt.newIndex) return;
        const affiches = groupe.map(c => donnees.value.Costumes[c.id]);
        const [bouge] = affiches.splice(evt.oldIndex!, 1);
        affiches.splice(evt.newIndex!, 0, bouge);
        faire(reordonner('Costumes', reordonnerParmi(costumes(donnees.value), affiches)));
      },
    });
    return () => s.destroy();
  }, [cle]);
  return <div class="grille-cartes" ref={grille}>{groupe.map(c => <CarteCostume key={c.id} c={c} deplacable={groupe.length > 1} />)}</div>;
}

function CarteCostume({ c, deplacable }: { c: Ligne; deplacable?: boolean }) {
  const d = donnees.value;
  const a = avancementCostume(d, c.id);
  const dl = deadlineCostume(d, c);
  const attend = c.statut === 'en attente' ? ligne(d, 'Costumes', c.attend_costume_id) : undefined;
  const ev = ligne(d, 'Evenements', c.evenement_id);
  const pieces = piecesDe(d, c.id);
  const nbTerminees = pieces.filter(p => pieceTerminee(d, p.id)).length;
  return (
    <a class="carte-costume" href={lienCostume(c.id)}>
      {deplacable && (
        <span class="poignee poignee-carte" aria-label={`Déplacer ${c.nom}`} title="Glisser pour réordonner"
          onClick={e => { e.preventDefault(); e.stopPropagation(); }}><Icone nom="poignee" taille={18} /></span>
      )}
      <div class="carte-image">{c.image_ref ? <ImageCadree id={c.image_ref} cadrage={c.cadrage} alt={`Référence ${c.nom}`} /> : <div class="photo-vide"><span aria-hidden="true">✂</span></div>}</div>
      <div class="carte-corps">
        <h3>{c.nom}</h3>
        {(c.personnage || c.oeuvre) && <p class="sous-titre">{[c.personnage, c.oeuvre].filter(Boolean).join(' · ')}</p>}
        <div class="ligne-avancement"><Barre a={a} /><Pct a={a} /></div>
        <div class="puces">
          {dl && <Puce ton={dl < jour.value ? 'rouge' : 'accent'} titre={jourCourt(dl)}><Icone nom="drapeau" taille={12} />{ev ? `${ev.nom} ` : ''}{relatif(dl, jour.value)}</Puce>}
          {attend && <Puce ton="gris">attend {attend.nom}</Puce>}
          {pieces.length > 0 && <Puce ton="gris">{nbTerminees}/{pieces.length} pièce{pieces.length > 1 ? 's' : ''} terminée{pieces.length > 1 ? 's' : ''}</Puce>}
        </div>
      </div>
    </a>
  );
}

/** Crée le costume tout de suite (vide) et ouvre sa fiche complète ; fermé sans nom, il disparaît. */
function NouveauCostume({ onFermer }: { onFermer: () => void }) {
  const [id] = useState(() => { const ch = creerCostume(donnees.value, ''); faire(ch); return ch[0].id; });
  return <FicheCostume id={id} nouveau onFermer={onFermer} />;
}
