"""Routes API — Calculs de dimensionnement."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from app.core.api_security import current_request_user_label
from app.models.calculs import (
    AlizePayloadUpdateSchema,
    CalculationCreateSchema,
    CalculationUpdateSchema,
)
from app.repositories.calculs_repository import CalculsRepository

router = APIRouter()
_repo = CalculsRepository()


def _user() -> str:
    return current_request_user_label()


@router.get("/summary")
def get_summary(affaire_rst_id: Optional[int] = None):
    return _repo.summary(affaire_rst_id=affaire_rst_id)


@router.get("/calculations")
def list_calculations(
    type_calcul: Optional[str] = None,
    affaire_rst_id: Optional[int] = None,
    demande_id: Optional[int] = None,
    statut: Optional[str] = None,
    search: Optional[str] = None,
):
    return _repo.list_calculations(
        type_calcul=type_calcul,
        affaire_rst_id=affaire_rst_id,
        demande_id=demande_id,
        statut=statut,
        search=search,
    )


@router.post("/calculations", status_code=201)
def create_calculation(body: CalculationCreateSchema):
    try:
        return _repo.create(body, user_name=_user())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/calculations/{calculation_id}")
def get_calculation(calculation_id: int):
    row = _repo.get(calculation_id)
    if not row:
        raise HTTPException(404, f"Calcul #{calculation_id} introuvable")
    return row


@router.patch("/calculations/{calculation_id}")
def update_calculation(calculation_id: int, body: CalculationUpdateSchema):
    row = _repo.update(calculation_id, body, user_name=_user())
    if not row:
        raise HTTPException(404, f"Calcul #{calculation_id} introuvable")
    return row


@router.post("/calculations/{calculation_id}/duplicate", status_code=201)
def duplicate_calculation(calculation_id: int):
    row = _repo.duplicate(calculation_id, user_name=_user())
    if not row:
        raise HTTPException(404, f"Calcul #{calculation_id} introuvable")
    return row


@router.patch("/calculations/{calculation_id}/alize")
def update_alize(calculation_id: int, body: AlizePayloadUpdateSchema):
    row = _repo.update_alize(calculation_id, body, user_name=_user())
    if not row:
        raise HTTPException(404, f"Calcul Alizé #{calculation_id} introuvable")
    return row


@router.get("/calculations/{calculation_id}/fiche", response_class=HTMLResponse)
def get_fiche(calculation_id: int):
    html = _repo.build_fiche_html(calculation_id)
    if not html:
        raise HTTPException(404, f"Calcul #{calculation_id} introuvable")
    return HTMLResponse(html)


@router.get("/references/alize")
def search_alize_references(search: Optional[str] = None, limit: int = 50):
    return _repo.search_ref_etudes(search=search or "", limit=min(limit, 200))
