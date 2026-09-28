// Choix d'un dossier du Drive par le « Google Picker ».
// Avec la portée `drive.file`, un dossier choisi ici devient accessible à l'appli — lui seul — sans
// demander l'accès à tout le Drive. Il faut en plus une clé d'API et le numéro du projet Google Cloud.

const CLE_API: string = import.meta.env.VITE_GOOGLE_API_KEY ?? '';
const NUMERO_PROJET: string = import.meta.env.VITE_GOOGLE_APP_ID ?? '';

export const pickerConfigure = () => !!CLE_API && !!NUMERO_PROJET;

export interface DossierDrive { id: string; nom: string }

/* Types minimaux de l'API Picker (chargée à la demande). */
interface Constructeur {
  addView(v: unknown): Constructeur; setOAuthToken(t: string): Constructeur; setDeveloperKey(k: string): Constructeur;
  setAppId(id: string): Constructeur; setTitle(t: string): Constructeur; setLocale(l: string): Constructeur;
  setCallback(cb: (r: Record<string, unknown>) => void): Constructeur; build(): { setVisible(v: boolean): void };
}
interface ApiPicker {
  PickerBuilder: new () => Constructeur;
  DocsView: new (vue: string) => { setIncludeFolders(v: boolean): unknown; setSelectFolderEnabled(v: boolean): unknown; setMimeTypes(m: string): unknown };
  ViewId: { FOLDERS: string };
  Action: { PICKED: string; CANCEL: string };
  Response: { ACTION: string; DOCUMENTS: string };
  Document: { ID: string; NAME: string };
}
declare global {
  interface Window { gapi?: { load(nom: string, ok: () => void): void } }
}

let chargement: Promise<ApiPicker> | null = null;
function chargerPicker(): Promise<ApiPicker> {
  chargement ??= new Promise((ok, ko) => {
    const pret = () => window.gapi!.load('picker', () => ok((window as unknown as { google: { picker: ApiPicker } }).google.picker));
    if (window.gapi) { pret(); return; }
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.async = true;
    s.onload = pret;
    s.onerror = () => { chargement = null; ko(new Error('Impossible de joindre Google')); };
    document.head.appendChild(s);
  });
  return chargement;
}

/** Ouvre le sélecteur de dossiers ; renvoie le dossier choisi, ou null si on annule. */
export async function choisirDossier(jeton: string): Promise<DossierDrive | null> {
  const p = await chargerPicker();
  return new Promise(ok => {
    const vue = new p.DocsView(p.ViewId.FOLDERS);
    vue.setIncludeFolders(true);
    vue.setSelectFolderEnabled(true);
    vue.setMimeTypes('application/vnd.google-apps.folder');
    new p.PickerBuilder()
      .addView(vue)
      .setOAuthToken(jeton)
      .setDeveloperKey(CLE_API)
      .setAppId(NUMERO_PROJET)
      .setLocale('fr')
      .setTitle('Dossier où envoyer les photos')
      .setCallback(r => {
        if (r[p.Response.ACTION] === p.Action.PICKED) {
          const doc = (r[p.Response.DOCUMENTS] as Record<string, string>[])[0];
          ok({ id: doc[p.Document.ID], nom: doc[p.Document.NAME] });
        } else if (r[p.Response.ACTION] === p.Action.CANCEL) ok(null);
      })
      .build()
      .setVisible(true);
  });
}
