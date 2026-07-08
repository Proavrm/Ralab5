"""Corrige labels/domaines métier du competency_catalog (PREP/PREL/GR)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.repositories.competency_repository import CompetencyRepository

CORRECTIONS: tuple[tuple[int, str | None, str], ...] = (
    (78, None, "Préparation des prises d'essai – W%, TL et granularité"),
    (49, None, "Prélèvement / échantillonnage des granulats"),
    (37, None, "Préparation / réduction d'un échantillon de laboratoire"),
    (16, None, "Préparation des échantillons de liants bitumineux"),
    (19, "Liants bitumineux", "Prélèvement / échantillonnage des liants bitumineux"),
)


def main() -> None:
    repository = CompetencyRepository()
    updated = 0
    with repository._connect() as connection:
        for competency_id, domain, label in CORRECTIONS:
            if domain:
                cursor = connection.execute(
                    """
                    UPDATE competency_catalog
                    SET domain = ?, label = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE competency_id = ?
                    """,
                    (domain, label, competency_id),
                )
            else:
                cursor = connection.execute(
                    """
                    UPDATE competency_catalog
                    SET label = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE competency_id = ?
                    """,
                    (label, competency_id),
                )
            updated += cursor.rowcount
        connection.commit()
    print(f"[OK] {updated} competency_catalog row(s) updated")


if __name__ == "__main__":
    main()
