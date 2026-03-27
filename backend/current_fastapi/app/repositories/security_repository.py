from pathlib import Path
import sqlite3


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
        return connection

    def list_active_users(self) -> list[sqlite3.Row]:
        query = """
            SELECT
                email,
                display_name,
                role_code,
                service_code,
                is_active
            FROM users
            WHERE is_active = 1
            ORDER BY display_name COLLATE NOCASE
        """

        with self._connect() as connection:
            return connection.execute(query).fetchall()

    def list_all_users(self) -> list[sqlite3.Row]:
        query = """
            SELECT
                email,
                display_name,
                role_code,
                service_code,
                is_active
            FROM users
            ORDER BY display_name COLLATE NOCASE
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
                email,
                display_name,
                role_code,
                service_code,
                is_active
            FROM users
            WHERE lower(email) = lower(?)
            LIMIT 1
        """

        with self._connect() as connection:
            return connection.execute(query, (email,)).fetchone()

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
    ) -> None:
        normalized_email = email.strip().lower()

        query = """
            INSERT INTO users (
                email,
                display_name,
                role_code,
                service_code,
                is_active,
                created_at,
                updated_at
            )
            VALUES (
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