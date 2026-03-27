"""
app/services/dst_import_service.py
Importação de Excel DST → SQLite.
Reutilizado directamente do RALab2 sem alterações.
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd


@dataclass(slots=True)
class DstImportResult:
    inserted:      int  = 0
    updated:       int  = 0
    skipped:       int  = 0
    total_rows:    int  = 0
    sheet_name:    str  = "ExcelMergeQuery"
    db_created:    bool = False
    table_created: bool = False


class DstImportService:
    def __init__(self, db_path: str | Path | None = None, table_name: str = "dst") -> None:
        self.db_path = Path(db_path) if db_path else self._default_db_path()
        self.table_name = table_name

    def _default_db_path(self) -> Path:
        return Path(__file__).resolve().parents[2] / "data" / "dst.db"

    def import_excel(self, excel_path: str | Path, sheet_name: str = "ExcelMergeQuery") -> DstImportResult:
        excel_path = Path(excel_path)
        if not excel_path.exists():
            raise FileNotFoundError(f"Fichier Excel introuvable : {excel_path}")

        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        df = pd.read_excel(excel_path, sheet_name=sheet_name)
        df = self._normalize_df(df)

        if "N° chrono" not in df.columns:
            raise ValueError("La colonne 'N° chrono' est absente du fichier Excel.")

        result = DstImportResult(total_rows=len(df), sheet_name=sheet_name)
        result.db_created = not self.db_path.exists()

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row

            if not self._table_exists(conn):
                self._create_table(conn, df)
                result.table_created = True

            self._ensure_columns(conn, df)
            db_columns  = self._get_columns(conn)
            existing    = self._get_existing_by_chrono(conn)

            for _, row in df.iterrows():
                chrono = self._norm_cell(row.get("N° chrono"))
                if not chrono:
                    result.skipped += 1
                    continue

                payload = {col: self._norm_cell(row[col]) for col in db_columns if col in row.index}

                if chrono in existing:
                    self._update(conn, existing[chrono], payload)
                    result.updated += 1
                else:
                    new_id = self._insert(conn, payload)
                    result.inserted += 1
                    if new_id:
                        existing[chrono] = new_id

            conn.commit()

        return result

    # ── helpers ────────────────────────────────
    def _table_exists(self, conn: sqlite3.Connection) -> bool:
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (self.table_name,),
        )
        return cur.fetchone() is not None

    def _create_table(self, conn: sqlite3.Connection, df: pd.DataFrame) -> None:
        cols_sql = ['"id" INTEGER PRIMARY KEY AUTOINCREMENT']
        for col in df.columns:
            name = str(col).strip()
            if name and name.lower() != "id":
                cols_sql.append(f'{self._q(name)} TEXT')
        conn.execute(
            f"CREATE TABLE IF NOT EXISTS {self._q(self.table_name)} ({', '.join(cols_sql)})"
        )

    def _ensure_columns(self, conn: sqlite3.Connection, df: pd.DataFrame) -> None:
        existing = set(self._get_columns(conn))
        for col in df.columns:
            name = str(col).strip()
            if name and name.lower() != "id" and name not in existing:
                conn.execute(
                    f"ALTER TABLE {self._q(self.table_name)} ADD COLUMN {self._q(name)} TEXT"
                )

    def _get_columns(self, conn: sqlite3.Connection) -> list[str]:
        cur = conn.execute(f"PRAGMA table_info({self._q(self.table_name)})")
        return [str(row[1]) for row in cur.fetchall() if row[1] and row[1] != "id"]

    def _get_existing_by_chrono(self, conn: sqlite3.Connection) -> dict[str, int]:
        cols = self._get_columns(conn)
        if "N° chrono" not in cols:
            return {}
        cur = conn.execute(
            f'SELECT "id", {self._q("N° chrono")} FROM {self._q(self.table_name)} '
            f'WHERE {self._q("N° chrono")} IS NOT NULL'
        )
        return {str(self._norm_cell(row["N° chrono"])): int(row["id"]) for row in cur.fetchall() if row["N° chrono"]}

    def _insert(self, conn: sqlite3.Connection, payload: dict[str, Any]) -> int | None:
        if not payload:
            return None
        cols  = list(payload.keys())
        q_cols = ", ".join(self._q(c) for c in cols)
        cur = conn.execute(
            f"INSERT INTO {self._q(self.table_name)} ({q_cols}) VALUES ({','.join(['?']*len(cols))})",
            [payload[c] for c in cols],
        )
        return int(cur.lastrowid)

    def _update(self, conn: sqlite3.Connection, row_id: int, payload: dict[str, Any]) -> None:
        if not payload:
            return
        cols = list(payload.keys())
        assignments = ", ".join(f"{self._q(c)} = ?" for c in cols)
        conn.execute(
            f'UPDATE {self._q(self.table_name)} SET {assignments} WHERE "id" = ?',
            [payload[c] for c in cols] + [row_id],
        )

    def _normalize_df(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df.columns = [str(c).strip() for c in df.columns]
        return df

    def _norm_cell(self, value: Any) -> Any:
        try:
            if pd.isna(value):
                return None
        except Exception:
            pass
        if hasattr(value, "to_pydatetime"):
            value = value.to_pydatetime()
        if isinstance(value, str):
            return value.strip() or None
        if hasattr(value, "isoformat"):
            try:
                return value.isoformat(sep=" ")
            except Exception:
                return str(value)
        return value

    @staticmethod
    def _q(name: str) -> str:
        return f'"{name.replace(chr(34), chr(34)+chr(34))}"'
