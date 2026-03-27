"""
api_main.py
FastAPI entry point for RaLab4.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
from api.passations import router as passations_router
from api.planning import router as planning_router
from api.qualite import router as qualite_router
from app.core.database import ensure_ralab4_schema
from api.affaires_manual_correction_simple import router as affaires_manual_correction_simple_router
from api.reference_sources import router as reference_sources_router
from api.reference_affaires import router as reference_affaires_router
from api.reference_etudes import router as reference_etudes_router

app = FastAPI(
    title="RaLab4 API",
    version="0.3.1",
    description="Geotechnical laboratory management API for RaLab4",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
app.include_router(audits_router, prefix="/api/audits", tags=["Audits"])
app.include_router(essais_router, prefix="/api/essais", tags=["Essais"])
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


@app.get("/", tags=["Status"])
def root() -> dict[str, str]:
    return {
        "status": "ok",
        "app": "RaLab4 API",
        "version": "0.3.1",
    }
