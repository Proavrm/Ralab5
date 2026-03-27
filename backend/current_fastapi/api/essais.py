"""
api/essais.py — RaLab4
Gestion des échantillons + essais laboratoire

GET    /api/essais/echantillons?demande_id=X
GET    /api/essais/echantillons/{uid}
POST   /api/essais/echantillons
PUT    /api/essais/echantillons/{uid}
DELETE /api/essais/echantillons/{uid}

GET    /api/essais?echantillon_id=X
GET    /api/essais/{uid}
POST   /api/essais
PUT    /api/essais/{uid}
DELETE /api/essais/{uid}
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

STATUTS_ECH = ["Reçu", "En attente", "En cours", "Terminé", "Rejeté"]
TYPES_ESSAI = [
    "Teneur en eau", "Granulométrie", "Limites d'Atterberg", "Proctor",
    "CBR", "Compression simple", "Triaxial", "Cisaillement direct",
    "Perméabilité", "Consolidation", "Oedométrique", "Autre",
]
STATUTS_ESSAI = ["Programmé", "En cours", "Terminé", "Annulé"]


class EchantillonCreate(BaseModel):
    demande_id: int
    designation: str = Field("")
    profondeur_haut: Optional[float] = Field(None)
    profondeur_bas: Optional[float] = Field(None)
    date_prelevement: Optional[date] = Field(None)
    localisation: str = Field("")
    statut: str = Field("Reçu")
    date_reception_labo: Optional[date] = Field(None)
    observations: str = Field("")


class EchantillonUpdate(BaseModel):
    designation: Optional[str] = None
    profondeur_haut: Optional[float] = None
    profondeur_bas: Optional[float] = None
    date_prelevement: Optional[date] = None
    localisation: Optional[str] = None
    statut: Optional[str] = None
    date_reception_labo: Optional[date] = None
    observations: Optional[str] = None


class EssaiCreate(BaseModel):
    echantillon_id: int
    type_essai: str = Field("")
    norme: str = Field("")
    statut: str = Field("Programmé")
    date_debut: Optional[date] = Field(None)
    date_fin: Optional[date] = Field(None)
    resultats: str = Field("{}")
    operateur: str = Field("")
    observations: str = Field("")


class EssaiUpdate(BaseModel):
    type_essai: Optional[str] = None
    norme: Optional[str] = None
    statut: Optional[str] = None
    date_debut: Optional[date] = None
    date_fin: Optional[date] = None
    resultats: Optional[str] = None
    operateur: Optional[str] = None
    observations: Optional[str] = None


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


def _echantillons_enabled(conn: sqlite3.Connection, demande_id: int) -> bool:
    enabled_codes = _enabled_module_codes(conn, demande_id)
    return any(code in enabled_codes for code in ("echantillons", "essais_laboratoire"))


def _essais_enabled(conn: sqlite3.Connection, demande_id: int) -> bool:
    return "essais_laboratoire" in _enabled_module_codes(conn, demande_id)


def _require_echantillons_enabled(conn: sqlite3.Connection, demande_id: int):
    if not _echantillons_enabled(conn, demande_id):
        raise HTTPException(403, "Le module laboratoire / échantillons n'est pas activé sur cette demande")


def _require_essais_enabled(conn: sqlite3.Connection, demande_id: int):
    if not _essais_enabled(conn, demande_id):
        raise HTTPException(403, "Le module Essais laboratoire n'est pas activé sur cette demande")


def _demande_id_for_echantillon(conn: sqlite3.Connection, uid: int) -> Optional[int]:
    row = conn.execute("SELECT demande_id FROM echantillons WHERE id = ?", (uid,)).fetchone()
    return int(row["demande_id"]) if row else None


def _demande_id_for_essai(conn: sqlite3.Connection, uid: int) -> Optional[int]:
    row = conn.execute(
        """
        SELECT ech.demande_id
        FROM essais e
        JOIN echantillons ech ON ech.id = e.echantillon_id
        WHERE e.id = ?
        """,
        (uid,),
    ).fetchone()
    return int(row["demande_id"]) if row else None


def _demande_id_from_echantillon_id(conn: sqlite3.Connection, echantillon_id: int) -> Optional[int]:
    return _demande_id_for_echantillon(conn, echantillon_id)


def _next_ech_ref(conn, demande_id: int) -> tuple[str, int, str, int]:
    row = conn.execute("SELECT annee, labo_code FROM demandes WHERE id = ?", (demande_id,)).fetchone()
    annee = row["annee"] if row else datetime.now().year
    labo = row["labo_code"] if row else "SP"
    prefix = f"{annee}-{labo}-E"
    rows = conn.execute("SELECT reference FROM echantillons WHERE reference LIKE ?", (f"{prefix}%",)).fetchall()
    nums = []
    for row in rows:
        match = re.match(rf"^{re.escape(prefix)}(\d+)$", row[0])
        if match:
            nums.append(int(match.group(1)))
    number = max(nums, default=0) + 1
    return f"{prefix}{number:04d}", annee, labo, number


def _row(row) -> dict:
    data = dict(row)
    data["uid"] = data.pop("id")
    return data


def _fmt(value):
    if value is None:
        return None
    if isinstance(value, date):
        return value.isoformat()
    return value


@router.get("/echantillons")
def list_echantillons(demande_id: Optional[int] = Query(None)):
    sql = "SELECT * FROM echantillons WHERE 1=1"
    params = []
    with _conn() as conn:
        if demande_id and not _echantillons_enabled(conn, demande_id):
            return []
        if demande_id:
            sql += " AND demande_id = ?"
            params.append(demande_id)
        sql += " ORDER BY id ASC"
        rows = conn.execute(sql, params).fetchall()
    return [_row(row) for row in rows]


@router.get("/echantillons/{uid}")
def get_echantillon(uid: int):
    with _conn() as conn:
        row = conn.execute("SELECT * FROM echantillons WHERE id = ?", (uid,)).fetchone()
        if not row:
            raise HTTPException(404, f"Échantillon #{uid} introuvable")
        _require_echantillons_enabled(conn, int(row["demande_id"]))
    return _row(row)


@router.post("/echantillons", status_code=201)
def create_echantillon(body: EchantillonCreate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _conn() as conn:
        _require_echantillons_enabled(conn, body.demande_id)
        ref, annee, labo, numero = _next_ech_ref(conn, body.demande_id)
        conn.execute(
            """
            INSERT INTO echantillons
            (reference,annee,labo_code,numero,demande_id,
             designation,profondeur_haut,profondeur_bas,date_prelevement,
             localisation,statut,date_reception_labo,observations,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                ref, annee, labo, numero, body.demande_id,
                body.designation, body.profondeur_haut, body.profondeur_bas,
                _fmt(body.date_prelevement), body.localisation, body.statut,
                _fmt(body.date_reception_labo), body.observations, now, now,
            ),
        )
        uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    return get_echantillon(int(uid))


@router.put("/echantillons/{uid}")
def update_echantillon(uid: int, body: EchantillonUpdate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    fields = {key: value for key, value in body.model_dump().items() if value is not None}
    for key in ("date_prelevement", "date_reception_labo"):
        if key in fields and isinstance(fields[key], date):
            fields[key] = fields[key].isoformat()
    fields["updated_at"] = now
    clause = ", ".join(f"{key} = ?" for key in fields)
    with _conn() as conn:
        demande_id = _demande_id_for_echantillon(conn, uid)
        if demande_id is None:
            raise HTTPException(404, f"Échantillon #{uid} introuvable")
        _require_echantillons_enabled(conn, demande_id)
        conn.execute(f"UPDATE echantillons SET {clause} WHERE id = ?", list(fields.values()) + [uid])
    return get_echantillon(uid)


@router.delete("/echantillons/{uid}", status_code=204)
def delete_echantillon(uid: int):
    with _conn() as conn:
        demande_id = _demande_id_for_echantillon(conn, uid)
        if demande_id is None:
            raise HTTPException(404, f"Échantillon #{uid} introuvable")
        _require_echantillons_enabled(conn, demande_id)
        cur = conn.execute("DELETE FROM echantillons WHERE id = ?", (uid,))
    if not cur.rowcount:
        raise HTTPException(404, f"Échantillon #{uid} introuvable")


@router.get("/meta")
def meta():
    return {"types_essai": TYPES_ESSAI, "statuts_ech": STATUTS_ECH, "statuts_essai": STATUTS_ESSAI}


@router.get("")
def list_essais(echantillon_id: Optional[int] = Query(None)):
    sql = """
        SELECT e.*, ech.reference AS ech_ref, ech.designation
        FROM essais e JOIN echantillons ech ON ech.id = e.echantillon_id
        WHERE 1=1
    """
    params = []
    with _conn() as conn:
        if echantillon_id:
            demande_id = _demande_id_from_echantillon_id(conn, echantillon_id)
            if demande_id is not None and not _essais_enabled(conn, demande_id):
                return []
            sql += " AND e.echantillon_id = ?"
            params.append(echantillon_id)
        sql += " ORDER BY e.id ASC"
        rows = conn.execute(sql, params).fetchall()
    return [_row(row) for row in rows]


@router.get("/{uid}")
def get_essai(uid: int):
    with _conn() as conn:
        row = conn.execute(
            """
            SELECT e.*, ech.reference AS ech_ref, ech.designation
            FROM essais e JOIN echantillons ech ON ech.id = e.echantillon_id
            WHERE e.id = ?
            """,
            (uid,),
        ).fetchone()
        if not row:
            raise HTTPException(404, f"Essai #{uid} introuvable")
        demande_id = _demande_id_for_essai(conn, uid)
        if demande_id is None:
            raise HTTPException(404, f"Essai #{uid} introuvable")
        _require_essais_enabled(conn, demande_id)
    return _row(row)


@router.post("", status_code=201)
def create_essai(body: EssaiCreate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _conn() as conn:
        demande_id = _demande_id_from_echantillon_id(conn, body.echantillon_id)
        if demande_id is None:
            raise HTTPException(404, f"Échantillon #{body.echantillon_id} introuvable")
        _require_essais_enabled(conn, demande_id)
        conn.execute(
            """
            INSERT INTO essais
            (echantillon_id,type_essai,norme,statut,date_debut,date_fin,
             resultats,operateur,observations,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                body.echantillon_id, body.type_essai, body.norme, body.statut,
                _fmt(body.date_debut), _fmt(body.date_fin),
                body.resultats, body.operateur, body.observations, now, now,
            ),
        )
        uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    return get_essai(int(uid))


@router.put("/{uid}")
def update_essai(uid: int, body: EssaiUpdate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    fields = {key: value for key, value in body.model_dump().items() if value is not None}
    for key in ("date_debut", "date_fin"):
        if key in fields and isinstance(fields[key], date):
            fields[key] = fields[key].isoformat()
    fields["updated_at"] = now
    clause = ", ".join(f"{key} = ?" for key in fields)
    with _conn() as conn:
        demande_id = _demande_id_for_essai(conn, uid)
        if demande_id is None:
            raise HTTPException(404, f"Essai #{uid} introuvable")
        _require_essais_enabled(conn, demande_id)
        conn.execute(f"UPDATE essais SET {clause} WHERE id = ?", list(fields.values()) + [uid])
    return get_essai(uid)


@router.delete("/{uid}", status_code=204)
def delete_essai(uid: int):
    with _conn() as conn:
        demande_id = _demande_id_for_essai(conn, uid)
        if demande_id is None:
            raise HTTPException(404, f"Essai #{uid} introuvable")
        _require_essais_enabled(conn, demande_id)
        cur = conn.execute("DELETE FROM essais WHERE id = ?", (uid,))
    if not cur.rowcount:
        raise HTTPException(404, f"Essai #{uid} introuvable")
