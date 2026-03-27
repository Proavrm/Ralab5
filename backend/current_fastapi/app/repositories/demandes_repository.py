"""
app/repositories/demandes_repository.py  — RaLab4 v2
Repository SQLite para DemandeRecord — suporta todos os campos do RaLab4.
"""
from __future__ import annotations

import re
import sqlite3
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from app.models.demande import DemandeRecord
from app.services.demande_folder_naming import build_demande_folder_name

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS demandes (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_base      TEXT NOT NULL,
    reference           TEXT NOT NULL,
    affaire             TEXT NOT NULL DEFAULT '',
    titre               TEXT NOT NULL DEFAULT '',
    client              TEXT NOT NULL DEFAULT '',
    chantier            TEXT NOT NULL DEFAULT '',
    numero_dst          TEXT NOT NULL DEFAULT '',
    nature              TEXT NOT NULL DEFAULT '',
    statut              TEXT NOT NULL DEFAULT 'À qualifier',
    demandeur           TEXT NOT NULL DEFAULT '',
    service             TEXT NOT NULL DEFAULT '',
    laboratoire         TEXT NOT NULL DEFAULT '',
    date_demande        TEXT NOT NULL,
    echeance            TEXT,
    priorite            TEXT NOT NULL DEFAULT 'Normale',
    description         TEXT NOT NULL DEFAULT '',
    observations        TEXT NOT NULL DEFAULT '',
    dossier_nom_actuel  TEXT NOT NULL DEFAULT '',
    dossier_path_actuel TEXT NOT NULL DEFAULT '',
    a_revoir            INTEGER NOT NULL DEFAULT 0,
    note_reconciliation TEXT NOT NULL DEFAULT '',
    source_legacy_id    INTEGER,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
)
"""


class DemandesRepository:
    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or self._default_db_path()
        self._ensure_db()

    def _default_db_path(self) -> Path:
        return Path(__file__).resolve().parents[2] / "data" / "demandes.db"

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    def _ensure_db(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(_CREATE_TABLE)
            # Garantir colunas novas em BDs antigas
            existing = {r[1] for r in conn.execute("PRAGMA table_info(demandes)").fetchall()}
            extra = [
                ("dossier_nom_actuel",  "TEXT NOT NULL DEFAULT ''"),
                ("dossier_path_actuel", "TEXT NOT NULL DEFAULT ''"),
                ("a_revoir",            "INTEGER NOT NULL DEFAULT 0"),
                ("note_reconciliation", "TEXT NOT NULL DEFAULT ''"),
                ("source_legacy_id",    "INTEGER"),
                ("created_at",          "TEXT NOT NULL DEFAULT ''"),
                ("updated_at",          "TEXT NOT NULL DEFAULT ''"),
            ]
            for col, typ in extra:
                if col not in existing:
                    conn.execute(f"ALTER TABLE demandes ADD COLUMN {col} {typ}")
            conn.commit()

    # ── Leitura ───────────────────────────────────────────────────────────────
    def all(
        self,
        statut: str | None = None,
        service: str | None = None,
        priorite: str | None = None,
        search: str | None = None,
        a_revoir: bool | None = None,
    ) -> list[DemandeRecord]:
        query = "SELECT * FROM demandes WHERE 1=1"
        params: list = []
        if statut:
            query += " AND statut = ?"; params.append(statut)
        if service:
            query += " AND service = ?"; params.append(service)
        if priorite:
            query += " AND priorite = ?"; params.append(priorite)
        if a_revoir is not None:
            query += " AND a_revoir = ?"; params.append(1 if a_revoir else 0)
        if search:
            s = f"%{search.strip()}%"
            query += """ AND (
                reference LIKE ? OR reference_base LIKE ? OR
                affaire LIKE ? OR titre LIKE ? OR
                client LIKE ? OR chantier LIKE ? OR
                numero_dst LIKE ? OR nature LIKE ? OR
                demandeur LIKE ? OR description LIKE ? OR
                dossier_nom_actuel LIKE ?
            )"""
            params.extend([s] * 11)
        query += " ORDER BY date_demande DESC, id DESC"
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [self._row_to_record(r) for r in rows]

    def get_by_uid(self, uid: int) -> DemandeRecord | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM demandes WHERE id = ?", (uid,)).fetchone()
        return self._row_to_record(row) if row else None

    # ── Escrita ───────────────────────────────────────────────────────────────
    def add(self, record: DemandeRecord) -> DemandeRecord:
        sql = """
            INSERT INTO demandes (
                reference_base, reference, affaire, titre, client, chantier,
                numero_dst, nature, statut, demandeur, service, laboratoire,
                date_demande, echeance, priorite, description, observations,
                dossier_nom_actuel, dossier_path_actuel, a_revoir,
                note_reconciliation, source_legacy_id
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """
        values = (
            record.reference_base, record.reference,
            record.affaire, record.titre, record.client, record.chantier,
            record.numero_dst, record.nature, record.statut,
            record.demandeur, record.service, record.laboratoire,
            self._d2s(record.date_demande), self._d2s(record.echeance),
            record.priorite, record.description, record.observations,
            record.dossier_nom_actuel, record.dossier_path_actuel,
            1 if record.a_revoir else 0,
            record.note_reconciliation, record.source_legacy_id,
        )
        with self._connect() as conn:
            cursor = conn.execute(sql, values)
            conn.commit()
            new_uid = cursor.lastrowid
        return self.get_by_uid(new_uid)

    def update(self, uid: int, fields: dict) -> DemandeRecord | None:
        if not fields:
            return self.get_by_uid(uid)
        for k in ("date_demande", "echeance"):
            if k in fields and fields[k] is not None:
                fields[k] = self._d2s(fields[k])
        if "a_revoir" in fields:
            fields["a_revoir"] = 1 if fields["a_revoir"] else 0
        # Recalcular reference se necessário
        current = self.get_by_uid(uid)
        if current and any(k in fields for k in ("affaire", "chantier", "client", "titre", "reference_base")):
            fields["reference"] = build_demande_folder_name(
                numero_demande=fields.get("reference_base", current.reference_base),
                affaire_etude=fields.get("affaire", current.affaire),
                chantier=fields.get("chantier", current.chantier),
                client=fields.get("client", current.client),
                titre=fields.get("titre", current.titre),
            )
            if not fields.get("dossier_nom_actuel"):
                fields["dossier_nom_actuel"] = fields["reference"]
        assignments = ", ".join(f"{col} = ?" for col in fields)
        sql = f"UPDATE demandes SET {assignments}, updated_at = datetime('now') WHERE id = ?"
        with self._connect() as conn:
            conn.execute(sql, list(fields.values()) + [uid])
            conn.commit()
        return self.get_by_uid(uid)

    def delete(self, uid: int) -> bool:
        with self._connect() as conn:
            cursor = conn.execute("DELETE FROM demandes WHERE id = ?", (uid,))
            conn.commit()
        return cursor.rowcount > 0

    # ── Helpers ───────────────────────────────────────────────────────────────
    def next_reference(self) -> str:
        year = datetime.now().year
        prefix = f"{year}-RA-"
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT reference_base FROM demandes WHERE reference_base LIKE ?",
                (f"{prefix}%",)
            ).fetchall()
        used = []
        for row in rows:
            m = re.match(rf"^{re.escape(prefix)}(\d+)$", (row[0] or "").strip().upper())
            if m:
                used.append(int(m.group(1)))
        return f"{prefix}{max(used, default=0) + 1:03d}"

    def distinct_values(self, column: str) -> list[str]:
        safe = {"statut", "service", "laboratoire", "priorite", "nature"}
        if column not in safe:
            return []
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT DISTINCT {column} FROM demandes WHERE {column} != '' ORDER BY {column}"
            ).fetchall()
        return [r[0] for r in rows]

    # ── Conversão ─────────────────────────────────────────────────────────────
    def _row_to_record(self, row: sqlite3.Row) -> DemandeRecord:
        return DemandeRecord(
            uid=row["id"],
            reference_base=(row["reference_base"] or "").strip(),
            reference=(row["reference"] or "").strip(),
            affaire=(row["affaire"] or "").strip(),
            titre=(row["titre"] or "").strip(),
            client=(row["client"] or "").strip(),
            chantier=(row["chantier"] or "").strip(),
            numero_dst=(row["numero_dst"] or "").strip(),
            nature=(row["nature"] or "").strip(),
            statut=(row["statut"] or "").strip(),
            demandeur=(row["demandeur"] or "").strip(),
            service=(row["service"] or "").strip(),
            laboratoire=(row["laboratoire"] or "").strip(),
            date_demande=self._s2d(row["date_demande"]) or date.today(),
            echeance=self._s2d(row["echeance"]),
            priorite=(row["priorite"] or "").strip(),
            description=(row["description"] or "").strip(),
            observations=(row["observations"] or "").strip(),
            dossier_nom_actuel=(row["dossier_nom_actuel"] or "").strip(),
            dossier_path_actuel=(row["dossier_path_actuel"] or "").strip(),
            a_revoir=bool(row["a_revoir"]),
            note_reconciliation=(row["note_reconciliation"] or "").strip(),
            source_legacy_id=row["source_legacy_id"],
            created_at=(row["created_at"] or "").strip(),
            updated_at=(row["updated_at"] or "").strip(),
        )

    @staticmethod
    def _d2s(d: date | None) -> str | None:
        return d.isoformat() if d else None

    @staticmethod
    def _s2d(s: str | None) -> date | None:
        if not s:
            return None
        for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y"):
            try:
                return datetime.strptime(str(s)[:19], fmt).date()
            except ValueError:
                continue
        return None

    @staticmethod
    def build_full_reference(**kwargs) -> str:
        return build_demande_folder_name(**kwargs)
