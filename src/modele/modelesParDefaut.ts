// Modèles de pistes livrés avec l'appli. Chacun les modifie, les supprime ou en ajoute dans Réglages.
// Format : celui de « Coller une liste » (une étape par ligne, durée facultative entre parenthèses).

export const MODELES_PAR_DEFAUT: { nom: string; contenu: string }[] = [
  {
    nom: 'Impression 3D',
    contenu: ['Modéliser (long)', 'Imprimer (long)', 'Poncer (long)', 'Sous-coucher', 'Peindre (long)', 'Vernir', 'Assembler'].join('\n'),
  },
  {
    nom: 'Perruque',
    contenu: ['Vérifier la perruque (casque sous la perruque si besoin)', 'Couper', 'Coiffer (long)'].join('\n'),
  },
  {
    nom: 'Moulage résine',
    contenu: ['Sculpter ou préparer le modèle (long)', 'Faire le moule silicone', 'Couler la résine', 'Démouler et poncer', 'Peindre'].join('\n'),
  },
  {
    nom: 'Couture de base',
    contenu: ['Patronner (long)', 'Toile et essayage (long)', 'Couper le tissu', 'Assembler (long)', 'Finitions'].join('\n'),
  },
];
