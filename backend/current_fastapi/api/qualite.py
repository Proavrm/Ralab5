"""
api/qualite.py — Endpoints Qualité complets
"""
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from app.models.qualite import (
    EquipmentCreateSchema, EquipmentUpdateSchema, EquipmentResponseSchema,
    MetrologyCreateSchema, MetrologyUpdateSchema, MetrologyResponseSchema,
    ProcedureCreateSchema, ProcedureUpdateSchema, ProcedureResponseSchema,
    StandardCreateSchema, StandardUpdateSchema, StandardResponseSchema,
    NcCreateSchema, NcUpdateSchema, NcResponseSchema,
    CATEGORIES_EQ, STATUTS_EQ, CONTROL_TYPES, CONTROL_STATUTS,
    PROC_FAMILIES, STD_FAMILIES, DOC_STATUTS, NC_SOURCES, NC_SEVERITES, NC_STATUTS,
)
from app.repositories.qualite_repository import (
    EquipmentRepository, MetrologyRepository,
    ProcedureRepository, StandardRepository, NcRepository,
    get_stats,
)

router = APIRouter()

_eq    = EquipmentRepository()
_metro = MetrologyRepository()
_proc  = ProcedureRepository()
_std   = StandardRepository()
_nc    = NcRepository()

def _resp_eq(r)   -> EquipmentResponseSchema:   return EquipmentResponseSchema(**r.__dict__ if hasattr(r,'__dict__') else {f: getattr(r,f) for f in r.__dataclass_fields__})
def _resp_m(r)    -> MetrologyResponseSchema:   return MetrologyResponseSchema(**{f: getattr(r,f) for f in r.__dataclass_fields__})
def _resp_proc(r) -> ProcedureResponseSchema:   return ProcedureResponseSchema(**{f: getattr(r,f) for f in r.__dataclass_fields__})
def _resp_std(r)  -> StandardResponseSchema:    return StandardResponseSchema(**{f: getattr(r,f) for f in r.__dataclass_fields__})
def _resp_nc(r)   -> NcResponseSchema:          return NcResponseSchema(**{f: getattr(r,f) for f in r.__dataclass_fields__})

def _to_dict(record):
    return {f: getattr(record, f) for f in record.__dataclass_fields__}


# ── Stats ─────────────────────────────────────────────────────────────────────
@router.get("/stats")
def qualite_stats():
    return get_stats()


# ── Meta (listes de valeurs) ──────────────────────────────────────────────────
@router.get("/meta")
def qualite_meta():
    return {
        "categories_eq": CATEGORIES_EQ, "statuts_eq": STATUTS_EQ,
        "control_types": CONTROL_TYPES, "control_statuts": CONTROL_STATUTS,
        "proc_families": PROC_FAMILIES, "std_families": STD_FAMILIES,
        "doc_statuts": DOC_STATUTS, "nc_sources": NC_SOURCES,
        "nc_severites": NC_SEVERITES, "nc_statuts": NC_STATUTS,
    }


# ── Équipements ───────────────────────────────────────────────────────────────
@router.get("/equipment", response_model=list[EquipmentResponseSchema])
def list_equipment(
    search:   Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status:   Optional[str] = Query(None),
):
    return [EquipmentResponseSchema(**_to_dict(r)) for r in _eq.all(search, category, status)]


@router.get("/equipment/{uid}", response_model=EquipmentResponseSchema)
def get_equipment(uid: int):
    r = _eq.get(uid)
    if not r: raise HTTPException(404, "Équipement non trouvé")
    return EquipmentResponseSchema(**_to_dict(r))


@router.post("/equipment", response_model=EquipmentResponseSchema, status_code=201)
def create_equipment(data: EquipmentCreateSchema):
    return EquipmentResponseSchema(**_to_dict(_eq.create(data)))


@router.put("/equipment/{uid}", response_model=EquipmentResponseSchema)
def update_equipment(uid: int, data: EquipmentUpdateSchema):
    r = _eq.update(uid, data)
    if not r: raise HTTPException(404, "Équipement non trouvé")
    return EquipmentResponseSchema(**_to_dict(r))


@router.delete("/equipment/{uid}", status_code=204)
def delete_equipment(uid: int):
    _eq.delete(uid)


# ── Métrologie par équipement ─────────────────────────────────────────────────
@router.get("/equipment/{uid}/metrology", response_model=list[MetrologyResponseSchema])
def list_metrology_for_eq(uid: int):
    return [MetrologyResponseSchema(**_to_dict(r)) for r in _metro.for_equipment(uid)]


@router.get("/metrology/alerts", response_model=list[MetrologyResponseSchema])
def metrology_alerts(days: int = Query(60)):
    return [MetrologyResponseSchema(**_to_dict(r)) for r in _metro.alerts(days)]


@router.get("/metrology/{uid}", response_model=MetrologyResponseSchema)
def get_metrology(uid: int):
    r = _metro.get(uid)
    if not r: raise HTTPException(404)
    return MetrologyResponseSchema(**_to_dict(r))


@router.post("/equipment/{eq_uid}/metrology", response_model=MetrologyResponseSchema, status_code=201)
def create_metrology(eq_uid: int, data: MetrologyCreateSchema):
    data.equipment_id = eq_uid
    return MetrologyResponseSchema(**_to_dict(_metro.create(data)))


@router.put("/metrology/{uid}", response_model=MetrologyResponseSchema)
def update_metrology(uid: int, data: MetrologyUpdateSchema):
    r = _metro.update(uid, data)
    if not r: raise HTTPException(404)
    return MetrologyResponseSchema(**_to_dict(r))


@router.delete("/metrology/{uid}", status_code=204)
def delete_metrology(uid: int):
    _metro.delete(uid)


# ── Procédures ────────────────────────────────────────────────────────────────
@router.get("/procedures", response_model=list[ProcedureResponseSchema])
def list_procedures(
    search: Optional[str] = Query(None),
    family: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    return [ProcedureResponseSchema(**_to_dict(r)) for r in _proc.all(search, family, status)]


@router.get("/procedures/{uid}", response_model=ProcedureResponseSchema)
def get_procedure(uid: int):
    r = _proc.get(uid)
    if not r: raise HTTPException(404)
    return ProcedureResponseSchema(**_to_dict(r))


@router.post("/procedures", response_model=ProcedureResponseSchema, status_code=201)
def create_procedure(data: ProcedureCreateSchema):
    return ProcedureResponseSchema(**_to_dict(_proc.create(data)))


@router.put("/procedures/{uid}", response_model=ProcedureResponseSchema)
def update_procedure(uid: int, data: ProcedureUpdateSchema):
    r = _proc.update(uid, data)
    if not r: raise HTTPException(404)
    return ProcedureResponseSchema(**_to_dict(r))


@router.delete("/procedures/{uid}", status_code=204)
def delete_procedure(uid: int):
    _proc.delete(uid)


# ── Normes ────────────────────────────────────────────────────────────────────
@router.get("/standards", response_model=list[StandardResponseSchema])
def list_standards(
    search: Optional[str] = Query(None),
    family: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    return [StandardResponseSchema(**_to_dict(r)) for r in _std.all(search, family, status)]


@router.get("/standards/{uid}", response_model=StandardResponseSchema)
def get_standard(uid: int):
    r = _std.get(uid)
    if not r: raise HTTPException(404)
    return StandardResponseSchema(**_to_dict(r))


@router.post("/standards", response_model=StandardResponseSchema, status_code=201)
def create_standard(data: StandardCreateSchema):
    return StandardResponseSchema(**_to_dict(_std.create(data)))


@router.put("/standards/{uid}", response_model=StandardResponseSchema)
def update_standard(uid: int, data: StandardUpdateSchema):
    r = _std.update(uid, data)
    if not r: raise HTTPException(404)
    return StandardResponseSchema(**_to_dict(r))


@router.delete("/standards/{uid}", status_code=204)
def delete_standard(uid: int):
    _std.delete(uid)


# ── Non-conformités ───────────────────────────────────────────────────────────
@router.get("/nc", response_model=list[NcResponseSchema])
def list_nc(
    search:      Optional[str] = Query(None),
    status:      Optional[str] = Query(None),
    severity:    Optional[str] = Query(None),
    source_type: Optional[str] = Query(None),
):
    return [NcResponseSchema(**_to_dict(r)) for r in _nc.all(search, status, severity, source_type)]


@router.get("/nc/{uid}", response_model=NcResponseSchema)
def get_nc(uid: int):
    r = _nc.get(uid)
    if not r: raise HTTPException(404)
    return NcResponseSchema(**_to_dict(r))


@router.post("/nc", response_model=NcResponseSchema, status_code=201)
def create_nc(data: NcCreateSchema):
    return NcResponseSchema(**_to_dict(_nc.create(data)))


@router.put("/nc/{uid}", response_model=NcResponseSchema)
def update_nc(uid: int, data: NcUpdateSchema):
    r = _nc.update(uid, data)
    if not r: raise HTTPException(404)
    return NcResponseSchema(**_to_dict(r))


@router.delete("/nc/{uid}", status_code=204)
def delete_nc(uid: int):
    _nc.delete(uid)
