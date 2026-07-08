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
from io import BytesIO
from pathlib import Path
import re
import sqlite3
from typing import Literal, Optional
from fastapi import APIRouter, HTTPException, Query, File, UploadFile, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from app.models.affaire_rst import (
    AffaireRstCreateSchema, AffaireRstRecord,
    AffaireRstResponseSchema, AffaireRstUpdateSchema,
)
from app.models.demande_rst import DemandeRstResponseSchema
from app.repositories.affaires_rst_repository import AffairesRstRepository
from app.repositories.demandes_rst_repository import DemandesRstRepository
from app.services.affaire_dossier_service import AffaireDossierService
from app.services.demande_document_storage_service import (
    delete_affaire_document,
    list_affaire_plan_images,
    save_affaire_document,
    save_affaire_plan,
)
from app.services.site_map_capture_service import (
    build_geocode_response,
    capture_site_plan_png,
    capture_site_plan_png_at,
    load_itinerary_meta,
    load_site_plan_meta,
    save_itinerary_capture,
    save_site_plan_capture,
    SITE_PLAN_IMAGE_HEIGHT,
    SITE_PLAN_IMAGE_WIDTH,
)
from app.services.site_itinerary_service import build_site_plan_itinerary
from app.services.affaire_folder_naming import (
    build_affaire_folder_name_from_record,
    is_auto_affaire_folder_name,
)
from app.services.affaire_site_geo_service import build_affaire_site_geo, persist_affaire_site_geo
from app.services.affaire_contact_service import AffaireContactService

router    = APIRouter()
_repo     = AffairesRstRepository()
_dem_repo = DemandesRstRepository()
_dossiers = AffaireDossierService()
_contacts = AffaireContactService()

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
        maitre_ouvrage=r.maitre_ouvrage, maitre_oeuvre=r.maitre_oeuvre,
        site=r.site, adresse_ouvrage=r.adresse_ouvrage, numero_etude=r.numero_etude, affaire_nge=r.affaire_nge, filiale=r.filiale,
        autre_reference=r.autre_reference,
        dossier_nom=r.dossier_nom,
        dossier_nom_prevu=build_affaire_folder_name_from_record(r),
        dossier_path=r.dossier_path,
        site_lat=r.site_lat,
        site_lon=r.site_lon,
        site_geocode_label=r.site_geocode_label,
        date_ouverture=r.date_ouverture, date_cloture=r.date_cloture,
        date_debut_travaux_prevue=r.date_debut_travaux_prevue,
        statut=r.statut, statut_offre=r.statut_offre, responsable=r.responsable,
        source_legacy_id=r.source_legacy_id,
        created_at=r.created_at, updated_at=r.updated_at,
        nb_demandes=r.nb_demandes, nb_demandes_actives=r.nb_demandes_actives,
    )


def _to_response_payload(record: AffaireRstRecord, *, labo_code: str = "SP") -> dict:
    payload = _resp(record).model_dump(mode="json")
    payload.update(_dossiers.describe(record).to_dict())
    site_geo = build_affaire_site_geo(record, labo_code=labo_code)
    if site_geo:
        payload["site_geo"] = site_geo
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


@router.get("/{uid}")
def get_affaire(uid: int, labo_code: str = Query("SP", min_length=2, max_length=12)):
    r = _repo.get_by_uid(uid)
    if not r: raise HTTPException(404, f"Affaire #{uid} introuvable")
    return _to_response_payload(r, labo_code=labo_code)


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
        maitre_ouvrage=body.maitre_ouvrage or (body.client if body.client not in ("", "Non communiqué") else ""),
        maitre_oeuvre=body.maitre_oeuvre,
        chantier=body.chantier, affaire_nge=body.affaire_nge,
        dossier_nom=body.dossier_nom, dossier_path=body.dossier_path,
        site=body.site, adresse_ouvrage=body.adresse_ouvrage, numero_etude=body.numero_etude, filiale=body.filiale, autre_reference=body.autre_reference,
        date_ouverture=body.date_ouverture, date_cloture=body.date_cloture,
        date_debut_travaux_prevue=body.date_debut_travaux_prevue,
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
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None or k == "date_debut_travaux_prevue"}
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


@router.get("/{uid}/plan-images")
def list_affaire_plan_image_files(uid: int):
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(404, f"Affaire #{uid} introuvable")
    return list_affaire_plan_images(record.reference)


@router.post("/{uid}/documents/upload")
async def upload_affaire_document(
    uid: int,
    file: UploadFile = File(...),
    document_type: str = Form(""),
):
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(404, f"Affaire #{uid} introuvable")

    content = await file.read()
    doc_type = str(document_type or "").strip().lower()
    try:
        if doc_type == "plans":
            return save_affaire_plan(record.reference, content, file.filename or "plan")
        return save_affaire_document(record.reference, content, file.filename or "document")
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.delete("/{uid}/documents/file")
def delete_affaire_document_file(uid: int, stored_path: str = Query(..., min_length=1)):
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(404, f"Affaire #{uid} introuvable")

    try:
        delete_affaire_document(stored_path, record.reference)
    except FileNotFoundError:
        return {"ok": True, "deleted": False, "message": "Fichier déjà absent"}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    return {"ok": True, "deleted": True}


class SitePlanZonePointSchema(BaseModel):
    x: float = Field(..., ge=0, le=100)
    y: float = Field(..., ge=0, le=100)


class SitePlanZoneSchema(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    label: str = Field("", max_length=120)
    color: str = Field("#2563eb", max_length=16)
    points: list[SitePlanZonePointSchema] = Field(default_factory=list)


class SitePlanPinSchema(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    x: float = Field(..., ge=0, le=100)
    y: float = Field(..., ge=0, le=100)
    comment: str = Field("", max_length=240)


class SitePlanItineraryPointSchema(BaseModel):
    lat: float
    lon: float


class SitePlanCaptureSchema(BaseModel):
    address: str = Field(..., min_length=3)
    zoom: int = Field(16, ge=10, le=19)
    labo_code: str = Field("SP", min_length=2, max_length=12)
    lat: Optional[float] = None
    lon: Optional[float] = None
    map_center_lat: Optional[float] = None
    map_center_lon: Optional[float] = None
    address_label: Optional[str] = None
    zones: list[SitePlanZoneSchema] = Field(default_factory=list)
    pins: list[SitePlanPinSchema] = Field(default_factory=list)
    replace_stored_path: Optional[str] = None
    capture_kind: Literal["plan", "itinerary"] = "plan"
    orientation: Literal["portrait", "landscape"] = "portrait"
    itinerary_route: list[SitePlanItineraryPointSchema] = Field(default_factory=list)


@router.get("/{uid}/documents/site-plan/geocode")
def geocode_site_plan(
    uid: int,
    address: str = Query(..., min_length=3),
    labo_code: str = Query("SP", min_length=2, max_length=12),
):
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(404, f"Affaire #{uid} introuvable")
    try:
        return build_geocode_response(address, labo_code=labo_code)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Géocodage impossible : {exc}") from exc


@router.get("/{uid}/documents/site-plan/preview")
def preview_site_plan(
    uid: int,
    zoom: int = Query(16, ge=10, le=19),
    address: Optional[str] = Query(None, min_length=3),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    width: int = Query(SITE_PLAN_IMAGE_WIDTH, ge=256, le=2048),
    height: int = Query(SITE_PLAN_IMAGE_HEIGHT, ge=256, le=2048),
):
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(404, f"Affaire #{uid} introuvable")
    try:
        if lat is not None and lon is not None:
            content = capture_site_plan_png_at(
                lat,
                lon,
                zoom=zoom,
                draw_marker=False,
                width=width,
                height=height,
            )
        elif address:
            content, _location = capture_site_plan_png(address, zoom=zoom)
        else:
            raise HTTPException(400, "Adresse ou coordonnées obligatoires pour l’aperçu carte.")
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Capture carte impossible : {exc}") from exc
    return StreamingResponse(BytesIO(content), media_type="image/png")


@router.get("/{uid}/documents/site-plan/meta")
def get_site_plan_meta(
    uid: int,
    stored_path: str = Query(..., min_length=8),
    kind: Literal["plan", "itinerary"] = Query("plan"),
):
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(404, f"Affaire #{uid} introuvable")
    if kind == "itinerary":
        meta = load_itinerary_meta(stored_path, affaire_reference=record.reference)
    else:
        meta = load_site_plan_meta(stored_path, affaire_reference=record.reference)
    if not meta:
        raise HTTPException(404, "Métadonnées plan de situation introuvables")
    return meta


@router.get("/{uid}/documents/site-plan/itinerary")
def get_site_plan_itinerary(
    uid: int,
    lat: float = Query(...),
    lon: float = Query(...),
    labo_code: str = Query("SP", min_length=2, max_length=12),
):
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(404, f"Affaire #{uid} introuvable")
    try:
        return build_site_plan_itinerary(labo_code, lat, lon)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Calcul d'itinéraire impossible : {exc}") from exc


@router.post("/{uid}/documents/site-plan/capture")
def capture_site_plan_document(uid: int, body: SitePlanCaptureSchema):
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(404, f"Affaire #{uid} introuvable")
    try:
        location = None
        map_center = None
        if body.lat is not None and body.lon is not None:
            location = {
                "lat": body.lat,
                "lon": body.lon,
                "label": (body.address_label or body.address).strip(),
            }
        if body.map_center_lat is not None and body.map_center_lon is not None:
            map_center = {
                "lat": body.map_center_lat,
                "lon": body.map_center_lon,
            }
        if body.capture_kind == "itinerary":
            saved = save_itinerary_capture(
                record.reference,
                body.address,
                zoom=body.zoom,
                labo_code=body.labo_code,
                location=location,
                map_center=map_center,
                itinerary_route=[point.model_dump() for point in body.itinerary_route],
                replace_stored_path=body.replace_stored_path,
                orientation=body.orientation,
            )
        else:
            saved = save_site_plan_capture(
                record.reference,
                body.address,
                zoom=body.zoom,
                labo_code=body.labo_code,
                location=location,
                map_center=map_center,
                zones=[zone.model_dump() for zone in body.zones],
                pins=[pin.model_dump() for pin in body.pins],
                replace_stored_path=body.replace_stored_path,
                show_itinerary=False,
                itinerary_route=[],
                orientation=body.orientation,
            )
        capture = saved.get("capture") or {}
        if capture.get("lat") is not None and capture.get("lon") is not None:
            persist_affaire_site_geo(
                _repo,
                uid,
                lat=float(capture["lat"]),
                lon=float(capture["lon"]),
                label=str(capture.get("address_label") or body.address).strip(),
            )
        return saved
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Capture carte impossible : {exc}") from exc


class AffaireContactSchema(BaseModel):
    id: int | None = None
    affaire_rst_id: int | None = None
    full_name: str = ""
    role_label: str = ""
    organisation: str = ""
    phone: str = ""
    email: str = ""
    notes: str = ""
    display_label: str = ""
    agence_code: str = ""
    agence_label: str = ""
    region_code: str = ""
    region_label: str = ""
    source_type: str = ""
    source_ref: str = ""
    use_count: int = 0
    last_used_at: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class AffaireContactWriteSchema(BaseModel):
    full_name: str = ""
    role_label: str = ""
    organisation: str = ""
    phone: str = ""
    email: str = ""
    notes: str = ""
    display_label: str = ""
    source_type: str = "manual"
    source_ref: str = ""


def _require_affaire(uid: int) -> AffaireRstRecord:
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(404, f"Affaire #{uid} introuvable")
    return record


@router.get("/{uid}/contacts", response_model=list[AffaireContactSchema])
def list_affaire_contacts(
    uid: int,
    q: str = Query("", description="Recherche nom, fonction, entreprise, téléphone…"),
    organisation: str = Query("", description="Filtrer par entreprise"),
    role_label: str = Query("", description="Filtrer par fonction"),
):
    _require_affaire(uid)
    return _contacts.list_contacts(uid, q=q, organisation=organisation, role_label=role_label)


@router.get("/{uid}/contacts/organisations", response_model=list[str])
def list_affaire_contact_organisations(uid: int):
    _require_affaire(uid)
    return _contacts.list_organisations(uid)


@router.post("/{uid}/contacts", response_model=AffaireContactSchema, status_code=201)
def create_affaire_contact(uid: int, body: AffaireContactWriteSchema):
    _require_affaire(uid)
    try:
        return _contacts.create_contact(uid, body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.put("/{uid}/contacts/{contact_id}", response_model=AffaireContactSchema)
def update_affaire_contact(uid: int, contact_id: int, body: AffaireContactWriteSchema):
    _require_affaire(uid)
    try:
        return _contacts.update_contact(uid, contact_id, body.model_dump())
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/{uid}/contacts/{contact_id}/touch", response_model=AffaireContactSchema)
def touch_affaire_contact(uid: int, contact_id: int):
    _require_affaire(uid)
    touched = _contacts.touch_contact(uid, contact_id)
    if not touched:
        raise HTTPException(404, f"Contact #{contact_id} introuvable")
    return touched


@router.delete("/{uid}/contacts/{contact_id}", status_code=204)
def delete_affaire_contact(uid: int, contact_id: int):
    _require_affaire(uid)
    try:
        _contacts.delete_contact(uid, contact_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.delete("/{uid}", status_code=204)
def delete_affaire(uid: int):
    if not _repo.delete(uid): raise HTTPException(404, f"Affaire #{uid} introuvable")
