"""
api/intervention_requalification.py
Persistence API for the interventions requalification workflow.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.database import ensure_ralab4_schema, get_db_path

router = APIRouter()
DB_PATH = get_db_path()

DIRECT_TO_INTERVENTION_NATURES = {"Essai terrain", "Sondage", "Intervention"}
PRELEVEMENT_NATURE = "Prélèvement"

PRELEVEMENT_SELECT_BASE = """
    SELECT
        p.*, 
        d.reference AS demande_reference,
        d.labo_code AS labo_code,
        a.reference AS affaire_reference,
        a.chantier AS chantier,
        a.site AS site,
        ir.reference AS intervention_reelle_reference,
        COALESCE(raw_stats.raw_count, 0) AS raw_count,
        COALESCE(ech_stats.echantillon_count, 0) AS echantillon_count,
        COALESCE(ech_stats.last_reception_labo, '') AS last_reception_labo,
        COALESCE(essai_stats.essai_count, 0) AS essai_count
    FROM prelevements p
    LEFT JOIN demandes d ON d.id = p.demande_id
    LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
    LEFT JOIN interventions_reelles ir ON ir.id = p.intervention_reelle_id
    LEFT JOIN (
        SELECT prelevement_id, COUNT(*) AS raw_count
        FROM interventions
        WHERE prelevement_id IS NOT NULL
        GROUP BY prelevement_id
    ) raw_stats ON raw_stats.prelevement_id = p.id
    LEFT JOIN (
        SELECT
            prelevement_id,
            COUNT(*) AS echantillon_count,
            MAX(COALESCE(date_reception_labo, '')) AS last_reception_labo
        FROM echantillons
        WHERE prelevement_id IS NOT NULL
        GROUP BY prelevement_id
    ) ech_stats ON ech_stats.prelevement_id = p.id
    LEFT JOIN (
        SELECT ech.prelevement_id AS prelevement_id, COUNT(es.id) AS essai_count
        FROM echantillons ech
        LEFT JOIN essais es ON es.echantillon_id = ech.id
        WHERE ech.prelevement_id IS NOT NULL
        GROUP BY ech.prelevement_id
    ) essai_stats ON essai_stats.prelevement_id = p.id
"""


def _conn() -> sqlite3.Connection:
    ensure_ralab4_schema(DB_PATH)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _now_sql() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _parse_obs(observations: str) -> dict:
    if not isinstance(observations, str):
        return {}
    raw = observations.strip()
    if not raw or not raw.startswith("{"):
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}


def _model_dump(payload: BaseModel) -> dict:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_unset=True)
    return payload.dict(exclude_unset=True)


def _row_to_prelevement_dict(row: sqlite3.Row) -> dict:
    return {
        "uid": int(row["id"]),
        "reference": row["reference"],
        "demande_id": row["demande_id"],
        "demande_reference": row["demande_reference"] or "",
        "labo_code": row["labo_code"] or "",
        "affaire_reference": row["affaire_reference"] or "",
        "chantier": row["chantier"] or "",
        "site": row["site"] or "",
        "intervention_reelle_id": row["intervention_reelle_id"],
        "intervention_reelle_reference": row["intervention_reelle_reference"] or "",
        "date_prelevement": row["date_prelevement"] or "",
        "date_reception_labo": row["date_reception_labo"] or "",
        "last_reception_labo": row["last_reception_labo"] or "",
        "description": row["description"] or "",
        "quantite": row["quantite"] or "",
        "receptionnaire": row["receptionnaire"] or "",
        "zone": row["zone"] or "",
        "materiau": row["materiau"] or "",
        "technicien": row["technicien"] or "",
        "finalite": row["finalite"] or "",
        "notes": row["notes"] or "",
        "statut": row["statut"] or "",
        "raw_count": int(row["raw_count"] or 0),
        "echantillon_count": int(row["echantillon_count"] or 0),
        "essai_count": int(row["essai_count"] or 0),
    }


def _row_to_raw_dict(row: sqlite3.Row) -> dict:
    data = dict(row)
    data["uid"] = int(data.pop("id"))
    data["demande_reference"] = data.get("demande_reference") or ""
    data["demande_ref"] = data.get("demande_reference") or ""
    data["affaire_reference"] = data.get("affaire_reference") or ""
    data["affaire_ref"] = data.get("affaire_reference") or ""
    data["prelevement_reference"] = data.get("prelevement_reference") or ""
    data["intervention_reelle_reference"] = data.get("intervention_reelle_reference") or ""

    obs = _parse_obs(data.get("observations") or "")
    data.setdefault("zone_intervention", obs.get("zone_intervention") or "")
    data.setdefault("finalite", obs.get("finalite_intervention") or "")
    data.setdefault("nature_materiau", obs.get("nature_materiau") or "")
    data.setdefault("notes_terrain", obs.get("notes_terrain") or "")
    return data


def _row_to_linked_raw_summary(row: sqlite3.Row) -> dict:
    observations = _parse_obs(str(row["observations"] or ""))
    return {
        "uid": int(row["id"]),
        "reference": row["reference"] or "",
        "type_intervention": row["type_intervention"] or "",
        "date_intervention": row["date_intervention"] or "",
        "statut": row["statut"] or "",
        "nature_reelle": row["nature_reelle"] or "",
        "zone_intervention": observations.get("zone_intervention") or "",
        "finalite": observations.get("finalite_intervention") or "",
        "essai_code": str(
            observations.get("essai_code")
            or observations.get("source_essai_code")
            or ""
        ).strip().upper(),
    }


def _normalize_year(value: str | None) -> str:
    raw = str(value or "").strip()
    return raw if raw.isdigit() and len(raw) == 4 else ""


def _extract_year_from_rows(rows: list[sqlite3.Row]) -> int:
    for row in rows:
        date_value = str(row["date_intervention"] or "")
        if len(date_value) >= 4 and date_value[:4].isdigit():
            return int(date_value[:4])
        ref_value = str(row["reference"] or "")
        for token in ref_value.replace("/", "-").split("-"):
            if token.isdigit() and len(token) == 4:
                return int(token)
    return datetime.now().year


def _next_reference(conn: sqlite3.Connection, table_name: str, prefix: str) -> str:
    rows = conn.execute(
        f"SELECT reference FROM {table_name} WHERE reference LIKE ?",
        (f"{prefix}%",),
    ).fetchall()
    numbers: list[int] = []
    for row in rows:
        ref = str(row["reference"])
        suffix = ref.replace(prefix, "", 1)
        if suffix.isdigit():
            numbers.append(int(suffix))
    next_number = max(numbers, default=0) + 1
    return f"{prefix}{next_number:04d}"


def _fetch_raw_rows(conn: sqlite3.Connection, raw_ids: list[int]) -> list[sqlite3.Row]:
    if not raw_ids:
        return []
    placeholders = ",".join("?" for _ in raw_ids)
    return conn.execute(
        f"SELECT * FROM interventions WHERE id IN ({placeholders}) ORDER BY id",
        tuple(raw_ids),
    ).fetchall()


def _sync_prelevement_intervention(conn: sqlite3.Connection, prelevement_ids: list[int]) -> None:
    unique_ids = sorted({int(value) for value in prelevement_ids if value})
    if not unique_ids:
        return
    for prelevement_id in unique_ids:
        row = conn.execute(
            "SELECT DISTINCT intervention_reelle_id FROM interventions WHERE prelevement_id = ? AND COALESCE(intervention_reelle_id, 0) <> 0",
            (prelevement_id,),
        ).fetchall()
        if not row:
            conn.execute(
                "UPDATE prelevements SET intervention_reelle_id = NULL, updated_at = ? WHERE id = ?",
                (_now_sql(), prelevement_id),
            )
            continue
        values = {int(item[0]) for item in row if item[0] is not None}
        if len(values) == 1:
            conn.execute(
                "UPDATE prelevements SET intervention_reelle_id = ?, updated_at = ? WHERE id = ?",
                (next(iter(values)), _now_sql(), prelevement_id),
            )
        else:
            conn.execute(
                "UPDATE prelevements SET intervention_reelle_id = NULL, updated_at = ? WHERE id = ?",
                (_now_sql(), prelevement_id),
            )


class RawInterventionPatch(BaseModel):
    nature_reelle: Optional[str] = None
    prelevement_id: Optional[int] = None
    intervention_reelle_id: Optional[int] = None
    tri_comment: Optional[str] = None


class BulkNaturePayload(BaseModel):
    raw_ids: list[int] = Field(default_factory=list)
    nature_reelle: str


class BulkPrelevementAssignmentPayload(BaseModel):
    raw_ids: list[int] = Field(default_factory=list)
    prelevement_id: int


class BulkInterventionAssignmentPayload(BaseModel):
    raw_ids: list[int] = Field(default_factory=list)
    intervention_reelle_id: int


class BulkRawIdsPayload(BaseModel):
    raw_ids: list[int] = Field(default_factory=list)


class CreatePrelevementPayload(BaseModel):
    raw_ids: list[int] = Field(default_factory=list)
    notes: str = ""


class UpdatePrelevementPayload(BaseModel):
    date_prelevement: Optional[str] = None
    date_reception_labo: Optional[str] = None
    description: Optional[str] = None
    quantite: Optional[str] = None
    receptionnaire: Optional[str] = None
    zone: Optional[str] = None
    materiau: Optional[str] = None
    technicien: Optional[str] = None
    finalite: Optional[str] = None
    notes: Optional[str] = None
    statut: Optional[str] = None


class CreateInterventionReellePayload(BaseModel):
    raw_ids: list[int] = Field(default_factory=list)
    prelevement_ids: list[int] = Field(default_factory=list)
    notes: str = ""


@router.get("/raw")
def list_raw_interventions(year: Optional[str] = Query(None)) -> list[dict]:
    normalized_year = _normalize_year(year)
    with _conn() as conn:
        sql = """
            SELECT
                i.*, 
                d.reference AS demande_reference,
                a.reference AS affaire_reference,
                a.client AS client,
                a.chantier AS chantier,
                a.site AS site,
                p.reference AS prelevement_reference,
                ir.reference AS intervention_reelle_reference
            FROM interventions i
            LEFT JOIN demandes d ON d.id = i.demande_id
            LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
            LEFT JOIN prelevements p ON p.id = i.prelevement_id
            LEFT JOIN interventions_reelles ir ON ir.id = i.intervention_reelle_id
            WHERE 1 = 1
        """
        params: list[object] = []
        if normalized_year:
            sql += " AND (substr(COALESCE(i.date_intervention, ''), 1, 4) = ? OR substr(COALESCE(i.reference, ''), 1, 4) = ?)"
            params.extend([normalized_year, normalized_year])
        sql += " ORDER BY COALESCE(i.date_intervention, '') DESC, i.reference DESC"
        rows = conn.execute(sql, tuple(params)).fetchall()
    return [_row_to_raw_dict(row) for row in rows]


@router.patch("/raw/{uid}")
def patch_raw_intervention(uid: int, payload: RawInterventionPatch) -> dict:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM interventions WHERE id = ?", (uid,)).fetchone()
        if not row:
            raise HTTPException(404, "Intervention brute introuvable")

        current = dict(row)
        nature_reelle = payload.nature_reelle if payload.nature_reelle is not None else (current.get("nature_reelle") or "")
        tri_comment = payload.tri_comment if payload.tri_comment is not None else (current.get("tri_comment") or "")
        prelevement_id = current.get("prelevement_id")
        intervention_reelle_id = current.get("intervention_reelle_id")

        if payload.prelevement_id is not None:
            prelevement_id = payload.prelevement_id or None
            if prelevement_id:
                linked = conn.execute("SELECT intervention_reelle_id FROM prelevements WHERE id = ?", (prelevement_id,)).fetchone()
                intervention_reelle_id = linked[0] if linked and linked[0] else None
            else:
                intervention_reelle_id = None

        if payload.intervention_reelle_id is not None:
            if prelevement_id:
                intervention_reelle_id = payload.intervention_reelle_id or None
                conn.execute(
                    "UPDATE interventions SET intervention_reelle_id = ?, tri_updated_at = ? WHERE prelevement_id = ?",
                    (intervention_reelle_id, _now_sql(), prelevement_id),
                )
                conn.execute(
                    "UPDATE prelevements SET intervention_reelle_id = ?, updated_at = ? WHERE id = ?",
                    (intervention_reelle_id, _now_sql(), prelevement_id),
                )
            else:
                intervention_reelle_id = payload.intervention_reelle_id or None

        if nature_reelle and nature_reelle != PRELEVEMENT_NATURE:
            prelevement_id = None

        conn.execute(
            """
            UPDATE interventions
            SET nature_reelle = ?, prelevement_id = ?, intervention_reelle_id = ?, tri_comment = ?, tri_updated_at = ?
            WHERE id = ?
            """,
            (nature_reelle, prelevement_id, intervention_reelle_id, tri_comment, _now_sql(), uid),
        )
        conn.commit()

        updated = conn.execute(
            """
            SELECT
                i.*, 
                d.reference AS demande_reference,
                a.reference AS affaire_reference,
                a.client AS client,
                a.chantier AS chantier,
                a.site AS site,
                p.reference AS prelevement_reference,
                ir.reference AS intervention_reelle_reference
            FROM interventions i
            LEFT JOIN demandes d ON d.id = i.demande_id
            LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
            LEFT JOIN prelevements p ON p.id = i.prelevement_id
            LEFT JOIN interventions_reelles ir ON ir.id = i.intervention_reelle_id
            WHERE i.id = ?
            """,
            (uid,),
        ).fetchone()
    return _row_to_raw_dict(updated)


@router.post("/raw/bulk-nature")
def bulk_set_nature(payload: BulkNaturePayload) -> dict:
    raw_ids = sorted({int(value) for value in payload.raw_ids if value})
    if not raw_ids:
        return {"updated": 0}

    with _conn() as conn:
        placeholders = ",".join("?" for _ in raw_ids)
        params: list[object] = [payload.nature_reelle, _now_sql(), *raw_ids]
        sql = f"UPDATE interventions SET nature_reelle = ?, tri_updated_at = ? WHERE id IN ({placeholders})"
        conn.execute(sql, tuple(params))
        if payload.nature_reelle != PRELEVEMENT_NATURE:
            conn.execute(
                f"UPDATE interventions SET prelevement_id = NULL WHERE id IN ({placeholders})",
                tuple(raw_ids),
            )
        conn.commit()
    return {"updated": len(raw_ids)}


@router.get("/prelevements")
def list_prelevements(
    year: Optional[str] = Query(None),
    unassigned_only: bool = Query(False),
    intervention_reelle_id: Optional[int] = Query(None),
) -> list[dict]:
    normalized_year = _normalize_year(year)
    with _conn() as conn:
        sql = PRELEVEMENT_SELECT_BASE + " WHERE 1 = 1"
        params: list[object] = []
        if normalized_year:
            sql += " AND COALESCE(CAST(p.source_year AS TEXT), '') = ?"
            params.append(normalized_year)
        if unassigned_only:
            sql += " AND COALESCE(p.intervention_reelle_id, 0) = 0"
        if intervention_reelle_id is not None:
            sql += " AND p.intervention_reelle_id = ?"
            params.append(intervention_reelle_id)
        sql += " ORDER BY COALESCE(NULLIF(p.date_reception_labo, ''), NULLIF(ech_stats.last_reception_labo, ''), NULLIF(p.date_prelevement, ''), p.created_at) DESC, p.reference DESC"
        rows = conn.execute(sql, tuple(params)).fetchall()
    return [_row_to_prelevement_dict(row) for row in rows]


@router.get("/prelevements/{uid}")
def get_prelevement(uid: int) -> dict:
    with _conn() as conn:
        row = conn.execute(
            PRELEVEMENT_SELECT_BASE + " WHERE p.id = ?",
            (uid,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Prélèvement introuvable")

        data = _row_to_prelevement_dict(row)
        linked_rows = conn.execute(
            """
            SELECT
                ech.id,
                ech.reference,
                ech.designation,
                ech.statut,
                ech.date_prelevement,
                ech.date_reception_labo,
                COUNT(es.id) AS essai_count
            FROM echantillons ech
            LEFT JOIN essais es ON es.echantillon_id = ech.id
            WHERE ech.prelevement_id = ?
            GROUP BY ech.id
            ORDER BY COALESCE(NULLIF(ech.date_reception_labo, ''), NULLIF(ech.date_prelevement, ''), ech.created_at) DESC, ech.id DESC
            """,
            (uid,),
        ).fetchall()
        data["echantillons"] = [
            {
                "uid": int(item["id"]),
                "reference": item["reference"] or "",
                "designation": item["designation"] or "",
                "statut": item["statut"] or "",
                "date_prelevement": item["date_prelevement"] or "",
                "date_reception_labo": item["date_reception_labo"] or "",
                "essai_count": int(item["essai_count"] or 0),
            }
            for item in linked_rows
        ]
        raw_rows = conn.execute(
            """
            SELECT i.*
            FROM interventions i
            WHERE i.prelevement_id = ?
            ORDER BY COALESCE(NULLIF(i.date_intervention, ''), i.created_at) DESC, i.id DESC
            """,
            (uid,),
        ).fetchall()
        data["raw_interventions"] = [_row_to_linked_raw_summary(item) for item in raw_rows]
    return data


@router.patch("/prelevements/{uid}")
def update_prelevement(uid: int, payload: UpdatePrelevementPayload) -> dict:
    values = _model_dump(payload)
    allowed_fields = {
        "date_prelevement",
        "date_reception_labo",
        "description",
        "quantite",
        "receptionnaire",
        "zone",
        "materiau",
        "technicien",
        "finalite",
        "notes",
        "statut",
    }

    with _conn() as conn:
        exists = conn.execute("SELECT id FROM prelevements WHERE id = ?", (uid,)).fetchone()
        if not exists:
            raise HTTPException(404, "Prélèvement introuvable")

        fields: list[str] = []
        params: list[object] = []
        for key, value in values.items():
            if key not in allowed_fields:
                continue
            fields.append(f"{key} = ?")
            params.append((value or "").strip() if isinstance(value, str) else value)

        if not fields:
            return get_prelevement(uid)

        fields.append("updated_at = ?")
        params.append(_now_sql())
        params.append(uid)

        conn.execute(
            f"UPDATE prelevements SET {', '.join(fields)} WHERE id = ?",
            tuple(params),
        )
        conn.commit()

    return get_prelevement(uid)


@router.post("/prelevements")
def create_prelevement(payload: CreatePrelevementPayload) -> dict:
    raw_ids = sorted({int(value) for value in payload.raw_ids if value})
    if not raw_ids:
        raise HTTPException(400, "Aucune ligne brute sélectionnée")

    with _conn() as conn:
        raw_rows = _fetch_raw_rows(conn, raw_ids)
        if not raw_rows:
            raise HTTPException(404, "Lignes brutes introuvables")

        source_year = _extract_year_from_rows(raw_rows)
        demandes = [int(row["demande_id"]) for row in raw_rows if row["demande_id"] is not None]
        demande_id = demandes[0] if demandes else None
        date_prelevement = str(raw_rows[0]["date_intervention"] or "")
        first_obs = _parse_obs(str(raw_rows[0]["observations"] or ""))
        zone = str(first_obs.get("zone_intervention") or "")
        materiau = str(first_obs.get("nature_materiau") or "")
        finalite = str(first_obs.get("finalite_intervention") or "")
        technicien = str(raw_rows[0]["technicien"] or "")
        reference = _next_reference(conn, "prelevements", f"{source_year}-PRL-")

        cur = conn.execute(
            """
            INSERT INTO prelevements (
                reference, demande_id, source_year, date_prelevement, zone, materiau,
                technicien, finalite, notes, statut, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                reference,
                demande_id,
                source_year,
                date_prelevement,
                zone,
                materiau,
                technicien,
                finalite,
                payload.notes or "",
                "À trier",
                _now_sql(),
                _now_sql(),
            ),
        )
        prelevement_id = int(cur.lastrowid)

        placeholders = ",".join("?" for _ in raw_ids)
        conn.execute(
            f"UPDATE interventions SET nature_reelle = ?, prelevement_id = ?, intervention_reelle_id = NULL, tri_updated_at = ? WHERE id IN ({placeholders})",
            tuple([PRELEVEMENT_NATURE, prelevement_id, _now_sql(), *raw_ids]),
        )
        conn.commit()

        row = conn.execute("SELECT * FROM prelevements WHERE id = ?", (prelevement_id,)).fetchone()
    return {"uid": prelevement_id, "reference": row["reference"]}


@router.post("/prelevements/assign")
def assign_existing_prelevement(payload: BulkPrelevementAssignmentPayload) -> dict:
    raw_ids = sorted({int(value) for value in payload.raw_ids if value})
    if not raw_ids:
        return {"updated": 0}

    with _conn() as conn:
        prelevement = conn.execute("SELECT id, intervention_reelle_id FROM prelevements WHERE id = ?", (payload.prelevement_id,)).fetchone()
        if not prelevement:
            raise HTTPException(404, "Prélèvement introuvable")
        placeholders = ",".join("?" for _ in raw_ids)
        conn.execute(
            f"UPDATE interventions SET nature_reelle = ?, prelevement_id = ?, intervention_reelle_id = ?, tri_updated_at = ? WHERE id IN ({placeholders})",
            tuple([PRELEVEMENT_NATURE, payload.prelevement_id, prelevement["intervention_reelle_id"], _now_sql(), *raw_ids]),
        )
        conn.commit()
    return {"updated": len(raw_ids)}


@router.post("/prelevements/clear")
def clear_prelevement(payload: BulkRawIdsPayload) -> dict:
    raw_ids = sorted({int(value) for value in payload.raw_ids if value})
    if not raw_ids:
        return {"updated": 0}

    with _conn() as conn:
        placeholders = ",".join("?" for _ in raw_ids)
        conn.execute(
            f"UPDATE interventions SET prelevement_id = NULL, intervention_reelle_id = NULL, tri_updated_at = ? WHERE id IN ({placeholders})",
            tuple([_now_sql(), *raw_ids]),
        )
        conn.commit()
    return {"updated": len(raw_ids)}


@router.get("/interventions-reelles")
def list_interventions_reelles(year: Optional[str] = Query(None)) -> list[dict]:
    normalized_year = _normalize_year(year)
    with _conn() as conn:
        sql = """
            SELECT
                ir.*, 
                d.reference AS demande_reference,
                (
                    SELECT COUNT(*)
                    FROM interventions i
                    WHERE i.intervention_reelle_id = ir.id
                ) AS raw_count,
                (
                    SELECT COUNT(*)
                    FROM prelevements p
                    WHERE p.intervention_reelle_id = ir.id
                ) AS prelevement_count
            FROM interventions_reelles ir
            LEFT JOIN demandes d ON d.id = ir.demande_id
            WHERE 1 = 1
        """
        params: list[object] = []
        if normalized_year:
            sql += " AND COALESCE(CAST(ir.source_year AS TEXT), '') = ?"
            params.append(normalized_year)
        sql += " ORDER BY ir.reference"
        rows = conn.execute(sql, tuple(params)).fetchall()
    return [
        {
            "uid": int(row["id"]),
            "reference": row["reference"],
            "demande_id": row["demande_id"],
            "demande_reference": row["demande_reference"] or "",
            "date_intervention": row["date_intervention"],
            "type_intervention": row["type_intervention"],
            "zone": row["zone"],
            "technicien": row["technicien"],
            "finalite": row["finalite"],
            "notes": row["notes"],
            "statut": row["statut"],
            "raw_count": int(row["raw_count"] or 0),
            "prelevement_count": int(row["prelevement_count"] or 0),
        }
        for row in rows
    ]


@router.post("/interventions-reelles")
def create_intervention_reelle(payload: CreateInterventionReellePayload) -> dict:
    raw_ids = sorted({int(value) for value in payload.raw_ids if value})
    prelevement_ids = sorted({int(value) for value in payload.prelevement_ids if value})
    if not raw_ids and not prelevement_ids:
        raise HTTPException(400, "Aucune source sélectionnée")

    with _conn() as conn:
        raw_rows = _fetch_raw_rows(conn, raw_ids)
        prelevement_rows = []
        if prelevement_ids:
            placeholders = ",".join("?" for _ in prelevement_ids)
            prelevement_rows = conn.execute(
                f"SELECT * FROM prelevements WHERE id IN ({placeholders}) ORDER BY id",
                tuple(prelevement_ids),
            ).fetchall()

        source_year = _extract_year_from_rows(raw_rows) if raw_rows else datetime.now().year
        if not raw_rows and prelevement_rows:
            try:
                source_year = int(prelevement_rows[0]["source_year"] or datetime.now().year)
            except Exception:
                source_year = datetime.now().year

        demande_id = None
        date_intervention = ""
        zone = ""
        technicien = ""
        finalite = ""
        type_intervention = ""

        if raw_rows:
            demande_id = raw_rows[0]["demande_id"]
            date_intervention = str(raw_rows[0]["date_intervention"] or "")
            technicien = str(raw_rows[0]["technicien"] or "")
            type_intervention = str(raw_rows[0]["type_intervention"] or "")
            obs = _parse_obs(str(raw_rows[0]["observations"] or ""))
            zone = str(obs.get("zone_intervention") or "")
            finalite = str(obs.get("finalite_intervention") or "")
        elif prelevement_rows:
            demande_id = prelevement_rows[0]["demande_id"]
            date_intervention = str(prelevement_rows[0]["date_prelevement"] or "")
            technicien = str(prelevement_rows[0]["technicien"] or "")
            zone = str(prelevement_rows[0]["zone"] or "")
            finalite = str(prelevement_rows[0]["finalite"] or "")
            type_intervention = "Intervention terrain"

        reference = _next_reference(conn, "interventions_reelles", f"{source_year}-INT-")
        cur = conn.execute(
            """
            INSERT INTO interventions_reelles (
                reference, demande_id, source_year, date_intervention, type_intervention,
                zone, technicien, finalite, notes, statut, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                reference,
                demande_id,
                source_year,
                date_intervention,
                type_intervention,
                zone,
                technicien,
                finalite,
                payload.notes or "",
                "À trier",
                _now_sql(),
                _now_sql(),
            ),
        )
        intervention_reelle_id = int(cur.lastrowid)

        if raw_ids:
            placeholders = ",".join("?" for _ in raw_ids)
            conn.execute(
                f"UPDATE interventions SET intervention_reelle_id = ?, tri_updated_at = ? WHERE id IN ({placeholders})",
                tuple([intervention_reelle_id, _now_sql(), *raw_ids]),
            )
        if prelevement_ids:
            placeholders = ",".join("?" for _ in prelevement_ids)
            conn.execute(
                f"UPDATE prelevements SET intervention_reelle_id = ?, updated_at = ? WHERE id IN ({placeholders})",
                tuple([intervention_reelle_id, _now_sql(), *prelevement_ids]),
            )
            conn.execute(
                f"UPDATE interventions SET intervention_reelle_id = ?, tri_updated_at = ? WHERE prelevement_id IN ({placeholders})",
                tuple([intervention_reelle_id, _now_sql(), *prelevement_ids]),
            )

        conn.commit()

        row = conn.execute("SELECT * FROM interventions_reelles WHERE id = ?", (intervention_reelle_id,)).fetchone()
    return {"uid": intervention_reelle_id, "reference": row["reference"]}


@router.post("/interventions-reelles/assign")
def assign_existing_intervention_reelle(payload: BulkInterventionAssignmentPayload) -> dict:
    raw_ids = sorted({int(value) for value in payload.raw_ids if value})
    if not raw_ids:
        return {"updated": 0}

    with _conn() as conn:
        target = conn.execute("SELECT id FROM interventions_reelles WHERE id = ?", (payload.intervention_reelle_id,)).fetchone()
        if not target:
            raise HTTPException(404, "Intervention réelle introuvable")

        rows = _fetch_raw_rows(conn, raw_ids)
        prelevement_ids: list[int] = []
        direct_ids: list[int] = []
        for row in rows:
            prelevement_id = row["prelevement_id"]
            if prelevement_id:
                prelevement_ids.append(int(prelevement_id))
            else:
                direct_ids.append(int(row["id"]))

        if direct_ids:
            placeholders = ",".join("?" for _ in direct_ids)
            conn.execute(
                f"UPDATE interventions SET intervention_reelle_id = ?, tri_updated_at = ? WHERE id IN ({placeholders})",
                tuple([payload.intervention_reelle_id, _now_sql(), *direct_ids]),
            )
        if prelevement_ids:
            unique_prelevement_ids = sorted(set(prelevement_ids))
            placeholders = ",".join("?" for _ in unique_prelevement_ids)
            conn.execute(
                f"UPDATE prelevements SET intervention_reelle_id = ?, updated_at = ? WHERE id IN ({placeholders})",
                tuple([payload.intervention_reelle_id, _now_sql(), *unique_prelevement_ids]),
            )
            conn.execute(
                f"UPDATE interventions SET intervention_reelle_id = ?, tri_updated_at = ? WHERE prelevement_id IN ({placeholders})",
                tuple([payload.intervention_reelle_id, _now_sql(), *unique_prelevement_ids]),
            )

        conn.commit()
    return {"updated": len(raw_ids)}


@router.post("/interventions-reelles/clear")
def clear_intervention_reelle(payload: BulkRawIdsPayload) -> dict:
    raw_ids = sorted({int(value) for value in payload.raw_ids if value})
    if not raw_ids:
        return {"updated": 0}

    with _conn() as conn:
        rows = _fetch_raw_rows(conn, raw_ids)
        direct_ids: list[int] = []
        prelevement_ids: list[int] = []
        for row in rows:
            if row["prelevement_id"]:
                prelevement_ids.append(int(row["prelevement_id"]))
            else:
                direct_ids.append(int(row["id"]))

        if direct_ids:
            placeholders = ",".join("?" for _ in direct_ids)
            conn.execute(
                f"UPDATE interventions SET intervention_reelle_id = NULL, tri_updated_at = ? WHERE id IN ({placeholders})",
                tuple([_now_sql(), *direct_ids]),
            )
        if prelevement_ids:
            unique_prelevement_ids = sorted(set(prelevement_ids))
            placeholders = ",".join("?" for _ in unique_prelevement_ids)
            conn.execute(
                f"UPDATE prelevements SET intervention_reelle_id = NULL, updated_at = ? WHERE id IN ({placeholders})",
                tuple([_now_sql(), *unique_prelevement_ids]),
            )
            conn.execute(
                f"UPDATE interventions SET intervention_reelle_id = NULL, tri_updated_at = ? WHERE prelevement_id IN ({placeholders})",
                tuple([_now_sql(), *unique_prelevement_ids]),
            )

        conn.commit()
    return {"updated": len(raw_ids)}


@router.get("/candidates")
def list_intervention_creation_candidates(year: Optional[str] = Query(None)) -> list[dict]:
    normalized_year = _normalize_year(year)
    with _conn() as conn:
        sql = "SELECT * FROM vw_intervention_creation_candidates WHERE 1 = 1"
        params: list[object] = []
        if normalized_year:
            sql += " AND substr(COALESCE(candidate_date, ''), 1, 4) = ?"
            params.append(normalized_year)
        sql += " ORDER BY candidate_type, reference"
        rows = conn.execute(sql, tuple(params)).fetchall()
    return [dict(row) for row in rows]
