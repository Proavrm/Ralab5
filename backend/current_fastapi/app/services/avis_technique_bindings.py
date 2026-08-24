"""Résolution déclarative des bindings template → sources RaLab."""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from app.core.database import connect_db, get_db_path


def _parse_json(raw: Any, default: Any) -> Any:
    if raw is None or raw == "":
        return default
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(str(raw))
    except (TypeError, ValueError, json.JSONDecodeError):
        return default


def _connect() -> sqlite3.Connection:
    conn = connect_db(get_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def resolve_documents(demande_id: int, filt: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    filt = filt or {}
    tags = [str(t).strip().lower() for t in (filt.get("tags") or []) if str(t).strip()]
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, document_type, is_received, version, document_date, comment, stored_path, uploaded_at
            FROM demande_documents
            WHERE demande_id = ?
            ORDER BY id
            """,
            (demande_id,),
        ).fetchall()
    items = []
    for row in rows:
        label = str(row["document_type"] or "") or str(row["comment"] or "")
        dtype = str(row["document_type"] or "")
        blob = f"{label} {dtype} {row['comment'] or ''}".lower()
        if tags and not any(t in blob for t in tags):
            continue
        stored = str(row["stored_path"] or "")
        items.append(
            {
                "id": row["id"],
                "label": label,
                "document_type": dtype,
                "stored_path": stored,
                "file_url": f"/storage/{stored}" if stored and not stored.startswith("/") else stored,
                "comment": row["comment"] or "",
                "is_received": bool(row["is_received"]),
            }
        )
    return items


def resolve_demande_fields(demande_id: int, fields: list[str] | None = None) -> dict[str, Any]:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT d.id, d.reference, d.description, d.nature, d.type_mission, d.affaire_rst_id,
                   a.reference AS affaire_ref, a.chantier AS affaire_chantier, a.client AS affaire_client
            FROM demandes d
            LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
            WHERE d.id = ?
            """,
            (demande_id,),
        ).fetchone()
        extra = {}
        if row:
            # Colonnes optionnelles ajoutées par migrations
            for col, alias in (
                ("commune", "affaire_commune"),
                ("departement", "affaire_departement"),
                ("objet", "affaire_objet"),
                ("site", "affaire_site"),
            ):
                try:
                    val = conn.execute(
                        f"SELECT {col} FROM affaires_rst WHERE id = ?",
                        (row["affaire_rst_id"],),
                    ).fetchone()
                    if val is not None:
                        extra[alias] = val[0]
                except sqlite3.Error:
                    pass
    if not row:
        return {}
    data = {
        "id": row["id"],
        "reference": row["reference"] or "",
        "objet": extra.get("affaire_objet") or row["affaire_chantier"] or row["description"] or row["nature"] or "",
        "commune": extra.get("affaire_commune") or "",
        "departement": extra.get("affaire_departement") or "",
        "site": extra.get("affaire_site") or row["affaire_chantier"] or "",
        "affaire_ref": row["affaire_ref"] or "",
        "affaire_rst_id": row["affaire_rst_id"],
        "description": row["description"] or "",
        "nature": row["nature"] or "",
        "type_mission": row["type_mission"] or "",
        "client": row["affaire_client"] or "",
    }
    if fields:
        return {k: data.get(k) for k in fields if k in data}
    return data


def resolve_materiaux(demande_id: int, filt: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Matériaux distincts utilisés dans les calculs Alizé de la demande."""
    filt = filt or {}
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT l.materiau, l.formulation, l.module, l.poisson,
                   l.bibliotheque, l.from_library, l.modified_manually
            FROM alize_layers l
            JOIN calculations c ON c.id = l.calculation_id
            WHERE c.demande_id = ?
              AND COALESCE(TRIM(l.materiau), '') != ''
            ORDER BY l.materiau
            """,
            (demande_id,),
        ).fetchall()
    items = []
    for row in rows:
        from_lib = bool(row["from_library"])
        origin = "biblio" if from_lib else ("manuel" if row["modified_manually"] else "")
        if filt.get("origine") and str(filt["origine"]).lower() not in origin.lower():
            continue
        items.append(
            {
                "id": str(row["materiau"] or ""),
                "materiau": row["materiau"] or "",
                "formulation": row["formulation"] or "",
                "module": row["module"],
                "nu": row["poisson"],
                "bibliotheque": row["bibliotheque"] or "",
                "origine": origin,
                "status": "renseigné" if row["module"] is not None else "à confirmer",
            }
        )
    return items


def _general_flags(general_json: Any) -> dict[str, Any]:
    general = _parse_json(general_json, {})
    if not isinstance(general, dict):
        return {}
    return general


def resolve_calculs(demande_id: int, filt: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    filt = filt or {}
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, reference, type_calcul, nom_calcul, statut, general_json, indice, version
            FROM calculations
            WHERE demande_id = ?
            ORDER BY id
            """,
            (demande_id,),
        ).fetchall()
    items = []
    for row in rows:
        general = _general_flags(row["general_json"])
        a_retenir = bool(general.get("a_retenir"))
        pour_impression = bool(general.get("pour_impression"))
        if "a_retenir" in filt and bool(filt["a_retenir"]) != a_retenir:
            continue
        if "pour_impression" in filt and bool(filt["pour_impression"]) != pour_impression:
            continue
        if filt.get("type_calcul") and str(filt["type_calcul"]) != str(row["type_calcul"] or ""):
            continue
        if filt.get("nom_contains"):
            needle = str(filt["nom_contains"]).lower().replace(" ", "")
            hay = str(row["nom_calcul"] or "").lower().replace(" ", "")
            if needle not in hay:
                continue
        items.append(
            {
                "id": row["id"],
                "reference": row["reference"] or "",
                "type_calcul": row["type_calcul"] or "",
                "nom_calcul": row["nom_calcul"] or "",
                "statut": row["statut"] or "",
                "indice": row["indice"] or "",
                "version": row["version"],
                "a_retenir": a_retenir,
                "pour_impression": pour_impression,
                "nom_sortie": general.get("nom_sortie") or "",
                "avis": general.get("avis") or general.get("conclusion") or "",
            }
        )
    return items


def resolve_binding(demande_id: int, binding: dict[str, Any] | None) -> Any:
    if not binding or not isinstance(binding, dict):
        return None
    source = str(binding.get("source") or "").strip().lower()
    filt = binding.get("filter") if isinstance(binding.get("filter"), dict) else {}
    fields = binding.get("fields") if isinstance(binding.get("fields"), list) else None
    if source == "demande":
        return resolve_demande_fields(demande_id, fields)
    if source == "documents":
        return resolve_documents(demande_id, filt)
    if source == "calculs":
        return resolve_calculs(demande_id, filt)
    if source in ("materiaux", "materiaux_ftp", "ftp"):
        return resolve_materiaux(demande_id, filt)
    return None


def empty_block_content(block_type: str) -> dict[str, Any]:
    if block_type == "rich_text":
        return {"text": ""}
    if block_type == "bullet_list":
        return {"items": []}
    if block_type == "key_value_table":
        return {"rows": []}
    if block_type == "free_table":
        return {"headers": [], "rows": []}
    if block_type == "meta_document":
        return {"fields": {}}
    if block_type == "media_cards":
        return {"cards": []}
    if block_type == "document_gallery":
        return {"items": []}
    if block_type in ("calculs_table", "calcul_fiches"):
        return {"calcul_ids": [], "auto_from_binding": True}
    if block_type == "materiau_status":
        return {"items": [], "auto_from_binding": True}
    if block_type == "checklist":
        return {"items": []}
    return {}


def prefills_from_binding(block_type: str, resolved: Any) -> dict[str, Any]:
    content = empty_block_content(block_type)
    if resolved is None:
        return content
    if block_type == "rich_text" and isinstance(resolved, dict):
        parts = [f"{k}: {v}" for k, v in resolved.items() if v not in (None, "")]
        content["text"] = "\n".join(parts)
    elif block_type == "key_value_table" and isinstance(resolved, dict):
        content["rows"] = [{"key": k, "value": "" if v is None else str(v)} for k, v in resolved.items()]
    elif block_type == "document_gallery" and isinstance(resolved, list):
        content["items"] = [
            {"document_id": d.get("id"), "label": d.get("label") or "", "caption": ""}
            for d in resolved
            if d.get("id") is not None
        ]
    elif block_type == "media_cards" and isinstance(resolved, list):
        content["cards"] = [
            {
                "document_id": d.get("id"),
                "caption": d.get("label") or "",
                "order": i,
                "display": "full_width",
            }
            for i, d in enumerate(resolved)
            if d.get("id") is not None
        ]
    elif block_type in ("calculs_table", "calcul_fiches") and isinstance(resolved, list):
        content["calcul_ids"] = [c["id"] for c in resolved if c.get("id") is not None]
        content["auto_from_binding"] = True
    elif block_type == "materiau_status" and isinstance(resolved, list):
        content["items"] = resolved
        content["auto_from_binding"] = True
    return content


def build_initial_contents(definition: dict[str, Any], demande_id: int, apply_bindings: bool = True) -> dict[str, Any]:
    contents: dict[str, Any] = {}
    sections = definition.get("sections") if isinstance(definition, dict) else None
    if not isinstance(sections, list):
        return contents
    for section in sections:
        if not isinstance(section, dict):
            continue
        section_id = str(section.get("id") or "").strip()
        if not section_id:
            continue
        slot_map: dict[str, Any] = {}
        for block in section.get("blocks") or []:
            if not isinstance(block, dict):
                continue
            slot_id = str(block.get("slot_id") or "").strip()
            block_type = str(block.get("block_type") or "").strip()
            if not slot_id or not block_type:
                continue
            binding = block.get("binding") if isinstance(block.get("binding"), dict) else None
            if apply_bindings and binding:
                resolved = resolve_binding(demande_id, binding)
                slot_map[slot_id] = {
                    "block_type": block_type,
                    "content": prefills_from_binding(block_type, resolved),
                }
            else:
                slot_map[slot_id] = {
                    "block_type": block_type,
                    "content": empty_block_content(block_type),
                }
        contents[section_id] = slot_map
    return contents


SOURCE_REGISTRY = ("demande", "documents", "calculs", "materiaux")
