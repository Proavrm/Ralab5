# RaLab5 — Contexte du projet

> **Ce fichier est la source de vérité pour toutes les IAs et sessions.**
> Mettre à jour après chaque session de travail, avant de fermer.
> Version : 2026-03-27

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
| RaLab4 | FastAPI + SQLite + HTML pur | En développement | Migration depuis RaLab3 + nouvelles features |
| **RaLab5** | **FastAPI + SQLite + React + Vite** | **À démarrer** | Migration frontend vers React, backend inchangé |

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

**Backend** : ne pas toucher — API FastAPI déjà stable, endpoints documentés au §6.
**Frontend** : réécriture complète en React. Les pages HTML legacy restent en `frontend/legacy_html/` comme référence.

---

## 4. Domaine métier

**Laboratoire géotechnique NGE** — 4 laboratoires :
- `SP` = Saint-Priest (région RA)
- `PDC` = Pont-du-Château (région AUV)
- `CHB` = Chambéry (région RA)
- `CLM` = Clermont-Ferrand (région AUV)

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
| Affaire | `YYYY-RA-NNNN` | `2026-RA-0042` |
| Demande | `YYYY-SP-DNNNN` | `2026-SP-D0042` |
| Intervention | `YYYY-SP-INNNN` | `2026-SP-I0001` |
| Échantillon | `YYYY-SP-ENNNN` | `2026-SP-E0001` |
| NC interne | `NC-YYYY-NNN` | `NC-2026-001` |

### Statuts demande
`À qualifier` → `Demande` → `En Cours` → `Répondu` → `Fini` → `Envoyé - Perdu`

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

## 6. API — endpoints actifs (RaLab4)

```
GET  /                              → status
POST /api/auth/login                → JWT
GET  /api/auth/hint                 → Windows USERNAME hint

GET|POST /api/affaires              → liste + création
GET|PATCH|DELETE /api/affaires/{uid}
GET /api/affaires/{uid}/demandes
GET /api/affaires/next-ref

GET|POST /api/demandes              → liste + création
GET|PATCH|DELETE /api/demandes/{uid}
GET /api/demandes/next-ref
GET /api/demandes/filters

GET|POST /api/demandes_rst          → config modules par demande
GET /api/demandes_rst/{uid}

GET|POST /api/passations            → passations de chantier
GET|PATCH|DELETE /api/passations/{uid}

GET|POST /api/interventions
GET|PATCH|DELETE /api/interventions/{uid}

GET|POST /api/essais                → échantillons + essais labo
GET|PATCH|DELETE /api/essais/{uid}

GET /api/planning/demandes
PATCH /api/planning/demandes/{uid}

GET|POST /api/dst
GET /api/dst/search
POST /api/dst/import

GET|POST /api/qualite/equipment
GET|POST /api/qualite/metrology
GET|POST /api/qualite/procedures
GET|POST /api/qualite/standards
GET|POST /api/qualite/nc
GET /api/qualite/stats

GET|POST /api/admin/users
GET|POST /api/admin/roles

GET /api/reference-sources
GET /api/reference-affaires
GET /api/reference-etudes

POST /api/import-historique-labo
POST /api/audit-post-import
POST /api/regularisation-affaires
POST /api/affaires-manual-correction-simple
```

---

## 7. Pages frontend existantes (legacy HTML → React)

| Page HTML | Route React cible | Statut migração |
|---|---|---|
| `login.html` | `/login` | ✅ Feito |
| `index.html` | `/` (dashboard) | ✅ Feito |
| `affaires.html` | `/affaires` | ✅ Feito |
| `affaire.html` | `/affaires/:uid` | ⬜ A fazer |
| `demandes.html` | `/demandes` | ✅ Feito |
| `demande.html` | `/demandes/:uid` | ⬜ A fazer |
| `passations.html` | `/passations` | ⬜ A fazer |
| `passation.html` | `/passations/:uid` | ⬜ A fazer |
| `dst.html` | `/dst` | ⬜ A fazer |
| `planning.html` | `/planning` | ⬜ A fazer |
| `intervention.html` | `/interventions/:uid` | ⬜ A fazer |
| `essai.html` | `/essais/:uid` | ⬜ A fazer |
| `qualite.html` | `/qualite` | ⬜ A fazer |
| `admin.html` | `/admin` | ⬜ A fazer |
| `tools.html` | `/tools` | ⬜ A fazer |
| `devis.html` | `/devis` | ⬜ A fazer |
| `documents.html` | `/documents` | ⬜ A fazer |
| `etude.html` | `/etudes/:uid` | ⬜ A fazer |
| `references_affaires.html` | `/references/affaires` | ⬜ A fazer |
| `references_etudes.html` | `/references/etudes` | ⬜ A fazer |

---

## 8. Fonctionnalités à développer (backlog)

### ✅ Implémenté dans RaLab4
- Affaires RST (liste + fiche + CRUD)
- Demandes (liste + fiche + CRUD + dossiers Windows)
- DST (import Excel + picker)
- Interventions G3
- Essais + Échantillons labo
- Planning (kanban + agenda + calendrier)
- Qualité labo (équipements, métrologie, procédures, normes, NCs)
- Admin (utilisateurs + rôles)
- Passation de chantier
- Préparation de la demande (modules activés)
- Import historique labo
- Audit post-import
- Régularisation affaires
- Sources de référence (affaires + études)

### 🔲 À faire dans RaLab5

| # | Feature | Priorité | Notes |
|---|---|---|---|
| 1 | Migration frontend React | 🔴 Critique | Base de tout |
| 2 | Essais terrain (field_tests) | 🟠 Haute | Table liée à intervention, pas échantillon |
| 3 | Livrables | 🟠 Haute | Rapport, PV, note, synthèse — liés à demande |
| 4 | Dashboard graphiques réels | 🟡 Moyenne | Par statut, mois, labo |
| 5 | Ressources humaines | 🟡 Moyenne | Techniciens, affectation |
| 6 | Catalogue d'essais | 🟡 Moyenne | Par famille technique, norme, scope |
| 7 | Devis | 🟡 Moyenne | Liés à affaire/demande |
| 8 | Essais externes | 🟡 Moyenne | Sous-traitance |
| 9 | Alertes dashboard | 🟢 Basse | NCs ouvertes, métrologie en retard |
| 10 | PostgreSQL migration | 🟢 Basse | Futur — garder SQLite pour l'instant |

---

## 9. Décisions d'architecture

| Décision | Choix | Raison |
|---|---|---|
| Frontend | React 18 + Vite | Moderne, rapide, compatible IA |
| State management | TanStack Query | Parfait pour REST API, cache automatique |
| UI components | shadcn/ui + Tailwind | Design system propre, customisable |
| Routing | React Router v6 | Standard |
| Auth | JWT dans localStorage (clé `ralab_token`) | Même que RaLab4 |
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
# Lancer le backend
cd backend/current_fastapi
uvicorn api_main:app --reload --port 8000

# Lancer le frontend React (quand créé)
cd frontend/react
npm run dev

# Git — workflow propre
git pull
git add .
git commit -m "feat: description courte"
git push

# Vérifier ce qui est tracké (ne pas committer les .db ou packages)
git ls-files | grep -E "(\.db$|_package/)"
```

---

## 12. Session en cours / dernière session

**Date :** 2026-03-27
**Fait dans cette session :**
- Nettoyage du repo RaLab4 (packages, .db, fichiers racine, .gitignore)
- Analyse complète du codebase RaLab4
- Décision de créer RaLab5 avec frontend React
- Création de ce fichier CONTEXT.md
- Création structure complète RaLab5 :
  - `frontend/react/` avec Vite + React 18 + TanStack Query + Tailwind
  - Composants UI : Button, Input, Card, Modal, Table, Badge
  - Layout : AppLayout (sidebar) + routing complet App.jsx
  - Services : api.js (toutes les entités) + useAuth hook
  - Pages complètes : LoginPage, DashboardPage, AffairesPage, DemandesPage
  - Stubs pour todas as outras páginas
- Backend copiado do RaLab4 sem alterações

**Prochaine étape :**
- Marco cria repo GitHub `Ralab5` e faz push inicial
- Migrar: AffairePage, DemandePage (fichas detalhadas)
- Migrar: PassationsPage + PassationPage
- Migrar: PlanningPage (kanban)

**Em attente de Marco :**
- Push do RaLab4 limpo
- Criar repo GitHub RaLab5 e fazer `git init` + primeiro push
- Confirmar: web only ou Tauri para RaLab5?

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
