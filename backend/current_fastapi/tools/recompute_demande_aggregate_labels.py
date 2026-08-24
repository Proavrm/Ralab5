#!/usr/bin/env python3
"""
Recompute demandes.nature from linked terrain data (DE / PMT / SC) for import rows.

Only updates demandes whose current nature looks like an automatic import label
so manual demandes (e.g. notes) are left untouched.

Usage (from backend/current_fastapi):
  python tools/recompute_demande_aggregate_labels.py
  python tools/recompute_demande_aggregate_labels.py --apply
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.tool_db_path import get_tool_db_path


def _backup_sqlite(src: Path, dest: Path) -> None:
    src_conn = sqlite3.connect(str(src))
    try:
        dst_conn = sqlite3.connect(str(dest))
        try:
            src_conn.backup(dst_conn)
        finally:
            dst_conn.close()
    finally:
        src_conn.close()


def _should_touch_nature(nature: str) -> bool:
    n = (nature or "").strip()
    if not n:
        return False
    prefixes = (
        "Import PMT",
        "Import DE",
        "Import Sondage",
        "Import automatique",
    )
    return any(n.startswith(p) for p in prefixes)


def _flags_for_demande(
    conn: sqlite3.Connection,
    demande_id: int,
    nature: str,
    observations: str,
) -> tuple[bool, bool, bool]:
    nl = (nature or "").lower()
    obs = (observations or "").lower()

    has_pmt = bool(
        conn.execute("SELECT 1 FROM pmt_essais WHERE demande_id = ? LIMIT 1", (demande_id,)).fetchone()
    )
    has_sc = bool(
        conn.execute(
            """
            SELECT 1 FROM series_essais_terrain
            WHERE demande_id = ? AND (code_essai = 'SC' OR code_essai LIKE 'SC%')
            LIMIT 1
            """,
            (demande_id,),
        ).fetchone()
    ) or bool(
        conn.execute(
            """
            SELECT 1 FROM feuilles_terrain
            WHERE demande_id = ? AND code_feuille = 'SC'
            LIMIT 1
            """,
            (demande_id,),
        ).fetchone()
    ) or ("sondage carott" in nl)
    has_de = bool(
        conn.execute(
            """
            SELECT 1 FROM essais e
            INNER JOIN interventions i ON i.id = e.intervention_id
            WHERE i.demande_id = ?
              AND (
                COALESCE(e.essai_code, '') = 'DE'
                OR COALESCE(e.type_essai, '') LIKE '%ensit%'
                OR COALESCE(e.source_signature, '') LIKE 'DE_IMPORT%'
                OR COALESCE(e.source_label, '') LIKE '%DE Excel%'
              )
            LIMIT 1
            """,
            (demande_id,),
        ).fetchone()
    ) or ("import de" in nl) or ("de_import" in obs)
    return has_de, has_pmt, has_sc


def _build_nature(has_de: bool, has_pmt: bool, has_sc: bool) -> Optional[str]:
    parts: list[str] = []
    if has_de:
        parts.append("DE")
    if has_pmt:
        parts.append("PMT")
    if has_sc:
        parts.append("SC")
    if not parts:
        return None
    if len(parts) == 1:
        return f"Import terrain ({parts[0]})"
    return f"Import terrain ({' + '.join(parts)})"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("db", nargs="?", default=str(get_tool_db_path()))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    db_path = Path(args.db)
    if not db_path.is_file():
        print(f"DB not found: {db_path}")
        return 1
    apply = bool(args.apply)

    if apply:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = db_path.parent / f"ralab3.backup.labels.{stamp}.db"
        print(f"Backup -> {backup_path}")
        _backup_sqlite(db_path, backup_path)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        """
        SELECT id, reference, nature, description, observations
        FROM demandes
        WHERE affaire_rst_id IS NOT NULL
        ORDER BY id
        """
    ).fetchall()

    changes: list[str] = []
    skipped = 0
    for row in rows:
        did = int(row["id"])
        old = (row["nature"] or "").strip()
        if not _should_touch_nature(old):
            skipped += 1
            continue
        has_de, has_pmt, has_sc = _flags_for_demande(
            conn,
            did,
            row["nature"] or "",
            str(row["observations"] or ""),
        )
        new_nature = _build_nature(has_de, has_pmt, has_sc)
        if not new_nature or new_nature == old:
            skipped += 1
            continue
        ref = row["reference"] or ""
        changes.append(f"  id={did} ref={ref!r}: {old!r} -> {new_nature!r}")
        if apply:
            conn.execute(
                """
                UPDATE demandes
                SET nature = ?, updated_at = ?
                WHERE id = ?
                """,
                (new_nature, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), did),
            )
            conn.commit()

    mode = "APPLY" if apply else "DRY-RUN"
    print(f"Mode: {mode}  DB: {db_path}")
    print(f"\nChanges ({len(changes)}):")
    print("\n".join(changes) if changes else "  (none)")
    print(f"\nSkipped (unchanged or not import-nature): {skipped}")
    if not apply and changes:
        print("\n(No writes.) Re-run with --apply to persist.")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
