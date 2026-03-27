"""
app/repositories/dst_repository.py
Repository SQLite para DST — reutilizado directamente do RALab2.
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class DstRecord:
    row_id: int
    data: dict[str, Any]

    def first_value(self, *column_names: str) -> Any:
        for column_name in column_names:
            if column_name in self.data:
                value = self.data.get(column_name)
                if value is not None and str(value).strip():
                    return value
        return None

    def first_text(self, *column_names: str) -> str:
        value = self.first_value(*column_names)
        if value is None:
            return ""
        return str(value).strip()


class DstRepository:
    def __init__(self, db_path: str | Path | None = None, table_name: str = "dst") -> None:
        self.db_path = Path(db_path) if db_path else self._default_db_path()
        self.table_name = table_name

    def _default_db_path(self) -> Path:
        return Path(__file__).resolve().parents[2] / "data" / "dst.db"

    @property
    def is_available(self) -> bool:
        return self.db_path.exists() and self.db_path.is_file()

    def fetch_all(self, limit: int | None = 5000) -> list[DstRecord]:
        return self.search(search_text="", column_name=None, limit=limit)

    def search(
        self,
        search_text: str = "",
        column_name: str | None = None,
        limit: int | None = 5000,
    ) -> list[DstRecord]:
        if not self.is_available:
            return []

        columns = self.get_columns()
        if not columns:
            return []

        quoted_columns = ", ".join(self._quote(c) for c in columns)
        query = (
            f'SELECT "id" as "__row_id__", {quoted_columns} '
            f'FROM {self._quote(self.table_name)}'
        )

        params: list[Any] = []
        search_text = (search_text or "").strip()

        if search_text:
            if column_name and column_name in columns:
                query += f" WHERE CAST({self._quote(column_name)} AS TEXT) LIKE ?"
                params.append(f"%{search_text}%")
            else:
                conditions = [
                    f"CAST({self._quote(c)} AS TEXT) LIKE ?"
                    for c in columns
                ]
                query += " WHERE " + " OR ".join(conditions)
                params.extend([f"%{search_text}%"] * len(columns))

        query += ' ORDER BY "id" DESC'

        if limit is not None and limit > 0:
            query += " LIMIT ?"
            params.append(limit)

        with self._connect() as conn:
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()

        return [self._row_to_record(columns, row) for row in rows]

    def get_by_id(self, row_id: int) -> DstRecord | None:
        if not self.is_available:
            return None
        columns = self.get_columns()
        if not columns:
            return None
        quoted_columns = ", ".join(self._quote(c) for c in columns)
        query = f'SELECT "id" as "__row_id__", {quoted_columns} FROM {self._quote(self.table_name)} WHERE "id" = ?'
        with self._connect() as conn:
            row = conn.execute(query, (row_id,)).fetchone()
        return self._row_to_record(columns, row) if row else None

    def get_columns(self) -> list[str]:
        if not self.is_available:
            return []
        with self._connect() as conn:
            cursor = conn.execute(f'PRAGMA table_info({self._quote(self.table_name)})')
            rows = cursor.fetchall()
        columns = [str(row["name"]) for row in rows if row["name"]]
        return [c for c in columns if c != "id"]

    def count(self) -> int:
        if not self.is_available:
            return 0
        with self._connect() as conn:
            row = conn.execute(f'SELECT COUNT(*) as n FROM {self._quote(self.table_name)}').fetchone()
        return row["n"] if row else 0

    def _row_to_record(self, columns: list[str], row: sqlite3.Row) -> DstRecord:
        data: dict[str, Any] = {col: row[col] for col in columns}
        return DstRecord(row_id=int(row["__row_id__"]), data=data)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _quote(name: str) -> str:
        return f'"{name.replace(chr(34), chr(34)+chr(34))}"'
