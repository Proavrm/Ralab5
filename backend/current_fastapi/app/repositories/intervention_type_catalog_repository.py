"""Catalogue partagé des types d'intervention terrain."""
from __future__ import annotations

import re
import sqlite3
from datetime import datetime

from app.core.database import connect_db, get_db_path

DEFAULT_INTERVENTION_TYPE_CATALOG: tuple[dict[str, str | int], ...] = (
    {
        "code": "VC",
        "label": "Visite chantier",
        "description": "Visite initiale, reconnaissance opérationnelle, accès et état des lieux.",
        "category": "Visites et constats",
        "sort_order": 10,
    },
    {
        "code": "VCONST",
        "label": "Visite de constat",
        "description": "Constat ciblé, observation contradictoire ou visite de contrôle.",
        "category": "Visites et constats",
        "sort_order": 20,
    },
    {
        "code": "RECTRL",
        "label": "Recontrôle",
        "description": "Retour terrain après premier contrôle ou après correction.",
        "category": "Visites et constats",
        "sort_order": 30,
    },
    {
        "code": "CVIS",
        "label": "Contre-visite",
        "description": "Nouvelle visite après réserve, anomalie ou demande de vérification.",
        "category": "Visites et constats",
        "sort_order": 40,
    },
    {
        "code": "VG3",
        "label": "Visite G3",
        "description": "Suivi géotechnique d'exécution sur site.",
        "category": "Visites et constats",
        "sort_order": 50,
    },
    {
        "code": "REUN",
        "label": "Réunion technique sur site",
        "description": "Réunion opérationnelle avec contexte terrain à tracer.",
        "category": "Visites et constats",
        "sort_order": 60,
    },
    {
        "code": "PLAQ",
        "label": "Essai de plaque",
        "description": "Contrôle de portance ou essai sur un ou plusieurs points.",
        "category": "Opérations terrain",
        "sort_order": 110,
    },
    {
        "code": "PRL",
        "label": "Prélèvement",
        "description": "Prise d'échantillons pour laboratoire ou conservation.",
        "category": "Opérations terrain",
        "sort_order": 120,
    },
    {
        "code": "SOND",
        "label": "Sondage",
        "description": "Reconnaissance ponctuelle, coupe, sondage ou point géotechnique.",
        "category": "Opérations terrain",
        "sort_order": 130,
    },
    {
        "code": "CAR",
        "label": "Carottage",
        "description": "Prélèvement par carotte ou carottage de structure.",
        "category": "Opérations terrain",
        "sort_order": 140,
    },
    {
        "code": "DESC",
        "label": "Campagne de description géotechnique",
        "description": "Description et journalisation de plusieurs points de terrain.",
        "category": "Opérations terrain",
        "sort_order": 150,
    },
    {
        "code": "TOPO",
        "label": "Relevé topographique",
        "description": "Nivellement, profils longitudinaux/transversaux, repérage altimétrique.",
        "category": "Opérations terrain",
        "sort_order": 160,
    },
    {
        "code": "RECON",
        "label": "Reconnaissance géotechnique",
        "description": "Reconnaissance préalable, investigations légères, cadrage du programme.",
        "category": "Opérations terrain",
        "sort_order": 170,
    },
    {
        "code": "DIAGCH",
        "label": "Diagnostic de chaussée",
        "description": "Carottages, essais in situ, mesures sur chaussée existante.",
        "category": "Chaussées / enrobés",
        "sort_order": 210,
    },
    {
        "code": "BF",
        "label": "Contrôle béton frais",
        "description": "Contrôle terrain ou prélèvement sur béton frais.",
        "category": "Contrôles et matériel",
        "sort_order": 310,
    },
    {
        "code": "POSE",
        "label": "Pose de matériel",
        "description": "Installation d'équipement, repère ou instrumentation.",
        "category": "Contrôles et matériel",
        "sort_order": 320,
    },
    {
        "code": "RELEV",
        "label": "Relevé de matériel",
        "description": "Dépose, relève ou récupération d'un dispositif.",
        "category": "Contrôles et matériel",
        "sort_order": 330,
    },
    {
        "code": "CTRL",
        "label": "Contrôle d'exécution",
        "description": "Compactage, réception de couche, conformité en cours de travaux.",
        "category": "Contrôles et matériel",
        "sort_order": 340,
    },
    {
        "code": "URG",
        "label": "Intervention urgente",
        "description": "Mission ponctuelle prioritaire, diagnostic rapide ou contrôle immédiat.",
        "category": "Contrôles et matériel",
        "sort_order": 350,
    },
    {
        "code": "AUT",
        "label": "Autre",
        "description": "Intervention non standard à qualifier ensuite dans la fiche.",
        "category": "Contrôles et matériel",
        "sort_order": 900,
    },
)


def normalize_intervention_type_code(raw: str) -> str:
    text = str(raw or "").strip().upper()
    text = re.sub(r"[^A-Z0-9\-]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text[:32]


def normalize_intervention_type_label(raw: str) -> str:
    return str(raw or "").strip()


class InterventionTypeCatalogRepository:
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
            CREATE TABLE IF NOT EXISTS intervention_type_catalog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL DEFAULT '',
                label TEXT NOT NULL UNIQUE COLLATE NOCASE,
                description TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 100,
                is_active INTEGER NOT NULL DEFAULT 1,
                is_system INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_intervention_type_catalog_active
                ON intervention_type_catalog(is_active, sort_order, label);
            """
        )

    @classmethod
    def seed_defaults(cls, conn: sqlite3.Connection) -> int:
        cls.ensure_schema(conn)
        inserted = 0
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for item in DEFAULT_INTERVENTION_TYPE_CATALOG:
            label = normalize_intervention_type_label(str(item.get("label") or ""))
            if not label:
                continue
            code = normalize_intervention_type_code(str(item.get("code") or ""))
            cursor = conn.execute(
                """
                INSERT OR IGNORE INTO intervention_type_catalog (
                    code, label, description, category, sort_order, is_active, is_system, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
                """,
                (
                    code,
                    label,
                    str(item.get("description") or ""),
                    str(item.get("category") or ""),
                    int(item.get("sort_order") or 100),
                    now,
                    now,
                ),
            )
            if cursor.rowcount:
                inserted += 1
        return inserted

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
                FROM intervention_type_catalog
                WHERE is_active = 1
                ORDER BY sort_order ASC, label ASC
                """
            ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def create(
        self,
        *,
        label: str,
        code: str = "",
        description: str = "",
        category: str = "",
    ) -> dict:
        normalized_label = normalize_intervention_type_label(label)
        normalized_code = normalize_intervention_type_code(code)
        if len(normalized_label) < 2:
            raise ValueError("Libellé d'intervention invalide (2 caractères minimum).")

        now = self._now()
        with self._connect() as conn:
            self.ensure_schema(conn)
            existing = conn.execute(
                "SELECT id FROM intervention_type_catalog WHERE upper(label) = upper(?)",
                (normalized_label,),
            ).fetchone()
            if existing:
                raise ValueError(f"Le type « {normalized_label} » existe déjà dans le catalogue.")

            cursor = conn.execute(
                """
                INSERT INTO intervention_type_catalog (
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
                "SELECT * FROM intervention_type_catalog WHERE id = ?",
                (int(cursor.lastrowid),),
            ).fetchone()
            conn.commit()
        return self._row_to_dict(row)
