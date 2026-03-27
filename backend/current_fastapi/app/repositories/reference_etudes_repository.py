"""
app/repositories/reference_etudes_repository.py — RaLab4
Read-only repository for Études reference source.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any


class ReferenceEtudesRepository:
    def __init__(self, db_path: str | Path | None = None) -> None:
        self.db_path = Path(db_path) if db_path else self._default_db_path()

    def _default_db_path(self) -> Path:
        return Path(__file__).resolve().parents[2] / "data" / "etudes.db"

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def list_rows(self, search: str = "", limit: int = 500) -> list[dict[str, Any]]:
        search_text = (search or "").strip()
        sql = """
            SELECT id, nAffaire AS numero_etude, filiale, nomAffaire,
                   ville, dept, maitreOuvrage, respEtude, statuAffaire
            FROM etudes
            WHERE 1=1
        """
        params: list[Any] = []
        if search_text:
            sql += """
                AND (
                    CAST(id AS TEXT) LIKE ? OR
                    CAST(nAffaire AS TEXT) LIKE ? OR
                    CAST(filiale AS TEXT) LIKE ? OR
                    CAST(nomAffaire AS TEXT) LIKE ? OR
                    CAST(ville AS TEXT) LIKE ? OR
                    CAST(dept AS TEXT) LIKE ? OR
                    CAST(maitreOuvrage AS TEXT) LIKE ? OR
                    CAST(respEtude AS TEXT) LIKE ?
                )
            """
            like = f"%{search_text}%"
            params.extend([like] * 8)
        sql += ' ORDER BY nAffaire DESC, id DESC LIMIT ?'
        params.append(max(1, min(int(limit or 500), 5000)))
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row_to_summary(row) for row in rows]

    def get_row(self, row_id: int) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute('SELECT * FROM etudes WHERE id = ?', (int(row_id),)).fetchone()
        return dict(row) if row else None

    @staticmethod
    def _clean(value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    def _row_to_summary(self, row: sqlite3.Row) -> dict[str, Any]:
        ville = self._clean(row["ville"])
        dept = self._clean(row["dept"])
        site = ville or (f"({dept})" if dept else "")
        if ville and dept and f"({dept})" not in ville:
            site = f"{ville} ({dept})"
        return {
            "row_id": int(row["id"]),
            "numero_etude": self._clean(row["numero_etude"]),
            "filiale": self._clean(row["filiale"]),
            "nom_affaire": self._clean(row["nomAffaire"]),
            "ville": ville,
            "dept": dept,
            "site": site,
            "maitre_ouvrage": self._clean(row["maitreOuvrage"]),
            "responsable": self._clean(row["respEtude"]),
            "statut": self._clean(row["statuAffaire"]),
        }
