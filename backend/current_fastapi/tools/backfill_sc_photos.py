"""
Backfill/audit photos for SC essais already imported in DB.

Usage:
  python backend/current_fastapi/tools/backfill_sc_photos.py
  python backend/current_fastapi/tools/backfill_sc_photos.py --apply

Behavior:
  - Scans essais where essai_code='SC'
  - Keeps only payloads imported by sc_excel_import
  - Detects missing /storage/essais_photos/{affaire}/essai_{id}.*
  - Optionally regenerates photo from source workbook + sheet using
    import_essais_sc._extract_and_save_photo
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any

import openpyxl

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.core.database import get_db_path
from api.import_essais_sc import _extract_and_save_photo


PHOTO_EXTENSIONS = (".jpg", ".JPG", ".jpeg", ".JPEG", ".png", ".PNG")
EXCEL_GLOBS = ("*.xlsx", "*.xlsm", "*.xls")


def _get_result_column(conn: sqlite3.Connection) -> str:
    cols = [row[1] for row in conn.execute("PRAGMA table_info(essais)").fetchall()]
    return "resultats_json" if "resultats_json" in cols else "resultats"


def _find_existing_photo(storage_root: Path, essai_id: int) -> Path | None:
    photos_root = storage_root / "essais_photos"
    if not photos_root.exists():
        return None
    for affaire_dir in photos_root.iterdir():
        if not affaire_dir.is_dir():
            continue
        for ext in PHOTO_EXTENSIONS:
            candidate = affaire_dir / f"essai_{essai_id}{ext}"
            if candidate.exists() and candidate.is_file():
                return candidate
    return None


def _normalize_name_token(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


def _filter_candidates_by_sheet(candidates: list[Path], sheet_name: str) -> list[Path]:
    sheet = str(sheet_name or "").strip()
    if not sheet:
        return candidates
    matched: list[Path] = []
    for candidate in candidates:
        try:
            wb = openpyxl.load_workbook(candidate, read_only=True, data_only=True)
            names = set(wb.sheetnames)
            wb.close()
        except Exception:
            continue
        if sheet in names:
            matched.append(candidate)
    return matched


def _resolve_source_excel(storage_root: Path, payload: dict[str, Any], sheet_name: str = "") -> tuple[Path | None, str]:
    # Prefer explicit source_file if present and existing.
    source_file = str(payload.get("source_file") or "").strip()
    if source_file:
        source_path = Path(source_file)
        if source_path.exists() and source_path.is_file():
            return source_path, "source_file"

    file_name = str(payload.get("file_name") or "").strip()
    if not file_name:
        return None, "missing_file_name"

    docs_root = storage_root / "documents"
    if not docs_root.exists():
        return None, "documents_root_missing"

    # Exact name lookup first.
    exact_matches = list(docs_root.rglob(file_name))
    if len(exact_matches) == 1:
        return exact_matches[0], "documents_lookup_exact"
    if len(exact_matches) > 1:
        by_sheet = _filter_candidates_by_sheet(exact_matches, sheet_name)
        if len(by_sheet) == 1:
            return by_sheet[0], "documents_lookup_exact_sheet_match"
        return None, "source_file_ambiguous"

    # Fuzzy fallback for mojibake/encoding drift in historical names.
    target_norm = _normalize_name_token(file_name)
    if not target_norm:
        return None, "source_file_not_found"

    all_excel: list[Path] = []
    for pattern in EXCEL_GLOBS:
        all_excel.extend(docs_root.rglob(pattern))

    norm_equal = [p for p in all_excel if _normalize_name_token(p.name) == target_norm]
    if len(norm_equal) == 1:
        return norm_equal[0], "documents_lookup_normalized"
    if len(norm_equal) > 1:
        by_sheet = _filter_candidates_by_sheet(norm_equal, sheet_name)
        if len(by_sheet) == 1:
            return by_sheet[0], "documents_lookup_normalized_sheet_match"
        return None, "source_file_ambiguous"

    norm_contains = [p for p in all_excel if target_norm in _normalize_name_token(p.name)]
    if len(norm_contains) == 1:
        return norm_contains[0], "documents_lookup_contains"
    if len(norm_contains) > 1:
        by_sheet = _filter_candidates_by_sheet(norm_contains, sheet_name)
        if len(by_sheet) == 1:
            return by_sheet[0], "documents_lookup_contains_sheet_match"
        return None, "source_file_ambiguous"

    return None, "source_file_not_found"


def _extract_affaire_from_header_snapshot(snapshot: Any) -> str:
    if not isinstance(snapshot, list):
        return ""
    for row in snapshot:
        if not isinstance(row, list):
            continue
        for cell in row:
            text = str(cell or "").strip()
            if not text:
                continue
            match = re.search(r"\bRA\s*[A-Z0-9]{3,}\b", text.upper())
            if match:
                return match.group(0).replace("  ", " ").strip()
    return ""


def run(apply_changes: bool) -> dict[str, Any]:
    db_path = get_db_path()
    storage_root = Path(__file__).resolve().parents[3] / "storage"

    stats = {
        "sc_total": 0,
        "sc_payload_import": 0,
        "already_has_photo": 0,
        "missing_photo": 0,
        "backfilled": 0,
        "skipped_legacy_no_payload": 0,
        "legacy_single_candidates": 0,
        "legacy_grouped_ambiguous": 0,
        "skipped_missing_sheet": 0,
        "skipped_missing_affaire": 0,
        "skipped_source_not_found": 0,
        "errors": 0,
    }
    details: list[dict[str, Any]] = []

    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        result_col = _get_result_column(conn)
        rows = conn.execute(
            f"""
            SELECT id, COALESCE({result_col}, '') AS result_blob
            FROM essais
            WHERE essai_code = 'SC'
            ORDER BY id
            """
        ).fetchall()

    stats["sc_total"] = len(rows)

    for row in rows:
        essai_id = int(row["id"])
        try:
            payload = json.loads(row["result_blob"] or "{}")
        except Exception:
            payload = {}

        # Modern importer payload.
        if payload.get("source") == "sc_excel_import":
            stats["sc_payload_import"] += 1
            sheet_name = str(payload.get("sheet") or "").strip()
            affaire_nge = str((payload.get("meta") or {}).get("affaire_nge_raw") or "").strip()
            payload_for_lookup = payload
        else:
            # Legacy SC payload: only recover if one source sheet is unambiguous.
            source_sheets = payload.get("source_sheets") if isinstance(payload.get("source_sheets"), list) else []
            source_files = payload.get("source_files") if isinstance(payload.get("source_files"), list) else []
            grouped = bool(payload.get("grouped"))
            if grouped or len(source_sheets) != 1:
                stats["legacy_grouped_ambiguous"] += 1
                stats["skipped_legacy_no_payload"] += 1
                continue

            sheet_name = str(source_sheets[0] or "").strip()
            affaire_nge = _extract_affaire_from_header_snapshot(payload.get("header_snapshot"))
            file_name = str(source_files[0] or "").strip() if source_files else ""
            payload_for_lookup = {"file_name": file_name}
            stats["legacy_single_candidates"] += 1

        existing = _find_existing_photo(storage_root, essai_id)
        if existing is not None:
            stats["already_has_photo"] += 1
            continue

        stats["missing_photo"] += 1

        if not sheet_name:
            stats["skipped_missing_sheet"] += 1
            details.append({"essai_id": essai_id, "status": "skipped", "reason": "missing_sheet"})
            continue
        if not affaire_nge:
            stats["skipped_missing_affaire"] += 1
            details.append({"essai_id": essai_id, "status": "skipped", "reason": "missing_affaire"})
            continue

        source_excel, resolve_reason = _resolve_source_excel(storage_root, payload_for_lookup, sheet_name=sheet_name)
        if source_excel is None:
            stats["skipped_source_not_found"] += 1
            details.append({
                "essai_id": essai_id,
                "status": "skipped",
                "reason": resolve_reason,
                "file_name": payload_for_lookup.get("file_name"),
            })
            continue

        if not apply_changes:
            details.append({
                "essai_id": essai_id,
                "status": "would_backfill",
                "sheet": sheet_name,
                "affaire": affaire_nge,
                "source_excel": str(source_excel),
                "resolved_by": resolve_reason,
            })
            continue

        try:
            file_name = _extract_and_save_photo(
                excel_path=source_excel,
                sheet_name=sheet_name,
                essai_id=essai_id,
                affaire_nge=affaire_nge,
            )
            if file_name:
                stats["backfilled"] += 1
                details.append({
                    "essai_id": essai_id,
                    "status": "backfilled",
                    "photo_file": file_name,
                    "sheet": sheet_name,
                    "source_excel": str(source_excel),
                })
            else:
                stats["errors"] += 1
                details.append({
                    "essai_id": essai_id,
                    "status": "error",
                    "reason": "extract_returned_none",
                    "sheet": sheet_name,
                    "source_excel": str(source_excel),
                })
        except Exception as exc:
            stats["errors"] += 1
            details.append({
                "essai_id": essai_id,
                "status": "error",
                "reason": str(exc),
                "sheet": sheet_name,
                "source_excel": str(source_excel),
            })

    return {
        "mode": "apply" if apply_changes else "dry-run",
        "db_path": str(db_path),
        "storage_root": str(storage_root),
        "stats": stats,
        "details": details,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill/audit SC photos")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually write missing photos (default: dry-run only)",
    )
    args = parser.parse_args()

    report = run(apply_changes=args.apply)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
