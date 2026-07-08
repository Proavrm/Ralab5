"""Régions orga (ARS) et agences (RA, AUV) — référentiel en base."""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from app.core.database import get_db_path

ORG_DDL = """
CREATE TABLE IF NOT EXISTS org_regions (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    actif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS agences (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    region_code TEXT NOT NULL,
    actif INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (region_code) REFERENCES org_regions(code)
);
"""

DEFAULT_ORG_REGIONS = [
    ("ARS", "Auvergne-Rhône-Saône"),
]

DEFAULT_AGENCES = [
    ("RA", "Rhône-Ain", "ARS"),
    ("AUV", "Auvergne", "ARS"),
]

DEFAULT_LAB_AGENCE = {
    "SP": "RA",
    "PDC": "AUV",
}


@dataclass(slots=True)
class OrgRegionRecord:
    code: str
    label: str
    actif: bool = True


@dataclass(slots=True)
class AgenceRecord:
    code: str
    label: str
    region_code: str
    actif: bool = True


class OrgRepository:
    def __init__(self, db_path=None):
        self.db_path = db_path or get_db_path()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def ensure_schema(self, conn: sqlite3.Connection) -> None:
        conn.executescript(ORG_DDL)

    def seed_defaults(self, conn: sqlite3.Connection) -> None:
        """Seed initial orga — n'écrase pas les libellés déjà configurés en Admin."""
        for code, label in DEFAULT_ORG_REGIONS:
            conn.execute(
                """
                INSERT INTO org_regions (code, label, actif)
                VALUES (?, ?, 1)
                ON CONFLICT(code) DO NOTHING
                """,
                (code, label),
            )
        for code, label, region_code in DEFAULT_AGENCES:
            conn.execute(
                """
                INSERT INTO agences (code, label, region_code, actif)
                VALUES (?, ?, ?, 1)
                ON CONFLICT(code) DO NOTHING
                """,
                (code, label, region_code),
            )
        for lab_code, agence_code in DEFAULT_LAB_AGENCE.items():
            conn.execute(
                """
                UPDATE laboratoires
                SET
                    agence_code = ?,
                    region = CASE WHEN trim(COALESCE(region, '')) = '' THEN 'ARS' ELSE region END
                WHERE upper(code) = ?
                  AND trim(COALESCE(agence_code, '')) = ''
                """,
                (agence_code, lab_code.upper()),
            )

    def list_regions(self, active_only: bool = False) -> list[OrgRegionRecord]:
        clause = " WHERE actif = 1" if active_only else ""
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT code, label, actif FROM org_regions{clause} ORDER BY code"
            ).fetchall()
        return [OrgRegionRecord(code=r["code"], label=r["label"], actif=bool(r["actif"])) for r in rows]

    def list_agences(self, active_only: bool = False, region_code: str | None = None) -> list[AgenceRecord]:
        clauses: list[str] = []
        params: list[str] = []
        if active_only:
            clauses.append("actif = 1")
        if region_code:
            clauses.append("upper(region_code) = ?")
            params.append(str(region_code).strip().upper())
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT code, label, region_code, actif FROM agences{where} ORDER BY code",
                params,
            ).fetchall()
        return [
            AgenceRecord(
                code=r["code"],
                label=r["label"],
                region_code=r["region_code"],
                actif=bool(r["actif"]),
            )
            for r in rows
        ]

    def get_region(self, code: str) -> OrgRegionRecord | None:
        key = str(code or "").strip().upper()
        if not key:
            return None
        with self._connect() as conn:
            row = conn.execute(
                "SELECT code, label, actif FROM org_regions WHERE upper(code) = ?",
                (key,),
            ).fetchone()
        if not row:
            return None
        return OrgRegionRecord(code=row["code"], label=row["label"], actif=bool(row["actif"]))

    def get_agence(self, code: str) -> AgenceRecord | None:
        key = str(code or "").strip().upper()
        if not key:
            return None
        with self._connect() as conn:
            row = conn.execute(
                "SELECT code, label, region_code, actif FROM agences WHERE upper(code) = ?",
                (key,),
            ).fetchone()
        if not row:
            return None
        return AgenceRecord(
            code=row["code"],
            label=row["label"],
            region_code=row["region_code"],
            actif=bool(row["actif"]),
        )

    def upsert_region(self, code: str, label: str, actif: bool = True) -> OrgRegionRecord:
        key = str(code or "").strip().upper()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO org_regions (code, label, actif)
                VALUES (?, ?, ?)
                ON CONFLICT(code) DO UPDATE SET
                    label = excluded.label,
                    actif = excluded.actif
                """,
                (key, str(label or "").strip(), 1 if actif else 0),
            )
            conn.commit()
        record = self.get_region(key)
        if record is None:
            raise LookupError(f"Région {key} introuvable")
        return record

    def upsert_agence(
        self,
        code: str,
        label: str,
        region_code: str,
        actif: bool = True,
    ) -> AgenceRecord:
        key = str(code or "").strip().upper()
        region = str(region_code or "").strip().upper()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO agences (code, label, region_code, actif)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(code) DO UPDATE SET
                    label = excluded.label,
                    region_code = excluded.region_code,
                    actif = excluded.actif
                """,
                (key, str(label or "").strip(), region, 1 if actif else 0),
            )
            conn.commit()
        record = self.get_agence(key)
        if record is None:
            raise LookupError(f"Agence {key} introuvable")
        return record
