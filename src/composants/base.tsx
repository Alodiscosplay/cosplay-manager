// Petits composants partagés.
import { type ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icone } from './Icone';
import { type Avancement, formatPct } from '../logique/avancement';
import { chargerPhoto, urlConnue, photosChargees } from '../store/photos';
import { lireJourSaisi, jourSaisi } from '../logique/dates';

/** Case ronde au trait : un rond plein se lirait comme « déjà coché ». */
export function Case({ coche, onChange, label, disabled }: { coche: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" class={`case${coche ? ' coche' : ''}`} role="checkbox" aria-checked={coche} aria-label={label}
      disabled={disabled} onClick={e => { e.stopPropagation(); onChange(!coche); }}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
  );
}

export function Barre({ a, fine }: { a: Avancement; fine?: boolean }) {
  return (
    <div class={`barre${fine ? ' fine' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={a.pct ?? undefined} aria-label={`Avancement ${formatPct(a)}`}>
      <div style={{ width: `${a.pct ?? 0}%` }} class={a.pct === 100 ? 'plein' : ''} />
    </div>
  );
}

export function Pct({ a }: { a: Avancement }) {
  return <span class={`pct${a.pct === 100 ? ' fini' : ''}`}>{formatPct(a)}</span>;
}

export function Puce({ children, ton = 'neutre', titre }: { children: ComponentChildren; ton?: 'neutre' | 'accent' | 'rouge' | 'orange' | 'vert' | 'gris'; titre?: string }) {
  return <span class={`puce ${ton}`} title={titre}>{children}</span>;
}

/** Feuille modale (en bas sur mobile, centrée sur ordinateur). Se ferme avec Échap ou en touchant le fond. */
export function Feuille({ titre, onFermer, children, pied, large }: { titre: string; onFermer: () => void; children: ComponentChildren; pied?: ComponentChildren; large?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Ne fermer que si l'appui ET le relâchement ont lieu sur le fond : sélectionner du texte
  // en glissant hors de la fenêtre ne doit pas la fermer.
  const appuiSurFond = useRef(false);
  // Avant de fermer, on valide le champ en cours de saisie (les champs n'enregistrent qu'à la sortie).
  // Toujours la dernière version de onFermer (l'écouteur d'Échap est posé une seule fois).
  const derniereFermeture = useRef(onFermer);
  derniereFermeture.current = onFermer;
  const fermer = () => { (document.activeElement as HTMLElement | null)?.blur(); derniereFermeture.current(); };
  /**
   * Entrée dans un champ d'une ligne : on valide le champ (les champs n'enregistrent qu'à la sortie),
   * puis on appuie sur le bouton principal du pied — « Terminé », « Créer », « Ajouter ».
   * Les zones de texte, les formulaires internes et les boutons gardent leur comportement.
   */
  const entree = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    const cible = e.target as HTMLElement;
    if (cible.tagName !== 'INPUT') return;
    const type = (cible as HTMLInputElement).type;
    if (['checkbox', 'radio', 'file', 'button', 'submit', 'reset'].includes(type)) return;
    if (cible.closest('form')) return;
    const principal = ref.current?.querySelector<HTMLButtonElement>('.feuille-pied .bouton.principal');
    if (!principal || principal.disabled) return;
    e.preventDefault();
    cible.blur();
    setTimeout(() => principal.click(), 0);
  };
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    const echap = (e: Event) => { e.preventDefault(); fermer(); };
    d.addEventListener('cancel', echap);
    return () => d.removeEventListener('cancel', echap);
  }, []);
  return (
    <dialog ref={ref} class={`feuille${large ? ' large' : ''}`} onKeyDown={entree} onMouseDown={e => { appuiSurFond.current = e.target === ref.current; }}
      onClick={e => { if (e.target === ref.current && appuiSurFond.current) fermer(); appuiSurFond.current = false; }} aria-label={titre}>
      <div class="feuille-corps">
        <header class="feuille-tete">
          <h2>{titre}</h2>
          <button class="bouton-icone" onClick={fermer} aria-label="Fermer"><Icone nom="croix" /></button>
        </header>
        <div class="feuille-contenu">{children}</div>
        {pied && <footer class="feuille-pied">{pied}</footer>}
      </div>
    </dialog>
  );
}

export function Champ({ label, children, aide }: { label: string; children: ComponentChildren; aide?: string }) {
  return (
    <label class="champ">
      <span class="champ-label">{label}</span>
      {children}
      {aide && <span class="champ-aide">{aide}</span>}
    </label>
  );
}

/** Champ texte qui n'enregistre qu'à la sortie (pas une écriture par touche). */
export function Texte({ valeur, onValider, placeholder, multiligne, type = 'text', autoFocus, class: cls }: {
  valeur: string; onValider: (v: string) => void; placeholder?: string; multiligne?: boolean; type?: string; autoFocus?: boolean; class?: string;
}) {
  const [v, setV] = useState(valeur);
  useEffect(() => setV(valeur), [valeur]);
  const valider = () => { if (v !== valeur) onValider(v.trim()); };
  const props = {
    value: v, placeholder, autoFocus, class: cls,
    onInput: (e: Event) => setV((e.target as HTMLInputElement).value),
    onBlur: valider,
  };
  return multiligne
    ? <textarea {...props} rows={3} />
    : <input {...props} type={type} inputMode={type === 'number' ? 'decimal' : undefined}
        onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

/**
 * Date facultative : on la TAPE (« 03/11/2026 », « 3/11/26 »…) ou on la choisit au calendrier (icône).
 * `min` : date plancher (ex. le « Du » d'un « Au ») — le calendrier s'ouvre dessus, une date antérieure est refusée.
 */
export function ChoixDate({ valeur, onChange, label, min }: { valeur: string; onChange: (v: string) => void; label: string; min?: string }) {
  const [texte, setTexte] = useState(jourSaisi(valeur));
  const [erreur, setErreur] = useState('');
  const calendrier = useRef<HTMLInputElement>(null);
  useEffect(() => { setTexte(jourSaisi(valeur)); setErreur(''); }, [valeur]);

  const valider = (brut: string) => {
    if (!brut.trim()) { setErreur(''); if (valeur) onChange(''); return; }
    const j = lireJourSaisi(brut);
    if (!j) { setErreur('Date non reconnue (jj/mm/aaaa)'); return; }
    if (min && j < min) { setErreur(`Pas avant le ${jourSaisi(min)}`); return; }
    setErreur('');
    setTexte(jourSaisi(j));
    if (j !== valeur) onChange(j);
  };
  const ouvrirCalendrier = () => {
    const c = calendrier.current;
    if (!c) return;
    // Sans date, le calendrier s'ouvre sur la date plancher (le « Du »).
    c.value = valeur || min || '';
    try { c.showPicker(); } catch { c.focus(); c.click(); }
  };

  return (
    <div class="choix-date">
      <div class={`champ-date${erreur ? ' invalide' : ''}`}>
        <input type="text" inputMode="numeric" value={texte} placeholder="jj/mm/aaaa" aria-label={label} aria-invalid={!!erreur}
          onInput={e => setTexte((e.target as HTMLInputElement).value)}
          onBlur={e => valider((e.target as HTMLInputElement).value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); valider((e.target as HTMLInputElement).value); } }} />
        {/* Hors de l'ordre de tabulation : Tab passe d'une date à la suivante (« Du » → « Au »). */}
        <button type="button" class="bouton-icone petit" tabIndex={-1} aria-label={`Choisir ${label} dans le calendrier`} onClick={ouvrirCalendrier}><Icone nom="agenda" taille={16} /></button>
        <input ref={calendrier} type="date" class="calendrier-cache" tabIndex={-1} aria-hidden="true" min={min || undefined}
          onChange={e => { const v = (e.target as HTMLInputElement).value; if (v) valider(v); }} />
      </div>
      {valeur && <button type="button" class="bouton-icone petit" tabIndex={-1} aria-label={`Effacer ${label}`} onClick={() => { setTexte(''); setErreur(''); onChange(''); }}><Icone nom="croix" taille={16} /></button>}
      {erreur && <span class="erreur-date" role="alert">{erreur}</span>}
    </div>
  );
}

export function Selection<T extends string>({ valeur, options, onChange, label }: { valeur: T; options: readonly (T | [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <select value={valeur} aria-label={label} onChange={e => onChange((e.target as HTMLSelectElement).value as T)}>
      {options.map(o => (Array.isArray(o) ? <option value={o[0]}>{o[1]}</option> : <option value={o}>{o}</option>))}
    </select>
  );
}

/** Image d'une photo (locale ou Drive), chargée à la demande. */
export function PhotoImg({ id, alt, class: cls, style }: { id: string; alt: string; class?: string; style?: Record<string, string | undefined> }) {
  const [url, setUrl] = useState(urlConnue(id));
  void photosChargees.value;
  useEffect(() => {
    let vivant = true;
    if (!id) { setUrl(undefined); return; }
    const connue = urlConnue(id);
    if (connue) { setUrl(connue); return; }
    chargerPhoto(id).then(u => { if (vivant && u) setUrl(u); });
    return () => { vivant = false; };
  }, [id, photosChargees.value]);
  if (!url) return <div class={`photo-vide ${cls ?? ''}`} aria-label={alt}><Icone nom="photo" taille={28} /></div>;
  return <img src={url} alt={alt} class={cls} style={style} loading="lazy" draggable={false} />;
}

export function Vide({ icone, titre, children }: { icone: string; titre: string; children?: ComponentChildren }) {
  return (
    <div class="vide">
      <Icone nom={icone} taille={36} />
      <p class="vide-titre">{titre}</p>
      {children && <div class="vide-texte">{children}</div>}
    </div>
  );
}

/** Menu « … » : une liste d'actions dans une petite feuille. */
export function Menu({ actions, label = 'Plus d\'actions' }: { actions: ({ texte: string; icone?: string; danger?: boolean; faire: () => void } | false | null | undefined)[]; label?: string }) {
  const [ouvert, setOuvert] = useState(false);
  const liste = actions.filter(Boolean) as { texte: string; icone?: string; danger?: boolean; faire: () => void }[];
  return (
    <>
      <button class="bouton-icone" aria-label={label} onClick={e => { e.stopPropagation(); setOuvert(true); }}><Icone nom="menu" /></button>
      {ouvert && (
        <Feuille titre={label} onFermer={() => setOuvert(false)}>
          <div class="menu-liste">
            {liste.map(a => (
              <button class={`menu-action${a.danger ? ' danger' : ''}`} onClick={() => { setOuvert(false); a.faire(); }}>
                {a.icone && <Icone nom={a.icone} />}<span>{a.texte}</span>
              </button>
            ))}
          </div>
        </Feuille>
      )}
    </>
  );
}

/** Demande de confirmation avant une action irréversible. */
export function Confirmer({ titre, texte, bouton, danger, onOui, onNon }: { titre: string; texte: ComponentChildren; bouton: string; danger?: boolean; onOui: () => void; onNon: () => void }) {
  return (
    <Feuille titre={titre} onFermer={onNon} pied={<>
      <button class="bouton" onClick={onNon}>Annuler</button>
      <button class={`bouton ${danger ? 'danger' : 'principal'}`} onClick={onOui}>{bouton}</button>
    </>}>
      <div class="texte-confirmation">{texte}</div>
    </Feuille>
  );
}

export function telechargerBlob(blob: Blob, nom: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

export function nomFichier(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'costume';
}
