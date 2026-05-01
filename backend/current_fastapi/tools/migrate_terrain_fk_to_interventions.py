from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT_DIR / "data" / "ralab3.db"


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1",
        (table_name,),
    ).fetchone()
    return row is not None


def _find_mapping_candidates(conn: sqlite3.Connection) -> tuple[dict[int, int], list[dict[str, Any]]]:
    mapping: dict[int, int] = {}
    unresolved: list[dict[str, Any]] = []

    rows = conn.execute(
        """
        SELECT DISTINCT intervention_id
        FROM (
            SELECT intervention_id FROM series_essais_terrain WHERE intervention_id IS NOT NULL
            UNION
            SELECT intervention_id FROM points_terrain WHERE intervention_id IS NOT NULL
        )
        ORDER BY intervention_id
        """
    ).fetchall()

    for row in rows:
        source_id = int(row["intervention_id"])

        modern_exists = conn.execute(
            "SELECT id FROM interventions WHERE id = ? LIMIT 1",
            (source_id,),
        ).fetchone()
        if modern_exists is not None:
            mapping[source_id] = source_id
            continue

        by_legacy = conn.execute(
            "SELECT id FROM interventions WHERE legacy_intervention_id = ? ORDER BY id DESC LIMIT 1",
            (source_id,),
        ).fetchone()
        if by_legacy is not None:
            mapping[source_id] = int(by_legacy["id"])
            continue

        legacy_ref = conn.execute(
            "SELECT reference FROM interventions_legacy WHERE id = ? LIMIT 1",
            (source_id,),
        ).fetchone()
        if legacy_ref is None:
            unresolved.append({"source_intervention_id": source_id, "reason": "not_found_in_interventions_or_legacy"})
            continue

        reference = str(legacy_ref["reference"] or "").strip()
        by_reference = conn.execute(
            """
            SELECT id
            FROM interventions
            WHERE UPPER(TRIM(reference)) = UPPER(TRIM(?))
            ORDER BY id DESC
            """,
            (reference,),
        ).fetchall()
        if len(by_reference) == 1:
            mapping[source_id] = int(by_reference[0]["id"])
            continue
        if len(by_reference) > 1:
            unresolved.append(
                {
                    "source_intervention_id": source_id,
                    "reason": "ambiguous_reference",
                    "reference": reference,
                    "candidate_intervention_ids": [int(item["id"]) for item in by_reference],
                }
            )
            continue

        unresolved.append(
            {
                "source_intervention_id": source_id,
                "reason": "no_matching_intervention_reference",
                "reference": reference,
            }
        )

    return mapping, unresolved


def _count_fk_target(conn: sqlite3.Connection, table_name: str) -> str:
    row = conn.execute(
        f"PRAGMA foreign_key_list({table_name})"
    ).fetchall()
    for fk in row:
        from_col = str(fk["from"] if isinstance(fk, sqlite3.Row) else fk[3])
        if from_col == "intervention_id":
            target = fk["table"] if isinstance(fk, sqlite3.Row) else fk[2]
            return str(target or "")
    return ""


def build_report(db_path: Path) -> dict[str, Any]:
    with _connect(db_path) as conn:
        mapping, unresolved = _find_mapping_candidates(conn)
        report = {
            "target_db_path": str(db_path),
            "fk_targets": {
                "series_essais_terrain": _count_fk_target(conn, "series_essais_terrain"),
                "points_terrain": _count_fk_target(conn, "points_terrain"),
                "feuilles_terrain": _count_fk_target(conn, "feuilles_terrain"),
            },
            "counts": {
                "series_total": int(conn.execute("SELECT COUNT(*) FROM series_essais_terrain").fetchone()[0]),
                "points_total": int(conn.execute("SELECT COUNT(*) FROM points_terrain").fetchone()[0]),
                "series_null_intervention": int(conn.execute("SELECT COUNT(*) FROM series_essais_terrain WHERE intervention_id IS NULL").fetchone()[0]),
                "points_null_intervention": int(conn.execute("SELECT COUNT(*) FROM points_terrain WHERE intervention_id IS NULL").fetchone()[0]),
                "distinct_non_null_intervention_ids": int(
                    conn.execute(
                        """
                        SELECT COUNT(*)
                        FROM (
                            SELECT DISTINCT intervention_id
                            FROM (
                                SELECT intervention_id FROM series_essais_terrain WHERE intervention_id IS NOT NULL
                                UNION
                                SELECT intervention_id FROM points_terrain WHERE intervention_id IS NOT NULL
                            )
                        )
                        """
                    ).fetchone()[0]
                ),
                "mapped_ids": len(mapping),
                "unresolved_ids": len(unresolved),
                "fk_violations": int(conn.execute("SELECT COUNT(*) FROM pragma_foreign_key_check").fetchone()[0]),
            },
            "unresolved_samples": unresolved[:50],
        }
    return report


def _rebuild_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA foreign_keys = OFF;

        CREATE TABLE IF NOT EXISTS points_terrain_backup_migration AS
        SELECT * FROM points_terrain;

        CREATE TABLE series_essais_terrain_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference TEXT NOT NULL UNIQUE,
            demande_id INTEGER REFERENCES demandes(id) ON DELETE SET NULL,
            campagne_id INTEGER REFERENCES campagnes(id) ON DELETE SET NULL,
            intervention_id INTEGER REFERENCES interventions(id) ON DELETE SET NULL,
            code_essai TEXT NOT NULL DEFAULT '',
            libelle_essai TEXT NOT NULL DEFAULT '',
            source_file TEXT NOT NULL DEFAULT '',
            sheet_name TEXT NOT NULL DEFAULT '',
            group_signature TEXT NOT NULL DEFAULT '',
            import_mode TEXT NOT NULL DEFAULT '',
            statut TEXT NOT NULL DEFAULT 'Importée',
            date_essai TEXT NOT NULL DEFAULT '',
            operateur TEXT NOT NULL DEFAULT '',
            section_controlee TEXT NOT NULL DEFAULT '',
            couche TEXT NOT NULL DEFAULT '',
            observations TEXT NOT NULL DEFAULT '',
            payload_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            source_essai_id INTEGER
        );

        INSERT INTO series_essais_terrain_new (
            id, reference, demande_id, campagne_id, intervention_id, code_essai,
            libelle_essai, source_file, sheet_name, group_signature, import_mode,
            statut, date_essai, operateur, section_controlee, couche, observations,
            payload_json, created_at, updated_at, source_essai_id
        )
        SELECT
            id, reference, demande_id, campagne_id, intervention_id, code_essai,
            libelle_essai, source_file, sheet_name, group_signature, import_mode,
            statut, date_essai, operateur, section_controlee, couche, observations,
            payload_json, created_at, updated_at, source_essai_id
        FROM series_essais_terrain;

        DROP TABLE points_terrain;
        DROP TABLE series_essais_terrain;

        ALTER TABLE series_essais_terrain_new RENAME TO series_essais_terrain;

        CREATE TABLE points_terrain (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            serie_id INTEGER NOT NULL REFERENCES series_essais_terrain(id) ON DELETE CASCADE,
            intervention_id INTEGER REFERENCES interventions(id) ON DELETE SET NULL,
            campagne_id INTEGER REFERENCES campagnes(id) ON DELETE SET NULL,
            demande_id INTEGER REFERENCES demandes(id) ON DELETE SET NULL,
            point_code TEXT NOT NULL DEFAULT '',
            point_type TEXT NOT NULL DEFAULT '',
            ordre INTEGER NOT NULL DEFAULT 0,
            localisation TEXT NOT NULL DEFAULT '',
            position_label TEXT NOT NULL DEFAULT '',
            profil TEXT NOT NULL DEFAULT '',
            profondeur_haut REAL,
            profondeur_bas REAL,
            valeur_principale REAL,
            unite_principale TEXT NOT NULL DEFAULT '',
            observation TEXT NOT NULL DEFAULT '',
            payload_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            source_essai_id INTEGER,
            reference TEXT
        );

        INSERT INTO points_terrain (
            id, serie_id, intervention_id, campagne_id, demande_id, point_code,
            point_type, ordre, localisation, position_label, profil, profondeur_haut,
            profondeur_bas, valeur_principale, unite_principale, observation,
            payload_json, created_at, source_essai_id, reference
        )
        SELECT
            id, serie_id, intervention_id, campagne_id, demande_id, point_code,
            point_type, ordre, localisation, position_label, profil, profondeur_haut,
            profondeur_bas, valeur_principale, unite_principale, observation,
            payload_json, created_at, source_essai_id, reference
        FROM points_terrain_backup_migration;

        DROP TABLE points_terrain_backup_migration;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_points_terrain_reference_unique ON points_terrain(reference);
        CREATE UNIQUE INDEX IF NOT EXISTS ux_points_terrain_source_essai ON points_terrain(source_essai_id) WHERE source_essai_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS ux_series_essais_terrain_source_essai ON series_essais_terrain(source_essai_id) WHERE source_essai_id IS NOT NULL;

        PRAGMA foreign_keys = ON;
        """
    )


def apply_migration(db_path: Path) -> dict[str, Any]:
    with _connect(db_path) as conn:
        mapping, unresolved = _find_mapping_candidates(conn)

        conn.execute("BEGIN")
        try:
            series_updates = 0
            points_updates = 0
            for source_id, target_id in mapping.items():
                series_updates += int(
                    conn.execute(
                        "UPDATE series_essais_terrain SET intervention_id = ? WHERE intervention_id = ?",
                        (int(target_id), int(source_id)),
                    ).rowcount
                )
                points_updates += int(
                    conn.execute(
                        "UPDATE points_terrain SET intervention_id = ? WHERE intervention_id = ?",
                        (int(target_id), int(source_id)),
                    ).rowcount
                )

            unresolved_ids = [int(item["source_intervention_id"]) for item in unresolved if "source_intervention_id" in item]
            series_nullified = 0
            points_nullified = 0
            if unresolved_ids:
                placeholders = ",".join("?" for _ in unresolved_ids)
                series_nullified = int(
                    conn.execute(
                        f"UPDATE series_essais_terrain SET intervention_id = NULL WHERE intervention_id IN ({placeholders})",
                        tuple(unresolved_ids),
                    ).rowcount
                )
                points_nullified = int(
                    conn.execute(
                        f"UPDATE points_terrain SET intervention_id = NULL WHERE intervention_id IN ({placeholders})",
                        tuple(unresolved_ids),
                    ).rowcount
                )

            _rebuild_tables(conn)
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    with _connect(db_path) as conn:
        return {
            "target_db_path": str(db_path),
            "mapped_ids": len(mapping),
            "unresolved_ids": len(unresolved),
            "series_rows_reassigned": series_updates,
            "points_rows_reassigned": points_updates,
            "series_rows_nullified": series_nullified,
            "points_rows_nullified": points_nullified,
            "fk_targets": {
                "series_essais_terrain": _count_fk_target(conn, "series_essais_terrain"),
                "points_terrain": _count_fk_target(conn, "points_terrain"),
                "feuilles_terrain": _count_fk_target(conn, "feuilles_terrain"),
            },
            "fk_violations_after": int(conn.execute("SELECT COUNT(*) FROM pragma_foreign_key_check").fetchone()[0]),
            "unresolved_samples": unresolved[:50],
        }


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate terrain FKs from interventions_legacy to interventions.")
    parser.add_argument("--target-db", default=str(DEFAULT_DB), help="Target sqlite DB path")
    parser.add_argument("--apply", action="store_true", help="Apply migration; otherwise print dry-run report")
    parser.add_argument(
        "--backup-db",
        default="",
        help="Required with --apply. Backup path to copy DB before migration",
    )
    args = parser.parse_args()

    db_path = Path(args.target_db)
    if not db_path.exists():
        raise FileNotFoundError(f"DB not found: {db_path}")

    if not args.apply:
        print(json.dumps(build_report(db_path), indent=2, ensure_ascii=False))
        return

    backup = str(args.backup_db or "").strip()
    if not backup:
        parser.error("--backup-db is required when --apply is used")

    backup_path = Path(backup)
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(db_path, backup_path)

    result = apply_migration(db_path)
    result["backup_db_path"] = str(backup_path)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
