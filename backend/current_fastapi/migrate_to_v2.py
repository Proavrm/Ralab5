"""
migrate_to_v2.py
Script de migration idempotent vers ralab3_structured_candidate_v2.db
Ajoute les colonnes manquantes aux tables existantes.
Usage: python migrate_to_v2.py
"""
from __future__ import annotations
import sqlite3
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
DB_PATH = ROOT_DIR / "data" / "ralab3.db"


def _conn(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _table_columns(conn, table: str) -> set[str]:
    return {str(r[1]) for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _ensure_col(conn, table: str, col: str, ddl: str) -> bool:
    if col not in _table_columns(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
        print(f"  + {table}.{col}")
        return True
    return False


def _table_exists(conn, table: str) -> bool:
    return bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone())


def migrate(db_path: Path = DB_PATH):
    print(f"Migration → {db_path}")
    with _conn(db_path) as conn:

        # ── campagnes : colonnes manquantes ───────────────────────────────────
        if _table_exists(conn, "campagnes"):
            print("\ncampagnes:")
            _ensure_col(conn, "campagnes", "designation",           "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagnes", "zone_scope",            "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagnes", "temporalite",           "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagnes", "code",                  "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagnes", "date_debut_prevue",     "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagnes", "date_fin_prevue",       "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagnes", "priorite",              "TEXT NOT NULL DEFAULT 'Normale'")
            _ensure_col(conn, "campagnes", "responsable_technique", "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagnes", "criteres_controle",     "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagnes", "livrables_attendus",    "TEXT NOT NULL DEFAULT ''")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_campagnes_demande ON campagnes(demande_id)")
        else:
            print("\ncampagnes: table absente — création")
            conn.execute("""
                CREATE TABLE campagnes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    reference TEXT NOT NULL UNIQUE,
                    demande_id INTEGER NOT NULL REFERENCES demandes(id) ON DELETE CASCADE,
                    label TEXT NOT NULL DEFAULT 'Campagne',
                    type_campagne TEXT NOT NULL DEFAULT '',
                    code TEXT NOT NULL DEFAULT '',
                    designation TEXT NOT NULL DEFAULT '',
                    zone_scope TEXT NOT NULL DEFAULT '',
                    temporalite TEXT NOT NULL DEFAULT '',
                    date_debut_prevue TEXT NOT NULL DEFAULT '',
                    date_fin_prevue TEXT NOT NULL DEFAULT '',
                    priorite TEXT NOT NULL DEFAULT 'Normale',
                    responsable_technique TEXT NOT NULL DEFAULT '',
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
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_campagnes_demande ON campagnes(demande_id)")
            print("  ✓ Table campagnes créée")

        # ── campagne_preparations : colonnes manquantes ───────────────────────
        if _table_exists(conn, "campagne_preparations"):
            print("\ncampagne_preparations:")
            _ensure_col(conn, "campagne_preparations", "type_intervention_prevu", "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagne_preparations", "finalite",               "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagne_preparations", "zone_localisation",      "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagne_preparations", "materiau_objet",         "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagne_preparations", "objectif_mission",       "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagne_preparations", "responsable_referent",   "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagne_preparations", "attribue_a",             "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagne_preparations", "priorite",               "TEXT NOT NULL DEFAULT 'Normale'")
            _ensure_col(conn, "campagne_preparations", "date_prevue",            "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagne_preparations", "nb_points_prevus",       "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagne_preparations", "types_essais_prevus",    "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagne_preparations", "criteres_conformite",    "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagne_preparations", "livrables_attendus",     "TEXT NOT NULL DEFAULT ''")
            _ensure_col(conn, "campagne_preparations", "remarques",              "TEXT NOT NULL DEFAULT ''")

        # ── demande_preparations : colonnes manquantes ────────────────────────
        print("\ndemande_preparations:")
        _ensure_col(conn, "demande_preparations", "type_intervention_prevu", "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "demande_preparations", "finalite",               "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "demande_preparations", "zone_localisation",      "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "demande_preparations", "materiau_objet",         "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "demande_preparations", "objectif_mission",       "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "demande_preparations", "responsable_referent",   "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "demande_preparations", "attribue_a",             "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "demande_preparations", "priorite",               "TEXT NOT NULL DEFAULT 'Normale'")
        _ensure_col(conn, "demande_preparations", "date_prevue",            "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "demande_preparations", "nb_points_prevus",       "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "demande_preparations", "types_essais_prevus",    "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "demande_preparations", "criteres_conformite",    "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "demande_preparations", "livrables_attendus",     "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "demande_preparations", "remarques",              "TEXT NOT NULL DEFAULT ''")

        # ── interventions_reelles : colonnes terrain ──────────────────────────
        print("\ninterventions_reelles:")
        _ensure_col(conn, "interventions_reelles", "campagne_id",                    "INTEGER")
        _ensure_col(conn, "interventions_reelles", "heure_debut",                   "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "heure_fin",                     "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "prep_points_a_realiser",        "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "prep_essais_a_effectuer",       "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "prep_materiels_requis",         "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "prep_contact_chantier",         "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "prep_plan_prevention",          "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "prep_contraintes_acces",        "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "prep_preparation_complete",     "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "prep_point_bloquant",           "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "prep_point_bloquant_desc",      "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "cond_meteo",                    "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "cond_etat_site",                "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "cond_ecarts",                   "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "cond_materiel_utilise",         "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "real_nb_points_prevus",         "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "real_nb_points_realises",       "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "real_points_non_realises_motif","TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "real_incidents",                "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "real_non_conformites",          "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "real_adaptations",              "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "real_decision_immediate",       "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "sortie_nb_echantillons",        "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "sortie_destination_labo",       "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "sortie_alerte",                 "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "sortie_alerte_desc",            "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "sortie_info_demandeur",         "TEXT NOT NULL DEFAULT ''")
        _ensure_col(conn, "interventions_reelles", "sortie_synthese",               "TEXT NOT NULL DEFAULT ''")

        # ── interventions : campaign_id → campagnes ───────────────────────────
        print("\ninterventions:")
        _ensure_col(conn, "interventions", "campagne_id", "INTEGER REFERENCES campagnes(id) ON DELETE SET NULL")
        # Garder campaign_id aussi pour compatibilité ascendante
        _ensure_col(conn, "interventions", "campaign_id", "INTEGER")

        conn.execute("PRAGMA foreign_keys = ON")
        conn.commit()

    print("\n✓ Migration terminée")


if __name__ == "__main__":
    migrate()
