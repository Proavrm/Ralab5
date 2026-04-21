
#!/usr/bin/env python3
"""
seed_ralab_geotech_cases.py

Insert reusable geotechnical test cases into a RaLab SQLite database.

This script:
- optionally copies a source database to a target database
- creates the missing support objects for:
    - plans d'implantation
    - nivellements
- inserts a complete geotechnical workflow case as if a user had created it:
    affaire -> demande -> preparation -> campagne -> interventions
    -> terrain sheets / prelevements -> echantillons -> essais -> rapports

The script is idempotent per case_code thanks to the scenario_seed_runs table.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any


NOW = "2026-04-13 10:00:00"


@dataclass
class InsertSummary:
    case_code: str
    affaire_reference: str
    demande_reference: str
    campagne_reference: str
    intervention_references: list[str]
    prelevement_references: list[str]
    echantillon_references: list[str]
    essai_refs: list[str]
    report_references: list[str]
    plan_reference: str
    nivellement_reference: str


def connect_db(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def ensure_column(conn: sqlite3.Connection, table_name: str, column_name: str, column_ddl: str) -> None:
    existing = {
        str(row["name"])
        for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    }
    if column_name not in existing:
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_ddl}")



def ensure_support_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS scenario_seed_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_code TEXT NOT NULL UNIQUE,
            inserted_at TEXT NOT NULL DEFAULT (datetime('now')),
            affaire_id INTEGER,
            demande_id INTEGER,
            campagne_id INTEGER,
            notes TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS interventions_legacy (
            id INTEGER PRIMARY KEY,
            reference TEXT NOT NULL DEFAULT '',
            demande_id INTEGER,
            campagne_id INTEGER,
            date_intervention TEXT NOT NULL DEFAULT '',
            type_intervention TEXT NOT NULL DEFAULT '',
            sujet TEXT NOT NULL DEFAULT '',
            statut TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS campagnes (
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
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            programme_specifique TEXT NOT NULL DEFAULT '',
            nb_points_prevus TEXT NOT NULL DEFAULT '',
            types_essais_prevus TEXT NOT NULL DEFAULT '',
            attribue_a TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS campagne_preparations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campagne_id INTEGER NOT NULL REFERENCES campagnes(id) ON DELETE CASCADE,
            phase_operation TEXT NOT NULL DEFAULT '',
            attentes_client TEXT NOT NULL DEFAULT '',
            contexte_operationnel TEXT NOT NULL DEFAULT '',
            objectifs TEXT NOT NULL DEFAULT '',
            points_vigilance TEXT NOT NULL DEFAULT '',
            acces_site TEXT NOT NULL DEFAULT '',
            contraintes_delais TEXT NOT NULL DEFAULT '',
            hse TEXT NOT NULL DEFAULT '',
            programme_investigations TEXT NOT NULL DEFAULT '',
            ressources TEXT NOT NULL DEFAULT '',
            comments TEXT NOT NULL DEFAULT '',
            source_demande_preparation_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS series_essais_terrain (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference TEXT NOT NULL UNIQUE,
            demande_id INTEGER REFERENCES demandes(id) ON DELETE SET NULL,
            campagne_id INTEGER REFERENCES campagnes(id) ON DELETE SET NULL,
            intervention_id INTEGER REFERENCES interventions_legacy(id) ON DELETE SET NULL,
            code_essai TEXT NOT NULL DEFAULT '',
            libelle_essai TEXT NOT NULL DEFAULT '',
            source_file TEXT NOT NULL DEFAULT '',
            sheet_name TEXT NOT NULL DEFAULT '',
            group_signature TEXT NOT NULL DEFAULT '',
            import_mode TEXT NOT NULL DEFAULT '',
            statut TEXT NOT NULL DEFAULT 'Importée',
            date_essai TEXT NOT NULL DEFAULT '',
            operateur TEXT NOT NULL DEFAULT '',
            section_controlee TEXT NOT NULL DEFAULT '',
            couche TEXT NOT NULL DEFAULT '',
            observations TEXT NOT NULL DEFAULT '',
            payload_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS points_terrain (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            serie_id INTEGER NOT NULL REFERENCES series_essais_terrain(id) ON DELETE CASCADE,
            intervention_id INTEGER REFERENCES interventions_legacy(id) ON DELETE SET NULL,
            campagne_id INTEGER REFERENCES campagnes(id) ON DELETE SET NULL,
            demande_id INTEGER REFERENCES demandes(id) ON DELETE SET NULL,
            point_code TEXT NOT NULL DEFAULT '',
            point_type TEXT NOT NULL DEFAULT '',
            ordre INTEGER NOT NULL DEFAULT 0,
            localisation TEXT NOT NULL DEFAULT '',
            position_label TEXT NOT NULL DEFAULT '',
            profil TEXT NOT NULL DEFAULT '',
            profondeur_haut REAL,
            profondeur_bas REAL,
            valeur_principale REAL,
            unite_principale TEXT NOT NULL DEFAULT '',
            observation TEXT NOT NULL DEFAULT '',
            payload_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS essais_terrain (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            serie_id INTEGER NOT NULL REFERENCES series_essais_terrain(id) ON DELETE CASCADE,
            point_id INTEGER REFERENCES points_terrain(id) ON DELETE SET NULL,
            intervention_id INTEGER REFERENCES interventions_legacy(id) ON DELETE SET NULL,
            campagne_id INTEGER REFERENCES campagnes(id) ON DELETE SET NULL,
            demande_id INTEGER REFERENCES demandes(id) ON DELETE SET NULL,
            essai_code TEXT NOT NULL DEFAULT '',
            type_essai TEXT NOT NULL DEFAULT '',
            norme TEXT NOT NULL DEFAULT '',
            statut TEXT NOT NULL DEFAULT 'Importé',
            date_essai TEXT NOT NULL DEFAULT '',
            operateur TEXT NOT NULL DEFAULT '',
            resultats_json TEXT NOT NULL DEFAULT '{}',
            resultat_principal REAL,
            resultat_unite TEXT NOT NULL DEFAULT '',
            resultat_label TEXT NOT NULL DEFAULT '',
            observations TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS feuilles_terrain (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference TEXT NOT NULL UNIQUE,
            demande_id INTEGER REFERENCES demandes(id) ON DELETE SET NULL,
            campagne_id INTEGER REFERENCES campagnes(id) ON DELETE SET NULL,
            intervention_id INTEGER REFERENCES interventions(id) ON DELETE SET NULL,
            serie_id INTEGER REFERENCES series_essais_terrain(id) ON DELETE SET NULL,
            code_feuille TEXT NOT NULL DEFAULT '',
            label TEXT NOT NULL DEFAULT '',
            norme TEXT NOT NULL DEFAULT '',
            date_feuille TEXT NOT NULL DEFAULT '',
            operateur TEXT NOT NULL DEFAULT '',
            statut TEXT NOT NULL DEFAULT 'Brouillon',
            observations TEXT NOT NULL DEFAULT '',
            resultats_json TEXT NOT NULL DEFAULT '{}',
            resultat_principal REAL,
            resultat_unite TEXT NOT NULL DEFAULT '',
            resultat_label TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS rapports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference TEXT NOT NULL UNIQUE,
            type_rapport TEXT NOT NULL DEFAULT '',
            demande_id INTEGER REFERENCES demandes(id) ON DELETE SET NULL,
            campagne_id INTEGER REFERENCES campagnes(id) ON DELETE SET NULL,
            intervention_id INTEGER REFERENCES interventions(id) ON DELETE SET NULL,
            serie_id INTEGER REFERENCES series_essais_terrain(id) ON DELETE SET NULL,
            essai_id INTEGER REFERENCES essais(id) ON DELETE SET NULL,
            essai_terrain_id INTEGER REFERENCES essais_terrain(id) ON DELETE SET NULL,
            fiche_synthese_id INTEGER,
            titre TEXT NOT NULL DEFAULT '',
            date_rapport TEXT NOT NULL DEFAULT '',
            redacteur TEXT NOT NULL DEFAULT '',
            statut TEXT NOT NULL DEFAULT 'Importé',
            summary TEXT NOT NULL DEFAULT '',
            conclusions TEXT NOT NULL DEFAULT '',
            payload_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS plans_implantation (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference TEXT NOT NULL UNIQUE,
            demande_id INTEGER NOT NULL REFERENCES demandes(id) ON DELETE CASCADE,
            campagne_id INTEGER REFERENCES campagnes(id) ON DELETE SET NULL,
            intervention_id INTEGER REFERENCES interventions(id) ON DELETE SET NULL,
            titre TEXT NOT NULL DEFAULT '',
            date_plan TEXT NOT NULL DEFAULT '',
            operateur TEXT NOT NULL DEFAULT '',
            zone TEXT NOT NULL DEFAULT '',
            fond_plan TEXT NOT NULL DEFAULT '',
            systeme_reperage TEXT NOT NULL DEFAULT '',
            repere_base TEXT NOT NULL DEFAULT '',
            observations TEXT NOT NULL DEFAULT '',
            statut TEXT NOT NULL DEFAULT 'Brouillon',
            payload_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS plan_implantation_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_implantation_id INTEGER NOT NULL REFERENCES plans_implantation(id) ON DELETE CASCADE,
            point_code TEXT NOT NULL DEFAULT '',
            point_type TEXT NOT NULL DEFAULT '',
            ordre INTEGER NOT NULL DEFAULT 0,
            x REAL,
            y REAL,
            z REAL,
            pk TEXT NOT NULL DEFAULT '',
            axe TEXT NOT NULL DEFAULT '',
            remarque TEXT NOT NULL DEFAULT '',
            statut_implantation TEXT NOT NULL DEFAULT 'Prévu',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS nivellements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference TEXT NOT NULL UNIQUE,
            demande_id INTEGER NOT NULL REFERENCES demandes(id) ON DELETE CASCADE,
            campagne_id INTEGER REFERENCES campagnes(id) ON DELETE SET NULL,
            intervention_id INTEGER REFERENCES interventions(id) ON DELETE SET NULL,
            titre TEXT NOT NULL DEFAULT '',
            date_releve TEXT NOT NULL DEFAULT '',
            operateur TEXT NOT NULL DEFAULT '',
            referentiel_altimetrique TEXT NOT NULL DEFAULT '',
            materiel TEXT NOT NULL DEFAULT '',
            observations TEXT NOT NULL DEFAULT '',
            statut TEXT NOT NULL DEFAULT 'Brouillon',
            payload_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS nivellement_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nivellement_id INTEGER NOT NULL REFERENCES nivellements(id) ON DELETE CASCADE,
            point_code TEXT NOT NULL DEFAULT '',
            ordre INTEGER NOT NULL DEFAULT 0,
            repere TEXT NOT NULL DEFAULT '',
            altitude_terrain REAL,
            cote_projet REAL,
            ecart REAL,
            observation TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_plan_implantation_demande
            ON plans_implantation(demande_id);

        CREATE INDEX IF NOT EXISTS idx_plan_implantation_campagne
            ON plans_implantation(campagne_id);

        CREATE INDEX IF NOT EXISTS idx_nivellements_demande
            ON nivellements(demande_id);

        CREATE INDEX IF NOT EXISTS idx_nivellements_campagne
            ON nivellements(campagne_id);
        """
    )

    ensure_column(conn, "demande_preparations", "type_intervention_prevu", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "demande_preparations", "finalite", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "demande_preparations", "zone_localisation", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "demande_preparations", "materiau_objet", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "demande_preparations", "objectif_mission", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "demande_preparations", "responsable_referent", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "demande_preparations", "attribue_a", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "demande_preparations", "priorite", "TEXT NOT NULL DEFAULT 'Normale'")
    ensure_column(conn, "demande_preparations", "date_prevue", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "demande_preparations", "nb_points_prevus", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "demande_preparations", "types_essais_prevus", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "demande_preparations", "criteres_conformite", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "demande_preparations", "livrables_attendus", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "demande_preparations", "remarques", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "demande_preparations", "familles_prevues", "TEXT NOT NULL DEFAULT '[]'")

    ensure_column(conn, "interventions", "campagne_id", "INTEGER")
    ensure_column(conn, "interventions", "finalite", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "interventions", "zone", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "interventions", "heure_debut", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "interventions", "heure_fin", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "interventions", "source_year", "INTEGER")
    ensure_column(conn, "interventions", "legacy_intervention_id", "INTEGER")
    ensure_column(conn, "interventions", "legacy_intervention_reelle_id", "INTEGER")

    ensure_column(conn, "prelevements", "intervention_id", "INTEGER")
    ensure_column(conn, "prelevements", "legacy_prelevement_id", "INTEGER")
    ensure_column(conn, "prelevements", "legacy_intervention_reelle_id", "INTEGER")
    ensure_column(conn, "prelevements", "migration_created", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "prelevements", "migration_reason", "TEXT NOT NULL DEFAULT ''")

    ensure_column(conn, "echantillons", "intervention_id", "INTEGER")
    ensure_column(conn, "echantillons", "migration_created", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "echantillons", "migration_reason", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "echantillons", "legacy_echantillon_id", "INTEGER")

    ensure_column(conn, "essais", "intervention_id", "INTEGER")
    ensure_column(conn, "essais", "source_signature", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "essais", "source_label", "TEXT NOT NULL DEFAULT ''")

    ensure_column(conn, "rapports", "plan_implantation_id", "INTEGER")
    ensure_column(conn, "rapports", "nivellement_id", "INTEGER")
    ensure_column(conn, "rapports", "feuille_terrain_id", "INTEGER")

    sync_interventions_legacy(conn)


def sync_interventions_legacy(conn: sqlite3.Connection) -> None:
    exists = fetch_scalar(
        conn,
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'interventions_legacy'",
    )
    if not exists:
        return

    rows = conn.execute(
        "SELECT id, reference, demande_id, campagne_id, date_intervention, type_intervention, sujet, statut, created_at, updated_at FROM interventions"
    ).fetchall()
    for row in rows:
        conn.execute(
            """
            INSERT INTO interventions_legacy (
                id, reference, demande_id, campagne_id, date_intervention,
                type_intervention, sujet, statut, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                reference = excluded.reference,
                demande_id = excluded.demande_id,
                campagne_id = excluded.campagne_id,
                date_intervention = excluded.date_intervention,
                type_intervention = excluded.type_intervention,
                sujet = excluded.sujet,
                statut = excluded.statut,
                updated_at = excluded.updated_at
            """,
            (
                row["id"],
                row["reference"],
                row["demande_id"],
                row["campagne_id"],
                row["date_intervention"],
                row["type_intervention"],
                row["sujet"],
                row["statut"],
                row["created_at"] or NOW,
                row["updated_at"] or NOW,
            ),
        )


def fetch_scalar(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> Any:
    row = conn.execute(sql, params).fetchone()
    if row is None:
        return None
    return row[0]


def next_affaire_reference(conn: sqlite3.Connection, year: int = 2026, region: str = "RA") -> tuple[str, int]:
    max_num = fetch_scalar(
        conn,
        "SELECT COALESCE(MAX(numero), 0) FROM affaires_rst WHERE annee = ? AND region = ?",
        (year, region),
    )
    number = int(max_num or 0) + 1
    return f"{year}-{region}-{number:03d}", number


def next_demande_reference(conn: sqlite3.Connection, labo_code: str, year: int = 2026) -> tuple[str, int]:
    max_num = fetch_scalar(
        conn,
        "SELECT COALESCE(MAX(numero), 0) FROM demandes WHERE annee = ?",
        (year,),
    )
    number = int(max_num or 0) + 1
    return f"{year}-{labo_code}-D{number:04d}", number


def next_intervention_reference(conn: sqlite3.Connection, labo_code: str, year: int = 2026) -> tuple[str, int]:
    max_num = fetch_scalar(
        conn,
        "SELECT COALESCE(MAX(numero), 0) FROM interventions WHERE annee = ? AND labo_code = ?",
        (year, labo_code),
    )
    number = int(max_num or 0) + 1
    return f"{year}-{labo_code}-I{number:04d}", number


def next_echantillon_reference(conn: sqlite3.Connection, labo_code: str, year: int = 2026) -> tuple[str, int]:
    max_num = fetch_scalar(
        conn,
        "SELECT COALESCE(MAX(numero), 0) FROM echantillons WHERE annee = ? AND labo_code = ?",
        (year, labo_code),
    )
    number = int(max_num or 0) + 1
    return f"{year}-{labo_code}-E{number:04d}", number


def next_prefixed_reference(conn: sqlite3.Connection, table_name: str, prefix: str, width: int = 4) -> str:
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    numbers: list[int] = []
    rows = conn.execute(f"SELECT reference FROM {table_name} WHERE reference LIKE ?", (f"{prefix}%",)).fetchall()
    for row in rows:
        reference = str(row["reference"] or "")
        match = pattern.match(reference)
        if match:
            numbers.append(int(match.group(1)))
    return f"{prefix}{max(numbers, default=0) + 1:0{width}d}"


def next_report_reference(conn: sqlite3.Connection, demande_reference: str) -> str:
    prefix = f"{demande_reference}-R"
    return next_prefixed_reference(conn, "rapports", prefix, width=2)


def insert_demande_enabled_modules(conn: sqlite3.Connection, demande_id: int, enabled_codes: set[str]) -> None:
    all_codes = [
        "devis_facturation",
        "documents",
        "echantillons",
        "essais_externes",
        "essais_laboratoire",
        "essais_terrain",
        "etude_technique",
        "g3",
        "interventions",
        "planning",
    ]
    for code in all_codes:
        conn.execute(
            """
            INSERT INTO demande_enabled_modules (
                demande_id, module_code, is_enabled, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (demande_id, code, 1 if code in enabled_codes else 0, NOW, NOW),
        )


def insert_plan_implantation(
    conn: sqlite3.Connection,
    demande_id: int,
    campagne_id: int,
    intervention_id: int,
    campagne_reference: str,
) -> tuple[int, str]:
    reference = f"{campagne_reference}-PI-01"
    payload = {
        "type_document": "PLAN_IMPLANTATION",
        "description": "Plan d'implantation des points géotechniques de la campagne",
        "fond_plan": "Plan masse projet indice A",
        "repere_base": "RGF93 / NGF local chantier",
    }
    conn.execute(
        """
        INSERT INTO plans_implantation (
            reference, demande_id, campagne_id, intervention_id, titre,
            date_plan, operateur, zone, fond_plan, systeme_reperage,
            repere_base, observations, statut, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            reference,
            demande_id,
            campagne_id,
            intervention_id,
            "Plan d’implantation campagne géotechnique",
            "2026-04-16",
            "Technicien topo",
            "Plateforme / bassin / accès",
            "Plan masse projet indice A",
            "RGF93 Lambert 93",
            "RP-01",
            "Implantation des points pénétromètre, sondage et essais d’eau.",
            "Validé terrain",
            json.dumps(payload, ensure_ascii=False),
            NOW,
            NOW,
        ),
    )
    plan_id = int(fetch_scalar(conn, "SELECT last_insert_rowid()"))
    points = [
        ("PT1", "PENETROMETRE", 1, 854321.42, 6512034.11, None, "PK 0+020", "Axe A", ""),
        ("PT2", "PENETROMETRE", 2, 854333.08, 6512038.72, None, "PK 0+035", "Axe A", ""),
        ("PT3", "PENETROMETRE", 3, 854347.19, 6512042.85, None, "PK 0+050", "Axe A", ""),
        ("PT4", "PENETROMETRE", 4, 854360.41, 6512048.22, None, "PK 0+065", "Axe B", ""),
        ("PT5", "PENETROMETRE", 5, 854372.64, 6512052.16, None, "PK 0+080", "Axe B", ""),
        ("PT6", "PENETROMETRE", 6, 854384.90, 6512057.33, None, "PK 0+095", "Axe B", ""),
        ("SP1", "SONDAGE_PELLE", 7, 854325.02, 6512018.66, None, "PK 0+010", "Bassin", ""),
        ("SP2", "SONDAGE_PELLE", 8, 854351.73, 6512023.47, None, "PK 0+040", "Bassin", ""),
        ("SP3", "SONDAGE_PELLE", 9, 854378.55, 6512027.80, None, "PK 0+070", "Bassin", ""),
        ("SP4", "SONDAGE_PELLE", 10, 854401.17, 6512032.55, None, "PK 0+095", "Accès", ""),
        ("EAU1", "ESSAI_EAU", 11, 854337.44, 6512004.91, None, "PK 0+025", "Fossé", ""),
        ("EAU2", "ESSAI_EAU", 12, 854365.08, 6512008.64, None, "PK 0+060", "Fossé", ""),
        ("EAU3", "ESSAI_EAU", 13, 854392.67, 6512014.05, None, "PK 0+090", "Fossé", ""),
    ]
    for point in points:
        conn.execute(
            """
            INSERT INTO plan_implantation_points (
                plan_implantation_id, point_code, point_type, ordre, x, y, z, pk, axe,
                remarque, statut_implantation, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (plan_id, *point, "Implanté", NOW),
        )
    return plan_id, reference


def insert_nivellement(
    conn: sqlite3.Connection,
    demande_id: int,
    campagne_id: int,
    intervention_id: int,
    campagne_reference: str,
) -> tuple[int, str]:
    reference = f"{campagne_reference}-NIV-01"
    payload = {
        "type_document": "NIVELLEMENT",
        "materiel": "Niveau optique + mire",
        "referentiel": "NGF local chantier",
    }
    conn.execute(
        """
        INSERT INTO nivellements (
            reference, demande_id, campagne_id, intervention_id, titre,
            date_releve, operateur, referentiel_altimetrique, materiel,
            observations, statut, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            reference,
            demande_id,
            campagne_id,
            intervention_id,
            "Nivellement initial des points de campagne",
            "2026-04-16",
            "Technicien topo",
            "NGF local chantier",
            "Niveau optique + mire",
            "Rattachement des points implantés avant démarrage des investigations.",
            "Validé terrain",
            json.dumps(payload, ensure_ascii=False),
            NOW,
            NOW,
        ),
    )
    nivellement_id = int(fetch_scalar(conn, "SELECT last_insert_rowid()"))
    points = [
        ("PT1", 1, "RP-01", 204.32, 204.20, 0.12, ""),
        ("PT2", 2, "RP-01", 204.28, 204.20, 0.08, ""),
        ("PT3", 3, "RP-01", 204.16, 204.10, 0.06, ""),
        ("PT4", 4, "RP-01", 203.98, 203.95, 0.03, ""),
        ("PT5", 5, "RP-01", 203.87, 203.90, -0.03, ""),
        ("PT6", 6, "RP-01", 203.75, 203.80, -0.05, ""),
        ("SP1", 7, "RP-01", 204.40, 204.25, 0.15, ""),
        ("SP2", 8, "RP-01", 204.22, 204.10, 0.12, ""),
        ("SP3", 9, "RP-01", 204.01, 203.95, 0.06, ""),
        ("SP4", 10, "RP-01", 203.79, 203.80, -0.01, ""),
        ("EAU1", 11, "RP-01", 204.36, 204.20, 0.16, ""),
        ("EAU2", 12, "RP-01", 204.07, 203.95, 0.12, ""),
        ("EAU3", 13, "RP-01", 203.82, 203.80, 0.02, ""),
    ]
    for point_code, ordre, repere, altitude, cote_projet, ecart, observation in points:
        conn.execute(
            """
            INSERT INTO nivellement_points (
                nivellement_id, point_code, ordre, repere, altitude_terrain,
                cote_projet, ecart, observation, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                nivellement_id,
                point_code,
                ordre,
                repere,
                altitude,
                cote_projet,
                ecart,
                observation,
                NOW,
            ),
        )
    return nivellement_id, reference


def insert_terrain_series(
    conn: sqlite3.Connection,
    demande_id: int,
    campagne_id: int,
    intervention_id: int,
    campaign_ref: str,
    code: str,
    label: str,
    date_essai: str,
    operateur: str,
    section_controlee: str,
    observations: str,
    points: list[dict[str, Any]],
) -> tuple[int, str]:
    series_ref = next_prefixed_reference(conn, "series_essais_terrain", f"{campaign_ref}-{code}-", width=2)
    payload = {
        "manual_case": True,
        "points_count": len(points),
        "points": points,
    }
    conn.execute(
        """
        INSERT INTO series_essais_terrain (
            reference, demande_id, campagne_id, intervention_id,
            code_essai, libelle_essai, source_file, sheet_name, group_signature,
            import_mode, statut, date_essai, operateur, section_controlee,
            couche, observations, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            series_ref,
            demande_id,
            campagne_id,
            intervention_id,
            code,
            label,
            "",
            "",
            f"{campaign_ref}|{code}|manual",
            "manual",
            "Réalisée",
            date_essai,
            operateur,
            section_controlee,
            "",
            observations,
            json.dumps(payload, ensure_ascii=False),
            NOW,
            NOW,
        ),
    )
    return int(fetch_scalar(conn, "SELECT last_insert_rowid()")), series_ref


def insert_point_terrain_and_essai(
    conn: sqlite3.Connection,
    serie_id: int,
    intervention_id: int,
    campagne_id: int,
    demande_id: int,
    point_code: str,
    point_type: str,
    ordre: int,
    localisation: str,
    position_label: str,
    profondeur_haut: float | None,
    profondeur_bas: float | None,
    valeur_principale: float | None,
    unite_principale: str,
    observation: str,
    payload_json: dict[str, Any],
    essai_code: str,
    type_essai: str,
    norme: str,
    date_essai: str,
    operateur: str,
    resultat_label: str,
    resultats_json: dict[str, Any],
) -> tuple[int, int]:
    conn.execute(
        """
        INSERT INTO points_terrain (
            serie_id, intervention_id, campagne_id, demande_id, point_code, point_type,
            ordre, localisation, position_label, profil, profondeur_haut, profondeur_bas,
            valeur_principale, unite_principale, observation, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            serie_id,
            intervention_id,
            campagne_id,
            demande_id,
            point_code,
            point_type,
            ordre,
            localisation,
            position_label,
            "",
            profondeur_haut,
            profondeur_bas,
            valeur_principale,
            unite_principale,
            observation,
            json.dumps(payload_json, ensure_ascii=False),
            NOW,
        ),
    )
    point_id = int(fetch_scalar(conn, "SELECT last_insert_rowid()"))
    conn.execute(
        """
        INSERT INTO essais_terrain (
            serie_id, point_id, intervention_id, campagne_id, demande_id,
            essai_code, type_essai, norme, statut, date_essai, operateur,
            resultats_json, resultat_principal, resultat_unite, resultat_label,
            observations, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            serie_id,
            point_id,
            intervention_id,
            campagne_id,
            demande_id,
            essai_code,
            type_essai,
            norme,
            "Réalisé",
            date_essai,
            operateur,
            json.dumps(resultats_json, ensure_ascii=False),
            valeur_principale,
            unite_principale,
            resultat_label,
            observation,
            NOW,
            NOW,
        ),
    )
    essai_terrain_id = int(fetch_scalar(conn, "SELECT last_insert_rowid()"))
    return point_id, essai_terrain_id


def insert_front_facing_terrain_sheet(
    conn: sqlite3.Connection,
    demande_id: int,
    campagne_id: int,
    intervention_id: int,
    serie_id: int,
    essai_code: str,
    type_essai: str,
    norme: str,
    statut: str,
    date_debut: str,
    operateur: str,
    observations: str,
    resultats: dict[str, Any],
) -> tuple[int, str]:
    reference = next_prefixed_reference(conn, "feuilles_terrain", "FT-MAN-", width=4)
    label_map = {
        "PA": ("Profondeur finale moyenne", "m"),
        "SO": ("Profondeur finale moyenne", "m"),
        "PER": ("Infiltration moyenne", "mm/h"),
    }
    label, unit = label_map.get(essai_code, ("Résultat principal", ""))
    principal = resultats.get("resultat_principal")
    conn.execute(
        """
        INSERT INTO feuilles_terrain (
            reference, demande_id, campagne_id, intervention_id, serie_id, code_feuille,
            label, norme, date_feuille, operateur, statut, observations, resultats_json,
            resultat_principal, resultat_unite, resultat_label, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            reference,
            demande_id,
            campagne_id,
            intervention_id,
            serie_id,
            essai_code,
            type_essai,
            norme,
            date_debut,
            operateur,
            statut,
            observations,
            json.dumps(resultats, ensure_ascii=False),
            principal,
            unit,
            label,
            NOW,
            NOW,
        ),
    )
    feuille_id = int(fetch_scalar(conn, "SELECT last_insert_rowid()"))
    return feuille_id, reference


def insert_report(
    conn: sqlite3.Connection,
    demande_id: int,
    campagne_id: int | None,
    intervention_id: int | None,
    serie_id: int | None,
    essai_id: int | None,
    essai_terrain_id: int | None,
    feuille_terrain_id: int | None,
    plan_implantation_id: int | None,
    nivellement_id: int | None,
    type_rapport: str,
    titre: str,
    date_rapport: str,
    redacteur: str,
    statut: str,
    summary: str,
    conclusions: str,
    payload_json: dict[str, Any],
    demande_reference: str,
) -> tuple[int, str]:
    reference = next_report_reference(conn, demande_reference)
    conn.execute(
        """
        INSERT INTO rapports (
            reference, type_rapport, demande_id, campagne_id, intervention_id,
            serie_id, essai_id, essai_terrain_id, fiche_synthese_id,
            titre, date_rapport, redacteur, statut, summary, conclusions,
            payload_json, feuille_terrain_id, plan_implantation_id, nivellement_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            reference,
            type_rapport,
            demande_id,
            campagne_id,
            intervention_id,
            serie_id,
            essai_id,
            essai_terrain_id,
            titre,
            date_rapport,
            redacteur,
            statut,
            summary,
            conclusions,
            json.dumps(payload_json, ensure_ascii=False),
            feuille_terrain_id,
            plan_implantation_id,
            nivellement_id,
            NOW,
            NOW,
        ),
    )
    return int(fetch_scalar(conn, "SELECT last_insert_rowid()")), reference


def insert_lab_essai(
    conn: sqlite3.Connection,
    echantillon_id: int,
    essai_code: str,
    type_essai: str,
    norme: str,
    date_debut: str,
    date_fin: str,
    operateur: str,
    resultats: dict[str, Any],
    observations: str,
    resultat_principal: float | None,
    resultat_unite: str,
    resultat_label: str,
) -> int:
    conn.execute(
        """
        INSERT INTO essais (
            echantillon_id, intervention_id, essai_code, type_essai, norme, statut,
            date_debut, date_fin, resultats, operateur, observations, source_signature,
            source_label, resultat_principal, resultat_unite, resultat_label, created_at, updated_at
        ) VALUES (?, NULL, ?, ?, ?, 'Terminé', ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?)
        """,
        (
            echantillon_id,
            essai_code,
            type_essai,
            norme,
            date_debut,
            date_fin,
            json.dumps(resultats, ensure_ascii=False),
            operateur,
            observations,
            resultat_principal,
            resultat_unite,
            resultat_label,
            NOW,
            NOW,
        ),
    )
    return int(fetch_scalar(conn, "SELECT last_insert_rowid()"))


def build_we_result(w_moyen: float) -> dict[str, Any]:
    return {
        "usage": "wn",
        "methode": "105",
        "determinations": [
            {"id": 1, "boite": "B1", "m1": 102.1, "m2": 362.4, "m3": 338.7, "actif": True},
            {"id": 2, "boite": "B2", "m1": 99.4, "m2": 354.6, "m3": 331.3, "actif": True},
        ],
        "w_moyen": w_moyen,
        "nb_det": 2,
    }


def build_gr_result(passant_80: float, coeff_vbs: float, model: str = "Sols GTR") -> dict[str, Any]:
    return {
        "modele": model,
        "m1": 100.0,
        "m2": 365.0,
        "m3": 343.0,
        "mh": 500.0,
        "w": 6.87,
        "ms": 467.8,
        "tamis": [
            {"d": 0.08, "r": 84.0},
            {"d": 0.2, "r": 52.0},
            {"d": 0.5, "r": 38.0},
            {"d": 1, "r": 31.0},
            {"d": 2, "r": 27.0},
            {"d": 5, "r": 21.0},
            {"d": 10, "r": 18.0},
            {"d": 20, "r": 14.0},
            {"d": 31.5, "r": 9.0},
            {"d": 50, "r": 6.0},
            {"d": 63, "r": 4.0},
            {"d": 80, "r": 3.0},
        ],
        "passant_80": passant_80,
        "coeff_vbs": coeff_vbs,
    }


def build_vbs_result(vbs_mean: float) -> dict[str, Any]:
    return {
        "type_materiau": "sols",
        "methode": "nf_p_94_068",
        "m1": 100.0,
        "m2": 360.0,
        "m3": 343.0,
        "ms": 243.0,
        "w": 7.0,
        "determinations": [
            {"actif": True, "numero": 1, "m_humide": 60.0, "v_bleu": 2.8, "c_bleu": 1.0, "m_seche": 56.1, "vbs": vbs_mean},
            {"actif": True, "numero": 2, "m_humide": 60.0, "v_bleu": 2.9, "c_bleu": 1.0, "m_seche": 56.1, "vbs": vbs_mean + 0.1},
        ],
        "vbs_moyen": vbs_mean,
        "vb_moyen": vbs_mean,
    }


def build_lcp_result(wl: float, wp: float) -> dict[str, Any]:
    return {
        "wl": wl,
        "wp": wp,
        "ip": round(wl - wp, 2),
    }


def build_id_result(gtr_class: str, vbs: float, ipi: float) -> dict[str, Any]:
    return {
        "gtr_class": gtr_class,
        "gtr_state": "h",
        "vbs": vbs,
        "ipi": ipi,
    }


def insert_case_geo_full_01(conn: sqlite3.Connection) -> InsertSummary:
    case_code = "geo_full_01"
    existing = conn.execute(
        "SELECT case_code FROM scenario_seed_runs WHERE case_code = ?",
        (case_code,),
    ).fetchone()
    if existing:
        raise ValueError(f"Le cas {case_code} existe déjà dans cette base.")

    year = 2026
    labo_code = "RST"

    affaire_reference, affaire_numero = next_affaire_reference(conn, year=year, region="RA")
    conn.execute(
        """
        INSERT INTO affaires_rst (
            reference, annee, region, numero, client, titulaire, chantier,
            affaire_nge, date_ouverture, date_cloture, statut, responsable,
            source_legacy_id, created_at, updated_at, site, numero_etude, filiale
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?)
        """,
        (
            affaire_reference,
            year,
            "RA",
            affaire_numero,
            "GUINTOLI",
            "GUINTOLI",
            "Plateforme technique et bassin - reconnaissance géotechnique",
            "non communiqué",
            "2026-04-14",
            "En cours",
            "Marco COSTA PEREIRA",
            NOW,
            NOW,
            "SAINT-PRIEST (69)",
            "GEO-CAMP-001",
            "GUINTOLI",
        ),
    )
    affaire_id = int(fetch_scalar(conn, "SELECT last_insert_rowid()"))

    demande_reference, demande_numero = next_demande_reference(conn, labo_code=labo_code, year=year)
    conn.execute(
        """
        INSERT INTO demandes (
            reference, annee, labo_code, numero, affaire_rst_id, numero_dst,
            type_mission, nature, description, observations, demandeur,
            date_reception, date_echeance, date_cloture, statut, priorite,
            a_revoir, note_reconciliation, suivi_notes, dossier_nom, dossier_path,
            rapport_ref, rapport_envoye, date_envoi_rapport, devis_ref, facture_ref,
            source_legacy_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, '', ?, '', '', '', 0, NULL, '', '', NULL, ?, ?)
        """,
        (
            demande_reference,
            year,
            labo_code,
            demande_numero,
            affaire_id,
            "",
            "Exploitation G3",
            "Campagne géotechnique terrain - implantation, nivellement, pénétromètres, sondages à la pelle et essais d’eau",
            "Reconnaissance préalable de la plateforme, du bassin et des accès. Vérification des horizons, des niveaux d’eau et préparation des prélèvements pour identification laboratoire.",
            "Cas de test inséré automatiquement pour validation du parcours métier complet.",
            "Marco COSTA PEREIRA",
            "2026-04-14",
            "2026-04-18",
            "En cours",
            "Haute",
            "Suivi campagne géotechnique, prélèvements labo et synthèse terrain.",
            NOW,
            NOW,
        ),
    )
    demande_id = int(fetch_scalar(conn, "SELECT last_insert_rowid()"))

    preparation_payload = {
        "phase_operation": "Préparation terrain",
        "contexte_operationnel": "Plateforme technique, bassin projeté, accès chantier et fossé périphérique.",
        "objectifs": "Implanter les points, niveler la campagne, réaliser les reconnaissances pénétromètre, les sondages à la pelle, les essais d’eau et préparer les prélèvements pour le laboratoire.",
        "points_vigilance": "Réseaux enterrés, circulation engins, météo, stabilité locale des sondages ouverts.",
        "contraintes_acces": "Accès par piste chantier, coordination avec chef de chantier obligatoire avant terrassement.",
        "contraintes_delais": "Campagne à réaliser sur deux jours maximum.",
        "contraintes_hse": "DICT vérifiée, balisage zone fouille, EPI complets, présence pelle + homme trafic.",
        "attentes_client": "Obtenir une image claire des horizons, de l’eau et des matériaux disponibles avant exécution.",
        "programme_previsionnel": "Jour 1: implantation + nivellement + pénétromètres. Jour 2: sondages pelle + essais d’eau + prélèvements.",
        "ressources_notes": "1 technicien géotechnique, 1 aide terrain, 1 pelle, 1 opérateur topo, matériel PANDA, matériel infiltration.",
        "commentaires": "Préparation structurée pour un parcours test complet dans RaLab.",
        "type_intervention_prevu": "Reconnaissance géotechnique",
        "finalite": "Diagnostic d’anomalie / caractérisation géotechnique",
        "zone_localisation": "Plateforme / bassin / accès",
        "materiau_objet": "Sol",
        "objectif_mission": "Reconnaissance, implantation, nivellement, prélèvements et essais laboratoire associés.",
        "responsable_referent": "Marco COSTA PEREIRA",
        "attribue_a": "Technicien géotechnique chantier",
        "priorite": "Haute",
        "date_prevue": "2026-04-16",
        "nb_points_prevus": "13",
        "types_essais_prevus": "Implantation, nivellement, pénétromètres, sondages pelle, essais d’eau, WE, GR, VBS, LCP, ID",
        "criteres_conformite": "Données complètes par point, traçabilité prélèvements, restitution synthétique par intervention.",
        "livrables_attendus": "Plan d’implantation, tableau de nivellement, feuilles terrain, prélèvements, échantillons, essais labo, synthèse campagne.",
        "remarques": "Cas de test multi-objets pour valider la lisibilité UI et la cohérence DB.",
        "familles_prevues": json.dumps(["interventions", "essais_terrain", "echantillons", "essais_laboratoire", "documents", "g3"], ensure_ascii=False),
    }
    conn.execute(
        """
        INSERT INTO demande_preparations (
            demande_id, phase_operation, contexte_operationnel, objectifs, points_vigilance,
            contraintes_acces, contraintes_delais, contraintes_hse, attentes_client,
            programme_previsionnel, ressources_notes, commentaires, created_at, updated_at,
            type_intervention_prevu, finalite, zone_localisation, materiau_objet,
            objectif_mission, responsable_referent, attribue_a, priorite, date_prevue,
            nb_points_prevus, types_essais_prevus, criteres_conformite, livrables_attendus,
            remarques, familles_prevues
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            demande_id,
            preparation_payload["phase_operation"],
            preparation_payload["contexte_operationnel"],
            preparation_payload["objectifs"],
            preparation_payload["points_vigilance"],
            preparation_payload["contraintes_acces"],
            preparation_payload["contraintes_delais"],
            preparation_payload["contraintes_hse"],
            preparation_payload["attentes_client"],
            preparation_payload["programme_previsionnel"],
            preparation_payload["ressources_notes"],
            preparation_payload["commentaires"],
            NOW,
            NOW,
            preparation_payload["type_intervention_prevu"],
            preparation_payload["finalite"],
            preparation_payload["zone_localisation"],
            preparation_payload["materiau_objet"],
            preparation_payload["objectif_mission"],
            preparation_payload["responsable_referent"],
            preparation_payload["attribue_a"],
            preparation_payload["priorite"],
            preparation_payload["date_prevue"],
            preparation_payload["nb_points_prevus"],
            preparation_payload["types_essais_prevus"],
            preparation_payload["criteres_conformite"],
            preparation_payload["livrables_attendus"],
            preparation_payload["remarques"],
            preparation_payload["familles_prevues"],
        ),
    )
    demande_preparation_id = int(fetch_scalar(conn, "SELECT last_insert_rowid()"))
    insert_demande_enabled_modules(
        conn,
        demande_id,
        enabled_codes={
            "documents",
            "echantillons",
            "essais_laboratoire",
            "essais_terrain",
            "etude_technique",
            "g3",
            "interventions",
            "planning",
        },
    )

    campagne_reference = f"{demande_reference}-CGEO-01"
    conn.execute(
        """
        INSERT INTO campagnes (
            reference, demande_id, label, type_campagne, code, designation, zone_scope,
            temporalite, date_debut_prevue, date_fin_prevue, priorite, responsable_technique,
            criteres_controle, livrables_attendus, workflow_label, statut, notes,
            legacy_table, legacy_uid, migration_created, migration_reason, review_required,
            created_at, updated_at, programme_specifique, nb_points_prevus,
            types_essais_prevus, attribue_a
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', NULL, 0, '', 0, ?, ?, ?, ?, ?, ?)
        """,
        (
            campagne_reference,
            demande_id,
            "Campagne géotechnique préalable",
            "Géotechnique",
            "GEO",
            "Reconnaissance de la plateforme, du bassin et des accès",
            "Emprise nord + bassin + accès ouest",
            "Campagne sur 2 jours",
            "2026-04-16",
            "2026-04-17",
            "Haute",
            "Marco COSTA PEREIRA",
            "Traçabilité par point, traçabilité prélèvement -> échantillon -> essai, restitution synthétique par intervention.",
            "Plan d’implantation, nivellement, fiches terrain, prélèvements, échantillons, essais labo, synthèse campagne.",
            "Préparation -> Campagne -> Intervention -> Feuille terrain / Prélèvement -> Échantillon -> Essai -> Rapport",
            "Planifiée",
            "Campagne géotechnique de test insérée automatiquement.",
            NOW,
            NOW,
            "6 points pénétromètre, 4 sondages pelle, 3 essais d’eau, implantation générale, nivellement initial.",
            "13",
            "PLAN_IMPLANTATION, NIVELLEMENT, PA, SO, PER, WE, GR, VBS, LCP, ID",
            "Technicien géotechnique chantier",
        ),
    )
    campagne_id = int(fetch_scalar(conn, "SELECT last_insert_rowid()"))

    conn.execute(
        """
        INSERT INTO campagne_preparations (
            campagne_id, phase_operation, attentes_client, contexte_operationnel, objectifs,
            points_vigilance, acces_site, contraintes_delais, hse, programme_investigations,
            ressources, comments, source_demande_preparation_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            campagne_id,
            "Préparation terrain",
            preparation_payload["attentes_client"],
            preparation_payload["contexte_operationnel"],
            preparation_payload["objectifs"],
            preparation_payload["points_vigilance"],
            preparation_payload["contraintes_acces"],
            preparation_payload["contraintes_delais"],
            preparation_payload["contraintes_hse"],
            preparation_payload["programme_previsionnel"],
            preparation_payload["ressources_notes"],
            preparation_payload["commentaires"],
            demande_preparation_id,
            NOW,
            NOW,
        ),
    )

    intervention_specs = [
        {
            "type_intervention": "Implantation / nivellement",
            "sujet": "Plateforme / bassin / accès - implantation des points et nivellement initial",
            "date": "2026-04-16",
            "duree": 4.0,
            "geotechnicien": "Marco COSTA PEREIRA",
            "technicien": "Technicien topo",
            "finalite": "Implantation et repérage altimétrique",
            "zone": "Plateforme / bassin / accès",
            "observations": "Implantation des points PT1 à PT6, SP1 à SP4 et EAU1 à EAU3.",
            "statut": "Réalisée",
            "pv_ref": "",
            "rapport_ref": "",
            "heure_debut": "08:00",
            "heure_fin": "12:00",
        },
        {
            "type_intervention": "Pénétromètres dynamiques",
            "sujet": "Zone plateforme - 6 points pénétromètre",
            "date": "2026-04-16",
            "duree": 4.5,
            "geotechnicien": "Marco COSTA PEREIRA",
            "technicien": "Technicien géotechnique 1",
            "finalite": "Reconnaissance / portance relative",
            "zone": "Plateforme technique",
            "observations": "Pénétromètres PT1 à PT6 pour caractérisation relative des horizons et repérage des zones faibles.",
            "statut": "Réalisée",
            "pv_ref": "FT-PA-01",
            "rapport_ref": "",
            "heure_debut": "13:00",
            "heure_fin": "17:30",
        },
        {
            "type_intervention": "Sondages à la pelle",
            "sujet": "Bassin et accès - 4 sondages à la pelle avec prélèvements",
            "date": "2026-04-17",
            "duree": 5.0,
            "geotechnicien": "Marco COSTA PEREIRA",
            "technicien": "Technicien géotechnique 2",
            "finalite": "Description géotechnique et prélèvements laboratoire",
            "zone": "Bassin / accès",
            "observations": "Sondages SP1 à SP4, descriptions d’horizons et prélèvements pour identification laboratoire.",
            "statut": "Réalisée",
            "pv_ref": "FT-SO-01",
            "rapport_ref": "",
            "heure_debut": "08:00",
            "heure_fin": "13:00",
        },
        {
            "type_intervention": "Essais d’eau",
            "sujet": "Fossé aval - 3 essais d’eau / infiltration",
            "date": "2026-04-17",
            "duree": 3.0,
            "geotechnicien": "Marco COSTA PEREIRA",
            "technicien": "Technicien géotechnique 1",
            "finalite": "Infiltration / perméabilité",
            "zone": "Fossé aval",
            "observations": "Essais EAU1 à EAU3 pour observation du comportement à l’eau des horizons superficiels.",
            "statut": "Réalisée",
            "pv_ref": "FT-PER-01",
            "rapport_ref": "",
            "heure_debut": "14:00",
            "heure_fin": "17:00",
        },
    ]
    intervention_ids: list[int] = []
    intervention_refs: list[str] = []
    for spec in intervention_specs:
        intervention_ref, intervention_num = next_intervention_reference(conn, labo_code=labo_code, year=year)
        conn.execute(
            """
            INSERT INTO interventions (
                reference, annee, labo_code, numero, demande_id, campagne_id,
                type_intervention, sujet, date_intervention, duree_heures,
                geotechnicien, technicien, finalite, zone, heure_debut, heure_fin,
                observations, anomalie_detectee, niveau_alerte, pv_ref, rapport_ref,
                photos_dossier, statut, nature_reelle, prelevement_id, tri_comment,
                tri_updated_at, source_year, legacy_intervention_id, legacy_intervention_reelle_id,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Aucun', ?, ?, '', ?, 'Intervention', NULL, '', ?, ?, NULL, NULL, ?, ?)
            """,
            (
                intervention_ref,
                year,
                labo_code,
                intervention_num,
                demande_id,
                campagne_id,
                spec["type_intervention"],
                spec["sujet"],
                spec["date"],
                spec["duree"],
                spec["geotechnicien"],
                spec["technicien"],
                spec["finalite"],
                spec["zone"],
                spec["heure_debut"],
                spec["heure_fin"],
                spec["observations"],
                spec["pv_ref"],
                spec["rapport_ref"],
                spec["statut"],
                NOW,
                year,
                NOW,
                NOW,
            ),
        )
        intervention_ids.append(int(fetch_scalar(conn, "SELECT last_insert_rowid()")))
        intervention_refs.append(intervention_ref)

    implantation_intervention_id, pen_intervention_id, sondage_intervention_id, eau_intervention_id = intervention_ids

    sync_interventions_legacy(conn)

    plan_id, plan_reference = insert_plan_implantation(
        conn, demande_id, campagne_id, implantation_intervention_id, campagne_reference
    )
    nivellement_id, nivellement_reference = insert_nivellement(
        conn, demande_id, campagne_id, implantation_intervention_id, campagne_reference
    )

    pen_points = [
        {
            "point_code": "PT1",
            "localisation": "Plateforme amont",
            "position_label": "Axe A / PK 0+020",
            "profondeur_finale": 2.40,
            "refus": 2.40,
            "profil": [
                {"profondeur": 0.2, "coups": 3, "observation": "terre végétale"},
                {"profondeur": 0.8, "coups": 6, "observation": "limon brun"},
                {"profondeur": 1.6, "coups": 11, "observation": "limon argileux"},
                {"profondeur": 2.4, "coups": 19, "observation": "grave compacte / refus"},
            ],
        },
        {
            "point_code": "PT2",
            "localisation": "Plateforme amont",
            "position_label": "Axe A / PK 0+035",
            "profondeur_finale": 2.20,
            "refus": 2.20,
            "profil": [
                {"profondeur": 0.2, "coups": 4, "observation": "terre végétale"},
                {"profondeur": 1.0, "coups": 7, "observation": "limon sableux"},
                {"profondeur": 2.2, "coups": 18, "observation": "grave serrée / refus"},
            ],
        },
        {
            "point_code": "PT3",
            "localisation": "Plateforme centre",
            "position_label": "Axe A / PK 0+050",
            "profondeur_finale": 2.80,
            "refus": 2.80,
            "profil": [
                {"profondeur": 0.2, "coups": 3, "observation": "terre végétale"},
                {"profondeur": 1.2, "coups": 5, "observation": "limon humide"},
                {"profondeur": 2.0, "coups": 9, "observation": "argile limoneuse"},
                {"profondeur": 2.8, "coups": 16, "observation": "grave sableuse / refus"},
            ],
        },
        {
            "point_code": "PT4",
            "localisation": "Plateforme aval",
            "position_label": "Axe B / PK 0+065",
            "profondeur_finale": 2.60,
            "refus": 2.60,
            "profil": [
                {"profondeur": 0.3, "coups": 3, "observation": "terre végétale"},
                {"profondeur": 0.9, "coups": 6, "observation": "limon brun"},
                {"profondeur": 1.8, "coups": 12, "observation": "grave sableuse"},
                {"profondeur": 2.6, "coups": 17, "observation": "horizon compact / refus"},
            ],
        },
        {
            "point_code": "PT5",
            "localisation": "Plateforme aval",
            "position_label": "Axe B / PK 0+080",
            "profondeur_finale": 2.10,
            "refus": 2.10,
            "profil": [
                {"profondeur": 0.2, "coups": 4, "observation": "terre végétale"},
                {"profondeur": 1.0, "coups": 8, "observation": "limon sableux humide"},
                {"profondeur": 2.1, "coups": 20, "observation": "grave dense / refus"},
            ],
        },
        {
            "point_code": "PT6",
            "localisation": "Plateforme aval",
            "position_label": "Axe B / PK 0+095",
            "profondeur_finale": 1.90,
            "refus": 1.90,
            "profil": [
                {"profondeur": 0.2, "coups": 5, "observation": "terre végétale"},
                {"profondeur": 0.8, "coups": 9, "observation": "limon compact"},
                {"profondeur": 1.9, "coups": 21, "observation": "grave cimentée / refus"},
            ],
        },
    ]
    pen_series_id, pen_series_ref = insert_terrain_series(
        conn,
        demande_id,
        campagne_id,
        pen_intervention_id,
        campagne_reference,
        "PA",
        "Pénétromètre dynamique",
        "2026-04-16",
        "Technicien géotechnique 1",
        "Plateforme technique",
        "6 points pénétromètre dynamiques répartis sur la plateforme.",
        pen_points,
    )
    first_pen_essai_terrain_id = None
    for index, point in enumerate(pen_points, start=1):
        _, essai_terrain_id = insert_point_terrain_and_essai(
            conn,
            pen_series_id,
            pen_intervention_id,
            campagne_id,
            demande_id,
            point["point_code"],
            "PENETROMETRE",
            index,
            point["localisation"],
            point["position_label"],
            0.0,
            point["profondeur_finale"],
            point["refus"],
            "m",
            "Profil pénétromètre synthétique",
            {"profil": point["profil"], "refus": point["refus"]},
            "PA",
            "Pénétromètre / PANDA",
            "NF P 94-063",
            "2026-04-16",
            "Technicien géotechnique 1",
            "Profondeur de refus",
            {"profil": point["profil"], "profondeur_refus_m": point["refus"]},
        )
        if first_pen_essai_terrain_id is None:
            first_pen_essai_terrain_id = essai_terrain_id
    pen_sheet_results = {
        "kind": "terrain_sheet",
        "serie_reference": pen_series_ref,
        "points": [
            {
                "point_code": point["point_code"],
                "localisation": point["localisation"],
                "profondeur_refus_m": point["refus"],
            }
            for point in pen_points
        ],
        "resultat_principal": round(sum(point["refus"] for point in pen_points) / len(pen_points), 2),
    }
    pen_feuille_id, _ = insert_front_facing_terrain_sheet(
        conn,
        demande_id,
        campagne_id,
        pen_intervention_id,
        pen_series_id,
        "PA",
        "Pénétromètre / PANDA",
        "NF P 94-063",
        "Terminé",
        "2026-04-16",
        "Technicien géotechnique 1",
        "Feuille terrain générique pour la campagne pénétromètre.",
        pen_sheet_results,
    )

    sondage_points = [
        {
            "point_code": "SP1",
            "localisation": "Bassin amont",
            "position_label": "PK 0+010",
            "profondeur_finale": 2.50,
            "eau_observee": False,
            "horizons": [
                {"de": 0.0, "a": 0.30, "description": "Terre végétale brune"},
                {"de": 0.30, "a": 1.20, "description": "Limon argileux brun, humide"},
                {"de": 1.20, "a": 2.50, "description": "Limon sableux brun clair avec graves"},
            ],
        },
        {
            "point_code": "SP2",
            "localisation": "Bassin centre",
            "position_label": "PK 0+040",
            "profondeur_finale": 2.80,
            "eau_observee": True,
            "horizons": [
                {"de": 0.0, "a": 0.20, "description": "Terre végétale"},
                {"de": 0.20, "a": 1.10, "description": "Limon sableux beige"},
                {"de": 1.10, "a": 2.00, "description": "Grave sableuse brun clair"},
                {"de": 2.00, "a": 2.80, "description": "Horizon saturé avec venues d’eau diffuses"},
            ],
        },
        {
            "point_code": "SP3",
            "localisation": "Bassin aval",
            "position_label": "PK 0+070",
            "profondeur_finale": 2.40,
            "eau_observee": False,
            "horizons": [
                {"de": 0.0, "a": 0.25, "description": "Terre végétale"},
                {"de": 0.25, "a": 1.40, "description": "Limon brun compact"},
                {"de": 1.40, "a": 2.40, "description": "Grave argileuse compacte"},
            ],
        },
        {
            "point_code": "SP4",
            "localisation": "Accès ouest",
            "position_label": "PK 0+095",
            "profondeur_finale": 2.20,
            "eau_observee": True,
            "horizons": [
                {"de": 0.0, "a": 0.40, "description": "Terre végétale sombre"},
                {"de": 0.40, "a": 1.00, "description": "Argile limoneuse humide, très plastique"},
                {"de": 1.00, "a": 2.20, "description": "Limon argileux beige avec suintements"},
            ],
        },
    ]
    sondage_series_id, sondage_series_ref = insert_terrain_series(
        conn,
        demande_id,
        campagne_id,
        sondage_intervention_id,
        campagne_reference,
        "SO",
        "Sondages à la pelle",
        "2026-04-17",
        "Technicien géotechnique 2",
        "Bassin / accès",
        "4 sondages ouverts à la pelle avec descriptions géotechniques et prélèvements associés.",
        sondage_points,
    )
    first_sondage_essai_terrain_id = None
    for index, point in enumerate(sondage_points, start=1):
        _, essai_terrain_id = insert_point_terrain_and_essai(
            conn,
            sondage_series_id,
            sondage_intervention_id,
            campagne_id,
            demande_id,
            point["point_code"],
            "SONDAGE_PELLE",
            index,
            point["localisation"],
            point["position_label"],
            0.0,
            point["profondeur_finale"],
            point["profondeur_finale"],
            "m",
            "Sondage à la pelle - coupe synthétique",
            {"horizons": point["horizons"], "eau_observee": point["eau_observee"]},
            "SO",
            "Coupe de sondage",
            "NF P 11-300",
            "2026-04-17",
            "Technicien géotechnique 2",
            "Profondeur finale",
            {"horizons": point["horizons"], "profondeur_finale_m": point["profondeur_finale"]},
        )
        if first_sondage_essai_terrain_id is None:
            first_sondage_essai_terrain_id = essai_terrain_id
    sondage_sheet_results = {
        "kind": "terrain_sheet",
        "serie_reference": sondage_series_ref,
        "points": [
            {
                "point_code": point["point_code"],
                "localisation": point["localisation"],
                "profondeur_finale_m": point["profondeur_finale"],
                "eau_observee": point["eau_observee"],
            }
            for point in sondage_points
        ],
        "resultat_principal": round(sum(point["profondeur_finale"] for point in sondage_points) / len(sondage_points), 2),
    }
    sondage_feuille_id, _ = insert_front_facing_terrain_sheet(
        conn,
        demande_id,
        campagne_id,
        sondage_intervention_id,
        sondage_series_id,
        "SO",
        "Coupe de sondage",
        "NF P 11-300",
        "Terminé",
        "2026-04-17",
        "Technicien géotechnique 2",
        "Feuille terrain générique pour les sondages à la pelle.",
        sondage_sheet_results,
    )

    eau_points = [
        {
            "point_code": "EAU1",
            "localisation": "Fossé amont",
            "position_label": "PK 0+025",
            "profondeur": 0.80,
            "niveau_initial": 0.15,
            "niveau_final": 0.42,
            "temps_min": 30,
            "volume_l": 20,
            "infiltration_mmh": 18.0,
        },
        {
            "point_code": "EAU2",
            "localisation": "Fossé centre",
            "position_label": "PK 0+060",
            "profondeur": 0.90,
            "niveau_initial": 0.10,
            "niveau_final": 0.55,
            "temps_min": 30,
            "volume_l": 20,
            "infiltration_mmh": 11.0,
        },
        {
            "point_code": "EAU3",
            "localisation": "Fossé aval",
            "position_label": "PK 0+090",
            "profondeur": 0.85,
            "niveau_initial": 0.12,
            "niveau_final": 0.38,
            "temps_min": 30,
            "volume_l": 20,
            "infiltration_mmh": 22.0,
        },
    ]
    eau_series_id, eau_series_ref = insert_terrain_series(
        conn,
        demande_id,
        campagne_id,
        eau_intervention_id,
        campagne_reference,
        "PER",
        "Essais d’eau / infiltration",
        "2026-04-17",
        "Technicien géotechnique 1",
        "Fossé aval",
        "3 essais d’eau pour apprécier le comportement à l’infiltration des horizons superficiels.",
        eau_points,
    )
    first_eau_essai_terrain_id = None
    for index, point in enumerate(eau_points, start=1):
        _, essai_terrain_id = insert_point_terrain_and_essai(
            conn,
            eau_series_id,
            eau_intervention_id,
            campagne_id,
            demande_id,
            point["point_code"],
            "ESSAI_EAU",
            index,
            point["localisation"],
            point["position_label"],
            0.0,
            point["profondeur"],
            point["infiltration_mmh"],
            "mm/h",
            "Essai d’eau / infiltration locale",
            point,
            "PER",
            "Percolation / essai d’eau",
            "",
            "2026-04-17",
            "Technicien géotechnique 1",
            "Infiltration moyenne",
            point,
        )
        if first_eau_essai_terrain_id is None:
            first_eau_essai_terrain_id = essai_terrain_id
    eau_sheet_results = {
        "kind": "terrain_sheet",
        "serie_reference": eau_series_ref,
        "points": eau_points,
        "resultat_principal": round(sum(point["infiltration_mmh"] for point in eau_points) / len(eau_points), 2),
    }
    eau_feuille_id, _ = insert_front_facing_terrain_sheet(
        conn,
        demande_id,
        campagne_id,
        eau_intervention_id,
        eau_series_id,
        "PER",
        "Percolation / essai d’eau",
        "",
        "Terminé",
        "2026-04-17",
        "Technicien géotechnique 1",
        "Feuille terrain générique pour les essais d’eau.",
        eau_sheet_results,
    )

    report_ids_and_refs: list[tuple[int, str]] = []
    report_ids_and_refs.append(
        insert_report(
            conn,
            demande_id,
            campagne_id,
            implantation_intervention_id,
            None,
            None,
            None,
            None,
            plan_id,
            None,
            "Plan d’implantation",
            "Plan d’implantation campagne géotechnique",
            "2026-04-16",
            "Technicien topo",
            "Émis",
            "Plan d’implantation des points PT, SP et EAU.",
            "Points implantés et validés avant investigations.",
            {"points_implantes": 13, "document_kind": "plan_implantation"},
            demande_reference,
        )
    )
    report_ids_and_refs.append(
        insert_report(
            conn,
            demande_id,
            campagne_id,
            implantation_intervention_id,
            None,
            None,
            None,
            None,
            None,
            nivellement_id,
            "Nivellement",
            "Nivellement initial des points de campagne",
            "2026-04-16",
            "Technicien topo",
            "Émis",
            "Nivellement initial et rattachement NGF local des 13 points.",
            "Altimétrie de campagne validée pour exploitation terrain.",
            {"points_niveles": 13, "document_kind": "nivellement"},
            demande_reference,
        )
    )
    report_ids_and_refs.append(
        insert_report(
            conn,
            demande_id,
            campagne_id,
            pen_intervention_id,
            pen_series_id,
            None,
            first_pen_essai_terrain_id,
            pen_feuille_id,
            None,
            None,
            "Synthèse pénétromètres",
            "Synthèse pénétromètres plateforme",
            "2026-04-16",
            "Marco COSTA PEREIRA",
            "Émis",
            "6 points réalisés, refus entre 1.90 m et 2.80 m.",
            "Horizon plus faible au centre plateforme, renforcement local à confirmer selon terrassement.",
            {"serie_reference": pen_series_ref, "document_kind": "terrain_report"},
            demande_reference,
        )
    )
    report_ids_and_refs.append(
        insert_report(
            conn,
            demande_id,
            campagne_id,
            sondage_intervention_id,
            sondage_series_id,
            None,
            first_sondage_essai_terrain_id,
            sondage_feuille_id,
            None,
            None,
            "Synthèse sondages",
            "Synthèse sondages à la pelle",
            "2026-04-17",
            "Marco COSTA PEREIRA",
            "Émis",
            "4 sondages ouverts avec descriptions d’horizons et 3 prélèvements labo retenus.",
            "Présence d’eau diffuse en SP2 et SP4. Matériaux contrastés entre bassin et accès.",
            {"serie_reference": sondage_series_ref, "document_kind": "terrain_report"},
            demande_reference,
        )
    )
    report_ids_and_refs.append(
        insert_report(
            conn,
            demande_id,
            campagne_id,
            eau_intervention_id,
            eau_series_id,
            None,
            first_eau_essai_terrain_id,
            eau_feuille_id,
            None,
            None,
            "Synthèse essais d’eau",
            "Synthèse essais d’eau / infiltration",
            "2026-04-17",
            "Marco COSTA PEREIRA",
            "Émis",
            "3 essais d’eau réalisés avec infiltration comprise entre 11 et 22 mm/h.",
            "Comportement hétérogène, plus fermé en zone centrale du fossé.",
            {"serie_reference": eau_series_ref, "document_kind": "terrain_report"},
            demande_reference,
        )
    )

    prelevement_refs: list[str] = []
    prelevement_ids: list[int] = []
    prelevement_specs = [
        {
            "point_code": "SP1",
            "date": "2026-04-17",
            "zone": "Bassin amont",
            "materiau": "Limon argileux brun humide",
            "technicien": "Technicien géotechnique 2",
            "finalite": "Identification GTR / plasticité",
            "description": "Prélèvement sol fin SP1 0.30/1.20 m",
            "quantite": "2 sacs x 15 kg",
            "receptionnaire": "Labo RST",
            "notes": "Échantillon humide conditionné en double sac.",
        },
        {
            "point_code": "SP2",
            "date": "2026-04-17",
            "zone": "Bassin centre",
            "materiau": "Grave sableuse brun clair",
            "technicien": "Technicien géotechnique 2",
            "finalite": "Identification granulaire",
            "description": "Prélèvement matériau SP2 1.10/2.00 m",
            "quantite": "1 seau + 1 sac",
            "receptionnaire": "Labo RST",
            "notes": "Matériau plus grossier, faible plasticité observée.",
        },
        {
            "point_code": "SP4",
            "date": "2026-04-17",
            "zone": "Accès ouest",
            "materiau": "Argile limoneuse humide plastique",
            "technicien": "Technicien géotechnique 2",
            "finalite": "Identification GTR / comportement à l’eau",
            "description": "Prélèvement sol fin SP4 0.40/1.00 m",
            "quantite": "2 sacs x 15 kg",
            "receptionnaire": "Labo RST",
            "notes": "Matériau sensible à l’eau, forte plasticité au toucher.",
        },
    ]
    for spec in prelevement_specs:
        prelevement_ref = next_prefixed_reference(conn, "prelevements", f"{year}-{labo_code}-P", width=4)
        conn.execute(
            """
            INSERT INTO prelevements (
                reference, demande_id, intervention_id, source_year, date_prelevement, zone,
                materiau, technicien, finalite, notes, statut, created_at, updated_at,
                date_reception_labo, description, quantite, receptionnaire,
                legacy_prelevement_id, legacy_intervention_reelle_id,
                migration_created, migration_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Reçu', ?, ?, ?, ?, ?, ?, NULL, NULL, 0, '')
            """,
            (
                prelevement_ref,
                demande_id,
                sondage_intervention_id,
                year,
                spec["date"],
                f"{spec['zone']} - {spec['point_code']}",
                spec["materiau"],
                spec["technicien"],
                spec["finalite"],
                spec["notes"],
                NOW,
                NOW,
                "2026-04-17",
                spec["description"],
                spec["quantite"],
                spec["receptionnaire"],
            ),
        )
        prelevement_id = int(fetch_scalar(conn, "SELECT last_insert_rowid()"))
        prelevement_refs.append(prelevement_ref)
        prelevement_ids.append(prelevement_id)

    echantillon_ids: list[int] = []
    echantillon_refs: list[str] = []
    echantillon_specs = [
        {
            "prelevement_index": 0,
            "designation": "SP1 0.30/1.20 - identification sol fin",
            "profondeur_haut": 0.30,
            "profondeur_bas": 1.20,
            "localisation": "SP1 - Bassin amont",
            "observations": "Sol fin brun humide destiné à WE / GR / VBS / LCP / ID.",
        },
        {
            "prelevement_index": 1,
            "designation": "SP2 1.10/2.00 - identification matériau granulaire",
            "profondeur_haut": 1.10,
            "profondeur_bas": 2.00,
            "localisation": "SP2 - Bassin centre",
            "observations": "Matériau graveleux destiné à WE / GR / ID.",
        },
        {
            "prelevement_index": 2,
            "designation": "SP4 0.40/1.00 - comportement eau / plasticité",
            "profondeur_haut": 0.40,
            "profondeur_bas": 1.00,
            "localisation": "SP4 - Accès ouest",
            "observations": "Sol fin plastique destiné à WE / GR / VBS / LCP / ID.",
        },
    ]
    for spec in echantillon_specs:
        echantillon_ref, echantillon_num = next_echantillon_reference(conn, labo_code=labo_code, year=year)
        prelevement_id = prelevement_ids[spec["prelevement_index"]]
        conn.execute(
            """
            INSERT INTO echantillons (
                reference, annee, labo_code, numero, demande_id, designation,
                profondeur_haut, profondeur_bas, date_prelevement, localisation, statut,
                date_reception_labo, observations, created_at, updated_at,
                prelevement_id, intervention_id, auto_reason, migration_created,
                migration_reason, legacy_echantillon_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Reçu', ?, ?, ?, ?, ?, ?, '', 0, '', NULL)
            """,
            (
                echantillon_ref,
                year,
                labo_code,
                echantillon_num,
                demande_id,
                spec["designation"],
                spec["profondeur_haut"],
                spec["profondeur_bas"],
                "2026-04-17",
                spec["localisation"],
                "2026-04-17",
                spec["observations"],
                NOW,
                NOW,
                prelevement_id,
                sondage_intervention_id,
            ),
        )
        echantillon_id = int(fetch_scalar(conn, "SELECT last_insert_rowid()"))
        echantillon_ids.append(echantillon_id)
        echantillon_refs.append(echantillon_ref)

    lab_essai_ids: list[int] = []
    lab_essai_refs: list[str] = []
    lab_cases = [
        (echantillon_ids[0], "WE", "Teneur en eau", "NF P 94-050", build_we_result(18.4), "Mesure sur sol fin SP1.", 18.4, "%", "w = 18.40 %"),
        (echantillon_ids[0], "GR", "Granulométrie", "NF P 94-056", build_gr_result(18.0, 0.55), "Granulométrie du sol fin SP1.", 18.0, "%", "P80µm = 18.00 %"),
        (echantillon_ids[0], "VBS", "Prise d'essai au bleu (sols)", "NF P 94-068", build_vbs_result(2.35), "Valeur au bleu sur fraction fine SP1.", 2.35, "g/100g", "VBS = 2.35 g/100g"),
        (echantillon_ids[0], "LCP", "Limites d'Atterberg", "NF P 94-051", build_lcp_result(39.0, 22.0), "Plasticité du sol fin SP1.", 17.0, "%", "Ip = 17.00 %"),
        (echantillon_ids[0], "ID", "Identification GTR", "NF P 11-300", build_id_result("A2", 2.35, 12.0), "Synthèse GTR SP1.", None, "", "GTR = A2 (h)"),
        (echantillon_ids[1], "WE", "Teneur en eau", "NF P 94-050", build_we_result(6.2), "Mesure sur matériau granulaire SP2.", 6.2, "%", "w = 6.20 %"),
        (echantillon_ids[1], "GR", "Granulométrie", "NF P 94-056", build_gr_result(6.0, 0.18), "Granulométrie matériau SP2.", 6.0, "%", "P80µm = 6.00 %"),
        (echantillon_ids[1], "ID", "Identification GTR", "NF P 11-300", build_id_result("D3", 0.45, 0.0), "Synthèse GTR SP2.", None, "", "GTR = D3 (h)"),
        (echantillon_ids[2], "WE", "Teneur en eau", "NF P 94-050", build_we_result(23.1), "Mesure sur sol fin SP4.", 23.1, "%", "w = 23.10 %"),
        (echantillon_ids[2], "GR", "Granulométrie", "NF P 94-056", build_gr_result(28.0, 0.62), "Granulométrie du sol fin SP4.", 28.0, "%", "P80µm = 28.00 %"),
        (echantillon_ids[2], "VBS", "Prise d'essai au bleu (sols)", "NF P 94-068", build_vbs_result(3.85), "Valeur au bleu SP4.", 3.85, "g/100g", "VBS = 3.85 g/100g"),
        (echantillon_ids[2], "LCP", "Limites d'Atterberg", "NF P 94-051", build_lcp_result(52.0, 26.0), "Plasticité du sol SP4.", 26.0, "%", "Ip = 26.00 %"),
        (echantillon_ids[2], "ID", "Identification GTR", "NF P 11-300", build_id_result("A3", 3.85, 7.0), "Synthèse GTR SP4.", None, "", "GTR = A3 (h)"),
    ]
    for echantillon_id, essai_code, type_essai, norme, resultats, observations, rp, ru, rl in lab_cases:
        essai_id = insert_lab_essai(
            conn,
            echantillon_id,
            essai_code,
            type_essai,
            norme,
            "2026-04-18",
            "2026-04-18",
            "Technicien laboratoire",
            resultats,
            observations,
            rp,
            ru,
            rl,
        )
        lab_essai_ids.append(essai_id)
        lab_essai_refs.append(f"{essai_code}-{essai_id}")

    lab_report_ids = []
    for echantillon_id, essai_id, designation in [
        (echantillon_ids[0], lab_essai_ids[4], "Synthèse laboratoire SP1"),
        (echantillon_ids[1], lab_essai_ids[7], "Synthèse laboratoire SP2"),
        (echantillon_ids[2], lab_essai_ids[12], "Synthèse laboratoire SP4"),
    ]:
        report_id, report_ref = insert_report(
            conn,
            demande_id,
            campagne_id,
            sondage_intervention_id,
            None,
            essai_id,
            None,
            None,
            None,
            None,
            "Synthèse laboratoire",
            designation,
            "2026-04-18",
            "Marco COSTA PEREIRA",
            "Émis",
            designation,
            "Restitution laboratoire rattachée à l’essai d’identification.",
            {"echantillon_id": echantillon_id, "document_kind": "lab_summary"},
            demande_reference,
        )
        report_ids_and_refs.append((report_id, report_ref))
        lab_report_ids.append(report_id)

    synthese_report_id, synthese_report_ref = insert_report(
        conn,
        demande_id,
        campagne_id,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        "Synthèse campagne",
        "Synthèse campagne géotechnique complète",
        "2026-04-18",
        "Marco COSTA PEREIRA",
        "Émis",
        "Campagne complète: implantation, nivellement, 6 pénétromètres, 4 sondages, 3 essais d’eau, 3 prélèvements, 3 échantillons, 13 essais labo.",
        "Chaîne métier complète validée pour test DB/UI.",
        {"document_kind": "campaign_summary", "case_code": case_code},
        demande_reference,
    )
    report_ids_and_refs.append((synthese_report_id, synthese_report_ref))

    conn.execute(
        "UPDATE demandes SET rapport_ref = ?, updated_at = ? WHERE id = ?",
        (synthese_report_ref, NOW, demande_id),
    )

    intervention_report_refs = [
        report_ids_and_refs[0][1] + " / " + report_ids_and_refs[1][1],
        report_ids_and_refs[2][1],
        report_ids_and_refs[3][1],
        report_ids_and_refs[4][1],
    ]
    for intervention_id, rapport_ref in zip(intervention_ids, intervention_report_refs):
        conn.execute(
            "UPDATE interventions SET rapport_ref = ?, updated_at = ? WHERE id = ?",
            (rapport_ref, NOW, intervention_id),
        )

    conn.execute(
        """
        INSERT INTO scenario_seed_runs (
            case_code, inserted_at, affaire_id, demande_id, campagne_id, notes
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            case_code,
            NOW,
            affaire_id,
            demande_id,
            campagne_id,
            "Cas géotechnique complet avec plan d’implantation, nivellement, terrain, prélèvements, échantillons et essais labo.",
        ),
    )

    return InsertSummary(
        case_code=case_code,
        affaire_reference=affaire_reference,
        demande_reference=demande_reference,
        campagne_reference=campagne_reference,
        intervention_references=intervention_refs,
        prelevement_references=prelevement_refs,
        echantillon_references=echantillon_refs,
        essai_refs=lab_essai_refs,
        report_references=[report_ref for _, report_ref in report_ids_and_refs],
        plan_reference=plan_reference,
        nivellement_reference=nivellement_reference,
    )


CASE_LIBRARY = {
    "geo_full_01": insert_case_geo_full_01,
}


def write_summary(path: Path, summary: InsertSummary) -> None:
    lines = [
        f"case_code: {summary.case_code}",
        f"affaire_reference: {summary.affaire_reference}",
        f"demande_reference: {summary.demande_reference}",
        f"campagne_reference: {summary.campagne_reference}",
        f"plan_reference: {summary.plan_reference}",
        f"nivellement_reference: {summary.nivellement_reference}",
        "",
        "interventions:",
        *[f"- {value}" for value in summary.intervention_references],
        "",
        "prelevements:",
        *[f"- {value}" for value in summary.prelevement_references],
        "",
        "echantillons:",
        *[f"- {value}" for value in summary.echantillon_references],
        "",
        "essais:",
        *[f"- {value}" for value in summary.essai_refs],
        "",
        "rapports:",
        *[f"- {value}" for value in summary.report_references],
        "",
        "new support tables ensured:",
        "- scenario_seed_runs",
        "- plans_implantation",
        "- plan_implantation_points",
        "- nivellements",
        "- nivellement_points",
        "- feuilles_terrain",
        "- rapports.plan_implantation_id",
        "- rapports.nivellement_id",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed geotechnical test cases into a RaLab DB.")
    parser.add_argument("--source", required=True, help="Source SQLite DB path")
    parser.add_argument("--target", required=True, help="Target SQLite DB path")
    parser.add_argument("--case", default="geo_full_01", choices=sorted(CASE_LIBRARY.keys()), help="Case code to insert")
    parser.add_argument("--summary", default="", help="Optional path to write a text summary")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = Path(args.source).resolve()
    target = Path(args.target).resolve()
    summary_path = Path(args.summary).resolve() if args.summary else None

    if not source.exists():
        raise FileNotFoundError(f"Source DB not found: {source}")

    if source != target:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

    conn = connect_db(target)
    try:
        ensure_support_schema(conn)
        with conn:
            summary = CASE_LIBRARY[args.case](conn)
    finally:
        conn.close()

    if summary_path is not None:
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        write_summary(summary_path, summary)

    print(json.dumps({
        "target_db": str(target),
        "case_code": summary.case_code,
        "affaire_reference": summary.affaire_reference,
        "demande_reference": summary.demande_reference,
        "campagne_reference": summary.campagne_reference,
        "plan_reference": summary.plan_reference,
        "nivellement_reference": summary.nivellement_reference,
        "interventions": summary.intervention_references,
        "prelevements": summary.prelevement_references,
        "echantillons": summary.echantillon_references,
        "rapports": summary.report_references,
    }, ensure_ascii=False, indent=4))


if __name__ == "__main__":
    main()
