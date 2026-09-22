import { useState } from 'preact/hooks';
import { donnees, mode, sync, synchroniser, faire, demarrer, quitter, reinitialiserDemo, emplacement } from '../store/store';
import { tous, ordreSuivant, ligne } from '../logique/acces';
import { analyserListe, compter } from '../logique/collerListe';
import { NOMS_TABLES, type NomTable, type Ligne } from '../modele/schema';
import { restaurer, nouvelId, supprimer } from '../store/operations';
import { connecter, deconnecter, emailConnu, googleConfigure } from '../sync/google';
import { placePhotos, urlClasseur } from '../sync/drive';
import { Feuille, Champ, Texte, Confirmer, telechargerBlob } from '../composants/base';
import { Icone } from '../composants/Icone';
import { jourCourt } from '../logique/dates';

export function PageReglages() {
  return (
    <div class="page">
      <header class="page-tete"><h1>Réglages</h1></header>
      <Compte />
      <Modeles />
      <Corbeille />
      <Sauvegarde />
      <section class="carte-reglage">
        <h2>À propos</h2>
        <p class="petit-texte">Cosplay Planner — tes données restent dans ton propre Google Drive (un Sheet et un dossier de photos créés par l'appli), ou sur cet appareil en mode démo. L'appli n'a accès à aucun autre fichier.</p>
      </section>
    </div>
  );
}

function Compte() {
  const s = sync.value;
  const [place, setPlace] = useState<string>('');
  const [erreur, setErreur] = useState('');
  const [quitterDemo, setQuitterDemo] = useState(false);
  const e = emplacement();

  const passerGoogle = async () => {
    setErreur('');
    try { await connecter(true); await demarrer('google'); } catch (x) { setErreur((x as Error).message); }
  };

  if (mode.value === 'demo') {
    return (
      <section class="carte-reglage">
        <h2>Compte</h2>
        <p>Mode démo : les données restent sur cet appareil et ne se synchronisent pas.</p>
        {googleConfigure() && <button class="bouton principal" onClick={passerGoogle}>Se connecter avec Google</button>}
        {googleConfigure() && <p class="petit-texte">La connexion ouvre ton propre espace, vide : les données de démo restent dans le mode démo.</p>}
        <div class="ligne-actions">
          <button class="bouton" onClick={() => setQuitterDemo(true)}>Remettre la démo à zéro</button>
          <button class="bouton" onClick={() => quitter()}>Quitter le mode démo</button>
        </div>
        {erreur && <p class="erreur" role="alert">{erreur}</p>}
        {quitterDemo && <Confirmer titre="Remettre la démo à zéro ?" texte="Les costumes d'exemple sont recréés, tes essais effacés." bouton="Remettre à zéro" danger
          onNon={() => setQuitterDemo(false)} onOui={async () => { await reinitialiserDemo(); setQuitterDemo(false); }} />}
      </section>
    );
  }

  return (
    <section class="carte-reglage">
      <h2>Compte et synchronisation</h2>
      <p>Connecté{emailConnu() ? <> en tant que <strong>{emailConnu()}</strong></> : ''}.</p>
      <p class="petit-texte">
        État : {s.etat}{s.derniere ? ` · dernière synchro ${jourCourt(s.derniere.slice(0, 10))} à ${s.derniere.slice(11, 16)} (UTC)` : ''}
        {s.attente ? ` · ${s.attente} modification${s.attente > 1 ? 's' : ''} en attente` : ''}
      </p>
      <div class="ligne-actions">
        <button class="bouton" onClick={() => synchroniser()}><Icone nom="sync" />Synchroniser</button>
        {s.etat === 'reconnexion' && <button class="bouton principal" onClick={async () => { await connecter(true); await synchroniser(); }}>Se reconnecter</button>}
        {e && <a class="bouton" href={urlClasseur(e.classeurId)} target="_blank" rel="noopener noreferrer"><Icone nom="tableau" />Ouvrir mon Sheet</a>}
      </div>
      <div class="ligne-actions">
        <button class="bouton" onClick={async () => { setPlace('calcul…'); try { const p = await placePhotos(); setPlace(`${p.nb} photo${p.nb > 1 ? 's' : ''} · ${(p.octets / 1024 / 1024).toFixed(1)} Mo`); } catch (x) { setPlace((x as Error).message); } }}>
          Place occupée par les photos
        </button>
        {place && <span class="petit-texte">{place}</span>}
      </div>
      <p class="petit-texte">Archiver un costume terminé libère la place de ses photos.</p>
      <button class="bouton" onClick={async () => { deconnecter(); await quitter(); }}>Se déconnecter</button>
    </section>
  );
}

function Modeles() {
  const d = donnees.value;
  const modeles = tous(d, 'Modeles');
  const [ouvert, setOuvert] = useState<string | null>(null);
  return (
    <section class="carte-reglage">
      <h2>Modèles de pistes</h2>
      <p class="petit-texte">Une suite d'étapes qui revient toujours dans le même ordre (impression 3D, perruque…). On l'insère comme piste dans n'importe quelle pièce.</p>
      <ul class="liste-simple">
        {modeles.map(m => (
          <li><button class="lien-bouton" onClick={() => setOuvert(m.id)}><strong>{m.nom}</strong></button> <span class="petit-texte">{compter(analyserListe(m.contenu)).etapes} étapes</span></li>
        ))}
      </ul>
      <button class="bouton" onClick={() => { const id = nouvelId(); faire([{ table: 'Modeles', id, champs: { nom: 'Nouveau modèle', contenu: '', ordre: ordreSuivant(modeles) } }]); setOuvert(id); }}>
        <Icone nom="plus" />Nouveau modèle
      </button>
      {ouvert && d.Modeles[ouvert] && <EditeurModele id={ouvert} onFermer={() => setOuvert(null)} />}
    </section>
  );
}

function EditeurModele({ id, onFermer }: { id: string; onFermer: () => void }) {
  const m = donnees.value.Modeles[id];
  const maj = (champs: Record<string, string>) => faire([{ table: 'Modeles', id, champs }]);
  return (
    <Feuille titre="Modèle" onFermer={onFermer} pied={<>
      <button class="bouton danger" onClick={() => { faire(supprimer('Modeles', id), `Modèle « ${m.nom} » supprimé`); onFermer(); }}>Supprimer</button>
      <button class="bouton principal" onClick={onFermer}>Terminé</button>
    </>}>
      <Champ label="Nom"><Texte valeur={m.nom} onValider={v => v && maj({ nom: v })} /></Champ>
      <Champ label="Étapes" aide="Une par ligne, durée facultative : (rapide), (long), (très long). « ### Nom » crée plusieurs pistes.">
        <Texte multiligne class="zone-collage" valeur={m.contenu} onValider={v => maj({ contenu: v })} />
      </Champ>
      <p class="petit-texte">Pour partager ce modèle avec un·e ami·e : copie le texte, il suffit de le coller dans un nouveau modèle.</p>
    </Feuille>
  );
}

const TITRES: Partial<Record<NomTable, string>> = {
  Costumes: 'Costume', Pieces: 'Pièce', Pistes: 'Piste', Etapes: 'Étape', Fournitures: 'Fourniture', Fournisseurs: 'Fournisseur',
  Commandes: 'Commande', Taches: 'Tâche', Photos: 'Photo', Evenements: 'Événement', Modeles: 'Modèle',
};

function Corbeille() {
  const d = donnees.value;
  const [ouverte, setOuverte] = useState(false);
  const elements: { table: NomTable; l: Ligne }[] = [];
  for (const t of NOMS_TABLES) for (const l of Object.values(d[t])) if (l.supprime === 'oui') elements.push({ table: t, l });
  elements.sort((a, b) => (b.l.maj || '').localeCompare(a.l.maj || ''));
  const nom = (t: NomTable, l: Ligne) => l.nom || l.titre || l.libelle || l.legende || (t === 'Commandes' ? ligne(d, 'Fournisseurs', l.fournisseur_id)?.nom ?? 'commande' : '(sans nom)');
  return (
    <section class="carte-reglage">
      <h2>Corbeille</h2>
      <p class="petit-texte">Ce qui a été supprimé reste restaurable. Restaurer un costume ramène aussi ses pièces et étapes.</p>
      {!elements.length ? <p class="petit-texte">Vide.</p> : (
        <>
          <button class="bouton" onClick={() => setOuverte(!ouverte)}>{ouverte ? 'Masquer' : `Voir (${elements.length})`}</button>
          {ouverte && (
            <ul class="liste-simple">
              {elements.slice(0, 100).map(({ table, l }) => (
                <li>
                  <span class="petit-texte">{TITRES[table]}</span> {nom(table, l)}
                  <button class="bouton petit" onClick={() => faire(restaurer(table, l.id), 'Restauré')}>Restaurer</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function Sauvegarde() {
  return (
    <section class="carte-reglage">
      <h2>Sauvegarde</h2>
      <p class="petit-texte">Un fichier JSON avec toutes tes données (sans les photos). En mode Google, le Sheet est déjà une sauvegarde.</p>
      <button class="bouton" onClick={() => {
        const blob = new Blob([JSON.stringify({ format: 'cosplay-planner-sauvegarde', exporte_le: new Date().toISOString(), donnees: donnees.value }, null, 1)], { type: 'application/json' });
        telechargerBlob(blob, `cosplay-planner-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`);
      }}><Icone nom="telecharger" />Exporter mes données</button>
    </section>
  );
}
