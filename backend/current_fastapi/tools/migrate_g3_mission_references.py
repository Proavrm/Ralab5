#!/usr/bin/env python3
"""Renomme les références G3 vers {affaire_ref}-D{numero}-G{NNNN}."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import get_db_path
from app.services.g3_reference_service import g3_mission_reference_prefix


def main() -> None:
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    demande_ids = conn.execute(
        "SELECT DISTINCT demande_id FROM g3_missions ORDER BY demande_id"
    ).fetchall()
    updated = 0
    for row in demande_ids:
        demande_id = int(row["demande_id"])
        demande = conn.execute(
            """
            SELECT d.numero, a.reference AS affaire_ref
            FROM demandes d
            JOIN affaires_rst a ON a.id = d.affaire_rst_id
            WHERE d.id = ?
            """,
            (demande_id,),
        ).fetchone()
        if not demande:
            continue
        prefix = g3_mission_reference_prefix(
            affaire_ref=str(demande["affaire_ref"] or ""),
            demande_numero=int(demande["numero"] or 0),
        )
        missions = conn.execute(
            "SELECT id, reference FROM g3_missions WHERE demande_id = ? ORDER BY id",
            (demande_id,),
        ).fetchall()
        for index, mission in enumerate(missions, start=1):
            new_ref = f"{prefix}{index:04d}"
            old_ref = str(mission["reference"])
            if old_ref == new_ref:
                continue
            conn.execute(
                "UPDATE g3_missions SET reference = ? WHERE id = ?",
                (new_ref, int(mission["id"])),
            )
            print(f"  {old_ref} -> {new_ref}")
            updated += 1
    conn.commit()
    conn.close()
    print(f"Terminé — {updated} mission(s) renommée(s).")


if __name__ == "__main__":
    main()
