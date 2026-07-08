"""Repository — annuaire contacts par affaire RST."""
from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Any

from app.core.database import connect_db, get_db_path


def _row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if not row:
        return None
    return dict(row)


class AffaireContactsRepository:
    def __init__(self, db_path=None) -> None:
        self.db_path = db_path or get_db_path()

    def _connect(self) -> sqlite3.Connection:
        return connect_db(self.db_path)

    def list_for_affaire(
        self,
        affaire_rst_id: int,
        *,
        q: str = "",
        organisation: str = "",
        role_label: str = "",
    ) -> list[dict]:
        sql = """
            SELECT *
            FROM affaire_contacts
            WHERE affaire_rst_id = ?
        """
        params: list[Any] = [int(affaire_rst_id)]
        org = str(organisation or "").strip()
        if org:
            sql += " AND lower(organisation) = lower(?)"
            params.append(org)
        role = str(role_label or "").strip()
        if role:
            sql += " AND lower(role_label) = lower(?)"
            params.append(role)
        query = str(q or "").strip().lower()
        if query:
            sql += """
                AND (
                    lower(full_name) LIKE ?
                    OR lower(role_label) LIKE ?
                    OR lower(organisation) LIKE ?
                    OR lower(phone) LIKE ?
                    OR lower(email) LIKE ?
                    OR lower(display_label) LIKE ?
                    OR lower(notes) LIKE ?
                    OR lower(COALESCE(agence_code, '')) LIKE ?
                )
            """
            like = f"%{query}%"
            params.extend([like] * 8)
        sql += """
            ORDER BY
                COALESCE(last_used_at, updated_at, created_at) DESC,
                use_count DESC,
                lower(full_name) COLLATE NOCASE,
                id DESC
        """
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [_row_to_dict(row) for row in rows]

    def list_organisations(self, affaire_rst_id: int) -> list[str]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT DISTINCT trim(organisation) AS organisation
                FROM affaire_contacts
                WHERE affaire_rst_id = ?
                  AND trim(COALESCE(organisation, '')) != ''
                ORDER BY lower(organisation) COLLATE NOCASE
                """,
                (int(affaire_rst_id),),
            ).fetchall()
        return [str(row["organisation"]) for row in rows if row["organisation"]]

    def list_all(
        self,
        *,
        q: str = "",
        organisation: str = "",
        role_label: str = "",
        affaire_rst_id: int | None = None,
    ) -> list[dict]:
        sql = """
            SELECT
                c.*,
                a.id AS affaire_uid,
                a.reference AS affaire_reference,
                a.chantier AS affaire_chantier
            FROM affaire_contacts c
            JOIN affaires_rst a ON a.id = c.affaire_rst_id
            WHERE 1 = 1
        """
        params: list[Any] = []
        if affaire_rst_id is not None:
            sql += " AND c.affaire_rst_id = ?"
            params.append(int(affaire_rst_id))
        org = str(organisation or "").strip()
        if org:
            sql += " AND lower(c.organisation) = lower(?)"
            params.append(org)
        role = str(role_label or "").strip()
        if role:
            sql += " AND lower(c.role_label) = lower(?)"
            params.append(role)
        query = str(q or "").strip().lower()
        if query:
            sql += """
                AND (
                    lower(c.full_name) LIKE ?
                    OR lower(c.role_label) LIKE ?
                    OR lower(c.organisation) LIKE ?
                    OR lower(c.phone) LIKE ?
                    OR lower(c.email) LIKE ?
                    OR lower(c.display_label) LIKE ?
                    OR lower(c.notes) LIKE ?
                    OR lower(COALESCE(c.agence_code, '')) LIKE ?
                    OR lower(a.reference) LIKE ?
                    OR lower(a.chantier) LIKE ?
                )
            """
            like = f"%{query}%"
            params.extend([like] * 10)
        sql += """
            ORDER BY
                COALESCE(c.last_used_at, c.updated_at, c.created_at) DESC,
                c.use_count DESC,
                lower(a.reference) COLLATE NOCASE,
                lower(c.full_name) COLLATE NOCASE,
                c.id DESC
        """
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [_row_to_dict(row) for row in rows]

    def list_all_organisations(self, affaire_rst_id: int | None = None) -> list[str]:
        sql = """
            SELECT DISTINCT trim(organisation) AS organisation
            FROM affaire_contacts
            WHERE trim(COALESCE(organisation, '')) != ''
        """
        params: list[Any] = []
        if affaire_rst_id is not None:
            sql += " AND affaire_rst_id = ?"
            params.append(int(affaire_rst_id))
        sql += " ORDER BY lower(organisation) COLLATE NOCASE"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [str(row["organisation"]) for row in rows if row["organisation"]]

    def get_by_id(
        self,
        contact_id: int,
        affaire_rst_id: int,
        conn: sqlite3.Connection | None = None,
    ) -> dict | None:
        def _run(connection: sqlite3.Connection) -> dict | None:
            row = connection.execute(
                """
                SELECT * FROM affaire_contacts
                WHERE id = ? AND affaire_rst_id = ?
                """,
                (int(contact_id), int(affaire_rst_id)),
            ).fetchone()
            return _row_to_dict(row)

        if conn is not None:
            return _run(conn)
        with self._connect() as connection:
            return _run(connection)

    def upsert(self, record: dict, conn: sqlite3.Connection | None = None, *, increment_usage: bool = True) -> dict:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        affaire_rst_id = int(record["affaire_rst_id"])
        normalized_key = str(record.get("normalized_key") or "").strip()
        contact_id = record.get("id")

        def _run(connection: sqlite3.Connection) -> dict:
            existing = None
            if contact_id:
                existing = connection.execute(
                    "SELECT * FROM affaire_contacts WHERE id = ? AND affaire_rst_id = ?",
                    (int(contact_id), affaire_rst_id),
                ).fetchone()
            if existing is None and normalized_key:
                existing = connection.execute(
                    """
                    SELECT * FROM affaire_contacts
                    WHERE affaire_rst_id = ? AND normalized_key = ?
                    """,
                    (affaire_rst_id, normalized_key),
                ).fetchone()

            if existing:
                if increment_usage:
                    connection.execute(
                        """
                        UPDATE affaire_contacts
                        SET full_name = ?,
                            role_label = ?,
                            organisation = ?,
                            phone = ?,
                            email = ?,
                            notes = ?,
                            display_label = ?,
                            normalized_key = ?,
                            source_type = COALESCE(NULLIF(?, ''), source_type),
                            source_ref = COALESCE(NULLIF(?, ''), source_ref),
                            use_count = use_count + 1,
                            last_used_at = ?,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            record.get("full_name") or "",
                            record.get("role_label") or "",
                            record.get("organisation") or "",
                            record.get("phone") or "",
                            record.get("email") or "",
                            record.get("notes") or "",
                            record.get("display_label") or "",
                            normalized_key,
                            record.get("source_type") or "",
                            record.get("source_ref") or "",
                            now,
                            now,
                            int(existing["id"]),
                        ),
                    )
                else:
                    connection.execute(
                        """
                        UPDATE affaire_contacts
                        SET full_name = CASE WHEN trim(?) != '' THEN ? ELSE full_name END,
                            role_label = CASE WHEN trim(?) != '' THEN ? ELSE role_label END,
                            organisation = CASE WHEN trim(?) != '' THEN ? ELSE organisation END,
                            phone = CASE WHEN trim(?) != '' THEN ? ELSE phone END,
                            email = CASE WHEN trim(?) != '' THEN ? ELSE email END,
                            notes = CASE WHEN trim(?) != '' THEN ? ELSE notes END,
                            display_label = CASE WHEN trim(?) != '' THEN ? ELSE display_label END,
                            normalized_key = CASE WHEN trim(?) != '' THEN ? ELSE normalized_key END,
                            source_type = COALESCE(NULLIF(?, ''), source_type),
                            source_ref = COALESCE(NULLIF(?, ''), source_ref),
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            record.get("full_name") or "", record.get("full_name") or "",
                            record.get("role_label") or "", record.get("role_label") or "",
                            record.get("organisation") or "", record.get("organisation") or "",
                            record.get("phone") or "", record.get("phone") or "",
                            record.get("email") or "", record.get("email") or "",
                            record.get("notes") or "", record.get("notes") or "",
                            record.get("display_label") or "", record.get("display_label") or "",
                            normalized_key, normalized_key,
                            record.get("source_type") or "",
                            record.get("source_ref") or "",
                            now,
                            int(existing["id"]),
                        ),
                    )
                row = connection.execute(
                    "SELECT * FROM affaire_contacts WHERE id = ?",
                    (int(existing["id"]),),
                ).fetchone()
                return dict(row)

            connection.execute(
                """
                INSERT INTO affaire_contacts (
                    affaire_rst_id, full_name, role_label, organisation,
                    phone, email, notes, display_label, normalized_key,
                    source_type, source_ref, agence_code, region_code,
                    use_count, last_used_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
                """,
                (
                    affaire_rst_id,
                    record.get("full_name") or "",
                    record.get("role_label") or "",
                    record.get("organisation") or "",
                    record.get("phone") or "",
                    record.get("email") or "",
                    record.get("notes") or "",
                    record.get("display_label") or "",
                    normalized_key,
                    record.get("source_type") or "manual",
                    record.get("source_ref") or "",
                    record.get("agence_code") or "RA",
                    record.get("region_code") or "ARS",
                    now,
                    now,
                    now,
                ),
            )
            row = connection.execute(
                "SELECT * FROM affaire_contacts WHERE id = last_insert_rowid()"
            ).fetchone()
            return dict(row)

        if conn is not None:
            return _run(conn)
        with self._connect() as connection:
            result = _run(connection)
            connection.commit()
            return result

    def touch(self, contact_id: int, affaire_rst_id: int, conn: sqlite3.Connection | None = None) -> dict | None:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        def _run(connection: sqlite3.Connection) -> dict | None:
            connection.execute(
                """
                UPDATE affaire_contacts
                SET use_count = use_count + 1,
                    last_used_at = ?,
                    updated_at = ?
                WHERE id = ? AND affaire_rst_id = ?
                """,
                (now, now, int(contact_id), int(affaire_rst_id)),
            )
            row = connection.execute(
                "SELECT * FROM affaire_contacts WHERE id = ? AND affaire_rst_id = ?",
                (int(contact_id), int(affaire_rst_id)),
            ).fetchone()
            return _row_to_dict(row)

        if conn is not None:
            return _run(conn)
        with self._connect() as connection:
            result = _run(connection)
            connection.commit()
            return result

    def delete(self, contact_id: int, affaire_rst_id: int) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                """
                DELETE FROM affaire_contacts
                WHERE id = ? AND affaire_rst_id = ?
                """,
                (int(contact_id), int(affaire_rst_id)),
            )
            conn.commit()
            return cur.rowcount > 0

    def register_dismissals(
        self,
        affaire_rst_id: int,
        listing_keys: set[str],
        *,
        full_name: str = "",
        agence_code: str = "",
        dismissed_by: str = "",
        conn: sqlite3.Connection | None = None,
    ) -> None:
        if not listing_keys:
            return

        def _run(connection: sqlite3.Connection) -> None:
            for key in sorted(listing_keys):
                if not key:
                    continue
                connection.execute(
                    """
                    INSERT INTO affaire_contact_dismissals (
                        affaire_rst_id, listing_key, full_name, agence_code, dismissed_by
                    ) VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(affaire_rst_id, listing_key) DO UPDATE SET
                        full_name = excluded.full_name,
                        agence_code = COALESCE(NULLIF(excluded.agence_code, ''), agence_code),
                        dismissed_by = COALESCE(NULLIF(excluded.dismissed_by, ''), dismissed_by),
                        dismissed_at = datetime('now', 'localtime')
                    """,
                    (
                        int(affaire_rst_id),
                        key,
                        full_name,
                        agence_code,
                        dismissed_by,
                    ),
                )

        if conn is not None:
            _run(conn)
            return
        with self._connect() as connection:
            _run(connection)
            connection.commit()

    def list_dismissal_keys(
        self,
        affaire_rst_id: int | None = None,
        conn: sqlite3.Connection | None = None,
    ) -> dict[int, set[str]]:
        params: list[Any] = []
        sql = """
            SELECT affaire_rst_id, listing_key
            FROM affaire_contact_dismissals
            WHERE trim(COALESCE(listing_key, '')) != ''
        """
        if affaire_rst_id is not None:
            sql += " AND affaire_rst_id = ?"
            params.append(int(affaire_rst_id))

        def _run(connection: sqlite3.Connection) -> dict[int, set[str]]:
            index: dict[int, set[str]] = {}
            for row in connection.execute(sql, params).fetchall():
                affaire_id = int(row["affaire_rst_id"])
                bucket = index.setdefault(affaire_id, set())
                bucket.add(str(row["listing_key"]))
            return index

        if conn is not None:
            return _run(conn)
        with self._connect() as connection:
            return _run(connection)
