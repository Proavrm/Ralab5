from __future__ import annotations

import sqlite3
from datetime import date, datetime
from typing import Any

ACTIVE_STATUSES = ("OPEN", "ACKED", "IN_PROGRESS")


def _now_sql() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _today_iso() -> str:
    return date.today().isoformat()


def _norm(value: str | None) -> str:
    return (value or "").strip().lower()


def _clean(value: str | None) -> str:
    return (value or "").strip()


def _is_email(value: str) -> bool:
    return "@" in value and " " not in value and "." in value.split("@")[-1]


def _due_state(due_date: str | None, today_iso: str) -> str:
    due = _clean(due_date)
    if not due:
        return "none"
    if due < today_iso:
        return "overdue"
    if due == today_iso:
        return "today"
    return "upcoming"


def _matches_identity(row: sqlite3.Row, user_email: str, display_name: str) -> bool:
    row_email = _norm(row["assignee_user_email"])
    row_name = _norm(row["assignee_display_name"])
    return (row_email and row_email == _norm(user_email)) or (row_name and row_name == _norm(display_name))


def _create_notification(
    conn: sqlite3.Connection,
    *,
    assignment_uid: int,
    recipient_user_email: str | None,
    recipient_display_name: str | None,
    event_type: str,
    title: str,
    message: str,
    payload_json: str = "{}",
) -> None:
    now = _now_sql()
    conn.execute(
        """
        INSERT INTO task_notifications (
            assignment_uid,
            recipient_user_email,
            recipient_display_name,
            event_type,
            title,
            message,
            payload_json,
            is_read,
            created_at,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        """,
        (
            assignment_uid,
            _clean(recipient_user_email) or None,
            _clean(recipient_display_name) or None,
            event_type,
            title,
            message,
            payload_json,
            now,
            now,
        ),
    )


def upsert_task_assignment(
    conn: sqlite3.Connection,
    *,
    module_type: str,
    object_uid: int,
    object_reference: str,
    assignee: str,
    assignment_role_code: str,
    due_date: str | None = None,
    affaire_rst_id: int | None = None,
    demande_id: int | None = None,
) -> None:
    now = _now_sql()
    assignee_clean = _clean(assignee)
    assignee_email = assignee_clean.lower() if _is_email(assignee_clean) else None
    assignee_display = "" if assignee_email else assignee_clean

    existing = conn.execute(
        """
        SELECT *
        FROM task_assignments
        WHERE module_type = ?
          AND object_uid = ?
          AND assignment_role_code = ?
          AND status IN ('OPEN', 'ACKED', 'IN_PROGRESS')
        ORDER BY id DESC
        LIMIT 1
        """,
        (module_type, int(object_uid), assignment_role_code),
    ).fetchone()

    if not assignee_clean:
        if existing:
            conn.execute(
                "UPDATE task_assignments SET status = 'CANCELED', updated_at = ? WHERE id = ?",
                (now, int(existing["id"])),
            )
        return

    if not existing:
        conn.execute(
            """
            INSERT INTO task_assignments (
                module_type,
                object_uid,
                object_reference,
                affaire_rst_id,
                demande_id,
                assignee_user_email,
                assignee_display_name,
                assignment_role_code,
                status,
                due_date,
                assigned_at,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)
            """,
            (
                module_type,
                int(object_uid),
                _clean(object_reference),
                affaire_rst_id,
                demande_id,
                assignee_email,
                assignee_display,
                assignment_role_code,
                _clean(due_date),
                now,
                now,
                now,
            ),
        )
        assignment_uid = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
        _create_notification(
            conn,
            assignment_uid=assignment_uid,
            recipient_user_email=assignee_email,
            recipient_display_name=assignee_display,
            event_type="ASSIGNED",
            title=f"Nouvelle attribution · {module_type}",
            message=f"{_clean(object_reference) or module_type} vous a été attribué.",
        )
        return

    same_email = _norm(existing["assignee_user_email"]) == _norm(assignee_email)
    same_name = _norm(existing["assignee_display_name"]) == _norm(assignee_display)
    same_due = _clean(existing["due_date"] or "") == _clean(due_date)
    same_ref = _clean(existing["object_reference"] or "") == _clean(object_reference)

    conn.execute(
        """
        UPDATE task_assignments
        SET object_reference = ?,
            affaire_rst_id = ?,
            demande_id = ?,
            assignee_user_email = ?,
            assignee_display_name = ?,
            due_date = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (
            _clean(object_reference),
            affaire_rst_id,
            demande_id,
            assignee_email,
            assignee_display,
            _clean(due_date),
            now,
            int(existing["id"]),
        ),
    )

    if not (same_email and same_name and same_due and same_ref):
        event_type = "REASSIGNED" if not (same_email and same_name) else "UPDATED"
        _create_notification(
            conn,
            assignment_uid=int(existing["id"]),
            recipient_user_email=assignee_email,
            recipient_display_name=assignee_display,
            event_type=event_type,
            title=f"Mise à jour attribution · {module_type}",
            message=f"{_clean(object_reference) or module_type} a été mis à jour.",
        )


def sync_intervention_assignment(conn: sqlite3.Connection, intervention_row: sqlite3.Row) -> None:
    upsert_task_assignment(
        conn,
        module_type="INTERVENTION",
        object_uid=int(intervention_row["id"]),
        object_reference=_clean(intervention_row["reference"]),
        assignee=_clean(intervention_row["technicien"]),
        assignment_role_code="INTERVENTION_OPERATOR",
        due_date=_clean(intervention_row["date_intervention"]),
        demande_id=int(intervention_row["demande_id"]) if intervention_row["demande_id"] is not None else None,
        affaire_rst_id=int(intervention_row["affaire_rst_id"]) if "affaire_rst_id" in intervention_row.keys() and intervention_row["affaire_rst_id"] is not None else None,
    )


def sync_essai_assignment(conn: sqlite3.Connection, essai_row: sqlite3.Row) -> None:
    upsert_task_assignment(
        conn,
        module_type="ESSAI",
        object_uid=int(essai_row["id"]),
        object_reference=_clean(essai_row["reference"]),
        assignee=_clean(essai_row["operateur"]),
        assignment_role_code="ESSAI_OPERATOR",
        due_date=_clean(essai_row["date_fin"] or essai_row["date_debut"]),
        demande_id=int(essai_row["demande_id"]) if essai_row["demande_id"] is not None else None,
        affaire_rst_id=int(essai_row["affaire_rst_id"]) if essai_row["affaire_rst_id"] is not None else None,
    )


def sync_prelevement_reception_assignment(conn: sqlite3.Connection, prelevement_row: sqlite3.Row) -> None:
    upsert_task_assignment(
        conn,
        module_type="PRELEVEMENT_RECEPTION",
        object_uid=int(prelevement_row["id"]),
        object_reference=_clean(prelevement_row["reference"]),
        assignee=_clean(prelevement_row["receptionnaire"]),
        assignment_role_code="PRELEVEMENT_RECEPTION_OWNER",
        due_date=_clean(prelevement_row["date_reception_labo"]),
        demande_id=int(prelevement_row["demande_id"]) if prelevement_row["demande_id"] is not None else None,
        affaire_rst_id=int(prelevement_row["affaire_rst_id"]) if "affaire_rst_id" in prelevement_row.keys() and prelevement_row["affaire_rst_id"] is not None else None,
    )


def sync_open_operational_assignments(conn: sqlite3.Connection) -> None:
    intervention_rows = conn.execute(
        """
        SELECT i.id, i.reference, i.technicien, i.date_intervention, i.demande_id, d.affaire_rst_id
        FROM interventions i
        LEFT JOIN demandes d ON d.id = i.demande_id
        WHERE COALESCE(NULLIF(i.technicien, ''), '') <> ''
          AND COALESCE(i.statut, '') NOT IN ('Réalisée', 'Annulée')
        """
    ).fetchall()
    for row in intervention_rows:
        sync_intervention_assignment(conn, row)

    essai_rows = conn.execute(
        """
        SELECT
            e.id,
            COALESCE(NULLIF(e.essai_code, ''), NULLIF(e.type_essai, ''), 'ESSAI-' || e.id) AS reference,
            e.operateur,
            e.date_debut,
            e.date_fin,
            d.id AS demande_id,
            d.affaire_rst_id
        FROM essais e
        LEFT JOIN echantillons ech ON ech.id = e.echantillon_id
        LEFT JOIN interventions i ON i.id = e.intervention_id
        LEFT JOIN demandes d ON d.id = COALESCE(ech.demande_id, i.demande_id)
        WHERE COALESCE(NULLIF(e.operateur, ''), '') <> ''
          AND COALESCE(e.statut, '') NOT IN ('Terminé', 'Annulé')
        """
    ).fetchall()
    for row in essai_rows:
        sync_essai_assignment(conn, row)

    prelevement_rows = conn.execute(
        """
        SELECT p.id, p.reference, p.receptionnaire, p.date_reception_labo, p.demande_id, d.affaire_rst_id
        FROM prelevements p
        LEFT JOIN demandes d ON d.id = p.demande_id
        WHERE COALESCE(NULLIF(p.receptionnaire, ''), '') <> ''
          AND COALESCE(p.statut, '') NOT IN ('Réceptionné', 'Clôturé')
        """
    ).fetchall()
    for row in prelevement_rows:
        sync_prelevement_reception_assignment(conn, row)


def get_inbox_for_user(
    conn: sqlite3.Connection,
    *,
    user_email: str,
    display_name: str,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    rows = conn.execute(
        """
        SELECT *
        FROM task_assignments
        WHERE status IN ('OPEN', 'ACKED', 'IN_PROGRESS')
        ORDER BY COALESCE(NULLIF(due_date, ''), '9999-12-31') ASC, updated_at DESC, id DESC
        """
    ).fetchall()

    matching_rows = [row for row in rows if _matches_identity(row, user_email, display_name)]
    today = _today_iso()

    def serialize(row: sqlite3.Row) -> dict[str, Any]:
        due = _clean(row["due_date"])
        return {
            "uid": int(row["id"]),
            "module_type": row["module_type"],
            "object_uid": int(row["object_uid"]),
            "object_reference": row["object_reference"] or "",
            "assignment_role_code": row["assignment_role_code"] or "",
            "status": row["status"],
            "assignee_user_email": row["assignee_user_email"] or "",
            "assignee_display_name": row["assignee_display_name"] or "",
            "due_date": due,
            "due_state": _due_state(due, today),
            "updated_at": row["updated_at"] or "",
        }

    items = [serialize(row) for row in matching_rows[offset : offset + limit]]

    summary = {
        "assigned_open": len(matching_rows),
        "overdue": sum(1 for row in matching_rows if _due_state(row["due_date"], today) == "overdue"),
        "due_today": sum(1 for row in matching_rows if _due_state(row["due_date"], today) == "today"),
        "due_soon": sum(1 for row in matching_rows if _due_state(row["due_date"], today) == "upcoming"),
    }

    notification_rows = conn.execute(
        """
        SELECT *
        FROM task_notifications
        ORDER BY created_at DESC, id DESC
        LIMIT 200
        """
    ).fetchall()

    matching_notifications = [
        row
        for row in notification_rows
        if (_norm(row["recipient_user_email"]) and _norm(row["recipient_user_email"]) == _norm(user_email))
        or (_norm(row["recipient_display_name"]) and _norm(row["recipient_display_name"]) == _norm(display_name))
    ]

    notifications = [
        {
            "uid": int(row["id"]),
            "assignment_uid": int(row["assignment_uid"]),
            "event_type": row["event_type"],
            "title": row["title"] or "",
            "message": row["message"] or "",
            "is_read": bool(row["is_read"]),
            "created_at": row["created_at"] or "",
        }
        for row in matching_notifications[:50]
    ]

    summary["unread_notifications"] = sum(1 for row in matching_notifications if not bool(row["is_read"]))

    return {
        "summary": summary,
        "items": items,
        "notifications": notifications,
    }


def mark_notification_read_for_user(
    conn: sqlite3.Connection,
    *,
    notification_uid: int,
    user_email: str,
    display_name: str,
) -> bool:
    row = conn.execute(
        "SELECT * FROM task_notifications WHERE id = ?",
        (int(notification_uid),),
    ).fetchone()
    if not row:
        return False

    can_read = (
        (_norm(row["recipient_user_email"]) and _norm(row["recipient_user_email"]) == _norm(user_email))
        or (_norm(row["recipient_display_name"]) and _norm(row["recipient_display_name"]) == _norm(display_name))
    )
    if not can_read:
        return False

    conn.execute(
        "UPDATE task_notifications SET is_read = 1, updated_at = ? WHERE id = ?",
        (_now_sql(), int(notification_uid)),
    )
    return True
