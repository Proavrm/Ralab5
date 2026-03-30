"""
api/affaires.py — RaLab4
Endpoints :
  GET    /api/affaires
  GET    /api/affaires/next-ref
  GET    /api/affaires/filters
  GET    /api/affaires/{uid}
  GET    /api/affaires/{uid}/demandes
  POST   /api/affaires
  PUT    /api/affaires/{uid}
  DELETE /api/affaires/{uid}
"""
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from app.models.affaire_rst import (
    AffaireRstCreateSchema, AffaireRstRecord,
    AffaireRstResponseSchema, AffaireRstUpdateSchema,
)
from app.models.demande_rst import DemandeRstResponseSchema
from app.repositories.affaires_rst_repository import AffairesRstRepository
from app.repositories.demandes_rst_repository import DemandesRstRepository

router    = APIRouter()
_repo     = AffairesRstRepository()
_dem_repo = DemandesRstRepository()


def _resp(r: AffaireRstRecord) -> AffaireRstResponseSchema:
    return AffaireRstResponseSchema(
        uid=r.uid, reference=r.reference, annee=r.annee, region=r.region, numero=r.numero,
        client=r.client, titulaire=r.titulaire, chantier=r.chantier,
        site=r.site, numero_etude=r.numero_etude, affaire_nge=r.affaire_nge, filiale=r.filiale,
        date_ouverture=r.date_ouverture, date_cloture=r.date_cloture,
        statut=r.statut, responsable=r.responsable,
        source_legacy_id=r.source_legacy_id,
        created_at=r.created_at, updated_at=r.updated_at,
        nb_demandes=r.nb_demandes, nb_demandes_actives=r.nb_demandes_actives,
    )


@router.get("", response_model=list[AffaireRstResponseSchema])
def list_affaires(
    statut:   Optional[str]  = Query(None),
    titulaire: Optional[str] = Query(None),
    search:   Optional[str]  = Query(None),
):
    return [_resp(r) for r in _repo.all(statut=statut, titulaire=titulaire, search=search)]


@router.get("/next-ref")
def next_ref(region: str = Query("RA")):
    return {"reference": _repo.next_reference(region)}


@router.get("/filters")
def filters():
    return {
        "statuts":    _repo.distinct_values("statut"),
        "titulaires": _repo.distinct_values("titulaire"),
    }


@router.get("/{uid}", response_model=AffaireRstResponseSchema)
def get_affaire(uid: int):
    r = _repo.get_by_uid(uid)
    if not r: raise HTTPException(404, f"Affaire #{uid} introuvable")
    return _resp(r)


@router.get("/{uid}/demandes", response_model=list[DemandeRstResponseSchema])
def get_demandes(uid: int):
    if not _repo.get_by_uid(uid): raise HTTPException(404, f"Affaire #{uid} introuvable")
    return [_dem_repo.to_resp(r) for r in _dem_repo.all(affaire_rst_id=uid)]


@router.post("", response_model=AffaireRstResponseSchema, status_code=201)
def create_affaire(body: AffaireRstCreateSchema):
    from app.models.affaire_rst import AffaireRstRecord
    ref = body.reference
    p = ref.strip().split("-")
    try: annee, region, numero = int(p[0]), p[1], int(p[2])
    except: annee, region, numero = 2026, "RA", 0
    record = AffaireRstRecord(
        uid=0, reference=ref, annee=annee, region=region, numero=numero,
        client=body.client, titulaire=body.titulaire,
        chantier=body.chantier, affaire_nge=body.affaire_nge,
        date_ouverture=body.date_ouverture, date_cloture=body.date_cloture,
        statut=body.statut, responsable=body.responsable,
        source_legacy_id=None,
    )
    return _resp(_repo.add(record))


@router.put("/{uid}", response_model=AffaireRstResponseSchema)
def update_affaire(uid: int, body: AffaireRstUpdateSchema):
    if not _repo.get_by_uid(uid): raise HTTPException(404, f"Affaire #{uid} introuvable")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    return _resp(_repo.update(uid, fields))


@router.delete("/{uid}", status_code=204)
def delete_affaire(uid: int):
    if not _repo.delete(uid): raise HTTPException(404, f"Affaire #{uid} introuvable")
