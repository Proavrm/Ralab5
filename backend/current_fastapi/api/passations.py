"""
api/passations.py
API routes for chantier handovers.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.passation import (
    ACTION_PRIORITY_OPTIONS,
    PASSATION_DEMANDE_MODULE_CODES,
    PASSATION_PARTICIPANT_ROLES,
    PASSATION_STARTUP_ITEM_CODES,
    PASSATION_STRUCTURED_NEED_CODES,
    PASSATION_WORKSTREAM_CODES,
    PERIMETER_STATUS_OPTIONS,
    ROLE_ASSIGNMENT_STATUS_OPTIONS,
    STRUCTURED_NEED_STATUS_OPTIONS,
    PASSATION_ROLE_CODES,
    ACTION_STATUS_OPTIONS,
    DEFAULT_DOCUMENT_TYPES,
    OPERATION_TYPES,
    PASSATION_SOURCES,
    PHASE_OPERATION_OPTIONS,
    PassationCreateSchema,
    PassationResponseSchema,
    PassationUpdateSchema,
    WORKFLOW_DECISION_OPTIONS,
    WORKFLOW_STATUS_OPTIONS,
)
from app.repositories.affaires_rst_repository import AffairesRstRepository
from app.repositories.demande_preparation_repository import DemandePreparationRepository
from app.repositories.demandes_rst_repository import DemandesRstRepository
from app.repositories.passations_repository import PassationsRepository
from app.services.passation_delta_service import (
    build_agency_proposal,
    build_demande_signature,
    build_readiness_blocks,
    infer_labo_code,
    infer_modules,
    is_protected_a432,
)


router = APIRouter()
_repo = PassationsRepository()
_aff_repo = AffairesRstRepository()
_demandes_repo = DemandesRstRepository()
_prep_repo = DemandePreparationRepository()


def _get_demandes_root() -> Path:
    env = os.environ.get("RALAB_DEMANDES_ROOT", "").strip()
    if env:
      p = Path(env)
      if p.exists() and p.is_dir():
          return p

    username = os.environ.get("USERNAME", "").strip()
    candidates = [
        Path.home() / "NGE" / "Labo ARS - Documents" / "01 - Demandes",
        Path.home() / "OneDrive" / "NGE" / "Labo ARS - Documents" / "01 - Demandes",
        Path("C:/Users") / username / "OneDrive - NGE" / "Labo ARS - Documents" / "01 - Demandes",
    ]
    for candidate in candidates:
        if candidate.exists() and candidate.is_dir():
            return candidate

    fallback = Path(__file__).resolve().parents[2] / "01 - Demandes"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


def _open_folder_in_explorer(path: Path) -> None:
    if sys.platform == "win32":
        os.startfile(str(path))
        return
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
        return
    subprocess.Popen(["xdg-open", str(path)])


def _find_folder_by_affaire_prefix(root: Path, affaire_ref: str) -> Path | None:
    prefix = str(affaire_ref or "").strip().casefold()
    if not prefix or not root.exists():
        return None

    candidates: list[Path] = []
    for child in root.iterdir():
        if not child.is_dir():
            continue
        if child.name.casefold().startswith(prefix):
            candidates.append(child)

    if not candidates:
        return None

    # Prefer shortest name (usually exact base) then alphabetical for determinism.
    candidates.sort(key=lambda p: (len(p.name), p.name.casefold()))
    return candidates[0]


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
            "role_code_options": PASSATION_ROLE_CODES,
            "role_assignment_status_options": ROLE_ASSIGNMENT_STATUS_OPTIONS,
            "participant_role_options": PASSATION_PARTICIPANT_ROLES,
            "perimeter_status_options": PERIMETER_STATUS_OPTIONS,
            "workstream_code_options": PASSATION_WORKSTREAM_CODES,
            "startup_item_code_options": PASSATION_STARTUP_ITEM_CODES,
            "structured_need_code_options": PASSATION_STRUCTURED_NEED_CODES,
            "structured_need_status_options": STRUCTURED_NEED_STATUS_OPTIONS,
            "demande_module_code_options": PASSATION_DEMANDE_MODULE_CODES,
            "workflow_status_options": WORKFLOW_STATUS_OPTIONS,
            "workflow_decision_options": WORKFLOW_DECISION_OPTIONS,
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


@router.get("/{uid}/organization-proposal")
def organization_proposal(uid: int):
    row = _repo.get_by_uid(uid)
    if not row:
        raise HTTPException(404, f"Passation #{uid} introuvable")

    proposal = build_agency_proposal(row.agence)

    existing_role_codes = {
        item.role_code
        for item in (row.role_assignments or [])
        if str(item.role_code or "").strip()
    }
    existing_startup_codes = {
        item.item_code
        for item in (row.startup_items or [])
        if str(item.item_code or "").strip()
    }

    roles_to_add = [
        item for item in proposal["roles"]
        if item["role_code"] not in existing_role_codes
    ]
    startup_to_add = [
        item for item in proposal["startup_items"]
        if item["item_code"] not in existing_startup_codes
    ]

    return {
        "agency_key": proposal["agency_key"],
        "roles": roles_to_add,
        "startup_items": startup_to_add,
        "all_roles": proposal["roles"],
        "all_startup_items": proposal["startup_items"],
    }


@router.post("/{uid}/organization-proposal/apply")
def apply_organization_proposal(uid: int):
    row = _repo.get_by_uid(uid)
    if not row:
        raise HTTPException(404, f"Passation #{uid} introuvable")

    proposal = build_agency_proposal(row.agence)
    role_assignments = list(row.role_assignments or [])
    startup_items = list(row.startup_items or [])

    existing_role_codes = {item.role_code for item in role_assignments if str(item.role_code or "").strip()}
    existing_startup_codes = {item.item_code for item in startup_items if str(item.item_code or "").strip()}

    for role_item in proposal["roles"]:
        if role_item["role_code"] in existing_role_codes:
            continue
        role_assignments.append(role_item)

    for startup_item in proposal["startup_items"]:
        if startup_item["item_code"] in existing_startup_codes:
            continue
        startup_items.append(startup_item)

    row_updated = _repo.update(
        uid,
        PassationUpdateSchema(
            role_assignments=role_assignments,
            startup_items=startup_items,
        ),
    )

    return {
        "passation_uid": uid,
        "agency_key": proposal["agency_key"],
        "added_roles": len(role_assignments) - len(row.role_assignments or []),
        "added_startup_items": len(startup_items) - len(row.startup_items or []),
        "role_assignments": [item.model_dump(mode="json") for item in _repo.to_response(row_updated).role_assignments],
        "startup_items": [item.model_dump(mode="json") for item in _repo.to_response(row_updated).startup_items],
    }


@router.get("/{uid}/readiness")
def readiness(uid: int):
    row = _repo.get_by_uid(uid)
    if not row:
        raise HTTPException(404, f"Passation #{uid} introuvable")

    blocks = build_readiness_blocks(row)
    return {
        "passation_uid": uid,
        "ready": len(blocks) == 0,
        "blocks": blocks,
        "is_protected_a432": is_protected_a432(row),
    }


@router.get("/{uid}/open-demande-affaire-folder")
def open_demande_affaire_folder(uid: int):
    row = _repo.get_by_uid(uid)
    if not row:
        raise HTTPException(404, f"Passation #{uid} introuvable")

    affaire = _aff_repo.get_by_uid(int(row.affaire_rst_id or 0))
    if not affaire:
        raise HTTPException(404, f"Affaire #{row.affaire_rst_id} introuvable")

    affaire_ref = str(affaire.reference or "").strip()
    if not affaire_ref:
        raise HTTPException(409, "Référence affaire RST vide")

    root = _get_demandes_root()
    target = _find_folder_by_affaire_prefix(root, affaire_ref) or (root / affaire_ref)
    try:
        target.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(409, f"Impossible de préparer le dossier cible: {exc}")

    try:
        _open_folder_in_explorer(target)
    except Exception as exc:
        raise HTTPException(409, f"Impossible d'ouvrir l'explorateur: {exc}")

    return {
        "success": True,
        "folder_root": str(root),
        "folder_path": str(target),
        "affaire_reference": affaire_ref,
    }


def _build_demande_payload_from_passation(row, module_code: str):
    nature_suffix = {
        "interventions": "Interventions terrain",
        "essais_terrain": "Essais terrain",
        "echantillons": "Réception prélèvements",
        "essais_laboratoire": "Essais laboratoire",
        "etude_technique": "Étude technique",
        "g3": "Mission G3",
        "essais_externes": "Essais externes",
        "documents": "Dossier documentaire",
        "planning": "Planification",
    }.get(module_code, module_code)

    nature = f"{row.operation_type or 'Mission'} - {nature_suffix}"
    description = row.synthese or row.description_generale or row.contexte_marche or ""

    return {
        "affaire_rst_id": row.affaire_rst_id,
        "labo_code": infer_labo_code(row),
        "numero_dst": row.numero_etude or "",
        "type_mission": "À définir",
        "nature": nature,
        "description": description,
        "demandeur": row.responsable or "",
        "date_reception": row.date_passation,
        "priorite": "Normale",
        "statut": "À qualifier",
    }


def _find_generated_demande(passation_uid: int, module_code: str, signature_hash: str):
    with _repo._connect() as conn:
        row = conn.execute(
            """
            SELECT g.demande_id
            FROM passation_generated_demandes g
            JOIN demandes d ON d.id = g.demande_id
            WHERE g.passation_id = ? AND g.module_code = ? AND g.signature_hash = ?
            ORDER BY g.id DESC
            LIMIT 1
            """,
            (passation_uid, module_code, signature_hash),
        ).fetchone()
    if not row:
        return None
    return int(row["demande_id"])


def _link_generated_demande(passation_uid: int, module_code: str, signature_hash: str, demande_uid: int):
    with _repo._connect() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO passation_generated_demandes
            (passation_id, module_code, signature_hash, demande_id)
            VALUES (?, ?, ?, ?)
            """,
            (passation_uid, module_code, signature_hash, demande_uid),
        )
        conn.execute(
            """
            UPDATE demandes
            SET passation_source_id = ?, passation_module_code = ?
            WHERE id = ?
            """,
            (passation_uid, module_code, demande_uid),
        )
        conn.commit()


@router.get("/{uid}/demandes-preview")
def demandes_preview(uid: int):
    row = _repo.get_by_uid(uid)
    if not row:
        raise HTTPException(404, f"Passation #{uid} introuvable")

    modules = infer_modules(row)
    items = []
    for module_code in modules:
        payload = _build_demande_payload_from_passation(row, module_code)
        signature_hash = build_demande_signature(
            uid,
            row.affaire_rst_id,
            module_code,
            payload["nature"],
            payload["description"],
        )
        existing_demande_uid = _find_generated_demande(uid, module_code, signature_hash)
        items.append(
            {
                "module_code": module_code,
                "payload": payload,
                "signature_hash": signature_hash,
                "already_generated": existing_demande_uid is not None,
                "existing_demande_uid": existing_demande_uid,
            }
        )

    return {
        "passation_uid": uid,
        "modules": modules,
        "items": items,
    }


@router.post("/{uid}/demandes-generate")
def demandes_generate(uid: int):
    row = _repo.get_by_uid(uid)
    if not row:
        raise HTTPException(404, f"Passation #{uid} introuvable")

    if is_protected_a432(row) and str(row.workflow_decision or "").strip().casefold() == "annuler":
        raise HTTPException(409, "Protection A432: génération bloquée tant que la décision est 'Annuler'.")

    modules = infer_modules(row)
    created = []
    reused = []

    for module_code in modules:
        payload = _build_demande_payload_from_passation(row, module_code)
        signature_hash = build_demande_signature(
            uid,
            row.affaire_rst_id,
            module_code,
            payload["nature"],
            payload["description"],
        )

        existing_demande_uid = _find_generated_demande(uid, module_code, signature_hash)
        if existing_demande_uid is not None:
            reused.append({"module_code": module_code, "demande_uid": existing_demande_uid})
            continue

        demande = _demandes_repo.add(
            DemandeRstCreateSchema(
                affaire_rst_id=payload["affaire_rst_id"],
                labo_code=payload["labo_code"],
                numero_dst=payload["numero_dst"],
                type_mission=payload["type_mission"],
                nature=payload["nature"],
                description=payload["description"],
                demandeur=payload["demandeur"],
                date_reception=payload["date_reception"],
                priorite=payload["priorite"],
                statut=payload["statut"],
            )
        )
        _link_generated_demande(uid, module_code, signature_hash, demande.uid)

        # Seed demande preparation from passation summary.
        _prep_repo.update_preparation(
            demande.uid,
            {
                "phase_operation": row.phase_operation or "À qualifier",
                "contexte_operationnel": row.contexte_marche or "",
                "objectifs": row.besoins_etude or row.besoins_laboratoire or row.besoins_terrain or "",
                "points_vigilance": row.points_sensibles or "",
                "contraintes_delais": row.synthese or "",
                "ressources_notes": row.besoins_ressources_humaines or row.besoins_equipements_specifiques or "",
                "commentaires": row.notes or "",
            },
        )
        _prep_repo.update_modules(
            demande.uid,
            [{"module_code": module_code, "is_enabled": True}],
        )

        created.append({"module_code": module_code, "demande_uid": demande.uid, "reference": demande.reference})

    return {
        "passation_uid": uid,
        "created": created,
        "reused": reused,
        "created_count": len(created),
        "reused_count": len(reused),
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
