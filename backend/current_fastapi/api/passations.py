"""
api/passations.py
API routes for chantier handovers.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.demande_rst import DemandeRstCreateSchema, DemandeRstResponseSchema
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
    PassationLinkDemandeSchema,
    PassationResponseSchema,
    PassationUpdateSchema,
    WORKFLOW_DECISION_OPTIONS,
    WORKFLOW_STATUS_OPTIONS,
)
from app.repositories.affaires_rst_repository import AffairesRstRepository
from app.repositories.demande_preparation_repository import DemandePreparationRepository
from app.repositories.demande_documents_repository import DemandeDocumentsRepository
from app.repositories.demandes_rst_repository import DemandesRstRepository
from app.repositories.passations_repository import PassationsRepository
from app.repositories.security_repository import SecurityRepository
from app.services.demande_notification_service import notify_demande_created_from_passation
from app.services.site_plan_requirements_service import validate_passation_site_plan_requirements
from app.services.passation_delta_service import (
    PASSATION_DEMANDE_SLOT,
    build_agency_proposal,
    build_demande_payload_from_passation,
    build_demande_signature,
    build_readiness_blocks,
    classify_affaire_demande_link,
    infer_labo_code,
    infer_modules,
    is_protected_a432,
    passation_demande_state,
    passation_edit_state,
)


router = APIRouter()
_repo = PassationsRepository()
_aff_repo = AffairesRstRepository()
_demandes_repo = DemandesRstRepository()
_prep_repo = DemandePreparationRepository()
_docs_repo = DemandeDocumentsRepository()
_sec_repo = SecurityRepository()


def _resolve_demande_destinataire(row) -> tuple[str, str]:
    email = str(getattr(row, "demande_destinataire_email", "") or "").strip().lower()
    name = str(getattr(row, "demande_destinataire_name", "") or "").strip()
    if email and not name:
        user = _sec_repo.get_user_by_email(email)
        if user:
            name = str(user["display_name"] or email).strip()
    return email, name


def _enrich_passation_response(response: PassationResponseSchema) -> PassationResponseSchema:
    affaire = _aff_repo.get_by_uid(response.affaire_rst_id)
    affaire_date = affaire.date_debut_travaux_prevue if affaire else None
    return response.model_copy(update={
        "affaire_date_debut_travaux_prevue": affaire_date,
        "date_debut_travaux_locked": bool(affaire_date),
    })


def _prepare_passation_create(body: PassationCreateSchema) -> PassationCreateSchema:
    affaire = _aff_repo.get_by_uid(body.affaire_rst_id)
    if not affaire:
        return body
    if affaire.date_debut_travaux_prevue:
        return body.model_copy(update={"date_debut_travaux_prevue": None})
    if body.date_debut_travaux_prevue:
        _aff_repo.update(body.affaire_rst_id, {"date_debut_travaux_prevue": body.date_debut_travaux_prevue})
    return body


def _prepare_passation_update(uid: int, current, body: PassationUpdateSchema) -> PassationUpdateSchema:
    affaire_id = int(body.affaire_rst_id or current.affaire_rst_id or 0)
    affaire = _aff_repo.get_by_uid(affaire_id) if affaire_id else None
    if not affaire:
        return body

    patch = body.model_dump(exclude_unset=True)
    if "date_debut_travaux_prevue" not in patch:
        return body

    if affaire.date_debut_travaux_prevue:
        patch.pop("date_debut_travaux_prevue", None)
        return PassationUpdateSchema(**patch) if patch else PassationUpdateSchema()

    incoming = patch.get("date_debut_travaux_prevue")
    if incoming:
        _aff_repo.update(affaire_id, {"date_debut_travaux_prevue": incoming})
    else:
        _aff_repo.update(affaire_id, {"date_debut_travaux_prevue": None})
    return PassationUpdateSchema(**patch)


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
        "maitre_ouvrage": affaire.maitre_ouvrage,
        "maitre_oeuvre": affaire.maitre_oeuvre,
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


def _build_demande_payload_from_passation(row, module_code: str = PASSATION_DEMANDE_SLOT):
    if module_code == PASSATION_DEMANDE_SLOT:
        return build_demande_payload_from_passation(row)

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


def _find_passation_linked_demande(passation_uid: int, row) -> tuple[int | None, str]:
    with _repo._connect() as conn:
        direct = conn.execute(
            """
            SELECT id, reference
            FROM demandes
            WHERE passation_source_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (passation_uid,),
        ).fetchone()
        if direct:
            return int(direct["id"]), str(direct["reference"] or "")

        legacy = conn.execute(
            """
            SELECT g.demande_id, d.reference
            FROM passation_generated_demandes g
            JOIN demandes d ON d.id = g.demande_id
            WHERE g.passation_id = ?
            ORDER BY g.id DESC
            LIMIT 1
            """,
            (passation_uid,),
        ).fetchone()
        if legacy:
            return int(legacy["demande_id"]), str(legacy["reference"] or "")

    payload = _build_demande_payload_from_passation(row)
    signature_hash = build_demande_signature(
        passation_uid,
        row.affaire_rst_id,
        PASSATION_DEMANDE_SLOT,
        payload["nature"],
        payload["description"],
    )
    existing_uid = _find_generated_demande(passation_uid, PASSATION_DEMANDE_SLOT, signature_hash)
    if existing_uid is None:
        return None, ""
    demande = _demandes_repo.get_by_uid(existing_uid)
    return existing_uid, str(demande.reference if demande else "")


def _seed_demande_from_passation(demande_uid: int, row) -> None:
    handler_email, handler_name = _resolve_demande_destinataire(row)
    _prep_repo.update_preparation(
        demande_uid,
        {
            "phase_operation": row.phase_operation or "À qualifier",
            "contexte_operationnel": row.contexte_marche or "",
            "objectifs": row.besoins_etude or row.besoins_laboratoire or row.besoins_terrain or "",
            "points_vigilance": row.points_sensibles or "",
            "contraintes_delais": row.synthese or "",
            "ressources_notes": row.besoins_ressources_humaines or row.besoins_equipements_specifiques or "",
            "commentaires": row.notes or "",
            "responsable_referent": handler_name or handler_email,
            "attribue_a": handler_name or handler_email,
        },
    )
    _prep_repo.update_modules(
        demande_uid,
        [{"module_code": module_code, "is_enabled": True} for module_code in infer_modules(row)],
    )
    passation_uid = int(getattr(row, "uid", 0) or 0)
    if passation_uid:
        _docs_repo.seed_from_passation(demande_uid, passation_uid)


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
        if row:
            return int(row["demande_id"])

        direct = conn.execute(
            """
            SELECT id
            FROM demandes
            WHERE passation_source_id = ? AND passation_module_code = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (passation_uid, module_code),
        ).fetchone()
    if not direct:
        return None
    return int(direct["id"])


def _list_affaire_demandes(passation_uid: int, affaire_rst_id: int) -> list[dict]:
    with _repo._connect() as conn:
        rows = conn.execute(
            """
            SELECT d.id, d.reference, d.nature, d.statut,
                   d.passation_source_id, d.passation_module_code
            FROM demandes d
            WHERE d.affaire_rst_id = ?
            ORDER BY d.id DESC
            """,
            (affaire_rst_id,),
        ).fetchall()

    items: list[dict] = []
    for row in rows:
        demande_uid = int(row["id"])
        source_id = row["passation_source_id"]
        link_meta = classify_affaire_demande_link(
            passation_uid=passation_uid,
            demande_uid=demande_uid,
            passation_source_id=int(source_id) if source_id else None,
            passation_module_code=str(row["passation_module_code"] or ""),
        )
        items.append(
            {
                "demande_uid": demande_uid,
                "reference": str(row["reference"] or ""),
                "nature": str(row["nature"] or ""),
                "statut": str(row["statut"] or ""),
                **link_meta,
            }
        )
    return items


def _build_demande_item(uid: int, row) -> dict:
    payload = _build_demande_payload_from_passation(row)
    signature_hash = build_demande_signature(
        uid,
        row.affaire_rst_id,
        PASSATION_DEMANDE_SLOT,
        payload["nature"],
        payload["description"],
    )
    existing_demande_uid, existing_demande_reference = _find_passation_linked_demande(uid, row)
    return {
        "module_code": PASSATION_DEMANDE_SLOT,
        "payload": payload,
        "signature_hash": signature_hash,
        "already_generated": existing_demande_uid is not None,
        "existing_demande_uid": existing_demande_uid,
        "existing_demande_reference": existing_demande_reference,
    }


def _build_module_items(uid: int, row) -> list[dict]:
    return [_build_demande_item(uid, row)]


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


def _passation_edit_meta(uid: int, row) -> dict:
    items = _build_module_items(uid, row)
    return passation_edit_state(items)


def _demandes_preview_payload(uid: int, row) -> dict:
    demande_item = _build_demande_item(uid, row)
    affaire_demandes = _list_affaire_demandes(uid, row.affaire_rst_id)
    edit_meta = passation_demande_state(
        linked_demande_uid=demande_item.get("existing_demande_uid"),
        linked_demande_reference=str(demande_item.get("existing_demande_reference") or ""),
    )
    manual_unlinked = [item for item in affaire_demandes if item["link_kind"] == "manual"]
    return {
        "passation_uid": uid,
        "demande_item": demande_item,
        "items": [demande_item],
        "affaire_demandes": affaire_demandes,
        "affaire_demande_count": len(affaire_demandes),
        "manual_affaire_demande_count": len(manual_unlinked),
        **edit_meta,
    }


def _list_passation_demandes(passation_uid: int) -> list[DemandeRstResponseSchema]:
    with _repo._connect() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT d.id
            FROM demandes d
            WHERE d.passation_source_id = ?
               OR d.id IN (
                    SELECT demande_id
                    FROM passation_generated_demandes
                    WHERE passation_id = ?
               )
            ORDER BY d.id DESC
            """,
            (passation_uid, passation_uid),
        ).fetchall()
    demandes: list[DemandeRstResponseSchema] = []
    for row in rows:
        record = _demandes_repo.get_by_uid(int(row["id"]))
        if record:
            demandes.append(_demandes_repo.to_resp(record))
    return demandes


@router.get("/{uid}/demandes", response_model=list[DemandeRstResponseSchema])
def get_passation_demandes(uid: int):
    row = _repo.get_by_uid(uid)
    if not row:
        raise HTTPException(404, f"Passation #{uid} introuvable")
    return _list_passation_demandes(uid)


@router.get("/{uid}/demandes-linkable")
def get_passation_linkable_demandes(uid: int):
    row = _repo.get_by_uid(uid)
    if not row:
        raise HTTPException(404, f"Passation #{uid} introuvable")
    if _find_passation_linked_demande(uid, row)[0] is not None:
        return []
    return [
        {"demande_uid": item["demande_uid"], "reference": item["reference"]}
        for item in _list_affaire_demandes(uid, row.affaire_rst_id)
        if item.get("linkable")
    ]


@router.get("/{uid}/demandes-preview")
def demandes_preview(uid: int):
    row = _repo.get_by_uid(uid)
    if not row:
        raise HTTPException(404, f"Passation #{uid} introuvable")
    return _demandes_preview_payload(uid, row)


@router.post("/{uid}/link-demande")
def link_existing_demande(uid: int, body: PassationLinkDemandeSchema):
    row = _repo.get_by_uid(uid)
    if not row:
        raise HTTPException(404, f"Passation #{uid} introuvable")

    demande = _demandes_repo.get_by_uid(body.demande_uid)
    if not demande:
        raise HTTPException(404, f"Demande #{body.demande_uid} introuvable")
    if int(demande.affaire_rst_id) != int(row.affaire_rst_id):
        raise HTTPException(409, "La demande n'appartient pas à la même affaire que la passation.")

    linked_uid, _linked_ref = _find_passation_linked_demande(uid, row)
    if linked_uid is not None and linked_uid != body.demande_uid:
        raise HTTPException(
            409,
            f"Cette passation est déjà liée à la demande #{linked_uid}.",
        )

    with _repo._connect() as conn:
        source_row = conn.execute(
            "SELECT passation_source_id FROM demandes WHERE id = ?",
            (body.demande_uid,),
        ).fetchone()
    if source_row and source_row["passation_source_id"]:
        existing_source = int(source_row["passation_source_id"])
        if existing_source != uid:
            raise HTTPException(
                409,
                f"Demande déjà liée à la passation #{existing_source}.",
            )

    payload = _build_demande_payload_from_passation(row)
    signature_hash = build_demande_signature(
        uid,
        row.affaire_rst_id,
        PASSATION_DEMANDE_SLOT,
        payload["nature"],
        payload["description"],
    )
    _link_generated_demande(uid, PASSATION_DEMANDE_SLOT, signature_hash, body.demande_uid)

    preview = _demandes_preview_payload(uid, row)
    return {
        "passation_uid": uid,
        "demande_uid": body.demande_uid,
        "demande_reference": demande.reference,
        **preview,
    }


@router.post("/{uid}/demandes-generate")
def demandes_generate(uid: int):
    row = _repo.get_by_uid(uid)
    if not row:
        raise HTTPException(404, f"Passation #{uid} introuvable")

    if is_protected_a432(row) and str(row.workflow_decision or "").strip().casefold() == "annuler":
        raise HTTPException(409, "Protection A432: génération bloquée tant que la décision est 'Annuler'.")

    _enforce_passation_site_plan(row, None)

    payload = _build_demande_payload_from_passation(row)
    signature_hash = build_demande_signature(
        uid,
        row.affaire_rst_id,
        PASSATION_DEMANDE_SLOT,
        payload["nature"],
        payload["description"],
    )

    handler_email, handler_name = _resolve_demande_destinataire(row)
    if not handler_email and not handler_name:
        raise HTTPException(
            422,
            "Définissez le destinataire de la demande RST sur la passation avant de générer.",
        )

    existing_demande_uid, existing_reference = _find_passation_linked_demande(uid, row)
    if existing_demande_uid is not None:
        return {
            "passation_uid": uid,
            "created": [],
            "reused": [
                {
                    "demande_uid": existing_demande_uid,
                    "reference": existing_reference,
                }
            ],
            "created_count": 0,
            "reused_count": 1,
            "demande_uid": existing_demande_uid,
            "demande_reference": existing_reference,
        }

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
    _link_generated_demande(uid, PASSATION_DEMANDE_SLOT, signature_hash, demande.uid)
    _seed_demande_from_passation(demande.uid, row)

    notification = {}
    with _repo._connect() as conn:
        notification = notify_demande_created_from_passation(
            conn,
            demande_uid=demande.uid,
            demande_reference=str(demande.reference or ""),
            passation_uid=uid,
            passation_reference=str(row.reference or ""),
            affaire_rst_id=int(row.affaire_rst_id) if row.affaire_rst_id else None,
            recipient_email=handler_email,
            recipient_display_name=handler_name,
            passation_synthese=str(getattr(row, "synthese", "") or ""),
        )
        conn.commit()

    return {
        "passation_uid": uid,
        "created": [{"demande_uid": demande.uid, "reference": demande.reference}],
        "reused": [],
        "created_count": 1,
        "reused_count": 0,
        "demande_uid": demande.uid,
        "demande_reference": demande.reference,
        "notification": notification,
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
    response = _enrich_passation_response(_repo.to_response(row))
    edit_meta = _passation_edit_meta(uid, row)
    return response.model_copy(update=edit_meta)


@router.post("", response_model=PassationResponseSchema, status_code=201)
def create_passation(body: PassationCreateSchema):
    if not _aff_repo.get_by_uid(body.affaire_rst_id):
        raise HTTPException(400, f"Affaire #{body.affaire_rst_id} introuvable")
    body = _prepare_passation_create(body)
    row = _repo.create(body)
    _sync_passation_acteurs_to_affaire(row)
    return _enrich_passation_response(_repo.to_response(row))


def _sync_passation_acteurs_to_affaire(record) -> None:
    affaire_id = int(getattr(record, "affaire_rst_id", 0) or 0)
    if not affaire_id:
        return
    _aff_repo.update(
        affaire_id,
        {
            "maitre_ouvrage": str(getattr(record, "maitre_ouvrage", "") or "").strip(),
            "maitre_oeuvre": str(getattr(record, "maitre_oeuvre", "") or "").strip(),
        },
    )


def _affaire_adresse_ouvrage(affaire_rst_id: int) -> str:
    affaire = _aff_repo.get_by_uid(affaire_rst_id)
    if not affaire:
        return ""
    return str(getattr(affaire, "adresse_ouvrage", "") or "").strip()


def _document_dicts(items) -> list[dict]:
    rows: list[dict] = []
    for item in items or []:
        if hasattr(item, "model_dump"):
            payload = item.model_dump(mode="json")
        elif isinstance(item, dict):
            payload = item
        else:
            payload = {
                "document_type": getattr(item, "document_type", ""),
                "stored_path": getattr(item, "stored_path", ""),
            }
        rows.append(payload)
    return rows


def _enforce_passation_site_plan(row, documents: list[dict] | None) -> None:
    affaire_id = int(getattr(row, "affaire_rst_id", 0) or 0)
    if not affaire_id:
        raise HTTPException(422, "Affaire obligatoire pour le plan de situation.")
    docs = documents
    if docs is None:
        docs = _document_dicts(getattr(row, "documents", None))
    try:
        validate_passation_site_plan_requirements(
            adresse_ouvrage=_affaire_adresse_ouvrage(affaire_id),
            documents=docs,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.put("/{uid}", response_model=PassationResponseSchema)
def update_passation(uid: int, body: PassationUpdateSchema):
    current = _repo.get_by_uid(uid)
    if not current:
        raise HTTPException(404, f"Passation #{uid} introuvable")
    edit_meta = _passation_edit_meta(uid, current)
    if not edit_meta.get("is_editable"):
        detail = str(edit_meta.get("edit_lock_reason") or "").strip() or "Passation non modifiable."
        raise HTTPException(409, detail)
    if body.affaire_rst_id is not None and not _aff_repo.get_by_uid(body.affaire_rst_id):
        raise HTTPException(400, f"Affaire #{body.affaire_rst_id} introuvable")
    body = _prepare_passation_update(uid, current, body)
    docs_for_validation = _document_dicts(body.documents) if body.documents is not None else None
    _enforce_passation_site_plan(current, docs_for_validation)
    row = _repo.update(uid, body)
    _sync_passation_acteurs_to_affaire(row)
    response = _enrich_passation_response(_repo.to_response(row))
    edit_meta = _passation_edit_meta(uid, row)
    return response.model_copy(update=edit_meta)


@router.delete("/{uid}", status_code=204)
def delete_passation(uid: int):
    if not _repo.delete(uid):
        raise HTTPException(404, f"Passation #{uid} introuvable")
