// Aide aux tests : construire des données à la main, lisiblement.
import { donneesVides, type Donnees } from '../src/modele/schema';
import { appliquerChangements, type Changement } from '../src/store/operations';

export function appliquer(d: Donnees, ch: Changement[]): Donnees {
  return appliquerChangements(d, ch, '2026-01-01T00:00:00Z');
}

export function vide(): Donnees { return donneesVides(); }

/** Crée un costume + une pièce + des pistes nommées avec leurs étapes (poids donnés). */
export function construire(spec: {
  costume?: Record<string, string>;
  pieces: { nom: string; statut?: string; champs?: Record<string, string>; pistes: { nom: string; active?: boolean; champs?: Record<string, string>; etapes: (string | [string, number, boolean?])[] }[] }[];
}): { d: Donnees; ids: Record<string, string> } {
  const d = donneesVides();
  const ids: Record<string, string> = {};
  const cid = 'C';
  d.Costumes[cid] = { id: cid, maj: '', supprime: '', nom: 'Costume', statut: 'en cours', ordre: '1', ...spec.costume };
  ids.costume = cid;
  spec.pieces.forEach((p, i) => {
    const pid = `P${i}`;
    ids[p.nom] = pid;
    d.Pieces[pid] = { id: pid, maj: '', supprime: '', costume_id: cid, nom: p.nom, statut: p.statut ?? 'en cours', ordre: String(i + 1), ...p.champs };
    p.pistes.forEach((pi, j) => {
      const tid = `${pid}T${j}`;
      ids[`${p.nom}/${pi.nom}`] = tid;
      d.Pistes[tid] = { id: tid, maj: '', supprime: '', piece_id: pid, nom: pi.nom, active: pi.active === false ? '' : 'oui', ordre: String(j + 1), ...pi.champs };
      pi.etapes.forEach((e, k) => {
        const [titre, poids, fait] = typeof e === 'string' ? [e, 1, false] : e;
        const eid = `${tid}E${k}`;
        ids[`${p.nom}/${pi.nom}/${titre}`] = eid;
        d.Etapes[eid] = { id: eid, maj: '', supprime: '', piste_id: tid, piece_id: pid, titre, poids: String(poids), fait: fait ? 'oui' : '', ordre: String(k + 1) };
      });
    });
  });
  return { d, ids };
}
