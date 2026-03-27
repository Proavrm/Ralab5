"""
api/passations.py
API routes for chantier handovers.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.passation import (
    ACTION_PRIORITY_OPTIONS,
    ACTION_STATUS_OPTIONS,
    DEFAULT_DOCUMENT_TYPES,
    OPERATION_TYPES,
    PASSATION_SOURCES,
    PHASE_OPERATION_OPTIONS,
    PassationCreateSchema,
    PassationResponseSchema,
    PassationUpdateSchema,
)
from app.repositories.affaires_rst_repository import AffairesRstRepository
from app.repositories.passations_repository import PassationsRepository


router = APIRouter()
_repo = PassationsRepository()
_aff_repo = AffairesRstRepository()


@router.get("", response_model=list[PassationResponseSchema])
def list_passations(
    affaire_rst_id: Optional[int] = Query(None),
    source: Optional[str] = Query(None),
    operation_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    rows = _repo.list(
        affaire_rst_id=affaire_rst_id,
        source=source,
        operation_type=operation_type,
        search=search,
    )
    return [_repo.to_response(row) for row in rows]


@router.get("/next-ref")
def next_reference():
    return {"reference": _repo.next_reference()}


@router.get("/filters")
def filters():
    payload = _repo.filters()
    payload.update(
        {
            "source_options": PASSATION_SOURCES,
            "operation_type_options": OPERATION_TYPES,
            "phase_options": PHASE_OPERATION_OPTIONS,
            "document_type_options": DEFAULT_DOCUMENT_TYPES,
            "action_priority_options": ACTION_PRIORITY_OPTIONS,
            "action_status_options": ACTION_STATUS_OPTIONS,
        }
    )
    return payload


@router.get("/bootstrap/{affaire_uid}")
def bootstrap_from_affaire(affaire_uid: int):
    affaire = _aff_repo.get_by_uid(affaire_uid)
    if not affaire:
        raise HTTPException(404, f"Affaire #{affaire_uid} introuvable")
    return {
        "affaire_rst_id": affaire.uid,
        "affaire_ref": affaire.reference,
        "client": affaire.client,
        "chantier": affaire.chantier,
        "numero_affaire_nge": affaire.affaire_nge,
        "entreprise_responsable": affaire.titulaire,
        "responsable": affaire.responsable,
        "agence": "",
        "numero_etude": "",
    }




@router.get("/{uid}/demande-prefill")
def demande_prefill(uid: int):
	row = _repo.get_by_uid(uid)
	if not row:
		raise HTTPException(404, f"Passation #{uid} introuvable")
	modules = []
	if row.besoins_terrain.strip():
		modules.extend(["interventions", "essais_terrain"])
	if row.besoins_laboratoire.strip():
		modules.extend(["echantillons", "essais_laboratoire"])
	if row.besoins_etude.strip():
		modules.append("etude_technique")
	if row.besoins_g3.strip():
		modules.append("g3")
	if row.besoins_essais_externes.strip():
		modules.append("essais_externes")
	if row.notes.strip() or row.synthese.strip():
		modules.append("documents")
	modules.append("planning")
	modules = sorted(set(modules))
	return {
		"demande": {
			"affaire_rst_id": row.affaire_rst_id,
			"type_mission": "À définir",
			"nature": row.operation_type or row.description_generale or "",
			"description": row.synthese or row.description_generale or row.contexte_marche or "",
			"demandeur": row.responsable or "",
		},
		"preparation": {
			"phase_operation": row.phase_operation or "À qualifier",
			"contexte_operationnel": row.contexte_marche or "",
			"objectifs": row.besoins_etude or row.besoins_laboratoire or row.besoins_terrain or "",
			"points_vigilance": row.points_sensibles or "",
			"contraintes_delais": row.synthese or "",
			"ressources_notes": row.besoins_ressources_humaines or row.besoins_equipements_specifiques or "",
			"commentaires": row.notes or "",
		},
		"modules": modules,
	}


@router.get("/{uid}", response_model=PassationResponseSchema)
def get_passation(uid: int):
    row = _repo.get_by_uid(uid)
    if not row:
        raise HTTPException(404, f"Passation #{uid} introuvable")
    return _repo.to_response(row)


@router.post("", response_model=PassationResponseSchema, status_code=201)
def create_passation(body: PassationCreateSchema):
    if not _aff_repo.get_by_uid(body.affaire_rst_id):
        raise HTTPException(400, f"Affaire #{body.affaire_rst_id} introuvable")
    row = _repo.create(body)
    return _repo.to_response(row)


@router.put("/{uid}", response_model=PassationResponseSchema)
def update_passation(uid: int, body: PassationUpdateSchema):
    current = _repo.get_by_uid(uid)
    if not current:
        raise HTTPException(404, f"Passation #{uid} introuvable")
    if body.affaire_rst_id is not None and not _aff_repo.get_by_uid(body.affaire_rst_id):
        raise HTTPException(400, f"Affaire #{body.affaire_rst_id} introuvable")
    row = _repo.update(uid, body)
    return _repo.to_response(row)


@router.delete("/{uid}", status_code=204)
def delete_passation(uid: int):
    if not _repo.delete(uid):
        raise HTTPException(404, f"Passation #{uid} introuvable")
