from pathlib import Path
import sqlite3


EMPLOYMENT_LEVELS = (
    ("directeur_ingenierie", "Directeur de l'ingénierie", 10),
    ("directeur_scientifique_technique", "Directeur scientifique et technique", 20),
    ("directeur_etudes_techniques", "Directeur études techniques", 30),
    ("responsable_scientifique_technique", "Responsable scientifique et technique", 40),
    ("referent_scientifique_technique", "Référent scientifique et technique", 50),
    ("chef_section_laboratoire_principal", "Chef de section laboratoire principal", 60),
    ("referent_scientifique_technique_adjoint", "Référent scientifique et technique adjoint", 60),
    ("chef_section_laboratoire", "Chef de section laboratoire", 70),
    ("technicien_laboratoire_principal", "Technicien laboratoire principal", 70),
    ("technicien_laboratoire_confirme", "Technicien laboratoire confirmé", 80),
    ("technicien_laboratoire", "Technicien laboratoire", 90),
    ("operateur_laboratoire", "Opérateur laboratoire", 100),
    ("aide_operateur_laboratoire", "Aide opérateur laboratoire", 110),
)


class SecurityRepository:
    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or self._default_db_path()

    def _default_db_path(self) -> Path:
        return Path(__file__).resolve().parents[2] / "data" / "security.db"

    def _connect(self) -> sqlite3.Connection:
        if not self.db_path.exists():
            raise FileNotFoundError(
                f"Base de sécurité introuvable : {self.db_path}\n"
                "Lance d'abord le script tools/init_security_db.py"
            )

        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        self._ensure_schema_updates(connection)
        return connection

    def _ensure_schema_updates(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS employment_levels (
                employment_level_code TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                sort_order INTEGER NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_profile_details (
                user_email TEXT PRIMARY KEY,
                phone TEXT,
                agency_name TEXT,
                location_name TEXT,
                manager_name TEXT,
                professional_title TEXT,
                employee_reference TEXT,
                employment_start_date TEXT,
                last_reviewed_at TEXT,
                next_review_due_date TEXT,
                certifications_notes TEXT,
                authorizations_notes TEXT,
                training_notes TEXT,
                documents_notes TEXT,
                profile_notes TEXT,
                signature_display_name TEXT,
                signature_role_title TEXT,
                signature_image_data TEXT,
                signature_notes TEXT,
                signature_scale_percent INTEGER NOT NULL DEFAULT 100,
                signature_offset_x INTEGER NOT NULL DEFAULT 0,
                signature_offset_y INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
            )
            """
        )
        connection.executemany(
            """
            INSERT OR IGNORE INTO employment_levels (employment_level_code, label, sort_order)
            VALUES (?, ?, ?)
            """,
            EMPLOYMENT_LEVELS,
        )

        user_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(users)").fetchall()
        }
        profile_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(user_profile_details)").fetchall()
        }
        if "employment_level_code" not in user_columns:
            connection.execute("ALTER TABLE users ADD COLUMN employment_level_code TEXT")
        for column_name in (
            "signature_display_name",
            "signature_role_title",
            "signature_image_data",
            "signature_notes",
        ):
            if column_name not in profile_columns:
                connection.execute(f"ALTER TABLE user_profile_details ADD COLUMN {column_name} TEXT")
        numeric_profile_columns = {
            "signature_scale_percent": "INTEGER NOT NULL DEFAULT 100",
            "signature_offset_x": "INTEGER NOT NULL DEFAULT 0",
            "signature_offset_y": "INTEGER NOT NULL DEFAULT 0",
        }
        for column_name, ddl_tail in numeric_profile_columns.items():
            if column_name not in profile_columns:
                connection.execute(f"ALTER TABLE user_profile_details ADD COLUMN {column_name} {ddl_tail}")

        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_users_employment_level_code ON users(employment_level_code)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_profile_details_agency_name ON user_profile_details(agency_name)"
        )
        connection.commit()

    def list_active_users(self) -> list[sqlite3.Row]:
        query = """
            SELECT
                users.email,
                users.display_name,
                users.role_code,
                users.service_code,
                users.is_active,
                users.employment_level_code,
                employment_levels.label AS employment_level_label,
                employment_levels.sort_order AS employment_level_sort_order
            FROM users
            LEFT JOIN employment_levels
                ON employment_levels.employment_level_code = users.employment_level_code
            WHERE users.is_active = 1
            ORDER BY COALESCE(employment_levels.sort_order, 9999), users.display_name COLLATE NOCASE
        """

        with self._connect() as connection:
            return connection.execute(query).fetchall()

    def list_all_users(self) -> list[sqlite3.Row]:
        query = """
            SELECT
                users.email,
                users.display_name,
                users.role_code,
                users.service_code,
                users.is_active,
                users.employment_level_code,
                employment_levels.label AS employment_level_label,
                employment_levels.sort_order AS employment_level_sort_order
            FROM users
            LEFT JOIN employment_levels
                ON employment_levels.employment_level_code = users.employment_level_code
            ORDER BY COALESCE(employment_levels.sort_order, 9999), users.display_name COLLATE NOCASE
        """

        with self._connect() as connection:
            return connection.execute(query).fetchall()

    def list_roles(self) -> list[sqlite3.Row]:
        query = """
            SELECT
                role_code,
                label
            FROM roles
            ORDER BY role_code
        """

        with self._connect() as connection:
            return connection.execute(query).fetchall()

    def list_employment_levels(self) -> list[sqlite3.Row]:
        query = """
            SELECT
                employment_level_code,
                label,
                sort_order
            FROM employment_levels
            ORDER BY sort_order, label COLLATE NOCASE
        """

        with self._connect() as connection:
            return connection.execute(query).fetchall()

    def list_permissions(self) -> list[sqlite3.Row]:
        query = """
            SELECT
                permission_code,
                label
            FROM permissions
            ORDER BY permission_code
        """

        with self._connect() as connection:
            return connection.execute(query).fetchall()

    def list_service_codes(self) -> list[str]:
        query = """
            SELECT service_code
            FROM sharepoint_contexts
            WHERE is_active = 1
            ORDER BY service_code
        """

        with self._connect() as connection:
            rows = connection.execute(query).fetchall()

        return [row["service_code"] for row in rows]

    def list_sharepoint_contexts(self) -> list[sqlite3.Row]:
        query = """
            SELECT
                service_code,
                site_name,
                library_name,
                base_path,
                is_active
            FROM sharepoint_contexts
            ORDER BY service_code
        """

        with self._connect() as connection:
            return connection.execute(query).fetchall()

    def get_user_by_email(self, email: str) -> sqlite3.Row | None:
        query = """
            SELECT
                users.email,
                users.display_name,
                users.role_code,
                users.service_code,
                users.is_active,
                users.employment_level_code,
                employment_levels.label AS employment_level_label,
                employment_levels.sort_order AS employment_level_sort_order
            FROM users
            LEFT JOIN employment_levels
                ON employment_levels.employment_level_code = users.employment_level_code
            WHERE lower(users.email) = lower(?)
            LIMIT 1
        """

        with self._connect() as connection:
            return connection.execute(query, (email,)).fetchone()

    def get_employment_level(self, employment_level_code: str) -> sqlite3.Row | None:
        query = """
            SELECT employment_level_code, label, sort_order
            FROM employment_levels
            WHERE employment_level_code = ?
            LIMIT 1
        """

        with self._connect() as connection:
            return connection.execute(query, (employment_level_code.strip(),)).fetchone()

    def get_user_profile(self, email: str) -> sqlite3.Row | None:
        query = """
            SELECT
                user_email,
                phone,
                agency_name,
                location_name,
                manager_name,
                professional_title,
                employee_reference,
                employment_start_date,
                last_reviewed_at,
                next_review_due_date,
                certifications_notes,
                authorizations_notes,
                training_notes,
                documents_notes,
                profile_notes,
                signature_display_name,
                signature_role_title,
                signature_image_data,
                signature_notes,
                signature_scale_percent,
                signature_offset_x,
                signature_offset_y,
                created_at,
                updated_at
            FROM user_profile_details
            WHERE lower(user_email) = lower(?)
            LIMIT 1
        """

        with self._connect() as connection:
            return connection.execute(query, (email.strip().lower(),)).fetchone()

    def upsert_user_profile(
        self,
        *,
        user_email: str,
        phone: str | None = None,
        agency_name: str | None = None,
        location_name: str | None = None,
        manager_name: str | None = None,
        professional_title: str | None = None,
        employee_reference: str | None = None,
        employment_start_date: str | None = None,
        last_reviewed_at: str | None = None,
        next_review_due_date: str | None = None,
        certifications_notes: str | None = None,
        authorizations_notes: str | None = None,
        training_notes: str | None = None,
        documents_notes: str | None = None,
        profile_notes: str | None = None,
        signature_display_name: str | None = None,
        signature_role_title: str | None = None,
        signature_image_data: str | None = None,
        signature_notes: str | None = None,
        signature_scale_percent: int | None = None,
        signature_offset_x: int | None = None,
        signature_offset_y: int | None = None,
    ) -> None:
        def normalized(value: str | None) -> str | None:
            if value is None:
                return None
            cleaned = value.strip()
            return cleaned or None

        def normalized_integer(value: int | str | None, fallback: int) -> int:
            if value is None:
                return fallback
            try:
                return int(value)
            except (TypeError, ValueError):
                return fallback

        query = """
            INSERT INTO user_profile_details (
                user_email,
                phone,
                agency_name,
                location_name,
                manager_name,
                professional_title,
                employee_reference,
                employment_start_date,
                last_reviewed_at,
                next_review_due_date,
                certifications_notes,
                authorizations_notes,
                training_notes,
                documents_notes,
                profile_notes,
                signature_display_name,
                signature_role_title,
                signature_image_data,
                signature_notes,
                signature_scale_percent,
                signature_offset_x,
                signature_offset_y,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(user_email) DO UPDATE SET
                phone = excluded.phone,
                agency_name = excluded.agency_name,
                location_name = excluded.location_name,
                manager_name = excluded.manager_name,
                professional_title = excluded.professional_title,
                employee_reference = excluded.employee_reference,
                employment_start_date = excluded.employment_start_date,
                last_reviewed_at = excluded.last_reviewed_at,
                next_review_due_date = excluded.next_review_due_date,
                certifications_notes = excluded.certifications_notes,
                authorizations_notes = excluded.authorizations_notes,
                training_notes = excluded.training_notes,
                documents_notes = excluded.documents_notes,
                profile_notes = excluded.profile_notes,
                signature_display_name = excluded.signature_display_name,
                signature_role_title = excluded.signature_role_title,
                signature_image_data = excluded.signature_image_data,
                signature_notes = excluded.signature_notes,
                signature_scale_percent = excluded.signature_scale_percent,
                signature_offset_x = excluded.signature_offset_x,
                signature_offset_y = excluded.signature_offset_y,
                updated_at = CURRENT_TIMESTAMP
        """

        with self._connect() as connection:
            connection.execute(
                query,
                (
                    user_email.strip().lower(),
                    normalized(phone),
                    normalized(agency_name),
                    normalized(location_name),
                    normalized(manager_name),
                    normalized(professional_title),
                    normalized(employee_reference),
                    normalized(employment_start_date),
                    normalized(last_reviewed_at),
                    normalized(next_review_due_date),
                    normalized(certifications_notes),
                    normalized(authorizations_notes),
                    normalized(training_notes),
                    normalized(documents_notes),
                    normalized(profile_notes),
                    normalized(signature_display_name),
                    normalized(signature_role_title),
                    normalized(signature_image_data),
                    normalized(signature_notes),
                    normalized_integer(signature_scale_percent, 100),
                    normalized_integer(signature_offset_x, 0),
                    normalized_integer(signature_offset_y, 0),
                ),
            )
            connection.commit()

    def get_role_by_code(self, role_code: str) -> sqlite3.Row | None:
        query = """
            SELECT role_code, label
            FROM roles
            WHERE role_code = ?
            LIMIT 1
        """

        with self._connect() as connection:
            return connection.execute(query, (role_code,)).fetchone()

    def get_permissions_for_role(self, role_code: str) -> list[str]:
        query = """
            SELECT rp.permission_code
            FROM role_permissions rp
            WHERE rp.role_code = ?
            ORDER BY rp.permission_code
        """

        with self._connect() as connection:
            rows = connection.execute(query, (role_code,)).fetchall()

        return [row["permission_code"] for row in rows]

    def get_sharepoint_context(self, service_code: str) -> dict[str, str]:
        query = """
            SELECT
                service_code,
                site_name,
                library_name,
                base_path
            FROM sharepoint_contexts
            WHERE service_code = ?
              AND is_active = 1
            LIMIT 1
        """

        with self._connect() as connection:
            row = connection.execute(query, (service_code,)).fetchone()

        if row is None:
            return {
                "service_code": service_code,
                "site_name": "NGE-RaLab",
                "library_name": "RaLab",
                "base_path": "/Documents",
            }

        return {
            "service_code": row["service_code"],
            "site_name": row["site_name"],
            "library_name": row["library_name"],
            "base_path": row["base_path"],
        }

    def upsert_user(
        self,
        email: str,
        display_name: str,
        role_code: str,
        service_code: str,
        is_active: bool,
        employment_level_code: str | None = None,
    ) -> None:
        normalized_email = email.strip().lower()
        normalized_employment_level_code = employment_level_code.strip() if employment_level_code else None

        query = """
            INSERT INTO users (
                email,
                display_name,
                role_code,
                service_code,
                is_active,
                employment_level_code,
                created_at,
                updated_at
            )
            VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT(email) DO UPDATE SET
                display_name = excluded.display_name,
                role_code = excluded.role_code,
                service_code = excluded.service_code,
                is_active = excluded.is_active,
                employment_level_code = excluded.employment_level_code,
                updated_at = CURRENT_TIMESTAMP
        """

        with self._connect() as connection:
            connection.execute(
                query,
                (
                    normalized_email,
                    display_name.strip(),
                    role_code.strip(),
                    service_code.strip(),
                    1 if is_active else 0,
                    normalized_employment_level_code,
                ),
            )
            connection.commit()

    def set_user_active(self, email: str, is_active: bool) -> None:
        query = """
            UPDATE users
            SET
                is_active = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE lower(email) = lower(?)
        """

        with self._connect() as connection:
            connection.execute(query, (1 if is_active else 0, email.strip().lower()))
            connection.commit()

    def upsert_role(self, role_code: str, label: str) -> None:
        query = """
            INSERT INTO roles (role_code, label)
            VALUES (?, ?)
            ON CONFLICT(role_code) DO UPDATE SET
                label = excluded.label
        """

        with self._connect() as connection:
            connection.execute(query, (role_code.strip(), label.strip()))
            connection.commit()

    def replace_role_permissions(self, role_code: str, permission_codes: list[str]) -> None:
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM role_permissions WHERE role_code = ?",
                (role_code.strip(),),
            )

            rows = [(role_code.strip(), permission_code.strip()) for permission_code in permission_codes]
            connection.executemany(
                """
                INSERT INTO role_permissions (role_code, permission_code)
                VALUES (?, ?)
                """,
                rows,
            )
            connection.commit()

    def upsert_permission(self, permission_code: str, label: str) -> None:
        query = """
            INSERT INTO permissions (permission_code, label)
            VALUES (?, ?)
            ON CONFLICT(permission_code) DO UPDATE SET
                label = excluded.label
        """

        with self._connect() as connection:
            connection.execute(query, (permission_code.strip(), label.strip()))
            connection.commit()

    def upsert_sharepoint_context(
        self,
        service_code: str,
        site_name: str,
        library_name: str,
        base_path: str,
        is_active: bool,
    ) -> None:
        query = """
            INSERT INTO sharepoint_contexts (
                service_code,
                site_name,
                library_name,
                base_path,
                is_active
            )
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(service_code) DO UPDATE SET
                site_name = excluded.site_name,
                library_name = excluded.library_name,
                base_path = excluded.base_path,
                is_active = excluded.is_active
        """

        with self._connect() as connection:
            connection.execute(
                query,
                (
                    service_code.strip(),
                    site_name.strip(),
                    library_name.strip(),
                    base_path.strip(),
                    1 if is_active else 0,
                ),
            )
            connection.commit()

    def set_sharepoint_context_active(self, service_code: str, is_active: bool) -> None:
        query = """
            UPDATE sharepoint_contexts
            SET is_active = ?
            WHERE service_code = ?
        """

        with self._connect() as connection:
            connection.execute(
                query,
                (1 if is_active else 0, service_code.strip()),
            )
            connection.commit()