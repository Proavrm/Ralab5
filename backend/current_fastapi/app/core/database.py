"""
app/core/database.py
Shared database helpers for RaLab4.
"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "data"
DEFAULT_DB_NAME = "ralab3.db"

PASSATION_DDL = """
CREATE TABLE IF NOT EXISTS laboratoires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'RA',
    actif INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS passations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    affaire_rst_id INTEGER NOT NULL REFERENCES affaires_rst(id) ON DELETE RESTRICT,
    date_passation TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    operation_type TEXT NOT NULL DEFAULT '',
    phase_operation TEXT NOT NULL DEFAULT '',
    numero_etude TEXT NOT NULL DEFAULT '',
    numero_affaire_nge TEXT NOT NULL DEFAULT '',
    chantier TEXT NOT NULL DEFAULT '',
    client TEXT NOT NULL DEFAULT '',
    entreprise_responsable TEXT NOT NULL DEFAULT '',
    agence TEXT NOT NULL DEFAULT '',
    responsable TEXT NOT NULL DEFAULT '',
    description_generale TEXT NOT NULL DEFAULT '',
    contexte_marche TEXT NOT NULL DEFAULT '',
    interlocuteurs_principaux TEXT NOT NULL DEFAULT '',
    points_sensibles TEXT NOT NULL DEFAULT '',
    besoins_laboratoire TEXT NOT NULL DEFAULT '',
    besoins_terrain TEXT NOT NULL DEFAULT '',
    besoins_etude TEXT NOT NULL DEFAULT '',
    besoins_g3 TEXT NOT NULL DEFAULT '',
    besoins_essais_externes TEXT NOT NULL DEFAULT '',
    besoins_equipements_specifiques TEXT NOT NULL DEFAULT '',
    besoins_ressources_humaines TEXT NOT NULL DEFAULT '',
    synthese TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS passation_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    passation_id INTEGER NOT NULL REFERENCES passations(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL DEFAULT '',
    is_received INTEGER NOT NULL DEFAULT 0,
    version TEXT NOT NULL DEFAULT '',
    document_date TEXT,
    comment TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS passation_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    passation_id INTEGER NOT NULL REFERENCES passations(id) ON DELETE CASCADE,
    action_label TEXT NOT NULL DEFAULT '',
    responsable TEXT NOT NULL DEFAULT '',
    echeance TEXT,
    priorite TEXT NOT NULL DEFAULT 'Normale',
    statut TEXT NOT NULL DEFAULT 'À lancer',
    commentaire TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_passations_affaire ON passations(affaire_rst_id);
CREATE INDEX IF NOT EXISTS idx_passations_date ON passations(date_passation);
CREATE INDEX IF NOT EXISTS idx_passation_documents_passation ON passation_documents(passation_id);
CREATE INDEX IF NOT EXISTS idx_passation_actions_passation ON passation_actions(passation_id);
"""

DEMANDE_CONFIGURATION_DDL = """
CREATE TABLE IF NOT EXISTS demande_preparations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demande_id INTEGER NOT NULL UNIQUE REFERENCES demandes(id) ON DELETE CASCADE,
    phase_operation TEXT NOT NULL DEFAULT 'À qualifier',
    contexte_operationnel TEXT NOT NULL DEFAULT '',
    objectifs TEXT NOT NULL DEFAULT '',
    points_vigilance TEXT NOT NULL DEFAULT '',
    contraintes_acces TEXT NOT NULL DEFAULT '',
    contraintes_delais TEXT NOT NULL DEFAULT '',
    contraintes_hse TEXT NOT NULL DEFAULT '',
    attentes_client TEXT NOT NULL DEFAULT '',
    programme_previsionnel TEXT NOT NULL DEFAULT '',
    ressources_notes TEXT NOT NULL DEFAULT '',
    commentaires TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS demande_enabled_modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demande_id INTEGER NOT NULL REFERENCES demandes(id) ON DELETE CASCADE,
    module_code TEXT NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(demande_id, module_code)
);

CREATE INDEX IF NOT EXISTS idx_demande_preparations_demande ON demande_preparations(demande_id);
CREATE INDEX IF NOT EXISTS idx_demande_enabled_modules_demande ON demande_enabled_modules(demande_id);
"""

INTERVENTION_REQUALIFICATION_DDL = """
CREATE TABLE IF NOT EXISTS prelevements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    demande_id INTEGER REFERENCES demandes(id) ON DELETE SET NULL,
    intervention_reelle_id INTEGER,
    source_year INTEGER,
    date_prelevement TEXT NOT NULL DEFAULT '',
    date_reception_labo TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    quantite TEXT NOT NULL DEFAULT '',
    receptionnaire TEXT NOT NULL DEFAULT '',
    zone TEXT NOT NULL DEFAULT '',
    materiau TEXT NOT NULL DEFAULT '',
    technicien TEXT NOT NULL DEFAULT '',
    finalite TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    statut TEXT NOT NULL DEFAULT 'À trier',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interventions_reelles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    demande_id INTEGER REFERENCES demandes(id) ON DELETE SET NULL,
    source_year INTEGER,
    date_intervention TEXT NOT NULL DEFAULT '',
    type_intervention TEXT NOT NULL DEFAULT '',
    zone TEXT NOT NULL DEFAULT '',
    technicien TEXT NOT NULL DEFAULT '',
    finalite TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    statut TEXT NOT NULL DEFAULT 'À trier',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prelevements_demande ON prelevements(demande_id);
CREATE INDEX IF NOT EXISTS idx_prelevements_intervention_reelle ON prelevements(intervention_reelle_id);
CREATE INDEX IF NOT EXISTS idx_interventions_reelles_demande ON interventions_reelles(demande_id);
"""

INTERVENTION_CAMPAIGN_DDL = """
CREATE TABLE IF NOT EXISTS intervention_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demande_id INTEGER NOT NULL REFERENCES demandes(id) ON DELETE CASCADE,
    code TEXT NOT NULL DEFAULT '',
    reference TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT 'Campagne',
    designation TEXT NOT NULL DEFAULT '',
    zone_scope TEXT NOT NULL DEFAULT '',
    temporalite TEXT NOT NULL DEFAULT '',
    workflow_label TEXT NOT NULL DEFAULT '',
    source_mode TEXT NOT NULL DEFAULT '',
    source_label TEXT NOT NULL DEFAULT '',
    target_mode TEXT NOT NULL DEFAULT '',
    target_label TEXT NOT NULL DEFAULT '',
    statut TEXT NOT NULL DEFAULT 'Active',
    notes TEXT NOT NULL DEFAULT '',
    legacy_source_kind TEXT NOT NULL DEFAULT '',
    legacy_source_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_intervention_campaigns_demande ON intervention_campaigns(demande_id);
CREATE INDEX IF NOT EXISTS idx_intervention_campaigns_legacy ON intervention_campaigns(legacy_source_kind, legacy_source_id);
"""

PMT_WORKFLOW_DDL = """
CREATE TABLE IF NOT EXISTS pmt_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demande_id INTEGER NOT NULL REFERENCES demandes(id) ON DELETE CASCADE,
    code TEXT NOT NULL DEFAULT 'PMT',
    reference TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT 'Campagne PMT',
    designation TEXT NOT NULL DEFAULT 'Macrotexture de chaussee',
    workflow_label TEXT NOT NULL DEFAULT 'Campagne -> Preparation de l''intervention -> Intervention -> Essai PMT -> Rapport',
    source_mode TEXT NOT NULL DEFAULT 'historique_importe',
    target_mode TEXT NOT NULL DEFAULT 'manuel',
    statut TEXT NOT NULL DEFAULT 'Active',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(demande_id, code)
);

CREATE TABLE IF NOT EXISTS pmt_campaign_interventions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES pmt_campaigns(id) ON DELETE CASCADE,
    intervention_id INTEGER NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(campaign_id, intervention_id),
    UNIQUE(intervention_id)
);

CREATE TABLE IF NOT EXISTS pmt_essais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES pmt_campaigns(id) ON DELETE CASCADE,
    demande_id INTEGER NOT NULL REFERENCES demandes(id) ON DELETE CASCADE,
    intervention_id INTEGER NOT NULL UNIQUE REFERENCES interventions(id) ON DELETE CASCADE,
    reference TEXT NOT NULL UNIQUE,
    statut TEXT NOT NULL DEFAULT 'Brouillon',
    date_essai TEXT NOT NULL DEFAULT '',
    operateur TEXT NOT NULL DEFAULT '',
    section_controlee TEXT NOT NULL DEFAULT '',
    voie TEXT NOT NULL DEFAULT '',
    sens TEXT NOT NULL DEFAULT '',
    couche TEXT NOT NULL DEFAULT '',
    nature_support TEXT NOT NULL DEFAULT '',
    observations TEXT NOT NULL DEFAULT '',
    resultats_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pmt_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES pmt_campaigns(id) ON DELETE CASCADE,
    essai_id INTEGER REFERENCES pmt_essais(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    reference TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    statut TEXT NOT NULL DEFAULT 'A completer',
    summary TEXT NOT NULL DEFAULT '',
    conclusions TEXT NOT NULL DEFAULT '',
    generated_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pmt_campaigns_demande ON pmt_campaigns(demande_id);
CREATE INDEX IF NOT EXISTS idx_pmt_campaign_interventions_campaign ON pmt_campaign_interventions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pmt_reports_campaign ON pmt_reports(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pmt_reports_essai ON pmt_reports(essai_id);
"""

DEFAULT_LABS = [
    ("SP", "Saint-Priest", "RA"),
    ("PDC", "Pont-du-Château", "AUV"),
    ("CHB", "Chambéry", "RA"),
    ("CLM", "Clermont-Ferrand", "AUV"),
]


def get_db_path() -> Path:
    env_path = os.environ.get("RALAB4_DB_PATH", "").strip()
    if env_path:
        return Path(env_path)
    return DATA_DIR / DEFAULT_DB_NAME


def connect_db(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or get_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {str(row[1]) for row in rows}


def _ensure_column(conn: sqlite3.Connection, table_name: str, column_name: str, ddl_tail: str) -> None:
    if column_name in _table_columns(conn, table_name):
        return
    conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl_tail}")


def _index_columns(conn: sqlite3.Connection, index_name: str) -> list[str]:
    return [str(row[2]) for row in conn.execute(f"PRAGMA index_info({index_name})").fetchall()]


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def _has_unique_index(conn: sqlite3.Connection, table_name: str, columns: list[str]) -> bool:
    rows = conn.execute(f"PRAGMA index_list({table_name})").fetchall()
    for row in rows:
        if not bool(row[2]):
            continue
        index_name = str(row[1])
        if _index_columns(conn, index_name) == columns:
            return True
    return False


def _ensure_pmt_multi_essais_schema(conn: sqlite3.Connection) -> None:
    if not _has_unique_index(conn, "pmt_essais", ["intervention_id"]):
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pmt_essais_campaign ON pmt_essais(campaign_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pmt_essais_intervention ON pmt_essais(intervention_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pmt_essais_demande ON pmt_essais(demande_id)")
        return

    conn.execute("PRAGMA foreign_keys = OFF")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS pmt_essais__new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL REFERENCES pmt_campaigns(id) ON DELETE CASCADE,
            demande_id INTEGER NOT NULL REFERENCES demandes(id) ON DELETE CASCADE,
            intervention_id INTEGER NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
            reference TEXT NOT NULL UNIQUE,
            statut TEXT NOT NULL DEFAULT 'Brouillon',
            date_essai TEXT NOT NULL DEFAULT '',
            operateur TEXT NOT NULL DEFAULT '',
            section_controlee TEXT NOT NULL DEFAULT '',
            voie TEXT NOT NULL DEFAULT '',
            sens TEXT NOT NULL DEFAULT '',
            couche TEXT NOT NULL DEFAULT '',
            nature_support TEXT NOT NULL DEFAULT '',
            observations TEXT NOT NULL DEFAULT '',
            resultats_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT INTO pmt_essais__new (
            id, campaign_id, demande_id, intervention_id, reference, statut, date_essai,
            operateur, section_controlee, voie, sens, couche, nature_support,
            observations, resultats_json, created_at, updated_at
        )
        SELECT
            id, campaign_id, demande_id, intervention_id, reference, statut, date_essai,
            operateur, section_controlee, voie, sens, couche, nature_support,
            observations, resultats_json, created_at, updated_at
        FROM pmt_essais;

        DROP TABLE pmt_essais;
        ALTER TABLE pmt_essais__new RENAME TO pmt_essais;
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pmt_essais_campaign ON pmt_essais(campaign_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pmt_essais_intervention ON pmt_essais(intervention_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pmt_essais_demande ON pmt_essais(demande_id)")
    conn.execute("PRAGMA foreign_keys = ON")


def _ensure_generic_essais_parent_schema(conn: sqlite3.Connection) -> None:
    if not _table_exists(conn, "essais"):
        return

    cols = {str(row[1]): row for row in conn.execute("PRAGMA table_info(essais)").fetchall()}
    has_intervention_id = "intervention_id" in cols
    has_source_signature = "source_signature" in cols
    has_source_label = "source_label" in cols
    echantillon_is_nullable = bool(cols) and int(cols["echantillon_id"][3]) == 0 if "echantillon_id" in cols else True

    if has_intervention_id and has_source_signature and has_source_label and echantillon_is_nullable:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_essais_echantillon_id ON essais(echantillon_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_essais_intervention_id ON essais(intervention_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_essais_source_signature ON essais(source_signature)")
        return

    conn.execute("PRAGMA foreign_keys = OFF")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS essais__new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            echantillon_id INTEGER REFERENCES echantillons(id) ON DELETE RESTRICT,
            intervention_id INTEGER REFERENCES interventions(id) ON DELETE CASCADE,
            essai_code TEXT NOT NULL DEFAULT '',
            type_essai TEXT NOT NULL DEFAULT '',
            norme TEXT NOT NULL DEFAULT '',
            statut TEXT NOT NULL DEFAULT 'Programmé',
            date_debut TEXT,
            date_fin TEXT,
            resultats TEXT NOT NULL DEFAULT '{}',
            operateur TEXT NOT NULL DEFAULT '',
            observations TEXT NOT NULL DEFAULT '',
            source_signature TEXT NOT NULL DEFAULT '',
            source_label TEXT NOT NULL DEFAULT '',
            resultat_principal REAL,
            resultat_unite TEXT NOT NULL DEFAULT '',
            resultat_label TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            CHECK (echantillon_id IS NOT NULL OR intervention_id IS NOT NULL)
        );

        INSERT INTO essais__new (
            id, echantillon_id, intervention_id, essai_code, type_essai, norme, statut,
            date_debut, date_fin, resultats, operateur, observations, source_signature,
            source_label, resultat_principal, resultat_unite, resultat_label, created_at, updated_at
        )
        SELECT
            id,
            echantillon_id,
            NULL AS intervention_id,
            COALESCE(essai_code, '') AS essai_code,
            COALESCE(type_essai, '') AS type_essai,
            COALESCE(norme, '') AS norme,
            COALESCE(statut, 'Programmé') AS statut,
            date_debut,
            date_fin,
            COALESCE(resultats, '{}') AS resultats,
            COALESCE(operateur, '') AS operateur,
            COALESCE(observations, '') AS observations,
            '' AS source_signature,
            '' AS source_label,
            resultat_principal,
            COALESCE(resultat_unite, '') AS resultat_unite,
            COALESCE(resultat_label, '') AS resultat_label,
            created_at,
            updated_at
        FROM essais;

        DROP TABLE essais;
        ALTER TABLE essais__new RENAME TO essais;
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_essais_echantillon_id ON essais(echantillon_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_essais_intervention_id ON essais(intervention_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_essais_source_signature ON essais(source_signature)")
    conn.execute("PRAGMA foreign_keys = ON")


def _create_intervention_creation_candidates_view(conn: sqlite3.Connection) -> None:
    conn.execute("DROP VIEW IF EXISTS vw_intervention_creation_candidates")
    conn.execute(
        """
        CREATE VIEW vw_intervention_creation_candidates AS
        SELECT
            'prelevement' AS candidate_type,
            p.id AS candidate_id,
            p.reference AS reference,
            p.demande_id AS demande_id,
            p.date_prelevement AS candidate_date,
            p.zone AS zone,
            p.technicien AS technicien,
            p.finalite AS finalite,
            p.notes AS notes,
            COUNT(i.id) AS source_count
        FROM prelevements p
        LEFT JOIN interventions i ON i.prelevement_id = p.id
        WHERE p.intervention_reelle_id IS NULL
        GROUP BY p.id

        UNION ALL

        SELECT
            'raw_intervention' AS candidate_type,
            i.id AS candidate_id,
            i.reference AS reference,
            i.demande_id AS demande_id,
            i.date_intervention AS candidate_date,
            COALESCE(json_extract(i.observations, '$.zone_intervention'), '') AS zone,
            i.technicien AS technicien,
            COALESCE(json_extract(i.observations, '$.finalite_intervention'), '') AS finalite,
            i.tri_comment AS notes,
            1 AS source_count
        FROM interventions i
        WHERE i.nature_reelle IN ('Essai terrain', 'Sondage', 'Intervention')
          AND COALESCE(i.intervention_reelle_id, 0) = 0
        """
    )


def ensure_ralab4_schema(db_path: Path | None = None) -> Path:
    path = db_path or get_db_path()
    with connect_db(path) as conn:
        conn.executescript(PASSATION_DDL)
        conn.executescript(DEMANDE_CONFIGURATION_DDL)
        conn.executescript(INTERVENTION_REQUALIFICATION_DDL)
        conn.executescript(INTERVENTION_CAMPAIGN_DDL)
        conn.executescript(PMT_WORKFLOW_DDL)
        _ensure_generic_essais_parent_schema(conn)
        _ensure_pmt_multi_essais_schema(conn)

        _ensure_column(conn, "prelevements", "date_reception_labo", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "prelevements", "description", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "prelevements", "quantite", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "prelevements", "receptionnaire", "TEXT NOT NULL DEFAULT ''")

        _ensure_column(conn, "echantillons", "prelevement_id", "INTEGER")
        _ensure_column(conn, "echantillons", "intervention_reelle_id", "INTEGER")
        _ensure_column(conn, "echantillons", "auto_reason", "TEXT NOT NULL DEFAULT ''")

        _ensure_column(conn, "interventions", "nature_reelle", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "interventions", "prelevement_id", "INTEGER")
        _ensure_column(conn, "interventions", "intervention_reelle_id", "INTEGER")
        _ensure_column(conn, "interventions", "tri_comment", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "interventions", "tri_updated_at", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "interventions", "campaign_id", "INTEGER REFERENCES intervention_campaigns(id) ON DELETE SET NULL")
        _ensure_column(conn, "intervention_campaigns", "zone_scope", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "intervention_campaigns", "temporalite", "TEXT NOT NULL DEFAULT ''")

        conn.execute("CREATE INDEX IF NOT EXISTS idx_echantillons_prelevement_id ON echantillons(prelevement_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_echantillons_intervention_reelle_id ON echantillons(intervention_reelle_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_interventions_nature_reelle ON interventions(nature_reelle)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_interventions_prelevement_id ON interventions(prelevement_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_interventions_intervention_reelle_id ON interventions(intervention_reelle_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_interventions_campaign_id ON interventions(campaign_id)")

        for code, nom, region in DEFAULT_LABS:
            conn.execute(
                "INSERT OR IGNORE INTO laboratoires (code, nom, region, actif) VALUES (?, ?, ?, 1)",
                (code, nom, region),
            )

        _create_intervention_creation_candidates_view(conn)
        conn.commit()
    return path


def list_laboratoires(db_path: Path | None = None) -> list[dict]:
    ensure_ralab4_schema(db_path)
    with connect_db(db_path) as conn:
        rows = conn.execute("SELECT id, code, nom, region, actif FROM laboratoires ORDER BY code").fetchall()
    return [
        {
            "id": int(row["id"]),
            "code": row["code"],
            "name": row["nom"],
            "region": row["region"],
            "is_active": bool(row["actif"]),
        }
        for row in rows
    ]
