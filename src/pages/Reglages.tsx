import { useState } from 'preact/hooks';
import { donnees, mode, sync, synchroniser, faire, demarrer, quitter, reinitialiserDemo, emplacement, photosSurDrive, reglerPhotosDrive, dossierPhotos, reglerDossierPhotos } from '../store/store';
import { tous, ordreSuivant, ligne } from '../logique/acces';
import { analyserListe, compter, modeleVersTexte, texteVersModele, type PisteTexte } from '../logique/collerListe';
import { NOMS_TABLES, DUREES, NOMS_DUREES, type NomTable, type Ligne, type Duree } from '../modele/schema';
import { restaurer, nouvelId, supprimer, changementsImport } from '../store/operations';
import { connecter, deconnecter, emailConnu, googleConfigure } from '../sync/google';
import { placePhotos, urlClasseur } from '../sync/drive';
import { choisirDossier, pickerConfigure } from '../sync/picker';
import { Feuille, Champ, Confirmer, telechargerBlob } from '../composants/base';
import { Icone } from '../composants/Icone';
import { jourCourt } from '../logique/dates';

export function PageReglages() {
  return (
    <div class="page">
      <header class="page-tete"><h1>Réglages</h1></header>
      <Compte />
      <Photos />
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

/**
 * Les photos vivent sur l'appareil ; on peut en envoyer une copie sur son Drive, dans le dossier de
 * son choix (Drive plein, partage avec d'autres outils, ou simple préférence).
 */
function Photos() {
  const d = donnees.value;
  const actif = photosSurDrive.value;
  const dossier = dossierPhotos.value;
  const [erreur, setErreur] = useState('');
  const locales = new Set<string>();
  for (const p of Object.values(d.Photos)) if (p.supprime !== 'oui' && p.supprime !== 'purge' && p.drive_id?.startsWith('local:')) locales.add(p.drive_id);
  for (const c of Object.values(d.Costumes)) if (c.image_ref?.startsWith('local:')) locales.add(c.image_ref);
  const choisir = async () => {
    setErreur('');
    try {
      const jeton = await connecter(true);
      const choix = await choisirDossier(jeton);
      if (choix) await reglerDossierPhotos(choix);
    } catch (e) { setErreur((e as Error).message); }
  };
  return (
    <section class="carte-reglage">
      <h2>Photos</h2>
      <p class="petit-texte">Tes photos sont réduites puis gardées <strong>sur cet appareil</strong>. Elles n’occupent pas de place sur ton Drive.</p>
      <label class="interrupteur">
        <input type="checkbox" checked={actif} onChange={e => void reglerPhotosDrive((e.target as HTMLInputElement).checked)} />
        <span>Envoyer aussi une copie sur mon Google Drive</span>
      </label>
      {actif && (
        <>
          <p class="petit-texte">Dossier : <strong>{dossier ? dossier.nom : 'Photos (dossier de l’appli)'}</strong></p>
          <div class="ligne-actions">
            <button class="bouton" disabled={mode.value !== 'google' || !pickerConfigure()} onClick={() => void choisir()}>
              <Icone nom="nuage" />Choisir un dossier…
            </button>
            {dossier && <button class="bouton" onClick={() => void reglerDossierPhotos(null)}>Revenir au dossier de l’appli</button>}
          </div>
          {mode.value === 'google' && !pickerConfigure() && <p class="petit-texte">Le choix du dossier sera disponible une fois l’appli entièrement configurée auprès de Google.</p>}
          <p class="petit-texte">Tes autres appareils retrouvent alors les photos. Les photos déjà envoyées restent sur le Drive si tu décoches.</p>
        </>
      )}
      {!actif && <p class="petit-texte">Sans copie, tes autres appareils ne verront pas les photos, et elles disparaîtraient si tu effaçais les données du navigateur. Archive tes costumes terminés pour les garder sur ton ordinateur.</p>}
      {locales.size > 0 && actif && (
        <p class="petit-texte">{locales.size} photo{locales.size > 1 ? 's partiront' : ' partira'} sur le Drive à la prochaine synchro{mode.value !== 'google' ? ' (une fois connecté à Google)' : ''}.</p>
      )}
      {mode.value !== 'google' && <p class="petit-texte">En mode démo, rien n’est envoyé : le réglage prendra effet une fois connecté à Google.</p>}
      {erreur && <p class="erreur">{erreur}</p>}
    </section>
  );
}

function Modeles() {
  const d = donnees.value;
  const modeles = tous(d, 'Modeles');
  const [ouvert, setOuvert] = useState<string | null>(null);
  return (
    <section class="carte-reglage">
      <h2>Modèles d'étapes</h2>
      <p class="petit-texte">Une suite de sous-étapes qui revient toujours dans le même ordre. On l'insère comme étape dans n'importe quelle pièce, ou à la suite d'une étape existante.</p>
      <ul class="liste-simple">
        {modeles.map(m => (
          <li><button class="lien-bouton" onClick={() => setOuvert(m.id)}><strong>{m.nom}</strong></button> <span class="petit-texte">{compter(analyserListe(m.contenu)).etapes} sous-étapes</span></li>
        ))}
      </ul>
      <button class="bouton" onClick={() => { const id = nouvelId(); faire([{ table: 'Modeles', id, champs: { nom: 'Nouveau modèle', contenu: '', ordre: ordreSuivant(modeles) } }]); setOuvert(id); }}>
        <Icone nom="plus" />Nouveau modèle
      </button>
      {ouvert && d.Modeles[ouvert] && <EditeurModele id={ouvert} onFermer={() => setOuvert(null)} />}
    </section>
  );
}

/**
 * Formulaire guidé d'un modèle : des étapes, et dans chacune des sous-étapes avec leur durée.
 * Enregistré au format texte de « Coller une liste » (partageable), à la fermeture.
 */
function EditeurModele({ id, onFermer }: { id: string; onFermer: () => void }) {
  const m = donnees.value.Modeles[id];
  const [nom, setNom] = useState(m.nom);
  const [etapes, setEtapes] = useState<PisteTexte[]>(() => {
    const lues = texteVersModele(m.contenu ?? '');
    return lues.length ? lues : [{ nom: '', etapes: [] }];
  });
  const [partage, setPartage] = useState(false);
  const contenu = modeleVersTexte(etapes);

  const enregistrer = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    if (nom.trim() !== m.nom || contenu !== m.contenu) faire([{ table: 'Modeles', id, champs: { nom: nom.trim() || m.nom, contenu } }]);
    onFermer();
  };
  const changerEtape = (i: number, e: PisteTexte) => setEtapes(etapes.map((x, k) => (k === i ? e : x)));
  const deplacer = <T,>(l: T[], i: number, sens: -1 | 1): T[] => { const c = [...l]; [c[i], c[i + sens]] = [c[i + sens], c[i]]; return c; };

  return (
    <Feuille titre="Modèle" large onFermer={enregistrer} pied={<>
      <button class="bouton danger" onClick={() => { faire(supprimer('Modeles', id), `Modèle « ${m.nom} » supprimé`); onFermer(); }}>Supprimer</button>
      <button class="bouton principal" onClick={enregistrer}>Terminé</button>
    </>}>
      <Champ label="Nom du modèle"><input value={nom} onInput={e => setNom((e.target as HTMLInputElement).value)} /></Champ>

      {etapes.map((et, i) => (
        <fieldset class="modele-etape">
          <legend class="modele-etape-tete">
            <input class="modele-etape-nom" value={et.nom} aria-label={`Nom de l'étape ${i + 1}`}
              placeholder={etapes.length === 1 ? 'Étape (nom facultatif)' : `Étape ${i + 1}`}
              onInput={e => changerEtape(i, { ...et, nom: (e.target as HTMLInputElement).value })} />
            {etapes.length > 1 && <>
              <button type="button" class="bouton-icone petit" disabled={i === 0} aria-label="Monter l'étape" onClick={() => setEtapes(deplacer(etapes, i, -1))}><Icone nom="haut" taille={16} /></button>
              <button type="button" class="bouton-icone petit" disabled={i === etapes.length - 1} aria-label="Descendre l'étape" onClick={() => setEtapes(deplacer(etapes, i, 1))}><Icone nom="bas" taille={16} /></button>
              <button type="button" class="bouton-icone petit" aria-label="Supprimer l'étape" onClick={() => setEtapes(etapes.filter((_, k) => k !== i))}><Icone nom="poubelle" taille={16} /></button>
            </>}
          </legend>
          <ul class="modele-sous-etapes">
            {et.etapes.map((se, k) => (
              <li>
                <input value={se.titre} aria-label={`Sous-étape ${k + 1}`}
                  onInput={e => changerEtape(i, { ...et, etapes: et.etapes.map((x, n) => (n === k ? { ...x, titre: (e.target as HTMLInputElement).value } : x)) })} />
                <select class="choix-duree" value={se.duree} aria-label={`Durée de la sous-étape ${k + 1}`}
                  onChange={e => changerEtape(i, { ...et, etapes: et.etapes.map((x, n) => (n === k ? { ...x, duree: (e.target as HTMLSelectElement).value as Duree } : x)) })}>
                  {NOMS_DUREES.map(dn => <option value={dn}>{dn} ({DUREES[dn]})</option>)}
                </select>
                <button type="button" class="bouton-icone petit" disabled={k === 0} aria-label="Monter" onClick={() => changerEtape(i, { ...et, etapes: deplacer(et.etapes, k, -1) })}><Icone nom="haut" taille={16} /></button>
                <button type="button" class="bouton-icone petit" disabled={k === et.etapes.length - 1} aria-label="Descendre" onClick={() => changerEtape(i, { ...et, etapes: deplacer(et.etapes, k, 1) })}><Icone nom="bas" taille={16} /></button>
                <button type="button" class="bouton-icone petit" aria-label="Supprimer la sous-étape" onClick={() => changerEtape(i, { ...et, etapes: et.etapes.filter((_, n) => n !== k) })}><Icone nom="croix" taille={16} /></button>
              </li>
            ))}
          </ul>
          <form class="ajout-etape" onSubmit={e => {
            e.preventDefault();
            const champ = (e.target as HTMLFormElement).elements.namedItem('titre') as HTMLInputElement;
            if (!champ.value.trim()) return;
            changerEtape(i, { ...et, etapes: [...et.etapes, { titre: champ.value.trim(), duree: 'normal' }] });
            champ.value = '';
          }}>
            <Icone nom="plus" taille={16} />
            <input name="titre" placeholder="Ajouter une sous-étape" aria-label={`Ajouter une sous-étape à l'étape ${i + 1}`} />
          </form>
        </fieldset>
      ))}
      <button type="button" class="bouton" onClick={() => setEtapes([...etapes, { nom: '', etapes: [] }])}><Icone nom="plus" />Ajouter une étape</button>

      <details class="partage-modele" open={partage} onToggle={e => setPartage((e.target as HTMLDetailsElement).open)}>
        <summary>Partager ou importer en texte</summary>
        <p class="petit-texte">Copie ce texte pour partager le modèle ; colle ici le texte d'un modèle reçu pour le reprendre.</p>
        <textarea class="zone-collage" rows={6} value={contenu}
          onChange={e => { const lues = texteVersModele((e.target as HTMLTextAreaElement).value); if (lues.length) setEtapes(lues); }} />
      </details>
    </Feuille>
  );
}

const TITRES: Partial<Record<NomTable, string>> = {
  Costumes: 'Costume', Pieces: 'Pièce', Pistes: 'Étape', Etapes: 'Sous-étape', Fournitures: 'Fourniture', Fournisseurs: 'Fournisseur',
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
      <p class="petit-texte">Ce qui a été supprimé reste restaurable. Restaurer un costume ramène aussi ses pièces, étapes et sous-étapes.</p>
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
      <ImportSauvegarde />
    </section>
  );
}

/**
 * Réimporte un fichier exporté : fusion ligne par ligne, la plus récente gagne. Ce qui a été saisi
 * depuis l'export est conservé ; les lignes absentes de la sauvegarde ne sont jamais supprimées.
 */
function ImportSauvegarde() {
  const [bilan, setBilan] = useState<{ ajouts: number; majs: number; ignorees: number; changements: number } | null>(null);
  const [erreur, setErreur] = useState('');
  const lire = async (f: File | undefined) => {
    setErreur(''); setBilan(null);
    if (!f) return;
    try {
      const lu = JSON.parse(await f.text());
      if (lu?.format !== 'cosplay-planner-sauvegarde' || !lu.donnees) throw new Error('Ce fichier n’est pas une sauvegarde Cosplay Planner.');
      const { changements, bilan: b } = changementsImport(donnees.value, lu.donnees);
      if (!changements.length) { setErreur('Rien à importer : tes données sont déjà à jour.'); return; }
      faire(changements, `${changements.length} ligne${changements.length > 1 ? 's' : ''} importée${changements.length > 1 ? 's' : ''}`);
      setBilan({ ...b, changements: changements.length });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Fichier illisible.');
    }
  };
  return (
    <>
      <label class="bouton">
        <Icone nom="coller" />Importer une sauvegarde
        <input type="file" accept="application/json,.json" class="cache" onChange={e => { const i = e.target as HTMLInputElement; void lire(i.files?.[0]); i.value = ''; }} />
      </label>
      <p class="petit-texte">La fusion se fait ligne par ligne : la version la plus récente gagne, et rien n’est supprimé.</p>
      {bilan && <p class="petit-texte">{bilan.ajouts} ajoutée{bilan.ajouts > 1 ? 's' : ''} · {bilan.majs} mise{bilan.majs > 1 ? 's' : ''} à jour · {bilan.ignorees} déjà à jour.</p>}
      {erreur && <p class="erreur">{erreur}</p>}
    </>
  );
}
