# BilPow — Bilan de Puissance

Application de bureau pour ingénieurs électriciens : gestion des bilans de puissance de tableaux électriques.

## Stack

- **Electron** + **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** · **Zustand** · **SQLite** (better-sqlite3)
- **ExcelJS** pour l'export Excel

## Prérequis

- [Node.js](https://nodejs.org/) 18 ou supérieur
- Windows 10/11 (build cible principal)
- Outils de build natifs pour `better-sqlite3` :
  ```bash
  npm install --global windows-build-tools
  ```
  Ou installez [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) avec « Développement Desktop en C++ ».

## Installation

```bash
cd BP
npm install
```

## Développement

Lance Vite (interface React) et Electron en parallèle :

```bash
npm run dev
```

Raccourcis utiles :
- `Ctrl+N` — Nouveau projet
- `Ctrl+S` — Sauvegarde (auto-save actif sur les éléments)
- `Ctrl+E` — Exporter la localisation (vue localisation)
- `Échap` — Fermer une modale

## Build production

```bash
npm run build      # Compile Electron + React
npm run dist:win   # Génère l'installateur .exe (dossier release/)
```

## Structure

```
electron/          # Process principal, SQLite, export Excel
src/               # Interface React
shared/            # Types TypeScript partagés
public/            # Icône SVG
```

## Base de données

Fichier SQLite stocké dans le dossier utilisateur :
`%APPDATA%/bilpow/bilpow.db`

Les tables sont créées automatiquement au premier lancement. Quatre favoris par défaut sont insérés si la table est vide.

## Fonctionnalités

- Projets → Localisations → Tableaux → Éléments (éclairage / prises)
- Calculs : puissance totale, chute de tension, intensité, disjoncteur recommandé
- Favoris réutilisables avec auto-complétion
- Export Excel par localisation (feuille SYNTHESE + une feuille par tableau)
- Mode sombre, glisser-déposer pour réordonner les éléments
- Menu contextuel (renommer, dupliquer, supprimer) dans la barre latérale

## Licence

MIT
