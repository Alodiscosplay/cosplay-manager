import { route } from './routeur';
import { mode, pret, sync, toast, synchroniser, demarrer } from './store/store';
import { connecter, googleConfigure } from './sync/google';
import { Icone } from './composants/Icone';
import { Bienvenue } from './pages/Bienvenue';
import { Accueil } from './pages/Accueil';
import { PageCostume } from './pages/Costume';
import { PageAFaire } from './pages/AFaire';
import { PageAgenda } from './pages/Agenda';
import { PageAchats } from './pages/Achats';
import { PageArchives } from './pages/Archives';
import { PageReglages } from './pages/Reglages';

const NAV = [
  { chemin: '', nom: 'accueil', texte: 'Costumes' },
  { chemin: 'afaire', nom: 'afaire', texte: 'À faire' },
  { chemin: 'agenda', nom: 'agenda', texte: 'Agenda' },
  { chemin: 'achats', nom: 'achats', texte: 'Achats' },
  { chemin: 'reglages', nom: 'reglages', texte: 'Réglages' },
];

export function App() {
  if (!mode.value) return <Bienvenue />;
  if (!pret.value) return <div class="chargement" role="status">Chargement…</div>;

  const [page, ...args] = route.value;
  const actif = page === 'costume' || page === 'archives' ? '' : page ?? '';
  let contenu;
  switch (page) {
    case 'costume': contenu = <PageCostume id={args[0]} onglet={args[1]} />; break;
    case 'afaire': contenu = <PageAFaire />; break;
    case 'agenda': contenu = <PageAgenda />; break;
    case 'achats': contenu = <PageAchats onglet={args[0]} />; break;
    case 'archives': contenu = <PageArchives />; break;
    case 'reglages': contenu = <PageReglages />; break;
    default: contenu = <Accueil />;
  }

  return (
    <div class="coquille">
      <nav class="navigation" aria-label="Navigation principale">
        <div class="marque"><span class="marque-logo" aria-hidden="true">✂</span><span>Cosplay Planner</span></div>
        {NAV.map(n => (
          <a href={`#/${n.chemin}`} class={`nav-lien${actif === n.chemin ? ' actif' : ''}`} aria-current={actif === n.chemin ? 'page' : undefined}>
            <Icone nom={n.nom} /><span>{n.texte}</span>
          </a>
        ))}
      </nav>
      <main class="zone-principale">
        <BandeauSync />
        {contenu}
      </main>
      <ToastZone />
    </div>
  );
}

function BandeauSync() {
  const s = sync.value;
  if (mode.value === 'demo') {
    return <div class="bandeau info">Mode démo : les données restent sur cet appareil.{googleConfigure() && <> <a href="#/reglages">Se connecter avec Google</a></>}</div>;
  }
  if (s.etat === 'reconnexion') {
    return (
      <div class="bandeau alerte" role="alert">
        <span>Connexion Google à renouveler{s.attente ? ` · ${s.attente} modification${s.attente > 1 ? 's' : ''} en attente` : ''}.</span>
        <button class="bouton petit principal" onClick={async () => { try { await connecter(true); await synchroniser(); } catch { /* reste affiché */ } }}>Se reconnecter</button>
      </div>
    );
  }
  if (s.etat === 'erreur') return <div class="bandeau alerte" role="alert">Synchro impossible : {s.message} <button class="bouton petit" onClick={() => synchroniser()}>Réessayer</button></div>;
  if (s.etat === 'hors-ligne' && s.attente) return <div class="bandeau info">Hors ligne · {s.attente} modification{s.attente > 1 ? 's' : ''} enregistrée{s.attente > 1 ? 's' : ''} sur l'appareil, envoi au retour du réseau.</div>;
  return null;
}

export function IndicateurSync() {
  const s = sync.value;
  if (mode.value !== 'google') return null;
  const texte = s.etat === 'envoi' ? 'Synchronisation…' : s.etat === 'ok' ? (s.attente ? `${s.attente} en attente` : 'À jour') : s.etat === 'hors-ligne' ? 'Hors ligne' : s.etat === 'reconnexion' ? 'Reconnexion' : s.etat === 'erreur' ? 'Erreur' : '';
  return (
    <button class={`indicateur-sync ${s.etat}`} onClick={() => synchroniser()} title="Synchroniser maintenant">
      <Icone nom={s.etat === 'hors-ligne' ? 'nuage' : 'sync'} taille={16} /><span>{texte}</span>
    </button>
  );
}

function ToastZone() {
  const t = toast.value;
  if (!t) return null;
  return (
    <div class="toast" role="status" aria-live="polite">
      <span>{t.texte}</span>
      {t.annuler && <button class="bouton petit" onClick={() => { t.annuler!(); toast.value = null; }}>Annuler</button>}
    </div>
  );
}

export { demarrer };
