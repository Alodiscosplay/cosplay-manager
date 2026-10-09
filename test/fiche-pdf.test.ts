import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { construire } from './aide';
import { fichePdf, propre } from '../src/export/fichePdf';

describe('fiche PDF d’un costume', () => {
  it('produit un PDF lisible, accents compris', async () => {
    const { d, ids } = construire({
      costume: { nom: 'Mary Poppins – Jolly Holiday', personnage: 'Mary', oeuvre: 'Mary Poppins (1964)', notes: 'Chemisier en organza brodé, jupe à volants.', suivi_budget: 'oui' },
      pieces: [
        { nom: 'Chemisier', pistes: [{ nom: 'Tissu', etapes: [['Toile', 2, true], 'Coupe de l’organza', 'Broderie du col'] }, { nom: 'Dentelle', etapes: ['Pose des entre-deux'] }] },
        { nom: 'Jupe', pistes: [{ nom: '', etapes: [['Patronage', 1, true], 'Ourlet roulotté'] }] },
      ],
    });
    d.Etapes[ids['Chemisier/Tissu/Toile']].fait_le = '2026-10-01';
    d.Fournitures.f1 = { id: 'f1', maj: '', supprime: '', costume_id: ids.costume, libelle: 'Organza de soie écrue', quantite: '3', unite: 'm', prix_unitaire: '18,50', statut: 'commandé' };
    const blob = await fichePdf(d, ids.costume, async () => null);
    const octets = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(octets.slice(0, 5))).toBe('%PDF-');
    if (process.env.FICHE_PDF) writeFileSync(process.env.FICHE_PDF, octets);
  });

  it('remplace ce que les polices de base ne savent pas écrire', () => {
    expect(propre('l’œuvre – 12,50\u202f€ ✓')).toBe("l'oeuvre - 12,50 EUR ");
  });
});
