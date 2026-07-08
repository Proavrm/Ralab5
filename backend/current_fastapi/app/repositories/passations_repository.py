"""
app/repositories/passations_repository.py
SQLite repository for the chantier handover module.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path

from app.core.database import connect_db, ensure_ralab4_schema, get_db_path
from app.services.demande_document_storage_service import delete_affaire_document, normalize_stored_path
from app.repositories.reference_affaires_repository import ReferenceAffairesRepository
from app.repositories.reference_etudes_repository import ReferenceEtudesRepository
from app.models.passation import (
    PassationActionRecord,
    PassationActionSchema,
    PassationDemandePreparationItemSchema,
    PassationDemandePreparationRecord,
    PassationDocumentRecord,
    PassationDocumentSchema,
    PassationParticipantRecord,
    PassationParticipantSchema,
    PassationPerimeterItemRecord,
    PassationPerimeterItemSchema,
    PassationResponsibilityItemRecord,
    PassationResponsibilityItemSchema,
    PassationRoleAssignmentRecord,
    PassationRoleAssignmentSchema,
    PassationRecord,
    PassationResponseSchema,
    PassationStartupItemRecord,
    PassationStartupItemSchema,
    PassationStructuredNeedRecord,
    PassationStructuredNeedSchema,
    PHASE_OPERATION_OPTIONS,
)


class PassationsRepository:
    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or get_db_path()
        self._reference_affaires_repo = ReferenceAffairesRepository()
        self._reference_etudes_repo = ReferenceEtudesRepository()
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
            record.role_assignments = self._list_role_assignments(conn, uid)
            record.participants = self._list_participants(conn, uid)
            record.perimeter_items = self._list_perimeter_items(conn, uid)
            record.responsibility_items = self._list_responsibility_items(conn, uid)
            record.startup_items = self._list_startup_items(conn, uid)
            record.structured_needs = self._list_structured_needs(conn, uid)
            record.demande_preparation_items = self._list_demande_preparation_items(conn, uid)
            return record

    def filters(self) -> dict:
        def should_keep_person_name(value: object) -> bool:
            text = str(value or "").strip()
            if not text:
                return False
            normalized = text.casefold()
            if normalized.startswith("import"):
                return False
            if normalized.replace("?", "").strip() == "":
                return False
            if not re.search(r"[a-zA-ZÀ-ÖØ-öø-ÿ]", text):
                return False
            return True

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
            responsable_candidates: set[str] = set()

            # Primary source: Affaires NGE reference rows.
            try:
                for row in self._reference_affaires_repo.all(limit=5000):
                    value = row.get("responsable", "")
                    if should_keep_person_name(value):
                        responsable_candidates.add(str(value).strip())
            except Exception:
                pass

            # Primary source: Etudes reference rows.
            try:
                for row in self._reference_etudes_repo.list_rows(limit=5000):
                    value = row.get("responsable", "")
                    if should_keep_person_name(value):
                        responsable_candidates.add(str(value).strip())
            except Exception:
                pass

            # Secondary source: current operational affaires + existing passations.
            for row in conn.execute("SELECT DISTINCT responsable FROM affaires_rst WHERE responsable != '' ORDER BY responsable").fetchall():
                value = str(row[0] or "").strip()
                if should_keep_person_name(value):
                    responsable_candidates.add(value)

            for row in conn.execute("SELECT DISTINCT responsable FROM passations WHERE responsable != '' ORDER BY responsable").fetchall():
                value = str(row[0] or "").strip()
                if should_keep_person_name(value):
                    responsable_candidates.add(value)
        return {
            "sources": sources,
            "operation_types": types_,
            "phase_operation_options": list(PHASE_OPERATION_OPTIONS),
            "phase_operations": list(PHASE_OPERATION_OPTIONS),
            "responsable_passation_options": sorted(responsable_candidates, key=lambda item: item.casefold()),
        }

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
                    reference, affaire_rst_id, date_passation, date_debut_travaux_prevue, source, operation_type, phase_operation,
                    numero_etude, numero_affaire_nge, chantier, client, maitre_ouvrage, maitre_oeuvre,
                    entreprise_responsable,
                    agence, responsable, description_generale, contexte_marche,
                    interlocuteurs_principaux, points_sensibles, besoins_laboratoire,
                    besoins_terrain, besoins_etude, besoins_g3, besoins_essais_externes,
                    besoins_equipements_specifiques, besoins_ressources_humaines,
                    workflow_status, workflow_decision, workflow_decision_comment,
                    workflow_decided_by, workflow_decided_at,
                    synthese, notes, types_essais_prevus, livrables_attendus, criteres_conformite,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    reference,
                    body.affaire_rst_id,
                    self._fmt_date(body.date_passation),
                    self._fmt_date(body.date_debut_travaux_prevue),
                    body.source,
                    body.operation_type,
                    body.phase_operation,
                    body.numero_etude,
                    body.numero_affaire_nge,
                    body.chantier,
                    body.client,
                    body.maitre_ouvrage,
                    body.maitre_oeuvre,
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
                    body.workflow_status,
                    body.workflow_decision,
                    body.workflow_decision_comment,
                    body.workflow_decided_by,
                    self._fmt_date(body.workflow_decided_at),
                    body.synthese,
                    body.notes,
                    body.types_essais_prevus,
                    body.livrables_attendus,
                    body.criteres_conformite,
                    now,
                    now,
                ),
            )
            uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            self._replace_documents(conn, uid, body.documents)
            self._replace_actions(conn, uid, body.actions)
            self._replace_role_assignments(conn, uid, body.role_assignments)
            self._replace_participants(conn, uid, body.participants)
            self._replace_perimeter_items(conn, uid, body.perimeter_items)
            self._replace_responsibility_items(conn, uid, body.responsibility_items)
            self._replace_startup_items(conn, uid, body.startup_items)
            self._replace_structured_needs(conn, uid, body.structured_needs)
            self._replace_demande_preparation_items(conn, uid, body.demande_preparation_items)
            conn.commit()
        return self.get_by_uid(int(uid))

    def update(self, uid: int, body) -> PassationRecord:
        collection_fields = {
            "documents",
            "actions",
            "role_assignments",
            "participants",
            "perimeter_items",
            "responsibility_items",
            "startup_items",
            "structured_needs",
            "demande_preparation_items",
        }
        fields = {
            k: v for k, v in body.model_dump(exclude_unset=True).items()
            if k not in collection_fields and (v is not None or k == "date_debut_travaux_prevue")
        }
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
                if body.role_assignments is not None:
                    self._replace_role_assignments(conn, uid, body.role_assignments)
                if body.participants is not None:
                    self._replace_participants(conn, uid, body.participants)
                if body.perimeter_items is not None:
                    self._replace_perimeter_items(conn, uid, body.perimeter_items)
                if body.responsibility_items is not None:
                    self._replace_responsibility_items(conn, uid, body.responsibility_items)
                if body.startup_items is not None:
                    self._replace_startup_items(conn, uid, body.startup_items)
                if body.structured_needs is not None:
                    self._replace_structured_needs(conn, uid, body.structured_needs)
                if body.demande_preparation_items is not None:
                    self._replace_demande_preparation_items(conn, uid, body.demande_preparation_items)
                conn.commit()
        elif any(
            getattr(body, name) is not None
            for name in collection_fields
        ):
            with self._connect() as conn:
                if body.documents is not None:
                    self._replace_documents(conn, uid, body.documents)
                if body.actions is not None:
                    self._replace_actions(conn, uid, body.actions)
                if body.role_assignments is not None:
                    self._replace_role_assignments(conn, uid, body.role_assignments)
                if body.participants is not None:
                    self._replace_participants(conn, uid, body.participants)
                if body.perimeter_items is not None:
                    self._replace_perimeter_items(conn, uid, body.perimeter_items)
                if body.responsibility_items is not None:
                    self._replace_responsibility_items(conn, uid, body.responsibility_items)
                if body.startup_items is not None:
                    self._replace_startup_items(conn, uid, body.startup_items)
                if body.structured_needs is not None:
                    self._replace_structured_needs(conn, uid, body.structured_needs)
                if body.demande_preparation_items is not None:
                    self._replace_demande_preparation_items(conn, uid, body.demande_preparation_items)
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
            date_debut_travaux_prevue=record.date_debut_travaux_prevue,
            source=record.source,
            operation_type=record.operation_type,
            phase_operation=record.phase_operation,
            numero_etude=record.numero_etude,
            numero_affaire_nge=record.numero_affaire_nge,
            chantier=record.chantier,
            client=record.client,
            maitre_ouvrage=record.maitre_ouvrage,
            maitre_oeuvre=record.maitre_oeuvre,
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
            workflow_status=record.workflow_status,
            workflow_decision=record.workflow_decision,
            workflow_decision_comment=record.workflow_decision_comment,
            workflow_decided_by=record.workflow_decided_by,
            workflow_decided_at=record.workflow_decided_at,
            synthese=record.synthese,
            notes=record.notes,
            types_essais_prevus=record.types_essais_prevus,
            livrables_attendus=record.livrables_attendus,
            criteres_conformite=record.criteres_conformite,
            demande_destinataire_email=record.demande_destinataire_email,
            demande_destinataire_name=record.demande_destinataire_name,
            nb_documents=record.nb_documents,
            nb_actions=record.nb_actions,
            created_at=record.created_at,
            updated_at=record.updated_at,
            documents=[self._document_schema(item) for item in record.documents],
            actions=[self._action_schema(item) for item in record.actions],
            role_assignments=[self._role_assignment_schema(item) for item in record.role_assignments],
            participants=[self._participant_schema(item) for item in record.participants],
            perimeter_items=[self._perimeter_item_schema(item) for item in record.perimeter_items],
            responsibility_items=[self._responsibility_item_schema(item) for item in record.responsibility_items],
            startup_items=[self._startup_item_schema(item) for item in record.startup_items],
            structured_needs=[self._structured_need_schema(item) for item in record.structured_needs],
            demande_preparation_items=[self._demande_preparation_item_schema(item) for item in record.demande_preparation_items],
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
        old_rows = conn.execute(
            "SELECT stored_path FROM passation_documents WHERE passation_id = ?",
            (passation_id,),
        ).fetchall()
        old_paths = {
            normalize_stored_path(row["stored_path"])
            for row in old_rows
            if row["stored_path"]
        }

        conn.execute("DELETE FROM passation_documents WHERE passation_id = ?", (passation_id,))
        now = self._now()
        for item in items or []:
            payload = item.model_dump() if hasattr(item, "model_dump") else dict(item)
            conn.execute(
                """
                INSERT INTO passation_documents (
                    passation_id, document_type, is_received, version, document_date,
                    comment, stored_path, uploaded_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    passation_id,
                    (payload.get("document_type") or "").strip(),
                    1 if payload.get("is_received") else 0,
                    (payload.get("version") or "").strip(),
                    self._fmt_date(payload.get("document_date")),
                    (payload.get("comment") or "").strip(),
                    (payload.get("stored_path") or "").strip(),
                    self._fmt_date(payload.get("uploaded_at")),
                    now,
                    now,
                ),
            )

        new_paths = set()
        for item in items or []:
            payload = item.model_dump() if hasattr(item, "model_dump") else dict(item)
            path = normalize_stored_path(str(payload.get("stored_path") or ""))
            if path:
                new_paths.add(path)
        for path in old_paths - new_paths:
            try:
                delete_affaire_document(path)
            except (FileNotFoundError, ValueError):
                pass

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

    def _list_role_assignments(self, conn, passation_id: int) -> list[PassationRoleAssignmentRecord]:
        rows = conn.execute(
            "SELECT * FROM passation_role_assignments WHERE passation_id = ? ORDER BY id",
            (passation_id,),
        ).fetchall()
        return [self._role_assignment_row(row) for row in rows]

    def _replace_role_assignments(self, conn, passation_id: int, items) -> None:
        conn.execute("DELETE FROM passation_role_assignments WHERE passation_id = ?", (passation_id,))
        now = self._now()
        for item in items or []:
            payload = item.model_dump() if hasattr(item, "model_dump") else dict(item)
            conn.execute(
                """
                INSERT INTO passation_role_assignments (
                    passation_id, role_code, assignee, assignment_status, comment, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    passation_id,
                    (payload.get("role_code") or "").strip(),
                    (payload.get("assignee") or "").strip(),
                    (payload.get("assignment_status") or "À confirmer").strip(),
                    (payload.get("comment") or "").strip(),
                    now,
                    now,
                ),
            )

    def _list_participants(self, conn, passation_id: int) -> list[PassationParticipantRecord]:
        rows = conn.execute(
            "SELECT * FROM passation_participants WHERE passation_id = ? ORDER BY id",
            (passation_id,),
        ).fetchall()
        return [self._participant_row(row) for row in rows]

    def _replace_participants(self, conn, passation_id: int, items) -> None:
        conn.execute("DELETE FROM passation_participants WHERE passation_id = ?", (passation_id,))
        now = self._now()
        for item in items or []:
            payload = item.model_dump() if hasattr(item, "model_dump") else dict(item)
            conn.execute(
                """
                INSERT INTO passation_participants (
                    passation_id, participant_role, full_name, organisation, email, phone, comment, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    passation_id,
                    (payload.get("participant_role") or "").strip(),
                    (payload.get("full_name") or "").strip(),
                    (payload.get("organisation") or "").strip(),
                    (payload.get("email") or "").strip(),
                    (payload.get("phone") or "").strip(),
                    (payload.get("comment") or "").strip(),
                    now,
                    now,
                ),
            )

    def _list_perimeter_items(self, conn, passation_id: int) -> list[PassationPerimeterItemRecord]:
        rows = conn.execute(
            "SELECT * FROM passation_perimeter_items WHERE passation_id = ? ORDER BY id",
            (passation_id,),
        ).fetchall()
        return [self._perimeter_item_row(row) for row in rows]

    def _replace_perimeter_items(self, conn, passation_id: int, items) -> None:
        conn.execute("DELETE FROM passation_perimeter_items WHERE passation_id = ?", (passation_id,))
        now = self._now()
        for item in items or []:
            payload = item.model_dump() if hasattr(item, "model_dump") else dict(item)
            conn.execute(
                """
                INSERT INTO passation_perimeter_items (
                    passation_id, scope_category, scope_label, request_status, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    passation_id,
                    (payload.get("scope_category") or "").strip(),
                    (payload.get("scope_label") or "").strip(),
                    (payload.get("request_status") or "Demandé").strip(),
                    (payload.get("notes") or "").strip(),
                    now,
                    now,
                ),
            )

    def _list_responsibility_items(self, conn, passation_id: int) -> list[PassationResponsibilityItemRecord]:
        rows = conn.execute(
            "SELECT * FROM passation_responsibility_items WHERE passation_id = ? ORDER BY id",
            (passation_id,),
        ).fetchall()
        return [self._responsibility_item_row(row) for row in rows]

    def _replace_responsibility_items(self, conn, passation_id: int, items) -> None:
        conn.execute("DELETE FROM passation_responsibility_items WHERE passation_id = ?", (passation_id,))
        now = self._now()
        for item in items or []:
            payload = item.model_dump() if hasattr(item, "model_dump") else dict(item)
            conn.execute(
                """
                INSERT INTO passation_responsibility_items (
                    passation_id, workstream_code, accountable_role_code, responsible_role_code,
                    consulted_roles, informed_roles, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    passation_id,
                    (payload.get("workstream_code") or "").strip(),
                    (payload.get("accountable_role_code") or "").strip(),
                    (payload.get("responsible_role_code") or "").strip(),
                    (payload.get("consulted_roles") or "").strip(),
                    (payload.get("informed_roles") or "").strip(),
                    (payload.get("notes") or "").strip(),
                    now,
                    now,
                ),
            )

    def _list_startup_items(self, conn, passation_id: int) -> list[PassationStartupItemRecord]:
        rows = conn.execute(
            "SELECT * FROM passation_startup_items WHERE passation_id = ? ORDER BY id",
            (passation_id,),
        ).fetchall()
        return [self._startup_item_row(row) for row in rows]

    def _replace_startup_items(self, conn, passation_id: int, items) -> None:
        conn.execute("DELETE FROM passation_startup_items WHERE passation_id = ?", (passation_id,))
        now = self._now()
        for item in items or []:
            payload = item.model_dump() if hasattr(item, "model_dump") else dict(item)
            conn.execute(
                """
                INSERT INTO passation_startup_items (
                    passation_id, item_code, owner_role_code, owner_name, status, due_date, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    passation_id,
                    (payload.get("item_code") or "").strip(),
                    (payload.get("owner_role_code") or "").strip(),
                    (payload.get("owner_name") or "").strip(),
                    (payload.get("status") or "À confirmer").strip(),
                    self._fmt_date(payload.get("due_date")),
                    (payload.get("notes") or "").strip(),
                    now,
                    now,
                ),
            )

    def _list_structured_needs(self, conn, passation_id: int) -> list[PassationStructuredNeedRecord]:
        rows = conn.execute(
            "SELECT * FROM passation_structured_needs WHERE passation_id = ? ORDER BY id",
            (passation_id,),
        ).fetchall()
        return [self._structured_need_row(row) for row in rows]

    def _replace_structured_needs(self, conn, passation_id: int, items) -> None:
        conn.execute("DELETE FROM passation_structured_needs WHERE passation_id = ?", (passation_id,))
        now = self._now()
        for item in items or []:
            payload = item.model_dump() if hasattr(item, "model_dump") else dict(item)
            conn.execute(
                """
                INSERT INTO passation_structured_needs (
                    passation_id, need_code, need_label, description, request_status, quantity, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    passation_id,
                    (payload.get("need_code") or "").strip(),
                    (payload.get("need_label") or "").strip(),
                    (payload.get("description") or "").strip(),
                    (payload.get("request_status") or "Non évalué").strip(),
                    (payload.get("quantity") or "").strip(),
                    (payload.get("notes") or "").strip(),
                    now,
                    now,
                ),
            )

    def _list_demande_preparation_items(self, conn, passation_id: int) -> list[PassationDemandePreparationRecord]:
        rows = conn.execute(
            "SELECT * FROM passation_demande_preparation_items WHERE passation_id = ? ORDER BY id",
            (passation_id,),
        ).fetchall()
        return [self._demande_preparation_item_row(row) for row in rows]

    def _replace_demande_preparation_items(self, conn, passation_id: int, items) -> None:
        conn.execute("DELETE FROM passation_demande_preparation_items WHERE passation_id = ?", (passation_id,))
        now = self._now()
        for item in items or []:
            payload = item.model_dump() if hasattr(item, "model_dump") else dict(item)
            conn.execute(
                """
                INSERT INTO passation_demande_preparation_items (
                    passation_id, module_code, is_required, is_ready, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    passation_id,
                    (payload.get("module_code") or "").strip(),
                    1 if payload.get("is_required") else 0,
                    1 if payload.get("is_ready") else 0,
                    (payload.get("notes") or "").strip(),
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
            date_debut_travaux_prevue=self._parse_date(row["date_debut_travaux_prevue"]) if "date_debut_travaux_prevue" in keys else None,
            source=row["source"] or "",
            operation_type=row["operation_type"] or "",
            phase_operation=row["phase_operation"] or "",
            numero_etude=row["numero_etude"] or "",
            numero_affaire_nge=row["numero_affaire_nge"] or "",
            chantier=row["chantier"] or "",
            client=row["client"] or "",
            maitre_ouvrage=(row["maitre_ouvrage"] or "") if "maitre_ouvrage" in keys else "",
            maitre_oeuvre=(row["maitre_oeuvre"] or "") if "maitre_oeuvre" in keys else "",
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
            workflow_status=row["workflow_status"] or "Brouillon",
            workflow_decision=row["workflow_decision"] or "À décider",
            workflow_decision_comment=row["workflow_decision_comment"] or "",
            workflow_decided_by=row["workflow_decided_by"] or "",
            workflow_decided_at=self._parse_date(row["workflow_decided_at"]),
            synthese=row["synthese"] or "",
            notes=row["notes"] or "",
            types_essais_prevus=row["types_essais_prevus"] if "types_essais_prevus" in keys else "",
            livrables_attendus=row["livrables_attendus"] if "livrables_attendus" in keys else "",
            criteres_conformite=row["criteres_conformite"] if "criteres_conformite" in keys else "",
            demande_destinataire_email=row["demande_destinataire_email"] if "demande_destinataire_email" in keys else "",
            demande_destinataire_name=row["demande_destinataire_name"] if "demande_destinataire_name" in keys else "",
            affaire_ref=row["affaire_ref"] if "affaire_ref" in keys else "",
            nb_documents=int(row["nb_documents"]) if "nb_documents" in keys else 0,
            nb_actions=int(row["nb_actions"]) if "nb_actions" in keys else 0,
            created_at=row["created_at"] or "",
            updated_at=row["updated_at"] or "",
        )

    def _document_row(self, row) -> PassationDocumentRecord:
        keys = row.keys()
        return PassationDocumentRecord(
            uid=int(row["id"]),
            passation_id=int(row["passation_id"]),
            document_type=row["document_type"] or "",
            is_received=bool(row["is_received"]),
            version=row["version"] or "",
            document_date=self._parse_date(row["document_date"]),
            comment=row["comment"] or "",
            stored_path=normalize_stored_path(row["stored_path"] or "" if "stored_path" in keys else ""),
            uploaded_at=self._parse_date(row["uploaded_at"]) if "uploaded_at" in keys else None,
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

    def _role_assignment_row(self, row) -> PassationRoleAssignmentRecord:
        return PassationRoleAssignmentRecord(
            uid=int(row["id"]),
            passation_id=int(row["passation_id"]),
            role_code=row["role_code"] or "",
            assignee=row["assignee"] or "",
            assignment_status=row["assignment_status"] or "À confirmer",
            comment=row["comment"] or "",
            created_at=row["created_at"] or "",
            updated_at=row["updated_at"] or "",
        )

    def _participant_row(self, row) -> PassationParticipantRecord:
        return PassationParticipantRecord(
            uid=int(row["id"]),
            passation_id=int(row["passation_id"]),
            participant_role=row["participant_role"] or "",
            full_name=row["full_name"] or "",
            organisation=row["organisation"] or "",
            email=row["email"] or "",
            phone=row["phone"] or "",
            comment=row["comment"] or "",
            created_at=row["created_at"] or "",
            updated_at=row["updated_at"] or "",
        )

    def _perimeter_item_row(self, row) -> PassationPerimeterItemRecord:
        return PassationPerimeterItemRecord(
            uid=int(row["id"]),
            passation_id=int(row["passation_id"]),
            scope_category=row["scope_category"] or "",
            scope_label=row["scope_label"] or "",
            request_status=row["request_status"] or "Demandé",
            notes=row["notes"] or "",
            created_at=row["created_at"] or "",
            updated_at=row["updated_at"] or "",
        )

    def _responsibility_item_row(self, row) -> PassationResponsibilityItemRecord:
        return PassationResponsibilityItemRecord(
            uid=int(row["id"]),
            passation_id=int(row["passation_id"]),
            workstream_code=row["workstream_code"] or "",
            accountable_role_code=row["accountable_role_code"] or "",
            responsible_role_code=row["responsible_role_code"] or "",
            consulted_roles=row["consulted_roles"] or "",
            informed_roles=row["informed_roles"] or "",
            notes=row["notes"] or "",
            created_at=row["created_at"] or "",
            updated_at=row["updated_at"] or "",
        )

    def _startup_item_row(self, row) -> PassationStartupItemRecord:
        return PassationStartupItemRecord(
            uid=int(row["id"]),
            passation_id=int(row["passation_id"]),
            item_code=row["item_code"] or "",
            owner_role_code=row["owner_role_code"] or "",
            owner_name=row["owner_name"] or "",
            status=row["status"] or "À confirmer",
            due_date=self._parse_date(row["due_date"]),
            notes=row["notes"] or "",
            created_at=row["created_at"] or "",
            updated_at=row["updated_at"] or "",
        )

    def _structured_need_row(self, row) -> PassationStructuredNeedRecord:
        return PassationStructuredNeedRecord(
            uid=int(row["id"]),
            passation_id=int(row["passation_id"]),
            need_code=row["need_code"] or "",
            need_label=row["need_label"] or "",
            description=row["description"] or "" if "description" in row.keys() else "",
            request_status=row["request_status"] or "Non évalué",
            quantity=row["quantity"] or "",
            notes=row["notes"] or "",
            created_at=row["created_at"] or "",
            updated_at=row["updated_at"] or "",
        )

    def _demande_preparation_item_row(self, row) -> PassationDemandePreparationRecord:
        return PassationDemandePreparationRecord(
            uid=int(row["id"]),
            passation_id=int(row["passation_id"]),
            module_code=row["module_code"] or "",
            is_required=bool(row["is_required"]),
            is_ready=bool(row["is_ready"]),
            notes=row["notes"] or "",
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
            stored_path=record.stored_path,
            uploaded_at=record.uploaded_at,
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
    def _role_assignment_schema(record: PassationRoleAssignmentRecord) -> PassationRoleAssignmentSchema:
        return PassationRoleAssignmentSchema(
            uid=record.uid,
            role_code=record.role_code,
            assignee=record.assignee,
            assignment_status=record.assignment_status,
            comment=record.comment,
        )

    @staticmethod
    def _participant_schema(record: PassationParticipantRecord) -> PassationParticipantSchema:
        return PassationParticipantSchema(
            uid=record.uid,
            participant_role=record.participant_role,
            full_name=record.full_name,
            organisation=record.organisation,
            email=record.email,
            phone=record.phone,
            comment=record.comment,
        )

    @staticmethod
    def _perimeter_item_schema(record: PassationPerimeterItemRecord) -> PassationPerimeterItemSchema:
        return PassationPerimeterItemSchema(
            uid=record.uid,
            scope_category=record.scope_category,
            scope_label=record.scope_label,
            request_status=record.request_status,
            notes=record.notes,
        )

    @staticmethod
    def _responsibility_item_schema(record: PassationResponsibilityItemRecord) -> PassationResponsibilityItemSchema:
        return PassationResponsibilityItemSchema(
            uid=record.uid,
            workstream_code=record.workstream_code,
            accountable_role_code=record.accountable_role_code,
            responsible_role_code=record.responsible_role_code,
            consulted_roles=record.consulted_roles,
            informed_roles=record.informed_roles,
            notes=record.notes,
        )

    @staticmethod
    def _startup_item_schema(record: PassationStartupItemRecord) -> PassationStartupItemSchema:
        return PassationStartupItemSchema(
            uid=record.uid,
            item_code=record.item_code,
            owner_role_code=record.owner_role_code,
            owner_name=record.owner_name,
            status=record.status,
            due_date=record.due_date,
            notes=record.notes,
        )

    @staticmethod
    def _structured_need_schema(record: PassationStructuredNeedRecord) -> PassationStructuredNeedSchema:
        return PassationStructuredNeedSchema(
            uid=record.uid,
            need_code=record.need_code,
            need_label=record.need_label,
            description=record.description,
            request_status=record.request_status,
            quantity=record.quantity,
            notes=record.notes,
        )

    @staticmethod
    def _demande_preparation_item_schema(record: PassationDemandePreparationRecord) -> PassationDemandePreparationItemSchema:
        return PassationDemandePreparationItemSchema(
            uid=record.uid,
            module_code=record.module_code,
            is_required=record.is_required,
            is_ready=record.is_ready,
            notes=record.notes,
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
        if key in {"date_passation", "date_debut_travaux_prevue", "workflow_decided_at"}:
            if value in (None, ""):
                return None
            if isinstance(value, date):
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

