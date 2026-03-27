
"""
import_historique_labo.py
FastAPI router for one-shot historical laboratory Excel import.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.historical_lab_import_service import HistoricalLabImportService


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_TARGET_DB_PATH = ROOT_DIR / "data" / "ralab3.db"
DEFAULT_AFFAIRES_DB_PATH = ROOT_DIR / "data" / "affaires.db"

router = APIRouter()


class FolderRequest(BaseModel):
    folder_path: str = Field(..., min_length=1)
    limit: int = Field(default=300, ge=1, le=1000)


class RunRequest(BaseModel):
    folder_path: str = Field(..., min_length=1)
    dry_run: bool = False


class RematchRequest(BaseModel):
    dry_run: bool = False
    limit: int = Field(default=500, ge=1, le=5000)


def _service() -> HistoricalLabImportService:
    return HistoricalLabImportService(
        target_db_path=DEFAULT_TARGET_DB_PATH,
        affaires_db_path=DEFAULT_AFFAIRES_DB_PATH,
    )


@router.get("/status")
def status() -> dict:
    return _service().status()


@router.post("/preview")
def preview(payload: FolderRequest) -> dict:
    folder_path = Path(payload.folder_path)
    try:
        return _service().preview_folder(folder_path=folder_path, limit=payload.limit)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NotADirectoryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Preview failed: {exc}") from exc


@router.post("/run")
def run_import(payload: RunRequest) -> dict:
    folder_path = Path(payload.folder_path)
    try:
        return _service().run_import(folder_path=folder_path, dry_run=payload.dry_run)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NotADirectoryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Import failed: {exc}") from exc


@router.get("/report-unmatched-affaires")
def report_unmatched_affaires(limit: int = 200) -> dict:
    try:
        return _service().report_unmatched_imported_affaires(limit=limit)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Report failed: {exc}") from exc


@router.post("/rematch-affaires")
def rematch_affaires(payload: RematchRequest) -> dict:
    try:
        return _service().rematch_imported_affaires(dry_run=payload.dry_run, limit=payload.limit)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Re-matching failed: {exc}") from exc
