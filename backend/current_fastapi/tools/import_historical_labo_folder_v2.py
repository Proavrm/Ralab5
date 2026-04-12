"""CLI helper for grouped historical laboratory Excel import V2."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.services.historical_lab_import_service_v2 import HistoricalLabImportServiceV2


def main() -> None:
    parser = argparse.ArgumentParser(description="Run historical lab Excel import V2 for RaLab5.")
    parser.add_argument("folder_path", help="Unzipped folder containing Excel files")
    parser.add_argument("--target-db", dest="target_db", default=str(Path(__file__).resolve().parents[1] / "data" / "ralab3.db"))
    parser.add_argument("--affaires-db", dest="affaires_db", default=str(Path(__file__).resolve().parents[1] / "data" / "affaires.db"))
    parser.add_argument("--dry-run", action="store_true", help="Preview counts without writing to the database")
    parser.add_argument("--preview", action="store_true", help="Preview grouped rows")
    parser.add_argument("--limit", type=int, default=50, help="Preview row limit")
    args = parser.parse_args()

    service = HistoricalLabImportServiceV2(
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