"""
import_audit_post_import.py
FastAPI router for post-import audit in RaLab4.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.post_import_audit_service import PostImportAuditService


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_TARGET_DB_PATH = ROOT_DIR / "data" / "ralab3.db"
DEFAULT_AFFAIRES_DB_PATH = ROOT_DIR / "data" / "affaires.db"

router = APIRouter()


class ReportRequest(BaseModel):
    limit: int = Field(default=100, ge=10, le=1000)


def _service() -> PostImportAuditService:
    return PostImportAuditService(
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
        raise HTTPException(status_code=500, detail=f"Audit failed: {exc}") from exc
