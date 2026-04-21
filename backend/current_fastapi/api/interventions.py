"""
api/interventions.py — RaLab4
GET    /api/interventions?demande_id=X&annee=YYYY&labo_code=SP
GET    /api/interventions/{uid}
POST   /api/interventions
PUT    /api/interventions/{uid}
DELETE /api/interventions/{uid}
"""
from __future__ import annotations

import json
import re
import sqlite3
from datetime import date, datetime
from typing import Optional

from app.core.database import ensure_ralab4_schema, get_db_path
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter()
DB_PATH = get_db_path()

TYPES = [
    "Visite de contrôle", "Auscultation", "Levé topographique", "Prélèvement",
    "Inspection géotechnique", "Essai in situ", "Réunion de chantier", "Autre",
]
STATUTS = ["Planifiée", "En cours", "Réalisée", "Annulée"]
ALERTES = ["Aucun", "Faible", "Moyen", "Élevé", "Critique"]
DEFAULT_NATURE_REELLE = "Intervention"


class InterventionCreate(BaseModel):
    demande_id: int
    campaign_id: Optional[int] = Field(None)
    campagne_id: Optional[int] = Field(None)
    type_intervention: str = Field("Visite de contrôle")
    sujet: str = Field("")
    date_intervention: date = Field(default_factory=date.today)
    duree_heures: Optional[float] = Field(None)
    geotechnicien: str = Field("")
    technicien: str = Field("")
    observations: str = Field("")
    anomalie_detectee: bool = Field(False)
    niveau_alerte: str = Field("Aucun")
    pv_ref: str = Field("")
    rapport_ref: str = Field("")
    photos_dossier: str = Field("")
    statut: str = Field("Planifiée")
    finalite: str = Field("")
    zone: str = Field("")
    heure_debut: str = Field("")
    heure_fin: str = Field("")


class InterventionUpdate(BaseModel):
    campaign_id: Optional[int] = None
    campagne_id: Optional[int] = None
    type_intervention: Optional[str] = None
    sujet: Optional[str] = None
    date_intervention: Optional[date] = None
    duree_heures: Optional[float] = None
    geotechnicien: Optional[str] = None
    technicien: Optional[str] = None
    observations: Optional[str] = None
    anomalie_detectee: Optional[bool] = None
    niveau_alerte: Optional[str] = None
    pv_ref: Optional[str] = None
    rapport_ref: Optional[str] = None
    photos_dossier: Optional[str] = None
    statut: Optional[str] = None
    finalite: Optional[str] = None
    zone: Optional[str] = None
    heure_debut: Optional[str] = None
    heure_fin: Optional[str] = None


def _conn():
    ensure_ralab4_schema(DB_PATH)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _resolve_campaign_id(conn: sqlite3.Connection, campaign_id: Optional[int], demande_id: int) -> Optional[int]:
    if not campaign_id:
        return None
    row = conn.execute("SELECT id, demande_id FROM campagnes WHERE id = ?", (campaign_id,)).fetchone()
    if row is None:
        raise HTTPException(404, f"Campagne #{campaign_id} introuvable")
    if int(row["demande_id"] or 0) != int(demande_id):
        raise HTTPException(400, "La campagne sélectionnée n'appartient pas à cette demande")
    return int(row["id"])


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
    row = conn.execute("SELECT d.annee, d.labo_code FROM demandes d WHERE d.id = ?", (demande_id,)).fetchone()
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


def _extract_obs_metadata(observations: str) -> tuple[str, str]:
    if not isinstance(observations, str):
        return "", ""
    raw = observations.strip()
    if not raw or not raw.startswith("{"):
        return "", ""
    try:
        payload = json.loads(raw)
    except Exception:
        return "", ""
    essai_code = str(payload.get("essai_code") or payload.get("code_essai") or payload.get("source_essai_code") or "").strip()
    essai_label = str(payload.get("essai_label") or payload.get("label") or payload.get("libelle") or "").strip()
    return essai_code, essai_label


def _row_to_dict(row) -> dict:
    data = dict(row)
    data["uid"] = data.pop("id")
    essai_code, essai_label = _extract_obs_metadata(data.get("observations") or "")
    data["essai_code"] = essai_code
    data["code_essai"] = essai_code
    data["essai_label"] = essai_label
    data["campaign_id"] = data.get("campagne_id")
    data["intervention_reelle_id"] = data["uid"]
    data["intervention_reelle_reference"] = data.get("reference") or ""
    return data


def _base_select() -> str:
    return """
        SELECT
            i.*,
            COALESCE(c.code, '') AS campaign_code,
            COALESCE(c.reference, '') AS campaign_ref,
            COALESCE(c.label, '') AS campaign_label,
            COALESCE(c.designation, '') AS campaign_designation,
            d.id AS demande_id,
            d.reference AS demande_ref,
            d.reference AS demande_reference,
            d.affaire_rst_id AS affaire_rst_id,
            a.reference AS affaire_ref,
            a.reference AS affaire_reference,
            a.client AS client,
            a.chantier AS chantier,
            a.site AS site
        FROM interventions i
        LEFT JOIN campagnes c ON c.id = i.campagne_id
        JOIN demandes d ON d.id = i.demande_id
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
    """


@router.get("")
def list_interventions(
    demande_id: Optional[int] = Query(None),
    annee: Optional[int] = Query(None),
    labo_code: Optional[str] = Query(None),
    statut: Optional[str] = Query(None),
):
    with _conn() as conn:
        if demande_id and not _interventions_enabled(conn, demande_id):
            return []
        sql = _base_select() + " WHERE 1=1"
        params = []
        if demande_id:
            sql += " AND i.demande_id = ?"
            params.append(demande_id)
        if annee is not None:
            sql += " AND COALESCE(NULLIF(substr(COALESCE(i.date_intervention, ''), 1, 4), ''), CAST(i.annee AS TEXT)) = ?"
            params.append(str(annee))
        if labo_code:
            sql += " AND i.labo_code = ?"
            params.append(labo_code)
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
        row = conn.execute(_base_select() + " WHERE i.id = ?", (uid,)).fetchone()
        if not row:
            raise HTTPException(404, f"Intervention #{uid} introuvable")
        _require_interventions_enabled(conn, int(row["demande_id"]))
    return _row_to_dict(row)


@router.post("", status_code=201)
def create_intervention(body: InterventionCreate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _conn() as conn:
        _require_interventions_enabled(conn, body.demande_id)
        requested_campaign_id = body.campagne_id or body.campaign_id
        campagne_id = _resolve_campaign_id(conn, requested_campaign_id, body.demande_id)
        ref, annee, labo, numero = _next_ref(conn, body.demande_id)
        conn.execute(
            """
            INSERT INTO interventions (
                reference, annee, labo_code, numero, demande_id, campagne_id,
                type_intervention, sujet, date_intervention, duree_heures,
                geotechnicien, technicien, observations, anomalie_detectee,
                niveau_alerte, pv_ref, rapport_ref, photos_dossier, statut,
                nature_reelle, finalite, zone, heure_debut, heure_fin,
                tri_updated_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ref, annee, labo, numero, body.demande_id, campagne_id,
                body.type_intervention, body.sujet, body.date_intervention.isoformat(), body.duree_heures,
                body.geotechnicien, body.technicien, body.observations,
                1 if body.anomalie_detectee else 0, body.niveau_alerte,
                body.pv_ref, body.rapport_ref, body.photos_dossier, body.statut,
                DEFAULT_NATURE_REELLE, body.finalite, body.zone, body.heure_debut, body.heure_fin,
                now, now, now,
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
    requested_campaign_id = fields.pop("campagne_id", None) or fields.pop("campaign_id", None)
    fields["updated_at"] = now
    with _conn() as conn:
        demande_id = _demande_id_for_intervention(conn, uid)
        if demande_id is None:
            raise HTTPException(404, f"Intervention #{uid} introuvable")
        _require_interventions_enabled(conn, demande_id)
        if requested_campaign_id is not None:
            fields["campagne_id"] = _resolve_campaign_id(conn, requested_campaign_id, demande_id)
        clause = ", ".join(f"{key} = ?" for key in fields)
        if clause:
            conn.execute(f"UPDATE interventions SET {clause} WHERE id = ?", list(fields.values()) + [uid])
        conn.execute(
            """
            UPDATE interventions
            SET nature_reelle = ?, tri_updated_at = ?
            WHERE id = ? AND COALESCE(NULLIF(nature_reelle, ''), '') = ''
            """,
            (DEFAULT_NATURE_REELLE, now, uid),
        )
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
