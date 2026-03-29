# File: reference_affaires.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services.reference_sources_service import ReferenceSourcesService
from app.repositories.reference_affaires_repository import ReferenceAffairesRepository

router = APIRouter()
service = ReferenceSourcesService()
_repo = ReferenceAffairesRepository()


@router.get("/status")
def get_reference_affaires_status() -> dict:
    try:
        report = service.get_status_report()
        return report.get("sources", {}).get("affaires", {})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/preview")
def preview_reference_affaires_update() -> dict:
    try:
        return service.preview_update("affaires")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/update")
def apply_reference_affaires_update() -> dict:
    try:
        return service.apply_update("affaires")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get('/rows')
def list_reference_affaires_rows(search: str | None = None, limit: int = 2000) -> list[dict]:
    try:
        return _repo.all(search=search, limit=limit)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get('/rows/{row_id}')
def get_reference_affaires_row(row_id: str) -> dict:
    try:
        row = _repo.get_by_id(row_id)
        if not row:
            raise HTTPException(status_code=404, detail=f"Affaire de référence {row_id} introuvable")
        return row
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
