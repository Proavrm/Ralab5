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

### Frontend React
```bash
cd frontend/react
npm install
npm run dev
```

API disponible sur `http://127.0.0.1:8000`
Frontend sur `http://localhost:5173`
Docs API sur `http://127.0.0.1:8000/docs`

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
