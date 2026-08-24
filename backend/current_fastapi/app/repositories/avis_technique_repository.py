"""Persistance templates + instances Avis technique."""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from app.core.database import connect_db, get_db_path
from app.models.avis_technique import (
    AvisInstanceCreateSchema,
    AvisInstanceUpdateSchema,
    AvisTemplatePatchSchema,
    AvisTemplateUpsertSchema,
)
from app.services.avis_technique_bindings import (
    build_initial_contents,
    resolve_binding,
    resolve_demande_fields,
)


def _json_dumps(value: Any) -> str:
    return json.dumps(value if value is not None else {}, ensure_ascii=False)


def _json_loads(raw: Any, default: Any) -> Any:
    if raw is None or raw == "":
        return default
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(str(raw))
    except (TypeError, ValueError, json.JSONDecodeError):
        return default


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


SEED_DIR = Path(__file__).resolve().parents[1] / "data" / "avis_templates"


class AvisTechniqueRepository:
    def _connect(self) -> sqlite3.Connection:
        conn = connect_db(get_db_path())
        conn.row_factory = sqlite3.Row
        return conn

    # ── Templates ──────────────────────────────────────────────────────────

    def _template_row(self, row: sqlite3.Row | None) -> dict[str, Any] | None:
        if not row:
            return None
        return {
            "id": row["id"],
            "code": row["code"],
            "label": row["label"] or "",
            "version": int(row["version"] or 1),
            "definition": _json_loads(row["definition_json"], {}),
            "docx_style_path": row["docx_style_path"] or "",
            "is_active": bool(row["is_active"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def list_templates(self, *, active_only: bool = False) -> list[dict[str, Any]]:
        sql = "SELECT * FROM avis_templates"
        params: tuple = ()
        if active_only:
            sql += " WHERE is_active = 1"
        sql += " ORDER BY label, code"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._template_row(r) for r in rows]

    def get_template(self, template_id: int) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM avis_templates WHERE id = ?", (template_id,)).fetchone()
        return self._template_row(row)

    def get_template_by_code(self, code: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM avis_templates WHERE code = ?",
                (str(code or "").strip(),),
            ).fetchone()
        return self._template_row(row)

    def upsert_template(self, body: AvisTemplateUpsertSchema) -> dict[str, Any]:
        code = str(body.code or "").strip()
        if not code:
            raise ValueError("code template requis")
        now = _now()
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT id, version FROM avis_templates WHERE code = ?",
                (code,),
            ).fetchone()
            if existing:
                version = int(body.version) if body.version is not None else int(existing["version"] or 1) + 1
                conn.execute(
                    """
                    UPDATE avis_templates
                    SET label = ?, version = ?, definition_json = ?, docx_style_path = ?,
                        is_active = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        body.label or code,
                        version,
                        _json_dumps(body.definition or {}),
                        body.docx_style_path or "",
                        1 if body.is_active else 0,
                        now,
                        existing["id"],
                    ),
                )
                tid = int(existing["id"])
            else:
                version = int(body.version) if body.version is not None else 1
                cur = conn.execute(
                    """
                    INSERT INTO avis_templates (
                        code, label, version, definition_json, docx_style_path, is_active, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        code,
                        body.label or code,
                        version,
                        _json_dumps(body.definition or {}),
                        body.docx_style_path or "",
                        1 if body.is_active else 0,
                        now,
                        now,
                    ),
                )
                tid = int(cur.lastrowid)
            conn.commit()
        return self.get_template(tid)

    def patch_template(self, template_id: int, body: AvisTemplatePatchSchema) -> dict[str, Any] | None:
        current = self.get_template(template_id)
        if not current:
            return None
        now = _now()
        label = body.label if body.label is not None else current["label"]
        definition = body.definition if body.definition is not None else current["definition"]
        docx_style_path = body.docx_style_path if body.docx_style_path is not None else current["docx_style_path"]
        is_active = body.is_active if body.is_active is not None else current["is_active"]
        version = int(current["version"] or 1) + (1 if body.bump_version else 0)
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE avis_templates
                SET label = ?, version = ?, definition_json = ?, docx_style_path = ?,
                    is_active = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    label,
                    version,
                    _json_dumps(definition or {}),
                    docx_style_path or "",
                    1 if is_active else 0,
                    now,
                    template_id,
                ),
            )
            conn.commit()
        return self.get_template(template_id)

    def export_template_payload(self, template_id: int) -> dict[str, Any] | None:
        tpl = self.get_template(template_id)
        if not tpl:
            return None
        return {
            "code": tpl["code"],
            "label": tpl["label"],
            "version": tpl["version"],
            "docx_style_path": tpl["docx_style_path"],
            "definition": tpl["definition"],
        }

    def import_template_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = AvisTemplateUpsertSchema(
            code=str(payload.get("code") or "").strip(),
            label=str(payload.get("label") or ""),
            version=payload.get("version"),
            definition=payload.get("definition") if isinstance(payload.get("definition"), dict) else {},
            docx_style_path=str(payload.get("docx_style_path") or ""),
            is_active=bool(payload.get("is_active", True)),
        )
        return self.upsert_template(body)

    def seed_templates_from_disk(self, *, force: bool = False) -> list[dict[str, Any]]:
        if not SEED_DIR.is_dir():
            return []
        results = []
        for path in sorted(SEED_DIR.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            code = str(payload.get("code") or path.stem).strip()
            if not code:
                continue
            existing = self.get_template_by_code(code)
            if existing and not force:
                results.append(existing)
                continue
            payload["code"] = code
            results.append(self.import_template_payload(payload))
        return results

    # ── Instances ──────────────────────────────────────────────────────────

    def _instance_row(self, row: sqlite3.Row | None, *, with_template: bool = False) -> dict[str, Any] | None:
        if not row:
            return None
        data = {
            "id": row["id"],
            "demande_id": row["demande_id"],
            "template_id": row["template_id"],
            "template_version": int(row["template_version"] or 1),
            "reference": row["reference"] or "",
            "titre": row["titre"] or "",
            "statut": row["statut"] or "Brouillon",
            "auteur": row["auteur"] or "",
            "meta": _json_loads(row["meta_json"], {}),
            "contents": _json_loads(row["contents_json"], {}),
            "linked_document_ids": _json_loads(row["linked_document_ids_json"], []),
            "linked_calcul_ids": _json_loads(row["linked_calcul_ids_json"], []),
            "linked_materiau_ids": _json_loads(row["linked_materiau_ids_json"], []),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        if with_template:
            data["template"] = self.get_template(int(row["template_id"]))
        return data

    def list_instances(self, *, demande_id: int | None = None) -> list[dict[str, Any]]:
        sql = """
            SELECT ai.*,
                   d.reference AS demande_ref,
                   a.reference AS affaire_ref,
                   a.chantier AS chantier
            FROM avis_instances ai
            LEFT JOIN demandes d ON d.id = ai.demande_id
            LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        """
        params: list[Any] = []
        if demande_id is not None:
            sql += " WHERE ai.demande_id = ?"
            params.append(demande_id)
        sql += " ORDER BY ai.updated_at DESC, ai.id DESC"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        out = []
        for row in rows:
            item = self._instance_row(row, with_template=False)
            if item:
                item["demande_ref"] = row["demande_ref"] if "demande_ref" in row.keys() else ""
                item["affaire_ref"] = row["affaire_ref"] if "affaire_ref" in row.keys() else ""
                item["chantier"] = row["chantier"] if "chantier" in row.keys() else ""
                out.append(item)
        return out

    def get_instance(self, instance_id: int, *, with_template: bool = True) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM avis_instances WHERE id = ?", (instance_id,)).fetchone()
        return self._instance_row(row, with_template=with_template)

    def _nt_ref_context(self, conn: sqlite3.Connection, demande_id: int) -> tuple[int, str]:
        row = conn.execute(
            """
            SELECT d.annee, a.region, a.reference AS affaire_reference
            FROM demandes d
            LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
            WHERE d.id = ?
            """,
            (demande_id,),
        ).fetchone()
        annee = int(row["annee"]) if row and row["annee"] else datetime.now().year
        region = str(row["region"] or "").strip().upper() if row else ""
        if not region and row and row["affaire_reference"]:
            match = re.match(r"^\d+-([A-Z0-9]+)-", str(row["affaire_reference"]))
            if match:
                region = match.group(1).upper()
        if not region:
            region = "RA"
        return annee, region

    def _next_nt_number(self, conn: sqlite3.Connection, prefix: str) -> int:
        nums: list[int] = []
        pattern = f"{prefix}%"
        for table in ("interventions", "avis_instances"):
            try:
                rows = conn.execute(
                    f"SELECT reference FROM {table} WHERE reference LIKE ?",
                    (pattern,),
                ).fetchall()
            except sqlite3.Error:
                continue
            for row in rows:
                match = re.match(rf"^{re.escape(prefix)}(\d+)$", str(row[0] or ""))
                if match:
                    nums.append(int(match.group(1)))
        return max(nums, default=0) + 1

    def _next_reference(self, demande_id: int, definition: dict[str, Any]) -> str:
        """Réf. note technique RaLab: {annee}-{region}-NT{seq:04d} (ex. 2026-RA-NT0001)."""
        fields = resolve_demande_fields(demande_id)
        with self._connect() as conn:
            annee, region = self._nt_ref_context(conn, demande_id)
            rule = str(
                (definition or {}).get("reference_rule")
                or "{annee}-{region}-NT{seq:04d}"
            )
            # Legacy / erroneous RST-D* rules from old note → force NT convention
            if "RST-D" in rule or "-D{seq" in rule:
                rule = "{annee}-{region}-NT{seq:04d}"
            prefix = f"{annee}-{region}-NT"
            seq = self._next_nt_number(conn, prefix)

        def _seq_sub(match: re.Match[str]) -> str:
            width = match.group(1)
            if width:
                return str(seq).zfill(int(width))
            return str(seq)

        text = (
            rule.replace("{annee}", str(annee))
            .replace("{region}", region)
            .replace("{affaire_ref}", str(fields.get("affaire_ref") or ""))
            .replace("{demande_ref}", str(fields.get("reference") or ""))
        )
        text = re.sub(r"\{seq(?::0(\d+)d)?\}", _seq_sub, text)
        text = text.strip()
        if not text or "RST-D" in text:
            return f"{prefix}{seq:04d}"
        return text

    def create_instance(self, body: AvisInstanceCreateSchema, *, user_name: str = "") -> dict[str, Any]:
        template = None
        if body.template_id:
            template = self.get_template(int(body.template_id))
        elif body.template_code:
            template = self.get_template_by_code(str(body.template_code))
        else:
            templates = self.list_templates(active_only=True)
            template = templates[0] if templates else None
        if not template:
            raise ValueError("Aucun template avis technique disponible")

        definition = template.get("definition") or {}
        reference = str(body.reference or "").strip() or self._next_reference(body.demande_id, definition)
        titre = str(body.titre or "").strip() or str(template.get("label") or "")
        auteur = str(body.auteur or user_name or "").strip()
        contents = body.contents if body.contents else build_initial_contents(
            definition, body.demande_id, apply_bindings=body.apply_bindings
        )
        meta = dict(body.meta or {})
        if not meta.get("reference"):
            meta["reference"] = reference
        if not meta.get("author") and auteur:
            meta["author"] = auteur
        if not meta.get("title"):
            meta["title"] = titre

        now = _now()
        with self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO avis_instances (
                    demande_id, template_id, template_version, reference, titre, statut, auteur,
                    meta_json, contents_json, linked_document_ids_json, linked_calcul_ids_json,
                    linked_materiau_ids_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'Brouillon', ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    body.demande_id,
                    template["id"],
                    template["version"],
                    reference,
                    titre,
                    auteur,
                    _json_dumps(meta),
                    _json_dumps(contents),
                    _json_dumps(body.linked_document_ids or []),
                    _json_dumps(body.linked_calcul_ids or []),
                    _json_dumps(body.linked_materiau_ids or []),
                    now,
                    now,
                ),
            )
            conn.commit()
            iid = int(cur.lastrowid)
        return self.get_instance(iid)

    def update_instance(self, instance_id: int, body: AvisInstanceUpdateSchema) -> dict[str, Any] | None:
        current = self.get_instance(instance_id, with_template=False)
        if not current:
            return None
        now = _now()
        reference = body.reference if body.reference is not None else current["reference"]
        titre = body.titre if body.titre is not None else current["titre"]
        statut = body.statut if body.statut is not None else current["statut"]
        auteur = body.auteur if body.auteur is not None else current["auteur"]
        meta = body.meta if body.meta is not None else current["meta"]
        contents = body.contents if body.contents is not None else current["contents"]
        linked_docs = body.linked_document_ids if body.linked_document_ids is not None else current["linked_document_ids"]
        linked_calcs = body.linked_calcul_ids if body.linked_calcul_ids is not None else current["linked_calcul_ids"]
        linked_mats = body.linked_materiau_ids if body.linked_materiau_ids is not None else current["linked_materiau_ids"]
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE avis_instances
                SET reference = ?, titre = ?, statut = ?, auteur = ?,
                    meta_json = ?, contents_json = ?,
                    linked_document_ids_json = ?, linked_calcul_ids_json = ?,
                    linked_materiau_ids_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    reference or "",
                    titre or "",
                    statut or "Brouillon",
                    auteur or "",
                    _json_dumps(meta or {}),
                    _json_dumps(contents or {}),
                    _json_dumps(linked_docs or []),
                    _json_dumps(linked_calcs or []),
                    _json_dumps(linked_mats or []),
                    now,
                    instance_id,
                ),
            )
            conn.commit()
        return self.get_instance(instance_id)

    def refresh_bindings(self, instance_id: int, *, only_empty: bool = False) -> dict[str, Any] | None:
        instance = self.get_instance(instance_id, with_template=True)
        if not instance or not instance.get("template"):
            return None
        definition = instance["template"].get("definition") or {}
        fresh = build_initial_contents(definition, instance["demande_id"], apply_bindings=True)
        if only_empty:
            merged = dict(instance.get("contents") or {})
            for section_id, slots in fresh.items():
                current_section = merged.get(section_id) or {}
                for slot_id, block in (slots or {}).items():
                    existing = current_section.get(slot_id)
                    if not existing:
                        current_section[slot_id] = block
                        continue
                    content = (existing.get("content") or {}) if isinstance(existing, dict) else {}
                    if only_empty and self._is_empty_content(existing.get("block_type"), content):
                        current_section[slot_id] = block
                merged[section_id] = current_section
            contents = merged
        else:
            contents = fresh
        return self.update_instance(instance_id, AvisInstanceUpdateSchema(contents=contents))

    @staticmethod
    def _is_empty_content(block_type: str | None, content: dict[str, Any]) -> bool:
        if not content:
            return True
        bt = str(block_type or "")
        if bt == "rich_text":
            return not str(content.get("text") or "").strip()
        if bt in ("bullet_list", "checklist"):
            return not (content.get("items") or [])
        if bt == "key_value_table":
            return not (content.get("rows") or [])
        if bt == "free_table":
            tables = content.get("tables")
            if isinstance(tables, list):
                return not any(
                    (isinstance(t, dict) and ((t.get("rows") or []) or (t.get("headers") or [])))
                    for t in tables
                )
            return not (content.get("rows") or []) and not (content.get("headers") or [])
        if bt == "media_cards":
            return not (content.get("cards") or [])
        if bt == "document_gallery":
            return not (content.get("items") or [])
        if bt in ("calculs_table", "calcul_fiches"):
            return not (content.get("calcul_ids") or [])
        if bt == "materiau_status":
            return not (content.get("items") or [])
        if bt == "meta_document":
            fields = content.get("fields") or {}
            return not any(str(v or "").strip() for v in fields.values()) if isinstance(fields, dict) else True
        return False

    def resolve_instance_bindings(self, instance_id: int) -> dict[str, Any] | None:
        instance = self.get_instance(instance_id, with_template=True)
        if not instance or not instance.get("template"):
            return None
        definition = instance["template"].get("definition") or {}
        out: dict[str, Any] = {}
        for section in definition.get("sections") or []:
            if not isinstance(section, dict):
                continue
            section_id = str(section.get("id") or "")
            for block in section.get("blocks") or []:
                if not isinstance(block, dict):
                    continue
                binding = block.get("binding")
                if not binding:
                    continue
                slot_id = str(block.get("slot_id") or "")
                key = f"{section_id}.{slot_id}"
                out[key] = resolve_binding(instance["demande_id"], binding)
        return {"instance_id": instance_id, "bindings": out}
