"""
migrate_qualite.py — crée les tables qualité dans data/ralab3.db
Usage: python migrate_qualite.py
"""
import sqlite3, os, sys

DB = os.path.join(os.path.dirname(__file__), "data", "ralab3.db")
if not os.path.exists(DB):
    print(f"DB non trouvée: {DB}"); sys.exit(1)

SQL = """
CREATE TABLE IF NOT EXISTS qualite_equipment (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    code                  TEXT NOT NULL,
    label                 TEXT NOT NULL,
    category              TEXT NOT NULL DEFAULT 'Labo',
    domain                TEXT,
    status                TEXT NOT NULL DEFAULT 'En service',
    serial_number         TEXT,
    supplier              TEXT,
    purchase_date         TEXT,
    lieu                  TEXT,
    etalonnage_interval   INTEGER,
    verification_interval INTEGER,
    presence              TEXT,
    notes                 TEXT,
    m_tare                REAL,
    volume_cm3            REAL,
    division              TEXT,
    precision             TEXT,
    capacite              REAL,
    sensibilite           REAL,
    facteur_k             REAL,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS qualite_metrology (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id  INTEGER NOT NULL REFERENCES qualite_equipment(id) ON DELETE CASCADE,
    control_type  TEXT NOT NULL DEFAULT 'Étalonnage',
    status        TEXT NOT NULL DEFAULT 'Valide',
    reference     TEXT,
    provider      TEXT,
    performed_on  TEXT,
    valid_until   TEXT,
    notes         TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS qualite_procedures (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    code             TEXT NOT NULL,
    title            TEXT NOT NULL,
    technical_family TEXT,
    version          TEXT DEFAULT '1.0',
    status           TEXT NOT NULL DEFAULT 'En vigueur',
    owner            TEXT,
    issue_date       TEXT,
    review_date      TEXT,
    file_path        TEXT,
    notes            TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS qualite_standards (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    code             TEXT NOT NULL,
    title            TEXT NOT NULL,
    technical_family TEXT,
    issuer           TEXT,
    version          TEXT,
    status           TEXT NOT NULL DEFAULT 'En vigueur',
    issue_date       TEXT,
    notes            TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS qualite_nc (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    reference         TEXT NOT NULL,
    source_type       TEXT NOT NULL DEFAULT 'Essai',
    severity          TEXT NOT NULL DEFAULT 'Mineure',
    status            TEXT NOT NULL DEFAULT 'Ouverte',
    source_ref        TEXT,
    title             TEXT,
    description       TEXT,
    detected_on       TEXT,
    detected_by       TEXT,
    action_immediate  TEXT,
    corrective_action TEXT,
    owner             TEXT,
    due_date          TEXT,
    closure_date      TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_qe_code    ON qualite_equipment(code);
CREATE INDEX IF NOT EXISTS idx_qe_status  ON qualite_equipment(status);
CREATE INDEX IF NOT EXISTS idx_qm_eq      ON qualite_metrology(equipment_id);
CREATE INDEX IF NOT EXISTS idx_qnc_status ON qualite_nc(status);
"""

con = sqlite3.connect(DB)
for stmt in SQL.strip().split(";"):
    s = stmt.strip()
    if s:
        con.execute(s)
con.commit()
con.close()
print("✓ Tables qualité créées dans data/ralab3.db")
