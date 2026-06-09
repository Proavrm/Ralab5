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
from functools import lru_cache
from pathlib import Path
import re
import sqlite3
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from app.models.affaire_rst import (
    AffaireRstCreateSchema, AffaireRstRecord,
    AffaireRstResponseSchema, AffaireRstUpdateSchema,
)
from app.models.demande_rst import DemandeRstResponseSchema
from app.repositories.affaires_rst_repository import AffairesRstRepository
from app.repositories.demandes_rst_repository import DemandesRstRepository
from app.services.affaire_dossier_service import AffaireDossierService
from app.services.affaire_folder_naming import (
    build_affaire_folder_name_from_record,
    is_auto_affaire_folder_name,
)

router    = APIRouter()
_repo     = AffairesRstRepository()
_dem_repo = DemandesRstRepository()
_dossiers = AffaireDossierService()

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
NGE_REF_DB_PATH = DATA_DIR / "affaires.db"
ETUDES_REF_DB_PATH = DATA_DIR / "etudes.db"

FULL_AFFAIRE_CODE_SQL = """
COALESCE(
    NULLIF(TRIM(REPLACE(gsa, '*', '')), ''),
    NULLIF(TRIM(REPLACE(ehtp, '*', '')), ''),
    NULLIF(TRIM(REPLACE(nge_routes, '*', '')), ''),
    NULLIF(TRIM(REPLACE(nge_gc, '*', '')), ''),
    NULLIF(TRIM(REPLACE(lyaudet, '*', '')), ''),
    NULLIF(TRIM(REPLACE("nge_e.s.", '*', '')), ''),
    NULLIF(TRIM(REPLACE(nge_transitions, '*', '')), ''),
    CASE
        WHEN TRIM(COALESCE("n°affaire", '')) = '' THEN ''
        ELSE UPPER('RA' || TRIM("n°affaire") || TRIM(COALESCE(code_agence, '')))
    END
)
""".strip()


def _parse_reference_parts(reference: str) -> tuple[str, int, str, int]:
    ref = str(reference or "").strip()
    if not ref:
        raise HTTPException(400, "Référence affaire RST obligatoire")
    parts = ref.split("-")
    try:
        annee, region, numero = int(parts[0]), parts[1], int(parts[2])
    except Exception as exc:
        raise HTTPException(400, f"Référence affaire RST invalide: {ref}") from exc
    return ref, annee, region, numero


def _normalize_key(value: str | None) -> str:
    text = str(value or "").replace("*", "").upper()
    text = re.sub(r"[\s\-_/\.]+", "", text)
    return text.strip()


@lru_cache(maxsize=1)
def _nge_titulaire_by_key() -> dict[str, str]:
    if not NGE_REF_DB_PATH.exists():
        return {}
    with sqlite3.connect(str(NGE_REF_DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            f"""
            SELECT {FULL_AFFAIRE_CODE_SQL} AS numero_affaire_complet, titulaire
            FROM affaires
            """
        ).fetchall()
    by_key: dict[str, set[str]] = {}
    for row in rows:
        key = _normalize_key(row["numero_affaire_complet"])
        titulaire = str(row["titulaire"] or "").strip()
        if not key or not titulaire:
            continue
        by_key.setdefault(key, set()).add(titulaire)
    return {k: next(iter(v)) for k, v in by_key.items() if len(v) == 1}


@lru_cache(maxsize=1)
def _etude_filiale_by_key() -> dict[str, str]:
    if not ETUDES_REF_DB_PATH.exists():
        return {}
    with sqlite3.connect(str(ETUDES_REF_DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT nAffaire AS numero_etude, filiale
            FROM etudes
            """
        ).fetchall()
    by_key: dict[str, set[str]] = {}
    for row in rows:
        key = _normalize_key(row["numero_etude"])
        filiale = str(row["filiale"] or "").strip()
        if not key or not filiale:
            continue
        by_key.setdefault(key, set()).add(filiale)
    return {k: next(iter(v)) for k, v in by_key.items() if len(v) == 1}


@lru_cache(maxsize=1)
def _etude_statut_offre_by_key() -> dict[str, str]:
    if not ETUDES_REF_DB_PATH.exists():
        return {}
    with sqlite3.connect(str(ETUDES_REF_DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT nAffaire AS numero_etude, statuAffaire AS statut_offre
            FROM etudes
            """
        ).fetchall()
    by_key: dict[str, set[str]] = {}
    for row in rows:
        key = _normalize_key(row["numero_etude"])
        statut_offre = str(row["statut_offre"] or "").strip()
        if not key or not statut_offre:
            continue
        by_key.setdefault(key, set()).add(statut_offre)
    return {k: next(iter(v)) for k, v in by_key.items() if len(v) == 1}


def _resolve_statut_offre_by_numero_etude(numero_etude: str | None) -> str | None:
    etude_key = _normalize_key(numero_etude)
    if not etude_key:
        return None
    return _etude_statut_offre_by_key().get(etude_key) or None


def _resolve_titulaire_by_rule(affaire_nge: str | None, numero_etude: str | None) -> str | None:
    # Rule agreed with user:
    # - with affaire_nge (alone or with etude): titulaire from NGE reference
    # - with only numero_etude: titulaire from etudes filiale
    nge_key = _normalize_key(affaire_nge)
    if nge_key:
        titulaire = _nge_titulaire_by_key().get(nge_key)
        return titulaire or None

    etude_key = _normalize_key(numero_etude)
    if etude_key:
        filiale = _etude_filiale_by_key().get(etude_key)
        return filiale or None

    return None


def _resp(r: AffaireRstRecord) -> AffaireRstResponseSchema:
    return AffaireRstResponseSchema(
        uid=r.uid, reference=r.reference, annee=r.annee, region=r.region, numero=r.numero,
        client=r.client, titulaire=r.titulaire, chantier=r.chantier,
        site=r.site, numero_etude=r.numero_etude, affaire_nge=r.affaire_nge, filiale=r.filiale,
        autre_reference=r.autre_reference,
        dossier_nom=r.dossier_nom,
        dossier_nom_prevu=build_affaire_folder_name_from_record(r),
        dossier_path=r.dossier_path,
        date_ouverture=r.date_ouverture, date_cloture=r.date_cloture,
        statut=r.statut, statut_offre=r.statut_offre, responsable=r.responsable,
        source_legacy_id=r.source_legacy_id,
        created_at=r.created_at, updated_at=r.updated_at,
        nb_demandes=r.nb_demandes, nb_demandes_actives=r.nb_demandes_actives,
    )


def _to_response_payload(record: AffaireRstRecord) -> dict:
    payload = _resp(record).model_dump(mode="json")
    payload.update(_dossiers.describe(record).to_dict())
    return payload


def _persist_dossier_fields(record: AffaireRstRecord) -> None:
    _repo.update(
        record.uid,
        {
            "dossier_nom": record.dossier_nom,
            "dossier_path": record.dossier_path,
        },
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


@router.get("/dossiers-root")
def dossiers_root():
    return _dossiers.get_root_info()


@router.get("/{uid}", response_model=AffaireRstResponseSchema)
def get_affaire(uid: int):
    r = _repo.get_by_uid(uid)
    if not r: raise HTTPException(404, f"Affaire #{uid} introuvable")
    return _to_response_payload(r)


@router.get("/{uid}/demandes", response_model=list[DemandeRstResponseSchema])
def get_demandes(uid: int):
    if not _repo.get_by_uid(uid): raise HTTPException(404, f"Affaire #{uid} introuvable")
    return [_dem_repo.to_resp(r) for r in _dem_repo.all(affaire_rst_id=uid)]


@router.post("", response_model=AffaireRstResponseSchema, status_code=201)
def create_affaire(body: AffaireRstCreateSchema):
    ref, annee, region, numero = _parse_reference_parts(body.reference)
    resolved_titulaire = _resolve_titulaire_by_rule(body.affaire_nge, body.numero_etude)
    resolved_statut_offre = _resolve_statut_offre_by_numero_etude(body.numero_etude)
    record = AffaireRstRecord(
        uid=0, reference=ref, annee=annee, region=region, numero=numero,
        client=body.client, titulaire=resolved_titulaire or body.titulaire,
        chantier=body.chantier, affaire_nge=body.affaire_nge,
        dossier_nom=body.dossier_nom, dossier_path=body.dossier_path,
        site=body.site, numero_etude=body.numero_etude, filiale=body.filiale, autre_reference=body.autre_reference,
        date_ouverture=body.date_ouverture, date_cloture=body.date_cloture,
        statut=body.statut, statut_offre=resolved_statut_offre or body.statut_offre, responsable=body.responsable,
        source_legacy_id=None,
    )
    if not record.dossier_nom:
        record.dossier_nom = build_affaire_folder_name_from_record(record)
    created = _repo.add(record)
    _dossiers.sync(created)
    if created.dossier_nom != (body.dossier_nom or "") or created.dossier_path != (body.dossier_path or ""):
        _persist_dossier_fields(created)
        refreshed = _repo.get_by_uid(created.uid)
        if refreshed is not None:
            created = refreshed
    return _to_response_payload(created)


@router.put("/{uid}", response_model=AffaireRstResponseSchema)
def update_affaire(uid: int, body: AffaireRstUpdateSchema):
    existing = _repo.get_by_uid(uid)
    if not existing: raise HTTPException(404, f"Affaire #{uid} introuvable")
    dossier_name_is_auto = is_auto_affaire_folder_name(existing.dossier_nom, existing)
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if "reference" in fields:
        ref, annee, region, numero = _parse_reference_parts(fields["reference"])
        fields["reference"] = ref
        fields["annee"] = annee
        fields["region"] = region
        fields["numero"] = numero

    effective_affaire_nge = fields.get("affaire_nge", existing.affaire_nge)
    effective_numero_etude = fields.get("numero_etude", existing.numero_etude)
    resolved_titulaire = _resolve_titulaire_by_rule(effective_affaire_nge, effective_numero_etude)
    resolved_statut_offre = _resolve_statut_offre_by_numero_etude(effective_numero_etude)
    if resolved_titulaire:
        fields["titulaire"] = resolved_titulaire
    if resolved_statut_offre:
        fields["statut_offre"] = resolved_statut_offre

    updated = _repo.update(uid, fields)
    previous_nom = updated.dossier_nom
    previous_path = updated.dossier_path
    if "dossier_nom" not in fields and dossier_name_is_auto:
        updated.dossier_nom = build_affaire_folder_name_from_record(updated)
    _dossiers.sync(updated)
    if updated.dossier_nom != previous_nom or updated.dossier_path != previous_path:
        _persist_dossier_fields(updated)
        refreshed = _repo.get_by_uid(uid)
        if refreshed is not None:
            updated = refreshed
    return _to_response_payload(updated)


@router.get("/{uid}/dossier-status")
def get_dossier_status(uid: int):
    record = _repo.get_by_uid(uid)
    if not record: raise HTTPException(404, f"Affaire #{uid} introuvable")
    return _dossiers.describe(record).to_dict()


@router.post("/{uid}/sync-dossier", response_model=AffaireRstResponseSchema)
def sync_dossier(uid: int):
    record = _repo.get_by_uid(uid)
    if not record: raise HTTPException(404, f"Affaire #{uid} introuvable")

    previous_nom = record.dossier_nom
    previous_path = record.dossier_path
    result = _dossiers.sync(record)
    if record.dossier_nom != previous_nom or record.dossier_path != previous_path:
        _persist_dossier_fields(record)
    if not result.success:
        raise HTTPException(409, result.error or "Synchronisation dossier impossible")

    refreshed = _repo.get_by_uid(uid)
    return _to_response_payload(refreshed or record)


@router.get("/{uid}/open-dossier")
def open_dossier(uid: int):
    record = _repo.get_by_uid(uid)
    if not record: raise HTTPException(404, f"Affaire #{uid} introuvable")

    result = _dossiers.open(record)
    if not result.success:
        raise HTTPException(409, result.error or "Ouverture dossier impossible")

    return {
        "success": True,
        "action": result.action,
        "folder_name": result.folder_name,
        "folder_path": result.folder_path,
    }


@router.delete("/{uid}", status_code=204)
def delete_affaire(uid: int):
    if not _repo.delete(uid): raise HTTPException(404, f"Affaire #{uid} introuvable")
