import type Sortable from 'sortablejs';

/** Sortable déplace le DOM lui-même ; on le remet en place et on laisse Preact redessiner depuis les données. */
export function annulerDeplacementDom(evt: Sortable.SortableEvent): void {
  const { item, from, oldIndex } = evt;
  // Les frères de l'élément, sans lui, sont dans l'ordre d'origine : on le remet à son ancien rang.
  const reste = [...from.children].filter(c => c !== item);
  from.insertBefore(item, reste[oldIndex!] ?? null);
}
