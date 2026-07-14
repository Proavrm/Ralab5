"""Normalize historical DE point_code values per intervention."""
from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import sys
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from tools.tool_db_path import get_tool_db_path

DEFAULT_TARGET_DB = get_tool_db_path()


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _safe_json_parse(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    text = str(raw or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _build_plan(conn: sqlite3.Connection, limit: int) -> dict[str, Any]:
    rows = conn.execute(
        """
        SELECT
            pt.id AS point_id,
            pt.intervention_id,
            pt.point_code,
            pt.reference AS point_reference,
            pt.payload_json,
            i.reference AS intervention_reference
        FROM points_terrain pt
        LEFT JOIN interventions i ON i.id = pt.intervention_id
        WHERE pt.intervention_id IS NOT NULL
          AND UPPER(TRIM(COALESCE(pt.point_type, ''))) = 'DENSITE_ENROBES'
        ORDER BY pt.intervention_id ASC, pt.id ASC
        """
    ).fetchall()

    by_intervention: dict[int, list[sqlite3.Row]] = {}
    for row in rows:
        intervention_id = int(row["intervention_id"])
        by_intervention.setdefault(intervention_id, []).append(row)

    updates: list[dict[str, Any]] = []
    interventions_touched: set[int] = set()
    interventions_with_duplicates_before: set[int] = set()

    for intervention_id, items in by_intervention.items():
        code_counts: dict[str, int] = {}
        for item in items:
            compact = str(item["point_code"] or "").strip().upper()
            if not compact:
                continue
            code_counts[compact] = code_counts.get(compact, 0) + 1
        if any(count > 1 for count in code_counts.values()):
            interventions_with_duplicates_before.add(intervention_id)

        for index, item in enumerate(items, start=1):
            next_code = f"DE{index}"
            old_code = str(item["point_code"] or "").strip()
            payload = _safe_json_parse(item["payload_json"])
            payload_code = str(payload.get("point_code") or "").strip()

            payload_needs_update = payload_code != next_code and bool(payload)
            if old_code == next_code and not payload_needs_update:
                continue

            updated_payload = payload.copy()
            if updated_payload:
                updated_payload["point_code"] = next_code

            updates.append(
                {
                    "point_id": int(item["point_id"]),
                    "intervention_id": intervention_id,
                    "intervention_reference": str(item["intervention_reference"] or ""),
                    "point_reference": str(item["point_reference"] or ""),
                    "old_point_code": old_code,
                    "new_point_code": next_code,
                    "payload_json": json.dumps(updated_payload, ensure_ascii=False) if updated_payload else item["payload_json"],
                }
            )
            interventions_touched.add(intervention_id)

    return {
        "counts": {
            "de_points_total": len(rows),
            "interventions_with_de_points": len(by_intervention),
            "interventions_with_duplicates_before": len(interventions_with_duplicates_before),
            "interventions_to_touch": len(interventions_touched),
            "points_to_update": len(updates),
        },
        "updates": updates,
        "samples": updates[: max(0, int(limit))],
    }


def build_report(db_path: Path, limit: int = 20) -> dict[str, Any]:
    with _connect(db_path) as conn:
        plan = _build_plan(conn, limit=limit)
    return {
        "target_db_path": str(db_path),
        "mode": "dry-run",
        **plan,
    }


def apply_normalization(db_path: Path, limit: int = 20) -> dict[str, Any]:
    with _connect(db_path) as conn:
        plan = _build_plan(conn, limit=limit)
        updates = plan["updates"]
        if not updates:
            return {
                "target_db_path": str(db_path),
                "mode": "applied",
                "updated_rows": 0,
                **plan,
            }

        try:
            conn.execute("BEGIN")
            updated_rows = 0
            for item in updates:
                cursor = conn.execute(
                    """
                    UPDATE points_terrain
                    SET point_code = ?, payload_json = ?
                    WHERE id = ?
                    """,
                    (
                        item["new_point_code"],
                        item["payload_json"],
                        int(item["point_id"]),
                    ),
                )
                updated_rows += int(cursor.rowcount if cursor.rowcount != -1 else 0)
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    return {
        "target_db_path": str(db_path),
        "mode": "applied",
        "updated_rows": updated_rows,
        **plan,
    }


def _backup_db(source_db_path: Path, backup_db_path: Path) -> Path:
    backup_db_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_db_path, backup_db_path)
    return backup_db_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize historical DE point codes per intervention.")
    parser.add_argument(
        "--target-db",
        dest="target_db",
        default=str(DEFAULT_TARGET_DB),
        help="Target RaLab database path",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Maximum number of sample rows to include in the JSON report",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply updates instead of dry-run report",
    )
    parser.add_argument(
        "--backup-db",
        dest="backup_db",
        default="",
        help="Mandatory when --apply is used. Path for backup copy before normalization",
    )
    args = parser.parse_args()

    db_path = Path(args.target_db)

    if args.apply:
        backup_text = (args.backup_db or "").strip()
        if not backup_text:
            parser.error("--backup-db is required when --apply is used")
        backup_path = Path(backup_text)
        backup_created_at = _backup_db(db_path, backup_path)
        result = apply_normalization(db_path, limit=args.limit)
        result["backup_db_path"] = str(backup_created_at)
    else:
        result = build_report(db_path, limit=args.limit)

    print(json.dumps(result, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
