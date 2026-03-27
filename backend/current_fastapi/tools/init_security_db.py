from pathlib import Path
import sqlite3
import sys


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


DATA_DIR = ROOT_DIR / "data"
DB_PATH = DATA_DIR / "security.db"


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(DB_PATH)
    connection.execute("PRAGMA foreign_keys = ON")

    try:
        create_schema(connection)
        seed_roles(connection)
        seed_permissions(connection)
        seed_role_permissions(connection)
        seed_sharepoint_contexts(connection)
        seed_users(connection)
        connection.commit()
    finally:
        connection.close()

    print(f"[OK] security.db initialisée : {DB_PATH}")


def create_schema(connection: sqlite3.Connection) -> None:
    schema = """
    CREATE TABLE IF NOT EXISTS roles (
        role_code TEXT PRIMARY KEY,
        label TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
        permission_code TEXT PRIMARY KEY,
        label TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
        role_code TEXT NOT NULL,
        permission_code TEXT NOT NULL,
        PRIMARY KEY (role_code, permission_code),
        FOREIGN KEY (role_code) REFERENCES roles(role_code) ON DELETE CASCADE,
        FOREIGN KEY (permission_code) REFERENCES permissions(permission_code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sharepoint_contexts (
        service_code TEXT PRIMARY KEY,
        site_name TEXT NOT NULL,
        library_name TEXT NOT NULL,
        base_path TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        role_code TEXT NOT NULL,
        service_code TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (role_code) REFERENCES roles(role_code)
    );

    CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
    CREATE INDEX IF NOT EXISTS idx_users_role_code ON users(role_code);
    CREATE INDEX IF NOT EXISTS idx_users_service_code ON users(service_code);
    """
    connection.executescript(schema)


def seed_roles(connection: sqlite3.Connection) -> None:
    rows = [
        ("admin", "Administrateur"),
        ("labo", "Laboratoire"),
        ("etudes", "Études"),
        ("consult", "Consultation"),
    ]

    connection.executemany(
        """
        INSERT OR IGNORE INTO roles (role_code, label)
        VALUES (?, ?)
        """,
        rows,
    )


def seed_permissions(connection: sqlite3.Connection) -> None:
    rows = [
        ("view_dashboard", "Voir le dashboard"),
        ("view_demandes", "Voir les demandes"),
        ("view_labo", "Voir le laboratoire"),
        ("view_planning", "Voir le planning"),
        ("view_etudes", "Voir les études"),
        ("view_tools", "Voir la zone outils"),
        ("view_settings", "Voir les paramètres"),
        ("manage_users", "Gérer les utilisateurs"),
        ("sharepoint_ro", "SharePoint lecture"),
        ("sharepoint_rw", "SharePoint lecture / écriture"),
    ]

    connection.executemany(
        """
        INSERT OR IGNORE INTO permissions (permission_code, label)
        VALUES (?, ?)
        """,
        rows,
    )


def seed_role_permissions(connection: sqlite3.Connection) -> None:
    rows = [
        ("admin", "view_dashboard"),
        ("admin", "view_demandes"),
        ("admin", "view_labo"),
        ("admin", "view_planning"),
        ("admin", "view_etudes"),
        ("admin", "view_tools"),
        ("admin", "view_settings"),
        ("admin", "manage_users"),
        ("admin", "sharepoint_rw"),

        ("labo", "view_dashboard"),
        ("labo", "view_demandes"),
        ("labo", "view_labo"),
        ("labo", "view_planning"),
        ("labo", "sharepoint_rw"),

        ("etudes", "view_dashboard"),
        ("etudes", "view_demandes"),
        ("etudes", "view_planning"),
        ("etudes", "view_etudes"),
        ("etudes", "sharepoint_ro"),

        ("consult", "view_dashboard"),
        ("consult", "view_demandes"),
    ]

    connection.executemany(
        """
        INSERT OR IGNORE INTO role_permissions (role_code, permission_code)
        VALUES (?, ?)
        """,
        rows,
    )


def seed_sharepoint_contexts(connection: sqlite3.Connection) -> None:
    rows = [
        ("rst", "NGE-RaLab-RST", "RaLab", "/Documents/RST", 1),
        ("labo", "NGE-RaLab-Laboratoire", "RaLab", "/Documents/Laboratoire", 1),
        ("etudes", "NGE-RaLab-Etudes", "RaLab", "/Documents/Etudes", 1),
        ("consultation", "NGE-RaLab-Consultation", "RaLab", "/Documents/Consultation", 1),
    ]

    connection.executemany(
        """
        INSERT OR IGNORE INTO sharepoint_contexts (
            service_code,
            site_name,
            library_name,
            base_path,
            is_active
        )
        VALUES (?, ?, ?, ?, ?)
        """,
        rows,
    )


def seed_users(connection: sqlite3.Connection) -> None:
    rows = [
        ("marco@nge.fr", "Marco Costa Pereira", "admin", "rst", 1),
        ("labo@nge.fr", "Utilisateur Laboratoire", "labo", "labo", 1),
        ("etudes@nge.fr", "Utilisateur Études", "etudes", "etudes", 1),
        ("consult@nge.fr", "Utilisateur Consultation", "consult", "consultation", 1),
    ]

    connection.executemany(
        """
        INSERT OR IGNORE INTO users (
            email,
            display_name,
            role_code,
            service_code,
            is_active
        )
        VALUES (?, ?, ?, ?, ?)
        """,
        rows,
    )


if __name__ == "__main__":
    main()