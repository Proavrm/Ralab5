# RaLab5 — Contexte du projet

> **Ce fichier est la source de vérité pour toutes les IAs et sessions.**
> Mettre à jour après chaque session de travail, avant de fermer.
> Version : 2026-07-11

---

## 1. Qui est Marco

Développeur solo d'un système de gestion pour un laboratoire géotechnique NGE
(sols, enrobés, granulats, géotechnique G3).
Travaille avec Claude (Anthropic) et ChatGPT (OpenAI) en parallèle sur le même repo.

---

## 2. Histoire du projet

| Version | Stack | Statut | Notes |
|---|---|---|---|
| RaLab2 | PySide6 (desktop) | Abandonné | Ancien logiciel desktop |
| RaLab3 | FastAPI + SQLite + HTML pur | Opérationnel | Base de référence |
| RaLab4 | FastAPI + SQLite + HTML pur | Référence | Base backend héritée |
| **RaLab5** | **FastAPI + SQLite + React + Vite** | **Opérationnel** | Frontend React, backend FastAPI étendu (G3, sécurité proxy) |

---

## 3. Stack RaLab5 (cible)

```
frontend/
  react/          ← React 18 + Vite + TanStack Query + shadcn/ui
backend/
  current_fastapi/ ← FastAPI Python (inchangé depuis RaLab4)
storage/
  documents/      ← Fichiers Excel, docs
  references/     ← Fichiers de référence affaires/études
```

**Backend** : FastAPI stable, étendu (G3, contacts, feuille mission, middleware auth). Endpoints au §6.
**Frontend** : React opérationnel — la plupart des pages migrées. Legacy HTML en `frontend/legacy_html/` comme référence.
**Docs** : index dans `docs/README.md`, outils CLI dans `docs/TOOLS_INDEX.md`, env dans `.env.example`.

---

## 4. Domaine métier

**Laboratoire géotechnique NGE** — référentiel central (Admin → Laboratoires) :
- Région **ARS** (Auvergne-Rhône-Saône)
- Agences **RA** (Rhône-Ain), **AUV** (Auvergne)
- Labos **SP** (Saint-Priest, RA), **PDC** (Pont-du-Château, AUV)
- Éditable en base — pas de liste figée dans le code

### Flux principal
```
Affaire RST
  └── Passation de chantier
  └── Demande(s) RST
        └── Préparation de la demande (famille technique, modules)
        └── Intervention(s) G3 terrain
              └── Essais terrain (field_tests)
        └── Échantillon(s) labo
              └── Essais labo
        └── Livrables (rapport, PV, note, synthèse)
        └── Devis
        └── Essais externes (sous-traitance)
```

### Conventions de référence
| Objet | Format | Exemple |
|---|---|---|
| Affaire | `YYYY-RA-NNN` | `2026-RA-042` |
| Demande | `YYYY-SP-DNNN` | `2026-SP-D042` |
| Intervention | `YYYY-SP-INNN` | `2026-SP-I001` |
| Mission G3 EXE | `{affaire_ref}-D{numero}-G{NNNN}` | `2025-RA-008-D0054-G0004` |
| Échantillon | `YYYY-SP-ENNN` | `2026-SP-E001` |
| NC interne | `YYYY-RA-NCNNN` | `2026-RA-NC001` |

### Statuts demande
`À qualifier` → `Demande` → `En Cours / En Attente' → `Répondu` → `Fini` → `Envoyé - Perdu`

### Statuts affaire
`À qualifier` → `En cours` → `Terminée` → `Archivée`

---

## 5. Bases de données (SQLite)

> ⚠️ Les fichiers .db ne sont PAS versionnés dans git (dans .gitignore).
> Les données sont locales sur le PC de Marco.

| Fichier | Contenu |
|---|---|
| `ralab3.db` | DB principale — affaires, demandes, interventions, essais, qualité |
| `affaires.db` | Affaires après import historique |
| `etudes.db` | Études de référence |
| `demandes.db` | Legacy RaLab2 (31 demandes) — ne pas modifier |
| `dst.db` | DST importés depuis Excel |
| `security.db` | Utilisateurs / rôles / permissions |
| `reference_sync.db` | Synchronisation sources de référence |

---

## 6. API — endpoints actifs (RaLab5)

```
GET  /                              → status SPA ou JSON
POST /api/auth/login                → JWT (cookie ralab_token + localStorage)
GET  /api/auth/hint                 → Windows USERNAME hint

GET|POST /api/affaires              → affaires RST
GET|PATCH|DELETE /api/affaires/{uid}
GET /api/affaires/{uid}/demandes
GET /api/affaires/next-ref

GET|POST /api/demandes
GET|PATCH|DELETE /api/demandes/{uid}
GET /api/demandes/next-ref
GET /api/demandes/filters

GET|POST /api/demandes_rst          → préparation + config modules
GET /api/demandes_rst/{uid}

GET|POST /api/passations
GET|PATCH|DELETE /api/passations/{uid}

GET|POST /api/interventions
GET|PATCH|DELETE /api/interventions/{uid}
GET|POST /api/intervention-campaigns
GET|POST /api/intervention-requalification

GET|POST /api/essais                → échantillons + essais labo
GET|PATCH|DELETE /api/essais/{uid}

GET /api/planning/demandes
PATCH /api/planning/demandes/{uid}
GET|POST /api/feuille-mission

GET|POST /api/g3/missions           → module G3 EXE (zones, essais, avis, livrables)
GET|PATCH|DELETE /api/g3/missions/{id}
… sous-routes g3 (interventions, zones, tests, hold-points, deliverables, photos)

GET|POST /api/contacts
GET|POST /api/plans-implantation
GET|POST /api/nivellements
GET|POST /api/feuilles-terrain
GET|POST /api/rapports/validation

GET|POST /api/dst
GET /api/dst/search
POST /api/dst/import

GET|POST /api/qualite/…             → équipements, métrologie, procédures, normes, NC

GET|POST /api/admin/users
GET|POST /api/admin/roles

GET /api/reference-sources
GET /api/reference-affaires
GET /api/reference-etudes

POST /api/import-historique-labo    → permission view_tools
POST /api/import-essais-de|sc|pmt
POST /api/audit-post-import
POST /api/regularisation-affaires
POST /api/affaires-manual-correction-simple
```

**Auth middleware** : en mode `proxy` ou `access_key`, JWT requis sur `/api/*` et `/storage/*` (sauf routes publiques auth). Voir `.env.example`.

---

## 7. Pages frontend React (état juillet 2026)

| Zone | Routes principales | Statut |
|---|---|---|
| Auth / Dashboard | `/login`, `/`, dashboards par rôle | ✅ |
| Affaires / Demandes | `/affaires`, `/demandes`, fiches détail | ✅ |
| Passations / Préparation | `/passations`, `/preparation` | ✅ |
| Interventions / Labo | `/interventions`, `/labo`, workbenches essais | ✅ |
| Planning / Campagnes | `/planning`, `/campagnes` | ✅ |
| Qualité / DST / QSSE | `/qualite`, `/dst`, `/qsse` | ✅ |
| Rapports terrain | `/rapports/de`, `/rapports/sc`, PMT, SO, visite… | ✅ |
| Modèles essais | DE, SC, PMT, CFE, MVA, visite chantier | ✅ |
| Plans / Nivellement | plan implantation, images, feuille terrain | ✅ |
| **G3 EXE** | `/g3`, `/g3/missions/:id` (13 onglets) | ✅ |
| Admin / Tools | `/admin`, `/tools` | ✅ partiel |
| Contacts affaire | `/affaires/:uid/contacts` | ✅ |

Legacy HTML : `frontend/legacy_html/` — ne pas modifier.

---

## 8. Fonctionnalités à développer (backlog)

### ✅ Implémenté dans RaLab5
- Tout le périmètre RaLab4 (affaires, demandes, passations, préparation, interventions, essais, planning, qualité, admin)
- Module **G3 EXE** complet (mission → zones → interventions → essais → avis → points d'arrêt → livrables → rapport)
- Contacts affaire, feuille mission journée, plans implantation, nivellements, feuilles terrain
- Import historique labo, import DE/SC/PMT, validation rapports
- Auth middleware (proxy/access_key), cookie JWT + protection `/storage`
- Déploiement Cloudflare documenté (`docs/DEPLOY_CLOUDFLARE_WINDOWS_README.md`)

### 🔲 Backlog restant

| # | Feature | Priorité | Notes |
|---|---|---|---|
| 1 | Guards permissions par route React | 🟠 Haute | Middleware backend partiel seulement |
| 2 | Debounce PATCH frontend | 🟡 Moyenne | Passation, G3, etc. |
| 3 | Validation FK cross-mission G3 | 🟡 Moyenne | IDOR à durcir |
| 4 | Renommage RaLab5 DB (`RALAB5_DB_PATH`) | 🟢 Basse | Package C |
| 5 | CI + smoke tests routers | 🟢 Basse | Package F |
| 6 | PostgreSQL | 🟢 Basse | Futur |

---

## 9. Décisions d'architecture

| Décision | Choix | Raison |
|---|---|---|
| Frontend | React 18 + Vite | Moderne, rapide, compatible IA |
| State management | TanStack Query | Parfait pour REST API, cache automatique |
| UI components | shadcn/ui + Tailwind | Design system propre, customisable |
| Routing | React Router v6 | Standard |
| Auth | JWT cookie `ralab_token` + localStorage | Middleware storage + session frontend |
| Deploy | `launch_ralab5_server.cmd` | Défaut `RALAB_AUTH_MODE=proxy` |
| Backend | FastAPI inchangé | Déjà stable |
| DB | SQLite pour l'instant | Migration PostgreSQL future |
| Desktop | Web only pour RaLab5 | Tauri possible en RaLab6 |

---

## 10. Ce qu'il NE FAUT PAS faire

- ❌ Modifier les endpoints API existants (le legacy HTML dépend encore d'eux)
- ❌ Toucher à `security.db` (réutilisé depuis RaLab2)
- ❌ Versionner les fichiers `.db` dans git
- ❌ Committer des dossiers `RaLab5_*_package/` dans git
- ❌ Faire des `window.location.href` dans le code React (utiliser React Router)
- ❌ Mettre de la logique métier dans les composants React (tout dans les hooks/services)

---

## 11. Commandes utiles

```bash
# Backend (dev)
cd backend/current_fastapi
uvicorn api_main:app --reload --port 8000

# Frontend React
cd frontend/react
npm run dev

# Build production (servi par FastAPI sur :8000)
cd frontend/react && npm run build

# Lancer serveur complet (Windows)
launch_ralab5_server.cmd

# Tests backend
cd backend/current_fastapi
python -m pytest tests/ -q

# Migration refs G3
python tools/migrate_g3_mission_references.py

# Git
git pull && git status
```

Variables d'environnement : voir `.env.example`.
Documentation : `docs/README.md`, outils CLI : `docs/TOOLS_INDEX.md`.

---

## 12. Session en cours / dernière session

```
**Data :** 2026-07-11
**Feito nesta sessão (Pacote E — Docs) :**
- 62 HANDOFFs itératifs archivés dans docs/archive/handoffs/
- 4 HANDOFFs actifs conservés (deploy, overview, Cloudflare)
- 2 guides déplacés vers docs/guides/ (SC import, DE→generic)
- Créé docs/README.md, docs/TOOLS_INDEX.md, .env.example
- CONTEXT.md mis à jour (statut RaLab5 opérationnel, API G3, §12)

**Commits récents (avant Pacote E) :**
- 39792a8 Package A+B cleanup (storage gitignore, deps npm)
- 327634f Phase B security (middleware auth, cookie JWT)
- 47ea533 Module G3 EXE complet
- 7fbfb3c Phase A deploy (launch scripts, proxy default)

**Prochaines étapes possibles :**
- Commit + push Pacote E (sur demande)
- Package C : renommage RaLab5 DB/schema
- Package D : ToolsPage/DstPage → api.js unifié
- Package F : smoke tests routers, CI
```

---

## 13. Pour reprendre le travail après une pause

### Si tu reviens ici (Claude)
1. Ler este ficheiro CONTEXT.md
2. Fazer `git pull` no repo
3. Verificar §12 "Dernière session"
4. Continuar

### Si tu vas chez ChatGPT
1. Copier ce fichier entier dans le premier message
2. Dire : "Voici le contexte du projet RaLab5. Continue à partir du §12."
3. Après la session, lui demander de mettre à jour §12 et copier ici

### Si la conversation est trop longue (tokens épuisés)
1. Demander à l'IA : "Mets à jour le §12 de CONTEXT.md avec ce qu'on a fait"
2. Copier le fichier mis à jour dans le repo
3. Ouvrir une nouvelle conversation
4. Coller CONTEXT.md en premier message

---

*Ce document remplace tous les handoff_next_steps.txt et commit_message.txt éparpillés.*
