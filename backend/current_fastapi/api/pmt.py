from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.pmt_workflow_service import (
    create_pmt_essai_for_intervention,
    ensure_pmt_essai_for_intervention,
    get_pmt_campaigns_for_demande,
    get_pmt_essai,
    get_pmt_intervention_workflow,
    get_pmt_rapport,
    update_pmt_essai,
)

router = APIRouter()


class PmtEssaiUpdate(BaseModel):
    statut: str | None = None
    date_essai: str | None = None
    operateur: str | None = None
    section_controlee: str | None = None
    voie: str | None = None
    sens: str | None = None
    couche: str | None = None
    nature_support: str | None = None
    observations: str | None = None
    resultats: dict[str, Any] | None = None


def _model_dump(payload: BaseModel) -> dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_unset=True)
    return payload.dict(exclude_unset=True)


@router.get("/demandes/{demande_id}/campagnes")
def list_pmt_campaigns(demande_id: int, preparation_phase: str = ""):
    try:
        return get_pmt_campaigns_for_demande(demande_id, preparation_phase)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/interventions/{intervention_id}/workflow")
def get_intervention_pmt_workflow(intervention_id: int, preparation_phase: str = ""):
    try:
        return get_pmt_intervention_workflow(intervention_id, preparation_phase)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/interventions/{intervention_id}/essai")
def create_or_open_pmt_essai(intervention_id: int):
    try:
        return ensure_pmt_essai_for_intervention(intervention_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/interventions/{intervention_id}/essais")
def create_new_pmt_essai(intervention_id: int):
    try:
        return create_pmt_essai_for_intervention(intervention_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/essais/{uid}")
def get_pmt_essai_by_uid(uid: int):
    try:
        return get_pmt_essai(uid)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/essais/{uid}")
def update_pmt_essai_by_uid(uid: int, body: PmtEssaiUpdate):
    try:
        return update_pmt_essai(uid, _model_dump(body))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/rapports/{uid}")
def get_pmt_rapport_by_uid(uid: int):
    try:
        return get_pmt_rapport(uid)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc