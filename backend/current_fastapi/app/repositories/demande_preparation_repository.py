"""
app/repositories/demande_preparation_repository.py
Repository for demande preparation and enabled modules.
"""
from __future__ import annotations

from datetime import datetime

from app.core.database import connect_db, ensure_ralab4_schema, get_db_path
from app.models.demande_preparation import (
	DEMANDE_MODULE_CATALOG,
	PREPARATION_PHASE_OPTIONS,
	DemandeConfigurationResponseSchema,
	DemandeEnabledModuleRecord,
	DemandeEnabledModuleResponseSchema,
	DemandePreparationRecord,
	DemandePreparationResponseSchema,
)


class DemandePreparationRepository:
	def __init__(self, db_path=None):
		self.db_path = db_path or get_db_path()

	def _connect(self):
		ensure_ralab4_schema(self.db_path)
		return connect_db(self.db_path)

	def _now(self) -> str:
		return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

	def module_catalog(self) -> list[dict]:
		return [dict(item) for item in DEMANDE_MODULE_CATALOG]

	def _module_meta(self, module_code: str) -> dict:
		for item in DEMANDE_MODULE_CATALOG:
			if item["module_code"] == module_code:
				return item
		return {"module_code": module_code, "label": module_code, "group": "Autre"}

	def demande_exists(self, demande_id: int) -> bool:
		with self._connect() as conn:
			row = conn.execute("SELECT id FROM demandes WHERE id = ?", (demande_id,)).fetchone()
		return row is not None

	def _ensure_preparation_row(self, conn, demande_id: int) -> None:
		now = self._now()
		conn.execute(
			"""
			INSERT OR IGNORE INTO demande_preparations (
				demande_id, phase_operation, contexte_operationnel, objectifs, points_vigilance,
				contraintes_acces, contraintes_delais, contraintes_hse, attentes_client,
				programme_previsionnel, ressources_notes, commentaires, created_at, updated_at
			) VALUES (?, 'À qualifier', '', '', '', '', '', '', '', '', '', '', ?, ?)
			""",
			(demande_id, now, now),
		)

	def _ensure_module_rows(self, conn, demande_id: int) -> None:
		now = self._now()
		for item in DEMANDE_MODULE_CATALOG:
			conn.execute(
				"""
				INSERT OR IGNORE INTO demande_enabled_modules (
					demande_id, module_code, is_enabled, created_at, updated_at
				) VALUES (?, ?, 0, ?, ?)
				""",
				(demande_id, item["module_code"], now, now),
			)

	def get_preparation(self, demande_id: int) -> DemandePreparationRecord:
		with self._connect() as conn:
			self._ensure_preparation_row(conn, demande_id)
			conn.commit()
			row = conn.execute("SELECT * FROM demande_preparations WHERE demande_id = ?", (demande_id,)).fetchone()
		return self._prep_row(row)

	def update_preparation(self, demande_id: int, fields: dict) -> DemandePreparationRecord:
		allowed = {
			"phase_operation",
			"contexte_operationnel",
			"objectifs",
			"points_vigilance",
			"contraintes_acces",
			"contraintes_delais",
			"contraintes_hse",
			"attentes_client",
			"programme_previsionnel",
			"ressources_notes",
			"commentaires",
		}
		payload = {k: v for k, v in fields.items() if k in allowed and v is not None}
		with self._connect() as conn:
			self._ensure_preparation_row(conn, demande_id)
			if payload:
				payload["updated_at"] = self._now()
				clause = ", ".join(f"{key} = ?" for key in payload)
				conn.execute(
					f"UPDATE demande_preparations SET {clause} WHERE demande_id = ?",
					list(payload.values()) + [demande_id],
				)
			conn.commit()
			row = conn.execute("SELECT * FROM demande_preparations WHERE demande_id = ?", (demande_id,)).fetchone()
		return self._prep_row(row)

	def list_modules(self, demande_id: int) -> list[DemandeEnabledModuleRecord]:
		with self._connect() as conn:
			self._ensure_module_rows(conn, demande_id)
			conn.commit()
			rows = conn.execute(
				"SELECT * FROM demande_enabled_modules WHERE demande_id = ? ORDER BY module_code",
				(demande_id,),
			).fetchall()
		return [self._module_row(row) for row in rows]

	def update_modules(self, demande_id: int, modules: list[dict]) -> list[DemandeEnabledModuleRecord]:
		updates = {item["module_code"]: bool(item.get("is_enabled")) for item in modules if item.get("module_code")}
		with self._connect() as conn:
			self._ensure_module_rows(conn, demande_id)
			now = self._now()
			for module_code, enabled in updates.items():
				conn.execute(
					"UPDATE demande_enabled_modules SET is_enabled = ?, updated_at = ? WHERE demande_id = ? AND module_code = ?",
					(1 if enabled else 0, now, demande_id, module_code),
				)
			conn.commit()
			rows = conn.execute(
				"SELECT * FROM demande_enabled_modules WHERE demande_id = ? ORDER BY module_code",
				(demande_id,),
			).fetchall()
		return [self._module_row(row) for row in rows]

	def get_configuration(self, demande_id: int) -> DemandeConfigurationResponseSchema:
		prep = self.to_prep_response(self.get_preparation(demande_id))
		modules = [self.to_module_response(item) for item in self.list_modules(demande_id)]
		return DemandeConfigurationResponseSchema(preparation=prep, modules=modules)

	def to_prep_response(self, record: DemandePreparationRecord) -> DemandePreparationResponseSchema:
		return DemandePreparationResponseSchema(
			uid=record.uid,
			demande_id=record.demande_id,
			phase_operation=record.phase_operation,
			contexte_operationnel=record.contexte_operationnel,
			objectifs=record.objectifs,
			points_vigilance=record.points_vigilance,
			contraintes_acces=record.contraintes_acces,
			contraintes_delais=record.contraintes_delais,
			contraintes_hse=record.contraintes_hse,
			attentes_client=record.attentes_client,
			programme_previsionnel=record.programme_previsionnel,
			ressources_notes=record.ressources_notes,
			commentaires=record.commentaires,
			created_at=record.created_at,
			updated_at=record.updated_at,
		)

	def to_module_response(self, record: DemandeEnabledModuleRecord) -> DemandeEnabledModuleResponseSchema:
		return DemandeEnabledModuleResponseSchema(
			uid=record.uid,
			demande_id=record.demande_id,
			module_code=record.module_code,
			label=record.label,
			group=record.group,
			is_enabled=record.is_enabled,
			created_at=record.created_at,
			updated_at=record.updated_at,
		)

	def _prep_row(self, row) -> DemandePreparationRecord:
		return DemandePreparationRecord(
			uid=int(row["id"]),
			demande_id=int(row["demande_id"]),
			phase_operation=row["phase_operation"] or PREPARATION_PHASE_OPTIONS[0],
			contexte_operationnel=row["contexte_operationnel"] or "",
			objectifs=row["objectifs"] or "",
			points_vigilance=row["points_vigilance"] or "",
			contraintes_acces=row["contraintes_acces"] or "",
			contraintes_delais=row["contraintes_delais"] or "",
			contraintes_hse=row["contraintes_hse"] or "",
			attentes_client=row["attentes_client"] or "",
			programme_previsionnel=row["programme_previsionnel"] or "",
			ressources_notes=row["ressources_notes"] or "",
			commentaires=row["commentaires"] or "",
			created_at=row["created_at"] or "",
			updated_at=row["updated_at"] or "",
		)

	def _module_row(self, row) -> DemandeEnabledModuleRecord:
		meta = self._module_meta(row["module_code"])
		return DemandeEnabledModuleRecord(
			uid=int(row["id"]),
			demande_id=int(row["demande_id"]),
			module_code=row["module_code"],
			is_enabled=bool(row["is_enabled"]),
			label=meta["label"],
			group=meta["group"],
			created_at=row["created_at"] or "",
			updated_at=row["updated_at"] or "",
		)
