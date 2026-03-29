# File: reference_affaires_repository.py
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[4]
DATA_DIR = PROJECT_ROOT / "backend" / "current_fastapi" / "data"
DB_PATH = DATA_DIR / "affaires.db"

FULL_AFFAIRE_CODE_SQL = """
COALESCE(
    NULLIF(TRIM(REPLACE(gsa, '*', '')), ''),
    NULLIF(TRIM(REPLACE(ehtp, '*', '')), ''),
    NULLIF(TRIM(REPLACE(nge_routes, '*', '')), ''),
    NULLIF(TRIM(REPLACE(nge_gc, '*', '')), ''),
    NULLIF(TRIM(REPLACE(lyaudet, '*', '')), ''),
    NULLIF(TRIM(REPLACE("nge_e.s.", '*', '')), ''),
    NULLIF(TRIM(REPLACE(nge_transitions, '*', '')), ''),
    CASE
        WHEN TRIM(COALESCE("n°affaire", '')) = '' THEN ''
        ELSE UPPER('RA' || TRIM("n°affaire") || TRIM(COALESCE(code_agence, '')))
    END
)
""".strip()


class ReferenceAffairesRepository:
    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    def all(self, search: str | None = None, limit: int = 2000) -> list[dict[str, Any]]:
        query = f"""
            WITH rows AS (
                SELECT
                    id,
                    "n°affaire" AS numero_affaire,
                    "n°affaire" AS numero_affaire_raw,
                    {FULL_AFFAIRE_CODE_SQL} AS numero_affaire_complet,
                    code_agence,
                    "libellé" AS libelle,
                    titulaire,
                    responsable,
                    "marche_n°" AS marche_numero,
                    compte_bancaire,
                    observations,
                    source_sheet,
                    gsa,
                    ehtp,
                    nge_routes,
                    nge_gc,
                    lyaudet,
                    "nge_e.s." AS nge_es,
                    nge_transitions
                FROM affaires
            )
            SELECT *
            FROM rows
        """
        params: list[Any] = []
        if search:
            like = f"%{search.strip()}%"
            query += """
                WHERE (
                    numero_affaire_raw LIKE ? OR
                    numero_affaire_complet LIKE ? OR
                    code_agence LIKE ? OR
                    libelle LIKE ? OR
                    titulaire LIKE ? OR
                    responsable LIKE ? OR
                    observations LIKE ? OR
                    source_sheet LIKE ?
                )
            """
            params.extend([like] * 8)
        query += ' ORDER BY numero_affaire_complet ASC, numero_affaire_raw ASC LIMIT ?'
        params.append(limit)
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def get_by_id(self, row_id: str) -> dict[str, Any] | None:
        query = f"""
            WITH rows AS (
                SELECT
                    id,
                    "n°affaire" AS numero_affaire,
                    "n°affaire" AS numero_affaire_raw,
                    {FULL_AFFAIRE_CODE_SQL} AS numero_affaire_complet,
                    code_agence,
                    "libellé" AS libelle,
                    titulaire,
                    responsable,
                    "marche_n°" AS marche_numero,
                    compte_bancaire,
                    observations,
                    source_sheet,
                    gsa,
                    ehtp,
                    nge_routes,
                    nge_gc,
                    lyaudet,
                    "nge_e.s." AS nge_es,
                    nge_transitions
                FROM affaires
            )
            SELECT *
            FROM rows
            WHERE id = ?
        """
        with self._connect() as conn:
            row = conn.execute(query, (row_id,)).fetchone()
        return dict(row) if row else None
