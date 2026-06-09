from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query

from api.auth import get_current_user
from app.core.database import ensure_ralab4_schema, get_db_path
from app.repositories.security_repository import SecurityRepository
from app.services.work_assignment_service import (
    get_inbox_for_user,
    mark_notification_read_for_user,
    sync_open_operational_assignments,
)

router = APIRouter()
DB_PATH = get_db_path()
SEC_REPO = SecurityRepository()


def _conn() -> sqlite3.Connection:
    ensure_ralab4_schema(DB_PATH)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _resolve_identity(current: dict) -> tuple[str, str]:
    email = str(current.get("sub") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Identité utilisateur indisponible.")

    display_name = email
    user_row = SEC_REPO.get_user_by_email(email)
    if user_row:
        display_name = str(user_row["display_name"] or email)

    return email, display_name


@router.get("/me")
def get_my_inbox(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current=Depends(get_current_user),
):
    user_email, display_name = _resolve_identity(current)
    with _conn() as conn:
        sync_open_operational_assignments(conn)
        payload = get_inbox_for_user(
            conn,
            user_email=user_email,
            display_name=display_name,
            limit=limit,
            offset=offset,
        )
        conn.commit()
    return payload


@router.get("/me/summary")
def get_my_inbox_summary(current=Depends(get_current_user)):
    user_email, display_name = _resolve_identity(current)
    with _conn() as conn:
        sync_open_operational_assignments(conn)
        payload = get_inbox_for_user(
            conn,
            user_email=user_email,
            display_name=display_name,
            limit=20,
            offset=0,
        )
        conn.commit()
    return payload["summary"]


@router.post("/notifications/{uid}/read")
def mark_notification_read(uid: int, current=Depends(get_current_user)):
    user_email, display_name = _resolve_identity(current)
    with _conn() as conn:
        ok = mark_notification_read_for_user(
            conn,
            notification_uid=uid,
            user_email=user_email,
            display_name=display_name,
        )
        if not ok:
            raise HTTPException(status_code=404, detail="Notification introuvable.")
        conn.commit()
    return {"ok": True}
