# Cosplay Manager

Planifier et suivre la création de ses cosplays, pièce par pièce, étape par étape. Sur ordinateur et téléphone, synchronisé par le compte Google de chacun.

## Ce que fait l'appli

- **Costumes → pièces → étapes → sous-étapes à cocher.** Une pièce a une ou plusieurs *étapes* qui avancent en parallèle (ex. « Doublure », « Tripliure », « Broderie ») ; dans une étape, les sous-étapes se suivent (« dans l'ordre ») ou sont toutes faisables à la fois (« libre »). Une étape peut en *attendre* d'autres (« Montage du corset » attend « Doublure » et « Tripliure »), attendre d'autres pièces, et une sous-étape peut attendre une sous-étape précise (« Couper le satin » attend « Vérifier le patron »).
- **% pondéré** : chaque sous-étape a une durée (rapide 1, normal 2, long 4, très long 8, ou un poids libre). % = poids coché ÷ poids total. Plus une sous-étape est longue, plus elle compte.
- **À faire** : la sous-étape suivante de chaque étape active, dans les pièces *en cours* des costumes *en cours*, plus des tâches libres. Tout ce qui est écarté (pièces en pause, étapes en pause, costumes en attente…) reste listé dans « Pas dans la liste ».
- **Dates facultatives partout.** Une date de début fait passer la pièce (ou le costume) *en cours* tout seul le jour venu. « Répartir » planifie les sous-étapes jusqu'à une deadline, au prorata des durées. Agenda mois/semaine, vue Planning pièces × semaines, alertes de retard.
- **Coller une liste** (`## Pièce`, `### Étape`, une sous-étape par ligne, `(long)` en fin de ligne) et **modèles d'étapes** (Impression 3D, Perruque…) : pas besoin d'IA pour tout saisir vite.
- **Achats** : liste de courses commune à tous les costumes, groupée par fournisseur ; une commande peut regrouper les fournitures de plusieurs costumes. Budget facultatif par costume.
- **Photos d'avancement** → **dossier WIP** en PowerPoint (ou Google Slides), généré dans le navigateur.
- **Archiver** un costume terminé : un ZIP sur l'ordinateur (données réimportables, fiche HTML lisible, photos), puis les photos quittent le Drive. Réimportable.
- **Mode démo** sans compte, pour essayer.

## Où sont les données

Chaque utilisatrice a ses données **dans son propre Google Drive**, dans un fichier `donnees.json` rangé dans l'**espace caché réservé à l'appli** (portée `drive.appdata`) : invisible dans le Drive, inaccessible aux autres applis. Une copie complète reste sur chaque appareil (IndexedDB) : l'appli marche hors ligne et envoie les modifications au retour du réseau.

Les **photos** restent sur l'appareil. Une copie peut partir sur le Drive (Réglages › Photos), dans un dossier « Cosplay Manager / Photos » créé pour l'occasion et rangé par costume, puis Références / WIP, puis pièce (un costume ou une pièce renommés, une photo changée de pièce : le Drive suit). Ce dossier se renomme depuis l'appli et déplacer dans le Drive : l'appli le retrouve par un marqueur, pas par son nom (portée `drive.file` : l'appli ne voit que les fichiers qu'elle a créés). Le Google Picker a été écarté : sa fenêtre dépend des cookies tiers et du compte Google par défaut du navigateur, elle restait vide sous Brave avec plusieurs comptes ouverts.

Règles de synchro (`src/sync/fusion.ts`) : ligne par ligne, la version la plus récente (champ `maj`) gagne. **Rien ne disparaît par la synchro** : une suppression vide la ligne et la marque `purge`, et se propage comme une modification ; une ligne qui n'existe que sur un appareil repart vers le fichier. Si le fichier est perdu, il se reconstruit depuis n'importe quel appareil. Avant d'écrire, l'appli vérifie que personne n'a écrit entre-temps, sinon elle refusionne.

## Développer

```bash
npm install
npm run dev        # http://localhost:5173 — ajouter ?demo pour le mode démo
npm test           # tests de la logique (Vitest)
npm run build      # vérifie les types puis construit dist/
```

Dans le code, une étape s'appelle encore « piste » (`Pistes`) et une sous-étape « étape » (`Etapes`).

Code : `src/logique/` (règles métier pures, testées), `src/store/` (état, opérations, photos), `src/sync/` (Google : connexion, Drive, fusion), `src/pages/`, `src/export/` (dossier WIP, archive).

## Mise en ligne (une fois)

1. **Google Cloud Console**, avec le compte Google qui « possède » l'appli :
   - créer un projet ; activer **Google Drive API** ;
   - écran de consentement OAuth : type *Externe*, portées `.../auth/drive.appdata` et `.../auth/drive.file` (+ `openid`, `email`, `profile`), toutes non sensibles, puis **Publier l'application** (en mode test, 100 utilisateurs max) ;
   - Identifiants → *ID client OAuth* → type *Application Web*, **origine JavaScript autorisée** : `https://<compte>.github.io` (et `http://localhost:5173` pour le dev) ;
2. **GitHub** : pousser ce dépôt (public pour Pages gratuit), puis
   - Settings → Pages → Source : *GitHub Actions* ;
   - Settings → Secrets and variables → Actions → *Variables* : `VITE_GOOGLE_CLIENT_ID` (l'ID client, qui n'est pas un secret).
3. Chaque push sur `main` construit et publie le site (`.github/workflows/deploiement.yml`).

En local, copier `.env.example` en `.env.local` et y mettre les mêmes valeurs pour tester la connexion Google.

## Installer sur le téléphone

Ouvrir le site dans Chrome → menu ⋮ → *Ajouter à l'écran d'accueil*. L'appli s'ouvre alors en plein écran, comme une appli.
