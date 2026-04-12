from __future__ import annotations

import hashlib
import re
import sqlite3
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


COMPETENCY_LEVELS = (
    ("N0", 0, "Niveau 0", "Ne connait pas l'essai."),
    ("N1", 1, "Niveau 1", "Debutant; realise l'essai avec une supervision."),
    ("N2", 2, "Niveau 2", "Intermediaire; realise l'essai seul."),
    ("N3", 3, "Niveau 3", "Confirme; realise l'essai seul et fait la saisie."),
    ("N4", 4, "Niveau 4", "Expert; connait parfaitement l'essai."),
    ("N5", 5, "Niveau 5", "Formateur."),
)


def _normalize_key_part(value: str | None) -> str:
    raw = unicodedata.normalize("NFKD", (value or "").strip())
    ascii_only = raw.encode("ascii", "ignore").decode("ascii").lower()
    compact = re.sub(r"[^a-z0-9]+", "-", ascii_only).strip("-")
    return compact or "na"


def build_catalog_source_key(
    domain: str | None,
    context_type: str | None,
    label: str | None,
    reference: str | None,
) -> str:
    normalized = "|".join(
        [
            _normalize_key_part(domain),
            _normalize_key_part(context_type),
            _normalize_key_part(reference),
            _normalize_key_part(label),
        ]
    )
    digest = hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:20]
    return f"cmp_{digest}"


class CompetencyRepository:
    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or self._default_db_path()

    def _default_db_path(self) -> Path:
        return Path(__file__).resolve().parents[2] / "data" / "security.db"

    def _connect(self) -> sqlite3.Connection:
        if not self.db_path.exists():
            raise FileNotFoundError(
                f"Base de competences introuvable : {self.db_path}\n"
                "Lance d'abord le script tools/init_security_db.py"
            )

        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        self._ensure_schema_updates(connection)
        return connection

    def _ensure_schema_updates(self, connection: sqlite3.Connection) -> None:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS competency_levels (
                level_code TEXT PRIMARY KEY,
                sort_order INTEGER NOT NULL,
                label TEXT NOT NULL,
                description TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS competency_catalog (
                competency_id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_key TEXT NOT NULL UNIQUE,
                domain TEXT NOT NULL,
                context_type TEXT NOT NULL,
                label TEXT NOT NULL,
                reference TEXT,
                publication_date TEXT,
                simplified_protocol TEXT,
                certification TEXT,
                standard_referent TEXT,
                standard_update_impact TEXT,
                trainer_name TEXT,
                is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_competency_catalog_domain ON competency_catalog(domain);
            CREATE INDEX IF NOT EXISTS idx_competency_catalog_context_type ON competency_catalog(context_type);
            CREATE INDEX IF NOT EXISTS idx_competency_catalog_active ON competency_catalog(is_active);

            CREATE TABLE IF NOT EXISTS user_competency_assessments (
                assessment_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT NOT NULL,
                competency_id INTEGER NOT NULL,
                level_code TEXT NOT NULL,
                assessed_at TEXT NOT NULL,
                assessor_name TEXT,
                source_type TEXT NOT NULL DEFAULT 'manual',
                source_reference TEXT,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (user_email, competency_id, assessed_at),
                FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
                FOREIGN KEY (competency_id) REFERENCES competency_catalog(competency_id) ON DELETE CASCADE,
                FOREIGN KEY (level_code) REFERENCES competency_levels(level_code)
            );

            CREATE INDEX IF NOT EXISTS idx_user_competency_assessments_user ON user_competency_assessments(user_email);
            CREATE INDEX IF NOT EXISTS idx_user_competency_assessments_competency ON user_competency_assessments(competency_id);
            CREATE INDEX IF NOT EXISTS idx_user_competency_assessments_assessed_at ON user_competency_assessments(assessed_at);

            DROP VIEW IF EXISTS user_competency_current;

            CREATE VIEW user_competency_current AS
            SELECT assessments.*
            FROM user_competency_assessments assessments
            WHERE NOT EXISTS (
                SELECT 1
                FROM user_competency_assessments newer
                WHERE newer.user_email = assessments.user_email
                  AND newer.competency_id = assessments.competency_id
                  AND (
                    newer.assessed_at > assessments.assessed_at
                    OR (
                        newer.assessed_at = assessments.assessed_at
                        AND newer.assessment_id > assessments.assessment_id
                    )
                  )
            );
            """
        )
        connection.executemany(
            """
            INSERT OR IGNORE INTO competency_levels (level_code, sort_order, label, description)
            VALUES (?, ?, ?, ?)
            """,
            COMPETENCY_LEVELS,
        )
        connection.commit()

    def list_levels(self) -> list[sqlite3.Row]:
        query = """
            SELECT level_code, sort_order, label, description
            FROM competency_levels
            ORDER BY sort_order, level_code
        """

        with self._connect() as connection:
            return connection.execute(query).fetchall()

    def get_level(self, level_code: str) -> sqlite3.Row | None:
        query = """
            SELECT level_code, sort_order, label, description
            FROM competency_levels
            WHERE level_code = ?
            LIMIT 1
        """

        with self._connect() as connection:
            return connection.execute(query, (level_code.strip(),)).fetchone()

    def list_catalog(self, include_inactive: bool = False) -> list[sqlite3.Row]:
        query = """
            SELECT
                competency_id,
                source_key,
                domain,
                context_type,
                label,
                reference,
                publication_date,
                simplified_protocol,
                certification,
                standard_referent,
                standard_update_impact,
                trainer_name,
                is_active,
                created_at,
                updated_at
            FROM competency_catalog
            {where_clause}
            ORDER BY domain COLLATE NOCASE, context_type COLLATE NOCASE, label COLLATE NOCASE
        """
        where_clause = "" if include_inactive else "WHERE is_active = 1"

        with self._connect() as connection:
            return connection.execute(query.format(where_clause=where_clause)).fetchall()

    def get_competency(self, competency_id: int) -> sqlite3.Row | None:
        query = """
            SELECT
                competency_id,
                source_key,
                domain,
                context_type,
                label,
                reference,
                publication_date,
                simplified_protocol,
                certification,
                standard_referent,
                standard_update_impact,
                trainer_name,
                is_active,
                created_at,
                updated_at
            FROM competency_catalog
            WHERE competency_id = ?
            LIMIT 1
        """

        with self._connect() as connection:
            return connection.execute(query, (competency_id,)).fetchone()

    def upsert_catalog_entry(
        self,
        *,
        source_key: str,
        domain: str,
        context_type: str,
        label: str,
        reference: str | None = None,
        publication_date: str | None = None,
        simplified_protocol: str | None = None,
        certification: str | None = None,
        standard_referent: str | None = None,
        standard_update_impact: str | None = None,
        trainer_name: str | None = None,
        is_active: bool = True,
    ) -> int:
        query = """
            INSERT INTO competency_catalog (
                source_key,
                domain,
                context_type,
                label,
                reference,
                publication_date,
                simplified_protocol,
                certification,
                standard_referent,
                standard_update_impact,
                trainer_name,
                is_active,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(source_key) DO UPDATE SET
                domain = excluded.domain,
                context_type = excluded.context_type,
                label = excluded.label,
                reference = excluded.reference,
                publication_date = excluded.publication_date,
                simplified_protocol = excluded.simplified_protocol,
                certification = excluded.certification,
                standard_referent = excluded.standard_referent,
                standard_update_impact = excluded.standard_update_impact,
                trainer_name = excluded.trainer_name,
                is_active = excluded.is_active,
                updated_at = CURRENT_TIMESTAMP
        """

        with self._connect() as connection:
            connection.execute(
                query,
                (
                    source_key.strip(),
                    domain.strip(),
                    context_type.strip(),
                    label.strip(),
                    (reference or "").strip() or None,
                    (publication_date or "").strip() or None,
                    (simplified_protocol or "").strip() or None,
                    (certification or "").strip() or None,
                    (standard_referent or "").strip() or None,
                    (standard_update_impact or "").strip() or None,
                    (trainer_name or "").strip() or None,
                    1 if is_active else 0,
                ),
            )
            row = connection.execute(
                "SELECT competency_id FROM competency_catalog WHERE source_key = ? LIMIT 1",
                (source_key.strip(),),
            ).fetchone()
            connection.commit()
        return int(row["competency_id"])

    def deactivate_missing_catalog_entries(self, active_source_keys: set[str]) -> int:
        if not active_source_keys:
            return 0

        placeholders = ", ".join("?" for _ in active_source_keys)
        query = f"""
            UPDATE competency_catalog
            SET is_active = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE source_key NOT IN ({placeholders})
        """

        with self._connect() as connection:
            cursor = connection.execute(query, tuple(sorted(active_source_keys)))
            connection.commit()
            return cursor.rowcount or 0

    def create_assessment(
        self,
        *,
        user_email: str,
        competency_id: int,
        level_code: str,
        assessed_at: str | None = None,
        assessor_name: str | None = None,
        source_type: str = "manual",
        source_reference: str | None = None,
        notes: str | None = None,
    ) -> int:
        assessment_timestamp = assessed_at or datetime.now(timezone.utc).isoformat(timespec="seconds")
        competency = self.get_competency(competency_id)
        if competency is None:
            raise ValueError(f"Competence '{competency_id}' introuvable.")
        if not bool(competency["is_active"]):
            raise ValueError(f"Competence '{competency_id}' inactive.")

        query = """
            INSERT INTO user_competency_assessments (
                user_email,
                competency_id,
                level_code,
                assessed_at,
                assessor_name,
                source_type,
                source_reference,
                notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """

        with self._connect() as connection:
            cursor = connection.execute(
                query,
                (
                    user_email.strip().lower(),
                    competency_id,
                    level_code.strip().upper(),
                    assessment_timestamp,
                    (assessor_name or "").strip() or None,
                    (source_type or "manual").strip() or "manual",
                    (source_reference or "").strip() or None,
                    (notes or "").strip() or None,
                ),
            )
            connection.commit()
            return int(cursor.lastrowid)

    def delete_assessment(self, user_email: str, assessment_id: int) -> bool:
        query = """
            DELETE FROM user_competency_assessments
            WHERE assessment_id = ?
              AND lower(user_email) = lower(?)
        """

        with self._connect() as connection:
            cursor = connection.execute(query, (assessment_id, user_email.strip().lower()))
            connection.commit()
            return (cursor.rowcount or 0) > 0

    def list_user_current_assessments(self, user_email: str) -> list[sqlite3.Row]:
        query = """
            SELECT
                current.assessment_id,
                current.user_email,
                current.competency_id,
                catalog.source_key,
                catalog.domain,
                catalog.context_type,
                catalog.label AS competency_label,
                catalog.reference,
                levels.level_code,
                levels.label AS level_label,
                levels.description AS level_description,
                current.assessed_at,
                current.assessor_name,
                current.source_type,
                current.source_reference,
                current.notes
            FROM user_competency_current current
            JOIN competency_catalog catalog ON catalog.competency_id = current.competency_id
            JOIN competency_levels levels ON levels.level_code = current.level_code
            WHERE lower(current.user_email) = lower(?)
            ORDER BY catalog.domain COLLATE NOCASE, catalog.context_type COLLATE NOCASE, catalog.label COLLATE NOCASE
        """

        with self._connect() as connection:
            return connection.execute(query, (user_email.strip().lower(),)).fetchall()

    def list_user_assessment_history(self, user_email: str) -> list[sqlite3.Row]:
        query = """
            SELECT
                assessments.assessment_id,
                assessments.user_email,
                assessments.competency_id,
                catalog.source_key,
                catalog.domain,
                catalog.context_type,
                catalog.label AS competency_label,
                catalog.reference,
                levels.level_code,
                levels.label AS level_label,
                levels.description AS level_description,
                assessments.assessed_at,
                assessments.assessor_name,
                assessments.source_type,
                assessments.source_reference,
                assessments.notes
            FROM user_competency_assessments assessments
            JOIN competency_catalog catalog ON catalog.competency_id = assessments.competency_id
            JOIN competency_levels levels ON levels.level_code = assessments.level_code
            WHERE lower(assessments.user_email) = lower(?)
            ORDER BY assessments.assessed_at DESC, assessments.assessment_id DESC
        """

        with self._connect() as connection:
            return connection.execute(query, (user_email.strip().lower(),)).fetchall()