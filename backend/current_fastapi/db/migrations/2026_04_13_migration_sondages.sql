-- 2026_04_13_migration_sondages.sql
-- Objectif:
--   1. Créer une vraie structure métier pour les sondages / descriptions géotechniques
--   2. Lier les prélèvements aux points et aux couches de sondage
--   3. Migrer les essais historiques SO / SC depuis essais.resultats vers l'axe terrain
--      (series_essais_terrain / feuilles_terrain / points_terrain)
--
-- IMPORTANT:
--   - Ce script vise SQLite.
--   - Les ALTER TABLE ci-dessous sont à exécuter une seule fois.
--   - Faire une sauvegarde de la base avant exécution.

BEGIN TRANSACTION;

-- -----------------------------------------------------------------------------
-- 1. ÉVOLUTION DU SCHÉMA
-- -----------------------------------------------------------------------------

-- 1.1. Trace source historique sur l'axe terrain
ALTER TABLE series_essais_terrain ADD COLUMN source_essai_id INTEGER;
ALTER TABLE feuilles_terrain ADD COLUMN source_essai_id INTEGER;
ALTER TABLE points_terrain ADD COLUMN source_essai_id INTEGER;

-- 1.2. Liaison prélèvement -> point / couche de sondage
ALTER TABLE prelevements ADD COLUMN point_terrain_id INTEGER;
ALTER TABLE prelevements ADD COLUMN sondage_couche_id INTEGER;

-- 1.3. Table des couches / horizons géotechniques
CREATE TABLE IF NOT EXISTS sondage_couches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    point_terrain_id INTEGER NOT NULL,
    ordre INTEGER NOT NULL DEFAULT 0,
    z_haut REAL,
    z_bas REAL,
    texture_matrice TEXT NOT NULL DEFAULT '',
    proportion_matrice TEXT NOT NULL DEFAULT '',
    elements_grossiers TEXT NOT NULL DEFAULT '',
    petrographie TEXT NOT NULL DEFAULT '',
    structure TEXT NOT NULL DEFAULT '',
    matiere_organique TEXT NOT NULL DEFAULT '',
    couleur TEXT NOT NULL DEFAULT '',
    odeur TEXT NOT NULL DEFAULT '',
    consistance TEXT NOT NULL DEFAULT '',
    cohesion TEXT NOT NULL DEFAULT '',
    oxydo_reduction TEXT NOT NULL DEFAULT '',
    eau_porosite TEXT NOT NULL DEFAULT '',
    horizon TEXT NOT NULL DEFAULT '',
    determination TEXT NOT NULL DEFAULT '',
    geologie TEXT NOT NULL DEFAULT '',
    description_libre TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (point_terrain_id) REFERENCES points_terrain(id) ON DELETE CASCADE
);

-- 1.4. Index utiles
CREATE UNIQUE INDEX IF NOT EXISTS ux_series_essais_terrain_source_essai
    ON series_essais_terrain(source_essai_id)
    WHERE source_essai_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_feuilles_terrain_source_essai
    ON feuilles_terrain(source_essai_id)
    WHERE source_essai_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_points_terrain_source_essai
    ON points_terrain(source_essai_id)
    WHERE source_essai_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_sondage_couches_point_terrain_id
    ON sondage_couches(point_terrain_id, ordre);

CREATE INDEX IF NOT EXISTS ix_prelevements_point_terrain_id
    ON prelevements(point_terrain_id);

CREATE INDEX IF NOT EXISTS ix_prelevements_sondage_couche_id
    ON prelevements(sondage_couche_id);

-- -----------------------------------------------------------------------------
-- 2. MIGRATION DES ESSAIS HISTORIQUES SO / SC VERS L'AXE TERRAIN
-- -----------------------------------------------------------------------------

-- 2.1. Création des séries terrain à partir des essais SO / SC historiques
INSERT INTO series_essais_terrain (
    reference,
    demande_id,
    campagne_id,
    intervention_id,
    code_essai,
    libelle_essai,
    source_file,
    sheet_name,
    group_signature,
    import_mode,
    statut,
    date_essai,
    operateur,
    section_controlee,
    couche,
    observations,
    payload_json,
    source_essai_id,
    created_at,
    updated_at
)
SELECT
    'SER-SDG-' || printf('%04d', es.id),
    ech.demande_id,
    NULL,
    COALESCE(es.intervention_id, ech.intervention_id),
    es.essai_code,
    es.type_essai,
    COALESCE(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.source_file') END, ''),
    COALESCE(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.sheet_name') END, ''),
    COALESCE(
        NULLIF(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.signature') END, ''),
        NULLIF(es.source_signature, ''),
        'ESSAI:' || es.id
    ),
    'historical_so_sc_migration',
    'Importée',
    COALESCE(
        NULLIF(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.date_essai') END, ''),
        NULLIF(es.date_debut, ''),
        NULLIF(es.date_fin, ''),
        ''
    ),
    COALESCE(
        NULLIF(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.operator') END, ''),
        NULLIF(es.operateur, ''),
        ''
    ),
    COALESCE(NULLIF(CASE WHEN json_valid(es.resultats) THEN json_extract(es.resultats, '$.section_controlee') END, ''), ''),
    COALESCE(NULLIF(CASE WHEN json_valid(es.resultats) THEN json_extract(es.resultats, '$.couche') END, ''), ''),
    COALESCE(es.observations, ''),
    json_object(
        'migration_source', 'essais',
        'source_essai_id', es.id,
        'source_echantillon_id', es.echantillon_id,
        'source_signature', COALESCE(es.source_signature, ''),
        'source_label', COALESCE(es.source_label, ''),
        'resultats', json(CASE WHEN json_valid(es.resultats) THEN es.resultats ELSE '{}' END),
        'observations', json(CASE WHEN json_valid(es.observations) THEN es.observations ELSE '{}' END)
    ),
    es.id,
    COALESCE(es.created_at, datetime('now')),
    COALESCE(es.updated_at, datetime('now'))
FROM essais es
LEFT JOIN echantillons ech ON ech.id = es.echantillon_id
WHERE es.essai_code IN ('SO', 'SC')
  AND NOT EXISTS (
        SELECT 1
        FROM series_essais_terrain st
        WHERE st.source_essai_id = es.id
    );

-- 2.2. Création des feuilles terrain correspondantes
INSERT INTO feuilles_terrain (
    reference,
    demande_id,
    campagne_id,
    intervention_id,
    serie_id,
    code_feuille,
    label,
    norme,
    date_feuille,
    operateur,
    statut,
    observations,
    resultats_json,
    resultat_principal,
    resultat_unite,
    resultat_label,
    source_essai_id,
    created_at,
    updated_at
)
SELECT
    'FT-SDG-' || printf('%04d', es.id),
    st.demande_id,
    st.campagne_id,
    st.intervention_id,
    st.id,
    es.essai_code,
    CASE
        WHEN es.essai_code = 'SC' THEN 'Coupe de sondage carotté'
        ELSE 'Coupe de sondage'
    END,
    COALESCE(NULLIF(es.norme, ''), 'NF P 11-300'),
    COALESCE(NULLIF(st.date_essai, ''), ''),
    COALESCE(NULLIF(st.operateur, ''), ''),
    'Importée',
    'Feuille migrée depuis un essai historique ' || es.essai_code,
    json_object(
        'kind', 'terrain_sheet',
        'migration_source', 'essais',
        'source_essai_id', es.id,
        'source_echantillon_id', es.echantillon_id,
        'header_snapshot', json(CASE WHEN json_valid(es.resultats) THEN COALESCE(json_extract(es.resultats, '$.header_snapshot'), '[]') ELSE '[]' END),
        'rows', json(CASE WHEN json_valid(es.resultats) THEN COALESCE(json_extract(es.resultats, '$.rows'), '[]') ELSE '[]' END),
        'couches_importees', json(CASE WHEN json_valid(es.resultats) THEN COALESCE(json_extract(es.resultats, '$.couches'), '[]') ELSE '[]' END),
        'source_file', COALESCE(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.source_file') END, ''),
        'sheet_name', COALESCE(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.sheet_name') END, ''),
        'source_signature', COALESCE(NULLIF(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.signature') END, ''), COALESCE(es.source_signature, ''))
    ),
    es.resultat_principal,
    es.resultat_unite,
    COALESCE(NULLIF(es.resultat_label, ''), ''),
    es.id,
    COALESCE(es.created_at, datetime('now')),
    COALESCE(es.updated_at, datetime('now'))
FROM essais es
JOIN series_essais_terrain st ON st.source_essai_id = es.id
WHERE es.essai_code IN ('SO', 'SC')
  AND NOT EXISTS (
        SELECT 1
        FROM feuilles_terrain ft
        WHERE ft.source_essai_id = es.id
    );

-- 2.3. Création d'un point terrain par essai historique
--      Même si aucune couche n'est disponible, on matérialise le sondage / point.
INSERT INTO points_terrain (
    serie_id,
    intervention_id,
    campagne_id,
    demande_id,
    point_code,
    point_type,
    ordre,
    localisation,
    position_label,
    profil,
    profondeur_haut,
    profondeur_bas,
    valeur_principale,
    unite_principale,
    observation,
    payload_json,
    source_essai_id,
    created_at
)
SELECT
    st.id,
    st.intervention_id,
    st.campagne_id,
    st.demande_id,
    COALESCE(
        NULLIF(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.sample_local_ref') END, ''),
        NULLIF(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.point_code') END, ''),
        'SDG-' || printf('%04d', es.id)
    ),
    es.essai_code,
    1,
    COALESCE(
        NULLIF(CASE WHEN json_valid(es.resultats) THEN json_extract(es.resultats, '$.section_controlee') END, ''),
        NULLIF(es.source_label, ''),
        NULLIF(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.sheet_name') END, ''),
        NULLIF(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.source_file') END, ''),
        ''
    ),
    COALESCE(NULLIF(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.sheet_name') END, ''), ''),
    '',
    NULL,
    NULL,
    es.resultat_principal,
    COALESCE(es.resultat_unite, ''),
    'Point migré depuis essai historique ' || es.essai_code,
    json_object(
        'migration_source', 'essais',
        'source_essai_id', es.id,
        'source_echantillon_id', es.echantillon_id,
        'header_snapshot', json(CASE WHEN json_valid(es.resultats) THEN COALESCE(json_extract(es.resultats, '$.header_snapshot'), '[]') ELSE '[]' END),
        'rows', json(CASE WHEN json_valid(es.resultats) THEN COALESCE(json_extract(es.resultats, '$.rows'), '[]') ELSE '[]' END),
        'couches_importees', json(CASE WHEN json_valid(es.resultats) THEN COALESCE(json_extract(es.resultats, '$.couches'), '[]') ELSE '[]' END),
        'resultat_label', COALESCE(es.resultat_label, ''),
        'source_file', COALESCE(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.source_file') END, ''),
        'sheet_name', COALESCE(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.sheet_name') END, ''),
        'sample_local_ref', COALESCE(CASE WHEN json_valid(es.observations) THEN json_extract(es.observations, '$.sample_local_ref') END, ''),
        'observations', json(CASE WHEN json_valid(es.observations) THEN es.observations ELSE '{}' END)
    ),
    es.id,
    COALESCE(es.created_at, datetime('now'))
FROM essais es
JOIN series_essais_terrain st ON st.source_essai_id = es.id
WHERE es.essai_code IN ('SO', 'SC')
  AND NOT EXISTS (
        SELECT 1
        FROM points_terrain pt
        WHERE pt.source_essai_id = es.id
    );

-- 2.4. Enrichissement de la feuille terrain avec la liste des points créés
UPDATE feuilles_terrain
SET resultats_json = json_set(
        CASE
            WHEN json_valid(resultats_json) THEN resultats_json
            ELSE '{}'
        END,
        '$.points',
        COALESCE((
            SELECT json_group_array(
                json_object(
                    'point_id', pt.id,
                    'point_code', pt.point_code,
                    'localisation', pt.localisation,
                    'profondeur_finale_m', pt.profondeur_bas,
                    'point_type', pt.point_type
                )
            )
            FROM points_terrain pt
            WHERE pt.serie_id = feuilles_terrain.serie_id
            ORDER BY pt.ordre, pt.id
        ), '[]')
    ),
    updated_at = datetime('now')
WHERE code_feuille IN ('SO', 'SC');

-- -----------------------------------------------------------------------------
-- 3. LIAISON PRÉLÈVEMENTS -> POINTS / COUCHES
-- -----------------------------------------------------------------------------

-- 3.1. Quand un prélèvement historique est déjà relié à l'échantillon / essai SO / SC
--      source, on le rattache automatiquement au point migré de cette feuille.
UPDATE prelevements
SET point_terrain_id = (
                SELECT pt.id
                FROM echantillons ech
                JOIN essais es ON es.echantillon_id = ech.id
                JOIN points_terrain pt ON pt.source_essai_id = es.id
                WHERE ech.prelevement_id = prelevements.id
                    AND es.essai_code IN ('SO', 'SC')
                ORDER BY pt.id ASC
                LIMIT 1
        ),
        updated_at = datetime('now')
WHERE COALESCE(point_terrain_id, 0) = 0
    AND EXISTS (
                SELECT 1
                FROM echantillons ech
                JOIN essais es ON es.echantillon_id = ech.id
                JOIN points_terrain pt ON pt.source_essai_id = es.id
                WHERE ech.prelevement_id = prelevements.id
                    AND es.essai_code IN ('SO', 'SC')
        );

-- 3.2. Aucune affectation automatique couche n'est faite ici.
--      Le rattachement de `sondage_couche_id` reste métier et doit être confirmé
--      à partir de la description géotechnique effective.

COMMIT;
