import { useState } from 'preact/hooks';
import { donnees, jour, faire } from '../store/store';
import { costumes, piecesDe, ligne } from '../logique/acces';
import { avancementCostume } from '../logique/avancement';
import { statutCostume, pieceTerminee } from '../logique/disponibilite';
import { deadlineCostume, alertes } from '../logique/planning';
import { relatif, jourCourt } from '../logique/dates';
import { creerCostume } from '../store/operations';
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
  const al = alertes(d, j);

  return (
    <div class="page">
      <header class="page-tete">
        <h1>Mes costumes</h1>
        <IndicateurSync />
        <button class="bouton principal" onClick={() => setCreation(true)}><Icone nom="plus" />Nouveau costume</button>
      </header>

      {al.length > 0 && (
        <section class="alertes" aria-label="Alertes">
          {al.slice(0, 5).map(a => (
            <a class={`alerte ${a.niveau}`} href={lienCostume(a.costumeId)}><Icone nom="alerte" taille={16} />{a.texte}</a>
          ))}
          {al.length > 5 && <p class="petit-texte">… et {al.length - 5} autre{al.length > 6 ? 's' : ''}</p>}
        </section>
      )}

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
            <div class="grille-cartes">{groupe.map(c => <CarteCostume c={c} />)}</div>
          </section>
        );
      })}

      {nbArchives > 0 && <a class="lien-discret" href="#/archives"><Icone nom="archive" taille={16} />{nbArchives} costume{nbArchives > 1 ? 's' : ''} archivé{nbArchives > 1 ? 's' : ''}</a>}

      {creation && <NouveauCostume onFermer={() => setCreation(false)} />}
    </div>
  );
}

function CarteCostume({ c }: { c: Ligne }) {
  const d = donnees.value;
  const a = avancementCostume(d, c.id);
  const dl = deadlineCostume(d, c);
  const attend = c.statut === 'en attente' ? ligne(d, 'Costumes', c.attend_costume_id) : undefined;
  const ev = ligne(d, 'Evenements', c.evenement_id);
  const pieces = piecesDe(d, c.id);
  const nbTerminees = pieces.filter(p => pieceTerminee(d, p.id)).length;
  return (
    <a class="carte-costume" href={lienCostume(c.id)}>
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
