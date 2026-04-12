"""Purge legacy historical import data before a clean reimport."""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.core.historical_reimport_scope import (  # noqa: E402
    DEFAULT_REIMPORT_KEEP_SUFFIX_RANGES,
    describe_keep_ranges,
    is_kept_ra_affaire_reference,
)
from tools.audit_historical_reimport_perimeter import build_report as build_perimeter_report  # noqa: E402

DEFAULT_TARGET_DB = ROOT_DIR / "data" / "ralab3.db"
HISTORICAL_RESPONSABLE = "Import historique"
HISTORICAL_NATURE_PREFIX = "Import historique"


def _connect(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
        (table_name,),
    ).fetchone()
    return row is not None


def _safe_count(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> int:
    row = conn.execute(sql, params).fetchone()
    return int(row[0]) if row else 0


def _fetch_dicts(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    return [dict(row) for row in conn.execute(sql, params).fetchall()]


def _historical_affaire(row: sqlite3.Row | dict[str, Any]) -> bool:
    responsable = (row["responsable"] or "").strip()
    statut = (row["statut"] or "").strip()
    return responsable == HISTORICAL_RESPONSABLE or statut == "Importée"


def _historical_demande_where() -> str:
    return f"nature LIKE '{HISTORICAL_NATURE_PREFIX}%'"


def _build_cleanup_plan(conn: sqlite3.Connection, limit: int) -> dict[str, Any]:
    affaires_rows = conn.execute(
        "SELECT id, reference, responsable, statut FROM affaires_rst ORDER BY reference COLLATE NOCASE, id"
    ).fetchall()

    outside_manual_affaires: list[dict[str, Any]] = []
    outside_imported_affaires: list[dict[str, Any]] = []
    imported_affaire_ids: list[int] = []
    imported_affaires_deletable: list[dict[str, Any]] = []
    retained_imported_affaires: list[dict[str, Any]] = []
    outside_imported_affaires_with_nonhistorical_children: list[dict[str, Any]] = []

    for row in affaires_rows:
        row_dict = dict(row)
        is_imported = _historical_affaire(row)
        is_kept = is_kept_ra_affaire_reference(row["reference"], DEFAULT_REIMPORT_KEEP_SUFFIX_RANGES)

        if is_imported:
            imported_affaire_ids.append(int(row["id"]))
            nonhistorical_demande_count = _safe_count(
                conn,
                """
                SELECT COUNT(*)
                FROM demandes
                WHERE affaire_rst_id = ?
                                    AND COALESCE(nature, '') NOT LIKE ?
                """,
                (int(row["id"]), f"{HISTORICAL_NATURE_PREFIX}%"),
            )
            passation_count = _safe_count(
                conn,
                "SELECT COUNT(*) FROM passations WHERE affaire_rst_id = ?",
                (int(row["id"]),),
            ) if _table_exists(conn, "passations") else 0
            payload = {
                "affaire_id": int(row["id"]),
                "reference": row["reference"],
                "responsable": row["responsable"],
                "statut": row["statut"],
                "kept_scope": is_kept,
                "nonhistorical_demandes": nonhistorical_demande_count,
                "passations": passation_count,
            }
            if nonhistorical_demande_count == 0 and passation_count == 0:
                imported_affaires_deletable.append(payload)
            else:
                if is_kept:
                    retained_imported_affaires.append(payload)
                else:
                    outside_imported_affaires_with_nonhistorical_children.append(payload)

        if not is_kept:
            target = outside_imported_affaires if is_imported else outside_manual_affaires
            if len(target) < limit:
                target.append(row_dict)

    historical_demande_where = _historical_demande_where()
    counts = {
        "historical_demandes": _safe_count(conn, f"SELECT COUNT(*) FROM demandes WHERE {historical_demande_where}"),
        "historical_interventions": _safe_count(
            conn,
            f"SELECT COUNT(*) FROM interventions WHERE demande_id IN (SELECT id FROM demandes WHERE {historical_demande_where})",
        ),
        "historical_echantillons": _safe_count(
            conn,
            f"SELECT COUNT(*) FROM echantillons WHERE demande_id IN (SELECT id FROM demandes WHERE {historical_demande_where})",
        ),
        "historical_essais": _safe_count(
            conn,
            f"""
            SELECT COUNT(*)
            FROM essais es
            INNER JOIN echantillons e ON e.id = es.echantillon_id
            WHERE e.demande_id IN (SELECT id FROM demandes WHERE {historical_demande_where})
            """,
        ),
        "historical_prelevements": _safe_count(
            conn,
            f"SELECT COUNT(*) FROM prelevements WHERE demande_id IN (SELECT id FROM demandes WHERE {historical_demande_where})",
        ) if _table_exists(conn, "prelevements") else 0,
        "historical_interventions_reelles": _safe_count(
            conn,
            f"SELECT COUNT(*) FROM interventions_reelles WHERE demande_id IN (SELECT id FROM demandes WHERE {historical_demande_where})",
        ) if _table_exists(conn, "interventions_reelles") else 0,
        "historical_import_batches": _safe_count(conn, "SELECT COUNT(*) FROM historical_import_batches") if _table_exists(conn, "historical_import_batches") else 0,
        "historical_import_files": _safe_count(conn, "SELECT COUNT(*) FROM historical_import_files") if _table_exists(conn, "historical_import_files") else 0,
        "imported_affaires_total": len(imported_affaire_ids),
        "imported_affaires_to_delete": len(imported_affaires_deletable),
        "retained_imported_affaires": len(retained_imported_affaires),
    }

    lingering_links = {
        "interventions_nonhistorical_linked_prelevement": _fetch_dicts(
            conn,
            f"""
            SELECT i.id, i.reference, i.demande_id, i.prelevement_id
            FROM interventions i
            WHERE i.demande_id NOT IN (SELECT id FROM demandes WHERE {historical_demande_where})
              AND i.prelevement_id IN (
                  SELECT p.id
                  FROM prelevements p
                  WHERE p.demande_id IN (SELECT id FROM demandes WHERE {historical_demande_where})
              )
            LIMIT ?
            """,
            (limit,),
        ) if _table_exists(conn, "prelevements") else [],
        "echantillons_nonhistorical_linked_prelevement": _fetch_dicts(
            conn,
            f"""
            SELECT e.id, e.reference, e.demande_id, e.prelevement_id
            FROM echantillons e
            WHERE e.demande_id NOT IN (SELECT id FROM demandes WHERE {historical_demande_where})
              AND e.prelevement_id IN (
                  SELECT p.id
                  FROM prelevements p
                  WHERE p.demande_id IN (SELECT id FROM demandes WHERE {historical_demande_where})
              )
            LIMIT ?
            """,
            (limit,),
        ) if _table_exists(conn, "prelevements") else [],
        "interventions_nonhistorical_linked_intervention_reelle": _fetch_dicts(
            conn,
            f"""
            SELECT i.id, i.reference, i.demande_id, i.intervention_reelle_id
            FROM interventions i
            WHERE i.demande_id NOT IN (SELECT id FROM demandes WHERE {historical_demande_where})
              AND i.intervention_reelle_id IN (
                  SELECT ir.id
                  FROM interventions_reelles ir
                  WHERE ir.demande_id IN (SELECT id FROM demandes WHERE {historical_demande_where})
              )
            LIMIT ?
            """,
            (limit,),
        ) if _table_exists(conn, "interventions_reelles") else [],
        "echantillons_nonhistorical_linked_intervention_reelle": _fetch_dicts(
            conn,
            f"""
            SELECT e.id, e.reference, e.demande_id, e.intervention_reelle_id
            FROM echantillons e
            WHERE e.demande_id NOT IN (SELECT id FROM demandes WHERE {historical_demande_where})
              AND e.intervention_reelle_id IN (
                  SELECT ir.id
                  FROM interventions_reelles ir
                  WHERE ir.demande_id IN (SELECT id FROM demandes WHERE {historical_demande_where})
              )
            LIMIT ?
            """,
            (limit,),
        ) if _table_exists(conn, "interventions_reelles") else [],
    }

    blockers = {
        "outside_manual_affaires": outside_manual_affaires,
        "outside_imported_affaires_with_nonhistorical_children": outside_imported_affaires_with_nonhistorical_children[:limit],
        **lingering_links,
    }
    can_apply = all(not value for value in blockers.values())

    return {
        "keep_policy": describe_keep_ranges(DEFAULT_REIMPORT_KEEP_SUFFIX_RANGES),
        "counts": counts,
        "samples": {
            "outside_imported_affaires": outside_imported_affaires,
            "imported_affaires_to_delete": imported_affaires_deletable[:limit],
            "retained_imported_affaires": retained_imported_affaires[:limit],
        },
        "blockers": blockers,
        "can_apply": can_apply,
    }


def _delete_historical_rows(conn: sqlite3.Connection) -> dict[str, int]:
    deleted: dict[str, int] = {}
    historical_demande_where = _historical_demande_where()

    delete_statements = [
        (
            "essais",
            f"""
            DELETE FROM essais
            WHERE echantillon_id IN (
                SELECT id
                FROM echantillons
                WHERE demande_id IN (SELECT id FROM demandes WHERE {historical_demande_where})
            )
            """,
        ),
        (
            "interventions",
            f"DELETE FROM interventions WHERE demande_id IN (SELECT id FROM demandes WHERE {historical_demande_where})",
        ),
        (
            "echantillons",
            f"DELETE FROM echantillons WHERE demande_id IN (SELECT id FROM demandes WHERE {historical_demande_where})",
        ),
        (
            "prelevements",
            f"DELETE FROM prelevements WHERE demande_id IN (SELECT id FROM demandes WHERE {historical_demande_where})",
        ),
        (
            "interventions_reelles",
            f"DELETE FROM interventions_reelles WHERE demande_id IN (SELECT id FROM demandes WHERE {historical_demande_where})",
        ),
        (
            "demandes",
            f"DELETE FROM demandes WHERE {historical_demande_where}",
        ),
    ]

    for table_name, sql in delete_statements:
        if not _table_exists(conn, table_name):
            deleted[table_name] = 0
            continue
        cursor = conn.execute(sql)
        deleted[table_name] = int(cursor.rowcount if cursor.rowcount != -1 else 0)

    if _table_exists(conn, "historical_import_batches"):
        cursor = conn.execute("DELETE FROM historical_import_batches")
        deleted["historical_import_batches"] = int(cursor.rowcount if cursor.rowcount != -1 else 0)
    else:
        deleted["historical_import_batches"] = 0

    if _table_exists(conn, "historical_import_files"):
        deleted["historical_import_files_remaining_after_batch_delete"] = _safe_count(conn, "SELECT COUNT(*) FROM historical_import_files")

    cursor = conn.execute(
        """
        DELETE FROM affaires_rst
        WHERE id IN (
            SELECT a.id
            FROM affaires_rst a
            WHERE (COALESCE(a.responsable, '') = ? OR COALESCE(a.statut, '') = 'Importée')
              AND NOT EXISTS (
                  SELECT 1
                  FROM demandes d
                  WHERE d.affaire_rst_id = a.id
                                                AND COALESCE(d.nature, '') NOT LIKE ?
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM passations p
                  WHERE p.affaire_rst_id = a.id
              )
        )
        """,
        (HISTORICAL_RESPONSABLE, f"{HISTORICAL_NATURE_PREFIX}%"),
    ) if _table_exists(conn, "passations") else conn.execute(
        """
        DELETE FROM affaires_rst
        WHERE id IN (
            SELECT a.id
            FROM affaires_rst a
            WHERE (COALESCE(a.responsable, '') = ? OR COALESCE(a.statut, '') = 'Importée')
              AND NOT EXISTS (
                  SELECT 1
                  FROM demandes d
                  WHERE d.affaire_rst_id = a.id
                AND COALESCE(d.nature, '') NOT LIKE ?
              )
        )
        """,
        (HISTORICAL_RESPONSABLE, f"{HISTORICAL_NATURE_PREFIX}%"),
    )
    deleted["affaires_rst"] = int(cursor.rowcount if cursor.rowcount != -1 else 0)
    return deleted


def build_purge_report(db_path: Path, limit: int = 20) -> dict[str, Any]:
    with _connect(db_path) as conn:
        plan = _build_cleanup_plan(conn, limit=limit)
    return {
        "target_db_path": str(db_path),
        "mode": "dry-run",
        **plan,
        "perimeter_audit": build_perimeter_report(db_path, limit=limit),
    }


def apply_purge(db_path: Path, limit: int = 20) -> dict[str, Any]:
    with _connect(db_path) as conn:
        plan = _build_cleanup_plan(conn, limit=limit)
        if not plan["can_apply"]:
            return {
                "target_db_path": str(db_path),
                "mode": "apply-blocked",
                **plan,
            }

        try:
            conn.execute("BEGIN")
            deleted = _delete_historical_rows(conn)
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    return {
        "target_db_path": str(db_path),
        "mode": "applied",
        "deleted": deleted,
        "post_purge_audit": build_perimeter_report(db_path, limit=limit),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Purge historical import data before a clean reimport.")
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
        help="Apply the purge instead of returning a dry-run report",
    )
    args = parser.parse_args()

    db_path = Path(args.target_db)
    result = apply_purge(db_path, limit=args.limit) if args.apply else build_purge_report(db_path, limit=args.limit)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()