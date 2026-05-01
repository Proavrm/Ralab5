from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.core.database import get_db_path


DE_IMPORT_SIGNATURE_PREFIX = "DE_IMPORT|ESSAI|"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Repair historical DE imports by collapsing duplicate interventions per demande/campagne/date."
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=get_db_path(),
        help="SQLite database path (default: configured app DB).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply changes. Default is dry-run.",
    )
    parser.add_argument(
        "--backup",
        type=Path,
        default=None,
        help="Optional backup file path used in apply mode.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print per-group details.",
    )
    return parser.parse_args()


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _discover_intervention_ref_tables(conn: sqlite3.Connection) -> dict[str, str]:
    """Return {table_name: id_column_name} for tables carrying intervention_id refs."""
    tables: dict[str, str] = {}
    all_tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    for row in all_tables:
        table_name = str(row[0])
        if table_name == "interventions":
            continue
        cols = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        col_names = {str(col[1]) for col in cols}
        if "intervention_id" not in col_names:
            continue
        id_col = "id" if "id" in col_names else None
        if id_col is None:
            # Skip tables without a primary row id column for conservative behavior.
            continue
        tables[table_name] = id_col
    return tables


def _intervention_is_referenced_elsewhere(
    conn: sqlite3.Connection,
    intervention_id: int,
    ref_tables: dict[str, str],
) -> bool:
    for table_name in ref_tables:
        row = conn.execute(
            f"SELECT 1 FROM {table_name} WHERE intervention_id = ? LIMIT 1",
            (intervention_id,),
        ).fetchone()
        if row:
            return True
    return False


def _build_groups(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
            i.id AS intervention_id,
            i.demande_id,
            i.campagne_id,
            i.date_intervention,
            i.reference AS intervention_reference,
            COUNT(e.id) AS de_essais_count
        FROM interventions i
        JOIN essais e ON e.intervention_id = i.id
        WHERE e.essai_code = 'DE'
          AND e.source_signature LIKE ?
        GROUP BY i.id, i.demande_id, i.campagne_id, i.date_intervention, i.reference
        """,
        (f"{DE_IMPORT_SIGNATURE_PREFIX}%",),
    ).fetchall()

    grouped: dict[tuple[int, int, str], list[sqlite3.Row]] = defaultdict(list)
    for row in rows:
        key = (
            int(row["demande_id"]),
            int(row["campagne_id"]),
            str(row["date_intervention"] or ""),
        )
        grouped[key].append(row)

    candidates: list[dict[str, Any]] = []
    for (demande_id, campagne_id, date_intervention), intervention_rows in grouped.items():
        if len(intervention_rows) <= 1:
            continue
        sorted_rows = sorted(
            intervention_rows,
            key=lambda r: (-int(r["de_essais_count"] or 0), int(r["intervention_id"])),
        )
        canonical = sorted_rows[0]
        duplicates = sorted_rows[1:]
        candidates.append(
            {
                "demande_id": demande_id,
                "campagne_id": campagne_id,
                "date_intervention": date_intervention,
                "canonical": {
                    "intervention_id": int(canonical["intervention_id"]),
                    "reference": str(canonical["intervention_reference"] or ""),
                    "de_essais_count": int(canonical["de_essais_count"] or 0),
                },
                "duplicates": [
                    {
                        "intervention_id": int(r["intervention_id"]),
                        "reference": str(r["intervention_reference"] or ""),
                        "de_essais_count": int(r["de_essais_count"] or 0),
                    }
                    for r in duplicates
                ],
            }
        )

    return candidates


def main() -> None:
    args = parse_args()
    db_path = Path(args.db)
    if not db_path.exists():
        raise SystemExit(f"DB not found: {db_path}")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = args.backup
    if args.apply and backup_path is None:
        backup_path = db_path.with_name(f"{db_path.stem}.bak_de_import_repair_{timestamp}{db_path.suffix}")

    if args.apply:
        shutil.copy2(db_path, backup_path)

    summary: dict[str, Any] = {
        "mode": "apply" if args.apply else "dry-run",
        "db_path": str(db_path),
        "backup_path": str(backup_path) if backup_path else "",
        "groups": 0,
        "duplicate_interventions": 0,
        "essais_relinked": 0,
        "interventions_deleted": 0,
        "groups_preview": [],
    }

    with connect(db_path) as conn:
        ref_tables = _discover_intervention_ref_tables(conn)
        groups = _build_groups(conn)
        summary["groups"] = len(groups)
        summary["duplicate_interventions"] = sum(len(g["duplicates"]) for g in groups)

        for g in groups:
            canonical_id = int(g["canonical"]["intervention_id"])

            if len(summary["groups_preview"]) < 30:
                summary["groups_preview"].append(g)

            for dup in g["duplicates"]:
                duplicate_id = int(dup["intervention_id"])

                if args.apply:
                    # Move only DE imported essais signatures to canonical intervention.
                    moved = conn.execute(
                        """
                        UPDATE essais
                        SET intervention_id = ?, updated_at = ?
                        WHERE intervention_id = ?
                          AND essai_code = 'DE'
                          AND source_signature LIKE ?
                        """,
                        (
                            canonical_id,
                            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                            duplicate_id,
                            f"{DE_IMPORT_SIGNATURE_PREFIX}%",
                        ),
                    ).rowcount
                    summary["essais_relinked"] += int(moved or 0)

                    # Delete duplicate intervention only if no remaining references in any table.
                    still_referenced = _intervention_is_referenced_elsewhere(conn, duplicate_id, ref_tables)
                    if not still_referenced:
                        deleted = conn.execute(
                            "DELETE FROM interventions WHERE id = ?",
                            (duplicate_id,),
                        ).rowcount
                        summary["interventions_deleted"] += int(deleted or 0)

                if args.verbose:
                    print(
                        json.dumps(
                            {
                                "demande_id": g["demande_id"],
                                "campagne_id": g["campagne_id"],
                                "date_intervention": g["date_intervention"],
                                "canonical_id": canonical_id,
                                "duplicate_id": duplicate_id,
                            },
                            ensure_ascii=False,
                        )
                    )

        if args.apply:
            conn.commit()

    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
