# affaire_regularisation_simple_service.py
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any


class AffaireManualCorrectionSimpleService:
    def __init__(self, db_path: str | Path) -> None:
        self.db_path = Path(db_path)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def ensure_site_column(self) -> None:
        with self._connect() as connection:
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(affaires_rst)").fetchall()
            }
            if "site" not in columns:
                connection.execute("ALTER TABLE affaires_rst ADD COLUMN site TEXT")
                connection.commit()

    def list_affaires(self, query: str = "", only_problematic: bool = True) -> dict[str, Any]:
        self.ensure_site_column()
        query = (query or "").strip().lower()

        sql = """
            SELECT
                id,
                reference,
                COALESCE(affaire_nge, '') AS affaire_nge,
                COALESCE(chantier, '') AS chantier,
                COALESCE(site, '') AS site,
                COALESCE(client, '') AS client,
                COALESCE(statut, '') AS statut,
                COALESCE(source_legacy_id, 0) AS source_legacy_id,
                COALESCE(created_at, '') AS created_at,
                COALESCE(updated_at, '') AS updated_at
            FROM affaires_rst
            ORDER BY reference COLLATE NOCASE, id
        """

        with self._connect() as connection:
            rows = [dict(row) for row in connection.execute(sql).fetchall()]

        def normalize(value: str) -> str:
            return " ".join((value or "").strip().lower().split())

        def is_problematic(row: dict[str, Any]) -> bool:
            affaire_nge = normalize(row["affaire_nge"])
            chantier = normalize(row["chantier"])
            site = normalize(row["site"])

            if not affaire_nge or affaire_nge in {"à qualifier", "non communiqué", "nan"}:
                return True
            if not chantier or chantier in {"à qualifier", "non communiqué", "nan"}:
                return True
            if not site:
                return True

            lower_site = site.lower()
            lower_chantier = chantier.lower()
            lower_affaire = affaire_nge.lower()

            if "colonne " in lower_site:
                return True
            if lower_affaire and len(lower_affaire) > 6 and " " in lower_affaire:
                return True
            if lower_site and lower_site in lower_chantier:
                return True

            return False

        filtered: list[dict[str, Any]] = []
        for row in rows:
            row["is_problematic"] = is_problematic(row)
            haystack = " ".join(
                [
                    row["reference"],
                    row["affaire_nge"],
                    row["chantier"],
                    row["site"],
                    row["client"],
                    row["statut"],
                ]
            ).lower()
            if query and query not in haystack:
                continue
            if only_problematic and not row["is_problematic"]:
                continue
            filtered.append(row)

        summary = {
            "total_affaires": len(rows),
            "filtered_affaires": len(filtered),
            "problematic_affaires": sum(1 for row in rows if row["is_problematic"]),
        }

        return {"summary": summary, "items": filtered}

    def update_affaire(
        self,
        affaire_id: int,
        affaire_nge: str,
        chantier: str,
        site: str,
    ) -> dict[str, Any]:
        self.ensure_site_column()

        affaire_nge = (affaire_nge or "").strip()
        chantier = (chantier or "").strip()
        site = (site or "").strip()

        with self._connect() as connection:
            existing = connection.execute(
                """
                SELECT id, reference
                FROM affaires_rst
                WHERE id = ?
                """,
                (affaire_id,),
            ).fetchone()

            if existing is None:
                raise ValueError(f"Affaire introuvable: {affaire_id}")

            connection.execute(
                """
                UPDATE affaires_rst
                SET
                    affaire_nge = ?,
                    chantier = ?,
                    site = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (affaire_nge, chantier, site, affaire_id),
            )
            connection.commit()

            row = connection.execute(
                """
                SELECT
                    id,
                    reference,
                    COALESCE(affaire_nge, '') AS affaire_nge,
                    COALESCE(chantier, '') AS chantier,
                    COALESCE(site, '') AS site,
                    COALESCE(client, '') AS client,
                    COALESCE(statut, '') AS statut,
                    COALESCE(source_legacy_id, 0) AS source_legacy_id,
                    COALESCE(created_at, '') AS created_at,
                    COALESCE(updated_at, '') AS updated_at
                FROM affaires_rst
                WHERE id = ?
                """,
                (affaire_id,),
            ).fetchone()

        if row is None:
            raise ValueError(f"Affaire introuvable après mise à jour: {affaire_id}")

        updated = dict(row)
        updated["is_problematic"] = False
        return updated
