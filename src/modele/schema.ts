// Schéma des données : un onglet du Google Sheet par table, une colonne par champ.
// Les colonnes sont lues par NOM d'en-tête, jamais par position : on peut
// réordonner ou ajouter des colonnes à la main dans le Sheet sans rien casser.

export const VERSION_SCHEMA = 1;

export const TABLES = {
  Costumes: ['nom', 'personnage', 'oeuvre', 'statut', 'attend_costume_id', 'debut', 'deadline', 'evenement_id',
    'suivi_budget', 'budget_prevu', 'image_ref', 'cadrage', 'notes', 'ordre', 'archive_le', 'resume_archive', 'vignette'],
  Evenements: ['nom', 'date_debut', 'date_fin', 'lieu', 'notes'],
  Pieces: ['costume_id', 'nom', 'statut', 'debut', 'deadline', 'attend', 'patron', 'notes', 'ordre'],
  Pistes: ['piece_id', 'nom', 'active', 'libre', 'debut', 'deadline', 'attend', 'ordre'],
  Etapes: ['piste_id', 'piece_id', 'titre', 'detail', 'duree', 'poids', 'attend', 'fait', 'fait_le',
    'date_prevue', 'deadline', 'ordre', 'urgent'],
  Taches: ['titre', 'costume_id', 'date', 'fait', 'fait_le', 'ordre', 'urgent'],
  Fournisseurs: ['nom', 'url', 'type', 'frais_port', 'franco', 'notes'],
  Fournitures: ['costume_id', 'piece_id', 'libelle', 'quantite', 'unite', 'prix_unitaire', 'fournisseur_id',
    'statut', 'commande_id', 'lien'],
  Commandes: ['fournisseur_id', 'statut', 'date', 'frais_port', 'notes'],
  Photos: ['costume_id', 'piece_id', 'piste_id', 'etape_id', 'drive_id', 'legende', 'date', 'dans_wip'],
  Modeles: ['nom', 'contenu'],
} as const;

export type NomTable = keyof typeof TABLES;

/**
 * Titre de l'onglet dans le Sheet. Dans l'appli, une « piste » (code) s'appelle une « étape » et une
 * « étape » (code) une « sous-étape » : les onglets suivent le vocabulaire affiché.
 */
export const ONGLET: Record<NomTable, string> = {
  Costumes: 'Costumes', Evenements: 'Evenements', Pieces: 'Pieces', Pistes: 'Etapes', Etapes: 'Sous-etapes',
  Taches: 'Taches', Fournisseurs: 'Fournisseurs', Fournitures: 'Fournitures', Commandes: 'Commandes', Photos: 'Photos', Modeles: 'Modeles',
};
export const NOMS_TABLES = Object.keys(TABLES) as NomTable[];

/** Colonnes communes à toutes les tables. */
export const COLONNES_COMMUNES = { debut: ['id'], fin: ['maj', 'supprime'] } as const;

export function entetes(table: NomTable): string[] {
  return [...COLONNES_COMMUNES.debut, ...TABLES[table], ...COLONNES_COMMUNES.fin];
}

/** Une ligne telle qu'elle vit dans le Sheet : que du texte. */
export type Ligne = { id: string; maj: string; supprime: string; [champ: string]: string };

export type Donnees = Record<NomTable, Record<string, Ligne>>;

export function donneesVides(): Donnees {
  const d = {} as Donnees;
  for (const t of NOMS_TABLES) d[t] = {};
  return d;
}

// ---------- Valeurs énumérées ----------

export const STATUTS_COSTUME = ['projet', 'en attente', 'en cours', 'en pause', 'terminé', 'archivé'] as const;
// « à venir » n'existe plus (redondant avec « en pause ») ; une ancienne valeur « à venir » se lit « en pause ».
export const STATUTS_PIECE = ['en cours', 'en pause', 'terminée'] as const;
export const STATUTS_FOURNITURE = ['à acheter', 'commandé', 'reçu', 'déjà là'] as const;
export const STATUTS_COMMANDE = ['à passer', 'passée', 'reçue'] as const;

/** Durée → poids. Plus le poids est grand, plus l'étape compte dans le %. */
export const DUREES = { 'rapide': 1, 'normal': 2, 'long': 4, 'très long': 8 } as const;
export type Duree = keyof typeof DUREES;
export const NOMS_DUREES = Object.keys(DUREES) as Duree[];

// ---------- Lecture typée des champs texte ----------

export const OUI = 'oui';
export function bool(v: string | undefined): boolean {
  const s = (v ?? '').trim().toLowerCase();
  return s === 'oui' || s === 'true' || s === 'vrai' || s === '1' || s === 'x';
}
export function txtBool(b: boolean): string { return b ? OUI : ''; }

export function num(v: string | undefined, defaut = 0): number {
  if (v == null) return defaut;
  const s = String(v).replace(/\s|€/g, '').replace(',', '.');
  if (s === '') return defaut;
  const n = Number(s);
  return Number.isFinite(n) ? n : defaut;
}

export function liste(v: string | undefined): string[] {
  return (v ?? '').split(',').map(s => s.trim()).filter(Boolean);
}
export function txtListe(ids: string[]): string { return ids.join(','); }

/** Ni supprimée (« oui », corbeille) ni purgée (« purge », après archivage ou création annulée). */
export function vivant(l: Ligne | undefined): l is Ligne {
  return !!l && !bool(l.supprime) && l.supprime !== 'purge';
}
