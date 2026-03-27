"""
import_historical_labo_folder.py
CLI helper for one-shot historical laboratory Excel import.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.services.historical_lab_import_service import HistoricalLabImportService


def main() -> None:
    parser = argparse.ArgumentParser(description="Run historical lab Excel import for RaLab4.")
    parser.add_argument("folder_path", help="Unzipped folder containing Excel files")
    parser.add_argument("--target-db", dest="target_db", default=str(Path(__file__).resolve().parents[1] / "data" / "ralab3.db"))
    parser.add_argument("--affaires-db", dest="affaires_db", default=str(Path(__file__).resolve().parents[1] / "data" / "affaires.db"))
    parser.add_argument("--dry-run", action="store_true", help="Preview only without writing to database")
    parser.add_argument("--preview", action="store_true", help="Preview only with row sample")
    parser.add_argument("--limit", type=int, default=50, help="Preview row limit")
    args = parser.parse_args()

    service = HistoricalLabImportService(
        target_db_path=Path(args.target_db),
        affaires_db_path=Path(args.affaires_db),
    )

    if args.preview:
        result = service.preview_folder(Path(args.folder_path), limit=args.limit)
    else:
        result = service.run_import(Path(args.folder_path), dry_run=args.dry_run)

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
