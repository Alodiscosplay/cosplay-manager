# Cosplay Planner

Planifier et suivre la création de ses cosplays, pièce par pièce, étape par étape. Sur ordinateur et téléphone, synchronisé par le compte Google de chacun.

## Ce que fait l'appli

- **Costumes → pièces → pistes → étapes à cocher.** Une pièce a une ou plusieurs *pistes* qui avancent en parallèle (ex. « Tissu » et « Bijoux ») ; dans une piste, les étapes se suivent. Une piste peut en *attendre* d'autres (« Montage » attend « Tissu » et « Bijoux »), ou attendre d'autres pièces.
- **% pondéré** : chaque étape a une durée (rapide 1, normal 2, long 4, très long 8, ou un poids libre). % = poids coché ÷ poids total. Plus une étape est longue, plus elle compte.
- **À faire** : l'étape suivante de chaque piste active, dans les pièces *en cours* des costumes *en cours*, plus des tâches libres. Tout ce qui est écarté (pièces à venir, pistes en pause, costumes en attente…) reste listé dans « Pas dans la liste ».
- **Dates facultatives partout.** Une date de début fait passer la pièce (ou le costume) *en cours* tout seul le jour venu. « Répartir » planifie les étapes jusqu'à une deadline, au prorata des durées. Agenda mois/semaine, vue Planning pièces × semaines, alertes de retard.
- **Coller une liste** (`## Pièce`, `### Piste`, une étape par ligne, `(long)` en fin de ligne) et **modèles de pistes** (Impression 3D, Perruque…) : pas besoin d'IA pour tout saisir vite.
- **Achats** : liste de courses commune à tous les costumes, groupée par fournisseur ; une commande peut regrouper les fournitures de plusieurs costumes. Budget facultatif par costume.
- **Photos d'avancement** → **dossier WIP** en PowerPoint (ou Google Slides), généré dans le navigateur.
- **Archiver** un costume terminé : un ZIP sur l'ordinateur (données réimportables, fiche HTML lisible, photos), puis les photos quittent le Drive. Réimportable.
- **Mode démo** sans compte, pour essayer.

## Où sont les données

Chaque utilisateur a ses données **dans son propre Google Drive** : un dossier « Cosplay Planner » avec un Sheet (un onglet par table, lisible et modifiable à la main) et un sous-dossier Photos. L'appli demande seulement la portée `drive.file` : elle ne voit que les fichiers qu'elle a créés. Une copie de travail reste sur l'appareil (IndexedDB), donc l'appli marche hors ligne et envoie les modifications au retour du réseau.

Règles de synchro : le Sheet fait foi ; une modification locale pas encore envoyée gagne si elle est plus récente (colonne `maj`). On ne supprime jamais de ligne dans le Sheet (colonne `supprime`), pour que les numéros de ligne restent stables. **Ne pas renommer les en-têtes ni la colonne `id`.**

## Développer

```bash
npm install
npm run dev        # http://localhost:5173 — ajouter ?demo pour le mode démo
npm test           # tests de la logique (Vitest)
npm run build      # vérifie les types puis construit dist/
```

Code : `src/logique/` (règles métier pures, testées), `src/store/` (état, opérations, photos), `src/sync/` (Google : connexion, Drive, Sheets, fusion), `src/pages/`, `src/export/` (dossier WIP, archive).

## Mise en ligne (une fois)

1. **Google Cloud Console**, avec le compte Google qui « possède » l'appli :
   - créer un projet ; activer **Google Drive API** et **Google Sheets API** ;
   - écran de consentement OAuth : type *Externe*, portée `.../auth/drive.file` (+ `openid`, `email`, `profile`), puis **Publier l'application** (en mode test, 100 utilisateurs max et reconnexion tous les 7 jours) ;
   - Identifiants → *ID client OAuth* → type *Application Web*, **origine JavaScript autorisée** : `https://<compte>.github.io` (et `http://localhost:5173` pour le dev).
2. **GitHub** : pousser ce dépôt (public pour Pages gratuit), puis
   - Settings → Pages → Source : *GitHub Actions* ;
   - Settings → Secrets and variables → Actions → *Variables* : `VITE_GOOGLE_CLIENT_ID` = l'ID client (ce n'est pas un secret).
3. Chaque push sur `main` construit et publie le site (`.github/workflows/deploiement.yml`).

En local, copier `.env.example` en `.env.local` et y mettre l'ID client pour tester la connexion Google.

## Installer sur le téléphone

Ouvrir le site dans Chrome → menu ⋮ → *Ajouter à l'écran d'accueil*. L'appli s'ouvre alors en plein écran, comme une appli.
