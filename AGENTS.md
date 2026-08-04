# AGENTS.md

## Cursor Cloud specific instructions

RaLab5 is a single-product app: a **FastAPI backend** that serves both the JSON API (`/api/*`) and the built **React/Vite SPA** on one port (8000). Data lives in embedded **SQLite** files under `backend/current_fastapi/data/` (no external DB server). There is no Docker/Makefile; the `.cmd`/`.ps1` launchers in the repo are Windows-only and do not work on Linux — run the commands below directly.

The update script already installs backend deps into a Python venv at `backend/current_fastapi/.venv` and frontend deps in `frontend/react/`. Do not re-install those manually; the notes below cover only non-obvious run/startup caveats.

### Backend (required service)
- Run from `backend/current_fastapi/`:
  - `source .venv/bin/activate`
  - `export RALAB_AUTH_MODE=passwordless` (local dev; never expose this mode publicly)
  - `export RALAB5_DB_PATH=$PWD/data/ralab5.db`
  - `uvicorn api_main:app --host 0.0.0.0 --port 8000`
- Health check: `GET http://127.0.0.1:8000/api/status` returns `{"status":"ok", "frontend_built":..., "auth_mode":...}`. API docs at `/docs`.
- The main `ralab5.db` schema is auto-created on startup (`ensure_ralab5_schema()`). All `.db` files are gitignored and live only on the VM.

### Login requires seeding the security DB (non-obvious)
- Passwordless login shows a user picker that is empty until `security.db` is seeded. Run once (idempotent, uses `INSERT OR IGNORE`):
  - `cd backend/current_fastapi && source .venv/bin/activate && python tools/init_security_db.py`
- This seeds demo users, e.g. `marco@nge.fr` (Administrateur), `labo@nge.fr`, `etudes@nge.fr`, `consult@nge.fr`. Select one on the login screen (no password).

### Frontend
- The backend serves the prebuilt SPA from `frontend/react/dist` (gitignored). For the full UI at `:8000` you must build it: `cd frontend/react && npm run build`. Without a build, `/` returns JSON and SPA routes 404 (the API still works).
- Alternatively, hot-reload dev: `cd frontend/react && npm run dev` (Vite on `:5173`, proxies `/api` → `127.0.0.1:8000`). The backend must be running for the proxy to work.

### Tests / lint / build
- Backend tests (from `backend/current_fastapi/`): `RALAB_AUTH_MODE=passwordless RALAB5_DB_PATH=/tmp/ralab5-ci.db python -m pytest tests/ -q`.
- Frontend build: `cd frontend/react && npm run build`.
- `npm run lint` currently fails: no ESLint config file is committed. Lint is **not** part of CI (`.github/workflows/ci.yml` only runs backend tests + frontend build), so do not treat lint failures as a regression from your changes.

### Environment note
- `python3.12-venv` (apt) is unavailable and apt mirrors are unreachable in this environment, so the venv is created with `virtualenv` (installed via pip) rather than `python -m venv`.
