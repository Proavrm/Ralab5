"""
api/intervention_campaigns.py
Compatibilité API pour la création / mise à jour des campagnes.
La persistance cible est la table unique `campagnes`.
"""
from __future__ import annotations

import re
import sqlite3
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.database import ensure_ralab4_schema, get_db_path
from app.services.intervention_campaign_service import list_campaigns_for_demande

router = APIRouter()
DB_PATH = get_db_path()


class InterventionCampaignCreate(BaseModel):
    demande_id: int
    code: str = Field("")
    label: str = Field("Campagne")
    designation: str = Field("")
    zone_scope: str = Field("")
    temporalite: str = Field("")
    programme_specifique: str = Field("")
    nb_points_prevus: str = Field("")
    types_essais_prevus: str = Field("")
    notes: str = Field("")
    statut: str = Field("À cadrer")
    date_debut_prevue: str = Field("")
    date_fin_prevue: str = Field("")
    priorite: str = Field("Normale")
    responsable_technique: str = Field("")
    attribue_a: str = Field("")
    criteres_controle: str = Field("")
    livrables_attendus: str = Field("")


class InterventionCampaignUpdate(BaseModel):
    code: Optional[str] = None
    label: Optional[str] = None
    designation: Optional[str] = None
    zone_scope: Optional[str] = None
    temporalite: Optional[str] = None
    programme_specifique: Optional[str] = None
    nb_points_prevus: Optional[str] = None
    types_essais_prevus: Optional[str] = None
    notes: Optional[str] = None
    statut: Optional[str] = None
    date_debut_prevue: Optional[str] = None
    date_fin_prevue: Optional[str] = None
    priorite: Optional[str] = None
    responsable_technique: Optional[str] = None
    attribue_a: Optional[str] = None
    criteres_controle: Optional[str] = None
    livrables_attendus: Optional[str] = None


def _conn():
    ensure_ralab4_schema(DB_PATH)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _next_reference(conn: sqlite3.Connection, demande_id: int) -> str:
    row = conn.execute("SELECT annee, labo_code FROM demandes WHERE id = ?", (demande_id,)).fetchone()
    annee = row["annee"] if row else datetime.now().year
    labo = row["labo_code"] if row else "SP"
    prefix = f"{annee}-{labo}-C"
    rows = conn.execute("SELECT reference FROM campagnes WHERE reference LIKE ?", (f"{prefix}%",)).fetchall()
    numbers = []
    for row in rows:
        match = re.match(rf"^{re.escape(prefix)}(\d+)$", str(row["reference"] or ""))
        if match:
            numbers.append(int(match.group(1)))
    return f"{prefix}{max(numbers, default=0) + 1:03d}"


def _to_dict(row: sqlite3.Row) -> dict:
    data = dict(row)
    data["uid"] = int(data.pop("id"))
    return data


@router.post("", status_code=201)
def create_intervention_campaign(body: InterventionCampaignCreate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _conn() as conn:
        demande = conn.execute("SELECT id FROM demandes WHERE id = ?", (body.demande_id,)).fetchone()
        if not demande:
            raise HTTPException(404, f"Demande #{body.demande_id} introuvable")
        reference = _next_reference(conn, body.demande_id)
        conn.execute(
            """
            INSERT INTO campagnes (
                demande_id, reference, label, type_campagne, code, designation,
                zone_scope, temporalite, programme_specifique, nb_points_prevus,
                types_essais_prevus, date_debut_prevue, date_fin_prevue, priorite,
                responsable_technique, attribue_a, criteres_controle,
                livrables_attendus, workflow_label, statut, notes, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                body.demande_id,
                reference,
                body.label,
                body.code,
                body.code,
                body.designation,
                body.zone_scope,
                body.temporalite,
                body.programme_specifique,
                body.nb_points_prevus,
                body.types_essais_prevus,
                body.date_debut_prevue,
                body.date_fin_prevue,
                body.priorite,
                body.responsable_technique,
                body.attribue_a,
                body.criteres_controle,
                body.livrables_attendus,
                'Affaire -> Demande -> Campagne -> Intervention',
                body.statut,
                body.notes,
                now,
            ),
        )
        uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        row = conn.execute("SELECT * FROM campagnes WHERE id = ?", (uid,)).fetchone()
    return _to_dict(row)


@router.get("")
def list_intervention_campaigns(demande_id: Optional[int] = Query(None)):
    if demande_id is not None:
        try:
            return list_campaigns_for_demande(int(demande_id))
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc

    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT
                c.id,
                c.reference,
                c.label,
                c.code,
                c.designation,
                c.statut,
                c.demande_id,
                d.reference AS demande_reference,
                (
                    SELECT COUNT(*)
                    FROM interventions i
                    WHERE i.campagne_id = c.id
                ) AS intervention_count
            FROM campagnes c
            LEFT JOIN demandes d ON d.id = c.demande_id
            ORDER BY COALESCE(c.reference, ''), c.id DESC
            """
        ).fetchall()

    return [
        {
            "uid": int(row["id"]),
            "reference": row["reference"] or "",
            "label": row["label"] or "",
            "code": row["code"] or "",
            "designation": row["designation"] or "",
            "statut": row["statut"] or "",
            "demande_id": row["demande_id"],
            "demande_reference": row["demande_reference"] or "",
            "demande_uid": row["demande_id"],
            "intervention_count": int(row["intervention_count"] or 0),
        }
        for row in rows
    ]


@router.get("/{uid}")
def get_intervention_campaign(uid: int):
    with _conn() as conn:
        row = conn.execute(
            """
            SELECT
                c.*,
                d.reference AS demande_reference
            FROM campagnes c
            LEFT JOIN demandes d ON d.id = c.demande_id
            WHERE c.id = ?
            """,
            (uid,),
        ).fetchone()
        if not row:
            raise HTTPException(404, f"Campagne #{uid} introuvable")

        interventions_rows = conn.execute(
            """
            SELECT
                i.id AS uid,
                i.reference,
                i.type_intervention,
                i.sujet,
                i.date_intervention,
                i.geotechnicien,
                i.technicien,
                i.statut,
                i.nature_reelle,
                i.zone
            FROM interventions i
            WHERE i.campagne_id = ?
            ORDER BY i.date_intervention DESC, i.id DESC
            """,
            (uid,),
        ).fetchall()

    payload = _to_dict(row)
    payload["interventions"] = [dict(item) for item in interventions_rows]
    payload["intervention_count"] = len(payload["interventions"])
    return payload


@router.patch("/{uid}")
def patch_intervention_campaign(uid: int, body: InterventionCampaignUpdate):
    fields = {key: value for key, value in body.model_dump(exclude_unset=True).items() if value is not None}
    if not fields:
        with _conn() as conn:
            row = conn.execute("SELECT * FROM campagnes WHERE id = ?", (uid,)).fetchone()
            if not row:
                raise HTTPException(404, f"Campagne #{uid} introuvable")
            return _to_dict(row)

    fields["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    clause = ", ".join(f"{key} = ?" for key in fields)
    with _conn() as conn:
        cur = conn.execute(f"UPDATE campagnes SET {clause} WHERE id = ?", list(fields.values()) + [uid])
        if not cur.rowcount:
            raise HTTPException(404, f"Campagne #{uid} introuvable")
        row = conn.execute("SELECT * FROM campagnes WHERE id = ?", (uid,)).fetchone()
    return _to_dict(row)
