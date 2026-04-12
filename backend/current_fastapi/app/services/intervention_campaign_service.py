from __future__ import annotations

import re
import sqlite3
import unicodedata
from datetime import datetime
from typing import Any

from app.core.database import ensure_ralab4_schema, get_db_path

DB_PATH = get_db_path()
GENERIC_CAMPAIGN_WORKFLOW_LABEL = "Campagne -> Preparation de l'intervention -> Intervention -> Essai / prelevement -> Restitution"
GENERIC_CAMPAIGN_SOURCE_MODE = "demande"
GENERIC_CAMPAIGN_TARGET_MODE = "interventions"


def _conn() -> sqlite3.Connection:
    ensure_ralab4_schema(DB_PATH)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _normalize_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _now_sql() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _normalize_campaign_code(code: object, fallback_label: object = "") -> str:
    raw_code = _normalize_text(code)
    if raw_code:
        ascii_code = unicodedata.normalize("NFKD", raw_code).encode("ascii", "ignore").decode("ascii")
        sanitized = re.sub(r"[^A-Za-z0-9]+", "", ascii_code).upper()
        return sanitized[:12] or "CMP"

    raw_label = _normalize_text(fallback_label)
    ascii_label = unicodedata.normalize("NFKD", raw_label).encode("ascii", "ignore").decode("ascii")
    words = [word for word in re.split(r"[^A-Za-z0-9]+", ascii_label) if word]
    if not words:
        return "CMP"
    if len(words) == 1:
        return words[0][:6].upper()
    return "".join(word[0] for word in words)[:6].upper() or "CMP"


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def _load_demande_row(conn: sqlite3.Connection, demande_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT id, reference FROM demandes WHERE id = ?",
        (demande_id,),
    ).fetchone()


def _load_preparation_phase(conn: sqlite3.Connection, demande_id: int) -> str:
    row = conn.execute(
        "SELECT phase_operation FROM demande_preparations WHERE demande_id = ?",
        (demande_id,),
    ).fetchone()
    return _normalize_text(row["phase_operation"]) if row is not None else ""


def _load_campaign_row(conn: sqlite3.Connection, campaign_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM intervention_campaigns WHERE id = ?",
        (campaign_id,),
    ).fetchone()


def _next_campaign_reference(conn: sqlite3.Connection, demande: sqlite3.Row) -> str:
    demande_reference = _normalize_text(demande["reference"]) or f"DEM-{int(demande['id'])}"
    prefix = f"{demande_reference}-C"
    rows = conn.execute(
        "SELECT reference FROM intervention_campaigns WHERE demande_id = ? AND reference LIKE ?",
        (int(demande["id"]), f"{prefix}%"),
    ).fetchall()

    numbers: list[int] = []
    for row in rows:
        reference = _normalize_text(row["reference"])
        match = re.match(rf"^{re.escape(prefix)}(\d+)$", reference)
        if match:
            numbers.append(int(match.group(1)))

    return f"{prefix}{max(numbers, default=0) + 1:02d}"


def _seed_legacy_pmt_campaigns(conn: sqlite3.Connection, demande_id: int) -> None:
    if not _table_exists(conn, "pmt_campaigns") or not _table_exists(conn, "pmt_campaign_interventions"):
        return

    legacy_rows = conn.execute(
        "SELECT * FROM pmt_campaigns WHERE demande_id = ? ORDER BY id",
        (demande_id,),
    ).fetchall()
    if not legacy_rows:
        return

    now = _now_sql()
    for legacy in legacy_rows:
        source_mode = _normalize_text(legacy["source_mode"])
        target_mode = _normalize_text(legacy["target_mode"])
        source_label = "Historique importe" if source_mode == "historique_importe" else source_mode
        target_label = "Cible manuelle" if target_mode == "manuel" else target_mode

        conn.execute(
            """
            INSERT OR IGNORE INTO intervention_campaigns (
                demande_id, code, reference, label, designation, workflow_label,
                source_mode, source_label, target_mode, target_label,
                statut, notes, legacy_source_kind, legacy_source_id,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(legacy["demande_id"]),
                _normalize_text(legacy["code"]),
                _normalize_text(legacy["reference"]),
                _normalize_text(legacy["label"]),
                _normalize_text(legacy["designation"]),
                _normalize_text(legacy["workflow_label"]),
                source_mode,
                source_label,
                target_mode,
                target_label,
                _normalize_text(legacy["statut"]) or "Active",
                _normalize_text(legacy["notes"]),
                "pmt_campaign",
                int(legacy["id"]),
                _normalize_text(legacy["created_at"]) or now,
                _normalize_text(legacy["updated_at"]) or now,
            ),
        )

        campaign_row = conn.execute(
            "SELECT id FROM intervention_campaigns WHERE reference = ?",
            (_normalize_text(legacy["reference"]),),
        ).fetchone()
        if campaign_row is None:
            continue

        linked_rows = conn.execute(
            "SELECT intervention_id FROM pmt_campaign_interventions WHERE campaign_id = ?",
            (int(legacy["id"]),),
        ).fetchall()
        for linked in linked_rows:
            conn.execute(
                """
                UPDATE interventions
                SET campaign_id = ?, updated_at = ?
                WHERE id = ? AND demande_id = ? AND COALESCE(campaign_id, 0) = 0
                """,
                (int(campaign_row["id"]), now, int(linked["intervention_id"]), demande_id),
            )


def _load_legacy_campaign_report(conn: sqlite3.Connection, campaign: sqlite3.Row) -> sqlite3.Row | None:
    if _normalize_text(campaign["legacy_source_kind"]) != "pmt_campaign" or campaign["legacy_source_id"] is None:
        return None
    return conn.execute(
        """
        SELECT id, reference, statut
        FROM pmt_reports
        WHERE campaign_id = ? AND scope = 'campagne' AND essai_id IS NULL
        ORDER BY id DESC
        LIMIT 1
        """,
        (int(campaign["legacy_source_id"]),),
    ).fetchone()


def _load_legacy_essais_by_intervention(conn: sqlite3.Connection, campaign: sqlite3.Row) -> dict[int, list[sqlite3.Row]]:
    if _normalize_text(campaign["legacy_source_kind"]) != "pmt_campaign" or campaign["legacy_source_id"] is None:
        return {}

    rows = conn.execute(
        """
        SELECT
            pe.id,
            pe.intervention_id,
            pe.reference,
            pe.statut,
            pe.date_essai,
            pr.id AS report_uid,
            pr.reference AS report_reference
        FROM pmt_essais pe
        LEFT JOIN pmt_reports pr ON pr.scope = 'essai' AND pr.essai_id = pe.id
        WHERE pe.campaign_id = ?
        ORDER BY COALESCE(NULLIF(pe.date_essai, ''), pe.created_at) DESC, pe.id DESC
        """,
        (int(campaign["legacy_source_id"]),),
    ).fetchall()

    grouped: dict[int, list[sqlite3.Row]] = {}
    for row in rows:
        grouped.setdefault(int(row["intervention_id"]), []).append(row)
    return grouped


def _load_generic_essais_for_intervention(conn: sqlite3.Connection, intervention_id: int) -> list[sqlite3.Row]:
    if not _table_exists(conn, "essais"):
        return []
    return conn.execute(
        """
        SELECT id, printf('ESSAI-%04d', id) AS reference, statut, date_debut
        FROM essais
        WHERE intervention_id = ?
        ORDER BY COALESCE(date_debut, created_at) DESC, id DESC
        """,
        (intervention_id,),
    ).fetchall()


def _campaign_to_dict(
    conn: sqlite3.Connection,
    demande: sqlite3.Row,
    campaign: sqlite3.Row,
    preparation_phase: str,
) -> dict[str, Any]:
    intervention_rows = conn.execute(
        """
        SELECT
            i.id,
            i.reference,
            i.date_intervention,
            i.type_intervention,
            i.sujet,
            i.statut
        FROM interventions i
        WHERE i.demande_id = ? AND i.campaign_id = ?
        ORDER BY COALESCE(i.date_intervention, ''), COALESCE(i.reference, ''), i.id
        """,
        (int(demande["id"]), int(campaign["id"])),
    ).fetchall()

    legacy_essais_by_intervention = _load_legacy_essais_by_intervention(conn, campaign)
    legacy_report = _load_legacy_campaign_report(conn, campaign)

    intervention_items: list[dict[str, Any]] = []
    interventions_with_essais = 0
    essai_count = 0

    for intervention in intervention_rows:
        intervention_id = int(intervention["id"])
        generic_essais = _load_generic_essais_for_intervention(conn, intervention_id)
        legacy_essais = legacy_essais_by_intervention.get(intervention_id, [])
        effective_essais = generic_essais if generic_essais else legacy_essais
        latest_essai = effective_essais[0] if effective_essais else None

        current_essai_count = len(effective_essais)
        essai_count += current_essai_count
        if current_essai_count:
            interventions_with_essais += 1

        intervention_items.append(
            {
                "uid": intervention_id,
                "reference": _normalize_text(intervention["reference"]),
                "date_intervention": _normalize_text(intervention["date_intervention"]),
                "type_intervention": _normalize_text(intervention["type_intervention"]),
                "sujet": _normalize_text(intervention["sujet"]),
                "statut": _normalize_text(intervention["statut"]),
                "pmt_essai_count": current_essai_count,
                "pmt_essais": [],
                "pmt_essai_uid": int(latest_essai["id"]) if latest_essai is not None else None,
                "pmt_essai_reference": _normalize_text(latest_essai["reference"]) if latest_essai is not None else "",
                "pmt_essai_status": _normalize_text(latest_essai["statut"]) if latest_essai is not None else "",
                "pmt_measure_count": 0,
                "pmt_macrotexture_average_mm": None,
                "pmt_report_uid": int(latest_essai["report_uid"]) if latest_essai is not None and "report_uid" in latest_essai.keys() and latest_essai["report_uid"] is not None else None,
                "pmt_report_reference": _normalize_text(latest_essai["report_reference"]) if latest_essai is not None and "report_reference" in latest_essai.keys() else "",
            }
        )

    intervention_count = len(intervention_items)
    pending_intervention_count = max(intervention_count - interventions_with_essais, 0)
    if intervention_count == 0:
        next_step = "Ajouter la premiere intervention a la campagne."
    elif pending_intervention_count > 0:
        next_step = "Completer les interventions de la campagne et rattacher les essais utiles."
    else:
        next_step = "Relire la campagne et finaliser la restitution."

    report_ref = _normalize_text(legacy_report["reference"]) if legacy_report is not None else ""
    report_status = _normalize_text(legacy_report["statut"]) if legacy_report is not None else "A completer"
    essai_status = f"{essai_count} essai(s) lies" if essai_count else "Aucun essai lie"

    return {
        "uid": int(campaign["id"]),
        "code": _normalize_text(campaign["code"]),
        "reference": _normalize_text(campaign["reference"]),
        "label": _normalize_text(campaign["label"]),
        "designation": _normalize_text(campaign["designation"]),
        "zone_scope": _normalize_text(campaign["zone_scope"]),
        "temporalite": _normalize_text(campaign["temporalite"]),
        "notes": _normalize_text(campaign["notes"]),
        "workflow_label": _normalize_text(campaign["workflow_label"]),
        "source_mode": _normalize_text(campaign["source_mode"]),
        "source_label": _normalize_text(campaign["source_label"]) or _normalize_text(campaign["source_mode"]),
        "target_mode": _normalize_text(campaign["target_mode"]),
        "target_label": _normalize_text(campaign["target_label"]) or _normalize_text(campaign["target_mode"]),
        "statut": _normalize_text(campaign["statut"]),
        "intervention_count": intervention_count,
        "essai_count": essai_count,
        "pending_intervention_count": pending_intervention_count,
        "intervention_uids": [item["uid"] for item in intervention_items],
        "interventions": intervention_items,
        "report_uid": int(legacy_report["id"]) if legacy_report is not None else None,
        "report_ref": report_ref,
        "report_status": report_status,
        "preparation_status": _normalize_text(preparation_phase) or "A cadrer",
        "next_step": next_step,
        "steps": [
            {"code": "campagne", "label": "Campagne", "status": _normalize_text(campaign["statut"]) or "Active"},
            {"code": "preparation", "label": "Preparation", "status": _normalize_text(preparation_phase) or "A cadrer"},
            {"code": "intervention", "label": "Interventions", "status": f"{intervention_count} intervention(s) liee(s)"},
            {"code": "essai", "label": "Essais", "status": essai_status},
            {"code": "rapport", "label": "Restitution", "status": report_ref or "A produire"},
        ],
        "demande_uid": int(demande["id"]),
        "demande_reference": _normalize_text(demande["reference"]),
    }


def list_campaigns_for_demande(demande_id: int, preparation_phase: str = "") -> list[dict[str, Any]]:
    with _conn() as conn:
        demande = _load_demande_row(conn, demande_id)
        if demande is None:
            raise LookupError(f"Demande #{demande_id} introuvable")

        _seed_legacy_pmt_campaigns(conn, demande_id)
        campaign_rows = conn.execute(
            """
            SELECT *
            FROM intervention_campaigns
            WHERE demande_id = ?
            ORDER BY COALESCE(code, ''), COALESCE(reference, ''), id
            """,
            (demande_id,),
        ).fetchall()
        conn.commit()
        return [_campaign_to_dict(conn, demande, campaign, preparation_phase) for campaign in campaign_rows]


def create_campaign(
    demande_id: int,
    *,
    code: object = "",
    label: object = "Campagne",
    designation: object = "",
    zone_scope: object = "",
    temporalite: object = "",
    notes: object = "",
    statut: object = "A cadrer",
) -> dict[str, Any]:
    with _conn() as conn:
        demande = _load_demande_row(conn, demande_id)
        if demande is None:
            raise LookupError(f"Demande #{demande_id} introuvable")

        now = _now_sql()
        normalized_label = _normalize_text(label) or "Campagne"
        normalized_zone_scope = _normalize_text(zone_scope)
        target_label = normalized_zone_scope or normalized_label

        cursor = conn.execute(
            """
            INSERT INTO intervention_campaigns (
                demande_id, code, reference, label, designation, zone_scope, temporalite,
                workflow_label, source_mode, source_label, target_mode, target_label,
                statut, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(demande_id),
                _normalize_campaign_code(code, normalized_label),
                _next_campaign_reference(conn, demande),
                normalized_label,
                _normalize_text(designation),
                normalized_zone_scope,
                _normalize_text(temporalite),
                GENERIC_CAMPAIGN_WORKFLOW_LABEL,
                GENERIC_CAMPAIGN_SOURCE_MODE,
                _normalize_text(demande["reference"]),
                GENERIC_CAMPAIGN_TARGET_MODE,
                target_label,
                _normalize_text(statut) or "A cadrer",
                _normalize_text(notes),
                now,
                now,
            ),
        )

        campaign = _load_campaign_row(conn, int(cursor.lastrowid))
        conn.commit()
        if campaign is None:
            raise LookupError("Campagne nouvellement creee introuvable")
        return _campaign_to_dict(conn, demande, campaign, _load_preparation_phase(conn, demande_id))


def update_campaign(
    campaign_id: int,
    *,
    code: object | None = None,
    label: object | None = None,
    designation: object | None = None,
    zone_scope: object | None = None,
    temporalite: object | None = None,
    notes: object | None = None,
    statut: object | None = None,
) -> dict[str, Any]:
    with _conn() as conn:
        campaign = _load_campaign_row(conn, campaign_id)
        if campaign is None:
            raise LookupError(f"Campagne #{campaign_id} introuvable")

        demande_id = int(campaign["demande_id"])
        demande = _load_demande_row(conn, demande_id)
        if demande is None:
            raise LookupError(f"Demande #{demande_id} introuvable")

        current_label = _normalize_text(campaign["label"]) or "Campagne"
        current_zone_scope = _normalize_text(campaign["zone_scope"])
        current_target_label = _normalize_text(campaign["target_label"])
        current_source_mode = _normalize_text(campaign["source_mode"])
        current_source_label = _normalize_text(campaign["source_label"])
        current_target_mode = _normalize_text(campaign["target_mode"])
        current_workflow_label = _normalize_text(campaign["workflow_label"])
        legacy_source_kind = _normalize_text(campaign["legacy_source_kind"])

        next_label = _normalize_text(label) if label is not None else current_label
        next_zone_scope = _normalize_text(zone_scope) if zone_scope is not None else current_zone_scope

        updates: dict[str, Any] = {}
        if code is not None or label is not None:
            updates["code"] = _normalize_campaign_code(
                code if code is not None else campaign["code"],
                next_label,
            )
        if label is not None:
            updates["label"] = next_label or "Campagne"
        if designation is not None:
            updates["designation"] = _normalize_text(designation)
        if zone_scope is not None:
            updates["zone_scope"] = next_zone_scope
        if temporalite is not None:
            updates["temporalite"] = _normalize_text(temporalite)
        if notes is not None:
            updates["notes"] = _normalize_text(notes)
        if statut is not None:
            updates["statut"] = _normalize_text(statut) or _normalize_text(campaign["statut"]) or "A cadrer"

        if not legacy_source_kind:
            updates["workflow_label"] = current_workflow_label or GENERIC_CAMPAIGN_WORKFLOW_LABEL
            updates["source_mode"] = current_source_mode or GENERIC_CAMPAIGN_SOURCE_MODE
            updates["source_label"] = current_source_label or _normalize_text(demande["reference"])
            updates["target_mode"] = current_target_mode or GENERIC_CAMPAIGN_TARGET_MODE
            updates["target_label"] = next_zone_scope or next_label or current_target_label or current_label

        if not updates:
            return _campaign_to_dict(conn, demande, campaign, _load_preparation_phase(conn, demande_id))

        updates["updated_at"] = _now_sql()
        assignments = ", ".join(f"{column} = ?" for column in updates)
        values = list(updates.values()) + [campaign_id]
        conn.execute(
            f"UPDATE intervention_campaigns SET {assignments} WHERE id = ?",
            values,
        )
        updated_campaign = _load_campaign_row(conn, campaign_id)
        conn.commit()
        if updated_campaign is None:
            raise LookupError(f"Campagne #{campaign_id} introuvable apres mise a jour")
        return _campaign_to_dict(conn, demande, updated_campaign, _load_preparation_phase(conn, demande_id))


def attach_intervention_to_campaign(intervention_id: int, campaign_id: int) -> dict[str, int]:
    with _conn() as conn:
        intervention = conn.execute(
            "SELECT id, demande_id FROM interventions WHERE id = ?",
            (intervention_id,),
        ).fetchone()
        if intervention is None:
            raise LookupError(f"Intervention #{intervention_id} introuvable")

        campaign = conn.execute(
            "SELECT id, demande_id FROM intervention_campaigns WHERE id = ?",
            (campaign_id,),
        ).fetchone()
        if campaign is None:
            raise LookupError(f"Campagne #{campaign_id} introuvable")

        if int(intervention["demande_id"]) != int(campaign["demande_id"]):
            raise ValueError("Cette campagne n'appartient pas a la meme demande que l'intervention.")

        conn.execute(
            "UPDATE interventions SET campaign_id = ?, updated_at = ? WHERE id = ?",
            (campaign_id, _now_sql(), intervention_id),
        )
        conn.commit()
        return {"campaign_id": campaign_id, "intervention_id": intervention_id}