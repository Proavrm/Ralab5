"""Preview or safely reimport the live QSSE 2026 workbook without touching the rest of the DB."""
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
PROJECT_ROOT = ROOT_DIR.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.core.database import ensure_qsse_schema, get_qsse_db_path
from app.services.qsse_import_service import QsseImportService, WorkbookSource


DEFAULT_SOURCE_PATH = PROJECT_ROOT / "storage" / "documents" / "Suivi des indicateurs 2026.xlsx"
DEFAULT_SOURCE_YEAR = 2026
DEFAULT_SOURCE_MODE = "live"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Preview or safely reimport the live QSSE 2026 workbook with a scoped replace and DB backup.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Create a DB backup and run the scoped replace_existing import.",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        help="Override the target SQLite DB path.",
    )
    parser.add_argument(
        "--source-path",
        type=Path,
        default=DEFAULT_SOURCE_PATH,
        help="Workbook path to reimport.",
    )
    parser.add_argument(
        "--source-year",
        type=int,
        default=DEFAULT_SOURCE_YEAR,
        help="Source year to replace.",
    )
    parser.add_argument(
        "--source-mode",
        default=DEFAULT_SOURCE_MODE,
        help="Source mode metadata recorded on new rows.",
    )
    return parser.parse_args()


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _scope_snapshot(conn: sqlite3.Connection, *, source_file: str, source_year: int) -> dict[str, Any]:
    summary_row = conn.execute(
        """
        SELECT
            COUNT(*) AS records,
            SUM(CASE WHEN register_code = 'FNC' AND record_kind = 'event' THEN 1 ELSE 0 END) AS fnc_event_records,
            SUM(CASE WHEN record_kind = 'indicator' THEN 1 ELSE 0 END) AS indicator_records
        FROM qsse_records
        WHERE source_file = ? AND source_year = ?
        """,
        (source_file, int(source_year)),
    ).fetchone()

    documents = conn.execute(
        """
        SELECT COUNT(*)
        FROM qsse_documents doc
        JOIN qsse_records rec ON rec.id = doc.qsse_record_id
        WHERE rec.source_file = ? AND rec.source_year = ?
        """,
        (source_file, int(source_year)),
    ).fetchone()[0]

    rex_drafts = conn.execute(
        """
        SELECT COUNT(*)
        FROM qsse_rex_drafts draft
        JOIN qsse_records rec ON rec.id = draft.qsse_record_id
        WHERE rec.source_file = ? AND rec.source_year = ?
        """,
        (source_file, int(source_year)),
    ).fetchone()[0]

    import_runs = conn.execute(
        """
        SELECT id, source_mode, status, row_count, inserted_count, created_at, updated_at
        FROM qsse_import_runs
        WHERE source_file = ? AND source_year = ?
        ORDER BY id DESC
        LIMIT 8
        """,
        (source_file, int(source_year)),
    ).fetchall()

    sheets = conn.execute(
        """
        SELECT sheet_name, sheet_kind, register_code, record_kind, COUNT(*) AS total
        FROM qsse_records
        WHERE source_file = ? AND source_year = ?
        GROUP BY sheet_name, sheet_kind, register_code, record_kind
        ORDER BY total DESC, sheet_name ASC
        """,
        (source_file, int(source_year)),
    ).fetchall()

    return {
        "records": int(summary_row["records"] or 0),
        "fnc_event_records": int(summary_row["fnc_event_records"] or 0),
        "indicator_records": int(summary_row["indicator_records"] or 0),
        "documents": int(documents or 0),
        "rex_drafts": int(rex_drafts or 0),
        "recent_runs": [dict(row) for row in import_runs],
        "sheets": [dict(row) for row in sheets],
    }


def _backup_db(db_path: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = db_path.with_name(f"{db_path.stem}_before_qsse_live_reimport_{timestamp}{db_path.suffix}")
    shutil.copy2(db_path, backup_path)
    return backup_path


def main() -> None:
    args = parse_args()
    db_path = Path(args.db_path) if args.db_path else get_qsse_db_path()
    source_path = Path(args.source_path)
    source_file = source_path.name
    source_year = int(args.source_year)
    source_mode = str(args.source_mode or DEFAULT_SOURCE_MODE)

    if not db_path.exists():
        ensure_qsse_schema(db_path)

    if not source_path.exists():
        raise SystemExit(f"Workbook not found: {source_path}")

    with _connect(db_path) as conn:
        before = _scope_snapshot(conn, source_file=source_file, source_year=source_year)

    result: dict[str, Any] = {
        "mode": "apply" if args.apply else "preview",
        "db_path": str(db_path),
        "scope": {
            "source_file": source_file,
            "source_year": source_year,
            "source_mode": source_mode,
            "replace_scope_sql": "DELETE FROM qsse_records WHERE source_file = ? AND source_year = ?",
        },
        "before": before,
        "backup_path": None,
        "import_result": None,
        "after": before,
    }

    if args.apply:
        backup_path = _backup_db(db_path)
        service = QsseImportService(db_path=db_path)
        import_result = service.import_sources(
            (
                WorkbookSource(
                    path=source_path,
                    source_year=source_year,
                    source_mode=source_mode,
                ),
            ),
            replace_existing=True,
        )
        with _connect(db_path) as conn:
            after = _scope_snapshot(conn, source_file=source_file, source_year=source_year)
        result["backup_path"] = str(backup_path)
        result["import_result"] = import_result
        result["after"] = after

    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()