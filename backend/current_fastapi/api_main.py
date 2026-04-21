"""
api_main.py
FastAPI entry point for RaLab4.
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from api.admin import router as admin_router
from api.affaires import router as affaires_router
from api.audits import router as audits_router
from api.auth import router as auth_router
from api.demande_preparation import router as demande_preparation_router
from api.demandes import router as demandes_router
from api.demandes_rst import router as demandes_rst_router
from api.dst import router as dst_router
from api.essais import router as essais_router
from api.import_audit_post_import import router as audit_post_import_router
from api.import_historique_labo import router as import_historique_labo_router
from api.import_regularisation_affaires import router as regularisation_affaires_router
from api.interventions import router as interventions_router
from api.intervention_campaigns import router as intervention_campaigns_router
from api.intervention_requalification import router as intervention_requalification_router
from api.passations import router as passations_router
from api.planning import router as planning_router
from api.pmt import router as pmt_router
from api.plans_implantation import router as plans_implantation_router
from api.nivellements import router as nivellements_router
from api.feuilles_terrain import router as feuilles_terrain_router
from api.qualite import router as qualite_router
from app.core.database import ensure_ralab4_schema
from api.affaires_manual_correction_simple import router as affaires_manual_correction_simple_router
from api.reference_sources import router as reference_sources_router
from api.reference_affaires import router as reference_affaires_router
from api.reference_etudes import router as reference_etudes_router

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST_DIR = PROJECT_ROOT / "frontend" / "react" / "dist"
FRONTEND_INDEX_FILE = FRONTEND_DIST_DIR / "index.html"
FRONTEND_ASSETS_DIR = FRONTEND_DIST_DIR / "assets"
SPA_RESERVED_PREFIXES = ("api", "docs", "redoc", "openapi.json")
DEFAULT_ALLOWED_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000"
FRONTEND_HTML_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}
FRONTEND_ASSET_HEADERS = {
    "Cache-Control": "public, max-age=31536000, immutable",
}


def _parse_csv_env(name: str, default: str) -> list[str]:
    raw = os.environ.get(name, default)
    values = [item.strip() for item in raw.split(",") if item.strip()]
    return values or [default]


def _frontend_is_built() -> bool:
    return FRONTEND_INDEX_FILE.exists()


def _frontend_response(file_path: Path) -> FileResponse:
    resolved_path = file_path.resolve()
    headers: dict[str, str] = {}

    if resolved_path.suffix == ".html":
        headers = FRONTEND_HTML_HEADERS
    elif resolved_path.is_relative_to(FRONTEND_ASSETS_DIR.resolve()):
        headers = FRONTEND_ASSET_HEADERS

    return FileResponse(resolved_path, headers=headers)


def _serve_frontend_path(relative_path: str = "") -> FileResponse:
    if not _frontend_is_built():
        raise HTTPException(status_code=404, detail="Frontend build not found.")

    dist_dir = FRONTEND_DIST_DIR.resolve()
    normalized_path = relative_path.strip("/")

    if not normalized_path:
        return _frontend_response(FRONTEND_INDEX_FILE)

    candidate = (dist_dir / normalized_path).resolve()
    if not candidate.is_relative_to(dist_dir):
        raise HTTPException(status_code=404, detail="Not found.")

    if candidate.is_file():
        return _frontend_response(candidate)

    return _frontend_response(FRONTEND_INDEX_FILE)

app = FastAPI(
    title="RaLab4 API",
    version="0.3.1",
    description="Geotechnical laboratory management API for RaLab4",
    docs_url="/docs",
    redoc_url="/redoc",
)

allowed_hosts = _parse_csv_env("RALAB_ALLOWED_HOSTS", "*")
allowed_origins = _parse_csv_env("RALAB_ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS)

if allowed_hosts != ["*"]:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])
app.include_router(demandes_router, prefix="/api/demandes", tags=["Demandes"])
app.include_router(dst_router, prefix="/api/dst", tags=["DST"])
app.include_router(planning_router, prefix="/api/planning", tags=["Planning"])
app.include_router(affaires_router, prefix="/api/affaires", tags=["Affaires RST"])
app.include_router(passations_router, prefix="/api/passations", tags=["Passations"])
app.include_router(demande_preparation_router, prefix="/api/demandes_rst", tags=["Demandes RST Configuration"])
app.include_router(demandes_rst_router, prefix="/api/demandes_rst", tags=["Demandes RST"])
app.include_router(interventions_router, prefix="/api/interventions", tags=["Interventions"])
app.include_router(intervention_campaigns_router, prefix="/api/intervention-campaigns", tags=["Intervention Campaigns"])
app.include_router(intervention_requalification_router, prefix="/api/intervention-requalification", tags=["Intervention Requalification"])
app.include_router(audits_router, prefix="/api/audits", tags=["Audits"])
app.include_router(essais_router, prefix="/api/essais", tags=["Essais"])
app.include_router(pmt_router, prefix="/api/pmt", tags=["PMT"])
app.include_router(plans_implantation_router, prefix="/api/plans-implantation", tags=["Plans implantation"])
app.include_router(nivellements_router, prefix="/api/nivellements", tags=["Nivellements"])
app.include_router(feuilles_terrain_router, prefix="/api/feuilles-terrain", tags=["Feuilles terrain"])
app.include_router(qualite_router, prefix="/api/qualite", tags=["Qualité"])
app.include_router(import_historique_labo_router, prefix="/api/import-historique-labo", tags=["Import Historique Labo"])
app.include_router(audit_post_import_router, prefix="/api/audit-post-import", tags=["Audit Post-Import"])
app.include_router(regularisation_affaires_router, prefix="/api/regularisation-affaires", tags=["Regularisation Affaires"])
app.include_router(affaires_manual_correction_simple_router,prefix="/api/affaires-manual-correction-simple",tags=["Affaires Manual Correction Simple"],)
app.include_router(reference_sources_router,prefix="/api/reference-sources",tags=["Reference Sources"],)
app.include_router(reference_affaires_router,prefix="/api/reference-affaires",tags=["Reference Affaires"],)
app.include_router(reference_etudes_router,prefix="/api/reference-etudes",tags=["Reference Etudes"],)

@app.on_event("startup")
def startup_event() -> None:
    ensure_ralab4_schema()


@app.get("/api/status", tags=["Status"])
def status() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "app": "RaLab4 API",
        "version": "0.3.1",
        "frontend_built": _frontend_is_built(),
        "auth_mode": os.environ.get("RALAB_AUTH_MODE", "passwordless"),
    }


@app.get("/", include_in_schema=False, response_model=None)
def root():
    if _frontend_is_built():
        return _frontend_response(FRONTEND_INDEX_FILE)

    return {
        "status": "ok",
        "app": "RaLab4 API",
        "version": "0.3.1",
    }


@app.get("/{full_path:path}", include_in_schema=False, response_model=None)
def spa_fallback(full_path: str):
    normalized_path = full_path.strip("/")

    if any(
        normalized_path == prefix or normalized_path.startswith(f"{prefix}/")
        for prefix in SPA_RESERVED_PREFIXES
    ):
        raise HTTPException(status_code=404, detail="Not found.")

    return _serve_frontend_path(normalized_path)
