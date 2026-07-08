"""Catalogue partagé des types de campagne (suggestions + types ajoutés par les utilisateurs)."""
from __future__ import annotations

import re
import sqlite3
from datetime import datetime

from app.core.database import connect_db, get_db_path

_GENERIC_DESCRIPTION = (
    "Modèle générique — précisez le périmètre dans le nom et la description de la campagne."
)


def _entry(
    code: str,
    label: str,
    *,
    category: str,
    sort_order: int,
    description: str = _GENERIC_DESCRIPTION,
) -> dict[str, str | int]:
    return {
        "code": code,
        "label": label,
        "description": description,
        "category": category,
        "sort_order": sort_order,
    }


DEFAULT_CAMPAIGN_TYPE_CATALOG: tuple[dict[str, str | int], ...] = (
    _entry("DEM-CH", "Campagne de démarrage chantier", category="Lancement", sort_order=10),
    _entry("PLN-CTRL", "Campagne plan de contrôle", category="Lancement", sort_order=20),
    _entry("PLANCH-ESS", "Campagne planche d'essai", category="Lancement", sort_order=30),
    _entry("SUIV-TERR", "Campagne de suivi terrassement", category="Suivi exécution", sort_order=100),
    _entry("SUIV-PLAT", "Campagne de suivi plateforme", category="Suivi exécution", sort_order=110),
    _entry("SUIV-CF", "Campagne de suivi couche de forme", category="Suivi exécution", sort_order=120),
    _entry("SUIV-TSOL", "Campagne de suivi traitement de sols", category="Suivi exécution", sort_order=130),
    _entry("SUIV-CH", "Campagne de suivi chaussée", category="Suivi exécution", sort_order=140),
    _entry("SUIV-ENB", "Campagne de suivi enrobés", category="Suivi exécution", sort_order=150),
    _entry("SUIV-BET", "Campagne de suivi béton", category="Suivi exécution", sort_order=160),
    _entry("SUIV-VRD", "Campagne de suivi VRD", category="Suivi exécution", sort_order=170),
    _entry("SUIV-RES", "Campagne de suivi réseaux", category="Suivi exécution", sort_order=180),
    _entry("SUIV-ASS", "Campagne de suivi assainissement", category="Suivi exécution", sort_order=190),
    _entry("SUIV-OH", "Campagne de suivi ouvrages hydrauliques", category="Suivi exécution", sort_order=200),
    _entry("SUIV-OB", "Campagne de suivi ouvrages béton", category="Suivi exécution", sort_order=210),
    _entry("SUIV-MAT", "Campagne de suivi matériaux", category="Suivi matériaux", sort_order=220),
    _entry("SUIV-GRAN", "Campagne de suivi granulats", category="Suivi matériaux", sort_order=230),
    _entry("SUIV-REC", "Campagne de suivi matériaux recyclés", category="Suivi matériaux", sort_order=240),
    _entry("SUIV-LIA", "Campagne de suivi liants / bitumes", category="Suivi matériaux", sort_order=250),
    _entry("RECO-GEO", "Campagne de reconnaissance géotechnique", category="Géotechnique", sort_order=300),
    _entry("G3", "Campagne G3", category="Géotechnique", sort_order=310),
    _entry("NOTE-GEO", "Campagne de notes techniques", category="Géotechnique", sort_order=320),
    _entry("CALC-GEO", "Campagne de calculs géotechniques", category="Géotechnique", sort_order=330),
    _entry("DIAG-CH", "Campagne de diagnostic chaussée", category="Diagnostic", sort_order=400),
    _entry("DIAG-PLAT", "Campagne de diagnostic plateforme", category="Diagnostic", sort_order=410),
    _entry("DIAG-BET", "Campagne de diagnostic béton", category="Diagnostic", sort_order=420),
    _entry("DIAG-POL", "Campagne de diagnostic pollution", category="Diagnostic", sort_order=430),
    _entry("DIAG-ENV", "Campagne de diagnostic environnemental", category="Diagnostic", sort_order=440),
    _entry("SUIV-ENV", "Campagne de suivi environnemental", category="Environnement", sort_order=500),
    _entry("LAB-INT", "Campagne de laboratoire interne", category="Laboratoire", sort_order=600),
    _entry("LAB-EXT", "Campagne de laboratoire externe", category="Laboratoire", sort_order=610),
    _entry("SUIV-LAB", "Campagne de suivi essais laboratoire", category="Laboratoire", sort_order=620),
    _entry("GEST-ECH", "Campagne de gestion échantillons", category="Laboratoire", sort_order=630),
    _entry("EXPERT-CH", "Campagne d'expertise chantier", category="Qualité / dossier", sort_order=700),
    _entry("SUIV-NC", "Campagne de suivi non-conformité", category="Qualité / dossier", sort_order=710),
    _entry("LEV-RES", "Campagne de levée de réserve", category="Qualité / dossier", sort_order=720),
    _entry("REX-CH", "Campagne REX chantier", category="Qualité / dossier", sort_order=730),
    _entry("METRO", "Campagne de métrologie", category="Organisation laboratoire", sort_order=800),
    _entry("MAINT-EQ", "Campagne de maintenance équipements", category="Organisation laboratoire", sort_order=810),
    _entry("AUD-COMP", "Campagne d'audit compétences", category="Organisation laboratoire", sort_order=820),
    _entry("ORG-LAB", "Campagne d'organisation laboratoire", category="Organisation laboratoire", sort_order=830),
    _entry("INV-MAT", "Campagne d'inventaire matériel", category="Organisation laboratoire", sort_order=840),
)

# Types retirés du catalogue générique (spécifiques affaire, anciens modèles ou = interventions).
RETIRED_CAMPAIGN_TYPE_CODES: tuple[str, ...] = (
    "RARX",
    "SUIVI-CIRR",
    "TEMOIN",
    "DIAG-CM",
    "RECEPTION",
    "AUDIT",
    "VC",
    "RECON",
    "CTRL-EXEC",
    "TOPO",
    "SURV",
    "URG",
    "LABO",
    "PRE-DES",
    "ENV",
    "ESS-PONCT",
)


def normalize_campaign_type_code(raw: str) -> str:
    text = str(raw or "").strip().upper()
    text = re.sub(r"[^A-Z0-9\-]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text[:32]


class CampaignTypeCatalogRepository:
    def __init__(self, db_path=None):
        self.db_path = db_path or get_db_path()

    def _connect(self):
        conn = connect_db(self.db_path)
        self.ensure_schema(conn)
        return conn

    def _now(self) -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def ensure_schema(conn: sqlite3.Connection) -> None:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS campaign_type_catalog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE COLLATE NOCASE,
                label TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 100,
                is_active INTEGER NOT NULL DEFAULT 1,
                is_system INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_campaign_type_catalog_active
                ON campaign_type_catalog(is_active, sort_order, code);
            """
        )

    @classmethod
    def sync_system_defaults(cls, conn: sqlite3.Connection) -> tuple[int, int]:
        """Insère ou met à jour les modèles système au démarrage (bootstrap catalogue)."""
        cls.ensure_schema(conn)
        inserted = 0
        updated = 0
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for item in DEFAULT_CAMPAIGN_TYPE_CATALOG:
            code = normalize_campaign_type_code(str(item["code"]))
            if not code:
                continue
            label = str(item.get("label") or code)
            description = str(item.get("description") or "")
            category = str(item.get("category") or "")
            sort_order = int(item.get("sort_order") or 100)
            existing = conn.execute(
                "SELECT id FROM campaign_type_catalog WHERE upper(code) = upper(?)",
                (code,),
            ).fetchone()
            if existing:
                cursor = conn.execute(
                    """
                    UPDATE campaign_type_catalog
                    SET label = ?, description = ?, category = ?, sort_order = ?,
                        is_active = 1, is_system = 1, updated_at = ?
                    WHERE upper(code) = upper(?) AND is_system = 1
                    """,
                    (label, description, category, sort_order, now, code),
                )
                if cursor.rowcount:
                    updated += 1
                continue
            cursor = conn.execute(
                """
                INSERT INTO campaign_type_catalog (
                    code, label, description, category, sort_order, is_active, is_system, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
                """,
                (code, label, description, category, sort_order, now, now),
            )
            if cursor.rowcount:
                inserted += 1
        return inserted, updated

    @classmethod
    def seed_defaults(cls, conn: sqlite3.Connection) -> int:
        inserted, _updated = cls.sync_system_defaults(conn)
        return inserted

    @classmethod
    def reconcile_catalog(cls, conn: sqlite3.Connection) -> None:
        cls.sync_system_defaults(conn)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for code in RETIRED_CAMPAIGN_TYPE_CODES:
            conn.execute(
                """
                UPDATE campaign_type_catalog
                SET is_active = 0, updated_at = ?
                WHERE upper(code) = upper(?)
                """,
                (now, code),
            )

    def _row_to_dict(self, row: sqlite3.Row) -> dict:
        return {
            "uid": int(row["id"]),
            "code": row["code"] or "",
            "label": row["label"] or "",
            "description": row["description"] or "",
            "category": row["category"] or "",
            "sort_order": int(row["sort_order"] or 100),
            "is_active": bool(row["is_active"]),
            "is_system": bool(row["is_system"]),
            "created_at": row["created_at"] or "",
            "updated_at": row["updated_at"] or "",
        }

    def list_active(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM campaign_type_catalog
                WHERE is_active = 1
                ORDER BY sort_order ASC, code ASC
                """
            ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def get_by_code(self, code: str) -> dict | None:
        normalized = normalize_campaign_type_code(code)
        if not normalized:
            return None
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM campaign_type_catalog WHERE upper(code) = upper(?)",
                (normalized,),
            ).fetchone()
        return self._row_to_dict(row) if row else None

    def create(self, *, code: str, label: str, description: str = "", category: str = "") -> dict:
        normalized_code = normalize_campaign_type_code(code)
        normalized_label = str(label or "").strip()
        if len(normalized_code) < 2:
            raise ValueError("Code campagne invalide (2 caractères minimum).")
        if not normalized_label:
            raise ValueError("Libellé obligatoire.")

        now = self._now()
        with self._connect() as conn:
            self.ensure_schema(conn)
            existing = conn.execute(
                "SELECT id FROM campaign_type_catalog WHERE upper(code) = upper(?)",
                (normalized_code,),
            ).fetchone()
            if existing:
                raise ValueError(f"Le type « {normalized_code} » existe déjà dans le catalogue.")

            cursor = conn.execute(
                """
                INSERT INTO campaign_type_catalog (
                    code, label, description, category, sort_order, is_active, is_system, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
                """,
                (
                    normalized_code,
                    normalized_label,
                    str(description or "").strip(),
                    str(category or "").strip(),
                    900,
                    now,
                    now,
                ),
            )
            row = conn.execute(
                "SELECT * FROM campaign_type_catalog WHERE id = ?",
                (int(cursor.lastrowid),),
            ).fetchone()
            conn.commit()
        return self._row_to_dict(row)
