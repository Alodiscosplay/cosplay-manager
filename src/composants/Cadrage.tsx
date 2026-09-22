// Recadrage de l'image de référence : on fait glisser l'image dans son cadre et on zoome.
// Stocké en texte « x;y;zoom » (x, y en % = point de l'image gardé au centre du cadrage).
import { useRef, useState } from 'preact/hooks';
import { Feuille, PhotoImg } from './base';

export interface Cadrage { x: number; y: number; z: number }

export function lireCadrage(s?: string): Cadrage {
  const [x, y, z] = (s ?? '').split(';').map(Number);
  const borne = (v: number) => Math.min(100, Math.max(0, v));
  return { x: Number.isFinite(x) ? borne(x) : 50, y: Number.isFinite(y) ? borne(y) : 50, z: Number.isFinite(z) && z >= 1 ? z : 1 };
}

export const txtCadrage = (c: Cadrage) => `${Math.round(c.x)};${Math.round(c.y)};${c.z.toFixed(2)}`;

export function styleCadrage(c: Cadrage): Record<string, string | undefined> {
  return {
    objectPosition: `${c.x}% ${c.y}%`,
    transformOrigin: `${c.x}% ${c.y}%`,
    transform: c.z > 1 ? `scale(${c.z})` : undefined,
  };
}

/** Image de référence affichée avec son cadrage. */
export function ImageCadree({ id, cadrage, alt }: { id: string; cadrage?: string; alt: string }) {
  return <PhotoImg id={id} alt={alt} style={styleCadrage(lireCadrage(cadrage))} />;
}

export function EditeurCadrage({ id, cadrage, onValider, onFermer }: { id: string; cadrage?: string; onValider: (c: string) => void; onFermer: () => void }) {
  const [c, setC] = useState(lireCadrage(cadrage));
  const cadre = useRef<HTMLDivElement>(null);
  const glisse = useRef<{ x: number; y: number; depart: Cadrage } | null>(null);

  /**
   * Déplacement du doigt (dx, dy en px) → variation de x, y (%) pour que l'image suive le doigt.
   * Avec object-fit: cover et un zoom z centré sur (x, y), l'image se décale de
   * (z·débord + (z−1)·taille du cadre) × Δ% / 100.
   */
  const deplacer = (dx: number, dy: number, depart: Cadrage) => {
    const el = cadre.current;
    const img = el?.querySelector('img');
    if (!el || !img || !img.naturalWidth) return;
    const w = el.clientWidth, h = el.clientHeight;
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const debX = img.naturalWidth * s - w, debY = img.naturalHeight * s - h;
    const kx = depart.z * debX + (depart.z - 1) * w, ky = depart.z * debY + (depart.z - 1) * h;
    const borne = (v: number) => Math.min(100, Math.max(0, v));
    setC({ ...depart, x: kx > 0.5 ? borne(depart.x - (100 * dx) / kx) : depart.x, y: ky > 0.5 ? borne(depart.y - (100 * dy) / ky) : depart.y });
  };

  return (
    <Feuille titre="Recadrer l'image" onFermer={onFermer} pied={<>
      <button class="bouton" onClick={() => setC({ x: 50, y: 50, z: 1 })}>Centrer</button>
      <button class="bouton principal" onClick={() => { onValider(txtCadrage(c)); onFermer(); }}>Enregistrer</button>
    </>}>
      <p class="petit-texte">Fais glisser l'image pour choisir ce qui reste visible ; le curseur zoome.</p>
      <div class="cadre-recadrage" ref={cadre}
        onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); glisse.current = { x: e.clientX, y: e.clientY, depart: c }; }}
        onPointerMove={e => { const g = glisse.current; if (g) deplacer(e.clientX - g.x, e.clientY - g.y, g.depart); }}
        onPointerUp={() => { glisse.current = null; }}
        onPointerCancel={() => { glisse.current = null; }}
        onWheel={e => { e.preventDefault(); setC(v => ({ ...v, z: Math.min(4, Math.max(1, v.z - e.deltaY / 500)) })); }}>
        <PhotoImg id={id} alt="Image de référence" style={styleCadrage(c)} />
      </div>
      <label class="champ">
        <span class="champ-label">Zoom</span>
        <input type="range" min="1" max="4" step="0.05" value={c.z} aria-label="Zoom"
          onInput={e => setC({ ...c, z: Number((e.target as HTMLInputElement).value) })} />
      </label>
    </Feuille>
  );
}
