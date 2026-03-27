# affaires_manual_correction_simple.py
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.affaire_regularisation_simple_service import (
    AffaireManualCorrectionSimpleService,
)

router = APIRouter()

CURRENT_DIR = Path(__file__).resolve().parent
DB_PATH = CURRENT_DIR.parent / "data" / "ralab3.db"

service = AffaireManualCorrectionSimpleService(DB_PATH)


class AffaireUpdatePayload(BaseModel):
    affaire_nge: str
    chantier: str
    site: str


@router.get("/status")
def status() -> dict[str, str]:
    service.ensure_site_column()
    return {"status": "ok"}


@router.get("/list")
def list_affaires(query: str = "", only_problematic: bool = True) -> dict:
    try:
        return service.list_affaires(query=query, only_problematic=only_problematic)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/update/{affaire_id}")
def update_affaire(affaire_id: int, payload: AffaireUpdatePayload) -> dict:
    try:
        item = service.update_affaire(
            affaire_id=affaire_id,
            affaire_nge=payload.affaire_nge,
            chantier=payload.chantier,
            site=payload.site,
        )
        return {"status": "ok", "item": item}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
