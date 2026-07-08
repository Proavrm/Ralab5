from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.repositories.competency_repository import CompetencyRepository


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply RST operational codes to competency_catalog.")
    parser.add_argument(
        "--include-inactive",
        action="store_true",
        help="Also process inactive catalog rows.",
    )
    args = parser.parse_args()

    repository = CompetencyRepository()
    stats = repository.apply_rst_codes(include_inactive=args.include_inactive)
    print(
        f"[OK] rst_code mapping applied: {stats['mapped']} mapped, "
        f"{stats['cleared']} without code, {stats['total']} total row(s)"
    )


if __name__ == "__main__":
    main()
