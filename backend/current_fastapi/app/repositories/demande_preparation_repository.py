"""
app/repositories/demande_preparation_repository.py
Repository preparation demande.
"""
from __future__ import annotations

import json
from datetime import datetime

from app.core.database import connect_db, ensure_ralab4_schema, get_db_path
from app.models.demande_preparation import (
    DEMANDE_FAMILY_CATALOG,
    DEMANDE_MODULE_CATALOG,
    PREPARATION_PHASE_OPTIONS,
    DemandeConfigurationResponseSchema,
    DemandeEnabledModuleRecord,
    DemandeEnabledModuleResponseSchema,
    DemandePreparationRecord,
    DemandePreparationResponseSchema,
)

_PREP_FIELDS = [
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
    "type_intervention_prevu",
    "finalite",
    "zone_localisation",
    "materiau_objet",
    "objectif_mission",
    "responsable_referent",
    "attribue_a",
    "priorite",
    "date_prevue",
    "nb_points_prevus",
    "types_essais_prevus",
    "criteres_conformite",
    "livrables_attendus",
    "remarques",
    "familles_prevues",
]


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

    def family_catalog(self) -> list[dict]:
        return [
            {
                **item,
                "module_codes": list(item.get("module_codes", [])),
            }
            for item in DEMANDE_FAMILY_CATALOG
        ]

    def _module_meta(self, module_code: str) -> dict:
        for item in DEMANDE_MODULE_CATALOG:
            if item["module_code"] == module_code:
                return item
        return {"module_code": module_code, "label": module_code, "group": "Autre"}

    def demande_exists(self, demande_id: int) -> bool:
        with self._connect() as conn:
            row = conn.execute("SELECT id FROM demandes WHERE id=?", (demande_id,)).fetchone()
        return row is not None

    def _ensure_preparation_row(self, conn, demande_id: int) -> None:
        now = self._now()
        conn.execute(
            """
            INSERT OR IGNORE INTO demande_preparations (
                demande_id, phase_operation, contexte_operationnel, objectifs, points_vigilance,
                contraintes_acces, contraintes_delais, contraintes_hse, attentes_client,
                programme_previsionnel, ressources_notes, commentaires,
                type_intervention_prevu, finalite, zone_localisation, materiau_objet,
                objectif_mission, responsable_referent, attribue_a, priorite,
                date_prevue, nb_points_prevus, types_essais_prevus,
                criteres_conformite, livrables_attendus, remarques,
                created_at, updated_at
            ) VALUES (
                ?, '\u00c0 qualifier', '', '', '', '', '', '', '', '', '', '',
                '', '', '', '', '', '', '', 'Normale',
                '', '', '', '', '', '',
                ?, ?
            )
            """,
            (demande_id, now, now),
        )

    def _ensure_module_rows(self, conn, demande_id: int) -> None:
        now = self._now()
        for item in DEMANDE_MODULE_CATALOG:
            conn.execute(
                """
                INSERT OR IGNORE INTO demande_enabled_modules
                (demande_id, module_code, is_enabled, created_at, updated_at)
                VALUES (?, ?, 0, ?, ?)
                """,
                (demande_id, item["module_code"], now, now),
            )

    def get_preparation(self, demande_id: int) -> DemandePreparationRecord:
        with self._connect() as conn:
            self._ensure_preparation_row(conn, demande_id)
            self._ensure_module_rows(conn, demande_id)
            conn.commit()
            row = conn.execute(
                "SELECT * FROM demande_preparations WHERE demande_id=?",
                (demande_id,),
            ).fetchone()
            families = self._resolve_families(conn, demande_id, row["familles_prevues"] if row else "[]")
        return self._prep_row(row, families)

    def update_preparation(self, demande_id: int, fields: dict) -> DemandePreparationRecord:
        allowed = set(_PREP_FIELDS)
        payload = {k: v for k, v in fields.items() if k in allowed and v is not None}
        if "familles_prevues" in payload:
            payload["familles_prevues"] = self._serialize_families(payload["familles_prevues"])

        with self._connect() as conn:
            self._ensure_preparation_row(conn, demande_id)
            self._ensure_module_rows(conn, demande_id)
            if payload:
                payload["updated_at"] = self._now()
                clause = ", ".join(f"{k}=?" for k in payload)
                conn.execute(
                    f"UPDATE demande_preparations SET {clause} WHERE demande_id=?",
                    list(payload.values()) + [demande_id],
                )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM demande_preparations WHERE demande_id=?",
                (demande_id,),
            ).fetchone()
            families = self._resolve_families(conn, demande_id, row["familles_prevues"] if row else "[]")
        return self._prep_row(row, families)

    def list_modules(self, demande_id: int) -> list[DemandeEnabledModuleRecord]:
        with self._connect() as conn:
            self._ensure_module_rows(conn, demande_id)
            conn.commit()
            rows = conn.execute(
                "SELECT * FROM demande_enabled_modules WHERE demande_id=? ORDER BY module_code",
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
                    "UPDATE demande_enabled_modules SET is_enabled=?, updated_at=? WHERE demande_id=? AND module_code=?",
                    (1 if enabled else 0, now, demande_id, module_code),
                )
            conn.commit()
            rows = conn.execute(
                "SELECT * FROM demande_enabled_modules WHERE demande_id=? ORDER BY module_code",
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
            type_intervention_prevu=record.type_intervention_prevu,
            finalite=record.finalite,
            zone_localisation=record.zone_localisation,
            materiau_objet=record.materiau_objet,
            objectif_mission=record.objectif_mission,
            responsable_referent=record.responsable_referent,
            attribue_a=record.attribue_a,
            priorite=record.priorite,
            date_prevue=record.date_prevue,
            nb_points_prevus=record.nb_points_prevus,
            types_essais_prevus=record.types_essais_prevus,
            criteres_conformite=record.criteres_conformite,
            livrables_attendus=record.livrables_attendus,
            remarques=record.remarques,
            familles_prevues=list(record.familles_prevues),
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

    def _prep_row(self, row, families: list[str] | None = None) -> DemandePreparationRecord:
        def g(key: str, default=""):
            try:
                value = row[key]
            except (IndexError, KeyError, TypeError):
                return default
            return value if value is not None else default

        return DemandePreparationRecord(
            uid=int(row["id"]),
            demande_id=int(row["demande_id"]),
            phase_operation=g("phase_operation", PREPARATION_PHASE_OPTIONS[0]),
            contexte_operationnel=g("contexte_operationnel"),
            objectifs=g("objectifs"),
            points_vigilance=g("points_vigilance"),
            contraintes_acces=g("contraintes_acces"),
            contraintes_delais=g("contraintes_delais"),
            contraintes_hse=g("contraintes_hse"),
            attentes_client=g("attentes_client"),
            programme_previsionnel=g("programme_previsionnel"),
            ressources_notes=g("ressources_notes"),
            commentaires=g("commentaires"),
            type_intervention_prevu=g("type_intervention_prevu"),
            finalite=g("finalite"),
            zone_localisation=g("zone_localisation"),
            materiau_objet=g("materiau_objet"),
            objectif_mission=g("objectif_mission"),
            responsable_referent=g("responsable_referent"),
            attribue_a=g("attribue_a"),
            priorite=g("priorite", "Normale"),
            date_prevue=g("date_prevue"),
            nb_points_prevus=g("nb_points_prevus"),
            types_essais_prevus=g("types_essais_prevus"),
            criteres_conformite=g("criteres_conformite"),
            livrables_attendus=g("livrables_attendus"),
            remarques=g("remarques"),
            familles_prevues=list(families or []),
            created_at=g("created_at"),
            updated_at=g("updated_at"),
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

    def _resolve_families(self, conn, demande_id: int, raw_value: object) -> list[str]:
        stored = self._deserialize_families(raw_value)
        return stored or self._derive_families_from_modules(conn, demande_id)

    def _serialize_families(self, values: object) -> str:
        return json.dumps(self._normalize_family_codes(values))

    def _deserialize_families(self, raw_value: object) -> list[str]:
        if isinstance(raw_value, list):
            return self._normalize_family_codes(raw_value)
        text = str(raw_value or "").strip()
        if not text:
            return []
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return []
        return self._normalize_family_codes(data)

    def _normalize_family_codes(self, values: object) -> list[str]:
        allowed = {item["family_code"] for item in DEMANDE_FAMILY_CATALOG}
        ordered: list[str] = []
        for value in values or []:
            code = str(value or "").strip()
            if not code or code not in allowed or code in ordered:
                continue
            ordered.append(code)
        return ordered

    def _derive_families_from_modules(self, conn, demande_id: int) -> list[str]:
        rows = conn.execute(
            "SELECT module_code FROM demande_enabled_modules WHERE demande_id=? AND is_enabled=1 ORDER BY module_code",
            (demande_id,),
        ).fetchall()
        enabled_codes = {str(row["module_code"]) for row in rows}
        derived: list[str] = []

        def add(code: str) -> None:
            if code not in derived:
                derived.append(code)

        if "g3" in enabled_codes:
            add("g3")
        elif "etude_technique" in enabled_codes:
            add("appui_technique")

        if "interventions" in enabled_codes and "essais_terrain" in enabled_codes:
            add("essais_in_situ")
        elif "interventions" in enabled_codes and "echantillons" in enabled_codes:
            add("prelevements_terrain")
        elif "interventions" in enabled_codes:
            add("sondages_terrain")

        if "essais_laboratoire" in enabled_codes:
            add("essais_laboratoire")
        elif "echantillons" in enabled_codes and "interventions" not in enabled_codes:
            add("essais_laboratoire")

        if "essais_externes" in enabled_codes:
            add("essais_externes")

        return derived
