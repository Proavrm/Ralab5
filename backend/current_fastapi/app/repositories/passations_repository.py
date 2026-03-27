"""
app/repositories/passations_repository.py
SQLite repository for the chantier handover module.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path

from app.core.database import connect_db, ensure_ralab4_schema, get_db_path
from app.models.passation import (
    PassationActionRecord,
    PassationActionSchema,
    PassationDocumentRecord,
    PassationDocumentSchema,
    PassationRecord,
    PassationResponseSchema,
)


class PassationsRepository:
    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or get_db_path()
        ensure_ralab4_schema(self.db_path)

    def _connect(self):
        return connect_db(self.db_path)

    def list(self, affaire_rst_id=None, source=None, operation_type=None, search=None) -> list[PassationRecord]:
        sql = """
            SELECT p.*, a.reference AS affaire_ref,
                   COUNT(DISTINCT d.id) AS nb_documents,
                   COUNT(DISTINCT ac.id) AS nb_actions
            FROM passations p
            JOIN affaires_rst a ON a.id = p.affaire_rst_id
            LEFT JOIN passation_documents d ON d.passation_id = p.id
            LEFT JOIN passation_actions ac ON ac.passation_id = p.id
            WHERE 1=1
        """
        params = []
        if affaire_rst_id is not None:
            sql += " AND p.affaire_rst_id = ?"
            params.append(affaire_rst_id)
        if source:
            sql += " AND p.source = ?"
            params.append(source)
        if operation_type:
            sql += " AND p.operation_type = ?"
            params.append(operation_type)
        if search:
            sql += """
                AND (
                    p.reference LIKE ? OR
                    a.reference LIKE ? OR
                    p.client LIKE ? OR
                    p.chantier LIKE ? OR
                    p.numero_etude LIKE ? OR
                    p.numero_affaire_nge LIKE ?
                )
            """
            like = f"%{search}%"
            params.extend([like] * 6)
        sql += " GROUP BY p.id ORDER BY p.date_passation DESC, p.id DESC"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row(row) for row in rows]

    def get_by_uid(self, uid: int) -> PassationRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT p.*, a.reference AS affaire_ref,
                       COUNT(DISTINCT d.id) AS nb_documents,
                       COUNT(DISTINCT ac.id) AS nb_actions
                FROM passations p
                JOIN affaires_rst a ON a.id = p.affaire_rst_id
                LEFT JOIN passation_documents d ON d.passation_id = p.id
                LEFT JOIN passation_actions ac ON ac.passation_id = p.id
                WHERE p.id = ?
                GROUP BY p.id
                """,
                (uid,),
            ).fetchone()
            if not row:
                return None
            record = self._row(row)
            record.documents = self._list_documents(conn, uid)
            record.actions = self._list_actions(conn, uid)
            return record

    def filters(self) -> dict:
        with self._connect() as conn:
            sources = [
                row[0]
                for row in conn.execute(
                    "SELECT DISTINCT source FROM passations WHERE source != '' ORDER BY source"
                ).fetchall()
                if row[0]
            ]
            types_ = [
                row[0]
                for row in conn.execute(
                    "SELECT DISTINCT operation_type FROM passations WHERE operation_type != '' ORDER BY operation_type"
                ).fetchall()
                if row[0]
            ]
        return {"sources": sources, "operation_types": types_}

    def next_reference(self) -> str:
        year = datetime.now().year
        prefix = f"{year}-RA-P"
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT reference FROM passations WHERE reference LIKE ?",
                (f"{prefix}%",),
            ).fetchall()
        numbers = []
        for row in rows:
            match = re.match(rf"^{re.escape(prefix)}(\d+)$", row[0])
            if match:
                numbers.append(int(match.group(1)))
        return f"{prefix}{max(numbers, default=0) + 1:04d}"

    def create(self, body) -> PassationRecord:
        now = self._now()
        reference = self.next_reference()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO passations (
                    reference, affaire_rst_id, date_passation, source, operation_type, phase_operation,
                    numero_etude, numero_affaire_nge, chantier, client, entreprise_responsable,
                    agence, responsable, description_generale, contexte_marche,
                    interlocuteurs_principaux, points_sensibles, besoins_laboratoire,
                    besoins_terrain, besoins_etude, besoins_g3, besoins_essais_externes,
                    besoins_equipements_specifiques, besoins_ressources_humaines,
                    synthese, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    reference,
                    body.affaire_rst_id,
                    self._fmt_date(body.date_passation),
                    body.source,
                    body.operation_type,
                    body.phase_operation,
                    body.numero_etude,
                    body.numero_affaire_nge,
                    body.chantier,
                    body.client,
                    body.entreprise_responsable,
                    body.agence,
                    body.responsable,
                    body.description_generale,
                    body.contexte_marche,
                    body.interlocuteurs_principaux,
                    body.points_sensibles,
                    body.besoins_laboratoire,
                    body.besoins_terrain,
                    body.besoins_etude,
                    body.besoins_g3,
                    body.besoins_essais_externes,
                    body.besoins_equipements_specifiques,
                    body.besoins_ressources_humaines,
                    body.synthese,
                    body.notes,
                    now,
                    now,
                ),
            )
            uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            self._replace_documents(conn, uid, body.documents)
            self._replace_actions(conn, uid, body.actions)
            conn.commit()
        return self.get_by_uid(int(uid))

    def update(self, uid: int, body) -> PassationRecord:
        fields = {k: v for k, v in body.model_dump().items() if v is not None and k not in {"documents", "actions"}}
        if fields:
            fields = {k: self._prepare_value(k, v) for k, v in fields.items()}
            fields["updated_at"] = self._now()
            clause = ", ".join(f"{key} = ?" for key in fields)
            with self._connect() as conn:
                conn.execute(f"UPDATE passations SET {clause} WHERE id = ?", list(fields.values()) + [uid])
                if body.documents is not None:
                    self._replace_documents(conn, uid, body.documents)
                if body.actions is not None:
                    self._replace_actions(conn, uid, body.actions)
                conn.commit()
        elif body.documents is not None or body.actions is not None:
            with self._connect() as conn:
                if body.documents is not None:
                    self._replace_documents(conn, uid, body.documents)
                if body.actions is not None:
                    self._replace_actions(conn, uid, body.actions)
                conn.execute("UPDATE passations SET updated_at = ? WHERE id = ?", (self._now(), uid))
                conn.commit()
        return self.get_by_uid(uid)

    def delete(self, uid: int) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM passations WHERE id = ?", (uid,))
            conn.commit()
        return cur.rowcount > 0

    def to_response(self, record: PassationRecord) -> PassationResponseSchema:
        return PassationResponseSchema(
            uid=record.uid,
            reference=record.reference,
            affaire_rst_id=record.affaire_rst_id,
            affaire_ref=record.affaire_ref,
            date_passation=record.date_passation,
            source=record.source,
            operation_type=record.operation_type,
            phase_operation=record.phase_operation,
            numero_etude=record.numero_etude,
            numero_affaire_nge=record.numero_affaire_nge,
            chantier=record.chantier,
            client=record.client,
            entreprise_responsable=record.entreprise_responsable,
            agence=record.agence,
            responsable=record.responsable,
            description_generale=record.description_generale,
            contexte_marche=record.contexte_marche,
            interlocuteurs_principaux=record.interlocuteurs_principaux,
            points_sensibles=record.points_sensibles,
            besoins_laboratoire=record.besoins_laboratoire,
            besoins_terrain=record.besoins_terrain,
            besoins_etude=record.besoins_etude,
            besoins_g3=record.besoins_g3,
            besoins_essais_externes=record.besoins_essais_externes,
            besoins_equipements_specifiques=record.besoins_equipements_specifiques,
            besoins_ressources_humaines=record.besoins_ressources_humaines,
            synthese=record.synthese,
            notes=record.notes,
            nb_documents=record.nb_documents,
            nb_actions=record.nb_actions,
            created_at=record.created_at,
            updated_at=record.updated_at,
            documents=[self._document_schema(item) for item in record.documents],
            actions=[self._action_schema(item) for item in record.actions],
        )

    def _list_documents(self, conn, passation_id: int) -> list[PassationDocumentRecord]:
        rows = conn.execute(
            "SELECT * FROM passation_documents WHERE passation_id = ? ORDER BY id",
            (passation_id,),
        ).fetchall()
        return [self._document_row(row) for row in rows]

    def _list_actions(self, conn, passation_id: int) -> list[PassationActionRecord]:
        rows = conn.execute(
            "SELECT * FROM passation_actions WHERE passation_id = ? ORDER BY id",
            (passation_id,),
        ).fetchall()
        return [self._action_row(row) for row in rows]

    def _replace_documents(self, conn, passation_id: int, items) -> None:
        conn.execute("DELETE FROM passation_documents WHERE passation_id = ?", (passation_id,))
        now = self._now()
        for item in items or []:
            payload = item.model_dump() if hasattr(item, "model_dump") else dict(item)
            conn.execute(
                """
                INSERT INTO passation_documents (
                    passation_id, document_type, is_received, version, document_date,
                    comment, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    passation_id,
                    (payload.get("document_type") or "").strip(),
                    1 if payload.get("is_received") else 0,
                    (payload.get("version") or "").strip(),
                    self._fmt_date(payload.get("document_date")),
                    (payload.get("comment") or "").strip(),
                    now,
                    now,
                ),
            )

    def _replace_actions(self, conn, passation_id: int, items) -> None:
        conn.execute("DELETE FROM passation_actions WHERE passation_id = ?", (passation_id,))
        now = self._now()
        for item in items or []:
            payload = item.model_dump() if hasattr(item, "model_dump") else dict(item)
            conn.execute(
                """
                INSERT INTO passation_actions (
                    passation_id, action_label, responsable, echeance, priorite,
                    statut, commentaire, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    passation_id,
                    (payload.get("action_label") or "").strip(),
                    (payload.get("responsable") or "").strip(),
                    self._fmt_date(payload.get("echeance")),
                    (payload.get("priorite") or "Normale").strip(),
                    (payload.get("statut") or "À lancer").strip(),
                    (payload.get("commentaire") or "").strip(),
                    now,
                    now,
                ),
            )

    def _row(self, row) -> PassationRecord:
        keys = row.keys()
        return PassationRecord(
            uid=int(row["id"]),
            reference=row["reference"],
            affaire_rst_id=int(row["affaire_rst_id"]),
            date_passation=self._parse_date(row["date_passation"]) or date.today(),
            source=row["source"] or "",
            operation_type=row["operation_type"] or "",
            phase_operation=row["phase_operation"] or "",
            numero_etude=row["numero_etude"] or "",
            numero_affaire_nge=row["numero_affaire_nge"] or "",
            chantier=row["chantier"] or "",
            client=row["client"] or "",
            entreprise_responsable=row["entreprise_responsable"] or "",
            agence=row["agence"] or "",
            responsable=row["responsable"] or "",
            description_generale=row["description_generale"] or "",
            contexte_marche=row["contexte_marche"] or "",
            interlocuteurs_principaux=row["interlocuteurs_principaux"] or "",
            points_sensibles=row["points_sensibles"] or "",
            besoins_laboratoire=row["besoins_laboratoire"] or "",
            besoins_terrain=row["besoins_terrain"] or "",
            besoins_etude=row["besoins_etude"] or "",
            besoins_g3=row["besoins_g3"] or "",
            besoins_essais_externes=row["besoins_essais_externes"] or "",
            besoins_equipements_specifiques=row["besoins_equipements_specifiques"] or "",
            besoins_ressources_humaines=row["besoins_ressources_humaines"] or "",
            synthese=row["synthese"] or "",
            notes=row["notes"] or "",
            affaire_ref=row["affaire_ref"] if "affaire_ref" in keys else "",
            nb_documents=int(row["nb_documents"]) if "nb_documents" in keys else 0,
            nb_actions=int(row["nb_actions"]) if "nb_actions" in keys else 0,
            created_at=row["created_at"] or "",
            updated_at=row["updated_at"] or "",
        )

    def _document_row(self, row) -> PassationDocumentRecord:
        return PassationDocumentRecord(
            uid=int(row["id"]),
            passation_id=int(row["passation_id"]),
            document_type=row["document_type"] or "",
            is_received=bool(row["is_received"]),
            version=row["version"] or "",
            document_date=self._parse_date(row["document_date"]),
            comment=row["comment"] or "",
            created_at=row["created_at"] or "",
            updated_at=row["updated_at"] or "",
        )

    def _action_row(self, row) -> PassationActionRecord:
        return PassationActionRecord(
            uid=int(row["id"]),
            passation_id=int(row["passation_id"]),
            action_label=row["action_label"] or "",
            responsable=row["responsable"] or "",
            echeance=self._parse_date(row["echeance"]),
            priorite=row["priorite"] or "Normale",
            statut=row["statut"] or "À lancer",
            commentaire=row["commentaire"] or "",
            created_at=row["created_at"] or "",
            updated_at=row["updated_at"] or "",
        )

    @staticmethod
    def _document_schema(record: PassationDocumentRecord) -> PassationDocumentSchema:
        return PassationDocumentSchema(
            uid=record.uid,
            document_type=record.document_type,
            is_received=record.is_received,
            version=record.version,
            document_date=record.document_date,
            comment=record.comment,
        )

    @staticmethod
    def _action_schema(record: PassationActionRecord) -> PassationActionSchema:
        return PassationActionSchema(
            uid=record.uid,
            action_label=record.action_label,
            responsable=record.responsable,
            echeance=record.echeance,
            priorite=record.priorite,
            statut=record.statut,
            commentaire=record.commentaire,
        )

    @staticmethod
    def _now() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def _fmt_date(value) -> str | None:
        if value is None or value == "":
            return None
        if isinstance(value, date):
            return value.strftime("%Y-%m-%d")
        return str(value)

    @staticmethod
    def _prepare_value(key: str, value):
        if key in {"date_passation"} and isinstance(value, date):
            return value.strftime("%Y-%m-%d")
        return value

    @staticmethod
    def _parse_date(value):
        if not value:
            return None
        for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y"):
            try:
                return datetime.strptime(str(value).strip(), fmt).date()
            except ValueError:
                continue
        return None
