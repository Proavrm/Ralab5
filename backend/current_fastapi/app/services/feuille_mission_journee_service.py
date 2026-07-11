from __future__ import annotations

import hashlib
import json
import sqlite3
import unicodedata
from datetime import datetime
from typing import Optional


def _norm(value: Optional[str]) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


def technicien_label_from_row(technicien: Optional[str], geotechnicien: Optional[str]) -> str:
    label = str(technicien or geotechnicien or "").strip()
    return label or "Sans technicien"


def technicien_key_from_label(label: str) -> str:
    normalized = _norm(label)
    if normalized in {"sans technicien", "non assigne", "unassigned"}:
        return "__unassigned__"
    return normalized or "__unassigned__"


def _is_note_technique_row(row: sqlite3.Row) -> bool:
    if row["campagne_id"] not in (None, ""):
        return False
    type_val = _norm(row["type_intervention"])
    nature = _norm(row["nature_reelle"] if "nature_reelle" in row.keys() else "")
    ref = str(row["reference"] or "").upper()
    return "note technique" in type_val or nature == "note technique" or "-NT" in ref


def _mission_programme_from_observations(raw: Optional[str]) -> str:
    if not raw or not isinstance(raw, str):
        return ""
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return ""
    if not isinstance(payload, dict):
        return ""
    return str(payload.get("programme_terrain") or payload.get("mission_programme") or "").strip()


def _intervention_payload_row(row: sqlite3.Row) -> dict:
    return {
        "uid": int(row["id"]),
        "reference": str(row["reference"] or ""),
        "type_intervention": str(row["type_intervention"] or ""),
        "statut": str(row["statut"] or ""),
        "programme_terrain": _mission_programme_from_observations(row["observations"]),
    }


def compute_journee_snapshot_hash(
    conn: sqlite3.Connection,
    demande_id: int,
    mission_date: str,
    technicien_label: str,
) -> str:
    rows = conn.execute(
        """
        SELECT
            i.id,
            i.reference,
            i.type_intervention,
            i.nature_reelle,
            i.campagne_id,
            i.date_intervention,
            i.statut,
            i.technicien,
            i.geotechnicien,
            i.observations
        FROM interventions i
        WHERE i.demande_id = ?
          AND COALESCE(NULLIF(i.date_intervention, ''), '') = ?
        ORDER BY i.id ASC
        """,
        (int(demande_id), str(mission_date)),
    ).fetchall()
    target_key = technicien_key_from_label(technicien_label)
    payload = []
    for row in rows:
        if _is_note_technique_row(row):
            continue
        label = technicien_label_from_row(row["technicien"], row["geotechnicien"])
        if technicien_key_from_label(label) != target_key:
            continue
        payload.append(_intervention_payload_row(row))
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
    return digest[:16]


def resolve_mission_feuille_status(record: Optional[sqlite3.Row], current_hash: str) -> str:
    if not record or not record["generated_at"]:
        return "none"
    stored_hash = str(record["snapshot_hash"] or "")
    if stored_hash and current_hash and stored_hash != current_hash:
        return "stale"
    if record["printed_at"]:
        return "printed"
    return "generated"


def _load_status_records(conn: sqlite3.Connection) -> dict[tuple[int, str, str], sqlite3.Row]:
    rows = conn.execute(
        """
        SELECT demande_id, mission_date, technicien_key, technicien_label,
               snapshot_hash, generated_at, printed_at
        FROM feuille_mission_journee
        """
    ).fetchall()
    return {
        (int(row["demande_id"]), str(row["mission_date"]), str(row["technicien_key"])): row
        for row in rows
    }


def enrich_planning_items_with_mission_status(conn: sqlite3.Connection, items: list[dict]) -> None:
    records = _load_status_records(conn)
    hash_cache: dict[tuple[int, str, str], str] = {}
    for item in items:
        if item.get("kind") != "intervention" or item.get("is_demande_scope"):
            continue
        demande_id = item.get("source_demande_id")
        mission_date = str(item.get("start") or "")[:10]
        if not demande_id or not mission_date:
            item["mission_feuille_status"] = "none"
            item["mission_feuille_generated_at"] = None
            item["mission_feuille_printed_at"] = None
            continue
        technicien_label = technicien_label_from_row(item.get("technicien"), item.get("geotechnicien"))
        cache_key = (int(demande_id), mission_date, technicien_key_from_label(technicien_label))
        if cache_key not in hash_cache:
            hash_cache[cache_key] = compute_journee_snapshot_hash(
                conn,
                int(demande_id),
                mission_date,
                technicien_label,
            )
        record = records.get(cache_key)
        status = resolve_mission_feuille_status(record, hash_cache[cache_key])
        item["mission_feuille_status"] = status
        item["mission_feuille_generated_at"] = record["generated_at"] if record else None
        item["mission_feuille_printed_at"] = record["printed_at"] if record else None


def touch_journee_record(
    conn: sqlite3.Connection,
    *,
    demande_id: int,
    mission_date: str,
    technicien: str = "",
    action: str,
    snapshot_hash: str = "",
) -> dict:
    technicien_label = str(technicien or "").strip() or "Sans technicien"
    technicien_key = technicien_key_from_label(technicien_label)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    current_hash = snapshot_hash or compute_journee_snapshot_hash(
        conn,
        demande_id,
        mission_date,
        technicien_label,
    )
    existing = conn.execute(
        """
        SELECT id, generated_at, printed_at, snapshot_hash
        FROM feuille_mission_journee
        WHERE demande_id = ? AND mission_date = ? AND technicien_key = ?
        """,
        (int(demande_id), str(mission_date), technicien_key),
    ).fetchone()
    normalized_action = _norm(action)
    if normalized_action == "printed":
        if existing:
            conn.execute(
                """
                UPDATE feuille_mission_journee
                SET printed_at = ?, snapshot_hash = ?, technicien_label = ?, updated_at = ?
                WHERE id = ?
                """,
                (now, current_hash, technicien_label, now, int(existing["id"])),
            )
        else:
            conn.execute(
                """
                INSERT INTO feuille_mission_journee (
                    demande_id, mission_date, technicien_key, technicien_label,
                    snapshot_hash, generated_at, printed_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (int(demande_id), str(mission_date), technicien_key, technicien_label, current_hash, now, now, now),
            )
    else:
        if existing:
            conn.execute(
                """
                UPDATE feuille_mission_journee
                SET generated_at = ?, snapshot_hash = ?, technicien_label = ?, updated_at = ?
                WHERE id = ?
                """,
                (now, current_hash, technicien_label, now, int(existing["id"])),
            )
        else:
            conn.execute(
                """
                INSERT INTO feuille_mission_journee (
                    demande_id, mission_date, technicien_key, technicien_label,
                    snapshot_hash, generated_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (int(demande_id), str(mission_date), technicien_key, technicien_label, current_hash, now, now),
            )
    row = conn.execute(
        """
        SELECT demande_id, mission_date, technicien_label, snapshot_hash,
               generated_at, printed_at
        FROM feuille_mission_journee
        WHERE demande_id = ? AND mission_date = ? AND technicien_key = ?
        """,
        (int(demande_id), str(mission_date), technicien_key),
    ).fetchone()
    status = resolve_mission_feuille_status(row, current_hash)
    return {
        "demande_id": int(row["demande_id"]),
        "mission_date": str(row["mission_date"]),
        "technicien": str(row["technicien_label"]),
        "snapshot_hash": str(row["snapshot_hash"]),
        "generated_at": row["generated_at"],
        "printed_at": row["printed_at"],
        "status": status,
    }
