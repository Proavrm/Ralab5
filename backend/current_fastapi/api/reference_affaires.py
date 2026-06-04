# File: reference_affaires.py
from __future__ import annotations
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.reference_sources_service import ReferenceSourcesService
from app.repositories.reference_affaires_repository import ReferenceAffairesRepository

router = APIRouter()
service = ReferenceSourcesService()
_repo = ReferenceAffairesRepository()

PROJECT_ROOT = Path(__file__).resolve().parents[3]
AFFAIRES_REFERENCE_DIR = PROJECT_ROOT / "storage" / "references" / "affaires"


def _save_uploaded_affaires_file(uploaded_file: UploadFile) -> Path:
    filename = (uploaded_file.filename or "").strip().lower()
    if not (filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Le fichier Affaires doit être au format .xlsx ou .xls")

    AFFAIRES_REFERENCE_DIR.mkdir(parents=True, exist_ok=True)
    extension = ".xlsx" if filename.endswith(".xlsx") else ".xls"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target_path = AFFAIRES_REFERENCE_DIR / f"LISTE AFFAIRES_upload_{timestamp}{extension}"
    payload = uploaded_file.file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Fichier vide")
    target_path.write_bytes(payload)
    return target_path


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


@router.post('/preview-upload')
def preview_reference_affaires_upload(file: UploadFile = File(...)) -> dict:
    try:
        saved = _save_uploaded_affaires_file(file)
        preview = service.preview_update('affaires')
        preview['uploaded_file_path'] = str(saved)
        preview['uploaded_file_name'] = saved.name
        return preview
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post('/update-upload')
def apply_reference_affaires_upload(file: UploadFile = File(...)) -> dict:
    try:
        saved = _save_uploaded_affaires_file(file)
        result = service.apply_update('affaires')
        result['uploaded_file_path'] = str(saved)
        result['uploaded_file_name'] = saved.name
        return result
    except HTTPException:
        raise
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
