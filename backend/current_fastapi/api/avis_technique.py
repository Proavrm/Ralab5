"""Routes API — Avis technique (templates data-driven + instances)."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.core.api_security import current_request_user_label
from app.models.avis_technique import (
    AVIS_STATUTS,
    BLOCK_TYPES,
    AvisInstanceCreateSchema,
    AvisInstanceUpdateSchema,
    AvisTemplatePatchSchema,
    AvisTemplateUpsertSchema,
)
from app.repositories.avis_technique_repository import AvisTechniqueRepository
from app.services.avis_technique_bindings import SOURCE_REGISTRY
from app.services.avis_technique_docx_export import build_avis_docx_bytes, sanitize_docx_basename

router = APIRouter()
_repo = AvisTechniqueRepository()


def _user() -> str:
    return current_request_user_label()


@router.get("/meta")
def get_meta():
    return {
        "block_types": list(BLOCK_TYPES),
        "statuts": list(AVIS_STATUTS),
        "sources": list(SOURCE_REGISTRY),
    }


@router.post("/templates/seed")
def seed_templates(force: bool = False):
    return {"templates": _repo.seed_templates_from_disk(force=force)}


@router.get("/templates")
def list_templates(active_only: bool = False):
    return _repo.list_templates(active_only=active_only)


@router.get("/templates/{template_id}")
def get_template(template_id: int):
    row = _repo.get_template(template_id)
    if not row:
        raise HTTPException(404, f"Template #{template_id} introuvable")
    return row


@router.put("/templates")
def upsert_template(body: AvisTemplateUpsertSchema):
    try:
        return _repo.upsert_template(body)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.patch("/templates/{template_id}")
def patch_template(template_id: int, body: AvisTemplatePatchSchema):
    row = _repo.patch_template(template_id, body)
    if not row:
        raise HTTPException(404, f"Template #{template_id} introuvable")
    return row


@router.get("/templates/{template_id}/export")
def export_template(template_id: int):
    payload = _repo.export_template_payload(template_id)
    if not payload:
        raise HTTPException(404, f"Template #{template_id} introuvable")
    return payload


@router.post("/templates/import")
def import_template(payload: dict[str, Any]):
    try:
        return _repo.import_template_payload(payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/instances")
def list_instances(demande_id: Optional[int] = None):
    return _repo.list_instances(demande_id=demande_id)


@router.post("/instances", status_code=201)
def create_instance(body: AvisInstanceCreateSchema):
    try:
        # Ensure seed templates exist before first create
        if not _repo.list_templates(active_only=True):
            _repo.seed_templates_from_disk(force=False)
        return _repo.create_instance(body, user_name=_user())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/instances/{instance_id}")
def get_instance(instance_id: int):
    row = _repo.get_instance(instance_id, with_template=True)
    if not row:
        raise HTTPException(404, f"Avis #{instance_id} introuvable")
    return row


@router.patch("/instances/{instance_id}")
def update_instance(instance_id: int, body: AvisInstanceUpdateSchema):
    row = _repo.update_instance(instance_id, body)
    if not row:
        raise HTTPException(404, f"Avis #{instance_id} introuvable")
    return row


@router.post("/instances/{instance_id}/refresh-bindings")
def refresh_bindings(instance_id: int, only_empty: bool = True):
    row = _repo.refresh_bindings(instance_id, only_empty=only_empty)
    if not row:
        raise HTTPException(404, f"Avis #{instance_id} introuvable")
    return row


@router.get("/instances/{instance_id}/bindings")
def get_bindings(instance_id: int):
    row = _repo.resolve_instance_bindings(instance_id)
    if not row:
        raise HTTPException(404, f"Avis #{instance_id} introuvable")
    return row


@router.get("/instances/{instance_id}/export.docx")
def export_instance_docx(instance_id: int):
    row = _repo.get_instance(instance_id, with_template=True)
    if not row:
        raise HTTPException(404, f"Avis #{instance_id} introuvable")
    try:
        data = build_avis_docx_bytes(row, row.get("template"))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc)) from exc
    basename = sanitize_docx_basename(row.get("reference") or row.get("titre") or f"avis_{instance_id}")
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{basename}.docx"'},
    )
