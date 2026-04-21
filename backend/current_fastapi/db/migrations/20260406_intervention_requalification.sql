-- 20260406_intervention_requalification.sql
-- Harmonisation cible:
--   1. une seule table `interventions`
--   2. une seule table `campagnes`
--   3. chaîne labo: intervention -> prélèvement -> échantillon -> essai

ALTER TABLE interventions ADD COLUMN campagne_id INTEGER;
ALTER TABLE interventions ADD COLUMN finalite TEXT NOT NULL DEFAULT '';
ALTER TABLE interventions ADD COLUMN zone TEXT NOT NULL DEFAULT '';
ALTER TABLE interventions ADD COLUMN heure_debut TEXT NOT NULL DEFAULT '';
ALTER TABLE interventions ADD COLUMN heure_fin TEXT NOT NULL DEFAULT '';
ALTER TABLE interventions ADD COLUMN nature_reelle TEXT NOT NULL DEFAULT '';
ALTER TABLE interventions ADD COLUMN prelevement_id INTEGER;
ALTER TABLE interventions ADD COLUMN tri_comment TEXT NOT NULL DEFAULT '';
ALTER TABLE interventions ADD COLUMN tri_updated_at TEXT NOT NULL DEFAULT '';

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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_interventions_campagne_id ON interventions(campagne_id);
CREATE INDEX IF NOT EXISTS idx_interventions_prelevement_id ON interventions(prelevement_id);
CREATE INDEX IF NOT EXISTS idx_campagnes_demande ON campagnes(demande_id);
CREATE INDEX IF NOT EXISTS idx_prelevements_demande ON prelevements(demande_id);
CREATE INDEX IF NOT EXISTS idx_prelevements_intervention ON prelevements(intervention_id);
