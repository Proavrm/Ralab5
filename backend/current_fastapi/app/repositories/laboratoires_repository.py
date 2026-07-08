"""Référentiel laboratoires RST — adresse, coords, en-tête rapports."""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from app.core.database import get_db_path


@dataclass(slots=True)
class LaboratoireRecord:
    id: int
    code: str
    nom: str
    region: str
    actif: bool
    address: str = ""
    report_header: str = ""
    lat: Optional[float] = None
    lon: Optional[float] = None
    coords_updated_at: str = ""
    responsable_email: str = ""
    notes: str = ""
    agence_code: str = ""


class LaboratoiresRepository:
    def __init__(self, db_path=None):
        self.db_path = db_path or get_db_path()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def list_all(self) -> list[LaboratoireRecord]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, code, nom, region, actif, address, report_header, lat, lon, coords_updated_at,
                       responsable_email, notes, COALESCE(agence_code, '') AS agence_code
                FROM laboratoires
                ORDER BY code
                """
            ).fetchall()
        return [self._row(row) for row in rows]

    def get_by_code(self, code: str) -> LaboratoireRecord | None:
        text = str(code or "").strip().upper()
        if not text:
            return None
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, code, nom, region, actif, address, report_header, lat, lon, coords_updated_at,
                       responsable_email, notes, COALESCE(agence_code, '') AS agence_code
                FROM laboratoires
                WHERE upper(code) = ?
                """,
                (text,),
            ).fetchone()
        return self._row(row) if row else None

    def update_geo(self, code: str, fields: dict) -> LaboratoireRecord:
        allowed = {"nom", "region", "agence_code", "address", "report_header", "lat", "lon", "actif", "responsable_email", "notes"}
        payload = {k: v for k, v in fields.items() if k in allowed}
        if not payload:
            raise ValueError("Aucun champ à mettre à jour")

        if "lat" in payload or "lon" in payload:
            payload["coords_updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        assignments = []
        values = []
        for key, value in payload.items():
            if key in {"lat", "lon"} and value is None:
                assignments.append(f"{key} = NULL")
            else:
                assignments.append(f"{key} = ?")
                values.append(value)

        values.append(str(code).strip().upper())
        clause = ", ".join(assignments)
        with self._connect() as conn:
            cur = conn.execute(
                f"UPDATE laboratoires SET {clause} WHERE upper(code) = ?",
                values,
            )
            if cur.rowcount == 0:
                raise LookupError(f"Laboratoire {code} introuvable")
            conn.commit()

        record = self.get_by_code(code)
        if record is None:
            raise LookupError(f"Laboratoire {code} introuvable")
        return record

    @staticmethod
    def _row(row: sqlite3.Row) -> LaboratoireRecord:
        keys = row.keys()
        lat = row["lat"] if "lat" in keys and row["lat"] is not None else None
        lon = row["lon"] if "lon" in keys and row["lon"] is not None else None
        return LaboratoireRecord(
            id=int(row["id"]),
            code=row["code"],
            nom=row["nom"] or "",
            region=row["region"] or "",
            actif=bool(row["actif"]),
            address=(row["address"] or "") if "address" in keys else "",
            report_header=(row["report_header"] or "") if "report_header" in keys else "",
            lat=float(lat) if lat is not None else None,
            lon=float(lon) if lon is not None else None,
            coords_updated_at=(row["coords_updated_at"] or "") if "coords_updated_at" in keys else "",
            responsable_email=(row["responsable_email"] or "") if "responsable_email" in keys else "",
            notes=(row["notes"] or "") if "notes" in keys else "",
            agence_code=(row["agence_code"] or "") if "agence_code" in keys else "",
        )
