-- 2026_04_13_add_forme_granulo_sondage_couches.sql
-- Adds missing fields from the geotechnical description sheet to sondage_couches.
-- Run once on the target SQLite database.

ALTER TABLE sondage_couches ADD COLUMN granulo_elements TEXT;
ALTER TABLE sondage_couches ADD COLUMN forme_elements TEXT;
