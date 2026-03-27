"""
File: affaires.py
Purpose: API endpoints for Affaires RST.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.affaire_rst import (
    AffaireRstCreateSchema,
    AffaireRstRecord,
    AffaireRstResponseSchema,
    AffaireRstUpdateSchema,
)
from app.models.demande_rst import DemandeRstResponseSchema
from app.repositories.affaires_rst_repository import AffairesRstRepository
from app.repositories.demandes_rst_repository import DemandesRstRepository
from app.services.source_prefill_service import SourcePrefillService

router = APIRouter()
_repo = AffairesRstRepository()
_dem_repo = DemandesRstRepository()
_prefill_service = SourcePrefillService()


def _resp(record: AffaireRstRecord) -> AffaireRstResponseSchema:
    return AffaireRstResponseSchema(
        uid=record.uid,
        reference=record.reference,
        annee=record.annee,
        region=record.region,
        numero=record.numero,
        client=record.client,
        titulaire=record.titulaire,
        chantier=record.chantier,
        site=record.site,
        numero_etude=record.numero_etude,
        affaire_nge=record.affaire_nge,
        filiale=record.filiale,
        date_ouverture=record.date_ouverture,
        date_cloture=record.date_cloture,
        statut=record.statut,
        responsable=record.responsable,
        source_legacy_id=record.source_legacy_id,
        created_at=record.created_at,
        updated_at=record.updated_at,
        nb_demandes=record.nb_demandes,
        nb_demandes_actives=record.nb_demandes_actives,
    )


@router.get("", response_model=list[AffaireRstResponseSchema])
def list_affaires(
    statut: Optional[str] = Query(None),
    titulaire: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    return [_resp(record) for record in _repo.all(statut=statut, titulaire=titulaire, search=search)]


@router.get("/next-ref")
def next_ref(region: str = Query("RA")):
    return {"reference": _repo.next_reference(region)}


@router.get("/filters")
def filters():
    return {
        "statuts": _repo.distinct_values("statut"),
        "titulaires": _repo.distinct_values("titulaire"),
        "filiales": _repo.distinct_values("filiale"),
    }


@router.get("/source-prefill")
def get_source_prefill(
    source_type: str = Query(...),
    source_id: int = Query(..., ge=1),
):
    try:
        return _prefill_service.build_affaire_prefill(source_type=source_type, source_id=source_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/{uid}", response_model=AffaireRstResponseSchema)
def get_affaire(uid: int):
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(404, f"Affaire #{uid} introuvable")
    return _resp(record)


@router.get("/{uid}/demandes", response_model=list[DemandeRstResponseSchema])
def get_demandes(uid: int):
    if not _repo.get_by_uid(uid):
        raise HTTPException(404, f"Affaire #{uid} introuvable")
    return [_dem_repo.to_resp(record) for record in _dem_repo.all(affaire_rst_id=uid)]


@router.post("", response_model=AffaireRstResponseSchema, status_code=201)
def create_affaire(body: AffaireRstCreateSchema):
    payload = _prefill_service.enrich_affaire_payload(
        payload=body.model_dump(),
        source_type=body.source_type,
        source_id=body.source_id,
    )

    ref = payload["reference"]
    parts = ref.strip().split("-")
    try:
        annee, region, numero = int(parts[0]), parts[1], int(parts[2])
    except Exception:
        annee, region, numero = 2026, "RA", 0

    record = AffaireRstRecord(
        uid=0,
        reference=ref,
        annee=annee,
        region=region,
        numero=numero,
        client=payload.get("client", ""),
        titulaire=payload.get("titulaire", ""),
        chantier=payload.get("chantier", ""),
        site=payload.get("site", ""),
        numero_etude=payload.get("numero_etude", ""),
        affaire_nge=payload.get("affaire_nge", ""),
        filiale=payload.get("filiale", ""),
        date_ouverture=payload["date_ouverture"],
        date_cloture=payload.get("date_cloture"),
        statut=payload.get("statut", "À qualifier"),
        responsable=payload.get("responsable", ""),
        source_legacy_id=None,
    )
    return _resp(_repo.add(record))


@router.put("/{uid}", response_model=AffaireRstResponseSchema)
def update_affaire(uid: int, body: AffaireRstUpdateSchema):
    if not _repo.get_by_uid(uid):
        raise HTTPException(404, f"Affaire #{uid} introuvable")
    fields = {key: value for key, value in body.model_dump().items() if value is not None}
    return _resp(_repo.update(uid, fields))


@router.delete("/{uid}", status_code=204)
def delete_affaire(uid: int):
    if not _repo.delete(uid):
        raise HTTPException(404, f"Affaire #{uid} introuvable")
