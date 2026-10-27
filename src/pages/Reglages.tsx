import { useEffect, useState } from 'preact/hooks';
import { donnees, mode, sync, synchroniser, faire, demarrer, quitter, reinitialiserDemo, emplacement, photosSurDrive, reglerPhotosDrive, dossierPhotos, lireNomDossierPhotos, renommerDossierPhotos, recupererPhotosDemo } from '../store/store';
import { photosChargees } from '../store/photos';
import { tous, ordreSuivant } from '../logique/acces';
import { analyserListe, compter, modeleVersTexte, texteVersModele, type PisteTexte } from '../logique/collerListe';
import { DUREES, NOMS_DUREES, type Duree } from '../modele/schema';
import { nouvelId, supprimer, changementsImport } from '../store/operations';
import { connecter, deconnecter, emailConnu, googleConfigure } from '../sync/google';
import { placePhotos, tailleDonnees } from '../sync/drive';
import { Feuille, Champ, Texte, Confirmer, telechargerBlob } from '../composants/base';
import { Icone } from '../composants/Icone';
import { IndicateurSync } from '../app';
import { jourCourt } from '../logique/dates';

export function PageReglages() {
  return (
    <div class="page">
      <header class="page-tete"><h1>Réglages</h1><IndicateurSync /></header>
      <Compte />
      <Identite />
      <Modeles />
      <Sauvegarde />
      <section class="carte-reglage">
        <h2>À propos</h2>
        <p class="petit-texte">Cosplay Manager — tes données restent dans ton propre Google Drive, dans un espace caché réservé à l'appli, ou sur cet appareil en mode démo. Tes photos restent sur l'appareil, avec une copie sur ton Drive si tu le choisis. L'appli n'a accès à aucun autre fichier.</p>
        <p class="petit-texte"><a href={`${import.meta.env.BASE_URL}confidentialite.html`} target="_blank" rel="noopener">Politique de confidentialité</a></p>
      </section>
    </div>
  );
}

/** L'identité de cosplayeur, reprise sur la page d'identité des dossiers WIP. Synchronisée, jamais publiée. */
function Identite() {
  const moi = donnees.value.Profil.moi;
  const m = (champs: Record<string, string>) => faire([{ table: 'Profil', id: 'moi', champs, nouveau: !moi }]);
  return (
    <section class="carte-reglage">
      <h2>Mon identité de cosplayeur</h2>
      <p class="petit-texte">Reprise sur la page d'identité des dossiers WIP, quand tu la demandes. Elle reste dans tes données, sur ton Drive.</p>
      <div class="deux-colonnes">
        <Champ label="Pseudo"><Texte valeur={moi?.pseudo ?? ''} onValider={v => m({ pseudo: v })} /></Champ>
        <Champ label="Pays"><Texte valeur={moi?.pays ?? ''} placeholder="France" onValider={v => m({ pays: v })} /></Champ>
        <Champ label="Prénom"><Texte valeur={moi?.prenom ?? ''} onValider={v => m({ prenom: v })} /></Champ>
        <Champ label="Nom"><Texte valeur={moi?.nom ?? ''} onValider={v => m({ nom: v })} /></Champ>
      </div>
    </section>
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
        <Photos />
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
      </div>
      <p class="petit-texte">Tes données sont rangées dans un espace caché de ton Google Drive, réservé à l'appli : tu ne les vois pas dans ton Drive, et aucune autre appli n'y a accès. Chaque appareil en garde aussi une copie complète.</p>
      <Photos />
      <div class="ligne-actions">
        <button class="bouton" onClick={async () => {
          setPlace('calcul…');
          try {
            const donneesKo = e?.donneesId ? (await tailleDonnees(e.donneesId)) / 1024 : 0;
            const p = await placePhotos();
            setPlace(`données ${donneesKo < 1024 ? `${donneesKo.toFixed(0)} Ko` : `${(donneesKo / 1024).toFixed(1)} Mo`} · ${p.nb} photo${p.nb > 1 ? 's' : ''} copiée${p.nb > 1 ? 's' : ''} · ${(p.octets / 1024 / 1024).toFixed(1)} Mo`);
          } catch (x) { setPlace((x as Error).message); }
        }}>
          Place occupée sur le Drive
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
 * son choix (Drive plein, partage avec d'autres outils, ou simple préférence). Rangé dans « Compte et
 * synchronisation » : sans cette copie, les autres appareils ne voient pas les photos.
 */
function Photos() {
  const d = donnees.value;
  const actif = photosSurDrive.value;
  const dossier = dossierPhotos.value;
  const [erreur, setErreur] = useState('');
  const [renommer, setRenommer] = useState(false);
  useEffect(() => { if (actif) lireNomDossierPhotos().catch(() => { /* hors ligne : on garde le nom connu */ }); }, [actif]);
  const locales = new Set<string>();
  for (const p of Object.values(d.Photos)) if (p.supprime !== 'oui' && p.supprime !== 'purge' && p.drive_id?.startsWith('local:')) locales.add(p.drive_id);
  for (const c of Object.values(d.Costumes)) if (c.image_ref?.startsWith('local:')) locales.add(c.image_ref);
  return (
    <div class="sous-reglage">
      <h3 class="groupe-titre">Photos</h3>
      <p class="petit-texte">Tes photos sont réduites puis gardées <strong>sur cet appareil</strong>. Elles n’occupent pas de place sur ton Drive.</p>
      <label class="interrupteur">
        <input type="checkbox" checked={actif} onChange={e => void reglerPhotosDrive((e.target as HTMLInputElement).checked)} />
        <span>Envoyer aussi une copie sur mon Google Drive</span>
      </label>
      {actif && (
        <>
          <p class="petit-texte">Dossier : <strong>{dossier ?? 'Cosplay Manager'}</strong>{!dossier && ' (créé au premier envoi)'}</p>
          <div class="ligne-actions">
            <button class="bouton" disabled={mode.value !== 'google'} onClick={() => { setErreur(''); setRenommer(true); }}>
              <Icone nom="nuage" />Nommer le dossier…
            </button>
          </div>
          <p class="petit-texte">Un dossier par costume, avec ses photos en Références et WIP (par pièce) et ses Sauvegardes. Tu peux déplacer ce dossier où tu veux dans ton Drive : l’appli le retrouve.</p>
          <p class="petit-texte">Tes autres appareils retrouvent alors les photos. Les photos déjà envoyées restent sur le Drive si tu décoches.</p>
        </>
      )}
      {!actif && <p class="petit-texte">Sans copie, tes autres appareils ne verront pas les photos.</p>}
      {locales.size > 0 && actif && (
        <p class="petit-texte">{locales.size} photo{locales.size > 1 ? 's partiront' : ' partira'} sur le Drive à la prochaine synchro{mode.value !== 'google' ? ' (une fois connecté à Google)' : ''}.</p>
      )}
      {mode.value !== 'google' && <p class="petit-texte">En mode démo, rien n’est envoyé : le réglage prendra effet une fois connecté à Google.</p>}
      {erreur && <p class="erreur">{erreur}</p>}
      {renommer && <NommerDossier nom={dossier ?? ''} onFermer={() => setRenommer(false)} onErreur={setErreur} />}
    </div>
  );
}

function NommerDossier({ nom, onFermer, onErreur }: { nom: string; onFermer: () => void; onErreur: (m: string) => void }) {
  const [v, setV] = useState(nom);
  const [attente, setAttente] = useState(false);
  const valider = async () => {
    const n = v.trim();
    if (!n || n === nom) { onFermer(); return; }
    setAttente(true);
    try { await renommerDossierPhotos(n); } catch (e) { onErreur((e as Error).message); }
    onFermer();
  };
  return (
    <Feuille titre="Dossier sur le Drive" onFermer={onFermer} pied={
      <button class="bouton principal" disabled={attente} onClick={() => void valider()}>{attente ? 'Un instant…' : 'Valider'}</button>
    }>
      <Champ label="Nom du dossier sur ton Drive" aide={nom ? 'Le dossier est renommé, tout son contenu reste dedans.' : 'Le dossier est créé à la racine de ton Drive.'}>
        <input value={v} autoFocus onInput={e => setV((e.target as HTMLInputElement).value)} />
      </Champ>
    </Feuille>
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
      <button class="bouton danger" onClick={() => { faire(supprimer(donnees.value, 'Modeles', id), `Modèle « ${m.nom} » supprimé`); onFermer(); }}>Supprimer</button>
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

function Sauvegarde() {
  return (
    <section class="carte-reglage">
      <h2>Sauvegarde</h2>
      <p class="petit-texte">Un fichier JSON avec toutes tes données (sans les photos), à garder où tu veux : c'est ta sauvegarde personnelle.</p>
      <button class="bouton" onClick={() => {
        const blob = new Blob([JSON.stringify({ format: 'cosplay-planner-sauvegarde', exporte_le: new Date().toISOString(), donnees: donnees.value }, null, 1)], { type: 'application/json' });
        telechargerBlob(blob, `cosplay-manager-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`);
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
  const [photos, setPhotos] = useState(0);
  const [erreur, setErreur] = useState('');
  const lire = async (f: File | undefined) => {
    setErreur(''); setBilan(null); setPhotos(0);
    if (!f) return;
    try {
      const lu = JSON.parse(await f.text());
      if (lu?.format !== 'cosplay-planner-sauvegarde' || !lu.donnees) throw new Error('Ce fichier n’est pas une sauvegarde Cosplay Manager.');
      const { changements, bilan: b } = changementsImport(donnees.value, lu.donnees);
      if (changements.length) {
        faire(changements, `${changements.length} ligne${changements.length > 1 ? 's' : ''} importée${changements.length > 1 ? 's' : ''}`);
        setBilan({ ...b, changements: changements.length });
      }
      const n = await recupererPhotosDemo();
      if (n) { setPhotos(n); photosChargees.value++; }
      if (!changements.length && !n) setErreur('Rien à importer : tes données sont déjà à jour.');
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
      {photos > 0 && <p class="petit-texte">{photos} photo{photos > 1 ? 's' : ''} de la démo récupérée{photos > 1 ? 's' : ''} sur cet appareil.</p>}
      {erreur && <p class="erreur">{erreur}</p>}
    </>
  );
}
