"""
app/core/database.py
Shared database helpers for RaLab4.
"""
from __future__ import annotations

import json
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
    familles_prevues TEXT NOT NULL DEFAULT '[]',
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

LAB_WORKFLOW_DDL = """
CREATE TABLE IF NOT EXISTS campagnes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demande_id INTEGER NOT NULL REFERENCES demandes(id) ON DELETE CASCADE,
    reference TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT 'Campagne',
    type_campagne TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL DEFAULT '',
    designation TEXT NOT NULL DEFAULT '',
    zone_scope TEXT NOT NULL DEFAULT '',
    temporalite TEXT NOT NULL DEFAULT '',
    programme_specifique TEXT NOT NULL DEFAULT '',
    nb_points_prevus TEXT NOT NULL DEFAULT '',
    types_essais_prevus TEXT NOT NULL DEFAULT '',
    date_debut_prevue TEXT NOT NULL DEFAULT '',
    date_fin_prevue TEXT NOT NULL DEFAULT '',
    priorite TEXT NOT NULL DEFAULT 'Normale',
    responsable_technique TEXT NOT NULL DEFAULT '',
    attribue_a TEXT NOT NULL DEFAULT '',
    criteres_controle TEXT NOT NULL DEFAULT '',
    livrables_attendus TEXT NOT NULL DEFAULT '',
    workflow_label TEXT NOT NULL DEFAULT '',
    statut TEXT NOT NULL DEFAULT 'À cadrer',
    notes TEXT NOT NULL DEFAULT '',
    legacy_table TEXT NOT NULL DEFAULT '',
    legacy_uid INTEGER,
    migration_created INTEGER NOT NULL DEFAULT 0,
    migration_reason TEXT NOT NULL DEFAULT '',
    review_required INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_campagnes_demande ON campagnes(demande_id);

CREATE TABLE IF NOT EXISTS prelevements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    demande_id INTEGER REFERENCES demandes(id) ON DELETE SET NULL,
    intervention_id INTEGER REFERENCES interventions(id) ON DELETE SET NULL,
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
    legacy_prelevement_id INTEGER,
    legacy_intervention_reelle_id INTEGER,
    migration_created INTEGER NOT NULL DEFAULT 0,
    migration_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prelevements_demande ON prelevements(demande_id);
CREATE INDEX IF NOT EXISTS idx_prelevements_intervention ON prelevements(intervention_id);
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


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def _parse_json_dict(raw_value: object) -> dict[str, object]:
    if isinstance(raw_value, dict):
        return raw_value
    text = str(raw_value or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _normalize_link_key(value: object) -> str:
    text = str(value or "").strip().upper()
    return "".join(ch for ch in text if ch.isalnum())


def _ensure_column(conn: sqlite3.Connection, table_name: str, column_name: str, ddl_tail: str) -> None:
    if not _table_exists(conn, table_name):
        return
    if column_name in _table_columns(conn, table_name):
        return
    conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl_tail}")


def _ensure_generic_essais_parent_schema(conn: sqlite3.Connection) -> None:
    has_essais = _table_exists(conn, "essais")
    has_temp_essais = _table_exists(conn, "essais__new")

    if not has_essais and has_temp_essais:
        temp_cols = _table_columns(conn, "essais__new")
        if {"intervention_id", "source_signature", "source_label"}.issubset(temp_cols):
            try:
                conn.executescript(
                    """
                    BEGIN IMMEDIATE;
                    ALTER TABLE essais__new RENAME TO essais;
                    CREATE INDEX IF NOT EXISTS idx_essais_echantillon_id ON essais(echantillon_id);
                    CREATE INDEX IF NOT EXISTS idx_essais_intervention_id ON essais(intervention_id);
                    CREATE INDEX IF NOT EXISTS idx_essais_source_signature ON essais(source_signature);
                    COMMIT;
                    """
                )
            except Exception:
                conn.rollback()
                raise
        return

    if not has_essais:
        return

    cols = {str(row[1]): row for row in conn.execute("PRAGMA table_info(essais)").fetchall()}
    has_intervention_id = "intervention_id" in cols
    has_source_signature = "source_signature" in cols
    has_source_label = "source_label" in cols
    echantillon_is_nullable = bool(cols) and int(cols["echantillon_id"][3]) == 0 if "echantillon_id" in cols else True

    if has_intervention_id and has_source_signature and has_source_label and echantillon_is_nullable:
        if has_temp_essais:
            conn.execute("DROP TABLE essais__new")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_essais_echantillon_id ON essais(echantillon_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_essais_intervention_id ON essais(intervention_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_essais_source_signature ON essais(source_signature)")
        return

    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.executescript(
            """
            BEGIN IMMEDIATE;

            DROP TABLE IF EXISTS essais__new;

            CREATE TABLE essais__new (
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

            CREATE INDEX IF NOT EXISTS idx_essais_echantillon_id ON essais(echantillon_id);
            CREATE INDEX IF NOT EXISTS idx_essais_intervention_id ON essais(intervention_id);
            CREATE INDEX IF NOT EXISTS idx_essais_source_signature ON essais(source_signature);

            COMMIT;
            """
        )
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def _ensure_historical_sondage_prelevement_links(conn: sqlite3.Connection) -> None:
    required_tables = {"prelevements", "echantillons", "essais", "points_terrain"}
    if any(not _table_exists(conn, table_name) for table_name in required_tables):
        return

    prelevement_columns = _table_columns(conn, "prelevements")
    point_columns = _table_columns(conn, "points_terrain")
    if "point_terrain_id" not in prelevement_columns or "source_essai_id" not in point_columns:
        return

    point_rows = conn.execute(
        """
        SELECT id, source_essai_id, point_code, position_label, payload_json
        FROM points_terrain
        WHERE source_essai_id IS NOT NULL
        ORDER BY COALESCE(ordre, 0), id
        """
    ).fetchall()
    if not point_rows:
        return

    points_by_essai: dict[int, list[dict[str, object]]] = {}
    for row in point_rows:
        source_essai_id = row["source_essai_id"]
        if source_essai_id is None:
            continue
        payload = _parse_json_dict(row["payload_json"]) if "payload_json" in point_columns else {}
        keys = {
            _normalize_link_key(row["point_code"]),
            _normalize_link_key(row["position_label"]),
            _normalize_link_key(payload.get("source_sheet")),
            _normalize_link_key(payload.get("sheet_name")),
            _normalize_link_key(payload.get("sample_local_ref")),
        }
        keys.discard("")
        points_by_essai.setdefault(int(source_essai_id), []).append(
            {
                "id": int(row["id"]),
                "keys": keys,
            }
        )

    updates_by_prelevement: dict[int, int] = {}
    candidate_rows = conn.execute(
        """
        SELECT DISTINCT p.id, p.point_terrain_id, p.zone, p.description, e.designation, es.id AS essai_id
        FROM prelevements p
        JOIN echantillons e ON e.prelevement_id = p.id
        JOIN essais es ON es.echantillon_id = e.id
        WHERE es.essai_code IN ('SO', 'SC')
        ORDER BY p.id ASC
        """
    ).fetchall()

    for row in candidate_rows:
        if row["point_terrain_id"] is not None:
            continue
        essai_id = row["essai_id"]
        if essai_id is None:
            continue
        candidates = points_by_essai.get(int(essai_id), [])
        if not candidates:
            continue

        chosen_point_id: int | None = None
        if len(candidates) == 1:
            chosen_point_id = int(candidates[0]["id"])
        else:
            match_keys = [
                _normalize_link_key(row["zone"]),
                _normalize_link_key(row["description"]),
                _normalize_link_key(row["designation"]),
            ]
            match_keys = [item for item in match_keys if item]
            matched_point_ids = {
                int(candidate["id"])
                for candidate in candidates
                if any(match_key in candidate["keys"] for match_key in match_keys)
            }
            if len(matched_point_ids) == 1:
                chosen_point_id = matched_point_ids.pop()

        if chosen_point_id is not None:
            updates_by_prelevement[int(row["id"])] = chosen_point_id

    if not updates_by_prelevement:
        return

    conn.executemany(
        "UPDATE prelevements SET point_terrain_id = ?, updated_at = datetime('now') WHERE id = ?",
        [(point_id, prelevement_id) for prelevement_id, point_id in updates_by_prelevement.items()],
    )


def ensure_ralab4_schema(db_path: Path | None = None) -> Path:
    path = db_path or get_db_path()
    with connect_db(path) as conn:
        conn.executescript(PASSATION_DDL)
        conn.executescript(DEMANDE_CONFIGURATION_DDL)
        conn.executescript(LAB_WORKFLOW_DDL)
        _ensure_generic_essais_parent_schema(conn)

        _ensure_column(conn, "prelevements", "date_reception_labo", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "prelevements", "description", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "prelevements", "quantite", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "prelevements", "receptionnaire", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "prelevements", "intervention_id", "INTEGER REFERENCES interventions(id) ON DELETE SET NULL")
        _ensure_column(conn, "prelevements", "point_terrain_id", "INTEGER")
        _ensure_column(conn, "prelevements", "sondage_couche_id", "INTEGER")
        _ensure_column(conn, "prelevements", "ignore_sondage_couche_match", "INTEGER NOT NULL DEFAULT 0")

        _ensure_column(conn, "campagnes", "code", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "campagnes", "designation", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "campagnes", "zone_scope", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "campagnes", "temporalite", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "campagnes", "programme_specifique", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "campagnes", "nb_points_prevus", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "campagnes", "types_essais_prevus", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "campagnes", "date_debut_prevue", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "campagnes", "date_fin_prevue", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "campagnes", "priorite", "TEXT NOT NULL DEFAULT 'Normale'")
        _ensure_column(conn, "campagnes", "responsable_technique", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "campagnes", "attribue_a", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "campagnes", "criteres_controle", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "campagnes", "livrables_attendus", "TEXT NOT NULL DEFAULT ''")

        _ensure_column(conn, "echantillons", "prelevement_id", "INTEGER REFERENCES prelevements(id) ON DELETE SET NULL")
        _ensure_column(conn, "echantillons", "intervention_id", "INTEGER REFERENCES interventions(id) ON DELETE SET NULL")
        _ensure_column(conn, "echantillons", "auto_reason", "TEXT NOT NULL DEFAULT ''")

        _ensure_column(conn, "interventions", "campagne_id", "INTEGER REFERENCES campagnes(id) ON DELETE SET NULL")
        _ensure_column(conn, "interventions", "finalite", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "interventions", "zone", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "interventions", "heure_debut", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "interventions", "heure_fin", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "interventions", "nature_reelle", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "interventions", "prelevement_id", "INTEGER REFERENCES prelevements(id) ON DELETE SET NULL")
        _ensure_column(conn, "interventions", "tri_comment", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "interventions", "tri_updated_at", "TEXT NOT NULL DEFAULT ''")

        _ensure_column(conn, "demande_preparations", "type_intervention_prevu", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demande_preparations", "finalite", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demande_preparations", "zone_localisation", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demande_preparations", "materiau_objet", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demande_preparations", "objectif_mission", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demande_preparations", "responsable_referent", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demande_preparations", "attribue_a", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demande_preparations", "priorite", "TEXT NOT NULL DEFAULT 'Normale'")
        _ensure_column(conn, "demande_preparations", "date_prevue", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demande_preparations", "nb_points_prevus", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demande_preparations", "types_essais_prevus", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demande_preparations", "criteres_conformite", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demande_preparations", "livrables_attendus", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demande_preparations", "remarques", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demande_preparations", "familles_prevues", "TEXT NOT NULL DEFAULT '[]'")

        _ensure_column(conn, "affaires_rst", "site", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "affaires_rst", "numero_etude", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "affaires_rst", "filiale", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "affaires_rst", "autre_reference", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "affaires_rst", "dossier_nom", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "affaires_rst", "dossier_path", "TEXT NOT NULL DEFAULT ''")

        _ensure_column(conn, "qualite_equipment", "m_tare", "REAL")
        _ensure_column(conn, "qualite_equipment", "volume_cm3", "REAL")
        _ensure_column(conn, "qualite_equipment", "division", "TEXT")
        _ensure_column(conn, "qualite_equipment", "precision", "TEXT")
        _ensure_column(conn, "qualite_equipment", "capacite", "REAL")
        _ensure_column(conn, "qualite_equipment", "sensibilite", "REAL")
        _ensure_column(conn, "qualite_equipment", "facteur_k", "REAL")

        conn.execute("CREATE INDEX IF NOT EXISTS idx_echantillons_prelevement_id ON echantillons(prelevement_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_echantillons_intervention_id ON echantillons(intervention_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_interventions_prelevement_id ON interventions(prelevement_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_interventions_campagne_id ON interventions(campagne_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_prelevements_intervention_id ON prelevements(intervention_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_prelevements_point_terrain_id ON prelevements(point_terrain_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_prelevements_sondage_couche_id ON prelevements(sondage_couche_id)")

        _ensure_historical_sondage_prelevement_links(conn)

        for code, nom, region in DEFAULT_LABS:
            conn.execute(
                "INSERT OR IGNORE INTO laboratoires (code, nom, region, actif) VALUES (?, ?, ?, 1)",
                (code, nom, region),
            )

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
