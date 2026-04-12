from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.intervention_campaign_service import create_campaign, update_campaign

router = APIRouter()


class InterventionCampaignCreate(BaseModel):
    demande_id: int
    code: str = Field("")
    label: str = Field("Campagne")
    designation: str = Field("")
    zone_scope: str = Field("")
    temporalite: str = Field("")
    notes: str = Field("")
    statut: str = Field("A cadrer")


class InterventionCampaignUpdate(BaseModel):
    code: Optional[str] = None
    label: Optional[str] = None
    designation: Optional[str] = None
    zone_scope: Optional[str] = None
    temporalite: Optional[str] = None
    notes: Optional[str] = None
    statut: Optional[str] = None


@router.post("", status_code=201)
def create_intervention_campaign(body: InterventionCampaignCreate):
    try:
        return create_campaign(
            body.demande_id,
            code=body.code,
            label=body.label,
            designation=body.designation,
            zone_scope=body.zone_scope,
            temporalite=body.temporalite,
            notes=body.notes,
            statut=body.statut,
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.patch("/{uid}")
def patch_intervention_campaign(uid: int, body: InterventionCampaignUpdate):
    try:
        return update_campaign(
            uid,
            code=body.code,
            label=body.label,
            designation=body.designation,
            zone_scope=body.zone_scope,
            temporalite=body.temporalite,
            notes=body.notes,
            statut=body.statut,
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc