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
DEFAULT_QSSE_DB_NAME = "qsse.db"

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

PMT_WORKFLOW_DDL = """
CREATE TABLE IF NOT EXISTS pmt_essais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER REFERENCES pmt_campaigns(id) ON DELETE SET NULL,
    demande_id INTEGER REFERENCES demandes(id) ON DELETE SET NULL,
    intervention_id INTEGER REFERENCES interventions(id) ON DELETE SET NULL,
    reference TEXT NOT NULL DEFAULT '',
    statut TEXT NOT NULL DEFAULT 'Brouillon',
    date_essai TEXT NOT NULL DEFAULT '',
    operateur TEXT NOT NULL DEFAULT '',
    section_controlee TEXT NOT NULL DEFAULT '',
    observations TEXT NOT NULL DEFAULT '',
    resultats_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pmt_essais_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pmt_id INTEGER NOT NULL REFERENCES pmt_essais(id) ON DELETE CASCADE,
    ordre INTEGER NOT NULL DEFAULT 0,
    numero_essai TEXT NOT NULL DEFAULT '',
    profil TEXT NOT NULL DEFAULT '',
    position TEXT NOT NULL DEFAULT '',
    position_g INTEGER NOT NULL DEFAULT 0,
    position_a INTEGER NOT NULL DEFAULT 0,
    position_d INTEGER NOT NULL DEFAULT 0,
    position_codes_json TEXT NOT NULL DEFAULT '[]',
    localisation TEXT NOT NULL DEFAULT '',
    diametre_moyen_tache_mm REAL,
    profondeur_macrotexture_mm REAL,
    observation TEXT NOT NULL DEFAULT '',
    volume_materiau_mm3 REAL,
    seuil_pmt_min_mm REAL,
    conforme INTEGER,
    ecart_au_seuil_mm REAL,
    donnees_ligne_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pmt_essais_campaign_id ON pmt_essais(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pmt_essais_demande_id ON pmt_essais(demande_id);
CREATE INDEX IF NOT EXISTS idx_pmt_essais_intervention_id ON pmt_essais(intervention_id);
CREATE INDEX IF NOT EXISTS idx_pmt_essais_reference ON pmt_essais(reference);
CREATE INDEX IF NOT EXISTS idx_pmt_essais_points_pmt_id ON pmt_essais_points(pmt_id);
CREATE INDEX IF NOT EXISTS idx_pmt_essais_points_numero_essai ON pmt_essais_points(numero_essai);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pmt_essais_points_pmt_numero
    ON pmt_essais_points(pmt_id, numero_essai);
"""

QSSE_IMPORT_DDL = """
CREATE TABLE IF NOT EXISTS qsse_import_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_file TEXT NOT NULL,
    source_year INTEGER NOT NULL,
    source_mode TEXT NOT NULL DEFAULT 'live',
    file_hash TEXT NOT NULL DEFAULT '',
    workbook_title TEXT NOT NULL DEFAULT '',
    sheet_count INTEGER NOT NULL DEFAULT 0,
    row_count INTEGER NOT NULL DEFAULT 0,
    inserted_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'started',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qsse_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER REFERENCES qsse_import_runs(id) ON DELETE SET NULL,
    source_file TEXT NOT NULL DEFAULT '',
    source_year INTEGER NOT NULL DEFAULT 0,
    source_mode TEXT NOT NULL DEFAULT '',
    sheet_name TEXT NOT NULL DEFAULT '',
    sheet_kind TEXT NOT NULL DEFAULT '',
    row_index INTEGER NOT NULL DEFAULT 0,
    register_code TEXT NOT NULL DEFAULT '',
    record_kind TEXT NOT NULL DEFAULT '',
    agency TEXT NOT NULL DEFAULT '',
    entity TEXT NOT NULL DEFAULT '',
    person TEXT NOT NULL DEFAULT '',
    site TEXT NOT NULL DEFAULT '',
    theme TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    cause TEXT NOT NULL DEFAULT '',
    treatment TEXT NOT NULL DEFAULT '',
    corrective_action TEXT NOT NULL DEFAULT '',
    action_label TEXT NOT NULL DEFAULT '',
    pilot TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    severity TEXT NOT NULL DEFAULT '',
    date_event TEXT NOT NULL DEFAULT '',
    date_closed TEXT NOT NULL DEFAULT '',
    date_saisie TEXT NOT NULL DEFAULT '',
    amount_text TEXT NOT NULL DEFAULT '',
    amount_value REAL,
    document_reference TEXT NOT NULL DEFAULT '',
    metrics_json TEXT NOT NULL DEFAULT '{}',
    raw_json TEXT NOT NULL DEFAULT '{}',
    row_hash TEXT NOT NULL DEFAULT '',
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(source_file, sheet_name, row_index)
);

CREATE TABLE IF NOT EXISTS qsse_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    qsse_record_id INTEGER NOT NULL REFERENCES qsse_records(id) ON DELETE CASCADE,
    stored_name TEXT NOT NULL DEFAULT '',
    original_name TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT '',
    file_size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qsse_rex_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    qsse_record_id INTEGER NOT NULL UNIQUE REFERENCES qsse_records(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT '',
    prompt_version TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    confidence_score INTEGER NOT NULL DEFAULT 0,
    source_payload_json TEXT NOT NULL DEFAULT '{}',
    draft_json TEXT NOT NULL DEFAULT '{}',
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT NOT NULL DEFAULT '',
    approved_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qsse_records_source_file ON qsse_records(source_file);
CREATE INDEX IF NOT EXISTS idx_qsse_records_sheet_kind ON qsse_records(sheet_kind);
CREATE INDEX IF NOT EXISTS idx_qsse_records_register_code ON qsse_records(register_code);
CREATE INDEX IF NOT EXISTS idx_qsse_records_date_event ON qsse_records(date_event);
CREATE INDEX IF NOT EXISTS idx_qsse_records_run_id ON qsse_records(run_id);
CREATE INDEX IF NOT EXISTS idx_qsse_documents_record_id ON qsse_documents(qsse_record_id);
CREATE INDEX IF NOT EXISTS idx_qsse_rex_drafts_record_id ON qsse_rex_drafts(qsse_record_id);

CREATE TABLE IF NOT EXISTS qsse_analysis_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_code TEXT NOT NULL DEFAULT '',
    source_year INTEGER NOT NULL DEFAULT 0,
    stored_name TEXT NOT NULL DEFAULT '',
    original_name TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT '',
    file_size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qsse_analysis_documents_scope ON qsse_analysis_documents(analysis_code, source_year);
"""

WORK_INBOX_DDL = """
CREATE TABLE IF NOT EXISTS task_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module_type TEXT NOT NULL,
    object_uid INTEGER NOT NULL,
    object_reference TEXT NOT NULL DEFAULT '',
    affaire_rst_id INTEGER REFERENCES affaires_rst(id) ON DELETE SET NULL,
    demande_id INTEGER REFERENCES demandes(id) ON DELETE SET NULL,
    assignee_user_email TEXT,
    assignee_display_name TEXT NOT NULL DEFAULT '',
    assignment_role_code TEXT NOT NULL DEFAULT 'OWNER',
    status TEXT NOT NULL DEFAULT 'OPEN',
    priority TEXT NOT NULL DEFAULT 'Normale',
    due_date TEXT NOT NULL DEFAULT '',
    assigned_by_user_email TEXT,
    assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    source_hash TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_uid INTEGER NOT NULL REFERENCES task_assignments(id) ON DELETE CASCADE,
    recipient_user_email TEXT,
    recipient_display_name TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL DEFAULT 'UPDATED',
    title TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_assignments_assignee_status_due
    ON task_assignments(assignee_user_email, assignee_display_name, status, due_date);
CREATE INDEX IF NOT EXISTS idx_task_assignments_module_object
    ON task_assignments(module_type, object_uid, assignment_role_code);
CREATE INDEX IF NOT EXISTS idx_task_notifications_recipient_read_created
    ON task_notifications(recipient_user_email, recipient_display_name, is_read, created_at);
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


def get_qsse_db_path() -> Path:
    env_path = os.environ.get("RALAB4_QSSE_DB_PATH", "").strip()
    if env_path:
        return Path(env_path)
    return DATA_DIR / DEFAULT_QSSE_DB_NAME


def connect_db(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or get_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def connect_qsse_db(db_path: Path | None = None) -> sqlite3.Connection:
    return connect_db(db_path or get_qsse_db_path())


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


def _ensure_pmt_essais_harmonized_schema(conn: sqlite3.Connection) -> None:
    """
    Harmonize legacy PMT table that may carry restrictive UNIQUE constraints
    (notably UNIQUE(intervention_id)) from previous experiments.
    """
    if not _table_exists(conn, "pmt_essais"):
        return

    idx_rows = conn.execute("PRAGMA index_list(pmt_essais)").fetchall()
    has_legacy_unique = False
    for idx in idx_rows:
        is_unique = int(idx[2]) == 1
        origin = str(idx[3] or "")
        if not is_unique:
            continue
        name = str(idx[1] or "")
        cols = [str(col[2]) for col in conn.execute(f"PRAGMA index_info({name})").fetchall()]
        if origin == "u" and cols in (["intervention_id"], ["reference"]):
            has_legacy_unique = True
            break
    if not has_legacy_unique:
        return

    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.executescript(
            """
            BEGIN IMMEDIATE;

            DROP TABLE IF EXISTS pmt_essais__new;
            CREATE TABLE pmt_essais__new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id INTEGER REFERENCES pmt_campaigns(id) ON DELETE SET NULL,
                demande_id INTEGER REFERENCES demandes(id) ON DELETE SET NULL,
                intervention_id INTEGER REFERENCES interventions(id) ON DELETE SET NULL,
                reference TEXT NOT NULL DEFAULT '',
                statut TEXT NOT NULL DEFAULT 'Brouillon',
                date_essai TEXT NOT NULL DEFAULT '',
                operateur TEXT NOT NULL DEFAULT '',
                section_controlee TEXT NOT NULL DEFAULT '',
                observations TEXT NOT NULL DEFAULT '',
                resultats_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                essai_id INTEGER,
                import_source_file TEXT NOT NULL DEFAULT '',
                import_source_sheet TEXT NOT NULL DEFAULT '',
                import_uid TEXT NOT NULL DEFAULT '',
                imported_at TEXT,
                code_essai TEXT NOT NULL DEFAULT 'PMT',
                norme TEXT NOT NULL DEFAULT '',
                chrono TEXT NOT NULL DEFAULT '',
                reference_affaire TEXT NOT NULL DEFAULT '',
                date_redaction TEXT NOT NULL DEFAULT '',
                laboratoire TEXT NOT NULL DEFAULT '',
                produit_controle TEXT NOT NULL DEFAULT '',
                numero_formule TEXT NOT NULL DEFAULT '',
                couche TEXT NOT NULL DEFAULT '',
                lieu_fabrication TEXT NOT NULL DEFAULT '',
                date_essai_texte TEXT NOT NULL DEFAULT '',
                date_essai_debut TEXT NOT NULL DEFAULT '',
                date_essai_fin TEXT NOT NULL DEFAULT '',
                date_mise_en_oeuvre_texte TEXT NOT NULL DEFAULT '',
                date_mise_en_oeuvre_debut TEXT NOT NULL DEFAULT '',
                date_mise_en_oeuvre_fin TEXT NOT NULL DEFAULT '',
                epaisseur_couche_texte TEXT NOT NULL DEFAULT '',
                epaisseur_couche_cm REAL,
                conditions_meteorologiques TEXT NOT NULL DEFAULT '',
                atelier_mise_en_oeuvre TEXT NOT NULL DEFAULT '',
                volume_materiau_texte TEXT NOT NULL DEFAULT '',
                volume_materiau_m3 REAL,
                volume_materiau_mm3 REAL,
                volume_materiau_cm3 REAL,
                source_criteres TEXT NOT NULL DEFAULT '',
                definition_criteres TEXT NOT NULL DEFAULT '',
                seuil_pmt_min_mm REAL,
                pourcentage_conformite_min REAL,
                nombre_essais INTEGER,
                pmt_moyenne_mm REAL,
                pmt_min_mm REAL,
                pmt_max_mm REAL,
                pmt_ecart_type_mm REAL,
                pourcentage_valeurs_conformes REAL,
                nombre_points_conformes INTEGER,
                nombre_points_non_conformes INTEGER,
                conclusion_excel_texte TEXT NOT NULL DEFAULT '',
                conclusion_calculee TEXT NOT NULL DEFAULT '',
                conclusion_finale TEXT NOT NULL DEFAULT '',
                commentaire TEXT NOT NULL DEFAULT '',
                signataire_nom TEXT NOT NULL DEFAULT '',
                signataire_fonction TEXT NOT NULL DEFAULT '',
                visa_texte TEXT NOT NULL DEFAULT '',
                donnees_entete_json TEXT NOT NULL DEFAULT '{}',
                donnees_synthese_json TEXT NOT NULL DEFAULT '{}'
            );

            INSERT INTO pmt_essais__new (
                id, campaign_id, demande_id, intervention_id, reference, statut, date_essai, operateur, section_controlee,
                observations, resultats_json, created_at, updated_at, essai_id, import_source_file, import_source_sheet,
                import_uid, imported_at, code_essai, norme, chrono, reference_affaire, date_redaction, laboratoire,
                produit_controle, numero_formule, couche, lieu_fabrication, date_essai_texte, date_essai_debut, date_essai_fin,
                date_mise_en_oeuvre_texte, date_mise_en_oeuvre_debut, date_mise_en_oeuvre_fin, epaisseur_couche_texte,
                epaisseur_couche_cm, conditions_meteorologiques, atelier_mise_en_oeuvre, volume_materiau_texte,
                volume_materiau_m3, volume_materiau_mm3, volume_materiau_cm3, source_criteres, definition_criteres,
                seuil_pmt_min_mm, pourcentage_conformite_min, nombre_essais, pmt_moyenne_mm, pmt_min_mm, pmt_max_mm,
                pmt_ecart_type_mm, pourcentage_valeurs_conformes, nombre_points_conformes, nombre_points_non_conformes,
                conclusion_excel_texte, conclusion_calculee, conclusion_finale, commentaire, signataire_nom,
                signataire_fonction, visa_texte, donnees_entete_json, donnees_synthese_json
            )
            SELECT
                id,
                campaign_id,
                demande_id,
                intervention_id,
                COALESCE(reference, ''),
                COALESCE(statut, 'Brouillon'),
                COALESCE(date_essai, ''),
                COALESCE(operateur, ''),
                COALESCE(section_controlee, ''),
                COALESCE(observations, ''),
                COALESCE(resultats_json, '{}'),
                COALESCE(created_at, datetime('now')),
                COALESCE(updated_at, datetime('now')),
                essai_id,
                COALESCE(import_source_file, ''),
                COALESCE(import_source_sheet, ''),
                COALESCE(import_uid, ''),
                imported_at,
                COALESCE(code_essai, 'PMT'),
                COALESCE(norme, ''),
                COALESCE(chrono, ''),
                COALESCE(reference_affaire, ''),
                COALESCE(date_redaction, ''),
                COALESCE(laboratoire, ''),
                COALESCE(produit_controle, ''),
                COALESCE(numero_formule, ''),
                COALESCE(couche, ''),
                COALESCE(lieu_fabrication, ''),
                COALESCE(date_essai_texte, ''),
                COALESCE(date_essai_debut, ''),
                COALESCE(date_essai_fin, ''),
                COALESCE(date_mise_en_oeuvre_texte, ''),
                COALESCE(date_mise_en_oeuvre_debut, ''),
                COALESCE(date_mise_en_oeuvre_fin, ''),
                COALESCE(epaisseur_couche_texte, ''),
                epaisseur_couche_cm,
                COALESCE(conditions_meteorologiques, ''),
                COALESCE(atelier_mise_en_oeuvre, ''),
                COALESCE(volume_materiau_texte, ''),
                volume_materiau_m3,
                volume_materiau_mm3,
                volume_materiau_cm3,
                COALESCE(source_criteres, ''),
                COALESCE(definition_criteres, ''),
                seuil_pmt_min_mm,
                pourcentage_conformite_min,
                nombre_essais,
                pmt_moyenne_mm,
                pmt_min_mm,
                pmt_max_mm,
                pmt_ecart_type_mm,
                pourcentage_valeurs_conformes,
                nombre_points_conformes,
                nombre_points_non_conformes,
                COALESCE(conclusion_excel_texte, ''),
                COALESCE(conclusion_calculee, ''),
                COALESCE(conclusion_finale, ''),
                COALESCE(commentaire, ''),
                COALESCE(signataire_nom, ''),
                COALESCE(signataire_fonction, ''),
                COALESCE(visa_texte, ''),
                COALESCE(donnees_entete_json, '{}'),
                COALESCE(donnees_synthese_json, '{}')
            FROM pmt_essais;

            DROP TABLE pmt_essais;
            ALTER TABLE pmt_essais__new RENAME TO pmt_essais;

            COMMIT;
            """
        )
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def ensure_ralab4_schema(db_path: Path | None = None) -> Path:
    path = db_path or get_db_path()
    with connect_db(path) as conn:
        conn.executescript(PASSATION_DDL)
        conn.executescript(DEMANDE_CONFIGURATION_DDL)
        conn.executescript(LAB_WORKFLOW_DDL)
        conn.executescript(PMT_WORKFLOW_DDL)
        conn.executescript(QSSE_IMPORT_DDL)
        conn.executescript(WORK_INBOX_DDL)
        _ensure_generic_essais_parent_schema(conn)
        _ensure_pmt_essais_harmonized_schema(conn)

        _ensure_column(conn, "prelevements", "date_reception_labo", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "prelevements", "description", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "prelevements", "quantite", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "prelevements", "receptionnaire", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "prelevements", "intervention_id", "INTEGER REFERENCES interventions(id) ON DELETE SET NULL")
        _ensure_column(conn, "prelevements", "point_terrain_id", "INTEGER")
        _ensure_column(conn, "prelevements", "sondage_couche_id", "INTEGER")
        _ensure_column(conn, "prelevements", "ignore_sondage_couche_match", "INTEGER NOT NULL DEFAULT 0")
        _ensure_column(conn, "pmt_essais_points", "position_g", "INTEGER NOT NULL DEFAULT 0")
        _ensure_column(conn, "pmt_essais_points", "position_a", "INTEGER NOT NULL DEFAULT 0")
        _ensure_column(conn, "pmt_essais_points", "position_d", "INTEGER NOT NULL DEFAULT 0")
        _ensure_column(conn, "pmt_essais_points", "position_codes_json", "TEXT NOT NULL DEFAULT '[]'")

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
        _ensure_column(conn, "affaires_rst", "statut_offre", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "affaires_rst", "autre_reference", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "affaires_rst", "dossier_nom", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "affaires_rst", "dossier_path", "TEXT NOT NULL DEFAULT ''")

        _ensure_column(conn, "demandes", "domaine_etude", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demandes", "type_prestation_attendue", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demandes", "documents_fournis", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demandes", "lien_pieces_jointes", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demandes", "service_interne", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demandes", "societe_interne", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "demandes", "urgence_source", "TEXT NOT NULL DEFAULT ''")

        _ensure_column(conn, "qualite_equipment", "m_tare", "REAL")
        _ensure_column(conn, "qualite_equipment", "volume_cm3", "REAL")
        _ensure_column(conn, "qualite_equipment", "division", "TEXT")
        _ensure_column(conn, "qualite_equipment", "precision", "TEXT")
        _ensure_column(conn, "qualite_equipment", "capacite", "REAL")
        _ensure_column(conn, "qualite_equipment", "sensibilite", "REAL")
        _ensure_column(conn, "qualite_equipment", "facteur_k", "REAL")

        _ensure_column(conn, "qsse_records", "date_saisie", "TEXT NOT NULL DEFAULT ''")

        _ensure_column(conn, "pmt_essais", "essai_id", "INTEGER")
        _ensure_column(conn, "pmt_essais", "import_source_file", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "import_source_sheet", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "import_uid", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "imported_at", "TEXT")
        _ensure_column(conn, "pmt_essais", "code_essai", "TEXT NOT NULL DEFAULT 'PMT'")
        _ensure_column(conn, "pmt_essais", "norme", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "chrono", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "reference_affaire", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "date_redaction", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "laboratoire", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "produit_controle", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "numero_formule", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "lieu_fabrication", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "date_essai_texte", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "date_essai_debut", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "date_essai_fin", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "date_mise_en_oeuvre_texte", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "date_mise_en_oeuvre_debut", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "date_mise_en_oeuvre_fin", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "epaisseur_couche_texte", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "epaisseur_couche_cm", "REAL")
        _ensure_column(conn, "pmt_essais", "conditions_meteorologiques", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "atelier_mise_en_oeuvre", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "volume_materiau_texte", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "volume_materiau_m3", "REAL")
        _ensure_column(conn, "pmt_essais", "volume_materiau_mm3", "REAL")
        _ensure_column(conn, "pmt_essais", "volume_materiau_cm3", "REAL")
        _ensure_column(conn, "pmt_essais", "source_criteres", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "definition_criteres", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "seuil_pmt_min_mm", "REAL")
        _ensure_column(conn, "pmt_essais", "pourcentage_conformite_min", "REAL")
        _ensure_column(conn, "pmt_essais", "nombre_essais", "INTEGER")
        _ensure_column(conn, "pmt_essais", "pmt_moyenne_mm", "REAL")
        _ensure_column(conn, "pmt_essais", "pmt_min_mm", "REAL")
        _ensure_column(conn, "pmt_essais", "pmt_max_mm", "REAL")
        _ensure_column(conn, "pmt_essais", "pmt_ecart_type_mm", "REAL")
        _ensure_column(conn, "pmt_essais", "pourcentage_valeurs_conformes", "REAL")
        _ensure_column(conn, "pmt_essais", "nombre_points_conformes", "INTEGER")
        _ensure_column(conn, "pmt_essais", "nombre_points_non_conformes", "INTEGER")
        _ensure_column(conn, "pmt_essais", "conclusion_excel_texte", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "conclusion_calculee", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "conclusion_finale", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "commentaire", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "signataire_nom", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "signataire_fonction", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "visa_texte", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "pmt_essais", "donnees_entete_json", "TEXT NOT NULL DEFAULT '{}'")
        _ensure_column(conn, "pmt_essais", "donnees_synthese_json", "TEXT NOT NULL DEFAULT '{}'")

        conn.execute("CREATE INDEX IF NOT EXISTS idx_echantillons_prelevement_id ON echantillons(prelevement_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_echantillons_intervention_id ON echantillons(intervention_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_interventions_prelevement_id ON interventions(prelevement_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_interventions_campagne_id ON interventions(campagne_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_prelevements_intervention_id ON prelevements(intervention_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_prelevements_point_terrain_id ON prelevements(point_terrain_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_prelevements_sondage_couche_id ON prelevements(sondage_couche_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pmt_essais_import_uid ON pmt_essais(import_uid)")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_pmt_essais_import_source_sheet ON pmt_essais(import_source_file, import_source_sheet)")

        _ensure_historical_sondage_prelevement_links(conn)

        for code, nom, region in DEFAULT_LABS:
            conn.execute(
                "INSERT OR IGNORE INTO laboratoires (code, nom, region, actif) VALUES (?, ?, ?, 1)",
                (code, nom, region),
            )

        conn.commit()
    return path


def ensure_qsse_schema(db_path: Path | None = None) -> Path:
    path = db_path or get_qsse_db_path()
    with connect_qsse_db(path) as conn:
        conn.executescript(QSSE_IMPORT_DDL)
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
