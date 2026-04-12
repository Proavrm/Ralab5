"""Audit the purge perimeter for historical reimport cleanup."""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.core.historical_reimport_scope import (
    CANONICAL_AFFAIRE_SUFFIX_WIDTH,
    DEFAULT_REIMPORT_KEEP_SUFFIX_RANGES,
    describe_keep_ranges,
    parse_ra_affaire_reference,
)

DEFAULT_TARGET_DB = ROOT_DIR / "data" / "ralab3.db"
HISTORICAL_RESPONSABLE = "Import historique"


def _connect(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    return connection


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
        (table_name,),
    ).fetchone()
    return row is not None


def _safe_table_count(conn: sqlite3.Connection, table_name: str) -> int:
    if not _table_exists(conn, table_name):
        return 0
    return int(conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0])


def _historical_demande(row: sqlite3.Row | dict[str, Any]) -> bool:
    nature = (row["nature"] or "").strip()
    return nature.startswith(HISTORICAL_RESPONSABLE)


def _historical_affaire(row: sqlite3.Row | dict[str, Any]) -> bool:
    responsable = (row["responsable"] or "").strip()
    statut = (row["statut"] or "").strip()
    return responsable == HISTORICAL_RESPONSABLE or statut == "Importée"


def _count_rows_by_demande_ids(conn: sqlite3.Connection, table_name: str, demande_ids: Iterable[int]) -> int:
    demande_ids = list(demande_ids)
    if not demande_ids or not _table_exists(conn, table_name):
        return 0
    placeholders = ", ".join("?" for _ in demande_ids)
    sql = f"SELECT COUNT(*) FROM {table_name} WHERE demande_id IN ({placeholders})"
    return int(conn.execute(sql, tuple(demande_ids)).fetchone()[0])


def _count_essais_by_demande_ids(conn: sqlite3.Connection, demande_ids: Iterable[int]) -> int:
    demande_ids = list(demande_ids)
    if not demande_ids or not _table_exists(conn, "essais") or not _table_exists(conn, "echantillons"):
        return 0
    placeholders = ", ".join("?" for _ in demande_ids)
    sql = f"""
        SELECT COUNT(*)
        FROM essais es
        INNER JOIN echantillons e ON e.id = es.echantillon_id
        WHERE e.demande_id IN ({placeholders})
    """
    return int(conn.execute(sql, tuple(demande_ids)).fetchone()[0])


def build_report(db_path: Path, limit: int = 20) -> dict[str, Any]:
    with _connect(db_path) as conn:
        affaires_rows = conn.execute(
            """
            SELECT id, reference, responsable, statut
            FROM affaires_rst
            ORDER BY reference COLLATE NOCASE, id
            """
        ).fetchall()
        demandes_rows = conn.execute(
            """
            SELECT d.id, d.reference, d.affaire_rst_id, d.nature, a.reference AS affaire_reference
            FROM demandes d
            LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
            ORDER BY d.reference COLLATE NOCASE, d.id
            """
        ).fetchall()

        kept_affaire_ids: set[int] = set()
        outside_affaire_ids: set[int] = set()
        imported_kept_affaire_ids: set[int] = set()
        imported_outside_affaire_ids: set[int] = set()
        non_canonical_refs: list[dict[str, Any]] = []
        max_suffix_by_year: dict[str, int] = {}
        canonical_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)

        for row in affaires_rows:
            parsed = parse_ra_affaire_reference(row["reference"])
            if parsed is not None:
                canonical_groups[parsed.canonical].append(
                    {
                        "affaire_id": row["id"],
                        "reference": row["reference"],
                        "canonical_reference": parsed.canonical,
                        "suffix": parsed.suffix,
                        "raw_suffix_width": parsed.raw_suffix_width,
                        "responsable": row["responsable"],
                    }
                )
                year_key = str(parsed.year)
                max_suffix_by_year[year_key] = max(max_suffix_by_year.get(year_key, 0), parsed.suffix)
                bounds = DEFAULT_REIMPORT_KEEP_SUFFIX_RANGES.get(parsed.year)
                is_kept = bool(bounds and bounds[0] <= parsed.suffix <= bounds[1])
                if not parsed.is_canonical:
                    non_canonical_refs.append(
                        {
                            "affaire_id": row["id"],
                            "reference": row["reference"],
                            "canonical_reference": parsed.canonical,
                            "suffix": parsed.suffix,
                            "raw_suffix_width": parsed.raw_suffix_width,
                            "responsable": row["responsable"],
                            "kept_after_normalization": is_kept,
                        }
                    )
            else:
                is_kept = False

            target_ids = kept_affaire_ids if is_kept else outside_affaire_ids
            target_ids.add(int(row["id"]))

            if _historical_affaire(row):
                if is_kept:
                    imported_kept_affaire_ids.add(int(row["id"]))
                else:
                    imported_outside_affaire_ids.add(int(row["id"]))

        canonical_collisions = {
            canonical: entries
            for canonical, entries in canonical_groups.items()
            if len({entry["reference"] for entry in entries}) > 1
        }

        historical_demande_ids: list[int] = []
        historical_demandes_kept = 0
        historical_demandes_outside = 0
        manual_outside_with_demandes: dict[int, dict[str, Any]] = {}

        for row in demandes_rows:
            affaire_id = int(row["affaire_rst_id"]) if row["affaire_rst_id"] is not None else None
            if _historical_demande(row):
                historical_demande_ids.append(int(row["id"]))
                if affaire_id in kept_affaire_ids:
                    historical_demandes_kept += 1
                else:
                    historical_demandes_outside += 1
                continue
            if affaire_id in outside_affaire_ids and affaire_id is not None:
                current = manual_outside_with_demandes.setdefault(
                    affaire_id,
                    {
                        "affaire_id": affaire_id,
                        "affaire_reference": row["affaire_reference"] or "",
                        "demandes_count": 0,
                        "demande_references": [],
                    },
                )
                current["demandes_count"] += 1
                if len(current["demande_references"]) < limit:
                    current["demande_references"].append(row["reference"])

        descendants = {
            "interventions": _count_rows_by_demande_ids(conn, "interventions", historical_demande_ids),
            "echantillons": _count_rows_by_demande_ids(conn, "echantillons", historical_demande_ids),
            "essais": _count_essais_by_demande_ids(conn, historical_demande_ids),
            "prelevements": _count_rows_by_demande_ids(conn, "prelevements", historical_demande_ids),
            "interventions_reelles": _count_rows_by_demande_ids(conn, "interventions_reelles", historical_demande_ids),
            "historical_import_batches": _safe_table_count(conn, "historical_import_batches"),
            "historical_import_files": _safe_table_count(conn, "historical_import_files"),
        }

    imported_affaires_total = len(imported_kept_affaire_ids) + len(imported_outside_affaire_ids)
    report = {
        "target_db_path": str(db_path),
        "keep_policy": {
            "canonical_suffix_width": CANONICAL_AFFAIRE_SUFFIX_WIDTH,
            "year_ranges": describe_keep_ranges(DEFAULT_REIMPORT_KEEP_SUFFIX_RANGES),
        },
        "reference_normalization": {
            "non_canonical_count": len(non_canonical_refs),
            "non_canonical_examples": non_canonical_refs[:limit],
            "canonical_collision_count": len(canonical_collisions),
            "canonical_collisions": dict(list(canonical_collisions.items())[:limit]),
            "max_suffix_by_year": max_suffix_by_year,
        },
        "affaires": {
            "total": len(affaires_rows),
            "kept": len(kept_affaire_ids),
            "outside": len(outside_affaire_ids),
            "imported_total": imported_affaires_total,
            "imported_kept": len(imported_kept_affaire_ids),
            "imported_outside": len(imported_outside_affaire_ids),
        },
        "historical_demandes": {
            "total": len(historical_demande_ids),
            "kept_affaires": historical_demandes_kept,
            "outside_affaires": historical_demandes_outside,
        },
        "historical_descendants": descendants,
        "manual_outside_with_demandes": list(manual_outside_with_demandes.values())[:limit],
    }
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit the historical reimport purge perimeter.")
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
        help="Maximum number of sample rows to include in the report",
    )
    args = parser.parse_args()

    report = build_report(Path(args.target_db), limit=args.limit)
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()