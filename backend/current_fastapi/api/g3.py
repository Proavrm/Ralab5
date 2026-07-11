"""Routes API pour le module G3."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException

from app.models.g3 import (
    G3DeliverableCreateSchema,
    G3DeliverableUpdateSchema,
    G3DocumentCreateSchema,
    G3DocumentUpdateSchema,
    G3DocumentsReplaceSchema,
    G3HoldPointCreateSchema,
    G3HoldPointUpdateSchema,
    G3InterventionCreateSchema,
    G3InterventionUpdateSchema,
    G3MissionCreateSchema,
    G3MissionUpdateSchema,
    G3NoticeCreateSchema,
    G3NoticeDraftRequestSchema,
    G3NoticeDraftSchema,
    G3NoticeUpdateSchema,
    G3ObjectiveCreateSchema,
    G3ObjectiveUpdateSchema,
    G3PhotoCreateSchema,
    G3PhotoUpdateSchema,
    G3PlanningOverviewSchema,
    G3ProgrammeDocumentSchema,
    G3RealizedInterventionCreateSchema,
    G3TestCreateSchema,
    G3TestUpdateSchema,
    G3ZoneCreateSchema,
    G3ZoneUpdateSchema,
)
from app.models.g3_catalogs import G3_CATALOGS
from app.repositories.g3_repository import G3Repository
from app.services.g3_deliverable_service import build_deliverable_html, build_g3008_html
from app.services.g3_document_service import build_g3_documents_table_html
from app.services.g3_notice_service import build_notice_draft
from app.services.g3_planning_service import build_g3_planning_overview
from app.services.g3_programme_service import build_g3002_html

router = APIRouter()
_repo = G3Repository()


def _current_user_name() -> str:
    return "Utilisateur"


@router.get("/catalogs")
def get_catalogs():
    return G3_CATALOGS


@router.get("/missions")
def list_missions(
    affaire_rst_id: Optional[int] = None,
    demande_id: Optional[int] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
):
    return _repo.list_missions(
        affaire_rst_id=affaire_rst_id,
        demande_id=demande_id,
        status=status,
        search=search,
    )


@router.get("/missions/by-demande/{demande_id}")
def get_missions_for_demande(demande_id: int):
    return _repo.list_missions(demande_id=demande_id)


@router.get("/demandes/{demande_id}/prefill")
def get_demande_prefill(demande_id: int):
    ctx = _repo.get_demande_context(demande_id)
    if not ctx:
        raise HTTPException(404, f"Demande #{demande_id} introuvable")
    return {
        "demande_id": int(ctx["id"]),
        "affaire_rst_id": int(ctx["affaire_rst_id"]),
        "demande_ref": str(ctx.get("reference") or ""),
        "affaire_ref": str(ctx.get("affaire_ref") or ""),
        "title": str(ctx.get("description") or ctx.get("nature") or ""),
        "client": str(ctx.get("client") or ""),
        "chantier": str(ctx.get("chantier") or ctx.get("site") or ""),
        "location": str(ctx.get("adresse_ouvrage") or ctx.get("site") or ""),
        "description": str(ctx.get("description") or ""),
        "main_objective": str(ctx.get("type_prestation_attendue") or ""),
        "rst_responsible": str(ctx.get("responsable_affaire") or ""),
        "laboratoire": str(ctx.get("service_interne") or ctx.get("labo_code") or ""),
        "moa": str(ctx.get("maitre_ouvrage") or ""),
        "moe": str(ctx.get("maitre_oeuvre") or ""),
    }


@router.post("/missions")
def create_mission(body: G3MissionCreateSchema):
    try:
        return _repo.create_mission(body, user_name=_current_user_name())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/missions/{mission_id}")
def get_mission(mission_id: int):
    mission = _repo.get_mission(mission_id)
    if not mission:
        raise HTTPException(404, f"Mission G3 #{mission_id} introuvable")
    return mission


@router.patch("/missions/{mission_id}")
def update_mission(mission_id: int, body: G3MissionUpdateSchema):
    mission = _repo.update_mission(mission_id, body, user_name=_current_user_name())
    if not mission:
        raise HTTPException(404, f"Mission G3 #{mission_id} introuvable")
    return mission


@router.post("/missions/{mission_id}/programme/default")
def create_default_programme(mission_id: int):
    try:
        rows = _repo.create_default_programme(mission_id, user_name=_current_user_name())
        return {"created": rows, "mission": _repo.get_mission(mission_id)}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/missions/{mission_id}/programme")
def list_programme(mission_id: int):
    mission = _repo.get_mission(mission_id)
    if not mission:
        raise HTTPException(404, f"Mission G3 #{mission_id} introuvable")
    return mission.planned_interventions


@router.post("/missions/{mission_id}/programme")
def add_programme_item(mission_id: int, body: G3InterventionCreateSchema):
    mission = _repo.get_mission(mission_id)
    if not mission:
        raise HTTPException(404, f"Mission G3 #{mission_id} introuvable")
    return _repo.create_planned_intervention(
        mission_id,
        body.model_dump(),
        user_name=_current_user_name(),
    )


@router.patch("/interventions/{intervention_id}")
def update_intervention(intervention_id: int, body: G3InterventionUpdateSchema):
    row = _repo.update_intervention(
        intervention_id,
        body.model_dump(exclude_unset=True),
        user_name=_current_user_name(),
    )
    if not row:
        raise HTTPException(404, f"Intervention G3 #{intervention_id} introuvable")
    return row


@router.delete("/interventions/{intervention_id}")
def delete_intervention(intervention_id: int):
    if not _repo.delete_intervention(intervention_id, user_name=_current_user_name()):
        raise HTTPException(404, f"Intervention G3 #{intervention_id} introuvable")
    return {"ok": True}


@router.post("/interventions/{intervention_id}/promote")
def promote_intervention(intervention_id: int):
    try:
        return _repo.promote_to_realized(intervention_id, user_name=_current_user_name())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/missions/{mission_id}/interventions/realized")
def create_realized_intervention(mission_id: int, body: G3RealizedInterventionCreateSchema):
    mission = _repo.get_mission(mission_id)
    if not mission:
        raise HTTPException(404, f"Mission G3 #{mission_id} introuvable")
    return _repo.create_realized_intervention(
        mission_id,
        body.model_dump(),
        user_name=_current_user_name(),
    )


@router.get("/missions/{mission_id}/documents/g3002", response_model=G3ProgrammeDocumentSchema)
def generate_g3002(mission_id: int):
    mission = _repo.get_mission(mission_id)
    if not mission:
        raise HTTPException(404, f"Mission G3 #{mission_id} introuvable")
    html_doc = build_g3002_html(mission)
    return G3ProgrammeDocumentSchema(html=html_doc)


@router.get("/missions/{mission_id}/documents/report-table", response_model=G3ProgrammeDocumentSchema)
def generate_documents_table(mission_id: int):
    mission = _repo.get_mission(mission_id)
    if not mission:
        raise HTTPException(404, f"Mission G3 #{mission_id} introuvable")
    html_doc = build_g3_documents_table_html(mission)
    return G3ProgrammeDocumentSchema(html=html_doc, title="Tableau documents G3")


# ── Zones ─────────────────────────────────────────────────────────────────────

@router.post("/missions/{mission_id}/zones")
def create_zone(mission_id: int, body: G3ZoneCreateSchema):
    try:
        return _repo.create_zone(mission_id, body.model_dump(), user_name=_current_user_name())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.patch("/zones/{zone_id}")
def update_zone(zone_id: int, body: G3ZoneUpdateSchema):
    row = _repo.update_zone(zone_id, body.model_dump(exclude_unset=True), user_name=_current_user_name())
    if not row:
        raise HTTPException(404, f"Zone G3 #{zone_id} introuvable")
    return row


@router.delete("/zones/{zone_id}")
def delete_zone(zone_id: int):
    if not _repo.delete_zone(zone_id, user_name=_current_user_name()):
        raise HTTPException(404, f"Zone G3 #{zone_id} introuvable")
    return {"ok": True}


# ── Documents ─────────────────────────────────────────────────────────────────

@router.post("/missions/{mission_id}/documents")
def create_document(mission_id: int, body: G3DocumentCreateSchema):
    try:
        return _repo.create_document(mission_id, body.model_dump(), user_name=_current_user_name())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.put("/missions/{mission_id}/documents")
def replace_mission_documents(mission_id: int, body: G3DocumentsReplaceSchema):
    mission = _repo.get_mission(mission_id)
    if not mission:
        raise HTTPException(404, f"Mission G3 #{mission_id} introuvable")
    payload = [item.model_dump() for item in body.documents]
    documents = _repo.replace_documents_for_mission(mission_id, payload, user_name=_current_user_name())
    return {"documents": documents, "mission": _repo.get_mission(mission_id)}


@router.patch("/documents/{document_id}")
def update_document(document_id: int, body: G3DocumentUpdateSchema):
    row = _repo.update_document(document_id, body.model_dump(exclude_unset=True), user_name=_current_user_name())
    if not row:
        raise HTTPException(404, f"Document G3 #{document_id} introuvable")
    return row


@router.delete("/documents/{document_id}")
def delete_document(document_id: int):
    if not _repo.delete_document(document_id, user_name=_current_user_name()):
        raise HTTPException(404, f"Document G3 #{document_id} introuvable")
    return {"ok": True}


# ── Objectifs ─────────────────────────────────────────────────────────────────

@router.post("/missions/{mission_id}/objectives/default")
def create_default_objectives(mission_id: int):
    try:
        rows = _repo.create_default_objectives(mission_id, user_name=_current_user_name())
        return {"created": rows, "mission": _repo.get_mission(mission_id)}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/missions/{mission_id}/objectives")
def create_objective(mission_id: int, body: G3ObjectiveCreateSchema):
    try:
        return _repo.create_objective(mission_id, body.model_dump(), user_name=_current_user_name())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.patch("/objectives/{objective_id}")
def update_objective(objective_id: int, body: G3ObjectiveUpdateSchema):
    row = _repo.update_objective(objective_id, body.model_dump(exclude_unset=True), user_name=_current_user_name())
    if not row:
        raise HTTPException(404, f"Objectif G3 #{objective_id} introuvable")
    return row


@router.delete("/objectives/{objective_id}")
def delete_objective(objective_id: int):
    if not _repo.delete_objective(objective_id, user_name=_current_user_name()):
        raise HTTPException(404, f"Objectif G3 #{objective_id} introuvable")
    return {"ok": True}


# ── Essais / contrôles ────────────────────────────────────────────────────────

@router.post("/missions/{mission_id}/tests")
def create_test(mission_id: int, body: G3TestCreateSchema):
    try:
        return _repo.create_test(mission_id, body.model_dump(), user_name=_current_user_name())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.patch("/tests/{test_id}")
def update_test(test_id: int, body: G3TestUpdateSchema):
    row = _repo.update_test(test_id, body.model_dump(exclude_unset=True), user_name=_current_user_name())
    if not row:
        raise HTTPException(404, f"Essai G3 #{test_id} introuvable")
    return row


@router.delete("/tests/{test_id}")
def delete_test(test_id: int):
    if not _repo.delete_test(test_id, user_name=_current_user_name()):
        raise HTTPException(404, f"Essai G3 #{test_id} introuvable")
    return {"ok": True}


# ── Photos ────────────────────────────────────────────────────────────────────

@router.post("/missions/{mission_id}/photos")
def create_photo(mission_id: int, body: G3PhotoCreateSchema):
    try:
        return _repo.create_photo(mission_id, body.model_dump(), user_name=_current_user_name())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.patch("/photos/{photo_id}")
def update_photo(photo_id: int, body: G3PhotoUpdateSchema):
    row = _repo.update_photo(photo_id, body.model_dump(exclude_unset=True), user_name=_current_user_name())
    if not row:
        raise HTTPException(404, f"Photo G3 #{photo_id} introuvable")
    return row


@router.delete("/photos/{photo_id}")
def delete_photo(photo_id: int):
    if not _repo.delete_photo(photo_id, user_name=_current_user_name()):
        raise HTTPException(404, f"Photo G3 #{photo_id} introuvable")
    return {"ok": True}


# ── Avis G3 ───────────────────────────────────────────────────────────────────

@router.post("/missions/{mission_id}/notices/draft", response_model=G3NoticeDraftSchema)
def generate_notice_draft(mission_id: int, body: G3NoticeDraftRequestSchema):
    mission = _repo.get_mission(mission_id)
    if not mission:
        raise HTTPException(404, f"Mission G3 #{mission_id} introuvable")
    return build_notice_draft(
        mission,
        notice_type=body.type,
        zone_id=body.zone_id,
        intervention_id=body.intervention_id,
    )


@router.post("/missions/{mission_id}/notices")
def create_notice(mission_id: int, body: G3NoticeCreateSchema):
    try:
        return _repo.create_notice(mission_id, body.model_dump(), user_name=_current_user_name())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.patch("/notices/{notice_id}")
def update_notice(notice_id: int, body: G3NoticeUpdateSchema):
    row = _repo.update_notice(notice_id, body.model_dump(exclude_unset=True), user_name=_current_user_name())
    if not row:
        raise HTTPException(404, f"Avis G3 #{notice_id} introuvable")
    return row


@router.delete("/notices/{notice_id}")
def delete_notice(notice_id: int):
    if not _repo.delete_notice(notice_id, user_name=_current_user_name()):
        raise HTTPException(404, f"Avis G3 #{notice_id} introuvable")
    return {"ok": True}


# ── Points d'arrêt ────────────────────────────────────────────────────────────

@router.post("/missions/{mission_id}/hold-points/default")
def create_default_hold_points(mission_id: int):
    try:
        rows = _repo.create_default_hold_points(mission_id, user_name=_current_user_name())
        return {"created": rows, "mission": _repo.get_mission(mission_id)}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/missions/{mission_id}/hold-points")
def create_hold_point(mission_id: int, body: G3HoldPointCreateSchema):
    try:
        return _repo.create_hold_point(mission_id, body.model_dump(), user_name=_current_user_name())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.patch("/hold-points/{hold_id}")
def update_hold_point(hold_id: int, body: G3HoldPointUpdateSchema):
    row = _repo.update_hold_point(hold_id, body.model_dump(exclude_unset=True), user_name=_current_user_name())
    if not row:
        raise HTTPException(404, f"Point d'arrêt G3 #{hold_id} introuvable")
    return row


@router.delete("/hold-points/{hold_id}")
def delete_hold_point(hold_id: int):
    if not _repo.delete_hold_point(hold_id, user_name=_current_user_name()):
        raise HTTPException(404, f"Point d'arrêt G3 #{hold_id} introuvable")
    return {"ok": True}


# ── Planning mission ──────────────────────────────────────────────────────────

@router.get("/missions/{mission_id}/planning", response_model=G3PlanningOverviewSchema)
def get_mission_planning(mission_id: int):
    mission = _repo.get_mission(mission_id)
    if not mission:
        raise HTTPException(404, f"Mission G3 #{mission_id} introuvable")
    return build_g3_planning_overview(mission)


# ── Livrables / rapport ───────────────────────────────────────────────────────

@router.post("/missions/{mission_id}/deliverables/default")
def create_default_deliverables(mission_id: int):
    try:
        rows = _repo.create_default_deliverables(mission_id, user_name=_current_user_name())
        return {"created": rows, "mission": _repo.get_mission(mission_id)}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/missions/{mission_id}/deliverables")
def create_deliverable(mission_id: int, body: G3DeliverableCreateSchema):
    try:
        return _repo.create_deliverable(mission_id, body.model_dump(), user_name=_current_user_name())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.patch("/deliverables/{deliverable_id}")
def update_deliverable(deliverable_id: int, body: G3DeliverableUpdateSchema):
    row = _repo.update_deliverable(
        deliverable_id,
        body.model_dump(exclude_unset=True),
        user_name=_current_user_name(),
    )
    if not row:
        raise HTTPException(404, f"Livrable G3 #{deliverable_id} introuvable")
    return row


@router.delete("/deliverables/{deliverable_id}")
def delete_deliverable(deliverable_id: int):
    if not _repo.delete_deliverable(deliverable_id, user_name=_current_user_name()):
        raise HTTPException(404, f"Livrable G3 #{deliverable_id} introuvable")
    return {"ok": True}


@router.get("/deliverables/{deliverable_id}/preview", response_model=G3ProgrammeDocumentSchema)
def preview_deliverable(deliverable_id: int):
    deliverable = _repo.get_deliverable(deliverable_id)
    if not deliverable or not deliverable.mission_id:
        raise HTTPException(404, f"Livrable G3 #{deliverable_id} introuvable")
    mission = _repo.get_mission(int(deliverable.mission_id))
    if not mission:
        raise HTTPException(404, f"Mission G3 #{deliverable.mission_id} introuvable")
    html_doc = build_deliverable_html(mission, deliverable.type)
    _repo.mark_deliverable_generated(deliverable_id, user_name=_current_user_name())
    return G3ProgrammeDocumentSchema(html=html_doc, title=deliverable.title or deliverable.type)


@router.get("/missions/{mission_id}/report/g3008", response_model=G3ProgrammeDocumentSchema)
def generate_g3008_report(mission_id: int):
    mission = _repo.get_mission(mission_id)
    if not mission:
        raise HTTPException(404, f"Mission G3 #{mission_id} introuvable")
    html_doc = build_g3008_html(mission)
    return G3ProgrammeDocumentSchema(html=html_doc, title="G3008 Rapport final G3")
