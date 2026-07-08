#!/usr/bin/env python3
"""Simule « Générer demande » depuis passation — demande + notification destinataire."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import ensure_ralab4_schema, get_db_path
from app.models.demande_rst import DemandeRstCreateSchema
from app.models.passation import PassationUpdateSchema
from app.repositories.demande_preparation_repository import DemandePreparationRepository
from app.repositories.demandes_rst_repository import DemandesRstRepository
from app.repositories.passations_repository import PassationsRepository
from app.repositories.security_repository import SecurityRepository
from app.services.demande_notification_service import notify_demande_created_from_passation
from app.services.passation_delta_service import (
    PASSATION_DEMANDE_SLOT,
    build_demande_payload_from_passation,
    build_demande_signature,
    infer_modules,
)

PASSATION_ID = 2
DEFAULT_DESTINATAIRE_EMAIL = "slhopital@guintoli.fr"


def _find_linked_demande(conn, passation_uid: int) -> int | None:
    row = conn.execute(
        "SELECT id FROM demandes WHERE passation_source_id = ? ORDER BY id DESC LIMIT 1",
        (passation_uid,),
    ).fetchone()
    return int(row["id"]) if row else None


def _link_demande(conn, passation_uid: int, signature_hash: str, demande_uid: int) -> None:
    conn.execute(
        """
        INSERT OR IGNORE INTO passation_generated_demandes
        (passation_id, module_code, signature_hash, demande_id)
        VALUES (?, ?, ?, ?)
        """,
        (passation_uid, PASSATION_DEMANDE_SLOT, signature_hash, demande_uid),
    )
    conn.execute(
        """
        UPDATE demandes
        SET passation_source_id = ?, passation_module_code = ?
        WHERE id = ?
        """,
        (passation_uid, PASSATION_DEMANDE_SLOT, demande_uid),
    )


def _seed_preparation(prep_repo: DemandePreparationRepository, demande_uid: int, row, handler_name: str) -> None:
    prep_repo.update_preparation(
        demande_uid,
        {
            "phase_operation": row.phase_operation or "À qualifier",
            "contexte_operationnel": row.contexte_marche or "",
            "objectifs": row.besoins_etude or row.besoins_laboratoire or row.besoins_terrain or "",
            "points_vigilance": row.points_sensibles or "",
            "contraintes_delais": row.synthese or "",
            "ressources_notes": row.besoins_ressources_humaines or row.besoins_equipements_specifiques or "",
            "commentaires": row.notes or "",
            "responsable_referent": handler_name,
            "attribue_a": handler_name,
        },
    )
    prep_repo.update_modules(
        demande_uid,
        [{"module_code": module_code, "is_enabled": True} for module_code in infer_modules(row)],
    )


def main() -> None:
    ensure_ralab4_schema()
    passations = PassationsRepository(get_db_path())
    demandes = DemandesRstRepository(get_db_path())
    prep = DemandePreparationRepository(get_db_path())
    sec = SecurityRepository()

    row = passations.get_by_uid(PASSATION_ID)
    if not row:
        raise SystemExit(f"Passation #{PASSATION_ID} introuvable")

    user = sec.get_user_by_email(DEFAULT_DESTINATAIRE_EMAIL)
    handler_email = DEFAULT_DESTINATAIRE_EMAIL
    handler_name = str(user["display_name"] if user else "Sylvain LHOPITAL")

    print(f"=== Générer demande — passation {row.reference} ===\n")
    print(f"[Passation] destinataire = {handler_name} <{handler_email}>")
    passations.update(
        PASSATION_ID,
        PassationUpdateSchema(
            demande_destinataire_email=handler_email,
            demande_destinataire_name=handler_name,
        ),
    )
    row = passations.get_by_uid(PASSATION_ID)

    with passations._connect() as conn:
        existing = _find_linked_demande(conn, PASSATION_ID)
        if existing:
            print(f"Demande déjà liée : #{existing}")
            return

    payload = build_demande_payload_from_passation(row)
    signature_hash = build_demande_signature(
        PASSATION_ID,
        row.affaire_rst_id,
        PASSATION_DEMANDE_SLOT,
        payload["nature"],
        payload["description"],
    )

    print("[Générer demande] création…")
    demande = demandes.add(
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

    with passations._connect() as conn:
        _link_demande(conn, PASSATION_ID, signature_hash, demande.uid)
        conn.commit()

    _seed_preparation(prep, demande.uid, row, handler_name)

    with passations._connect() as conn:
        notification = notify_demande_created_from_passation(
            conn,
            demande_uid=demande.uid,
            demande_reference=str(demande.reference or ""),
            passation_uid=PASSATION_ID,
            passation_reference=str(row.reference or ""),
            affaire_rst_id=int(row.affaire_rst_id),
            recipient_email=handler_email,
            recipient_display_name=handler_name,
            passation_synthese=str(row.synthese or ""),
        )
        conn.commit()

    print(f"  Demande : {demande.reference} (uid {demande.uid})")
    print(f"  Notification : {notification}")
    with passations._connect() as conn:
        email = conn.execute(
            "SELECT id, recipient_email, subject FROM email_outbox ORDER BY id DESC LIMIT 1"
        ).fetchone()
        assign = conn.execute(
            "SELECT module_type, object_reference FROM task_assignments WHERE demande_id=? ORDER BY id DESC LIMIT 1",
            (demande.uid,),
        ).fetchone()
    print(f"  Email mock : {dict(email) if email else None}")
    print(f"  Assignment : {dict(assign) if assign else None}")


if __name__ == "__main__":
    main()
