from __future__ import annotations

import argparse
import re
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import get_db_path
from app.repositories.dst_repository import DstRecord, DstRepository


def normalize_name(value: object) -> str:
    if value is None:
        return ""
    return " ".join(str(value).replace("\n", " ").split())


def normalize_dst_demandeur(value: object) -> str:
    text = normalize_name(value)
    if not text:
        return ""
    parts = [part.strip() for part in text.split(",") if part.strip()]
    if not parts:
        return ""
    if len(parts) >= 3 and re.match(r"^[A-Z]?\d[A-Z0-9]*$", parts[-1], re.IGNORECASE):
        parts = parts[:-1]
    return " ".join(parts)


def find_dst_record(dst_repo: DstRepository, numero_dst: str) -> DstRecord | None:
    numero = normalize_name(numero_dst)
    if not numero or not dst_repo.is_available:
        return None
    for column in ("N° chrono", "Numéro dossier DST"):
        records = dst_repo.search(search_text=numero, column_name=column, limit=20)
        for record in records:
            value = normalize_name(record.first_text(column))
            if value.casefold() == numero.casefold():
                return record
    return None


def is_safe_truncation(current_name: str, target_name: str) -> bool:
    current = normalize_name(current_name)
    target = normalize_name(target_name)

    if not target:
        return False
    if not current:
        return True
    if current.casefold() == target.casefold():
        return False
    if len(current) >= len(target):
        return False

    current_fold = current.casefold()
    target_fold = target.casefold()
    if current_fold in target_fold:
        return True

    current_tokens = [token for token in current_fold.split() if token]
    target_tokens = [token for token in target_fold.split() if token]
    if not current_tokens or len(current_tokens) >= len(target_tokens):
        return False
    return all(token in target_tokens for token in current_tokens)


@dataclass(slots=True)
class RepairCandidate:
    demande_id: int
    demande_ref: str
    numero_dst: str
    demandeur_current: str
    demandeur_target: str
    dst_row_id: int
    reason: str


def load_candidates(db_path: Path, dst_repo: DstRepository) -> tuple[list[RepairCandidate], dict[str, int]]:
    stats = {
        "demandes_with_numero_dst": 0,
        "dst_exact_matches": 0,
        "already_ok": 0,
        "ambiguous_skipped": 0,
        "repair_candidates": 0,
    }
    candidates: list[RepairCandidate] = []

    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, reference, COALESCE(numero_dst, '') AS numero_dst, COALESCE(demandeur, '') AS demandeur
            FROM demandes
            WHERE COALESCE(numero_dst, '') != ''
            ORDER BY id
            """
        ).fetchall()

    stats["demandes_with_numero_dst"] = len(rows)

    for row in rows:
        numero_dst = normalize_name(row["numero_dst"])
        record = find_dst_record(dst_repo, numero_dst)
        if not record:
            continue
        stats["dst_exact_matches"] += 1

        current_name = normalize_name(row["demandeur"])
        target_name = normalize_dst_demandeur(record.first_text("Demandeur"))

        if not target_name:
            stats["ambiguous_skipped"] += 1
            continue
        if current_name.casefold() == target_name.casefold():
            stats["already_ok"] += 1
            continue

        if not is_safe_truncation(current_name, target_name):
            stats["ambiguous_skipped"] += 1
            continue

        reason = "empty" if not current_name else "substring"
        candidates.append(
            RepairCandidate(
                demande_id=int(row["id"]),
                demande_ref=str(row["reference"] or ""),
                numero_dst=numero_dst,
                demandeur_current=current_name,
                demandeur_target=target_name,
                dst_row_id=record.row_id,
                reason=reason,
            )
        )

    stats["repair_candidates"] = len(candidates)
    return candidates, stats


def apply_candidates(db_path: Path, candidates: list[RepairCandidate]) -> int:
    if not candidates:
        return 0

    with sqlite3.connect(str(db_path)) as conn:
        for item in candidates:
            conn.execute(
                """
                UPDATE demandes
                SET demandeur = ?, updated_at = datetime('now')
                WHERE id = ?
                """,
                (item.demandeur_target, item.demande_id),
            )
        conn.commit()
    return len(candidates)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Repair truncated demandeur values in demandes by exact matching numero_dst to DST records."
    )
    parser.add_argument("--apply", action="store_true", help="Write the detected repairs into the demandes table.")
    parser.add_argument("--limit", type=int, default=30, help="Maximum number of preview lines to print.")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    db_path = get_db_path()
    dst_repo = DstRepository()

    if not db_path.exists():
        print(f"Database not found: {db_path}")
        return 1
    if not dst_repo.is_available:
        print(f"DST database not found: {dst_repo.db_path}")
        return 1

    candidates, stats = load_candidates(db_path, dst_repo)

    print(f"Target DB: {db_path}")
    print(f"DST DB: {dst_repo.db_path}")
    print(f"Demandes with numero_dst: {stats['demandes_with_numero_dst']}")
    print(f"Exact DST matches: {stats['dst_exact_matches']}")
    print(f"Already OK: {stats['already_ok']}")
    print(f"Ambiguous skipped: {stats['ambiguous_skipped']}")
    print(f"Repair candidates: {stats['repair_candidates']}")

    for item in candidates[: max(args.limit, 0)]:
        print(
            f"- #{item.demande_id} {item.demande_ref} | DST {item.numero_dst} | "
            f"'{item.demandeur_current or '-'}' -> '{item.demandeur_target}' | reason={item.reason} | dst_row={item.dst_row_id}"
        )

    if args.apply:
        updated = apply_candidates(db_path, candidates)
        print(f"Applied updates: {updated}")
    else:
        print("Dry run only. Re-run with --apply to write the changes.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())