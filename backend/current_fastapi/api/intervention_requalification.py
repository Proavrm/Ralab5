"""
api/intervention_requalification.py
Compatibilité API pour la chaîne interventions -> prélèvements -> échantillons.
La structure cible n'utilise plus `interventions_reelles`.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.database import ensure_ralab4_schema, get_db_path

router = APIRouter()
DB_PATH = get_db_path()


class RawInterventionPatch(BaseModel):
    nature_reelle: Optional[str] = None
    prelevement_id: Optional[int] = None
    tri_comment: Optional[str] = None


class BulkNaturePayload(BaseModel):
    raw_ids: list[int] = Field(default_factory=list)
    nature_reelle: str


class BulkPrelevementAssignmentPayload(BaseModel):
    raw_ids: list[int] = Field(default_factory=list)
    prelevement_id: int


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


def _conn() -> sqlite3.Connection:
    ensure_ralab4_schema(DB_PATH)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _now_sql() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _next_prelevement_reference(conn: sqlite3.Connection, demande_id: int) -> str:
    row = conn.execute("SELECT annee, labo_code FROM demandes WHERE id = ?", (demande_id,)).fetchone()
    annee = row["annee"] if row else datetime.now().year
    labo = row["labo_code"] if row else "SP"
    prefix = f"{annee}-{labo}-P"
    rows = conn.execute("SELECT reference FROM prelevements WHERE reference LIKE ?", (f"{prefix}%",)).fetchall()
    numbers = []
    for row in rows:
        ref = str(row["reference"] or "")
        if ref.startswith(prefix):
            suffix = ref[len(prefix):]
            if suffix.isdigit():
                numbers.append(int(suffix))
    return f"{prefix}{max(numbers, default=0) + 1:04d}"


def _prelevement_select_sql(where_clause: str = "WHERE 1=1") -> str:
    return f"""
        SELECT
            p.*,
            d.reference AS demande_reference,
            d.labo_code AS labo_code,
            a.reference AS affaire_reference,
            a.chantier AS chantier,
            a.site AS site,
            i.reference AS intervention_reference,
            COALESCE(ech_stats.echantillon_count, 0) AS echantillon_count,
            COALESCE(ech_stats.last_reception_labo, '') AS last_reception_labo,
            COALESCE(essai_stats.essai_count, 0) AS essai_count
        FROM prelevements p
        LEFT JOIN demandes d ON d.id = p.demande_id
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        LEFT JOIN interventions i ON i.id = p.intervention_id
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
        {where_clause}
    """


def _prelevement_row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "uid": int(row["id"]),
        "reference": row["reference"],
        "demande_id": row["demande_id"],
        "demande_reference": row["demande_reference"] or "",
        "labo_code": row["labo_code"] or "",
        "affaire_reference": row["affaire_reference"] or "",
        "chantier": row["chantier"] or "",
        "site": row["site"] or "",
        "intervention_id": row["intervention_id"],
        "intervention_reference": row["intervention_reference"] or "",
        "intervention_reelle_id": row["intervention_id"],
        "intervention_reelle_reference": row["intervention_reference"] or "",
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
        "echantillon_count": int(row["echantillon_count"] or 0),
        "essai_count": int(row["essai_count"] or 0),
    }


def _linked_echantillons(conn: sqlite3.Connection, prelevement_id: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT
            ech.id,
            ech.reference,
            ech.designation,
            ech.localisation,
            ech.statut,
            COALESCE((SELECT COUNT(*) FROM essais es WHERE es.echantillon_id = ech.id), 0) AS essai_count
        FROM echantillons ech
        WHERE ech.prelevement_id = ?
        ORDER BY ech.id DESC
        """,
        (prelevement_id,),
    ).fetchall()
    return [
        {
            "uid": int(row["id"]),
            "reference": row["reference"] or "",
            "designation": row["designation"] or "",
            "localisation": row["localisation"] or "",
            "statut": row["statut"] or "",
            "essai_count": int(row["essai_count"] or 0),
        }
        for row in rows
    ]


@router.get("/raw")
def list_raw_interventions(year: Optional[str] = Query(None)) -> list[dict]:
    sql = "SELECT * FROM interventions WHERE 1=1"
    params: list[object] = []
    normalized_year = str(year or "").strip()
    if normalized_year:
        sql += " AND (substr(COALESCE(date_intervention, ''), 1, 4) = ? OR substr(COALESCE(reference, ''), 1, 4) = ?)"
        params.extend([normalized_year, normalized_year])
    sql += " ORDER BY COALESCE(date_intervention, '') DESC, reference DESC"
    with _conn() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
    return [
        {
            "uid": int(row["id"]),
            "reference": row["reference"] or "",
            "demande_id": row["demande_id"],
            "date_intervention": row["date_intervention"] or "",
            "type_intervention": row["type_intervention"] or "",
            "zone": row["zone"] or "",
            "technicien": row["technicien"] or "",
            "finalite": row["finalite"] or "",
            "statut": row["statut"] or "",
            "nature_reelle": row["nature_reelle"] or "",
            "prelevement_id": row["prelevement_id"],
            "tri_comment": row["tri_comment"] or "",
        }
        for row in rows
    ]


@router.patch("/raw/{uid}")
def patch_raw_intervention(uid: int, payload: RawInterventionPatch) -> dict:
    fields = {key: value for key, value in payload.model_dump(exclude_unset=True).items() if value is not None}
    if not fields:
        with _conn() as conn:
            row = conn.execute("SELECT * FROM interventions WHERE id = ?", (uid,)).fetchone()
            if not row:
                raise HTTPException(404, "Intervention introuvable")
            return {"uid": int(row["id"]), "reference": row["reference"] or ""}

    fields["tri_updated_at"] = _now_sql()
    clause = ", ".join(f"{key} = ?" for key in fields)
    with _conn() as conn:
        cur = conn.execute(f"UPDATE interventions SET {clause} WHERE id = ?", list(fields.values()) + [uid])
        if not cur.rowcount:
            raise HTTPException(404, "Intervention introuvable")
        row = conn.execute("SELECT * FROM interventions WHERE id = ?", (uid,)).fetchone()
    return {"uid": int(row["id"]), "reference": row["reference"] or "", "prelevement_id": row["prelevement_id"]}


@router.post("/raw/bulk-nature")
def bulk_nature(payload: BulkNaturePayload) -> dict:
    raw_ids = sorted({int(value) for value in payload.raw_ids if value})
    if not raw_ids:
        return {"updated": 0}
    placeholders = ",".join("?" for _ in raw_ids)
    with _conn() as conn:
        conn.execute(
            f"UPDATE interventions SET nature_reelle = ?, tri_updated_at = ? WHERE id IN ({placeholders})",
            [payload.nature_reelle, _now_sql(), *raw_ids],
        )
    return {"updated": len(raw_ids)}


@router.get("/prelevements")
def list_prelevements(
    demande_id: Optional[int] = Query(None),
    intervention_reelle_id: Optional[int] = Query(None),
    intervention_id: Optional[int] = Query(None),
    statut: Optional[str] = Query(None),
) -> list[dict]:
    where = "WHERE 1=1"
    params: list[object] = []
    linked_intervention_id = intervention_id or intervention_reelle_id
    if demande_id:
        where += " AND p.demande_id = ?"
        params.append(demande_id)
    if linked_intervention_id:
        where += " AND p.intervention_id = ?"
        params.append(linked_intervention_id)
    if statut:
        where += " AND p.statut = ?"
        params.append(statut)
    sql = _prelevement_select_sql(where) + " ORDER BY COALESCE(p.date_prelevement, '') DESC, p.id DESC"
    with _conn() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
    return [_prelevement_row_to_dict(row) for row in rows]


@router.get("/prelevements/{uid}")
def get_prelevement(uid: int) -> dict:
    with _conn() as conn:
        row = conn.execute(_prelevement_select_sql("WHERE p.id = ?"), (uid,)).fetchone()
        if not row:
            raise HTTPException(404, "Prélèvement introuvable")
        data = _prelevement_row_to_dict(row)
        data["echantillons"] = _linked_echantillons(conn, uid)
    return data


@router.patch("/prelevements/{uid}")
def update_prelevement(uid: int, payload: UpdatePrelevementPayload) -> dict:
    fields = {key: value for key, value in payload.model_dump(exclude_unset=True).items() if value is not None}
    if not fields:
        return get_prelevement(uid)
    fields["updated_at"] = _now_sql()
    clause = ", ".join(f"{key} = ?" for key in fields)
    with _conn() as conn:
        cur = conn.execute(f"UPDATE prelevements SET {clause} WHERE id = ?", list(fields.values()) + [uid])
        if not cur.rowcount:
            raise HTTPException(404, "Prélèvement introuvable")
    return get_prelevement(uid)


@router.post("/prelevements", status_code=201)
def create_prelevement(payload: CreatePrelevementPayload) -> dict:
    raw_ids = [int(value) for value in payload.raw_ids if value]
    if not raw_ids:
        raise HTTPException(400, "Aucune intervention source fournie")
    with _conn() as conn:
        first = conn.execute(
            "SELECT * FROM interventions WHERE id = ?",
            (raw_ids[0],),
        ).fetchone()
        if not first:
            raise HTTPException(404, "Intervention source introuvable")
        demande_id = int(first["demande_id"]) if first["demande_id"] is not None else None
        reference = _next_prelevement_reference(conn, demande_id or 0)
        now = _now_sql()
        conn.execute(
            """
            INSERT INTO prelevements (
                reference, demande_id, intervention_id, source_year, date_prelevement,
                zone, materiau, technicien, finalite, notes, statut,
                description, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                reference,
                demande_id,
                int(first["id"]),
                int(str(first["date_intervention"] or "")[:4]) if str(first["date_intervention"] or "")[:4].isdigit() else None,
                first["date_intervention"] or "",
                first["zone"] or "",
                "",
                first["technicien"] or "",
                first["finalite"] or "",
                payload.notes or "",
                "À trier",
                first["sujet"] or "",
                now,
                now,
            ),
        )
        prelevement_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        placeholders = ",".join("?" for _ in raw_ids)
        conn.execute(
            f"UPDATE interventions SET prelevement_id = ?, tri_updated_at = ? WHERE id IN ({placeholders})",
            [prelevement_id, now, *raw_ids],
        )
    return get_prelevement(int(prelevement_id))


@router.post("/prelevements/assign")
def assign_prelevement(payload: BulkPrelevementAssignmentPayload) -> dict:
    raw_ids = sorted({int(value) for value in payload.raw_ids if value})
    if not raw_ids:
        return {"updated": 0}
    placeholders = ",".join("?" for _ in raw_ids)
    with _conn() as conn:
        conn.execute(
            f"UPDATE interventions SET prelevement_id = ?, tri_updated_at = ? WHERE id IN ({placeholders})",
            [payload.prelevement_id, _now_sql(), *raw_ids],
        )
    return {"updated": len(raw_ids)}


@router.post("/prelevements/clear")
def clear_prelevement(payload: BulkRawIdsPayload) -> dict:
    raw_ids = sorted({int(value) for value in payload.raw_ids if value})
    if not raw_ids:
        return {"updated": 0}
    placeholders = ",".join("?" for _ in raw_ids)
    with _conn() as conn:
        conn.execute(
            f"UPDATE interventions SET prelevement_id = NULL, tri_updated_at = ? WHERE id IN ({placeholders})",
            [_now_sql(), *raw_ids],
        )
    return {"updated": len(raw_ids)}


@router.get("/interventions-reelles")
def list_interventions_reelles() -> list[dict]:
    return []


@router.post("/interventions-reelles")
def create_intervention_reelle() -> dict:
    raise HTTPException(410, "Le modèle `interventions_reelles` n'est plus utilisé")


@router.post("/interventions-reelles/assign")
def assign_intervention_reelle() -> dict:
    raise HTTPException(410, "Le modèle `interventions_reelles` n'est plus utilisé")


@router.post("/interventions-reelles/clear")
def clear_intervention_reelle() -> dict:
    raise HTTPException(410, "Le modèle `interventions_reelles` n'est plus utilisé")


@router.get("/candidates")
def candidates() -> list[dict]:
    return []
