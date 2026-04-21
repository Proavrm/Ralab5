"""
app/services/intervention_campaign_service.py
Service campagnes base sur la table `campagnes`.
"""
from __future__ import annotations

import re
import sqlite3
import unicodedata
from datetime import datetime
from typing import Any

from app.core.database import ensure_ralab4_schema, get_db_path

DB_PATH = get_db_path()
GENERIC_WORKFLOW_LABEL = "Campagne -> Preparation -> Intervention -> Essai / Prelevement -> Restitution"


def _conn() -> sqlite3.Connection:
    ensure_ralab4_schema(DB_PATH)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _str(value: object) -> str:
    return str(value).strip() if value is not None else ""


def _normalize_code(code: object, fallback_label: object = "") -> str:
    raw = _str(code)
    if raw:
        ascii_code = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
        return re.sub(r"[^A-Za-z0-9]+", "", ascii_code).upper()[:12] or "CMP"

    raw_label = _str(fallback_label)
    ascii_label = unicodedata.normalize("NFKD", raw_label).encode("ascii", "ignore").decode("ascii")
    words = [word for word in re.split(r"[^A-Za-z0-9]+", ascii_label) if word]
    if not words:
        return "CMP"
    if len(words) == 1:
        return words[0][:6].upper()
    return "".join(word[0] for word in words)[:6].upper() or "CMP"


def _table_exists(conn, table: str) -> bool:
    return bool(
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
    )


def _load_demande(conn, demande_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT id, reference FROM demandes WHERE id=?", (demande_id,)).fetchone()


def _load_campagne(conn, campagne_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM campagnes WHERE id=?", (campagne_id,)).fetchone()


def _next_reference(conn, demande: sqlite3.Row) -> str:
    demande_reference = _str(demande["reference"]) or f"DEM-{int(demande['id'])}"
    prefix = f"{demande_reference}-C"
    rows = conn.execute(
        "SELECT reference FROM campagnes WHERE demande_id=? AND reference LIKE ?",
        (int(demande["id"]), f"{prefix}%"),
    ).fetchall()
    indexes: list[int] = []
    for row in rows:
        match = re.match(rf"^{re.escape(prefix)}(\d+)$", _str(row["reference"]))
        if match:
            indexes.append(int(match.group(1)))
    return f"{prefix}{max(indexes, default=0) + 1:02d}"


def _load_interventions(conn, demande_id: int, campagne_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT id, reference, date_intervention, type_intervention, sujet, statut
        FROM interventions
        WHERE demande_id=? AND campagne_id=?
        ORDER BY COALESCE(date_intervention, ''), COALESCE(reference, ''), id
        """,
        (demande_id, campagne_id),
    ).fetchall()


def _load_essais_for_intervention(conn, intervention_id: int) -> list[sqlite3.Row]:
    if not _table_exists(conn, "essais"):
        return []
    return conn.execute(
        """
        SELECT id, printf('ESSAI-%04d', id) AS reference, statut, date_debut
        FROM essais
        WHERE intervention_id=?
        ORDER BY COALESCE(date_debut, created_at) DESC, id DESC
        """,
        (intervention_id,),
    ).fetchall()


def _campagne_to_dict(conn, demande: sqlite3.Row, campagne: sqlite3.Row) -> dict[str, Any]:
    campagne_data = dict(campagne)
    demande_data = dict(demande)
    interventions = _load_interventions(conn, int(demande_data["id"]), int(campagne_data["id"]))
    essai_count = 0
    interventions_with_essais = 0
    intervention_items = []

    for intervention in interventions:
        intervention_id = int(intervention["id"])
        essais = _load_essais_for_intervention(conn, intervention_id)
        count = len(essais)
        essai_count += count
        if count:
            interventions_with_essais += 1
        latest = essais[0] if essais else None
        intervention_items.append(
            {
                "uid": intervention_id,
                "reference": _str(intervention["reference"]),
                "date_intervention": _str(intervention["date_intervention"]),
                "type_intervention": _str(intervention["type_intervention"]),
                "sujet": _str(intervention["sujet"]),
                "statut": _str(intervention["statut"]),
                "essai_count": count,
                "essai_uid": int(latest["id"]) if latest else None,
                "essai_reference": _str(latest["reference"]) if latest else "",
                "essai_statut": _str(latest["statut"]) if latest else "",
            }
        )

    intervention_count = len(intervention_items)
    pending_count = max(intervention_count - interventions_with_essais, 0)
    if intervention_count == 0:
        next_step = "Ajouter la premiere intervention a la campagne."
    elif pending_count:
        next_step = "Completer les interventions et rattacher les essais."
    else:
        next_step = "Relire la campagne et finaliser la restitution."

    return {
        "uid": int(campagne_data["id"]),
        "reference": _str(campagne_data["reference"]),
        "label": _str(campagne_data["label"]),
        "type_campagne": _str(campagne_data.get("type_campagne", "")),
        "code": _str(campagne_data.get("code", "")),
        "designation": _str(campagne_data.get("designation", "")),
        "zone_scope": _str(campagne_data.get("zone_scope", "")),
        "temporalite": _str(campagne_data.get("temporalite", "")),
        "programme_specifique": _str(campagne_data.get("programme_specifique", "")),
        "nb_points_prevus": _str(campagne_data.get("nb_points_prevus", "")),
        "types_essais_prevus": _str(campagne_data.get("types_essais_prevus", "")),
        "date_debut_prevue": _str(campagne_data.get("date_debut_prevue", "")),
        "date_fin_prevue": _str(campagne_data.get("date_fin_prevue", "")),
        "priorite": _str(campagne_data.get("priorite", "Normale")),
        "responsable_technique": _str(campagne_data.get("responsable_technique", "")),
        "attribue_a": _str(campagne_data.get("attribue_a", "")),
        "criteres_controle": _str(campagne_data.get("criteres_controle", "")),
        "livrables_attendus": _str(campagne_data.get("livrables_attendus", "")),
        "notes": _str(campagne_data.get("notes", "")),
        "statut": _str(campagne_data.get("statut", "")),
        "workflow_label": _str(campagne_data.get("workflow_label", "")),
        "intervention_count": intervention_count,
        "essai_count": essai_count,
        "pending_intervention_count": pending_count,
        "intervention_uids": [item["uid"] for item in intervention_items],
        "interventions": intervention_items,
        "next_step": next_step,
        "preparation_status": _str(campagne_data.get("statut", "\u00c0 cadrer")),
        "steps": [
            {"code": "campagne", "label": "Campagne", "status": _str(campagne_data.get("statut", "")) or "\u00c0 cadrer"},
            {"code": "intervention", "label": "Interventions", "status": f"{intervention_count} intervention(s) liee(s)"},
            {"code": "essai", "label": "Essais", "status": f"{essai_count} essai(s)" if essai_count else "Aucun essai"},
            {"code": "rapport", "label": "Restitution", "status": "A produire"},
        ],
        "demande_uid": int(demande_data["id"]),
        "demande_reference": _str(demande_data["reference"]),
    }


def list_campaigns_for_demande(demande_id: int, preparation_phase: str = "") -> list[dict[str, Any]]:
    with _conn() as conn:
        demande = _load_demande(conn, demande_id)
        if demande is None:
            raise LookupError(f"Demande #{demande_id} introuvable")
        rows = conn.execute(
            "SELECT * FROM campagnes WHERE demande_id=? ORDER BY COALESCE(reference, ''), id",
            (demande_id,),
        ).fetchall()
        return [_campagne_to_dict(conn, demande, row) for row in rows]


def create_campaign(
    demande_id: int,
    *,
    code: object = "",
    label: object = "Campagne",
    designation: object = "",
    zone_scope: object = "",
    temporalite: object = "",
    programme_specifique: object = "",
    nb_points_prevus: object = "",
    types_essais_prevus: object = "",
    notes: object = "",
    statut: object = "\u00c0 cadrer",
    date_debut_prevue: object = "",
    date_fin_prevue: object = "",
    priorite: object = "Normale",
    responsable_technique: object = "",
    attribue_a: object = "",
    criteres_controle: object = "",
    livrables_attendus: object = "",
) -> dict[str, Any]:
    with _conn() as conn:
        demande = _load_demande(conn, demande_id)
        if demande is None:
            raise LookupError(f"Demande #{demande_id} introuvable")

        now = _now()
        normalized_label = _str(label) or "Campagne"
        normalized_code = _normalize_code(code, normalized_label)
        cursor = conn.execute(
            """
            INSERT INTO campagnes (
                demande_id, reference, label, type_campagne, code, designation,
                zone_scope, temporalite, programme_specifique, nb_points_prevus, types_essais_prevus,
                date_debut_prevue, date_fin_prevue, priorite, responsable_technique, attribue_a,
                criteres_controle, livrables_attendus, notes, statut, workflow_label, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                int(demande_id),
                _next_reference(conn, demande),
                normalized_label,
                normalized_code,
                normalized_code,
                _str(designation),
                _str(zone_scope),
                _str(temporalite),
                _str(programme_specifique),
                _str(nb_points_prevus),
                _str(types_essais_prevus),
                _str(date_debut_prevue),
                _str(date_fin_prevue),
                _str(priorite) or "Normale",
                _str(responsable_technique),
                _str(attribue_a),
                _str(criteres_controle),
                _str(livrables_attendus),
                _str(notes),
                _str(statut) or "\u00c0 cadrer",
                GENERIC_WORKFLOW_LABEL,
                now,
                now,
            ),
        )
        campagne = _load_campagne(conn, int(cursor.lastrowid))
        conn.commit()
        if campagne is None:
            raise LookupError("Campagne nouvellement creee introuvable")
        return _campagne_to_dict(conn, demande, campagne)


def update_campaign(
    campaign_id: int,
    *,
    code: object | None = None,
    label: object | None = None,
    designation: object | None = None,
    zone_scope: object | None = None,
    temporalite: object | None = None,
    programme_specifique: object | None = None,
    nb_points_prevus: object | None = None,
    types_essais_prevus: object | None = None,
    notes: object | None = None,
    statut: object | None = None,
    date_debut_prevue: object | None = None,
    date_fin_prevue: object | None = None,
    priorite: object | None = None,
    responsable_technique: object | None = None,
    attribue_a: object | None = None,
    criteres_controle: object | None = None,
    livrables_attendus: object | None = None,
) -> dict[str, Any]:
    with _conn() as conn:
        campagne = _load_campagne(conn, campaign_id)
        if campagne is None:
            raise LookupError(f"Campagne #{campaign_id} introuvable")
        demande = _load_demande(conn, int(campagne["demande_id"]))
        if demande is None:
            raise LookupError("Demande introuvable")

        updates: dict[str, Any] = {}
        if code is not None or label is not None:
            normalized_code = _normalize_code(
                code if code is not None else campagne["code"],
                _str(label) if label is not None else _str(campagne["label"]),
            )
            updates["code"] = normalized_code
            updates["type_campagne"] = normalized_code
        if label is not None:
            updates["label"] = _str(label) or "Campagne"
        if designation is not None:
            updates["designation"] = _str(designation)
        if zone_scope is not None:
            updates["zone_scope"] = _str(zone_scope)
        if temporalite is not None:
            updates["temporalite"] = _str(temporalite)
        if programme_specifique is not None:
            updates["programme_specifique"] = _str(programme_specifique)
        if nb_points_prevus is not None:
            updates["nb_points_prevus"] = _str(nb_points_prevus)
        if types_essais_prevus is not None:
            updates["types_essais_prevus"] = _str(types_essais_prevus)
        if notes is not None:
            updates["notes"] = _str(notes)
        if statut is not None:
            updates["statut"] = _str(statut) or "\u00c0 cadrer"
        if date_debut_prevue is not None:
            updates["date_debut_prevue"] = _str(date_debut_prevue)
        if date_fin_prevue is not None:
            updates["date_fin_prevue"] = _str(date_fin_prevue)
        if priorite is not None:
            updates["priorite"] = _str(priorite) or "Normale"
        if responsable_technique is not None:
            updates["responsable_technique"] = _str(responsable_technique)
        if attribue_a is not None:
            updates["attribue_a"] = _str(attribue_a)
        if criteres_controle is not None:
            updates["criteres_controle"] = _str(criteres_controle)
        if livrables_attendus is not None:
            updates["livrables_attendus"] = _str(livrables_attendus)

        if not updates:
            return _campagne_to_dict(conn, demande, campagne)

        updates["updated_at"] = _now()
        clause = ", ".join(f"{column}=?" for column in updates)
        conn.execute(
            f"UPDATE campagnes SET {clause} WHERE id=?",
            list(updates.values()) + [campaign_id],
        )
        updated = _load_campagne(conn, campaign_id)
        conn.commit()
        if updated is None:
            raise LookupError(f"Campagne #{campaign_id} introuvable apres mise a jour")
        return _campagne_to_dict(conn, demande, updated)


def attach_intervention_to_campaign(intervention_id: int, campaign_id: int) -> dict[str, int]:
    with _conn() as conn:
        intervention = conn.execute(
            "SELECT id, demande_id FROM interventions WHERE id=?",
            (intervention_id,),
        ).fetchone()
        if intervention is None:
            raise LookupError(f"Intervention #{intervention_id} introuvable")

        campagne = conn.execute(
            "SELECT id, demande_id FROM campagnes WHERE id=?",
            (campaign_id,),
        ).fetchone()
        if campagne is None:
            raise LookupError(f"Campagne #{campaign_id} introuvable")
        if int(intervention["demande_id"]) != int(campagne["demande_id"]):
            raise ValueError("La campagne n'appartient pas a la meme demande que l'intervention.")

        conn.execute(
            "UPDATE interventions SET campagne_id=?, updated_at=? WHERE id=?",
            (campaign_id, _now(), intervention_id),
        )
        conn.commit()
        return {"campaign_id": campaign_id, "intervention_id": intervention_id}
