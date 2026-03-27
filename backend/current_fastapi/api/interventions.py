"""
api/interventions.py — RaLab4
GET    /api/interventions?demande_id=X
GET    /api/interventions/{uid}
POST   /api/interventions
PUT    /api/interventions/{uid}
DELETE /api/interventions/{uid}
"""
from __future__ import annotations
import re, sqlite3
from datetime import date, datetime
from typing import Optional
from app.core.database import get_db_path
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter()
DB_PATH = get_db_path()

TYPES = ["Visite de contrôle","Auscultation","Levé topographique","Prélèvement",
         "Inspection géotechnique","Essai in situ","Réunion de chantier","Autre"]
STATUTS = ["Planifiée","En cours","Réalisée","Annulée"]
ALERTES = ["Aucun","Faible","Moyen","Élevé","Critique"]


class InterventionCreate(BaseModel):
    demande_id:        int
    type_intervention: str             = Field("Visite de contrôle")
    sujet:             str             = Field("")
    date_intervention: date            = Field(default_factory=date.today)
    duree_heures:      Optional[float] = Field(None)
    geotechnicien:     str             = Field("")
    technicien:        str             = Field("")
    observations:      str             = Field("")
    anomalie_detectee: bool            = Field(False)
    niveau_alerte:     str             = Field("Aucun")
    pv_ref:            str             = Field("")
    rapport_ref:       str             = Field("")
    photos_dossier:    str             = Field("")
    statut:            str             = Field("Planifiée")


class InterventionUpdate(BaseModel):
    type_intervention: Optional[str]   = None
    sujet:             Optional[str]   = None
    date_intervention: Optional[date]  = None
    duree_heures:      Optional[float] = None
    geotechnicien:     Optional[str]   = None
    technicien:        Optional[str]   = None
    observations:      Optional[str]   = None
    anomalie_detectee: Optional[bool]  = None
    niveau_alerte:     Optional[str]   = None
    pv_ref:            Optional[str]   = None
    rapport_ref:       Optional[str]   = None
    photos_dossier:    Optional[str]   = None
    statut:            Optional[str]   = None


def _conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _enabled_module_codes(conn: sqlite3.Connection, demande_id: int) -> set[str]:
    rows = conn.execute(
        "SELECT module_code FROM demande_enabled_modules WHERE demande_id = ? AND is_enabled = 1",
        (demande_id,),
    ).fetchall()
    return {str(row["module_code"]) for row in rows}


def _interventions_enabled(conn: sqlite3.Connection, demande_id: int) -> bool:
    return "interventions" in _enabled_module_codes(conn, demande_id)


def _require_interventions_enabled(conn: sqlite3.Connection, demande_id: int):
    if not _interventions_enabled(conn, demande_id):
        raise HTTPException(403, "Le module Interventions terrain n'est pas activé sur cette demande")


def _demande_id_for_intervention(conn: sqlite3.Connection, uid: int) -> Optional[int]:
    row = conn.execute("SELECT demande_id FROM interventions WHERE id = ?", (uid,)).fetchone()
    return int(row["demande_id"]) if row else None


def _next_ref(conn, demande_id: int) -> tuple[str, int, str, int]:
    row = conn.execute("""
        SELECT d.annee, d.labo_code FROM demandes d WHERE d.id = ?
    """, (demande_id,)).fetchone()
    annee = row["annee"] if row else datetime.now().year
    labo = row["labo_code"] if row else "SP"
    prefix = f"{annee}-{labo}-I"
    rows = conn.execute("SELECT reference FROM interventions WHERE reference LIKE ?", (f"{prefix}%",)).fetchall()
    nums = []
    for row in rows:
        match = re.match(rf"^{re.escape(prefix)}(\d+)$", row[0])
        if match:
            nums.append(int(match.group(1)))
    number = max(nums, default=0) + 1
    return f"{prefix}{number:04d}", annee, labo, number


def _row_to_dict(row) -> dict:
    data = dict(row)
    data["uid"] = data.pop("id")
    return data


@router.get("")
def list_interventions(
    demande_id: Optional[int] = Query(None),
    statut: Optional[str] = Query(None),
):
    with _conn() as conn:
        if demande_id and not _interventions_enabled(conn, demande_id):
            return []
        sql = """
            SELECT i.*, d.reference AS demande_ref
            FROM interventions i
            JOIN demandes d ON d.id = i.demande_id
            WHERE 1=1
        """
        params = []
        if demande_id:
            sql += " AND i.demande_id = ?"
            params.append(demande_id)
        if statut:
            sql += " AND i.statut = ?"
            params.append(statut)
        sql += " ORDER BY i.date_intervention DESC, i.id DESC"
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(row) for row in rows]


@router.get("/meta")
def meta():
    return {"types": TYPES, "statuts": STATUTS, "alertes": ALERTES}


@router.get("/{uid}")
def get_intervention(uid: int):
    with _conn() as conn:
        row = conn.execute(
            """
            SELECT i.*, d.reference AS demande_ref
            FROM interventions i JOIN demandes d ON d.id = i.demande_id
            WHERE i.id = ?
            """,
            (uid,),
        ).fetchone()
        if not row:
            raise HTTPException(404, f"Intervention #{uid} introuvable")
        _require_interventions_enabled(conn, int(row["demande_id"]))
    return _row_to_dict(row)


@router.post("", status_code=201)
def create_intervention(body: InterventionCreate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _conn() as conn:
        _require_interventions_enabled(conn, body.demande_id)
        ref, annee, labo, numero = _next_ref(conn, body.demande_id)
        conn.execute(
            """
            INSERT INTO interventions
            (reference,annee,labo_code,numero,demande_id,
             type_intervention,sujet,date_intervention,duree_heures,
             geotechnicien,technicien,observations,
             anomalie_detectee,niveau_alerte,pv_ref,rapport_ref,photos_dossier,
             statut,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                ref, annee, labo, numero, body.demande_id,
                body.type_intervention, body.sujet,
                body.date_intervention.isoformat(), body.duree_heures,
                body.geotechnicien, body.technicien, body.observations,
                1 if body.anomalie_detectee else 0, body.niveau_alerte,
                body.pv_ref, body.rapport_ref, body.photos_dossier,
                body.statut, now, now,
            ),
        )
        uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    return get_intervention(int(uid))


@router.put("/{uid}")
def update_intervention(uid: int, body: InterventionUpdate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    fields = {key: value for key, value in body.model_dump().items() if value is not None}
    if "date_intervention" in fields and isinstance(fields["date_intervention"], date):
        fields["date_intervention"] = fields["date_intervention"].isoformat()
    if "anomalie_detectee" in fields:
        fields["anomalie_detectee"] = 1 if fields["anomalie_detectee"] else 0
    fields["updated_at"] = now
    clause = ", ".join(f"{key} = ?" for key in fields)
    with _conn() as conn:
        demande_id = _demande_id_for_intervention(conn, uid)
        if demande_id is None:
            raise HTTPException(404, f"Intervention #{uid} introuvable")
        _require_interventions_enabled(conn, demande_id)
        conn.execute(f"UPDATE interventions SET {clause} WHERE id = ?", list(fields.values()) + [uid])
    return get_intervention(uid)


@router.delete("/{uid}", status_code=204)
def delete_intervention(uid: int):
    with _conn() as conn:
        demande_id = _demande_id_for_intervention(conn, uid)
        if demande_id is None:
            raise HTTPException(404, f"Intervention #{uid} introuvable")
        _require_interventions_enabled(conn, demande_id)
        cur = conn.execute("DELETE FROM interventions WHERE id = ?", (uid,))
    if not cur.rowcount:
        raise HTTPException(404, f"Intervention #{uid} introuvable")
