"""Notifications when a demande RST is created from a passation."""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from app.services.work_assignment_service import upsert_task_assignment


def _clean(value: object) -> str:
    return str(value or "").strip()


def queue_mock_email(
    conn: sqlite3.Connection,
    *,
    recipient_email: str,
    recipient_name: str,
    subject: str,
    body_text: str,
    context: dict[str, Any] | None = None,
) -> int:
    now = conn.execute("SELECT datetime('now')").fetchone()[0]
    conn.execute(
        """
        INSERT INTO email_outbox (
            recipient_email, recipient_name, subject, body_text, status, context_json, created_at
        ) VALUES (?, ?, ?, ?, 'mock_sent', ?, ?)
        """,
        (
            _clean(recipient_email).lower(),
            _clean(recipient_name),
            _clean(subject),
            body_text.strip(),
            json.dumps(context or {}, ensure_ascii=False),
            now,
        ),
    )
    return int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])


def notify_demande_created_from_passation(
    conn: sqlite3.Connection,
    *,
    demande_uid: int,
    demande_reference: str,
    passation_uid: int,
    passation_reference: str,
    affaire_rst_id: int | None,
    recipient_email: str,
    recipient_display_name: str,
    passation_synthese: str = "",
) -> dict[str, Any]:
    email = _clean(recipient_email).lower()
    name = _clean(recipient_display_name)
    if not email and not name:
        return {"notified": False, "reason": "no_recipient"}

    upsert_task_assignment(
        conn,
        module_type="DEMANDE",
        object_uid=int(demande_uid),
        object_reference=_clean(demande_reference) or f"DEMANDE-{demande_uid}",
        assignee=email or name,
        assignment_role_code="DEMANDE_HANDLER",
        affaire_rst_id=affaire_rst_id,
        demande_id=int(demande_uid),
    )

    subject = f"Nouvelle demande RST · {demande_reference}"
    body_lines = [
        f"Bonjour {name or email},",
        "",
        f"Une demande RST vient d'être générée depuis la passation {passation_reference}.",
        f"Référence demande : {demande_reference}.",
        "",
        "Merci de prendre en charge la préparation du dossier dans RaLab.",
    ]
    if passation_synthese.strip():
        excerpt = passation_synthese.strip()
        if len(excerpt) > 600:
            excerpt = excerpt[:597] + "…"
        body_lines.extend(["", "— Synthèse passation —", excerpt])

    body_text = "\n".join(body_lines)
    email_uid = queue_mock_email(
        conn,
        recipient_email=email or f"{name.lower().replace(' ', '.')}@mock.local",
        recipient_name=name,
        subject=subject,
        body_text=body_text,
        context={
            "event": "demande_created_from_passation",
            "demande_uid": demande_uid,
            "demande_reference": demande_reference,
            "passation_uid": passation_uid,
            "passation_reference": passation_reference,
        },
    )

    return {
        "notified": True,
        "recipient_email": email,
        "recipient_display_name": name,
        "email_mock_uid": email_uid,
        "email_subject": subject,
    }
