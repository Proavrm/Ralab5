# RaLab5

Système de gestion pour laboratoire géotechnique NGE.

**RaLab5** est la migration React de RaLab4 — même backend FastAPI, nouveau frontend React.

---

## Stack

| Couche | Technologie |
|---|---|
| Backend | FastAPI + SQLite |
| Frontend | React 18 + Vite |
| State / Data | TanStack Query v5 |
| UI Components | shadcn/ui + Tailwind CSS |
| Routing | React Router v6 |
| Auth | JWT (localStorage `ralab_token`) |

---

## Structure

```
RaLab5/
├── backend/
│   └── current_fastapi/     ← API FastAPI (inchangée depuis RaLab4)
├── frontend/
│   ├── react/               ← Nouveau frontend React (RaLab5)
│   └── legacy_html/         ← Pages HTML (référence — ne pas modifier)
├── storage/
│   ├── documents/           ← Fichiers de travail
│   └── references/          ← Fichiers de référence
├── docs/                    ← Documentation
├── scripts/                 ← Scripts Windows (.ps1)
└── CONTEXT.md               ← Contexte complet du projet (lire en premier)
```

---

## Démarrage rapide

### Backend
```bash
cd backend/current_fastapi
python -m venv .venv
.venv\Scripts\activate       # Windows
pip install -r requirements.txt
uvicorn api_main:app --reload --port 8000
```

Option auth JWT:
`RALAB_JWT_SECRET` peut être défini dans l'environnement pour remplacer le secret dev par défaut. Pour `HS256`, la clé doit faire au moins 32 octets.

Dossiers:
- dans le flux moderne actuel, la creation physique des dossiers ne part pas des demandes
- la responsabilite metier de creation/synchronisation vit cote affaires
- le nom automatique du dossier principal affaire suit la forme `reference - affaire_nge/ou numero_etude/ou autre_reference - chantier - client_site`
- `autre_reference` se renseigne manuellement dans l'UI quand l'affaire n'a ni numero d'affaire NGE ni numero d'etude
- pour `client_site`, le suffixe devient `client_site` si les deux existent, sinon seulement la valeur disponible
- les cas specifiques de dossiers pilotes par demandes seront traites plus tard, explicitement

Conséquence pratique:
- `RALAB_DOSSIER_MODE=pending` sur le PC perso, le poste de code ou l'instance distante
- `RALAB_DOSSIER_MODE=local` sur le PC de travail quand la bibliotheque OneDrive / SharePoint est synchronisee
- `RALAB_AFFAIRES_ROOT=<chemin-local-vers-le-dossier-des-affaires>` pour definir explicitement la racine locale des dossiers d'affaires
- `demandes_rst` ne cree pas de dossier physique par defaut
- les endpoints legacy de dossier sur `/api/demandes/...` restent presents mais neutralises pour eviter les casses

### Frontend React
```bash
cd frontend/react
npm install
npm run dev
```

API disponible sur `http://127.0.0.1:8000`
Frontend sur `http://localhost:5173`
Docs API sur `http://127.0.0.1:8000/docs`

Important:
- `uvicorn` lance le backend FastAPI sur le port `8000` et sert aussi le frontend React deja build dans `frontend/react/dist`
- `vite` sur `5173` sert uniquement au developpement React avec hot reload; il n'est pas utilise par Cloudflare ni par le serveur public
- `cloudflared` ne lance pas RaLab5: il expose simplement `127.0.0.1:8000` sur une URL HTTPS publique

En pratique:
- usage le plus simple hors VS Code: double-clic sur `RaLab5.cmd`, puis choisir Local ou Cloudflare
- après le choix Local ou Cloudflare, le launcher peut aussi ouvrir automatiquement le navigateur sur la bonne URL
- usage local simple: `launch_ralab5_test.cmd`
- usage public via Cloudflare: `launch_ralab5_cloudflare.cmd`
- developpement frontend: `uvicorn` + `npm run dev`, puis ouvrir `http://localhost:5173`

### Test sur un autre PC
Le mode le plus simple pour tester RaLab5 sur un autre poste Windows est désormais:

```bat
launch_ralab5_test.cmd
```

Ce lanceur:
- compile le frontend React si `npm` est disponible
- réutilise le build existant si `npm` n'est pas installé
- crée un environnement Python backend si nécessaire
- démarre FastAPI sur `0.0.0.0:8000`

Ensuite:
- sur le PC qui lance RaLab5: ouvrir `http://localhost:8000`
- depuis un autre PC du même réseau: ouvrir `http://<ip-du-pc-hote>:8000`

Remarques:
- si Windows Firewall bloque l'accès, autoriser le port `8000`
- l'API reste disponible sur `/api/*`
- le statut backend reste disponible sur `http://127.0.0.1:8000/api/status`

### Déploiement sur un serveur
Si Clara n'est pas sur le même réseau, le bon modèle est de publier RaLab5 sur un serveur et de lui donner uniquement une URL web.

Pour un serveur Windows derrière un reverse proxy:

```bat
launch_ralab5_server.cmd
```

Ce mode:
- écoute en local sur `127.0.0.1:8000` pour être placé derrière Caddy, Nginx ou un tunnel HTTP
- active les `proxy headers` côté Uvicorn
- garde le frontend React servi par FastAPI

Variables d'environnement à définir avant exposition internet:
- `RALAB_AUTH_MODE=proxy`
- `RALAB_JWT_SECRET=<secret-fort-et-privé>`
- `RALAB_ALLOWED_HOSTS=ralab.votre-domaine.tld`
- `RALAB_ALLOWED_ORIGINS=https://ralab.votre-domaine.tld`

Important:
- le mode historique sans mot de passe (`RALAB_AUTH_MODE=passwordless`) ne doit pas être exposé sur internet
- en mode `proxy`, RaLab5 n'accepte plus l'annuaire public ni la saisie libre d'identifiant sur la page de connexion
- RaLab5 attend qu'un proxy d'authentification fournisse l'identité utilisateur via un header tel que `Cf-Access-Authenticated-User-Email`, `X-Forwarded-Email` ou `X-Auth-Request-Email`
- pour Cloudflare Access, le header par défaut est déjà supporté

Architecture recommandée:
- navigateur Clara -> domaine HTTPS protégé par le proxy d'accès
- reverse proxy / access proxy -> `127.0.0.1:8000`
- FastAPI sert l'API et le frontend React sur le même hôte

Pour un demarrage simple sur le PC actuel avec Cloudflare deja configure:

```bat
launch_ralab5_cloudflare.cmd
```

Ce lanceur:
- demarre RaLab5 en mode serveur local sur `127.0.0.1:8000` si besoin
- demarre le tunnel Cloudflare si besoin
- peut ouvrir automatiquement le navigateur sur l'URL publique
- affiche l'URL locale et l'URL publique attendue

Mises a jour en mode service / autostart:
- `cloudflared` peut tourner comme vrai service Windows; il n'a pas besoin d'etre mis a jour pour chaque changement applicatif, seulement si sa configuration tunnel change
- le backend RaLab5 doit etre relance apres les changements de code pour charger la nouvelle version
- si le frontend React change, il faut reconstruire `frontend/react/dist` avant de relancer le backend
- en pratique: changement de code = redeployer les fichiers, rebuild si besoin, puis redemarrer seulement le backend; le tunnel Cloudflare peut rester tel quel

Recommandation la plus simple pour démarrer:
- serveur Windows
- Cloudflare Tunnel + Cloudflare Access
- méthode d'authentification Cloudflare Access: One-Time PIN par email
- guide exact: `docs/HANDOFF_DEPLOY_CLOUDFLARE_WINDOWS.txt`
- exemple de config tunnel: `docs/cloudflared_ralab5_example.yml`

Si tu n'as pas Cloudflare:
- option la plus simple sans domaine public: Tailscale
- contrainte: Clara doit installer le client Tailscale sur son PC
- guide exact: `docs/HANDOFF_DEPLOY_TAILSCALE_WINDOWS.txt`
- lanceur dédié: `launch_ralab5_tailscale.cmd`

Si le PC de l'entreprise bloque VPN / Tailscale:
- option de secours la plus simple: tunnel web temporaire + clé d'accès
- pas d'installation sur le PC de Clara, seulement un navigateur
- guide exact: `docs/HANDOFF_PUBLIC_TEST_NO_VPN.txt`
- lanceur dédié: `launch_ralab5_public_test.cmd`

### Package rebuild 2025-2026

Pour regénérer le package de revue du rebuild 2025-2026:

```bat
build_ralab_rebuilt_2025_2026_package.cmd
```

Ce lanceur:
- repart de `backend/current_fastapi/data/ralab_rebuilt_2025_2026_v1.db`
- recrée `ralab_rebuilt_2025_2026_pack_v1/`
- exporte `prelevements.csv`, `interventions_reelles.csv` et `review_required_items.csv`
- régénère `SUMMARY_REBUILD.txt` et `README_PACKAGE.txt`
- recrée et valide `ralab_rebuilt_2025_2026_pack_v1.zip`

### Package base reconciliee _cfe

Pour regénérer le package de la base reconciliee la plus recente avec materialisation CFE:

```bat
build_ralab3_reconciled_20260408_cfe_package.cmd
```

Ce lanceur:
- repart de `backend/current_fastapi/data/ralab3_reconciled_20260408_cfe.db`
- recrée `ralab3_reconciled_20260408_cfe_pack_v1/`
- exporte `prelevements.csv`, `interventions_reelles.csv` et `review_required_items.csv`
- recopie `ralab3_reconciled_20260408_cfe.report.json` et `ralab3_reconciled_20260408_cfe.report.md`
- régénère `SUMMARY_RECONCILED.txt` et `README_PACKAGE.txt`
- recrée et valide `ralab3_reconciled_20260408_cfe_pack_v1.zip`

---

## Pour reprendre le développement

**Lire `CONTEXT.md` en premier** — il contient tout l'historique, les décisions d'architecture, le backlog et les instructions pour continuer avec n'importe quelle IA.

---

## Historique des versions

| Version | Description |
|---|---|
| RaLab2 | Desktop PySide6 — abandonné |
| RaLab3 | FastAPI + HTML pur — base opérationnelle |
| RaLab4 | FastAPI + HTML pur — nouvelles features (passation, import historique, etc.) |
| **RaLab5** | FastAPI + **React** — migration frontend, même backend |
