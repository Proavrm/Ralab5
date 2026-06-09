from __future__ import annotations

import argparse
import os
import re
import sqlite3
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "backend" / "current_fastapi" / "data"

RST_DB_PATH = Path(os.environ.get("RALAB4_DB_PATH", "").strip() or (DATA_DIR / "ralab3.db"))
NGE_REF_DB_PATH = DATA_DIR / "affaires.db"
ETUDES_REF_DB_PATH = DATA_DIR / "etudes.db"

FULL_AFFAIRE_CODE_SQL = """
COALESCE(
    NULLIF(TRIM(REPLACE(gsa, '*', '')), ''),
    NULLIF(TRIM(REPLACE(ehtp, '*', '')), ''),
    NULLIF(TRIM(REPLACE(nge_routes, '*', '')), ''),
    NULLIF(TRIM(REPLACE(nge_gc, '*', '')), ''),
    NULLIF(TRIM(REPLACE(lyaudet, '*', '')), ''),
    NULLIF(TRIM(REPLACE("nge_e.s.", '*', '')), ''),
    NULLIF(TRIM(REPLACE(nge_transitions, '*', '')), ''),
    CASE
        WHEN TRIM(COALESCE("n°affaire", '')) = '' THEN ''
        ELSE UPPER('RA' || TRIM("n°affaire") || TRIM(COALESCE(code_agence, '')))
    END
)
""".strip()

PLACEHOLDER_TITULAIRES = {
    "",
    "autre",
    "non communiqué",
    "non communique",
    "n/a",
    "na",
    "-",
    "—",
}


def normalize_affaire_key(value: str | None) -> str:
    text = str(value or "").replace("*", "").upper()
    text = re.sub(r"[\s\-_/\.]+", "", text)
    return text.strip()


def normalize_titulaire(value: str | None) -> str:
    return str(value or "").strip()


def is_placeholder_titulaire(value: str | None) -> bool:
    return normalize_titulaire(value).lower() in PLACEHOLDER_TITULAIRES


def load_nge_titulaire_map() -> dict[str, str]:
    with sqlite3.connect(str(NGE_REF_DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            f"""
            SELECT
                {FULL_AFFAIRE_CODE_SQL} AS numero_affaire_complet,
                titulaire
            FROM affaires
            """
        ).fetchall()

    by_key: dict[str, set[str]] = {}
    for row in rows:
        key = normalize_affaire_key(row["numero_affaire_complet"])
        titulaire = normalize_titulaire(row["titulaire"])
        if not key or not titulaire:
            continue
        by_key.setdefault(key, set()).add(titulaire)

    resolved: dict[str, str] = {}
    ambiguous = 0
    for key, values in by_key.items():
        if len(values) == 1:
            resolved[key] = next(iter(values))
        else:
            ambiguous += 1

    print(f"[NGE] keys with unique titulaire: {len(resolved)}")
    print(f"[NGE] keys with ambiguous titulaire: {ambiguous}")
    return resolved


def load_etudes_filiale_map() -> dict[str, str]:
    with sqlite3.connect(str(ETUDES_REF_DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT nAffaire AS numero_etude, filiale
            FROM etudes
            """
        ).fetchall()

    by_key: dict[str, set[str]] = {}
    for row in rows:
        key = normalize_affaire_key(row["numero_etude"])
        filiale = normalize_titulaire(row["filiale"])
        if not key or not filiale:
            continue
        by_key.setdefault(key, set()).add(filiale)

    resolved: dict[str, str] = {}
    ambiguous = 0
    for key, values in by_key.items():
        if len(values) == 1:
            resolved[key] = next(iter(values))
        else:
            ambiguous += 1

    print(f"[ETUDES] keys with unique filiale: {len(resolved)}")
    print(f"[ETUDES] keys with ambiguous filiale: {ambiguous}")
    return resolved


def reconcile(apply: bool, placeholder_only: bool) -> int:
    if not RST_DB_PATH.exists():
        raise FileNotFoundError(f"RST DB not found: {RST_DB_PATH}")
    if not NGE_REF_DB_PATH.exists():
        raise FileNotFoundError(f"NGE reference DB not found: {NGE_REF_DB_PATH}")
    if not ETUDES_REF_DB_PATH.exists():
        raise FileNotFoundError(f"Etudes reference DB not found: {ETUDES_REF_DB_PATH}")

    nge_map = load_nge_titulaire_map()
    etude_map = load_etudes_filiale_map()

    with sqlite3.connect(str(RST_DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, reference, affaire_nge, numero_etude, titulaire
            FROM affaires_rst
            """
        ).fetchall()

        updates: list[tuple[str, int, str, str, str, str, str]] = []
        nge_rule_count = 0
        etude_rule_count = 0

        for row in rows:
            rst_id = int(row["id"])
            reference = str(row["reference"] or "").strip()
            affaire_nge = str(row["affaire_nge"] or "").strip()
            numero_etude = str(row["numero_etude"] or "").strip()
            current_titulaire = normalize_titulaire(row["titulaire"])

            if placeholder_only and not is_placeholder_titulaire(current_titulaire):
                continue

            resolved_titulaire = ""
            source = ""

            # Rule 1: if affaire_nge exists (alone or with etude), use NGE titulaire.
            nge_key = normalize_affaire_key(affaire_nge)
            if nge_key:
                resolved_titulaire = nge_map.get(nge_key, "")
                source = "NGE"
            else:
                # Rule 2: only etude -> use etudes filiale.
                etude_key = normalize_affaire_key(numero_etude)
                if etude_key:
                    resolved_titulaire = etude_map.get(etude_key, "")
                    source = "ETUDES"

            if not resolved_titulaire:
                continue
            if current_titulaire == resolved_titulaire:
                continue

            if source == "NGE":
                nge_rule_count += 1
            else:
                etude_rule_count += 1
            updates.append(
                (
                    resolved_titulaire,
                    rst_id,
                    reference,
                    affaire_nge,
                    numero_etude,
                    current_titulaire,
                    source,
                )
            )

        print(f"[RST] rows scanned: {len(rows)}")
        print(f"[RST] rows to update: {len(updates)}")
        print(f"[RST] rows to update by NGE rule: {nge_rule_count}")
        print(f"[RST] rows to update by ETUDES rule: {etude_rule_count}")

        if not updates:
            print("No updates needed.")
            return 0

        sample = updates[:20]
        print("Sample updates (max 20):")
        for new_titulaire, rst_id, reference, affaire_nge, numero_etude, current_titulaire, source in sample:
            print(
                f"- id={rst_id} ref={reference} nge={affaire_nge or '<vide>'} etude={numero_etude or '<vide>'} [{source}] | "
                f"titulaire: '{current_titulaire or '<vide>'}' -> '{new_titulaire}'"
            )

        if not apply:
            print("Dry-run mode: no DB change applied.")
            return len(updates)

        conn.execute("BEGIN")
        now_expr = "datetime('now')"
        conn.executemany(
            f"""
            UPDATE affaires_rst
            SET titulaire = ?, updated_at = {now_expr}
            WHERE id = ?
            """,
            [(new_titulaire, rst_id) for new_titulaire, rst_id, *_ in updates],
        )
        conn.commit()

        print(f"Applied {len(updates)} updates.")
        return len(updates)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Reconcile affaires_rst.titulaire with agreed rule: "
            "if affaire_nge exists => NGE titulaire; else if only numero_etude => etudes filiale."
        )
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply updates. If omitted, runs in dry-run mode.",
    )
    parser.add_argument(
        "--placeholder-only",
        action="store_true",
        help="Limit updates to placeholder titulaire values only (Autre/vide/non communiqué).",
    )
    args = parser.parse_args()

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"Mode: {mode}")
    print(f"RST DB: {RST_DB_PATH}")
    print(f"NGE REF DB: {NGE_REF_DB_PATH}")
    print(f"ETUDES REF DB: {ETUDES_REF_DB_PATH}")
    if args.placeholder_only:
        print("Scope: placeholder titulaire only (Autre / vide / non communiqué / etc).")
    else:
        print("Scope: ALL titulaire values following rule (including non-placeholder).")

    reconcile(args.apply, args.placeholder_only)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
