#!/usr/bin/env python3
"""
Remove "shell" demandes left by import + temporal hierarchy moves: hierarchy rows
(campagnes / interventions) with no terrain data (PMT, SC, DE) still linked.

Only targets demandes with demandeur = 'Import Outils' and no linked operational rows
(see _candidate_sql). Default is dry-run; use --apply after reviewing the list.

Usage (from backend/current_fastapi):
  python tools/cleanup_orphan_import_shell_demandes.py
  python tools/cleanup_orphan_import_shell_demandes.py --apply
"""

from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.tool_db_path import get_tool_db_path

DB_PATH = get_tool_db_path()


def _backup_file(src: Path, dest: Path) -> None:
    shutil.copy2(src, dest)


def _candidate_sql() -> str:
    # Interventions must be deleted before demandes (ON DELETE RESTRICT).
    # All checks ensure no RESTRICT children remain.
    return """
SELECT d.id, d.reference, d.nature, d.demandeur
FROM demandes d
WHERE TRIM(COALESCE(d.demandeur, '')) = 'Import Outils'
  AND NOT EXISTS (SELECT 1 FROM pmt_essais p WHERE p.demande_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM series_essais_terrain s WHERE s.demande_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM feuilles_terrain f WHERE f.demande_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM prelevements pr WHERE pr.demande_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM echantillons ec WHERE ec.demande_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM points_terrain pt WHERE pt.demande_id = d.id)
  AND NOT EXISTS (
    SELECT 1 FROM interventions i
    JOIN essais e ON e.intervention_id = i.id
    WHERE i.demande_id = d.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM interventions i
    JOIN feuilles_terrain f ON f.intervention_id = i.id
    WHERE i.demande_id = d.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM interventions i
    JOIN points_terrain pt ON pt.intervention_id = i.id
    WHERE i.demande_id = d.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM interventions i
    JOIN echantillons ec ON ec.intervention_id = i.id
    WHERE i.demande_id = d.id
  )
"""


def list_candidates(conn: sqlite3.Connection) -> list[tuple]:
    return list(conn.execute(_candidate_sql() + " ORDER BY d.id"))


def delete_shell_demande(conn: sqlite3.Connection, demande_id: int) -> None:
    conn.execute("DELETE FROM interventions WHERE demande_id = ?", (demande_id,))
    conn.execute("DELETE FROM demandes WHERE id = ?", (demande_id,))


def main() -> int:
    parser = argparse.ArgumentParser(description="Remove empty Import Outils shell demandes.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Perform deletes (after optional backup). Without this, only lists candidates.",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="With --apply, skip copying the main DB to *.backup.shellcleanup.*.db",
    )
    args = parser.parse_args()

    if not DB_PATH.is_file():
        print(f"Missing database: {DB_PATH}", file=sys.stderr)
        return 1

    conn = sqlite3.connect(str(DB_PATH))
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        rows = list_candidates(conn)
        if not rows:
            print("No candidate shell demandes.")
            return 0

        print(f"Candidates ({len(rows)}):")
        for rid, ref, nature, dem in rows:
            print(f"  id={rid} ref={ref!r} nature={nature!r} demandeur={dem!r}")

        if not args.apply:
            print("\nDry-run only. Pass --apply to delete these rows.")
            return 0

        if not args.no_backup:
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup = DB_PATH.parent / f"ralab3.backup.shellcleanup.{stamp}.db"
            _backup_file(DB_PATH, backup)
            print(f"Backup written: {backup}")

        for rid, *_ in rows:
            delete_shell_demande(conn, int(rid))
        conn.commit()
        print(f"Deleted {len(rows)} demande(s) and their interventions.")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
