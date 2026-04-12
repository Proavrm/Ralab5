-- 20260406_intervention_requalification.sql
-- Persistence foundation for interventions requalification.

ALTER TABLE interventions ADD COLUMN nature_reelle TEXT NOT NULL DEFAULT '';
ALTER TABLE interventions ADD COLUMN prelevement_id INTEGER;
ALTER TABLE interventions ADD COLUMN intervention_reelle_id INTEGER;
ALTER TABLE interventions ADD COLUMN tri_comment TEXT NOT NULL DEFAULT '';
ALTER TABLE interventions ADD COLUMN tri_updated_at TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS prelevements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    demande_id INTEGER REFERENCES demandes(id) ON DELETE SET NULL,
    intervention_reelle_id INTEGER,
    source_year INTEGER,
    date_prelevement TEXT NOT NULL DEFAULT '',
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

CREATE INDEX IF NOT EXISTS idx_interventions_nature_reelle ON interventions(nature_reelle);
CREATE INDEX IF NOT EXISTS idx_interventions_prelevement_id ON interventions(prelevement_id);
CREATE INDEX IF NOT EXISTS idx_interventions_intervention_reelle_id ON interventions(intervention_reelle_id);
CREATE INDEX IF NOT EXISTS idx_prelevements_demande ON prelevements(demande_id);
CREATE INDEX IF NOT EXISTS idx_prelevements_intervention_reelle ON prelevements(intervention_reelle_id);
CREATE INDEX IF NOT EXISTS idx_interventions_reelles_demande ON interventions_reelles(demande_id);
