"""Structured documents tracked on a demande RST (section C).

Documents belong to the demande. They may be pre-filled once from a passation
at generation time, parsed from DST/liste documents fournis, or entered manually.
"""
from __future__ import annotations

import re
import sqlite3
from datetime import date, datetime

from app.core.database import connect_db, get_db_path
from app.services.demande_document_storage_service import delete_affaire_document, normalize_stored_path

_DOCUMENTS_FOURNIS_SKIP = {"", "nan", "none", "null", "...", "—", "-"}


def parse_documents_fournis_list(text: str) -> list[str]:
    """Split a DST/free-text document list into distinct document labels."""
    raw = str(text or "").strip()
    if not raw:
        return []

    labels: list[str] = []
    seen: set[str] = set()
    for chunk in re.split(r"[,;\n\r]+", raw):
        label = re.sub(r"\s+", " ", chunk.replace("_x000D_", " ")).strip(" .")
        if not label:
            continue
        key = label.casefold()
        if key in _DOCUMENTS_FOURNIS_SKIP or key in seen:
            continue
        seen.add(key)
        labels.append(label)
    return labels


class DemandeDocumentsRepository:
    def _connect(self) -> sqlite3.Connection:
        conn = connect_db(get_db_path())
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _now() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def _fmt_date(value: object) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        if len(text) >= 10 and text[4:5] == "-":
            return text[:10]
        return text

    def list_for_demande(self, demande_id: int) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, document_type, is_received, version, document_date, comment, stored_path, uploaded_at
                FROM demande_documents
                WHERE demande_id = ?
                ORDER BY id
                """,
                (demande_id,),
            ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def replace_for_demande(self, demande_id: int, items: list[dict]) -> list[dict]:
        now = self._now()
        with self._connect() as conn:
            old_rows = conn.execute(
                "SELECT stored_path FROM demande_documents WHERE demande_id = ?",
                (demande_id,),
            ).fetchall()
            old_paths = {
                normalize_stored_path(row["stored_path"])
                for row in old_rows
                if row["stored_path"]
            }

            conn.execute("DELETE FROM demande_documents WHERE demande_id = ?", (demande_id,))
            for item in items or []:
                payload = dict(item or {})
                document_type = str(payload.get("document_type") or "").strip()
                comment = str(payload.get("comment") or "").strip()
                version = str(payload.get("version") or "").strip()
                stored_path = str(payload.get("stored_path") or "").strip()
                if not document_type and not comment and not version and not stored_path and not payload.get("is_received"):
                    continue
                conn.execute(
                    """
                    INSERT INTO demande_documents (
                        demande_id, document_type, is_received, version, document_date,
                        comment, stored_path, uploaded_at, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        demande_id,
                        document_type,
                        1 if payload.get("is_received") else 0,
                        version,
                        self._fmt_date(payload.get("document_date")),
                        comment,
                        stored_path,
                        self._fmt_date(payload.get("uploaded_at")),
                        now,
                        now,
                    ),
                )
            conn.commit()

        new_paths = {
            normalize_stored_path(str(item.get("stored_path") or ""))
            for item in (items or [])
        }
        new_paths.discard("")
        for path in old_paths - new_paths:
            try:
                delete_affaire_document(path)
            except (FileNotFoundError, ValueError):
                pass

        return self.list_for_demande(demande_id)

    def seed_from_documents_fournis(self, demande_id: int, documents_fournis: str) -> list[dict]:
        labels = parse_documents_fournis_list(documents_fournis)
        if not labels:
            return self.list_for_demande(demande_id)

        with self._connect() as conn:
            existing = conn.execute(
                "SELECT COUNT(*) AS c FROM demande_documents WHERE demande_id = ?",
                (demande_id,),
            ).fetchone()["c"]
            if int(existing or 0) > 0:
                return self.list_for_demande(demande_id)

        items = [
            {
                "document_type": label,
                "is_received": False,
                "version": "",
                "document_date": None,
                "comment": "",
            }
            for label in labels
        ]
        return self.replace_for_demande(demande_id, items)

    def seed_from_passation(self, demande_id: int, passation_id: int) -> list[dict]:
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT COUNT(*) AS c FROM demande_documents WHERE demande_id = ?",
                (demande_id,),
            ).fetchone()["c"]
            if int(existing or 0) > 0:
                return self.list_for_demande(demande_id)

            rows = conn.execute(
                """
                SELECT document_type, is_received, version, document_date, comment, stored_path, uploaded_at
                FROM passation_documents
                WHERE passation_id = ?
                ORDER BY id
                """,
                (passation_id,),
            ).fetchall()
            if not rows:
                return []

            now = self._now()
            for row in rows:
                conn.execute(
                    """
                    INSERT INTO demande_documents (
                        demande_id, document_type, is_received, version, document_date,
                        comment, stored_path, uploaded_at, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        demande_id,
                        row["document_type"] or "",
                        int(row["is_received"] or 0),
                        row["version"] or "",
                        row["document_date"],
                        row["comment"] or "",
                        row["stored_path"] or "",
                        row["uploaded_at"] if "uploaded_at" in row.keys() else None,
                        now,
                        now,
                    ),
                )
            conn.commit()
        return self.list_for_demande(demande_id)

    @staticmethod
    def _fmt_date_field(value: object) -> str | None:
        if value is None:
            return None
        if isinstance(value, date):
            return value.isoformat()
        text = str(value).strip()
        if not text:
            return None
        if len(text) >= 10 and text[4:5] == "-":
            return text[:10]
        return text

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> dict:
        keys = row.keys()
        doc_date = DemandeDocumentsRepository._fmt_date_field(row["document_date"])
        uploaded_at = DemandeDocumentsRepository._fmt_date_field(
            row["uploaded_at"] if "uploaded_at" in keys else None
        )
        return {
            "uid": int(row["id"]),
            "document_type": row["document_type"] or "",
            "is_received": bool(row["is_received"]),
            "version": row["version"] or "",
            "document_date": doc_date,
            "comment": row["comment"] or "",
            "stored_path": normalize_stored_path(row["stored_path"] or ""),
            "uploaded_at": uploaded_at,
        }
