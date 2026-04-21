from __future__ import annotations

import json
import sqlite3
from fastapi import APIRouter, HTTPException

from app.core.database import get_db_path

router = APIRouter()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(get_db_path()))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _parse_payload(raw: object) -> dict:
    if isinstance(raw, dict):
        return raw
    text = str(raw or '').strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


@router.get('/{uid}')
def get_plan_implantation(uid: int):
    with _connect() as conn:
        row = conn.execute(
            '''
            SELECT
                p.*, d.reference AS demande_reference,
                c.reference AS campagne_reference,
                c.label AS campagne_label,
                i.reference AS intervention_reference,
                i.type_intervention,
                i.sujet AS intervention_subject
            FROM plans_implantation p
            LEFT JOIN demandes d ON d.id = p.demande_id
            LEFT JOIN campagnes c ON c.id = p.campagne_id
            LEFT JOIN interventions i ON i.id = p.intervention_id
            WHERE p.id = ?
            ''',
            (uid,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail=f"Plan d'implantation #{uid} introuvable")

        point_rows = conn.execute(
            '''
            SELECT id, point_code, point_type, ordre, x, y, z, pk, axe, remarque, statut_implantation
            FROM plan_implantation_points
            WHERE plan_implantation_id = ?
            ORDER BY ordre ASC, id ASC
            ''',
            (uid,),
        ).fetchall()

        rapport_rows = conn.execute(
            '''
            SELECT id, reference, type_rapport, date_rapport, statut, titre
            FROM rapports
            WHERE plan_implantation_id = ?
            ORDER BY date_rapport ASC, id ASC
            ''',
            (uid,),
        ).fetchall()

    payload = dict(row)
    payload['uid'] = int(payload.pop('id'))
    payload['payload'] = _parse_payload(payload.pop('payload_json', None))
    payload['points'] = [dict(item) | {'uid': int(item['id'])} for item in point_rows]
    payload['rapports'] = [dict(item) | {'uid': int(item['id'])} for item in rapport_rows]
    return payload
