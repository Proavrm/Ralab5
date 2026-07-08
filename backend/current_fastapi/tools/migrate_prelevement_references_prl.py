#!/usr/bin/env python3
"""Migrer les références prélèvement legacy `-P0001` vers `-PRL0001`."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import connect_db, get_db_path
from app.services.prelevement_reference_service import (
    apply_prelevement_reference_migration,
    build_prelevement_reference_migration_map,
)


def main() -> None:
    conn = connect_db(get_db_path())
    try:
        mapping = build_prelevement_reference_migration_map(conn)
        if not mapping:
            print("Aucune référence legacy à migrer.")
            return
        print("Migration prévue:")
        for old_ref, new_ref in mapping.items():
            print(f"  {old_ref} -> {new_ref}")
        applied = apply_prelevement_reference_migration(conn, mapping)
        print(f"Terminé — {len(applied)} référence(s) migrée(s).")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
