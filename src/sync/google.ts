// Connexion Google (Google Identity Services, modèle « jeton »).
// Deux portées, toutes deux « non sensibles » pour Google :
//  - `drive.appdata` : l'espace caché réservé à l'appli, où vivent ses données ;
//  - `drive.file` : les seuls fichiers que l'appli a créés (copies de photos, exports) ou que l'utilisatrice
//    lui a montrés (le dossier choisi pour les photos). Pas d'accès au reste du Drive.

export const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const PORTEES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file openid email profile';
const CLE_JETON = 'cosplay-planner.jeton';

export class ErreurConnexion extends Error { constructor(m = 'Connexion Google à renouveler') { super(m); } }
export class ErreurReseau extends Error { constructor(m = 'Pas de réseau') { super(m); } }
/** Le fichier demandé n'existe pas (ou plus). */
export class ErreurIntrouvable extends Error { constructor(m = 'Fichier introuvable') { super(m); } }

interface Jeton { access_token: string; expire: number; email?: string }

/* Types minimaux de GIS */
interface ReponseJeton { access_token?: string; expires_in?: number; error?: string }
interface ClientJeton { requestAccessToken(o?: { prompt?: string; login_hint?: string }): void; callback: (r: ReponseJeton) => void }
declare global {
  interface Window {
    google?: { accounts: { oauth2: {
      initTokenClient(c: { client_id: string; scope: string; callback: (r: ReponseJeton) => void; error_callback?: (e: { type: string }) => void }): ClientJeton;
      revoke(token: string, cb?: () => void): void;
    } } };
  }
}

export const googleConfigure = () => !!CLIENT_ID;

let chargement: Promise<void> | null = null;
function chargerGis(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  chargement ??= new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => { chargement = null; ko(new ErreurReseau('Impossible de joindre Google')); };
    document.head.appendChild(s);
  });
  return chargement;
}

function lireJeton(): Jeton | null {
  try {
    const j = JSON.parse(localStorage.getItem(CLE_JETON) ?? 'null') as Jeton | null;
    return j && j.expire > Date.now() + 60_000 ? j : null;
  } catch { return null; }
}

export function emailConnu(): string | undefined {
  try { return (JSON.parse(localStorage.getItem(CLE_JETON) ?? 'null') as Jeton | null)?.email; } catch { return undefined; }
}

export const jetonValide = () => !!lireJeton();

/**
 * Demande un jeton. `interactif` = appelé depuis un clic (la fenêtre Google peut s'ouvrir).
 * Hors clic, les navigateurs bloquent souvent la fenêtre : on renvoie alors une ErreurConnexion
 * et l'appli propose un bouton « Se reconnecter ».
 */
export async function connecter(interactif: boolean): Promise<string> {
  const actuel = lireJeton();
  if (actuel) return actuel.access_token;
  if (!CLIENT_ID) throw new ErreurConnexion("L'appli n'est pas configurée pour Google (ID client manquant)");
  await chargerGis();
  const email = emailConnu();
  const jeton = await new Promise<ReponseJeton>((ok, ko) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: PORTEES,
      callback: ok,
      error_callback: e => ko(new ErreurConnexion(e.type === 'popup_closed' ? 'Connexion annulée' : 'Connexion Google impossible')),
    });
    client.requestAccessToken({ prompt: interactif && !email ? 'consent' : '', login_hint: email });
  });
  if (!jeton.access_token) throw new ErreurConnexion(jeton.error || 'Connexion refusée');
  const j: Jeton = { access_token: jeton.access_token, expire: Date.now() + (jeton.expires_in ?? 3600) * 1000, email };
  if (!j.email) {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${j.access_token}` } });
    if (r.ok) j.email = (await r.json()).email;
  }
  localStorage.setItem(CLE_JETON, JSON.stringify(j));
  return j.access_token;
}

export function deconnecter(): void {
  const j = lireJeton();
  if (j && window.google?.accounts) window.google.accounts.oauth2.revoke(j.access_token);
  localStorage.removeItem(CLE_JETON);
}

/** fetch authentifié. Ne déclenche jamais de fenêtre : sans jeton valide → ErreurConnexion. */
export async function gfetch(url: string, init: RequestInit = {}): Promise<Response> {
  const j = lireJeton();
  if (!j) throw new ErreurConnexion();
  if (!navigator.onLine) throw new ErreurReseau();
  let r: Response;
  try {
    r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${j.access_token}` } });
  } catch {
    throw new ErreurReseau();
  }
  if (r.status === 401) { localStorage.removeItem(CLE_JETON); throw new ErreurConnexion(); }
  if (r.status === 404) throw new ErreurIntrouvable();
  if (!r.ok) {
    let msg = `${r.status}`;
    try { msg = (await r.json()).error?.message ?? msg; } catch { /* corps non JSON */ }
    throw new Error(`Google : ${msg}`);
  }
  return r;
}

export async function gjson<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  if (typeof init.body === 'string') init = { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } };
  return (await gfetch(url, init)).json();
}
