"""Prestations RST cadrées sur une demande (hors passation)."""
from __future__ import annotations

import sqlite3
from datetime import date, datetime

from app.core.database import connect_db, get_db_path


class DemandePrestationsRepository:
    def _connect(self) -> sqlite3.Connection:
        conn = connect_db(get_db_path())
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _now() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def list_for_demande(self, demande_id: int) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, need_code, need_label, description, request_status, quantity, notes
                FROM demande_prestations
                WHERE demande_id = ?
                ORDER BY id
                """,
                (demande_id,),
            ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def replace_for_demande(self, demande_id: int, items: list[dict]) -> list[dict]:
        now = self._now()
        with self._connect() as conn:
            conn.execute("DELETE FROM demande_prestations WHERE demande_id = ?", (demande_id,))
            for item in items or []:
                payload = dict(item or {})
                need_code = str(payload.get("need_code") or "").strip()
                need_label = str(payload.get("need_label") or "").strip()
                description = str(payload.get("description") or "").strip()
                if not need_code and not need_label and not description:
                    continue
                conn.execute(
                    """
                    INSERT INTO demande_prestations (
                        demande_id, need_code, need_label, description, request_status,
                        quantity, notes, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        demande_id,
                        need_code,
                        need_label,
                        description,
                        str(payload.get("request_status") or "À confirmer").strip(),
                        str(payload.get("quantity") or "").strip(),
                        str(payload.get("notes") or "").strip(),
                        now,
                        now,
                    ),
                )
            conn.commit()
        return self.list_for_demande(demande_id)

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> dict:
        return {
            "uid": int(row["id"]),
            "need_code": row["need_code"] or "",
            "need_label": row["need_label"] or "",
            "description": row["description"] or "",
            "request_status": row["request_status"] or "",
            "quantity": row["quantity"] or "",
            "notes": row["notes"] or "",
        }
