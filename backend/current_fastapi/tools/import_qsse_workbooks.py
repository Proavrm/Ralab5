"""CLI helper for the QSSE snapshot import."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT_DIR.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.services.qsse_import_service import QsseImportService, WorkbookSource


DEFAULT_SOURCES = (
    WorkbookSource(
        path=PROJECT_ROOT / "storage" / "documents" / "Suivi des indicateurs 2026.xlsx",
        source_year=2026,
        source_mode="live",
    ),
    WorkbookSource(
        path=PROJECT_ROOT / "storage" / "documents" / "2025 ARS_Analyse qualitative Environnement - Qualité.xlsx",
        source_year=2025,
        source_mode="closed",
    ),
    WorkbookSource(
        path=PROJECT_ROOT / "storage" / "documents" / "2025_ARS_Suivi des Indicateurs Prévention.xlsx",
        source_year=2025,
        source_mode="closed",
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import QSSE workbook snapshots into the RaLab database.")
    parser.add_argument("--preview", action="store_true", help="Only preview the workbook structure and row counts.")
    parser.add_argument("--skip-replace", action="store_true", help="Do not delete previous rows for the same source file before importing.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    service = QsseImportService()

    if args.preview:
        result = service.preview_sources(DEFAULT_SOURCES)
    else:
        result = service.import_sources(DEFAULT_SOURCES, replace_existing=not args.skip_replace)

    print(json.dumps(result, indent=2, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
