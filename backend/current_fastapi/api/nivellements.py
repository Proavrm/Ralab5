from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import get_db_path

router = APIRouter()


class NivellementCreatePayload(BaseModel):
    scope: str = ''
    demande_id: int | None = None
    campagne_id: int | None = None
    intervention_id: int | None = None
    titre: str = ''
    date_releve: str = ''
    operateur: str = ''
    referentiel_altimetrique: str = ''
    materiel: str = ''
    observations: str = ''


class NivellementUpdatePayload(BaseModel):
    scope: str | None = None
    demande_id: int | None = None
    campagne_id: int | None = None
    intervention_id: int | None = None
    titre: str | None = None
    date_releve: str | None = None
    operateur: str | None = None
    referentiel_altimetrique: str | None = None
    materiel: str | None = None
    observations: str | None = None


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


def _now_sql() -> str:
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def _table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    if not _table_exists(conn, table_name):
        return set()
    return {row['name'] for row in conn.execute(f'PRAGMA table_info({table_name})').fetchall()}


def _get_nivellement_row(conn: sqlite3.Connection, uid: int) -> sqlite3.Row:
    row = conn.execute(
        '''
        SELECT
            n.*, d.reference AS demande_reference,
            c.reference AS campagne_reference,
            c.label AS campagne_label,
            i.reference AS intervention_reference,
            i.type_intervention,
            i.sujet AS intervention_subject
        FROM nivellements n
        LEFT JOIN demandes d ON d.id = n.demande_id
        LEFT JOIN campagnes c ON c.id = n.campagne_id
        LEFT JOIN interventions i ON i.id = n.intervention_id
        WHERE n.id = ?
        ''',
        (uid,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f'Nivellement #{uid} introuvable')
    return row


def _normalize_scope(raw_scope: str | None, *, has_campagne: bool, has_intervention: bool) -> str:
    normalized = str(raw_scope or '').strip().lower()
    if normalized in {'intervention', 'campagne', 'demande'}:
        return normalized
    if has_intervention:
        return 'intervention'
    if has_campagne:
        return 'campagne'
    return 'demande'


def _next_nivellement_reference(conn: sqlite3.Connection, year: int, labo_code: str) -> str:
    prefix = f'{year}-{str(labo_code or "RST").strip().upper()}-NI'
    rows = conn.execute('SELECT reference FROM nivellements WHERE reference IS NOT NULL ORDER BY id ASC').fetchall()
    pattern = re.compile(rf'^{re.escape(prefix)}(\d+)$', re.IGNORECASE)
    next_index = 1
    for row in rows:
        match = pattern.match(str(row['reference'] or '').strip())
        if match:
            next_index = max(next_index, int(match.group(1)) + 1)
    return f'{prefix}{next_index:04d}'


def _fetch_demande(conn: sqlite3.Connection, demande_id: int) -> sqlite3.Row:
    row = conn.execute(
        'SELECT id, reference, annee, labo_code FROM demandes WHERE id = ?',
        (int(demande_id),),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f'Demande #{demande_id} introuvable')
    return row


def _fetch_campagne(conn: sqlite3.Connection, campagne_id: int) -> sqlite3.Row:
    row = conn.execute(
        'SELECT id, demande_id, reference FROM campagnes WHERE id = ?',
        (int(campagne_id),),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f'Campagne #{campagne_id} introuvable')
    return row


def _fetch_intervention(conn: sqlite3.Connection, intervention_id: int) -> sqlite3.Row:
    row = conn.execute(
        '''
        SELECT
            i.id,
            i.demande_id,
            i.campagne_id,
            i.reference,
            i.type_intervention,
            i.sujet,
            i.date_intervention,
            i.technicien,
            d.reference AS demande_reference,
            c.reference AS campagne_reference
        FROM interventions i
        JOIN demandes d ON d.id = i.demande_id
        LEFT JOIN campagnes c ON c.id = i.campagne_id
        WHERE i.id = ?
        ''',
        (int(intervention_id),),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f'Intervention #{intervention_id} introuvable')
    return row


def _resolve_create_context(conn: sqlite3.Connection, body: NivellementCreatePayload) -> dict[str, Any]:
    # Legacy fallback: old callers send only intervention_id.
    if body.demande_id is None and body.intervention_id is not None:
        intervention = _fetch_intervention(conn, int(body.intervention_id))
        demande = _fetch_demande(conn, int(intervention['demande_id']))
        return {
            'scope': 'intervention',
            'demande': demande,
            'campagne': _fetch_campagne(conn, int(intervention['campagne_id'])) if intervention['campagne_id'] else None,
            'intervention': intervention,
            'demande_id': int(intervention['demande_id']),
            'campagne_id': int(intervention['campagne_id']) if intervention['campagne_id'] else None,
            'intervention_id': int(intervention['id']),
            'date_reference': intervention['date_intervention'] or '',
            'operateur_default': intervention['technicien'] or '',
        }

    if body.demande_id is None:
        raise HTTPException(status_code=400, detail='demande_id est requis')

    demande = _fetch_demande(conn, int(body.demande_id))
    campagne = _fetch_campagne(conn, int(body.campagne_id)) if body.campagne_id else None
    intervention = _fetch_intervention(conn, int(body.intervention_id)) if body.intervention_id else None

    if campagne and int(campagne['demande_id']) != int(demande['id']):
        raise HTTPException(status_code=400, detail='La campagne sélectionnée n\'appartient pas à cette demande')
    if intervention and int(intervention['demande_id']) != int(demande['id']):
        raise HTTPException(status_code=400, detail='L\'intervention sélectionnée n\'appartient pas à cette demande')

    scope = _normalize_scope(body.scope, has_campagne=campagne is not None, has_intervention=intervention is not None)
    if scope == 'intervention':
        if intervention is None:
            raise HTTPException(status_code=400, detail='intervention_id est requis pour un scope intervention')
        campagne = _fetch_campagne(conn, int(intervention['campagne_id'])) if intervention['campagne_id'] else None
    elif scope == 'campagne':
        if campagne is None:
            raise HTTPException(status_code=400, detail='campagne_id est requis pour un scope campagne')
    else:
        campagne = None
        intervention = None

    return {
        'scope': scope,
        'demande': demande,
        'campagne': campagne,
        'intervention': intervention,
        'demande_id': int(demande['id']),
        'campagne_id': int(campagne['id']) if campagne else None,
        'intervention_id': int(intervention['id']) if intervention else None,
        'date_reference': intervention['date_intervention'] if intervention else '',
        'operateur_default': intervention['technicien'] if intervention else '',
    }


def _ownership_scope(row: dict[str, Any]) -> str:
    if row.get('intervention_id'):
        return 'intervention'
    if row.get('campagne_id'):
        return 'campagne'
    return 'demande'


def _ownership_origin_label(row: dict[str, Any]) -> str:
    scope = _ownership_scope(row)
    if scope == 'intervention':
        return f"Intervention {row.get('intervention_reference') or '#'+str(row.get('intervention_id') or '')}".strip()
    if scope == 'campagne':
        return f"Campagne {row.get('campagne_reference') or '#'+str(row.get('campagne_id') or '')}".strip()
    return f"Demande {row.get('demande_reference') or '#'+str(row.get('demande_id') or '')}".strip()


_TERRAIN_POINT_COORD_COLUMNS = ('x', 'y', 'z', 'plan_canvas_x', 'plan_canvas_y')


def _coerce_optional_float(value: object) -> float | None:
    if value in (None, ''):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _terrain_coord_select_sql(columns: set[str]) -> str:
    selected = [f'pt.{column}' for column in _TERRAIN_POINT_COORD_COLUMNS if column in columns]
    return f", {', '.join(selected)}" if selected else ''


def _serialize_terrain_point_row(point_row: sqlite3.Row, pt_columns: set[str]) -> dict[str, Any]:
    payload = {
        'uid': int(point_row['id']),
        'point_code': str(point_row['point_code'] or '').strip(),
        'point_type': str(point_row['point_type'] or '').strip(),
        'ordre': int(point_row['ordre'] or 0),
        'feuille_id': int(point_row['feuille_id']) if point_row['feuille_id'] is not None else None,
        'feuille_reference': str(point_row['feuille_reference'] or '').strip() or None,
    }
    for column in _TERRAIN_POINT_COORD_COLUMNS:
        if column in pt_columns and column in point_row.keys():
            payload[column] = _coerce_optional_float(point_row[column])
    return payload


def _list_terrain_points_for_intervention(conn: sqlite3.Connection, intervention_id: int) -> list[dict[str, Any]]:
    pt_columns = _table_columns(conn, 'points_terrain')
    if not pt_columns:
        return []

    point_rows = conn.execute(
        f'''
        SELECT pt.id, pt.point_code, pt.point_type, pt.ordre
               {_terrain_coord_select_sql(pt_columns)}
             , ft.id AS feuille_id, ft.reference AS feuille_reference
        FROM points_terrain pt
        LEFT JOIN series_essais_terrain st ON st.id = pt.serie_id
        LEFT JOIN feuilles_terrain ft ON ft.serie_id = st.id
        WHERE COALESCE(pt.intervention_id, st.intervention_id, ft.intervention_id) = ?
        ORDER BY COALESCE(pt.ordre, 0) ASC, pt.id ASC
        ''',
        (int(intervention_id),),
    ).fetchall()

    seen_uids: set[int] = set()
    points: list[dict[str, Any]] = []
    for point_row in point_rows:
        point_uid = int(point_row['id'])
        if point_uid in seen_uids:
            continue
        seen_uids.add(point_uid)
        points.append(_serialize_terrain_point_row(point_row, pt_columns))
    return points


def _count_terrain_points_for_intervention(conn: sqlite3.Connection, intervention_id: int) -> int:
    return len(_list_terrain_points_for_intervention(conn, int(intervention_id)))


def _ensure_terrain_point_belongs_to_intervention(
    conn: sqlite3.Connection,
    intervention_id: int,
    point_uid: int,
) -> sqlite3.Row:
    row = conn.execute(
        '''
        SELECT pt.id, pt.point_code, pt.point_type, pt.ordre, pt.serie_id
        FROM points_terrain pt
        LEFT JOIN series_essais_terrain st ON st.id = pt.serie_id
        LEFT JOIN feuilles_terrain ft ON ft.serie_id = st.id
        WHERE pt.id = ?
          AND COALESCE(pt.intervention_id, st.intervention_id, ft.intervention_id) = ?
        LIMIT 1
        ''',
        (int(point_uid), int(intervention_id)),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f'Point terrain #{point_uid} introuvable pour cette intervention')
    return row


def _serialize_nivellement_summary(row: sqlite3.Row, *, terrain_points_count: int | None = None) -> dict[str, Any]:
    payload = dict(row)
    payload['uid'] = int(payload.pop('id'))
    points_count = terrain_points_count
    if points_count is None:
        points_count = int(row['points_count'] or 0) if 'points_count' in row.keys() else 0
    payload['points_count'] = int(points_count or 0)
    payload['terrain_points_count'] = int(points_count or 0)
    payload['ownership_scope'] = _ownership_scope(payload)
    payload['ownership_origin_label'] = _ownership_origin_label(payload)
    return payload


class TerrainPointCoordsPayload(BaseModel):
    z: float | None = None
    x: float | None = None
    y: float | None = None


def ensure_nivellement_for_intervention(conn: sqlite3.Connection, intervention_id: int) -> int:
    columns = _table_columns(conn, 'nivellements')
    if not columns:
        raise HTTPException(status_code=400, detail='Table nivellements indisponible')

    existing = conn.execute(
        'SELECT id FROM nivellements WHERE intervention_id = ? ORDER BY id ASC LIMIT 1',
        (int(intervention_id),),
    ).fetchone()
    if existing is not None:
        return int(existing['id'])

    intervention = _fetch_intervention(conn, int(intervention_id))
    demande = _fetch_demande(conn, int(intervention['demande_id']))
    reference = _next_nivellement_reference(
        conn,
        int(demande['annee'] or datetime.now().year),
        str(demande['labo_code'] or 'RST'),
    )
    titre = f"Nivellement {intervention['type_intervention'] or intervention['reference']}"
    payload_json: dict[str, Any] = {
        'type_document': 'NIVELLEMENT',
        'scope': 'intervention',
        'paired_with_plan_implantation': True,
    }
    values = {
        'reference': reference,
        'demande_id': int(intervention['demande_id']),
        'campagne_id': int(intervention['campagne_id']) if intervention['campagne_id'] else None,
        'intervention_id': int(intervention_id),
        'titre': titre,
        'date_releve': intervention['date_intervention'] or '',
        'operateur': intervention['technicien'] or '',
        'referentiel_altimetrique': '',
        'materiel': '',
        'observations': f"Créé automatiquement avec le plan d'implantation de {intervention['reference']}",
        'statut': 'Brouillon',
        'payload_json': json.dumps(payload_json, ensure_ascii=False),
        'created_at': _now_sql(),
        'updated_at': _now_sql(),
    }
    insert_values = {key: value for key, value in values.items() if key in columns}
    sql_columns = ', '.join(insert_values.keys())
    placeholders = ', '.join('?' for _ in insert_values)
    uid = conn.execute(
        f'INSERT INTO nivellements ({sql_columns}) VALUES ({placeholders})',
        tuple(insert_values.values()),
    ).lastrowid
    return int(uid)


@router.get('')
def list_nivellements(
    demande_id: int | None = None,
    campagne_id: int | None = None,
    intervention_id: int | None = None,
):
    with _connect() as conn:
        conditions: list[str] = []
        params: list[Any] = []
        if intervention_id is not None:
            conditions.append('n.intervention_id = ?')
            params.append(int(intervention_id))
        elif campagne_id is not None:
            conditions.append('n.campagne_id = ?')
            params.append(int(campagne_id))
        elif demande_id is not None:
            conditions.append('n.demande_id = ?')
            params.append(int(demande_id))

        where = f'WHERE {" AND ".join(conditions)}' if conditions else ''
        rows = conn.execute(
            f'''
            SELECT
                n.id,
                n.reference,
                n.titre,
                n.date_releve,
                n.statut,
                n.demande_id,
                n.campagne_id,
                n.intervention_id,
                d.reference AS demande_reference,
                c.reference AS campagne_reference,
                i.reference AS intervention_reference
            FROM nivellements n
            LEFT JOIN demandes d ON d.id = n.demande_id
            LEFT JOIN campagnes c ON c.id = n.campagne_id
            LEFT JOIN interventions i ON i.id = n.intervention_id
            {where}
            ORDER BY n.id DESC
            ''',
            params,
        ).fetchall()

        result: list[dict[str, Any]] = []
        for row in rows:
            terrain_points_count = None
            if row['intervention_id']:
                terrain_points_count = _count_terrain_points_for_intervention(conn, int(row['intervention_id']))
            result.append(_serialize_nivellement_summary(row, terrain_points_count=terrain_points_count))
        return result


@router.post('/ensure-for-intervention/{intervention_id}')
def ensure_nivellement_for_intervention_route(intervention_id: int):
    with _connect() as conn:
        uid = ensure_nivellement_for_intervention(conn, int(intervention_id))
        conn.commit()
    return get_nivellement(uid)


@router.get('/{uid}')
def get_nivellement(uid: int):
    with _connect() as conn:
        row = _get_nivellement_row(conn, uid)

        point_rows = conn.execute(
            '''
            SELECT id, point_code, ordre, repere, altitude_terrain, cote_projet, ecart, observation
            FROM nivellement_points
            WHERE nivellement_id = ?
            ORDER BY ordre ASC, id ASC
            ''',
            (uid,),
        ).fetchall()

        rapport_rows = conn.execute(
            '''
            SELECT id, reference, type_rapport, date_rapport, statut, titre
            FROM rapports
            WHERE nivellement_id = ?
            ORDER BY date_rapport ASC, id ASC
            ''',
            (uid,),
        ).fetchall()

        terrain_points: list[dict[str, Any]] = []
        if row['intervention_id']:
            terrain_points = _list_terrain_points_for_intervention(conn, int(row['intervention_id']))

    payload = dict(row)
    payload['uid'] = int(payload.pop('id'))
    payload['payload'] = _parse_payload(payload.pop('payload_json', None))
    payload['ownership_scope'] = _ownership_scope(payload)
    payload['ownership_origin_label'] = _ownership_origin_label(payload)
    payload['points'] = [dict(item) | {'uid': int(item['id'])} for item in point_rows]
    payload['terrain_points'] = terrain_points
    payload['terrain_points_count'] = len(terrain_points)
    payload['rapports'] = [dict(item) | {'uid': int(item['id'])} for item in rapport_rows]
    return payload


@router.patch('/{uid}/terrain-points/{point_uid}')
def update_nivellement_terrain_point(uid: int, point_uid: int, body: TerrainPointCoordsPayload):
    with _connect() as conn:
        row = _get_nivellement_row(conn, uid)
        intervention_id = row['intervention_id']
        if not intervention_id:
            raise HTTPException(status_code=400, detail='Ce nivellement n\'est pas lié à une intervention')

        _ensure_terrain_point_belongs_to_intervention(conn, int(intervention_id), int(point_uid))
        point_columns = _table_columns(conn, 'points_terrain')
        if not point_columns:
            raise HTTPException(status_code=400, detail='Table points_terrain indisponible')

        fields: dict[str, float | None] = {}
        for column in ('x', 'y', 'z'):
            if column not in point_columns:
                continue
            raw_value = getattr(body, column)
            if raw_value is None:
                continue
            fields[column] = _coerce_optional_float(raw_value)

        if not fields:
            raise HTTPException(status_code=400, detail='Aucune coordonnée à mettre à jour')

        clause = ', '.join(f'{column} = ?' for column in fields)
        conn.execute(
            f'UPDATE points_terrain SET {clause} WHERE id = ?',
            [*fields.values(), int(point_uid)],
        )
        conn.commit()

    refreshed = get_nivellement(uid)
    updated_point = next(
        (item for item in refreshed.get('terrain_points', []) if int(item.get('uid') or 0) == int(point_uid)),
        None,
    )
    if updated_point is None:
        raise HTTPException(status_code=404, detail=f'Point terrain #{point_uid} introuvable après mise à jour')
    return updated_point


@router.post('', status_code=201)
def create_nivellement(body: NivellementCreatePayload):
    with _connect() as conn:
        context = _resolve_create_context(conn, body)

        columns = _table_columns(conn, 'nivellements')
        if not columns:
            raise HTTPException(status_code=400, detail='Table nivellements indisponible')

        demande_row = context['demande']
        intervention = context['intervention']
        reference = _next_nivellement_reference(
            conn,
            int(demande_row['annee'] or datetime.now().year),
            str(demande_row['labo_code'] or 'RST'),
        )
        titre = body.titre.strip() or (f"Nivellement {intervention['type_intervention'] or intervention['reference']}" if intervention else 'Nivellement')
        referentiel = body.referentiel_altimetrique.strip()
        materiel = body.materiel.strip()
        payload_json: dict[str, Any] = {
            'type_document': 'NIVELLEMENT',
            'scope': context['scope'],
        }
        if referentiel:
            payload_json['referentiel'] = referentiel
        if materiel:
            payload_json['materiel'] = materiel

        values = {
            'reference': reference,
            'demande_id': context['demande_id'],
            'campagne_id': context['campagne_id'],
            'intervention_id': context['intervention_id'],
            'titre': titre,
            'date_releve': body.date_releve or context['date_reference'] or '',
            'operateur': body.operateur.strip() or context['operateur_default'] or '',
            'referentiel_altimetrique': referentiel,
            'materiel': materiel,
            'observations': body.observations.strip() or (
                f"Création manuelle depuis {intervention['reference']}" if intervention else 'Création manuelle'
            ),
            'statut': 'Brouillon',
            'payload_json': json.dumps(payload_json, ensure_ascii=False),
            'created_at': _now_sql(),
            'updated_at': _now_sql(),
        }
        insert_values = {key: value for key, value in values.items() if key in columns}
        sql_columns = ', '.join(insert_values.keys())
        placeholders = ', '.join('?' for _ in insert_values)
        uid = conn.execute(
            f'INSERT INTO nivellements ({sql_columns}) VALUES ({placeholders})',
            tuple(insert_values.values()),
        ).lastrowid
        conn.commit()

    return get_nivellement(int(uid))


@router.put('/{uid}')
def update_nivellement(uid: int, body: NivellementUpdatePayload):
    with _connect() as conn:
        row = _get_nivellement_row(conn, uid)
        columns = _table_columns(conn, 'nivellements')
        if not columns:
            raise HTTPException(status_code=400, detail='Table nivellements indisponible')

        next_scope = _normalize_scope(body.scope, has_campagne=bool(body.campagne_id or row['campagne_id']), has_intervention=bool(body.intervention_id or row['intervention_id']))

        next_demande_id = int(body.demande_id) if body.demande_id is not None else int(row['demande_id'])
        demande = _fetch_demande(conn, next_demande_id)
        campagne = _fetch_campagne(conn, int(body.campagne_id)) if body.campagne_id is not None else (
            _fetch_campagne(conn, int(row['campagne_id'])) if row['campagne_id'] else None
        )
        intervention = _fetch_intervention(conn, int(body.intervention_id)) if body.intervention_id is not None else (
            _fetch_intervention(conn, int(row['intervention_id'])) if row['intervention_id'] else None
        )

        if campagne and int(campagne['demande_id']) != int(demande['id']):
            raise HTTPException(status_code=400, detail='La campagne sélectionnée n\'appartient pas à cette demande')
        if intervention and int(intervention['demande_id']) != int(demande['id']):
            raise HTTPException(status_code=400, detail='L\'intervention sélectionnée n\'appartient pas à cette demande')

        if next_scope == 'intervention':
            if intervention is None:
                raise HTTPException(status_code=400, detail='intervention_id est requis pour un scope intervention')
            campagne = _fetch_campagne(conn, int(intervention['campagne_id'])) if intervention['campagne_id'] else None
        elif next_scope == 'campagne':
            if campagne is None:
                raise HTTPException(status_code=400, detail='campagne_id est requis pour un scope campagne')
            intervention = None
        else:
            campagne = None
            intervention = None

        referentiel = body.referentiel_altimetrique.strip() if body.referentiel_altimetrique is not None else (row['referentiel_altimetrique'] or '')
        materiel = body.materiel.strip() if body.materiel is not None else (row['materiel'] or '')
        existing_payload = _parse_payload(row['payload_json'])
        payload_json: dict[str, Any] = {
            **existing_payload,
            'type_document': 'NIVELLEMENT',
            'scope': next_scope,
            'referentiel': referentiel,
            'materiel': materiel,
        }

        values = {
            'demande_id': int(demande['id']),
            'campagne_id': int(campagne['id']) if campagne else None,
            'intervention_id': int(intervention['id']) if intervention else None,
            'titre': body.titre.strip() if body.titre is not None else (row['titre'] or 'Nivellement'),
            'date_releve': body.date_releve if body.date_releve is not None else (row['date_releve'] or ''),
            'operateur': body.operateur.strip() if body.operateur is not None else (row['operateur'] or ''),
            'referentiel_altimetrique': referentiel,
            'materiel': materiel,
            'observations': body.observations.strip() if body.observations is not None else (row['observations'] or ''),
            'payload_json': json.dumps(payload_json, ensure_ascii=False),
            'updated_at': _now_sql(),
        }
        update_values = {key: value for key, value in values.items() if key in columns}
        clause = ', '.join(f'{key} = ?' for key in update_values)
        conn.execute(
            f'UPDATE nivellements SET {clause} WHERE id = ?',
            list(update_values.values()) + [uid],
        )
        conn.commit()

    return get_nivellement(uid)


@router.delete('/{uid}', status_code=204)
def delete_nivellement(uid: int):
    with _connect() as conn:
        _get_nivellement_row(conn, uid)

        if _table_exists(conn, 'nivellement_points'):
            conn.execute(
                'DELETE FROM nivellement_points WHERE nivellement_id = ?',
                (int(uid),),
            )

        rapport_columns = _table_columns(conn, 'rapports')
        if 'nivellement_id' in rapport_columns:
            conn.execute(
                'UPDATE rapports SET nivellement_id = NULL WHERE nivellement_id = ?',
                (int(uid),),
            )

        cur = conn.execute('DELETE FROM nivellements WHERE id = ?', (int(uid),))
        if not cur.rowcount:
            raise HTTPException(status_code=404, detail=f'Nivellement #{uid} introuvable')
        conn.commit()
