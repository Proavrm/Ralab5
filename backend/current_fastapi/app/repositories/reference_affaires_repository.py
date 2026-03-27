"""
app/repositories/reference_affaires_repository.py — RaLab4
Read-only repository for Affaires NGE reference source.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any


class ReferenceAffairesRepository:
    def __init__(self, db_path: str | Path | None = None) -> None:
        self.db_path = Path(db_path) if db_path else self._default_db_path()

    def _default_db_path(self) -> Path:
        return Path(__file__).resolve().parents[2] / "data" / "affaires.db"

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def list_rows(self, search: str = "", limit: int = 500) -> list[dict[str, Any]]:
        search_text = (search or "").strip()
        sql = """
            SELECT id, "n°affaire" AS numero_affaire_nge, code_agence, "libellé" AS libelle,
                   titulaire, responsable, source_sheet
            FROM affaires
            WHERE 1=1
        """
        params: list[Any] = []
        if search_text:
            sql += """
                AND (
                    CAST(id AS TEXT) LIKE ? OR
                    CAST("n°affaire" AS TEXT) LIKE ? OR
                    CAST(code_agence AS TEXT) LIKE ? OR
                    CAST("libellé" AS TEXT) LIKE ? OR
                    CAST(titulaire AS TEXT) LIKE ? OR
                    CAST(responsable AS TEXT) LIKE ?
                )
            """
            like = f"%{search_text}%"
            params.extend([like] * 6)
        sql += ' ORDER BY "n°affaire" ASC, id ASC LIMIT ?'
        params.append(max(1, min(int(limit or 500), 5000)))
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row_to_summary(row) for row in rows]

    def get_row(self, row_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute('SELECT * FROM affaires WHERE id = ?', (str(row_id),)).fetchone()
        return dict(row) if row else None

    @staticmethod
    def _clean(value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    def _row_to_summary(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "row_id": self._clean(row["id"]),
            "numero_affaire_nge": self._clean(row["numero_affaire_nge"]),
            "code_agence": self._clean(row["code_agence"]),
            "libelle": self._clean(row["libelle"]),
            "titulaire": self._clean(row["titulaire"]),
            "responsable": self._clean(row["responsable"]),
            "source_sheet": self._clean(row["source_sheet"]),
        }
