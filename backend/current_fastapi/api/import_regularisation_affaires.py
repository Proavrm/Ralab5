"""
import_regularisation_affaires.py
FastAPI router for imported affaires regularisation in RaLab4.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.affaire_regularisation_service import AffaireRegularisationService

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_TARGET_DB_PATH = ROOT_DIR / "data" / "ralab3.db"
DEFAULT_AFFAIRES_DB_PATH = ROOT_DIR / "data" / "affaires.db"

router = APIRouter()


class ReportRequest(BaseModel):
    limit: int = Field(default=200, ge=20, le=2000)


class UpdateAffaireRequest(BaseModel):
    chantier: str | None = None
    site: str | None = None
    affaire_nge: str | None = None


class ApplyReferenceRequest(BaseModel):
    affaire_id: int
    reference_code: str | None = None


def _service() -> AffaireRegularisationService:
    return AffaireRegularisationService(
        target_db_path=DEFAULT_TARGET_DB_PATH,
        affaires_db_path=DEFAULT_AFFAIRES_DB_PATH,
    )


@router.get("/status")
def status() -> dict:
    return _service().status()


@router.post("/report")
def report(payload: ReportRequest) -> dict:
    try:
        return _service().build_report(limit=payload.limit)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Regularisation report failed: {exc}") from exc


@router.patch("/affaires/{affaire_id}")
def update_affaire(affaire_id: int, payload: UpdateAffaireRequest) -> dict:
    try:
        return _service().update_affaire_fields(
            affaire_id=affaire_id,
            chantier=payload.chantier,
            site=payload.site,
            affaire_nge=payload.affaire_nge,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Update failed: {exc}") from exc


@router.post("/apply-reference")
def apply_reference(payload: ApplyReferenceRequest) -> dict:
    try:
        return _service().apply_reference_enrichment(
            affaire_id=payload.affaire_id,
            reference_code=payload.reference_code,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Reference enrichment failed: {exc}") from exc


@router.get("/reference-search")
def reference_search(
    query: str = Query(..., min_length=2),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    try:
        return {"items": _service().search_reference_candidates(query=query, limit=limit)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Reference search failed: {exc}") from exc
