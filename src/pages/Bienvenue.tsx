import { useState } from 'preact/hooks';
import { demarrer } from '../store/store';
import { connecter, googleConfigure } from '../sync/google';

export function Bienvenue() {
  const [erreur, setErreur] = useState('');
  const [attente, setAttente] = useState(false);

  const google = async () => {
    setErreur(''); setAttente(true);
    try { await connecter(true); await demarrer('google'); }
    catch (e) { setErreur((e as Error).message); }
    finally { setAttente(false); }
  };

  return (
    <div class="bienvenue">
      <div class="bienvenue-carte">
        <div class="bienvenue-logo" aria-hidden="true">✂</div>
        <h1>Cosplay Planner</h1>
        <p class="bienvenue-accroche">Planifier et suivre ses cosplays, pièce par pièce, étape par étape.</p>
        <ul class="bienvenue-points">
          <li>Chaque costume détaillé en pièces, chaque pièce en étapes à cocher, avec le % d'avancement.</li>
          <li>« À faire » : seulement ce sur quoi tu travailles, dans le bon ordre.</li>
          <li>Une liste d'achats commune à tous tes costumes, et des commandes groupées.</li>
          <li>Agenda, dossier WIP en diaporama, archivage des costumes finis.</li>
        </ul>
        {googleConfigure() ? (
          <>
            <button class="bouton principal grand" onClick={google} disabled={attente}>
              {attente ? 'Connexion…' : 'Se connecter avec Google'}
            </button>
            <p class="petit-texte">
              Tes données vont dans <strong>ton</strong> Google Drive, dans un Sheet créé pour l'appli.
              L'appli ne voit que les fichiers qu'elle a créés elle-même.
            </p>
          </>
        ) : (
          <p class="petit-texte">La connexion Google n'est pas encore configurée sur cette version : seul le mode démo est disponible.</p>
        )}
        {erreur && <p class="erreur" role="alert">{erreur}</p>}
        <button class="bouton" onClick={() => demarrer('demo')}>Essayer en mode démo</button>
        <p class="petit-texte">Le mode démo garde tout sur cet appareil, sans compte.</p>
      </div>
    </div>
  );
}
