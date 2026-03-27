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


def ensure_ralab4_schema(db_path: Path | None = None) -> Path:
	path = db_path or get_db_path()
	with connect_db(path) as conn:
		conn.executescript(PASSATION_DDL)
		conn.executescript(DEMANDE_CONFIGURATION_DDL)
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
