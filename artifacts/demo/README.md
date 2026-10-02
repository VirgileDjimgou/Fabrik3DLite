# Fabrik3D — Démonstration complète

Démonstration réelle du système complet (orchestrateur + MongoDB + simulateur + HMI), capturée
avec Playwright contre les serveurs en fonctionnement. Toutes les captures proviennent de
l'application réellement exécutée, aucune maquette.

> **Revision 3 (S64) — jeu curaté.** Le dossier [`flagship/`](flagship/README.md) contient un petit
> ensemble de captures à jour (cellule CNC héro, quatre cellules de scénario, HMI, Job Composer,
> pendant robot, fault lab, time travel) qui **remplace** ces captures pour la présentation produit.
> Le reste de ce dossier (galerie du 27/09/2026) reste conservé comme preuve historique ; les
> captures de scénario antérieures à S58 ne reflètent plus le runtime 3D actuel.

## Serveurs utilisés (toujours actifs)

| Composant | URL |
|---|---|
| Orchestrateur (Swagger) | http://127.0.0.1:7249/swagger |
| Simulateur (Vue 3 + Three.js) | http://127.0.0.1:4173 |
| HMI opérateur / instructeur | http://127.0.0.1:5274 |
| MongoDB 7 (Docker `fabrik3d-s49-mongo`) | mongodb://localhost:27017 |

Identités de développement disponibles via `POST /api/auth/dev-token`
(rôles : Learner, Instructor, Engineer, Operator, Administrator).

## Contenu

- `index.html` — galerie navigable (images + vidéos), à ouvrir dans un navigateur :
  `artifacts/demo/index.html`
- `client/shots/` — 25 captures du simulateur et de l'orchestrateur
- `client/videos/` — 8 vidéos courtes (webm) du simulateur / scénarios / studio / time travel / auth
- `hmi/shots/`, `hmi/videos/` — 4 captures et 3 vidéos du HMI (connexion, poste opérateur, instructeur)
- `logs/` — journaux de démarrage du serveur et des serveurs de prévisualisation

## Fonctionnalités couvertes

Simulateur 3D (S39), scénarios pédagogiques, inspecteur de signaux (S31), studio de mapping (S37),
laboratoire de fautes (S38), historien (S40) et time travel déterministe (S41), catalogue robots /
éditeur de cellule / préréglages, authentification RBAC (S42), orchestrateur (Swagger, santé,
version, diagnostics S48–S49), HMI opérateur et tableau de bord instructeur (S45).

## Reproduction

```powershell
# Backend
dotnet build Fabrik3D/Fabrik3D.slnx
$env:ASPNETCORE_ENVIRONMENT='Development'
dotnet run --project Fabrik3D/Fabrik3D.Server/Fabrik3D.ServerTaskManager.csproj --no-build --no-launch-profile --urls http://127.0.0.1:7249

# Frontends (URL API embarquée à la compilation)
$env:VITE_ORCHESTRATOR_URL='http://127.0.0.1:7249'
npm --prefix Fabrik3D/fabrik3d.client run build-only
npm --prefix Fabrik3D/fabrik3d.hmi run build
npm --prefix Fabrik3D/fabrik3d.client run preview -- --host 127.0.0.1 --port 4173 --strictPort
npm --prefix Fabrik3D/fabrik3d.hmi run preview -- --host 127.0.0.1 --port 5274 --strictPort

# Captures
cd Fabrik3D/fabrik3d.client; npx playwright test --config=playwright.demo.config.ts --workers=1
cd Fabrik3D/fabrik3d.hmi;    npx playwright test --config=playwright.demo.config.ts --workers=1
```

Les vidéos sont au format WebM (lecture navigateur ; Chrome/Edge/Firefox). La galerie
`index.html` les lit directement.
