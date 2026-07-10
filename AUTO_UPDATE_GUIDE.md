# Guide de mise à jour automatique pour BilPow

Ce document explique comment configurer et utiliser le système de mise à jour automatique de BilPow.

## Configuration requise

### 1. Configuration GitHub

Avant de pouvoir publier des mises à jour, vous devez configurer les informations de votre dépôt GitHub dans deux fichiers :

#### Fichier `electron-builder.yml`

```yaml
publish:
  provider: github
  owner: YOUR_GITHUB_OWNER    # Remplacez par votre nom d'utilisateur GitHub
  repo: YOUR_GITHUB_REPO      # Remplacez par le nom de votre dépôt
```

#### Fichier `electron/updater/updater.ts`

```typescript
const GITHUB_OWNER = 'YOUR_GITHUB_OWNER';  // Remplacez par votre nom d'utilisateur GitHub
const GITHUB_REPO = 'YOUR_GITHUB_REPO';    // Remplacez par le nom de votre dépôt
```

**Important :** Assurez-vous que les valeurs sont identiques dans les deux fichiers.

### 2. Token GitHub (optionnel mais recommandé)

Pour publier automatiquement les releases sur GitHub, vous pouvez configurer un token GitHub :

1. Allez sur https://github.com/settings/tokens
2. Générez un nouveau Personal Access Token avec les scopes :
   - `repo` (accès complet aux dépôts)
3. Configurez la variable d'environnement :
   ```bash
   # Windows (PowerShell)
   $env:GH_TOKEN="votre_token_ici"
   
   # Windows (CMD)
   set GH_TOKEN=votre_token_ici
   ```

## Workflow de publication

### Étape 1 : Modifier le code

Apportez les modifications souhaitées au code de BilPow.

### Étape 2 : Mettre à jour la version dans `package.json`

```json
{
  "name": "bilpow",
  "version": "2.0.1",  // Incrémentez la version (ex: 2.0.0 -> 2.0.1)
  ...
}
```

**Règles de versionnement :**
- `MAJOR.MINOR.PATCH` (ex: 2.0.0)
- Incrémentez `MAJOR` pour des changements incompatibles
- Incrémentez `MINOR` pour de nouvelles fonctionnalités
- Incrémentez `PATCH` pour des corrections de bugs

### Étape 3 : Construire l'application

```bash
npm run build
```

Cette commande compile le code TypeScript et construit l'application React.

### Étape 4 : Générer l'installateur

```bash
npm run dist
```

Cette commande utilise `electron-builder` pour générer l'installateur Windows (.exe).

Les fichiers générés seront dans le dossier `release/` (configuré dans `electron-builder.yml`).

### Étape 5 : Publier sur GitHub Releases

#### Option A : Publication automatique (avec token GitHub)

Si vous avez configuré la variable d'environnement `GH_TOKEN`, la publication est automatique :

```bash
npm run dist -- -p always
```

Le flag `-p always` force la publication sur GitHub.

#### Option B : Publication manuelle

1. Allez sur la page "Releases" de votre dépôt GitHub
2. Cliquez sur "Create a new release"
3. Entrez le numéro de version (ex: `v2.0.1`)
4. Ajoutez des notes de version (release notes)
5. Attachez le fichier `.exe` généré dans le dossier `release/`
6. Cliquez sur "Publish release"

**Important :** Le tag de la release doit correspondre exactement à la version dans `package.json` (avec ou sans le préfixe `v`).

## Fonctionnement du système de mise à jour

### Côté client

1. **Vérification automatique** : Au démarrage de l'application, une vérification est effectuée automatiquement après 5 secondes.
2. **Téléchargement en arrière-plan** : Si une mise à jour est disponible, elle est téléchargée automatiquement sans intervention de l'utilisateur.
3. **Notification** : Une fois le téléchargement terminé, l'utilisateur est notifié via une interface graphique.
4. **Installation** : L'utilisateur peut choisir d'installer immédiatement ou plus tard.

### Événements IPC

Le système utilise les canaux IPC suivants :

- `update-available` : Une nouvelle version est disponible
- `update-not-available` : Aucune mise à jour disponible
- `update-progress` : Progression du téléchargement (pourcentage, vitesse, taille)
- `update-downloaded` : Le téléchargement est terminé
- `update-error` : Une erreur s'est produite

### Canaux IPC invocables

- `update:checkForUpdates` : Déclencher manuellement une vérification
- `update:installUpdate` : Installer la mise à jour téléchargée
- `update:getCurrentVersion` : Obtenir la version actuelle
- `update:getGitHubConfig` : Obtenir la configuration GitHub

## Architecture des fichiers

```
electron/
├── updater/
│   └── updater.ts          # Module principal de mise à jour
├── main.ts                 # Intégration du updater
└── preload.ts              # Exposition des API de mise à jour

src/
├── components/
│   └── UpdateNotification.tsx  # Interface utilisateur de notification
├── global.d.ts             # Définitions TypeScript
└── App.tsx                 # Intégration du composant de notification

electron-builder.yml        # Configuration de publication
package.json                # Version de l'application
```

## Journalisation

Le système de mise à jour génère des logs explicites dans la console :

- `[AutoUpdater] Configured with GitHub provider` : Configuration réussie
- `[AutoUpdater] Checking for updates...` : Vérification en cours
- `[AutoUpdater] Update available` : Mise à jour disponible
- `[AutoUpdater] Download progress` : Progression du téléchargement
- `[AutoUpdater] Update downloaded` : Téléchargement terminé
- `[AutoUpdater] Update error` : Erreur survenue

## Gestion des erreurs

Le système est conçu pour être robuste :

- **Absence de connexion Internet** : L'erreur est journalisée mais l'application continue de fonctionner normalement.
- **Serveur GitHub inaccessible** : L'erreur est journalisée sans bloquer l'application.
- **Erreur de téléchargement** : L'utilisateur est notifié et peut réessayer plus tard.
- **Erreur de vérification** : L'erreur est journalisée et le système réessaye au prochain démarrage.

## Développement

En mode développement (`NODE_ENV=development`), le système de mise à jour est désactivé automatiquement pour éviter les vérifications inutiles.

Pour tester le système de mise à jour en développement :

1. Commentez temporairement la vérification `NODE_ENV === 'development'` dans `electron/updater/updater.ts`
2. Ou utilisez la commande manuelle via l'interface utilisateur

## Dépendances ajoutées

```json
{
  "dependencies": {
    "electron-updater": "^6.3.0"
  }
}
```

## Fichiers modifiés

1. `package.json` - Ajout de `electron-updater`
2. `electron-builder.yml` - Configuration de publication GitHub
3. `electron/main.ts` - Intégration du updater et handlers IPC
4. `electron/preload.ts` - Exposition des API de mise à jour
5. `electron/updater/updater.ts` - Nouveau module de mise à jour
6. `src/global.d.ts` - Définitions TypeScript pour l'API de mise à jour
7. `src/App.tsx` - Intégration du composant de notification
8. `src/components/UpdateNotification.tsx` - Nouveau composant UI

## Dépannage

### La mise à jour ne se télécharge pas

1. Vérifiez que la configuration GitHub est correcte dans les deux fichiers
2. Vérifiez que la version dans `package.json` est supérieure à la release actuelle
3. Vérifiez que la release GitHub est publiée (pas en draft)
4. Consultez les logs de la console pour les erreurs

### Erreur "Cannot find module 'electron-updater'"

```bash
npm install
```

### Erreur de publication sur GitHub

1. Vérifiez que votre token GitHub a les bons droits
2. Vérifiez que vous avez les droits d'écriture sur le dépôt
3. Utilisez la publication manuelle si nécessaire

## Sécurité

- Le système utilise le protocole HTTPS pour toutes les communications
- Les fichiers sont vérifiés avant installation
- Les mises à jour ne sont installées qu'après confirmation de l'utilisateur
- Le système ne fonctionne pas en mode développement

## Support

En cas de problème, consultez :
1. Les logs de la console Electron
2. Les logs de développement (F12)
3. La documentation officielle de electron-updater : https://www.electron.build/auto-update
