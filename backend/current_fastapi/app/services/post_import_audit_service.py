"""
post_import_audit_service.py
Post-import audit helpers for historical Excel backfill in RaLab4.
"""
from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REFERENCE_AFFAIRE_COLUMNS = [
    "n°affaire",
    "gsa",
    "ehtp",
    "nge_routes",
    "nge_gc",
    "lyaudet",
    "nge_e.s.",
    "nge_transitions",
]


@dataclass(slots=True)
class AuditPaths:
    target_db_path: Path
    affaires_db_path: Path


class PostImportAuditService:
    """Read-only audit service for historical imports already loaded in RaLab4."""

    def __init__(self, target_db_path: Path, affaires_db_path: Path) -> None:
        self.paths = AuditPaths(
            target_db_path=target_db_path,
            affaires_db_path=affaires_db_path,
        )

    def status(self) -> dict[str, Any]:
        return {
            "target_db_path": str(self.paths.target_db_path),
            "affaires_db_path": str(self.paths.affaires_db_path),
            "target_db_exists": self.paths.target_db_path.exists(),
            "affaires_db_exists": self.paths.affaires_db_path.exists(),
        }

    def build_report(self, limit: int = 100) -> dict[str, Any]:
        if not self.paths.target_db_path.exists():
            raise FileNotFoundError(f"Target DB not found: {self.paths.target_db_path}")

        with sqlite3.connect(self.paths.target_db_path) as conn:
            conn.row_factory = sqlite3.Row
            report = {
                "summary": self._build_summary(conn),
                "recent_batches": self._recent_batches(conn, limit=20),
                "code_overview": self._code_overview(conn, limit=200),
                "imported_affaires": self._imported_affaires(conn, limit=limit),
                "imported_demandes": self._imported_demandes(conn, limit=limit),
                "suspect_simple_identifications": self._suspect_simple_identifications(conn, limit=limit),
                "suspect_cfe_composites": self._suspect_cfe_composites(conn, limit=limit),
            }

        reference_rows = self._load_reference_affaires()
        imported_affaires = report["imported_affaires"]
        unresolved: list[dict[str, Any]] = []
        chantier_site_mix: list[dict[str, Any]] = []
        for row in imported_affaires:
            affaire_key = self._normalize_affaire_key(row.get("affaire_nge", ""))
            match = self._find_reference_match(reference_rows, affaire_key)
            if match is None:
                unresolved.append(
                    {
                        "affaire_reference": row["reference"],
                        "affaire_id": row["id"],
                        "affaire_nge": row.get("affaire_nge", ""),
                        "affaire_key": affaire_key,
                        "chantier": row.get("chantier", ""),
                        "reason": "Aucun match trouvé après normalisation",
                    }
                )
            if self._looks_like_site(row.get("chantier", "")):
                chantier_site_mix.append(
                    {
                        "affaire_reference": row["reference"],
                        "affaire_id": row["id"],
                        "affaire_nge": row.get("affaire_nge", ""),
                        "chantier": row.get("chantier", ""),
                        "hint": "Le champ chantier ressemble à un site/localisation.",
                    }
                )

        report["unresolved_imported_affaires"] = unresolved[:limit]
        report["suspect_chantier_site_mix"] = chantier_site_mix[:limit]
        return report

    def _build_summary(self, conn: sqlite3.Connection) -> dict[str, Any]:
        return {
            "historical_batches": self._safe_count(conn, "historical_import_batches"),
            "historical_files": self._safe_count(conn, "historical_import_files"),
            "imported_affaires": self._safe_scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM affaires_rst
                WHERE statut = 'Importée' OR responsable = 'Import historique'
                """,
                default=0,
            ),
            "imported_demandes": self._safe_scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM demandes
                WHERE nature LIKE 'Import historique%'
                """,
                default=0,
            ),
            "imported_echantillons": self._safe_scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM echantillons
                WHERE statut = 'Importé' OR observations LIKE '%source_file%'
                """,
                default=0,
            ),
            "imported_essais": self._safe_scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM essais
                WHERE statut = 'Importé'
                """,
                default=0,
            ),
            "imported_interventions": self._safe_scalar(
                conn,
                """
                SELECT COUNT(*)
                FROM interventions
                WHERE statut = 'Importée'
                """,
                default=0,
            ),
        }

    def _recent_batches(self, conn: sqlite3.Connection, limit: int) -> list[dict[str, Any]]:
        if not self._table_exists(conn, "historical_import_batches"):
            return []
        rows = conn.execute(
            """
            SELECT
                id,
                folder_path,
                dry_run,
                total_candidates,
                created_affaires,
                created_demandes,
                created_echantillons,
                created_essais,
                status,
                notes,
                started_at,
                finished_at
            FROM historical_import_batches
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def _code_overview(self, conn: sqlite3.Connection, limit: int) -> list[dict[str, Any]]:
        if not self._table_exists(conn, "historical_import_files"):
            return []
        rows = conn.execute(
            """
            SELECT
                COALESCE(essai_code, '') AS essai_code,
                COALESCE(status, '') AS status,
                COUNT(*) AS file_count
            FROM historical_import_files
            GROUP BY COALESCE(essai_code, ''), COALESCE(status, '')
            ORDER BY essai_code ASC, status ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def _imported_affaires(self, conn: sqlite3.Connection, limit: int) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT
                a.id,
                a.reference,
                a.affaire_nge,
                a.chantier,
                a.titulaire,
                a.statut,
                a.responsable,
                a.date_ouverture,
                (
                    SELECT COUNT(*)
                    FROM demandes d
                    WHERE d.affaire_rst_id = a.id
                ) AS demandes_count,
                (
                    SELECT COUNT(*)
                    FROM demandes d
                    JOIN echantillons e ON e.demande_id = d.id
                    WHERE d.affaire_rst_id = a.id
                ) AS echantillons_count,
                (
                    SELECT COUNT(*)
                    FROM demandes d
                    JOIN echantillons e ON e.demande_id = d.id
                    JOIN essais es ON es.echantillon_id = e.id
                    WHERE d.affaire_rst_id = a.id
                ) AS essais_count,
                (
                    SELECT COUNT(*)
                    FROM demandes d
                    JOIN interventions i ON i.demande_id = d.id
                    WHERE d.affaire_rst_id = a.id
                ) AS interventions_count
            FROM affaires_rst a
            WHERE a.statut = 'Importée' OR a.responsable = 'Import historique'
            ORDER BY a.reference ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def _imported_demandes(self, conn: sqlite3.Connection, limit: int) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT
                d.id,
                d.reference,
                d.annee,
                d.labo_code,
                d.type_mission,
                d.nature,
                d.description,
                d.statut,
                a.reference AS affaire_reference,
                a.affaire_nge,
                a.chantier,
                (
                    SELECT COUNT(*)
                    FROM echantillons e
                    WHERE e.demande_id = d.id
                ) AS echantillons_count,
                (
                    SELECT COUNT(*)
                    FROM echantillons e
                    JOIN essais es ON es.echantillon_id = e.id
                    WHERE e.demande_id = d.id
                ) AS essais_count,
                (
                    SELECT COUNT(*)
                    FROM interventions i
                    WHERE i.demande_id = d.id
                ) AS interventions_count,
                (
                    SELECT COUNT(*)
                    FROM demande_enabled_modules m
                    WHERE m.demande_id = d.id AND m.is_enabled = 1
                ) AS modules_enabled_count
            FROM demandes d
            LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
            WHERE d.nature LIKE 'Import historique%'
            ORDER BY d.reference ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def _suspect_simple_identifications(self, conn: sqlite3.Connection, limit: int) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT
                es.id,
                es.type_essai,
                es.statut,
                e.reference AS echantillon_reference,
                e.designation AS echantillon_designation,
                d.reference AS demande_reference,
                a.reference AS affaire_reference,
                a.affaire_nge,
                es.observations
            FROM essais es
            JOIN echantillons e ON e.id = es.echantillon_id
            JOIN demandes d ON d.id = e.demande_id
            LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
            WHERE es.type_essai = 'Identification'
            ORDER BY a.reference ASC, d.reference ASC, e.reference ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def _suspect_cfe_composites(self, conn: sqlite3.Connection, limit: int) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT
                i.id,
                i.reference,
                i.type_intervention,
                i.sujet,
                i.date_intervention,
                d.reference AS demande_reference,
                a.reference AS affaire_reference,
                a.affaire_nge,
                i.observations
            FROM interventions i
            JOIN demandes d ON d.id = i.demande_id
            LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
            WHERE COALESCE(i.observations, '') LIKE '%"essai_code"%CFE%'
               OR COALESCE(i.type_intervention, '') LIKE '%fabrication%'
            ORDER BY a.reference ASC, d.reference ASC, i.reference ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def _load_reference_affaires(self) -> list[dict[str, Any]]:
        if not self.paths.affaires_db_path.exists():
            return []
        with sqlite3.connect(self.paths.affaires_db_path) as conn:
            conn.row_factory = sqlite3.Row
            if not self._table_exists(conn, "affaires"):
                return []
            rows = conn.execute("SELECT * FROM affaires").fetchall()
        return [dict(row) for row in rows]

    def _find_reference_match(self, rows: list[dict[str, Any]], affaire_key: str) -> dict[str, Any] | None:
        if not affaire_key:
            return None
        for row in rows:
            for column_name in REFERENCE_AFFAIRE_COLUMNS:
                raw_value = self._stringify(row.get(column_name, ""))
                if self._normalize_affaire_key(raw_value) == affaire_key:
                    matched = dict(row)
                    matched["matched_column"] = column_name
                    matched["matched_code_raw"] = raw_value
                    return matched
        return None

    def _normalize_affaire_key(self, value: str) -> str:
        text = self._stringify(value).upper()
        text = re.sub(r"[\s\-_/\\\.]+", "", text)
        return text.strip()

    def _looks_like_site(self, value: str) -> bool:
        text = self._stringify(value)
        if not text:
            return False
        if re.search(r"\(\d{2,3}\)", text):
            return True
        upper_ratio = sum(1 for char in text if char.isupper()) / max(len([c for c in text if c.isalpha()]), 1)
        if upper_ratio > 0.75 and any(token in text for token in [" ST ", "SAINT", "CLERMONT", "LYON", "AUVERGNE", "RHONE"]):
            return True
        return False

    def _table_exists(self, conn: sqlite3.Connection, table_name: str) -> bool:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            (table_name,),
        ).fetchone()
        return row is not None

    def _safe_count(self, conn: sqlite3.Connection, table_name: str) -> int:
        if not self._table_exists(conn, table_name):
            return 0
        return int(conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0])

    def _safe_scalar(self, conn: sqlite3.Connection, sql: str, default: int = 0) -> int:
        try:
            row = conn.execute(sql).fetchone()
            if row is None:
                return default
            return int(row[0])
        except sqlite3.Error:
            return default

    def _stringify(self, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()
