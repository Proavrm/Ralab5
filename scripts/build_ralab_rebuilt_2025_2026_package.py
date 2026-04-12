from __future__ import annotations

import argparse
import csv
import json
import shutil
import sqlite3
import zipfile
from pathlib import Path


PROFILE_REBUILD_REVIEW = "rebuild-review"
PROFILE_RECONCILED_CFE = "reconciled-cfe"

PROFILE_CONFIGS = {
    PROFILE_REBUILD_REVIEW: {
        "description": "Build the review package for the rebuilt RaLab 2025-2026 database.",
        "default_package_name": "ralab_rebuilt_2025_2026_pack_v1",
        "default_db_relative_path": (
            "backend",
            "current_fastapi",
            "data",
            "ralab_rebuilt_2025_2026_v1.db",
        ),
        "default_source_db_name": "ralab3.db",
        "summary_filename": "SUMMARY_REBUILD.txt",
        "sidecar_suffixes": (),
    },
    PROFILE_RECONCILED_CFE: {
        "description": "Build the package for the latest reconciled historical RaLab snapshot with CFE materialization.",
        "default_package_name": "ralab3_reconciled_20260408_cfe_pack_v1",
        "default_db_relative_path": (
            "backend",
            "current_fastapi",
            "data",
            "ralab3_reconciled_20260408_cfe.db",
        ),
        "default_source_db_name": "ralab3.db",
        "summary_filename": "SUMMARY_RECONCILED.txt",
        "sidecar_suffixes": (".report.json", ".report.md"),
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a RaLab database handoff package.")
    parser.add_argument(
        "--profile",
        choices=sorted(PROFILE_CONFIGS),
        default=PROFILE_REBUILD_REVIEW,
        help="Packaging profile to use.",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        help="SQLite database to package. Defaults to the selected profile DB.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Output folder for the package contents. Defaults to the selected profile directory.",
    )
    parser.add_argument(
        "--zip-path",
        type=Path,
        help="Optional explicit zip output path. Defaults to <output-dir>.zip.",
    )
    parser.add_argument(
        "--source-db-name",
        help="Optional source DB label written into the generated summary.",
    )
    parser.add_argument(
        "--skip-zip",
        action="store_true",
        help="Create the folder only and skip zip generation.",
    )
    return parser.parse_args()


def normalize_row(row: sqlite3.Row) -> list[object]:
    return ["" if value is None else value for value in row]


def export_query_to_csv(conn: sqlite3.Connection, query: str, destination: Path) -> int:
    cursor = conn.execute(query)
    headers = [column[0] for column in cursor.description]
    rows = cursor.fetchall()

    with destination.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter=";")
        writer.writerow(headers)
        for row in rows:
            writer.writerow(normalize_row(row))

    return len(rows)


def scalar(conn: sqlite3.Connection, query: str) -> int:
    return int(conn.execute(query).fetchone()[0])


def table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table_name})")}


def pick_existing_column(columns: set[str], *candidates: str) -> str | None:
    for candidate in candidates:
        if candidate in columns:
            return candidate
    return None


def column_expression(
    columns: set[str],
    alias: str,
    *candidates: str,
    fallback: str = "''",
) -> str:
    column_name = pick_existing_column(columns, *candidates)
    if column_name:
        if column_name == alias:
            return column_name
        return f"{column_name} AS {alias}"
    return f"{fallback} AS {alias}"


def ordered_table_query(
    conn: sqlite3.Connection,
    table_name: str,
    order_candidates: tuple[str, ...],
) -> str:
    columns = table_columns(conn, table_name)
    order_columns = [column_name for column_name in order_candidates if column_name in columns]
    order_clause = f" ORDER BY {', '.join(order_columns)}" if order_columns else ""
    return f"SELECT * FROM {table_name}{order_clause}"


def build_review_required_items_query(conn: sqlite3.Connection) -> str:
    raw_columns = table_columns(conn, "interventions")
    intervention_reelle_columns = table_columns(conn, "interventions_reelles")
    raw_review_filter = "COALESCE(review_required, 0) = 1" if "review_required" in raw_columns else "0 = 1"
    raw_review_expr = "review_required" if "review_required" in raw_columns else "0 AS review_required"
    intervention_reelle_review_filter = (
        "COALESCE(review_required, 0) = 1"
        if "review_required" in intervention_reelle_columns
        else "0 = 1"
    )
    intervention_reelle_review_expr = (
        "review_required"
        if "review_required" in intervention_reelle_columns
        else "0 AS review_required"
    )

    return f"""
    SELECT item_type, reference, annee, raw_date, nature_reelle, auto_route, auto_confidence, auto_reason, review_required
    FROM (
        SELECT
            'intervention_raw' AS item_type,
            reference,
            {column_expression(raw_columns, 'annee', 'annee', 'year', 'source_year', fallback='NULL')},
            {column_expression(raw_columns, 'raw_date', 'date_intervention', 'canonical_date', fallback='NULL')},
            {column_expression(raw_columns, 'nature_reelle', 'nature_reelle', 'type_intervention')},
            {column_expression(raw_columns, 'auto_route', 'auto_route')},
            {column_expression(raw_columns, 'auto_confidence', 'auto_confidence', fallback='NULL')},
            {column_expression(raw_columns, 'auto_reason', 'auto_reason', 'tri_comment')},
            {raw_review_expr},
            0 AS item_sort
        FROM interventions
        WHERE {raw_review_filter}

        UNION ALL

        SELECT
            'intervention_reelle' AS item_type,
            reference,
            {column_expression(intervention_reelle_columns, 'annee', 'year', 'source_year', fallback='NULL')},
            {column_expression(intervention_reelle_columns, 'raw_date', 'canonical_date', 'date_intervention', fallback='NULL')},
            {column_expression(intervention_reelle_columns, 'nature_reelle', 'type_intervention', 'nature_reelle')},
            '' AS auto_route,
            {column_expression(intervention_reelle_columns, 'auto_confidence', 'auto_confidence', fallback='NULL')},
            {column_expression(intervention_reelle_columns, 'auto_reason', 'auto_reason', fallback="''")},
            {intervention_reelle_review_expr},
            1 AS item_sort
        FROM interventions_reelles
        WHERE {intervention_reelle_review_filter}
    ) review_items
    ORDER BY item_sort, annee, reference
    """


def build_export_queries(conn: sqlite3.Connection) -> tuple[tuple[str, str], ...]:
    return (
        (
            "prelevements.csv",
            ordered_table_query(
                conn,
                "prelevements",
                ("year", "source_year", "canonical_date", "date_prelevement", "reference"),
            ),
        ),
        (
            "interventions_reelles.csv",
            ordered_table_query(
                conn,
                "interventions_reelles",
                ("year", "source_year", "canonical_date", "date_intervention", "reference"),
            ),
        ),
        ("review_required_items.csv", build_review_required_items_query(conn)),
    )


def resolve_profile_defaults(
    repo_root: Path,
    args: argparse.Namespace,
) -> tuple[dict[str, object], Path, Path]:
    profile = PROFILE_CONFIGS[args.profile]
    default_db_path = repo_root.joinpath(*profile["default_db_relative_path"])
    default_output_dir = repo_root / profile["default_package_name"]
    db_path = (args.db_path or default_db_path).resolve()
    output_dir = (args.output_dir or default_output_dir).resolve()
    return profile, db_path, output_dir


def build_rebuild_summary_text(
    conn: sqlite3.Connection,
    source_db_name: str,
    packaged_db_name: str,
) -> str:
    summary_counts = {
        "interventions_raw": scalar(conn, "SELECT COUNT(*) FROM interventions"),
        "interventions_direct": scalar(
            conn,
            "SELECT COUNT(*) FROM interventions WHERE auto_route = 'direct'",
        ),
        "interventions_via_prelevement": scalar(
            conn,
            "SELECT COUNT(*) FROM interventions WHERE auto_route = 'via_prelevement'",
        ),
        "echantillons": scalar(conn, "SELECT COUNT(*) FROM echantillons"),
        "essais_labo": scalar(conn, "SELECT COUNT(*) FROM essais"),
        "prelevements": scalar(conn, "SELECT COUNT(*) FROM prelevements"),
        "interventions_reelles": scalar(conn, "SELECT COUNT(*) FROM interventions_reelles"),
    }

    classification_rows = conn.execute(
        """
        SELECT annee, nature_reelle, auto_route, COUNT(*) AS row_count
        FROM interventions
        GROUP BY annee, nature_reelle, auto_route
        ORDER BY annee, nature_reelle, auto_route
        """
    ).fetchall()

    lines = [
        "Rebuild base RaLab 2025-2026",
        "============================",
        "",
        f"Source DB: {source_db_name}",
        f"Output DB: {packaged_db_name}",
        "Scope: years 2025 and 2026",
        "",
        "Logic used",
        "- raw interventions kept as source material",
        "- lab echantillons create one prelevement each",
        "- lab essais remain linked to their echantillon/prelevement",
        "- raw intervention code DE -> prelevement path",
        "- raw intervention codes PLD / PMT / DF -> direct intervention path",
        "- raw intervention codes SO / SC -> sondage direct path",
        "- raw intervention code CFE -> direct intervention path",
        "",
        "Summary counts",
    ]

    for key, value in summary_counts.items():
        lines.append(f"- {key}: {value}")

    lines.extend(("", "Intervention classification counts"))

    for row in classification_rows:
        lines.append(
            f"- year {row['annee']} | {row['nature_reelle']} | {row['auto_route']} | {row['row_count']}"
        )

    lines.extend(
        (
            "",
            "Important note",
            "This is a best-effort heuristic rebuild. It is prepared to move faster, but it still needs business review on ambiguous groups.",
        )
    )

    return "\n".join(lines) + "\n"


def build_rebuild_package_readme(package_dir_name: str, db_filename: str) -> str:
    return "\n".join(
        (
            "RaLab rebuild review package",
            "============================",
            "",
            "Purpose",
            "- review the rebuilt 2025-2026 database snapshot outside the live operational DB",
            "- share the generated prelevements / interventions_reelles tables and the business-review queue",
            "",
            "Files included",
            f"- {db_filename}: rebuilt SQLite snapshot",
            "- prelevements.csv: full export of the generated prelevements table",
            "- interventions_reelles.csv: full export of the generated interventions_reelles table",
            "- review_required_items.csv: raw interventions and generated interventions_reelles flagged for manual review",
            "- SUMMARY_REBUILD.txt: rebuild logic and count summary",
            "",
            "How to review this DB in RaLab5 from this repository",
            "1. Extract the zip anywhere.",
            "2. In PowerShell, point RaLab5 to the extracted DB:",
            f"   $env:RALAB4_DB_PATH = \"C:\\path\\to\\{package_dir_name}\\{db_filename}\"",
            "3. Start the app with launch_ralab5_test.cmd from the repository root.",
            "",
            "Notes",
            "- CSV files use ';' as separator for Excel-friendly opening on Windows.",
            "- review_required_items.csv is the business-review queue; it does not mean the whole rebuild is invalid.",
        )
    ) + "\n"


def load_report_payload(db_path: Path) -> dict[str, object] | None:
    report_json_path = db_path.with_suffix(".report.json")
    if not report_json_path.exists():
        return None
    return json.loads(report_json_path.read_text(encoding="utf-8"))


def path_label(value: object, fallback: str = "unknown") -> str:
    if not value:
        return fallback
    return Path(str(value)).name


def nested_get(payload: dict[str, object] | None, *keys: str) -> object | None:
    current: object | None = payload
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def build_reconciled_summary_text(
    conn: sqlite3.Connection,
    db_path: Path,
    source_db_name: str,
    packaged_db_name: str,
    copied_sidecars: list[str],
) -> str:
    report_payload = load_report_payload(db_path)
    report_paths = nested_get(report_payload, "paths")
    raw_intervention_columns = table_columns(conn, "interventions")
    intervention_reelle_columns = table_columns(conn, "interventions_reelles")
    echantillon_columns = table_columns(conn, "echantillons")
    summary_counts = {
        "interventions_raw": scalar(conn, "SELECT COUNT(*) FROM interventions"),
        "echantillons": scalar(conn, "SELECT COUNT(*) FROM echantillons"),
        "essais_labo": scalar(conn, "SELECT COUNT(*) FROM essais"),
        "prelevements": scalar(conn, "SELECT COUNT(*) FROM prelevements"),
        "interventions_reelles": scalar(conn, "SELECT COUNT(*) FROM interventions_reelles"),
        "review_required_raw": (
            scalar(conn, "SELECT COUNT(*) FROM interventions WHERE COALESCE(review_required, 0) = 1")
            if "review_required" in raw_intervention_columns
            else 0
        ),
        "review_required_interventions_reelles": (
            scalar(
                conn,
                "SELECT COUNT(*) FROM interventions_reelles WHERE COALESCE(review_required, 0) = 1",
            )
            if "review_required" in intervention_reelle_columns
            else 0
        ),
    }
    if "temperature_prelevement_c" in echantillon_columns:
        summary_counts["temperature_prelevement_c"] = scalar(
            conn,
            "SELECT COUNT(*) FROM echantillons WHERE temperature_prelevement_c IS NOT NULL",
        )
    assay_rows = conn.execute(
        """
        SELECT essai_code, COUNT(*) AS row_count
        FROM essais
        WHERE essai_code IN ('CFE', 'EL', 'GR', 'ID', 'LCP', 'MVA', 'IPI', 'PN')
        GROUP BY essai_code
        ORDER BY essai_code
        """
    ).fetchall()

    source_label = source_db_name
    rebuilt_label = None
    if isinstance(report_paths, dict):
        source_label = path_label(report_paths.get("source_db"), source_db_name)
        rebuilt_label = path_label(report_paths.get("rebuilt_db"))

    lines = [
        "Base reconciliee RaLab historique (_cfe)",
        "=======================================",
        "",
        f"Source DB: {source_label}",
    ]
    if rebuilt_label and rebuilt_label != "unknown":
        lines.append(f"Rebuilt DB: {rebuilt_label}")
    lines.append(f"Output DB: {packaged_db_name}")
    lines.extend(("", "Included sidecars"))

    if copied_sidecars:
        for sidecar_name in copied_sidecars:
            lines.append(f"- {sidecar_name}")
    else:
        lines.append("- none")

    lines.extend(("", "Summary counts"))
    for key, value in summary_counts.items():
        lines.append(f"- {key}: {value}")

    if assay_rows:
        lines.extend(("", "Key assay counts"))
        for row in assay_rows:
            lines.append(f"- {row['essai_code']}: {row['row_count']}")

    if report_payload:
        report_stats = (
            ("Inserted interventions_reelles", nested_get(report_payload, "interventions_reelles", "stats", "inserted")),
            ("Inserted prelevements", nested_get(report_payload, "prelevements", "stats", "inserted")),
            ("Updated interventions", nested_get(report_payload, "interventions", "stats", "rows_updated")),
            (
                "Backfilled intervention nature_reelle",
                nested_get(report_payload, "interventions", "stats", "nature_backfilled"),
            ),
            (
                "Backfilled intervention -> prelevement links",
                nested_get(report_payload, "interventions", "stats", "prelevement_link_backfilled"),
            ),
            (
                "Backfilled intervention -> intervention_reelle links",
                nested_get(report_payload, "interventions", "stats", "intervention_reelle_link_backfilled"),
            ),
            (
                "Backfilled essai_code from observations",
                nested_get(report_payload, "essais", "stats", "backfilled_from_observations"),
            ),
            (
                "Normalized resultats payload",
                nested_get(report_payload, "essais", "stats", "normalized_resultats_payload"),
            ),
            (
                "Split IPI - PR -> PN",
                nested_get(report_payload, "ipi_pr_split", "stats", "converted_to_pn"),
            ),
            (
                "Inserted IPI siblings from split",
                nested_get(report_payload, "ipi_pr_split", "stats", "inserted_ipi_siblings"),
            ),
            (
                "Materialized CFE echantillons",
                nested_get(report_payload, "cfe_materialization", "stats", "created_echantillons"),
            ),
            (
                "Inserted GR siblings from CFE",
                nested_get(report_payload, "cfe_materialization", "stats", "inserted_gr_siblings"),
            ),
            (
                "Inserted EL siblings from CFE",
                nested_get(report_payload, "cfe_materialization", "stats", "inserted_el_siblings"),
            ),
            (
                "Inserted CFE pages",
                nested_get(report_payload, "cfe_materialization", "stats", "inserted_cfe_pages"),
            ),
            (
                "Remaining blank essai_code rows",
                nested_get(report_payload, "essais", "unresolved_total"),
            ),
        )
        lines.extend(("", "Applied reconciliation actions"))
        for label, value in report_stats:
            if value is not None:
                lines.append(f"- {label}: {value}")

    lines.extend(
        (
            "",
            "Important note",
            "This is the reconciled runtime snapshot with historical forms and CFE materialization applied.",
        )
    )

    return "\n".join(lines) + "\n"


def build_reconciled_package_readme(
    package_dir_name: str,
    db_filename: str,
    summary_filename: str,
    copied_sidecars: list[str],
) -> str:
    lines = [
        "RaLab reconciled package",
        "========================",
        "",
        "Purpose",
        "- share the latest reconciled historical snapshot used by the app",
        "- include the generated reconciliation reports beside the packaged SQLite DB",
        "- keep Excel-friendly review exports for prelevements / interventions_reelles / review items",
        "",
        "Files included",
        f"- {db_filename}: reconciled SQLite snapshot",
        "- prelevements.csv: full export of the prelevements table",
        "- interventions_reelles.csv: full export of the interventions_reelles table",
        "- review_required_items.csv: raw interventions and generated interventions_reelles flagged for manual review",
        f"- {summary_filename}: packaged count summary for the reconciled snapshot",
    ]
    for sidecar_name in copied_sidecars:
        lines.append(f"- {sidecar_name}: reconciliation sidecar copied next to the SQLite DB")
    lines.extend(
        (
            "",
            "How to use this DB in RaLab5 from this repository",
            "1. Extract the zip anywhere.",
            "2. In PowerShell, point RaLab5 to the extracted DB:",
            f"   $env:RALAB4_DB_PATH = \"C:\\path\\to\\{package_dir_name}\\{db_filename}\"",
            "3. Start the app with launch_ralab5_test.cmd from the repository root.",
            "",
            "Notes",
            "- CSV files use ';' as separator for Excel-friendly opening on Windows.",
            "- review_required_items.csv reflects the review flags kept in the reconciled DB; the sidecar reports explain the reconciliation decisions.",
        )
    )
    return "\n".join(lines) + "\n"


def build_summary_text(
    profile_key: str,
    conn: sqlite3.Connection,
    db_path: Path,
    source_db_name: str,
    packaged_db_name: str,
    copied_sidecars: list[str],
) -> str:
    if profile_key == PROFILE_REBUILD_REVIEW:
        return build_rebuild_summary_text(conn, source_db_name, packaged_db_name)
    return build_reconciled_summary_text(
        conn,
        db_path,
        source_db_name,
        packaged_db_name,
        copied_sidecars,
    )


def build_package_readme(
    profile_key: str,
    package_dir_name: str,
    db_filename: str,
    summary_filename: str,
    copied_sidecars: list[str],
) -> str:
    if profile_key == PROFILE_REBUILD_REVIEW:
        return build_rebuild_package_readme(package_dir_name, db_filename)
    return build_reconciled_package_readme(
        package_dir_name,
        db_filename,
        summary_filename,
        copied_sidecars,
    )


def copy_sidecar_files(db_path: Path, output_dir: Path, sidecar_suffixes: tuple[str, ...]) -> list[str]:
    copied_names: list[str] = []
    for suffix in sidecar_suffixes:
        sidecar_path = db_path.with_suffix(suffix)
        if not sidecar_path.exists():
            raise FileNotFoundError(f"Expected sidecar not found: {sidecar_path}")
        shutil.copy2(sidecar_path, output_dir / sidecar_path.name)
        copied_names.append(sidecar_path.name)
    return copied_names


def build_zip(output_dir: Path, zip_path: Path) -> None:
    if zip_path.exists():
        zip_path.unlink()

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in sorted(output_dir.rglob("*")):
            if file_path.is_file():
                archive.write(file_path, arcname=file_path.relative_to(output_dir.parent))


def validate_zip(output_dir: Path, zip_path: Path) -> None:
    expected_members = {
        str(file_path.relative_to(output_dir.parent)).replace("\\", "/")
        for file_path in output_dir.rglob("*")
        if file_path.is_file()
    }

    with zipfile.ZipFile(zip_path, "r") as archive:
        members = {name.rstrip("/") for name in archive.namelist()}
        missing = sorted(expected_members - members)
        broken_member = archive.testzip()

    if missing:
        raise RuntimeError(f"Zip validation failed; missing members: {', '.join(missing)}")
    if broken_member:
        raise RuntimeError(f"Zip validation failed; CRC mismatch on {broken_member}")


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    profile, db_path, output_dir = resolve_profile_defaults(repo_root, args)
    zip_path = args.zip_path.resolve() if args.zip_path else output_dir.with_suffix(".zip")
    source_db_name = args.source_db_name or profile["default_source_db_name"]
    summary_filename = profile["summary_filename"]

    try:
        zip_path.relative_to(output_dir)
    except ValueError:
        pass
    else:
        raise ValueError("Zip path must be outside the output directory.")

    if not db_path.exists():
        raise FileNotFoundError(f"Database not found: {db_path}")

    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    packaged_db_path = output_dir / db_path.name
    shutil.copy2(db_path, packaged_db_path)
    copied_sidecars = copy_sidecar_files(db_path, output_dir, profile["sidecar_suffixes"])

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        export_queries = build_export_queries(conn)

        exported_counts = {
            filename: export_query_to_csv(conn, query, output_dir / filename)
            for filename, query in export_queries
        }

        summary_text = build_summary_text(
            args.profile,
            conn,
            db_path,
            source_db_name,
            packaged_db_path.name,
            copied_sidecars,
        )

    (output_dir / summary_filename).write_text(summary_text, encoding="utf-8")
    (output_dir / "README_PACKAGE.txt").write_text(
        build_package_readme(
            args.profile,
            output_dir.name,
            packaged_db_path.name,
            summary_filename,
            copied_sidecars,
        ),
        encoding="utf-8",
    )

    if not args.skip_zip:
        build_zip(output_dir, zip_path)
        validate_zip(output_dir, zip_path)

    print(f"Profile: {args.profile}")
    print(f"Package folder: {output_dir}")
    print(f"Packaged DB: {packaged_db_path.name}")
    for sidecar_name in copied_sidecars:
        print(f"Copied sidecar: {sidecar_name}")
    for filename, row_count in exported_counts.items():
        print(f"{filename}: {row_count} row(s)")
    if args.skip_zip:
        print("Zip generation skipped.")
    else:
        print(f"Zip file: {zip_path}")
        print("Zip validation: OK")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())