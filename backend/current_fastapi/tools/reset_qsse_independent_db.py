"""Reset QSSE from the main RaLab DB and create an empty independent QSSE DB."""
from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.core.database import ensure_qsse_schema, get_db_path, get_qsse_db_path


QSSE_TABLES = [
    "qsse_documents",
    "qsse_rex_drafts",
    "qsse_analysis_documents",
    "qsse_records",
    "qsse_import_runs",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Purge QSSE data from the main DB and create a fresh independent QSSE DB.",
    )
    parser.add_argument("--apply", action="store_true", help="Apply the reset. Without this flag, only preview.")
    parser.add_argument("--main-db-path", type=Path, help="Override the main RaLab SQLite DB path.")
    parser.add_argument("--qsse-db-path", type=Path, help="Override the independent QSSE SQLite DB path.")
    return parser.parse_args()


def _connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def _count_table(conn: sqlite3.Connection, table_name: str) -> int:
    if not _table_exists(conn, table_name):
        return 0
    return int(conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0] or 0)


def _snapshot(conn: sqlite3.Connection) -> dict[str, int]:
    return {table: _count_table(conn, table) for table in QSSE_TABLES}


def _backup_file(path: Path, suffix: str) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = path.with_name(f"{path.stem}_{suffix}_{timestamp}{path.suffix}")
    shutil.copy2(path, backup_path)
    return backup_path


def _purge_main_qsse(conn: sqlite3.Connection) -> None:
    for table in QSSE_TABLES:
        if _table_exists(conn, table):
            conn.execute(f"DELETE FROM {table}")


def main() -> None:
    args = parse_args()
    main_db_path = Path(args.main_db_path) if args.main_db_path else get_db_path()
    qsse_db_path = Path(args.qsse_db_path) if args.qsse_db_path else get_qsse_db_path()

    if not main_db_path.exists():
        raise SystemExit(f"Main DB not found: {main_db_path}")

    with _connect(main_db_path) as main_conn:
        before_main = _snapshot(main_conn)

    before_qsse_exists = qsse_db_path.exists()
    before_qsse = {}
    if before_qsse_exists:
        with _connect(qsse_db_path) as qsse_conn:
            before_qsse = _snapshot(qsse_conn)

    result: dict[str, Any] = {
        "mode": "apply" if args.apply else "preview",
        "main_db_path": str(main_db_path),
        "qsse_db_path": str(qsse_db_path),
        "before": {
            "main": before_main,
            "qsse_db_exists": before_qsse_exists,
            "qsse": before_qsse,
        },
        "backups": {
            "main": None,
            "qsse": None,
        },
        "after": {
            "main": before_main,
            "qsse": before_qsse,
        },
    }

    if args.apply:
        main_backup = _backup_file(main_db_path, "before_qsse_reset")
        qsse_backup = None
        if qsse_db_path.exists():
            qsse_backup = _backup_file(qsse_db_path, "before_qsse_reset")
            qsse_db_path.unlink()

        ensure_qsse_schema(qsse_db_path)

        with _connect(main_db_path) as main_conn:
            main_conn.execute("BEGIN IMMEDIATE")
            try:
                _purge_main_qsse(main_conn)
                main_conn.commit()
            except Exception:
                main_conn.rollback()
                raise

        with _connect(main_db_path) as main_conn:
            after_main = _snapshot(main_conn)
        with _connect(qsse_db_path) as qsse_conn:
            after_qsse = _snapshot(qsse_conn)

        result["backups"]["main"] = str(main_backup)
        result["backups"]["qsse"] = str(qsse_backup) if qsse_backup else None
        result["after"]["main"] = after_main
        result["after"]["qsse"] = after_qsse

    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()