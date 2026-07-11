"""Repository SQLite pour le module G3."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from app.core.database import connect_db, ensure_ralab4_schema, get_db_path
from app.models.g3 import (
    G3DeliverableSchema,
    G3DocumentSchema,
    G3HistorySchema,
    G3HoldPointSchema,
    G3InterventionSchema,
    G3MissionCreateSchema,
    G3MissionListItemSchema,
    G3MissionResponseSchema,
    G3MissionUpdateSchema,
    G3NoticeSchema,
    G3ObjectiveSchema,
    G3PhotoSchema,
    G3TestSchema,
    G3ZoneSchema,
)
from app.services.g3_reference_service import next_g3_mission_reference
from app.models.g3_catalogs import (
    G3_DEFAULT_OBJECTIVE_TEMPLATES,
    G3_DELIVERABLE_TYPE_OPTIONS,
    G3_HOLD_POINT_TEMPLATES,
    G3_PROGRAMME_DEFAULT_TEMPLATE,
)
from app.services.g3_planning_service import compute_hold_point_alerts


class G3Repository:
    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or get_db_path()
        ensure_ralab4_schema(self.db_path)

    def _connect(self):
        return connect_db(self.db_path)

    @staticmethod
    def _json_list(raw: object) -> list:
        if not raw:
            return []
        if isinstance(raw, list):
            return raw
        try:
            parsed = json.loads(str(raw))
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []

    @staticmethod
    def _json_dict(raw: object) -> dict:
        if not raw:
            return {}
        if isinstance(raw, dict):
            return raw
        try:
            parsed = json.loads(str(raw))
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}

    def list_missions(
        self,
        *,
        affaire_rst_id: int | None = None,
        demande_id: int | None = None,
        status: str | None = None,
        search: str | None = None,
    ) -> list[G3MissionListItemSchema]:
        sql = """
            SELECT m.*,
                   a.reference AS affaire_ref,
                   d.reference AS demande_ref,
                   SUM(CASE WHEN i.phase = 'planned' THEN 1 ELSE 0 END) AS nb_planned,
                   SUM(CASE WHEN i.phase = 'realized' THEN 1 ELSE 0 END) AS nb_realized
            FROM g3_missions m
            JOIN affaires_rst a ON a.id = m.affaire_rst_id
            JOIN demandes d ON d.id = m.demande_id
            LEFT JOIN g3_interventions i ON i.mission_id = m.id
            WHERE 1=1
        """
        params: list[Any] = []
        if affaire_rst_id is not None:
            sql += " AND m.affaire_rst_id = ?"
            params.append(affaire_rst_id)
        if demande_id is not None:
            sql += " AND m.demande_id = ?"
            params.append(demande_id)
        if status:
            sql += " AND m.status = ?"
            params.append(status)
        if search:
            like = f"%{search}%"
            sql += """
                AND (
                    m.reference LIKE ? OR m.title LIKE ? OR m.chantier LIKE ?
                    OR m.client LIKE ? OR a.reference LIKE ? OR d.reference LIKE ?
                )
            """
            params.extend([like] * 6)
        sql += " GROUP BY m.id ORDER BY m.updated_at DESC, m.id DESC"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._list_item(row) for row in rows]

    def get_mission(self, mission_id: int) -> G3MissionResponseSchema | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT m.*, a.reference AS affaire_ref, d.reference AS demande_ref
                FROM g3_missions m
                JOIN affaires_rst a ON a.id = m.affaire_rst_id
                JOIN demandes d ON d.id = m.demande_id
                WHERE m.id = ?
                """,
                (mission_id,),
            ).fetchone()
            if not row:
                return None
            zones = self._list_zones(conn, mission_id)
            documents = self._list_documents(conn, mission_id)
            objectives = self._list_objectives(conn, mission_id)
            planned = self._list_interventions(conn, mission_id, phase="planned")
            realized = self._list_interventions(conn, mission_id, phase="realized")
            tests = self._list_tests(conn, mission_id)
            photos = self._list_photos(conn, mission_id)
            notices = self._list_notices(conn, mission_id)
            hold_points = self._list_hold_points(conn, mission_id)
            deliverables = self._list_deliverables(conn, mission_id)
            history = self._list_history(conn, mission_id)
            mission = self._mission_response(
                row, zones, documents, objectives, planned, realized, tests, photos,
                notices, hold_points, deliverables, history,
            )
            enriched_hold_points = [
                hp.model_copy(update={"alerts": compute_hold_point_alerts(hp, mission)})
                for hp in mission.hold_points
            ]
            return mission.model_copy(update={"hold_points": enriched_hold_points})

    def get_demande_context(self, demande_id: int) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT d.*,
                       a.reference AS affaire_ref,
                       a.client,
                       a.chantier,
                       a.site,
                       a.adresse_ouvrage,
                       a.maitre_ouvrage,
                       a.maitre_oeuvre,
                       a.responsable AS responsable_affaire
                FROM demandes d
                JOIN affaires_rst a ON a.id = d.affaire_rst_id
                WHERE d.id = ?
                """,
                (demande_id,),
            ).fetchone()
            return dict(row) if row else None

    def create_mission(
        self,
        body: G3MissionCreateSchema,
        *,
        user_name: str = "",
    ) -> G3MissionResponseSchema:
        ctx = self.get_demande_context(body.demande_id)
        if not ctx:
            raise ValueError(f"Demande #{body.demande_id} introuvable")
        affaire_rst_id = int(ctx["affaire_rst_id"])
        now = datetime.utcnow().isoformat(timespec="seconds")
        payload = body.model_dump()
        with self._connect() as conn:
            reference = self._next_reference(
                conn=conn,
                affaire_ref=str(ctx.get("affaire_ref") or ""),
                demande_id=int(body.demande_id),
                demande_numero=int(ctx.get("numero") or 0),
            )
            cur = conn.execute(
                """
                INSERT INTO g3_missions (
                    reference, affaire_rst_id, demande_id, title, client, chantier, location,
                    status, mission_types_json, description, main_objective,
                    conducteur, chef_chantier, rst_responsible, laboratoire, lab_intervenant,
                    geotechnicien_externe, moa, moe, bureau_controle,
                    start_date, end_date, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    reference,
                    affaire_rst_id,
                    int(body.demande_id),
                    payload.get("title") or str(ctx.get("description") or ctx.get("nature") or "").strip(),
                    payload.get("client") or str(ctx.get("client") or ""),
                    payload.get("chantier") or str(ctx.get("chantier") or ctx.get("site") or ""),
                    payload.get("location") or str(ctx.get("adresse_ouvrage") or ctx.get("site") or ""),
                    payload.get("status") or "À préparer",
                    json.dumps(payload.get("mission_types") or [], ensure_ascii=False),
                    payload.get("description") or str(ctx.get("description") or ""),
                    payload.get("main_objective") or str(ctx.get("type_prestation_attendue") or ""),
                    payload.get("conducteur") or "",
                    payload.get("chef_chantier") or "",
                    payload.get("rst_responsible") or str(ctx.get("responsable_affaire") or ""),
                    payload.get("laboratoire") or str(ctx.get("service_interne") or ctx.get("labo_code") or ""),
                    payload.get("lab_intervenant") or "",
                    payload.get("geotechnicien_externe") or "",
                    payload.get("moa") or str(ctx.get("maitre_ouvrage") or ""),
                    payload.get("moe") or str(ctx.get("maitre_oeuvre") or ""),
                    payload.get("bureau_controle") or "",
                    payload.get("start_date"),
                    payload.get("end_date"),
                    now,
                    now,
                ),
            )
            mission_id = int(cur.lastrowid)
            self._append_history(
                conn,
                mission_id,
                user_name=user_name,
                action="Création mission G3",
                entity_type="g3_mission",
                entity_id=mission_id,
            )
            conn.commit()
        result = self.get_mission(mission_id)
        if not result:
            raise RuntimeError("Mission G3 créée mais introuvable")
        return result

    def update_mission(
        self,
        mission_id: int,
        body: G3MissionUpdateSchema,
        *,
        user_name: str = "",
    ) -> G3MissionResponseSchema | None:
        updates = body.model_dump(exclude_unset=True)
        if not updates:
            return self.get_mission(mission_id)
        if "mission_types" in updates:
            updates["mission_types_json"] = json.dumps(updates.pop("mission_types") or [], ensure_ascii=False)
        updates["updated_at"] = datetime.utcnow().isoformat(timespec="seconds")
        cols = ", ".join(f"{key} = ?" for key in updates)
        params = list(updates.values()) + [mission_id]
        with self._connect() as conn:
            cur = conn.execute(f"UPDATE g3_missions SET {cols} WHERE id = ?", params)
            if cur.rowcount == 0:
                return None
            self._append_history(
                conn,
                mission_id,
                user_name=user_name,
                action="Modification mission G3",
                entity_type="g3_mission",
                entity_id=mission_id,
            )
            conn.commit()
        return self.get_mission(mission_id)

    def create_default_programme(self, mission_id: int, *, user_name: str = "") -> list[G3InterventionSchema]:
        with self._connect() as conn:
            mission = conn.execute("SELECT id FROM g3_missions WHERE id = ?", (mission_id,)).fetchone()
            if not mission:
                raise ValueError(f"Mission #{mission_id} introuvable")
            existing = conn.execute(
                "SELECT COUNT(*) AS c FROM g3_interventions WHERE mission_id = ? AND phase = 'planned'",
                (mission_id,),
            ).fetchone()
            if int(existing["c"] or 0) > 0:
                raise ValueError("Un programme existe déjà pour cette mission")
            created: list[G3InterventionSchema] = []
            for index, item in enumerate(G3_PROGRAMME_DEFAULT_TEMPLATE, start=1):
                cur = conn.execute(
                    """
                    INSERT INTO g3_interventions (
                        mission_id, number, type, phase, objective, expected_deliverable, status
                    ) VALUES (?, ?, ?, 'planned', ?, ?, 'À prévoir')
                    """,
                    (
                        mission_id,
                        f"{index:02d}",
                        str(item.get("type") or ""),
                        str(item.get("objective") or ""),
                        str(item.get("expected_deliverable") or ""),
                    ),
                )
                created.append(
                    G3InterventionSchema(
                        id=int(cur.lastrowid),
                        mission_id=mission_id,
                        number=f"{index:02d}",
                        type=str(item.get("type") or ""),
                        phase="planned",
                        objective=str(item.get("objective") or ""),
                        expected_deliverable=str(item.get("expected_deliverable") or ""),
                        status="À prévoir",
                    )
                )
            self._append_history(
                conn,
                mission_id,
                user_name=user_name,
                action="Création programme type G3",
                entity_type="g3_programme",
                entity_id=mission_id,
            )
            conn.commit()
        return created

    def list_planned_interventions(self, mission_id: int) -> list[G3InterventionSchema]:
        with self._connect() as conn:
            return self._list_interventions(conn, mission_id, phase="planned")

    def create_planned_intervention(
        self,
        mission_id: int,
        data: dict[str, Any],
        *,
        user_name: str = "",
    ) -> G3InterventionSchema:
        with self._connect() as conn:
            number = self._next_intervention_number(conn, mission_id)
            cur = conn.execute(
                """
                INSERT INTO g3_interventions (
                    mission_id, zone_id, number, type, phase, objective, means, responsible,
                    prerequisites, date, status, expected_deliverable, comments
                ) VALUES (?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mission_id,
                    data.get("zone_id"),
                    number,
                    str(data.get("type") or ""),
                    str(data.get("objective") or ""),
                    str(data.get("means") or ""),
                    str(data.get("responsible") or ""),
                    str(data.get("prerequisites") or ""),
                    data.get("date"),
                    str(data.get("status") or "À prévoir"),
                    str(data.get("expected_deliverable") or ""),
                    str(data.get("comments") or ""),
                ),
            )
            intervention_id = int(cur.lastrowid)
            self._append_history(
                conn,
                mission_id,
                user_name=user_name,
                action="Ajout intervention prévue",
                entity_type="g3_intervention",
                entity_id=intervention_id,
            )
            conn.commit()
            rows = self._list_interventions(conn, mission_id, phase="planned")
            return next(row for row in rows if row.id == intervention_id)

    def update_intervention(
        self,
        intervention_id: int,
        data: dict[str, Any],
        *,
        user_name: str = "",
    ) -> G3InterventionSchema | None:
        allowed = {
            "zone_id", "type", "objective", "means", "responsible", "prerequisites", "date",
            "status", "expected_deliverable", "comments", "start_time", "end_time", "participants",
            "description", "findings", "decision", "next_actions", "weather", "hydric_condition",
            "plan_object_id",
        }
        updates = {k: v for k, v in data.items() if k in allowed and v is not None}
        if "payload" in data and data["payload"] is not None:
            updates["payload_json"] = json.dumps(data["payload"], ensure_ascii=False)
        if not updates:
            return self._get_intervention(intervention_id)
        updates["updated_at"] = datetime.utcnow().isoformat(timespec="seconds")
        cols = ", ".join(f"{key} = ?" for key in updates)
        params = list(updates.values()) + [intervention_id]
        with self._connect() as conn:
            row = conn.execute(
                "SELECT mission_id FROM g3_interventions WHERE id = ?",
                (intervention_id,),
            ).fetchone()
            if not row:
                return None
            conn.execute(f"UPDATE g3_interventions SET {cols} WHERE id = ?", params)
            self._append_history(
                conn,
                int(row["mission_id"]),
                user_name=user_name,
                action="Modification intervention G3",
                entity_type="g3_intervention",
                entity_id=intervention_id,
            )
            conn.commit()
        return self._get_intervention(intervention_id)

    def delete_intervention(self, intervention_id: int, *, user_name: str = "") -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT mission_id, phase FROM g3_interventions WHERE id = ?",
                (intervention_id,),
            ).fetchone()
            if not row:
                return False
            conn.execute("DELETE FROM g3_interventions WHERE id = ?", (intervention_id,))
            self._append_history(
                conn,
                int(row["mission_id"]),
                user_name=user_name,
                action="Suppression intervention G3",
                entity_type="g3_intervention",
                entity_id=intervention_id,
            )
            conn.commit()
        return True

    def promote_to_realized(
        self,
        planned_id: int,
        *,
        user_name: str = "",
    ) -> G3InterventionSchema:
        with self._connect() as conn:
            planned = conn.execute(
                "SELECT * FROM g3_interventions WHERE id = ? AND phase = 'planned'",
                (planned_id,),
            ).fetchone()
            if not planned:
                raise ValueError("Intervention prévue introuvable")
            existing = conn.execute(
                "SELECT id FROM g3_interventions WHERE realized_from_id = ?",
                (planned_id,),
            ).fetchone()
            if existing:
                raise ValueError("Cette intervention a déjà été transformée")
            cur = conn.execute(
                """
                INSERT INTO g3_interventions (
                    mission_id, zone_id, number, type, phase, objective, means, responsible,
                    prerequisites, date, status, expected_deliverable, comments, realized_from_id
                ) VALUES (?, ?, ?, ?, 'realized', ?, ?, ?, ?, ?, 'Brouillon', ?, ?, ?)
                """,
                (
                    planned["mission_id"],
                    planned["zone_id"],
                    planned["number"],
                    planned["type"],
                    planned["objective"],
                    planned["means"],
                    planned["responsible"],
                    planned["prerequisites"],
                    planned["date"],
                    planned["expected_deliverable"],
                    planned["comments"],
                    planned_id,
                ),
            )
            realized_id = int(cur.lastrowid)
            conn.execute(
                "UPDATE g3_interventions SET status = 'Réalisé' WHERE id = ?",
                (planned_id,),
            )
            self._append_history(
                conn,
                int(planned["mission_id"]),
                user_name=user_name,
                action="Transformation intervention prévue en réalisée",
                entity_type="g3_intervention",
                entity_id=realized_id,
                comment=f"Depuis prévision #{planned_id}",
            )
            conn.commit()
        result = self._get_intervention(realized_id)
        if not result:
            raise RuntimeError("Intervention réalisée introuvable")
        return result

    def create_realized_intervention(
        self,
        mission_id: int,
        data: dict[str, Any],
        *,
        user_name: str = "",
    ) -> G3InterventionSchema:
        with self._connect() as conn:
            self._ensure_mission(conn, mission_id)
            number = self._next_intervention_number(conn, mission_id)
            cur = conn.execute(
                """
                INSERT INTO g3_interventions (
                    mission_id, zone_id, number, type, phase, objective, means, responsible,
                    date, status, description, comments
                ) VALUES (?, ?, ?, ?, 'realized', ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mission_id,
                    data.get("zone_id"),
                    number,
                    str(data.get("type") or ""),
                    str(data.get("objective") or ""),
                    str(data.get("means") or ""),
                    str(data.get("responsible") or ""),
                    data.get("date"),
                    str(data.get("status") or "Brouillon"),
                    str(data.get("description") or ""),
                    str(data.get("comments") or ""),
                ),
            )
            intervention_id = int(cur.lastrowid)
            self._append_history(
                conn,
                mission_id,
                user_name=user_name,
                action="Ajout intervention réalisée",
                entity_type="g3_intervention",
                entity_id=intervention_id,
            )
            conn.commit()
        result = self._get_intervention(intervention_id)
        if not result:
            raise RuntimeError("Intervention réalisée introuvable")
        return result

    def create_test(
        self,
        mission_id: int,
        data: dict[str, Any],
        *,
        user_name: str = "",
    ) -> G3TestSchema:
        now = datetime.utcnow().isoformat(timespec="seconds")
        payload_json = json.dumps(data.get("payload") or {}, ensure_ascii=False)
        with self._connect() as conn:
            self._ensure_mission(conn, mission_id)
            cur = conn.execute(
                """
                INSERT INTO g3_tests (
                    mission_id, zone_id, intervention_id, type, label, reference, test_date,
                    status, result, conformity, observations, payload_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mission_id,
                    data.get("zone_id"),
                    data.get("intervention_id"),
                    str(data.get("type") or ""),
                    str(data.get("label") or ""),
                    str(data.get("reference") or ""),
                    data.get("test_date"),
                    str(data.get("status") or "En attente"),
                    str(data.get("result") or ""),
                    str(data.get("conformity") or "En attente"),
                    str(data.get("observations") or ""),
                    payload_json,
                    now,
                    now,
                ),
            )
            test_id = int(cur.lastrowid)
            self._append_history(
                conn, mission_id, user_name=user_name,
                action="Ajout essai G3", entity_type="g3_test", entity_id=test_id,
            )
            conn.commit()
        result = self._get_test(test_id)
        if not result:
            raise RuntimeError("Essai G3 introuvable")
        return result

    def update_test(self, test_id: int, data: dict[str, Any], *, user_name: str = "") -> G3TestSchema | None:
        allowed = {
            "zone_id", "intervention_id", "type", "label", "reference", "test_date",
            "status", "result", "conformity", "observations",
        }
        updates = {k: v for k, v in data.items() if k in allowed and v is not None}
        if "payload" in data and data["payload"] is not None:
            updates["payload_json"] = json.dumps(data["payload"], ensure_ascii=False)
        if not updates:
            return self._get_test(test_id)
        updates["updated_at"] = datetime.utcnow().isoformat(timespec="seconds")
        cols = ", ".join(f"{k} = ?" for k in updates)
        with self._connect() as conn:
            row = conn.execute("SELECT mission_id FROM g3_tests WHERE id = ?", (test_id,)).fetchone()
            if not row:
                return None
            conn.execute(f"UPDATE g3_tests SET {cols} WHERE id = ?", list(updates.values()) + [test_id])
            self._append_history(
                conn, int(row["mission_id"]), user_name=user_name,
                action="Modification essai G3", entity_type="g3_test", entity_id=test_id,
            )
            conn.commit()
        return self._get_test(test_id)

    def delete_test(self, test_id: int, *, user_name: str = "") -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT mission_id FROM g3_tests WHERE id = ?", (test_id,)).fetchone()
            if not row:
                return False
            conn.execute("DELETE FROM g3_tests WHERE id = ?", (test_id,))
            self._append_history(
                conn, int(row["mission_id"]), user_name=user_name,
                action="Suppression essai G3", entity_type="g3_test", entity_id=test_id,
            )
            conn.commit()
        return True

    def create_photo(
        self,
        mission_id: int,
        data: dict[str, Any],
        *,
        user_name: str = "",
    ) -> G3PhotoSchema:
        now = datetime.utcnow().isoformat(timespec="seconds")
        with self._connect() as conn:
            self._ensure_mission(conn, mission_id)
            sort_row = conn.execute(
                "SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM g3_photos WHERE mission_id = ?",
                (mission_id,),
            ).fetchone()
            sort_order = int(data.get("sort_order") or 0)
            if sort_order <= 0:
                sort_order = int(sort_row["max_sort"] or 0) + 1
            cur = conn.execute(
                """
                INSERT INTO g3_photos (
                    mission_id, zone_id, intervention_id, caption, stored_path, use_in_report,
                    sort_order, taken_at, uploaded_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mission_id,
                    data.get("zone_id"),
                    data.get("intervention_id"),
                    str(data.get("caption") or ""),
                    str(data.get("stored_path") or ""),
                    1 if data.get("use_in_report") else 0,
                    sort_order,
                    data.get("taken_at"),
                    data.get("uploaded_at") or now,
                    now,
                    now,
                ),
            )
            photo_id = int(cur.lastrowid)
            self._append_history(
                conn, mission_id, user_name=user_name,
                action="Ajout photo G3", entity_type="g3_photo", entity_id=photo_id,
            )
            conn.commit()
        result = self._get_photo(photo_id)
        if not result:
            raise RuntimeError("Photo G3 introuvable")
        return result

    def update_photo(self, photo_id: int, data: dict[str, Any], *, user_name: str = "") -> G3PhotoSchema | None:
        allowed = {
            "zone_id", "intervention_id", "caption", "stored_path", "sort_order", "taken_at", "uploaded_at",
        }
        updates = {k: v for k, v in data.items() if k in allowed and v is not None}
        if "use_in_report" in data and data["use_in_report"] is not None:
            updates["use_in_report"] = 1 if data["use_in_report"] else 0
        if not updates:
            return self._get_photo(photo_id)
        updates["updated_at"] = datetime.utcnow().isoformat(timespec="seconds")
        cols = ", ".join(f"{k} = ?" for k in updates)
        with self._connect() as conn:
            row = conn.execute("SELECT mission_id FROM g3_photos WHERE id = ?", (photo_id,)).fetchone()
            if not row:
                return None
            conn.execute(f"UPDATE g3_photos SET {cols} WHERE id = ?", list(updates.values()) + [photo_id])
            self._append_history(
                conn, int(row["mission_id"]), user_name=user_name,
                action="Modification photo G3", entity_type="g3_photo", entity_id=photo_id,
            )
            conn.commit()
        return self._get_photo(photo_id)

    def delete_photo(self, photo_id: int, *, user_name: str = "") -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT mission_id FROM g3_photos WHERE id = ?", (photo_id,)).fetchone()
            if not row:
                return False
            conn.execute("DELETE FROM g3_photos WHERE id = ?", (photo_id,))
            self._append_history(
                conn, int(row["mission_id"]), user_name=user_name,
                action="Suppression photo G3", entity_type="g3_photo", entity_id=photo_id,
            )
            conn.commit()
        return True

    def create_notice(
        self,
        mission_id: int,
        data: dict[str, Any],
        *,
        user_name: str = "",
    ) -> G3NoticeSchema:
        now = datetime.utcnow().isoformat(timespec="seconds")
        payload_json = json.dumps(data.get("payload") or {}, ensure_ascii=False)
        with self._connect() as conn:
            self._ensure_mission(conn, mission_id)
            cur = conn.execute(
                """
                INSERT INTO g3_notices (
                    mission_id, zone_id, intervention_id, type, reference, title, status,
                    notice_date, formulation, content, conditions, recommendations,
                    transmitted_at, payload_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mission_id,
                    data.get("zone_id"),
                    data.get("intervention_id"),
                    str(data.get("type") or ""),
                    str(data.get("reference") or ""),
                    str(data.get("title") or ""),
                    str(data.get("status") or "Brouillon"),
                    data.get("notice_date"),
                    str(data.get("formulation") or ""),
                    str(data.get("content") or ""),
                    str(data.get("conditions") or ""),
                    str(data.get("recommendations") or ""),
                    data.get("transmitted_at"),
                    payload_json,
                    now,
                    now,
                ),
            )
            notice_id = int(cur.lastrowid)
            self._append_history(
                conn, mission_id, user_name=user_name,
                action="Ajout avis G3", entity_type="g3_notice", entity_id=notice_id,
            )
            conn.commit()
        result = self._get_notice(notice_id)
        if not result:
            raise RuntimeError("Avis G3 introuvable")
        return result

    def update_notice(self, notice_id: int, data: dict[str, Any], *, user_name: str = "") -> G3NoticeSchema | None:
        allowed = {
            "zone_id", "intervention_id", "type", "reference", "title", "status", "notice_date",
            "formulation", "content", "conditions", "recommendations", "transmitted_at",
        }
        updates = {k: v for k, v in data.items() if k in allowed and v is not None}
        if "payload" in data and data["payload"] is not None:
            updates["payload_json"] = json.dumps(data["payload"], ensure_ascii=False)
        if not updates:
            return self._get_notice(notice_id)
        updates["updated_at"] = datetime.utcnow().isoformat(timespec="seconds")
        cols = ", ".join(f"{k} = ?" for k in updates)
        with self._connect() as conn:
            row = conn.execute("SELECT mission_id FROM g3_notices WHERE id = ?", (notice_id,)).fetchone()
            if not row:
                return None
            conn.execute(f"UPDATE g3_notices SET {cols} WHERE id = ?", list(updates.values()) + [notice_id])
            self._append_history(
                conn, int(row["mission_id"]), user_name=user_name,
                action="Modification avis G3", entity_type="g3_notice", entity_id=notice_id,
            )
            conn.commit()
        return self._get_notice(notice_id)

    def delete_notice(self, notice_id: int, *, user_name: str = "") -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT mission_id FROM g3_notices WHERE id = ?", (notice_id,)).fetchone()
            if not row:
                return False
            conn.execute("DELETE FROM g3_notices WHERE id = ?", (notice_id,))
            self._append_history(
                conn, int(row["mission_id"]), user_name=user_name,
                action="Suppression avis G3", entity_type="g3_notice", entity_id=notice_id,
            )
            conn.commit()
        return True

    def create_hold_point(
        self,
        mission_id: int,
        data: dict[str, Any],
        *,
        user_name: str = "",
    ) -> G3HoldPointSchema:
        now = datetime.utcnow().isoformat(timespec="seconds")
        with self._connect() as conn:
            self._ensure_mission(conn, mission_id)
            cur = conn.execute(
                """
                INSERT INTO g3_hold_points (
                    mission_id, zone_id, notice_id, code, label, description, status,
                    due_date, observations, requires_tests, requires_notice, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mission_id,
                    data.get("zone_id"),
                    data.get("notice_id"),
                    str(data.get("code") or ""),
                    str(data.get("label") or ""),
                    str(data.get("description") or ""),
                    str(data.get("status") or "À venir"),
                    data.get("due_date"),
                    str(data.get("observations") or ""),
                    1 if data.get("requires_tests") else 0,
                    1 if data.get("requires_notice") else 0,
                    now,
                    now,
                ),
            )
            hold_id = int(cur.lastrowid)
            self._append_history(
                conn, mission_id, user_name=user_name,
                action="Ajout point d'arrêt G3", entity_type="g3_hold_point", entity_id=hold_id,
            )
            conn.commit()
        result = self._get_hold_point(hold_id)
        if not result:
            raise RuntimeError("Point d'arrêt G3 introuvable")
        return result

    def create_default_hold_points(self, mission_id: int, *, user_name: str = "") -> list[G3HoldPointSchema]:
        with self._connect() as conn:
            self._ensure_mission(conn, mission_id)
            existing = conn.execute(
                "SELECT COUNT(*) AS c FROM g3_hold_points WHERE mission_id = ?",
                (mission_id,),
            ).fetchone()
            if int(existing["c"] or 0) > 0:
                raise ValueError("Des points d'arrêt existent déjà pour cette mission")
            created: list[G3HoldPointSchema] = []
            now = datetime.utcnow().isoformat(timespec="seconds")
            for template in G3_HOLD_POINT_TEMPLATES:
                cur = conn.execute(
                    """
                    INSERT INTO g3_hold_points (
                        mission_id, code, label, status, requires_tests, requires_notice,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, 'À venir', 1, 1, ?, ?)
                    """,
                    (mission_id, template["code"], template["label"], now, now),
                )
                created.append(G3HoldPointSchema(
                    id=int(cur.lastrowid),
                    mission_id=mission_id,
                    code=str(template["code"]),
                    label=str(template["label"]),
                    status="À venir",
                    requires_tests=True,
                    requires_notice=True,
                ))
            self._append_history(
                conn, mission_id, user_name=user_name,
                action="Création points d'arrêt type G3",
                entity_type="g3_hold_points", entity_id=mission_id,
            )
            conn.commit()
        return created

    def update_hold_point(
        self,
        hold_id: int,
        data: dict[str, Any],
        *,
        user_name: str = "",
    ) -> G3HoldPointSchema | None:
        allowed = {
            "zone_id", "notice_id", "code", "label", "description", "status",
            "due_date", "validated_at", "observations",
        }
        updates = {k: v for k, v in data.items() if k in allowed and v is not None}
        if "requires_tests" in data and data["requires_tests"] is not None:
            updates["requires_tests"] = 1 if data["requires_tests"] else 0
        if "requires_notice" in data and data["requires_notice"] is not None:
            updates["requires_notice"] = 1 if data["requires_notice"] else 0
        if not updates:
            return self._get_hold_point(hold_id)
        updates["updated_at"] = datetime.utcnow().isoformat(timespec="seconds")
        cols = ", ".join(f"{k} = ?" for k in updates)
        with self._connect() as conn:
            row = conn.execute("SELECT mission_id FROM g3_hold_points WHERE id = ?", (hold_id,)).fetchone()
            if not row:
                return None
            conn.execute(f"UPDATE g3_hold_points SET {cols} WHERE id = ?", list(updates.values()) + [hold_id])
            self._append_history(
                conn, int(row["mission_id"]), user_name=user_name,
                action="Modification point d'arrêt G3", entity_type="g3_hold_point", entity_id=hold_id,
            )
            conn.commit()
        return self._get_hold_point(hold_id)

    def delete_hold_point(self, hold_id: int, *, user_name: str = "") -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT mission_id FROM g3_hold_points WHERE id = ?", (hold_id,)).fetchone()
            if not row:
                return False
            conn.execute("DELETE FROM g3_hold_points WHERE id = ?", (hold_id,))
            self._append_history(
                conn, int(row["mission_id"]), user_name=user_name,
                action="Suppression point d'arrêt G3", entity_type="g3_hold_point", entity_id=hold_id,
            )
            conn.commit()
        return True

    def create_deliverable(
        self,
        mission_id: int,
        data: dict[str, Any],
        *,
        user_name: str = "",
    ) -> G3DeliverableSchema:
        now = datetime.utcnow().isoformat(timespec="seconds")
        payload_json = json.dumps(data.get("payload") or {}, ensure_ascii=False)
        with self._connect() as conn:
            self._ensure_mission(conn, mission_id)
            cur = conn.execute(
                """
                INSERT INTO g3_deliverables (
                    mission_id, type, title, version, status, due_date, observations,
                    payload_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mission_id,
                    str(data.get("type") or ""),
                    str(data.get("title") or data.get("type") or ""),
                    str(data.get("version") or "1"),
                    str(data.get("status") or "À produire"),
                    data.get("due_date"),
                    str(data.get("observations") or ""),
                    payload_json,
                    now,
                    now,
                ),
            )
            deliverable_id = int(cur.lastrowid)
            self._append_history(
                conn, mission_id, user_name=user_name,
                action="Ajout livrable G3", entity_type="g3_deliverable", entity_id=deliverable_id,
            )
            conn.commit()
        result = self._get_deliverable(deliverable_id)
        if not result:
            raise RuntimeError("Livrable G3 introuvable")
        return result

    def create_default_deliverables(self, mission_id: int, *, user_name: str = "") -> list[G3DeliverableSchema]:
        with self._connect() as conn:
            self._ensure_mission(conn, mission_id)
            existing = conn.execute(
                "SELECT COUNT(*) AS c FROM g3_deliverables WHERE mission_id = ?",
                (mission_id,),
            ).fetchone()
            if int(existing["c"] or 0) > 0:
                raise ValueError("Des livrables existent déjà pour cette mission")
            created: list[G3DeliverableSchema] = []
            now = datetime.utcnow().isoformat(timespec="seconds")
            for deliverable_type in G3_DELIVERABLE_TYPE_OPTIONS:
                cur = conn.execute(
                    """
                    INSERT INTO g3_deliverables (
                        mission_id, type, title, version, status, created_at, updated_at
                    ) VALUES (?, ?, ?, '1', 'À produire', ?, ?)
                    """,
                    (mission_id, deliverable_type, deliverable_type, now, now),
                )
                created.append(G3DeliverableSchema(
                    id=int(cur.lastrowid),
                    mission_id=mission_id,
                    type=deliverable_type,
                    title=deliverable_type,
                    version="1",
                    status="À produire",
                ))
            self._append_history(
                conn, mission_id, user_name=user_name,
                action="Création livrables type G3",
                entity_type="g3_deliverables", entity_id=mission_id,
            )
            conn.commit()
        return created

    def update_deliverable(
        self,
        deliverable_id: int,
        data: dict[str, Any],
        *,
        user_name: str = "",
    ) -> G3DeliverableSchema | None:
        allowed = {
            "type", "title", "version", "status", "due_date", "generated_at",
            "stored_path", "observations",
        }
        updates = {k: v for k, v in data.items() if k in allowed and v is not None}
        if "payload" in data and data["payload"] is not None:
            updates["payload_json"] = json.dumps(data["payload"], ensure_ascii=False)
        if not updates:
            return self._get_deliverable(deliverable_id)
        updates["updated_at"] = datetime.utcnow().isoformat(timespec="seconds")
        cols = ", ".join(f"{k} = ?" for k in updates)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT mission_id FROM g3_deliverables WHERE id = ?",
                (deliverable_id,),
            ).fetchone()
            if not row:
                return None
            conn.execute(f"UPDATE g3_deliverables SET {cols} WHERE id = ?", list(updates.values()) + [deliverable_id])
            self._append_history(
                conn, int(row["mission_id"]), user_name=user_name,
                action="Modification livrable G3", entity_type="g3_deliverable", entity_id=deliverable_id,
            )
            conn.commit()
        return self._get_deliverable(deliverable_id)

    def mark_deliverable_generated(
        self,
        deliverable_id: int,
        *,
        user_name: str = "",
    ) -> G3DeliverableSchema | None:
        now = datetime.utcnow().isoformat(timespec="seconds")
        return self.update_deliverable(
            deliverable_id,
            {"generated_at": now, "status": "Brouillon"},
            user_name=user_name,
        )

    def delete_deliverable(self, deliverable_id: int, *, user_name: str = "") -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT mission_id FROM g3_deliverables WHERE id = ?",
                (deliverable_id,),
            ).fetchone()
            if not row:
                return False
            conn.execute("DELETE FROM g3_deliverables WHERE id = ?", (deliverable_id,))
            self._append_history(
                conn, int(row["mission_id"]), user_name=user_name,
                action="Suppression livrable G3", entity_type="g3_deliverable", entity_id=deliverable_id,
            )
            conn.commit()
        return True

    def _ensure_mission(self, conn, mission_id: int) -> None:
        row = conn.execute("SELECT id FROM g3_missions WHERE id = ?", (mission_id,)).fetchone()
        if not row:
            raise ValueError(f"Mission #{mission_id} introuvable")

    def create_zone(self, mission_id: int, data: dict[str, Any], *, user_name: str = "") -> G3ZoneSchema:
        now = datetime.utcnow().isoformat(timespec="seconds")
        with self._connect() as conn:
            self._ensure_mission(conn, mission_id)
            cur = conn.execute(
                """
                INSERT INTO g3_zones (
                    mission_id, name, type, description, location, status, risk_level,
                    responsible, observations, plan_id, plan_object_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mission_id,
                    str(data.get("name") or ""),
                    str(data.get("type") or ""),
                    str(data.get("description") or ""),
                    str(data.get("location") or ""),
                    str(data.get("status") or ""),
                    str(data.get("risk_level") or "Faible"),
                    str(data.get("responsible") or ""),
                    str(data.get("observations") or ""),
                    str(data.get("plan_id") or ""),
                    str(data.get("plan_object_id") or ""),
                    now,
                    now,
                ),
            )
            zone_id = int(cur.lastrowid)
            self._append_history(conn, mission_id, user_name=user_name, action="Ajout zone G3",
                                 entity_type="g3_zone", entity_id=zone_id)
            conn.commit()
        return self._get_zone(zone_id)

    def update_zone(self, zone_id: int, data: dict[str, Any], *, user_name: str = "") -> G3ZoneSchema | None:
        allowed = {"name", "type", "description", "location", "status", "risk_level",
                   "responsible", "observations", "plan_id", "plan_object_id"}
        updates = {k: v for k, v in data.items() if k in allowed and v is not None}
        if not updates:
            return self._get_zone(zone_id)
        updates["updated_at"] = datetime.utcnow().isoformat(timespec="seconds")
        cols = ", ".join(f"{k} = ?" for k in updates)
        with self._connect() as conn:
            row = conn.execute("SELECT mission_id FROM g3_zones WHERE id = ?", (zone_id,)).fetchone()
            if not row:
                return None
            conn.execute(f"UPDATE g3_zones SET {cols} WHERE id = ?", list(updates.values()) + [zone_id])
            self._append_history(conn, int(row["mission_id"]), user_name=user_name,
                                 action="Modification zone G3", entity_type="g3_zone", entity_id=zone_id)
            conn.commit()
        return self._get_zone(zone_id)

    def delete_zone(self, zone_id: int, *, user_name: str = "") -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT mission_id FROM g3_zones WHERE id = ?", (zone_id,)).fetchone()
            if not row:
                return False
            conn.execute("DELETE FROM g3_zones WHERE id = ?", (zone_id,))
            self._append_history(conn, int(row["mission_id"]), user_name=user_name,
                                 action="Suppression zone G3", entity_type="g3_zone", entity_id=zone_id)
            conn.commit()
        return True

    def create_document(self, mission_id: int, data: dict[str, Any], *, user_name: str = "") -> G3DocumentSchema:
        now = datetime.utcnow().isoformat(timespec="seconds")
        with self._connect() as conn:
            self._ensure_mission(conn, mission_id)
            cur = conn.execute(
                """
                INSERT INTO g3_documents (
                    mission_id, zone_id, type, name, reference, version, document_date, author,
                    received, analyzed, used_in_report, observations, file_url, stored_path,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mission_id,
                    data.get("zone_id"),
                    str(data.get("type") or ""),
                    str(data.get("name") or ""),
                    str(data.get("reference") or ""),
                    str(data.get("version") or ""),
                    data.get("document_date"),
                    str(data.get("author") or ""),
                    1 if data.get("received") else 0,
                    1 if data.get("analyzed") else 0,
                    1 if data.get("used_in_report") else 0,
                    str(data.get("observations") or ""),
                    str(data.get("file_url") or ""),
                    str(data.get("stored_path") or ""),
                    now,
                    now,
                ),
            )
            doc_id = int(cur.lastrowid)
            self._append_history(conn, mission_id, user_name=user_name, action="Ajout document G3",
                                 entity_type="g3_document", entity_id=doc_id)
            conn.commit()
        return self._get_document(doc_id)

    def update_document(self, doc_id: int, data: dict[str, Any], *, user_name: str = "") -> G3DocumentSchema | None:
        bool_fields = {"received", "analyzed", "used_in_report"}
        allowed = {"zone_id", "type", "name", "reference", "version", "document_date", "author",
                   "observations", "file_url", "stored_path"} | bool_fields
        updates: dict[str, Any] = {}
        for key, value in data.items():
            if key not in allowed or value is None:
                continue
            if key in bool_fields:
                updates[key] = 1 if value else 0
            else:
                updates[key] = value
        if not updates:
            return self._get_document(doc_id)
        updates["updated_at"] = datetime.utcnow().isoformat(timespec="seconds")
        cols = ", ".join(f"{k} = ?" for k in updates)
        with self._connect() as conn:
            row = conn.execute("SELECT mission_id FROM g3_documents WHERE id = ?", (doc_id,)).fetchone()
            if not row:
                return None
            conn.execute(f"UPDATE g3_documents SET {cols} WHERE id = ?", list(updates.values()) + [doc_id])
            self._append_history(conn, int(row["mission_id"]), user_name=user_name,
                                 action="Modification document G3", entity_type="g3_document", entity_id=doc_id)
            conn.commit()
        return self._get_document(doc_id)

    def delete_document(self, doc_id: int, *, user_name: str = "") -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT mission_id FROM g3_documents WHERE id = ?", (doc_id,)).fetchone()
            if not row:
                return False
            conn.execute("DELETE FROM g3_documents WHERE id = ?", (doc_id,))
            self._append_history(conn, int(row["mission_id"]), user_name=user_name,
                                 action="Suppression document G3", entity_type="g3_document", entity_id=doc_id)
            conn.commit()
        return True

    def replace_documents_for_mission(
        self,
        mission_id: int,
        items: list[dict[str, Any]],
        *,
        user_name: str = "",
    ) -> list[G3DocumentSchema]:
        now = datetime.utcnow().isoformat(timespec="seconds")
        with self._connect() as conn:
            self._ensure_mission(conn, mission_id)
            conn.execute("DELETE FROM g3_documents WHERE mission_id = ?", (mission_id,))
            for item in items:
                conn.execute(
                    """
                    INSERT INTO g3_documents (
                        mission_id, zone_id, type, name, reference, version, document_date, author,
                        received, analyzed, used_in_report, observations, file_url, stored_path,
                        uploaded_at, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        mission_id,
                        item.get("zone_id"),
                        str(item.get("type") or ""),
                        str(item.get("name") or ""),
                        str(item.get("reference") or ""),
                        str(item.get("version") or ""),
                        item.get("document_date"),
                        str(item.get("author") or ""),
                        1 if item.get("received") else 0,
                        1 if item.get("analyzed") else 0,
                        1 if item.get("used_in_report") else 0,
                        str(item.get("observations") or ""),
                        str(item.get("file_url") or ""),
                        str(item.get("stored_path") or ""),
                        item.get("uploaded_at"),
                        now,
                        now,
                    ),
                )
            self._append_history(
                conn,
                mission_id,
                user_name=user_name,
                action="Mise à jour documents G3",
                entity_type="g3_documents",
                entity_id=mission_id,
                comment=f"{len(items)} document(s)",
            )
            conn.commit()
            return self._list_documents(conn, mission_id)

    def create_objective(self, mission_id: int, data: dict[str, Any], *, user_name: str = "") -> G3ObjectiveSchema:
        now = datetime.utcnow().isoformat(timespec="seconds")
        with self._connect() as conn:
            self._ensure_mission(conn, mission_id)
            cur = conn.execute(
                """
                INSERT INTO g3_objectives (
                    mission_id, zone_id, label, description, priority, status, responsible,
                    expected_result, comments, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mission_id,
                    data.get("zone_id"),
                    str(data.get("label") or ""),
                    str(data.get("description") or ""),
                    str(data.get("priority") or "Moyenne"),
                    str(data.get("status") or "À faire"),
                    str(data.get("responsible") or ""),
                    str(data.get("expected_result") or ""),
                    str(data.get("comments") or ""),
                    now,
                    now,
                ),
            )
            obj_id = int(cur.lastrowid)
            self._append_history(conn, mission_id, user_name=user_name, action="Ajout objectif G3",
                                 entity_type="g3_objective", entity_id=obj_id)
            conn.commit()
        return self._get_objective(obj_id)

    def create_default_objectives(self, mission_id: int, *, user_name: str = "") -> list[G3ObjectiveSchema]:
        with self._connect() as conn:
            self._ensure_mission(conn, mission_id)
            existing = conn.execute(
                "SELECT COUNT(*) AS c FROM g3_objectives WHERE mission_id = ?",
                (mission_id,),
            ).fetchone()
            if int(existing["c"] or 0) > 0:
                raise ValueError("Des objectifs existent déjà pour cette mission")
            created: list[G3ObjectiveSchema] = []
            now = datetime.utcnow().isoformat(timespec="seconds")
            for label in G3_DEFAULT_OBJECTIVE_TEMPLATES:
                cur = conn.execute(
                    """
                    INSERT INTO g3_objectives (mission_id, label, status, priority, created_at, updated_at)
                    VALUES (?, ?, 'À faire', 'Moyenne', ?, ?)
                    """,
                    (mission_id, label, now, now),
                )
                created.append(G3ObjectiveSchema(
                    id=int(cur.lastrowid),
                    mission_id=mission_id,
                    label=label,
                    status="À faire",
                    priority="Moyenne",
                ))
            self._append_history(conn, mission_id, user_name=user_name,
                                 action="Création objectifs par défaut G3",
                                 entity_type="g3_objectives", entity_id=mission_id)
            conn.commit()
        return created

    def update_objective(self, obj_id: int, data: dict[str, Any], *, user_name: str = "") -> G3ObjectiveSchema | None:
        allowed = {"zone_id", "label", "description", "priority", "status", "responsible",
                   "expected_result", "comments"}
        updates = {k: v for k, v in data.items() if k in allowed and v is not None}
        if not updates:
            return self._get_objective(obj_id)
        updates["updated_at"] = datetime.utcnow().isoformat(timespec="seconds")
        cols = ", ".join(f"{k} = ?" for k in updates)
        with self._connect() as conn:
            row = conn.execute("SELECT mission_id FROM g3_objectives WHERE id = ?", (obj_id,)).fetchone()
            if not row:
                return None
            conn.execute(f"UPDATE g3_objectives SET {cols} WHERE id = ?", list(updates.values()) + [obj_id])
            self._append_history(conn, int(row["mission_id"]), user_name=user_name,
                                 action="Modification objectif G3", entity_type="g3_objective", entity_id=obj_id)
            conn.commit()
        return self._get_objective(obj_id)

    def delete_objective(self, obj_id: int, *, user_name: str = "") -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT mission_id FROM g3_objectives WHERE id = ?", (obj_id,)).fetchone()
            if not row:
                return False
            conn.execute("DELETE FROM g3_objectives WHERE id = ?", (obj_id,))
            self._append_history(conn, int(row["mission_id"]), user_name=user_name,
                                 action="Suppression objectif G3", entity_type="g3_objective", entity_id=obj_id)
            conn.commit()
        return True

    def _get_zone(self, zone_id: int) -> G3ZoneSchema | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM g3_zones WHERE id = ?", (zone_id,)).fetchone()
            return self._zone_row(row) if row else None

    def _get_document(self, doc_id: int) -> G3DocumentSchema | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT d.*, z.name AS zone_name
                FROM g3_documents d
                LEFT JOIN g3_zones z ON z.id = d.zone_id
                WHERE d.id = ?
                """,
                (doc_id,),
            ).fetchone()
            return self._document_row(row) if row else None

    def _get_objective(self, obj_id: int) -> G3ObjectiveSchema | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT o.*, z.name AS zone_name
                FROM g3_objectives o
                LEFT JOIN g3_zones z ON z.id = o.zone_id
                WHERE o.id = ?
                """,
                (obj_id,),
            ).fetchone()
            return self._objective_row(row) if row else None

    def _next_reference(
        self,
        *,
        conn=None,
        affaire_ref: str = "",
        demande_id: int | None = None,
        demande_numero: int = 0,
    ) -> str:
        if demande_id is None:
            raise ValueError("demande_id requis pour générer une référence G3")

        def _query(connection):
            return next_g3_mission_reference(
                connection,
                demande_id=int(demande_id),
                affaire_ref=affaire_ref,
                demande_numero=demande_numero,
            )

        if conn is not None:
            return _query(conn)
        with self._connect() as connection:
            return _query(connection)

    def _next_intervention_number(self, conn, mission_id: int) -> str:
        row = conn.execute(
            "SELECT MAX(CAST(number AS INTEGER)) AS max_num FROM g3_interventions WHERE mission_id = ?",
            (mission_id,),
        ).fetchone()
        next_num = int(row["max_num"] or 0) + 1
        return f"{next_num:02d}"

    def _list_zones(self, conn, mission_id: int) -> list[G3ZoneSchema]:
        rows = conn.execute(
            "SELECT * FROM g3_zones WHERE mission_id = ? ORDER BY name, id",
            (mission_id,),
        ).fetchall()
        return [self._zone_row(r) for r in rows]

    def _list_documents(self, conn, mission_id: int) -> list[G3DocumentSchema]:
        rows = conn.execute(
            """
            SELECT d.*, z.name AS zone_name
            FROM g3_documents d
            LEFT JOIN g3_zones z ON z.id = d.zone_id
            WHERE d.mission_id = ?
            ORDER BY d.type, d.name, d.id
            """,
            (mission_id,),
        ).fetchall()
        return [self._document_row(r) for r in rows]

    def _list_objectives(self, conn, mission_id: int) -> list[G3ObjectiveSchema]:
        rows = conn.execute(
            """
            SELECT o.*, z.name AS zone_name
            FROM g3_objectives o
            LEFT JOIN g3_zones z ON z.id = o.zone_id
            WHERE o.mission_id = ?
            ORDER BY o.priority DESC, o.label, o.id
            """,
            (mission_id,),
        ).fetchall()
        return [self._objective_row(r) for r in rows]

    def _list_interventions(self, conn, mission_id: int, *, phase: str) -> list[G3InterventionSchema]:
        rows = conn.execute(
            """
            SELECT i.*, z.name AS zone_name
            FROM g3_interventions i
            LEFT JOIN g3_zones z ON z.id = i.zone_id
            WHERE i.mission_id = ? AND i.phase = ?
            ORDER BY CAST(i.number AS INTEGER), i.id
            """,
            (mission_id, phase),
        ).fetchall()
        return [self._intervention_row(r) for r in rows]

    def _get_intervention(self, intervention_id: int) -> G3InterventionSchema | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT i.*, z.name AS zone_name
                FROM g3_interventions i
                LEFT JOIN g3_zones z ON z.id = i.zone_id
                WHERE i.id = ?
                """,
                (intervention_id,),
            ).fetchone()
            return self._intervention_row(row) if row else None

    def _list_history(self, conn, mission_id: int) -> list[G3HistorySchema]:
        rows = conn.execute(
            "SELECT * FROM g3_history WHERE mission_id = ? ORDER BY created_at DESC, id DESC LIMIT 100",
            (mission_id,),
        ).fetchall()
        return [G3HistorySchema(
            id=int(r["id"]),
            mission_id=int(r["mission_id"]),
            user_name=str(r["user_name"] or ""),
            action=str(r["action"] or ""),
            entity_type=str(r["entity_type"] or ""),
            entity_id=int(r["entity_id"]) if r["entity_id"] is not None else None,
            comment=str(r["comment"] or ""),
            created_at=str(r["created_at"] or ""),
        ) for r in rows]

    def _append_history(
        self,
        conn,
        mission_id: int,
        *,
        user_name: str,
        action: str,
        entity_type: str,
        entity_id: int | None = None,
        comment: str = "",
    ) -> None:
        conn.execute(
            """
            INSERT INTO g3_history (mission_id, user_name, action, entity_type, entity_id, comment)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (mission_id, user_name or "Système", action, entity_type, entity_id, comment),
        )

    @staticmethod
    def _zone_row(row) -> G3ZoneSchema:
        return G3ZoneSchema(
            id=int(row["id"]),
            mission_id=int(row["mission_id"]),
            name=str(row["name"] or ""),
            type=str(row["type"] or ""),
            description=str(row["description"] or ""),
            location=str(row["location"] or ""),
            status=str(row["status"] or ""),
            risk_level=str(row["risk_level"] or "Faible"),
            responsible=str(row["responsible"] or ""),
            observations=str(row["observations"] or ""),
            plan_id=str(row["plan_id"] or ""),
            plan_object_id=str(row["plan_object_id"] or ""),
        )

    @staticmethod
    def _document_row(row) -> G3DocumentSchema:
        return G3DocumentSchema(
            id=int(row["id"]),
            mission_id=int(row["mission_id"]),
            zone_id=int(row["zone_id"]) if row["zone_id"] is not None else None,
            type=str(row["type"] or ""),
            name=str(row["name"] or ""),
            reference=str(row["reference"] or ""),
            version=str(row["version"] or ""),
            document_date=row["document_date"],
            author=str(row["author"] or ""),
            received=bool(row["received"]),
            analyzed=bool(row["analyzed"]),
            used_in_report=bool(row["used_in_report"]),
            observations=str(row["observations"] or ""),
            file_url=str(row["file_url"] or ""),
            stored_path=str(row["stored_path"] or ""),
            uploaded_at=row["uploaded_at"] if "uploaded_at" in row.keys() else None,
            zone_name=str(row["zone_name"] or "") if "zone_name" in row.keys() else "",
        )

    @staticmethod
    def _objective_row(row) -> G3ObjectiveSchema:
        return G3ObjectiveSchema(
            id=int(row["id"]),
            mission_id=int(row["mission_id"]),
            zone_id=int(row["zone_id"]) if row["zone_id"] is not None else None,
            label=str(row["label"] or ""),
            description=str(row["description"] or ""),
            priority=str(row["priority"] or "Moyenne"),
            status=str(row["status"] or "À faire"),
            responsible=str(row["responsible"] or ""),
            expected_result=str(row["expected_result"] or ""),
            comments=str(row["comments"] or ""),
            zone_name=str(row["zone_name"] or "") if "zone_name" in row.keys() else "",
        )

    @staticmethod
    def _intervention_row(row) -> G3InterventionSchema:
        return G3InterventionSchema(
            id=int(row["id"]),
            mission_id=int(row["mission_id"]),
            zone_id=int(row["zone_id"]) if row["zone_id"] is not None else None,
            plan_object_id=str(row["plan_object_id"] or ""),
            number=str(row["number"] or ""),
            type=str(row["type"] or ""),
            phase=str(row["phase"] or ""),
            date=row["date"],
            start_time=str(row["start_time"] or ""),
            end_time=str(row["end_time"] or ""),
            responsible=str(row["responsible"] or ""),
            participants=str(row["participants"] or ""),
            objective=str(row["objective"] or ""),
            means=str(row["means"] or ""),
            prerequisites=str(row["prerequisites"] or ""),
            expected_deliverable=str(row["expected_deliverable"] or ""),
            description=str(row["description"] or ""),
            findings=str(row["findings"] or ""),
            decision=str(row["decision"] or ""),
            next_actions=str(row["next_actions"] or ""),
            comments=str(row["comments"] or ""),
            status=str(row["status"] or ""),
            weather=str(row["weather"] or ""),
            hydric_condition=str(row["hydric_condition"] or ""),
            payload=G3Repository._json_dict(row["payload_json"]),
            linked_intervention_id=int(row["linked_intervention_id"]) if row["linked_intervention_id"] else None,
            realized_from_id=int(row["realized_from_id"]) if row["realized_from_id"] else None,
            zone_name=str(row["zone_name"] or "") if "zone_name" in row.keys() else "",
        )

    @staticmethod
    def _mission_response(
        row, zones, documents, objectives, planned, realized, tests, photos,
        notices, hold_points, deliverables, history,
    ) -> G3MissionResponseSchema:
        return G3MissionResponseSchema(
            id=int(row["id"]),
            reference=str(row["reference"] or ""),
            affaire_rst_id=int(row["affaire_rst_id"]),
            demande_id=int(row["demande_id"]),
            affaire_ref=str(row["affaire_ref"] or ""),
            demande_ref=str(row["demande_ref"] or ""),
            title=str(row["title"] or ""),
            client=str(row["client"] or ""),
            chantier=str(row["chantier"] or ""),
            location=str(row["location"] or ""),
            status=str(row["status"] or ""),
            mission_types=G3Repository._json_list(row["mission_types_json"]),
            description=str(row["description"] or ""),
            main_objective=str(row["main_objective"] or ""),
            conducteur=str(row["conducteur"] or ""),
            chef_chantier=str(row["chef_chantier"] or ""),
            rst_responsible=str(row["rst_responsible"] or ""),
            laboratoire=str(row["laboratoire"] or ""),
            lab_intervenant=str(row["lab_intervenant"] or ""),
            geotechnicien_externe=str(row["geotechnicien_externe"] or ""),
            moa=str(row["moa"] or ""),
            moe=str(row["moe"] or ""),
            bureau_controle=str(row["bureau_controle"] or ""),
            start_date=row["start_date"],
            end_date=row["end_date"],
            created_at=str(row["created_at"] or ""),
            updated_at=str(row["updated_at"] or ""),
            zones=zones,
            documents=documents,
            objectives=objectives,
            planned_interventions=planned,
            realized_interventions=realized,
            tests=tests,
            photos=photos,
            notices=notices,
            hold_points=hold_points,
            deliverables=deliverables,
            history=history,
        )

    @staticmethod
    def _deliverable_row(row) -> G3DeliverableSchema:
        return G3DeliverableSchema(
            id=int(row["id"]),
            mission_id=int(row["mission_id"]),
            type=str(row["type"] or ""),
            title=str(row["title"] or ""),
            version=str(row["version"] or "1"),
            status=str(row["status"] or "À produire"),
            due_date=row["due_date"],
            generated_at=row["generated_at"],
            stored_path=str(row["stored_path"] or ""),
            observations=str(row["observations"] or ""),
            payload=G3Repository._json_dict(row["payload_json"]),
        )

    def _list_deliverables(self, conn, mission_id: int) -> list[G3DeliverableSchema]:
        rows = conn.execute(
            """
            SELECT * FROM g3_deliverables
            WHERE mission_id = ?
            ORDER BY type ASC, id ASC
            """,
            (mission_id,),
        ).fetchall()
        return [self._deliverable_row(r) for r in rows]

    def get_deliverable(self, deliverable_id: int) -> G3DeliverableSchema | None:
        return self._get_deliverable(deliverable_id)

    def _get_deliverable(self, deliverable_id: int) -> G3DeliverableSchema | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM g3_deliverables WHERE id = ?",
                (deliverable_id,),
            ).fetchone()
            return self._deliverable_row(row) if row else None

    @staticmethod
    def _notice_row(row) -> G3NoticeSchema:
        return G3NoticeSchema(
            id=int(row["id"]),
            mission_id=int(row["mission_id"]),
            zone_id=int(row["zone_id"]) if row["zone_id"] is not None else None,
            intervention_id=int(row["intervention_id"]) if row["intervention_id"] is not None else None,
            type=str(row["type"] or ""),
            reference=str(row["reference"] or ""),
            title=str(row["title"] or ""),
            status=str(row["status"] or "Brouillon"),
            notice_date=row["notice_date"],
            formulation=str(row["formulation"] or ""),
            content=str(row["content"] or ""),
            conditions=str(row["conditions"] or ""),
            recommendations=str(row["recommendations"] or ""),
            transmitted_at=row["transmitted_at"],
            payload=G3Repository._json_dict(row["payload_json"]),
            zone_name=str(row["zone_name"] or "") if "zone_name" in row.keys() else "",
            intervention_number=str(row["intervention_number"] or "") if "intervention_number" in row.keys() else "",
        )

    @staticmethod
    def _hold_point_row(row) -> G3HoldPointSchema:
        return G3HoldPointSchema(
            id=int(row["id"]),
            mission_id=int(row["mission_id"]),
            zone_id=int(row["zone_id"]) if row["zone_id"] is not None else None,
            notice_id=int(row["notice_id"]) if row["notice_id"] is not None else None,
            code=str(row["code"] or ""),
            label=str(row["label"] or ""),
            description=str(row["description"] or ""),
            status=str(row["status"] or "À venir"),
            due_date=row["due_date"],
            validated_at=row["validated_at"],
            observations=str(row["observations"] or ""),
            requires_tests=bool(row["requires_tests"]),
            requires_notice=bool(row["requires_notice"]),
            zone_name=str(row["zone_name"] or "") if "zone_name" in row.keys() else "",
            notice_reference=str(row["notice_reference"] or "") if "notice_reference" in row.keys() else "",
        )

    def _list_notices(self, conn, mission_id: int) -> list[G3NoticeSchema]:
        rows = conn.execute(
            """
            SELECT n.*, z.name AS zone_name, i.number AS intervention_number
            FROM g3_notices n
            LEFT JOIN g3_zones z ON z.id = n.zone_id
            LEFT JOIN g3_interventions i ON i.id = n.intervention_id
            WHERE n.mission_id = ?
            ORDER BY n.notice_date DESC, n.id DESC
            """,
            (mission_id,),
        ).fetchall()
        return [self._notice_row(r) for r in rows]

    def _list_hold_points(self, conn, mission_id: int) -> list[G3HoldPointSchema]:
        rows = conn.execute(
            """
            SELECT h.*, z.name AS zone_name, n.reference AS notice_reference
            FROM g3_hold_points h
            LEFT JOIN g3_zones z ON z.id = h.zone_id
            LEFT JOIN g3_notices n ON n.id = h.notice_id
            WHERE h.mission_id = ?
            ORDER BY h.code ASC, h.id ASC
            """,
            (mission_id,),
        ).fetchall()
        return [self._hold_point_row(r) for r in rows]

    def _get_notice(self, notice_id: int) -> G3NoticeSchema | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT n.*, z.name AS zone_name, i.number AS intervention_number
                FROM g3_notices n
                LEFT JOIN g3_zones z ON z.id = n.zone_id
                LEFT JOIN g3_interventions i ON i.id = n.intervention_id
                WHERE n.id = ?
                """,
                (notice_id,),
            ).fetchone()
            return self._notice_row(row) if row else None

    def _get_hold_point(self, hold_id: int) -> G3HoldPointSchema | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT h.*, z.name AS zone_name, n.reference AS notice_reference
                FROM g3_hold_points h
                LEFT JOIN g3_zones z ON z.id = h.zone_id
                LEFT JOIN g3_notices n ON n.id = h.notice_id
                WHERE h.id = ?
                """,
                (hold_id,),
            ).fetchone()
            return self._hold_point_row(row) if row else None

    @staticmethod
    def _test_row(row) -> G3TestSchema:
        return G3TestSchema(
            id=int(row["id"]),
            mission_id=int(row["mission_id"]),
            zone_id=int(row["zone_id"]) if row["zone_id"] is not None else None,
            intervention_id=int(row["intervention_id"]) if row["intervention_id"] is not None else None,
            type=str(row["type"] or ""),
            label=str(row["label"] or ""),
            reference=str(row["reference"] or ""),
            test_date=row["test_date"],
            status=str(row["status"] or "En attente"),
            result=str(row["result"] or ""),
            conformity=str(row["conformity"] or "En attente"),
            observations=str(row["observations"] or ""),
            payload=G3Repository._json_dict(row["payload_json"]),
            zone_name=str(row["zone_name"] or "") if "zone_name" in row.keys() else "",
            intervention_number=str(row["intervention_number"] or "") if "intervention_number" in row.keys() else "",
        )

    @staticmethod
    def _photo_row(row) -> G3PhotoSchema:
        return G3PhotoSchema(
            id=int(row["id"]),
            mission_id=int(row["mission_id"]),
            zone_id=int(row["zone_id"]) if row["zone_id"] is not None else None,
            intervention_id=int(row["intervention_id"]) if row["intervention_id"] is not None else None,
            caption=str(row["caption"] or ""),
            stored_path=str(row["stored_path"] or ""),
            use_in_report=bool(row["use_in_report"]),
            sort_order=int(row["sort_order"] or 0),
            taken_at=row["taken_at"],
            uploaded_at=row["uploaded_at"],
            zone_name=str(row["zone_name"] or "") if "zone_name" in row.keys() else "",
            intervention_number=str(row["intervention_number"] or "") if "intervention_number" in row.keys() else "",
        )

    def _list_tests(self, conn, mission_id: int) -> list[G3TestSchema]:
        rows = conn.execute(
            """
            SELECT t.*, z.name AS zone_name, i.number AS intervention_number
            FROM g3_tests t
            LEFT JOIN g3_zones z ON z.id = t.zone_id
            LEFT JOIN g3_interventions i ON i.id = t.intervention_id
            WHERE t.mission_id = ?
            ORDER BY t.test_date DESC, t.id DESC
            """,
            (mission_id,),
        ).fetchall()
        return [self._test_row(r) for r in rows]

    def _list_photos(self, conn, mission_id: int) -> list[G3PhotoSchema]:
        rows = conn.execute(
            """
            SELECT p.*, z.name AS zone_name, i.number AS intervention_number
            FROM g3_photos p
            LEFT JOIN g3_zones z ON z.id = p.zone_id
            LEFT JOIN g3_interventions i ON i.id = p.intervention_id
            WHERE p.mission_id = ?
            ORDER BY p.sort_order ASC, p.id ASC
            """,
            (mission_id,),
        ).fetchall()
        return [self._photo_row(r) for r in rows]

    def _get_test(self, test_id: int) -> G3TestSchema | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT t.*, z.name AS zone_name, i.number AS intervention_number
                FROM g3_tests t
                LEFT JOIN g3_zones z ON z.id = t.zone_id
                LEFT JOIN g3_interventions i ON i.id = t.intervention_id
                WHERE t.id = ?
                """,
                (test_id,),
            ).fetchone()
            return self._test_row(row) if row else None

    def _get_photo(self, photo_id: int) -> G3PhotoSchema | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT p.*, z.name AS zone_name, i.number AS intervention_number
                FROM g3_photos p
                LEFT JOIN g3_zones z ON z.id = p.zone_id
                LEFT JOIN g3_interventions i ON i.id = p.intervention_id
                WHERE p.id = ?
                """,
                (photo_id,),
            ).fetchone()
            return self._photo_row(row) if row else None

    @staticmethod
    def _list_item(row) -> G3MissionListItemSchema:
        return G3MissionListItemSchema(
            id=int(row["id"]),
            reference=str(row["reference"] or ""),
            affaire_ref=str(row["affaire_ref"] or ""),
            demande_ref=str(row["demande_ref"] or ""),
            title=str(row["title"] or ""),
            client=str(row["client"] or ""),
            chantier=str(row["chantier"] or ""),
            status=str(row["status"] or ""),
            start_date=row["start_date"],
            end_date=row["end_date"],
            nb_planned=int(row["nb_planned"] or 0),
            nb_realized=int(row["nb_realized"] or 0),
            updated_at=str(row["updated_at"] or ""),
        )
