from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import ensure_ralab4_schema, get_db_path

router = APIRouter()
DB_PATH = get_db_path()


class PmtEssaiUpdate(BaseModel):
    statut: str | None = None
    date_essai: str | None = None
    operateur: str | None = None
    section_controlee: str | None = None
    voie: str | None = None
    sens: str | None = None
    couche: str | None = None
    nature_support: str | None = None
    observations: str | None = None
    resultats: dict[str, Any] | None = None


def _conn():
    ensure_ralab4_schema(DB_PATH)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _model_dump(payload: BaseModel) -> dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_unset=True)
    return payload.dict(exclude_unset=True)


def _parse_intervention_payload(observations: str) -> tuple[str, dict[str, Any]]:
    if not isinstance(observations, str):
        return "", {}
    raw = observations.strip()
    if not raw.startswith("{"):
        return "", {}
    try:
        payload = json.loads(raw)
    except Exception:
        return "", {}
    code = str(payload.get("essai_code") or payload.get("source_essai_code") or "").strip().upper()
    nested_payload = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
    return code, nested_payload


def _essai_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "uid": int(row["id"]),
        "reference": row["reference"] if "reference" in row.keys() else f"ESSAI-{int(row['id']):04d}",
        "essai_code": row["essai_code"] or "PMT",
        "type_essai": row["type_essai"] or "Profondeur de macrotexture",
        "statut": row["statut"] or "Programmé",
        "date_essai": row["date_debut"] or "",
        "date_debut": row["date_debut"] or "",
        "date_fin": row["date_fin"] or "",
        "operateur": row["operateur"] or "",
        "observations": row["observations"] or "",
        "resultats": json.loads(row["resultats"]) if isinstance(row["resultats"], str) and row["resultats"].strip().startswith("{") else {},
        "intervention_id": row["intervention_id"],
    }


def _get_existing_pmt_essai(conn: sqlite3.Connection, intervention_id: int):
    return conn.execute(
        "SELECT * FROM essais WHERE intervention_id = ? AND UPPER(COALESCE(essai_code, '')) = 'PMT' ORDER BY id DESC LIMIT 1",
        (intervention_id,),
    ).fetchone()


def _ensure_campaign_for_intervention(conn: sqlite3.Connection, intervention_row: sqlite3.Row):
    if intervention_row["campagne_id"]:
        return conn.execute("SELECT * FROM campagnes WHERE id = ?", (intervention_row["campagne_id"],)).fetchone()

    demande_id = int(intervention_row["demande_id"])
    existing = conn.execute(
        "SELECT * FROM campagnes WHERE demande_id = ? AND (UPPER(code) = 'PMT' OR UPPER(type_campagne) = 'PMT' OR UPPER(label) LIKE '%PMT%') ORDER BY id DESC LIMIT 1",
        (demande_id,),
    ).fetchone()
    if existing:
        conn.execute("UPDATE interventions SET campagne_id = ? WHERE id = ?", (existing["id"], intervention_row["id"]))
        return existing

    row_demande = conn.execute("SELECT annee, labo_code FROM demandes WHERE id = ?", (demande_id,)).fetchone()
    annee = row_demande["annee"] if row_demande else datetime.now().year
    labo = row_demande["labo_code"] if row_demande else "SP"
    prefix = f"{annee}-{labo}-C-PMT-"
    refs = conn.execute("SELECT reference FROM campagnes WHERE reference LIKE ?", (f"{prefix}%",)).fetchall()
    numbers = []
    for ref_row in refs:
        ref = str(ref_row["reference"] or "")
        suffix = ref.replace(prefix, "", 1)
        if suffix.isdigit():
            numbers.append(int(suffix))
    reference = f"{prefix}{max(numbers, default=0) + 1:03d}"
    conn.execute(
        """
        INSERT INTO campagnes (
            demande_id, reference, label, type_campagne, code, designation,
            workflow_label, statut, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            demande_id,
            reference,
            "Macrotexture / PMT",
            "PMT",
            "PMT",
            "Macrotexture de chaussée",
            "Affaire -> Demande -> Campagne -> Intervention -> Essai PMT",
            "Active",
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        ),
    )
    campagne_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute("UPDATE interventions SET campagne_id = ? WHERE id = ?", (campagne_id, intervention_row["id"]))
    return conn.execute("SELECT * FROM campagnes WHERE id = ?", (campagne_id,)).fetchone()


def _ensure_pmt_essai_for_intervention(conn: sqlite3.Connection, intervention_id: int):
    intervention = conn.execute("SELECT * FROM interventions WHERE id = ?", (intervention_id,)).fetchone()
    if not intervention:
        raise LookupError(f"Intervention #{intervention_id} introuvable")

    campaign = _ensure_campaign_for_intervention(conn, intervention)
    existing = _get_existing_pmt_essai(conn, intervention_id)
    if existing:
        return campaign, existing

    code, payload = _parse_intervention_payload(intervention["observations"] or "")
    resultats = payload if code == "PMT" else {}
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        """
        INSERT INTO essais (
            echantillon_id, intervention_id, essai_code, type_essai, norme, statut,
            date_debut, date_fin, resultats, operateur, observations, source_signature,
            source_label, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            None,
            intervention_id,
            "PMT",
            "Profondeur de macrotexture",
            "NF EN 13036-1",
            "Programmé",
            intervention["date_intervention"] or "",
            None,
            json.dumps(resultats, ensure_ascii=False),
            intervention["technicien"] or "",
            intervention["observations"] or "",
            f"PMT|INTERVENTION|{intervention_id}",
            campaign["reference"] if campaign else "PMT",
            now,
            now,
        ),
    )
    essai_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    essai = conn.execute("SELECT * FROM essais WHERE id = ?", (essai_id,)).fetchone()
    return campaign, essai


@router.get("/demandes/{demande_id}/campagnes")
def list_pmt_campaigns(demande_id: int, preparation_phase: str = ""):
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM campagnes WHERE demande_id = ? AND (UPPER(code) = 'PMT' OR UPPER(type_campagne) = 'PMT' OR UPPER(label) LIKE '%PMT%') ORDER BY id DESC",
            (demande_id,),
        ).fetchall()
        return [{**dict(row), "uid": int(row["id"])} for row in rows]


@router.get("/interventions/{intervention_id}/workflow")
def get_intervention_pmt_workflow(intervention_id: int, preparation_phase: str = ""):
    with _conn() as conn:
        intervention = conn.execute("SELECT * FROM interventions WHERE id = ?", (intervention_id,)).fetchone()
        if not intervention:
            raise HTTPException(status_code=404, detail=f"Intervention #{intervention_id} introuvable")
        campaign = _ensure_campaign_for_intervention(conn, intervention)
        essai = _get_existing_pmt_essai(conn, intervention_id)
        intervention_count = conn.execute("SELECT COUNT(*) FROM interventions WHERE campagne_id = ?", (campaign["id"],)).fetchone()[0] if campaign else 0
        essai_count = conn.execute("SELECT COUNT(*) FROM essais WHERE intervention_id IN (SELECT id FROM interventions WHERE campagne_id = ?) AND UPPER(COALESCE(essai_code, '')) = 'PMT'", (campaign["id"],)).fetchone()[0] if campaign else 0
        return {
            "is_pmt": True,
            "campaign": {
                "uid": int(campaign["id"]),
                "reference": campaign["reference"],
                "label": campaign["label"],
                "intervention_count": int(intervention_count),
                "essai_count": int(essai_count),
                "report_ref": "",
            } if campaign else None,
            "current_intervention": {
                "uid": int(intervention["id"]),
                "reference": intervention["reference"],
                "date_intervention": intervention["date_intervention"] or "",
            },
            "essai": _essai_row_to_dict(essai) if essai else None,
            "essai_report": None,
            "campaign_report": None,
        }


@router.post("/interventions/{intervention_id}/essai")
def create_or_open_pmt_essai(intervention_id: int):
    with _conn() as conn:
        _, essai = _ensure_pmt_essai_for_intervention(conn, intervention_id)
    return _essai_row_to_dict(essai)


@router.post("/interventions/{intervention_id}/essais")
def create_new_pmt_essai(intervention_id: int):
    with _conn() as conn:
        _, essai = _ensure_pmt_essai_for_intervention(conn, intervention_id)
    return _essai_row_to_dict(essai)


@router.get("/essais/{uid}")
def get_pmt_essai_by_uid(uid: int):
    with _conn() as conn:
        row = conn.execute("SELECT * FROM essais WHERE id = ? AND UPPER(COALESCE(essai_code, '')) = 'PMT'", (uid,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Essai PMT #{uid} introuvable")
    return _essai_row_to_dict(row)


@router.put("/essais/{uid}")
def update_pmt_essai_by_uid(uid: int, body: PmtEssaiUpdate):
    fields = _model_dump(body)
    if "date_essai" in fields:
        fields["date_debut"] = fields.pop("date_essai")
    if "resultats" in fields and isinstance(fields["resultats"], dict):
        fields["resultats"] = json.dumps(fields["resultats"], ensure_ascii=False)
    fields["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    clause = ", ".join(f"{key} = ?" for key in fields)
    with _conn() as conn:
        cur = conn.execute(f"UPDATE essais SET {clause} WHERE id = ? AND UPPER(COALESCE(essai_code, '')) = 'PMT'", list(fields.values()) + [uid])
        if not cur.rowcount:
            raise HTTPException(status_code=404, detail=f"Essai PMT #{uid} introuvable")
        row = conn.execute("SELECT * FROM essais WHERE id = ?", (uid,)).fetchone()
    return _essai_row_to_dict(row)


@router.get("/rapports/{uid}")
def get_pmt_rapport_by_uid(uid: int):
    raise HTTPException(status_code=404, detail="Les rapports PMT spécifiques ne sont plus utilisés")
