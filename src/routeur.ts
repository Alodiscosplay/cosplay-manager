// Navigation par le « # » de l'URL : marche sur GitHub Pages sans configuration serveur.
import { signal } from '@preact/signals';

function lire(): string[] {
  return decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
}

export const route = signal<string[]>(lire());
window.addEventListener('hashchange', () => { route.value = lire(); window.scrollTo(0, 0); });

export function aller(chemin: string): void {
  location.hash = chemin.startsWith('/') ? chemin : `/${chemin}`;
}

export const lienCostume = (id: string, onglet?: string) => `#/costume/${id}${onglet ? `/${onglet}` : ''}`;
