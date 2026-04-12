from pathlib import Path
import sqlite3
import sys


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.repositories.competency_repository import COMPETENCY_LEVELS


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
        seed_employment_levels(connection)
        seed_competency_levels(connection)
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

    CREATE TABLE IF NOT EXISTS employment_levels (
        employment_level_code TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        sort_order INTEGER NOT NULL
    );

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
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
    );

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

    CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        role_code TEXT NOT NULL,
        service_code TEXT NOT NULL,
        employment_level_code TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (role_code) REFERENCES roles(role_code)
    );

    CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
    CREATE INDEX IF NOT EXISTS idx_users_role_code ON users(role_code);
    CREATE INDEX IF NOT EXISTS idx_users_service_code ON users(service_code);
    CREATE INDEX IF NOT EXISTS idx_users_employment_level_code ON users(employment_level_code);
        CREATE INDEX IF NOT EXISTS idx_competency_catalog_domain ON competency_catalog(domain);
        CREATE INDEX IF NOT EXISTS idx_competency_catalog_context_type ON competency_catalog(context_type);
        CREATE INDEX IF NOT EXISTS idx_competency_catalog_active ON competency_catalog(is_active);
        CREATE INDEX IF NOT EXISTS idx_user_profile_details_agency_name ON user_profile_details(agency_name);
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


def seed_employment_levels(connection: sqlite3.Connection) -> None:
    rows = [
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
    ]

    connection.executemany(
        """
        INSERT OR IGNORE INTO employment_levels (employment_level_code, label, sort_order)
        VALUES (?, ?, ?)
        """,
        rows,
    )


def seed_competency_levels(connection: sqlite3.Connection) -> None:
    connection.executemany(
        """
        INSERT OR IGNORE INTO competency_levels (level_code, sort_order, label, description)
        VALUES (?, ?, ?, ?)
        """,
        COMPETENCY_LEVELS,
    )


def seed_users(connection: sqlite3.Connection) -> None:
    rows = [
        ("marco@nge.fr", "Marco Costa Pereira", "admin", "rst", "referent_scientifique_technique", 1),
        ("mcostapereira@nge.fr", "ResponsableScientifique et Technique", "admin", "rst", "referent_scientifique_technique", 1),
        ("labo@nge.fr", "Utilisateur Laboratoire", "labo", "labo", None, 1),
        ("cchadeyras@guintoli.fr", "Christelle CHADEYRAS", "labo", "AUV", "chef_section_laboratoire", 1),
        ("cslhopital@guintoli.fr", "Sylvain LHOPITAL", "labo", "SP", "chef_section_laboratoire", 1),
        ("etudes@nge.fr", "Utilisateur Études", "etudes", "etudes", None, 1),
        ("consult@nge.fr", "Utilisateur Consultation", "consult", "consultation", None, 1),
    ]

    connection.executemany(
        """
        INSERT OR IGNORE INTO users (
            email,
            display_name,
            role_code,
            service_code,
            employment_level_code,
            is_active
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


if __name__ == "__main__":
    main()