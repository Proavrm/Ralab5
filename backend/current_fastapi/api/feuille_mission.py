from __future__ import annotations

import sqlite3

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.database import ensure_ralab4_schema, get_db_path
from app.services.feuille_mission_journee_service import compute_journee_snapshot_hash, touch_journee_record

router = APIRouter()
DB_PATH = get_db_path()


def _conn() -> sqlite3.Connection:
    ensure_ralab4_schema(DB_PATH)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


class FeuilleMissionJourneeTouchIn(BaseModel):
    demande_id: int
    mission_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    technicien: str = ""
    action: str = Field(..., pattern=r"^(generated|printed)$")
    snapshot_hash: str = ""


@router.post("/journee/touch")
def touch_feuille_mission_journee(body: FeuilleMissionJourneeTouchIn):
    with _conn() as conn:
        demande = conn.execute("SELECT id FROM demandes WHERE id = ?", (int(body.demande_id),)).fetchone()
        if not demande:
            raise HTTPException(404, f"Demande #{body.demande_id} introuvable")
        result = touch_journee_record(
            conn,
            demande_id=int(body.demande_id),
            mission_date=str(body.mission_date),
            technicien=str(body.technicien or ""),
            action=str(body.action),
            snapshot_hash=str(body.snapshot_hash or ""),
        )
        conn.commit()
        return result


@router.get("/journee/snapshot-hash")
def get_journee_snapshot_hash(demande_id: int, mission_date: str, technicien: str = ""):
    with _conn() as conn:
        snapshot_hash = compute_journee_snapshot_hash(
            conn,
            int(demande_id),
            str(mission_date),
            str(technicien or "") or "Sans technicien",
        )
        return {
            "demande_id": int(demande_id),
            "mission_date": str(mission_date),
            "technicien": str(technicien or "") or "Sans technicien",
            "snapshot_hash": snapshot_hash,
        }
