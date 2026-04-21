from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import get_db_path

router = APIRouter()


class PointTerrainPayload(BaseModel):
    point_code: str = ''
    point_type: str = 'SONDAGE_PELLE'
    localisation: str = ''
    profil: str = ''
    date_point: str = ''
    operateur: str = ''
    profondeur_finale_m: Optional[float] = None
    tenue_fouilles: str = ''
    venue_eau: Optional[bool] = None
    niveau_nappe: str = ''
    arret_sondage: str = ''
    ouvrage: str = ''
    notes: str = ''


class SondageCouchePayload(BaseModel):
    z_haut: Optional[float] = None
    z_bas: Optional[float] = None
    texture_matrice: str = ''
    proportion_matrice: str = ''
    elements_grossiers: str = ''
    granulo_elements: str = ''
    forme_elements: str = ''
    petrographie: str = ''
    structure: str = ''
    matiere_organique: str = ''
    couleur: str = ''
    odeur: str = ''
    consistance: str = ''
    cohesion: str = ''
    oxydo_reduction: str = ''
    eau_porosite: str = ''
    horizon: str = ''
    determination: str = ''
    geologie: str = ''
    description_libre: str = ''


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(get_db_path()))
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA journal_mode = WAL')
    return conn


def _parse_payload(raw: object) -> dict[str, Any]:
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


def _safe_bool(value: object) -> Optional[bool]:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {'1', 'true', 'oui', 'yes'}:
        return True
    if text in {'0', 'false', 'non', 'no'}:
        return False
    return None


def _serialize_json(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False)


def _get_feuille_row(conn: sqlite3.Connection, uid: int) -> sqlite3.Row:
    row = conn.execute(
        """
        SELECT
            f.*, d.reference AS demande_reference,
            c.reference AS campagne_reference,
            c.label AS campagne_label,
            i.reference AS intervention_reference,
            i.type_intervention,
            i.sujet AS intervention_subject
        FROM feuilles_terrain f
        LEFT JOIN demandes d ON d.id = f.demande_id
        LEFT JOIN campagnes c ON c.id = f.campagne_id
        LEFT JOIN interventions i ON i.id = f.intervention_id
        WHERE f.id = ?
        """,
        (uid,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f'Feuille terrain #{uid} introuvable')
    return row


def _build_point_payload(point_row: sqlite3.Row, feuille_row: sqlite3.Row) -> dict[str, Any]:
    data = dict(point_row)
    payload = _parse_payload(data.get('payload_json'))
    profondeur_finale = payload.get('profondeur_finale_m')
    if profondeur_finale is None:
        profondeur_finale = data.get('profondeur_bas')

    return {
        'uid': int(data['id']),
        'point_code': data.get('point_code') or payload.get('point_code') or f"POINT-{data['id']}",
        'point_type': data.get('point_type') or payload.get('point_type') or feuille_row['code_feuille'] or '',
        'localisation': data.get('localisation') or payload.get('localisation') or data.get('position_label') or '',
        'profil': data.get('profil') or payload.get('profil') or '',
        'date_point': payload.get('date_point') or feuille_row['date_feuille'] or '',
        'operateur': payload.get('operateur') or feuille_row['operateur'] or '',
        'profondeur_finale_m': profondeur_finale,
        'tenue_fouilles': payload.get('tenue_fouilles') or '',
        'venue_eau': _safe_bool(payload.get('venue_eau')),
        'niveau_nappe': payload.get('niveau_nappe') or '',
        'arret_sondage': payload.get('arret_sondage') or '',
        'ouvrage': payload.get('ouvrage') or '',
        'notes': payload.get('notes') or data.get('observation') or '',
        'ordre': int(data.get('ordre') or 0),
        'payload': payload,
        'couches': [],
        'prelevements': [],
    }


def _build_couche_payload(couche_row: sqlite3.Row) -> dict[str, Any]:
    data = dict(couche_row)
    return {
        'uid': int(data['id']),
        'point_terrain_id': int(data['point_terrain_id']),
        'ordre': int(data.get('ordre') or 0),
        'z_haut': data.get('z_haut'),
        'z_bas': data.get('z_bas'),
        'texture_matrice': data.get('texture_matrice') or '',
        'proportion_matrice': data.get('proportion_matrice') or '',
        'elements_grossiers': data.get('elements_grossiers') or '',
        'granulo_elements': data.get('granulo_elements') or '',
        'forme_elements': data.get('forme_elements') or '',
        'petrographie': data.get('petrographie') or '',
        'structure': data.get('structure') or '',
        'matiere_organique': data.get('matiere_organique') or '',
        'couleur': data.get('couleur') or '',
        'odeur': data.get('odeur') or '',
        'consistance': data.get('consistance') or '',
        'cohesion': data.get('cohesion') or '',
        'oxydo_reduction': data.get('oxydo_reduction') or '',
        'eau_porosite': data.get('eau_porosite') or '',
        'horizon': data.get('horizon') or '',
        'determination': data.get('determination') or '',
        'geologie': data.get('geologie') or '',
        'description_libre': data.get('description_libre') or '',
    }


def _load_points(conn: sqlite3.Connection, feuille_row: sqlite3.Row) -> list[dict[str, Any]]:
    if not _table_exists(conn, 'points_terrain'):
        payload = _parse_payload(feuille_row['resultats_json'])
        return payload.get('points', []) if isinstance(payload, dict) else []

    where_clauses: list[str] = []
    params: list[Any] = []
    columns = _table_columns(conn, 'points_terrain')

    if feuille_row['serie_id'] is not None and 'serie_id' in columns:
        where_clauses.append('pt.serie_id = ?')
        params.append(feuille_row['serie_id'])
    elif feuille_row['intervention_id'] is not None and 'intervention_id' in columns:
        where_clauses.append('pt.intervention_id = ?')
        params.append(feuille_row['intervention_id'])
    elif feuille_row['demande_id'] is not None and 'demande_id' in columns:
        where_clauses.append('pt.demande_id = ?')
        params.append(feuille_row['demande_id'])

    if not where_clauses:
        payload = _parse_payload(feuille_row['resultats_json'])
        return payload.get('points', []) if isinstance(payload, dict) else []

    point_rows = conn.execute(
        f"SELECT pt.* FROM points_terrain pt WHERE {' AND '.join(where_clauses)} ORDER BY COALESCE(pt.ordre, 0), pt.id",
        params,
    ).fetchall()

    points = [_build_point_payload(point_row, feuille_row) for point_row in point_rows]
    if not points:
        payload = _parse_payload(feuille_row['resultats_json'])
        return payload.get('points', []) if isinstance(payload, dict) else []

    point_ids = [point['uid'] for point in points]
    points_by_id = {point['uid']: point for point in points}

    if point_ids and _table_exists(conn, 'sondage_couches'):
        placeholders = ','.join('?' for _ in point_ids)
        couche_rows = conn.execute(
            f"SELECT * FROM sondage_couches WHERE point_terrain_id IN ({placeholders}) ORDER BY ordre, id",
            point_ids,
        ).fetchall()
        for couche_row in couche_rows:
            couche = _build_couche_payload(couche_row)
            points_by_id[couche['point_terrain_id']]['couches'].append(couche)

    if point_ids and _table_exists(conn, 'prelevements'):
        prelev_columns = _table_columns(conn, 'prelevements')
        if 'point_terrain_id' in prelev_columns:
            placeholders = ','.join('?' for _ in point_ids)
            rows = conn.execute(
                f"""
                SELECT id, reference, point_terrain_id, sondage_couche_id, date_prelevement, description, materiau, zone, statut
                FROM prelevements
                WHERE point_terrain_id IN ({placeholders})
                ORDER BY id ASC
                """,
                point_ids,
            ).fetchall()
            for row in rows:
                point_id = row['point_terrain_id']
                if point_id is None or int(point_id) not in points_by_id:
                    continue
                points_by_id[int(point_id)]['prelevements'].append({
                    'uid': int(row['id']),
                    'reference': row['reference'] or '',
                    'date_prelevement': row['date_prelevement'] or '',
                    'description': row['description'] or '',
                    'materiau': row['materiau'] or '',
                    'zone': row['zone'] or '',
                    'statut': row['statut'] or '',
                    'sondage_couche_id': row['sondage_couche_id'],
                })

    return points


def _next_point_code(conn: sqlite3.Connection, feuille_row: sqlite3.Row) -> str:
    existing_rows = _load_points(conn, feuille_row)
    numbers: list[int] = []
    for item in existing_rows:
        code = str(item.get('point_code') or '').upper().strip()
        digits = ''.join(ch for ch in code if ch.isdigit())
        if digits.isdigit():
            numbers.append(int(digits))
    return f'SP{max(numbers, default=0) + 1}'


def _get_point_row(conn: sqlite3.Connection, point_uid: int) -> sqlite3.Row:
    row = conn.execute('SELECT * FROM points_terrain WHERE id = ?', (point_uid,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f'Point terrain #{point_uid} introuvable')
    return row


def _ensure_point_belongs_to_feuille(conn: sqlite3.Connection, feuille_row: sqlite3.Row, point_uid: int) -> sqlite3.Row:
    point_row = _get_point_row(conn, point_uid)
    point_data = dict(point_row)
    if feuille_row['serie_id'] is not None and point_data.get('serie_id') == feuille_row['serie_id']:
        return point_row
    if feuille_row['intervention_id'] is not None and point_data.get('intervention_id') == feuille_row['intervention_id']:
        return point_row
    if feuille_row['demande_id'] is not None and point_data.get('demande_id') == feuille_row['demande_id']:
        return point_row
    raise HTTPException(status_code=404, detail='Point terrain non rattaché à cette feuille')


def _get_couche_row(conn: sqlite3.Connection, couche_uid: int) -> sqlite3.Row:
    row = conn.execute('SELECT * FROM sondage_couches WHERE id = ?', (couche_uid,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f'Couche #{couche_uid} introuvable')
    return row


@router.get('/{uid}')
def get_feuille_terrain(uid: int):
    with _connect() as conn:
        row = _get_feuille_row(conn, uid)

        rapport_rows = conn.execute(
            """
            SELECT id, reference, type_rapport, date_rapport, statut, titre
            FROM rapports
            WHERE feuille_terrain_id = ?
            ORDER BY date_rapport ASC, id ASC
            """,
            (uid,),
        ).fetchall()

        intervention_id = row['intervention_id']
        prelevement_rows = []
        if intervention_id:
            prelev_columns = _table_columns(conn, 'prelevements')
            point_cols = []
            if 'point_terrain_id' in prelev_columns:
                point_cols.append('point_terrain_id')
            if 'sondage_couche_id' in prelev_columns:
                point_cols.append('sondage_couche_id')
            extra_sql = ''.join(f', {col}' for col in point_cols)
            prelevement_rows = conn.execute(
                f"""
                SELECT id, reference, date_prelevement, date_reception_labo, zone, materiau,
                       finalite, description, quantite, receptionnaire, statut{extra_sql}
                FROM prelevements
                WHERE intervention_id = ?
                ORDER BY id ASC
                """,
                (intervention_id,),
            ).fetchall()

        prelevement_ids = [item['id'] for item in prelevement_rows]
        echantillon_rows = []
        if prelevement_ids:
            placeholders = ','.join('?' for _ in prelevement_ids)
            echantillon_rows = conn.execute(
                f"""
                SELECT id, reference, prelevement_id, intervention_id, designation, localisation,
                       date_prelevement, date_reception_labo, statut
                FROM echantillons
                WHERE prelevement_id IN ({placeholders})
                ORDER BY id ASC
                """,
                prelevement_ids,
            ).fetchall()

        echantillon_ids = [item['id'] for item in echantillon_rows]
        essai_rows = []
        if echantillon_ids:
            placeholders = ','.join('?' for _ in echantillon_ids)
            essai_rows = conn.execute(
                f"""
                SELECT id, echantillon_id, intervention_id, essai_code, type_essai, norme,
                       statut, date_debut, date_fin, resultat_principal, resultat_unite, resultat_label
                FROM essais
                WHERE echantillon_id IN ({placeholders})
                ORDER BY id ASC
                """,
                echantillon_ids,
            ).fetchall()

        points = _load_points(conn, row)

    payload = dict(row)
    payload['uid'] = int(payload.pop('id'))
    payload['payload'] = _parse_payload(payload.pop('resultats_json', None))
    payload['rapports'] = [dict(item) | {'uid': int(item['id'])} for item in rapport_rows]

    prelevements = [dict(item) | {'uid': int(item['id'])} for item in prelevement_rows]
    echantillons = [dict(item) | {'uid': int(item['id'])} for item in echantillon_rows]
    essais = [dict(item) | {'uid': int(item['id'])} for item in essai_rows]

    essais_by_echantillon: dict[int, list[dict[str, Any]]] = {}
    for essai in essais:
        if essai.get('echantillon_id'):
            essais_by_echantillon.setdefault(int(essai['echantillon_id']), []).append(essai)

    echantillons_by_prelevement: dict[int, list[dict[str, Any]]] = {}
    for echantillon in echantillons:
        if echantillon.get('prelevement_id'):
            enriched = dict(echantillon)
            enriched['essais'] = essais_by_echantillon.get(int(echantillon['uid']), [])
            echantillons_by_prelevement.setdefault(int(echantillon['prelevement_id']), []).append(enriched)

    for prelevement in prelevements:
        prelevement['echantillons'] = echantillons_by_prelevement.get(int(prelevement['uid']), [])

    payload['points'] = points
    payload['prelevements'] = prelevements
    return payload


@router.post('/{uid}/points')
def create_point_terrain(uid: int, body: PointTerrainPayload):
    with _connect() as conn:
        feuille_row = _get_feuille_row(conn, uid)
        point_columns = _table_columns(conn, 'points_terrain')
        if not point_columns:
            raise HTTPException(status_code=400, detail='Table points_terrain indisponible')

        next_order_row = conn.execute(
            'SELECT COALESCE(MAX(ordre), 0) + 1 AS next_ordre FROM points_terrain WHERE serie_id = ?',
            (feuille_row['serie_id'],),
        ).fetchone()
        next_order = int(next_order_row['next_ordre'] or 1)
        point_code = body.point_code.strip() or _next_point_code(conn, feuille_row)
        payload_json = {
            'date_point': body.date_point,
            'operateur': body.operateur,
            'profondeur_finale_m': body.profondeur_finale_m,
            'tenue_fouilles': body.tenue_fouilles,
            'venue_eau': body.venue_eau,
            'niveau_nappe': body.niveau_nappe,
            'arret_sondage': body.arret_sondage,
            'ouvrage': body.ouvrage,
            'notes': body.notes,
        }

        values = {
            'serie_id': feuille_row['serie_id'],
            'intervention_id': feuille_row['intervention_id'],
            'campagne_id': feuille_row['campagne_id'],
            'demande_id': feuille_row['demande_id'],
            'point_code': point_code,
            'point_type': body.point_type or feuille_row['code_feuille'] or 'SONDAGE_PELLE',
            'ordre': next_order,
            'localisation': body.localisation,
            'position_label': body.localisation,
            'profil': body.profil,
            'profondeur_bas': body.profondeur_finale_m,
            'observation': body.notes,
            'payload_json': _serialize_json(payload_json),
            'created_at': _now_sql(),
        }

        insert_values = {key: value for key, value in values.items() if key in point_columns}
        columns_sql = ', '.join(insert_values.keys())
        placeholders_sql = ', '.join('?' for _ in insert_values)
        conn.execute(
            f'INSERT INTO points_terrain ({columns_sql}) VALUES ({placeholders_sql})',
            list(insert_values.values()),
        )
        point_uid = int(conn.execute('SELECT last_insert_rowid()').fetchone()[0])
        conn.commit()

    return get_feuille_terrain(uid)


@router.put('/{uid}/points/{point_uid}')
def update_point_terrain(uid: int, point_uid: int, body: PointTerrainPayload):
    with _connect() as conn:
        feuille_row = _get_feuille_row(conn, uid)
        point_row = _ensure_point_belongs_to_feuille(conn, feuille_row, point_uid)
        point_columns = _table_columns(conn, 'points_terrain')
        existing_payload = _parse_payload(point_row['payload_json'])
        existing_payload.update({
            'date_point': body.date_point,
            'operateur': body.operateur,
            'profondeur_finale_m': body.profondeur_finale_m,
            'tenue_fouilles': body.tenue_fouilles,
            'venue_eau': body.venue_eau,
            'niveau_nappe': body.niveau_nappe,
            'arret_sondage': body.arret_sondage,
            'ouvrage': body.ouvrage,
            'notes': body.notes,
        })

        values = {
            'point_code': body.point_code.strip() or point_row['point_code'],
            'point_type': body.point_type or point_row['point_type'],
            'localisation': body.localisation,
            'position_label': body.localisation,
            'profil': body.profil,
            'profondeur_bas': body.profondeur_finale_m,
            'observation': body.notes,
            'payload_json': _serialize_json(existing_payload),
            'updated_at': _now_sql(),
        }
        update_values = {key: value for key, value in values.items() if key in point_columns}
        clause = ', '.join(f'{key} = ?' for key in update_values)
        conn.execute(
            f'UPDATE points_terrain SET {clause} WHERE id = ?',
            list(update_values.values()) + [point_uid],
        )
        conn.commit()

    return get_feuille_terrain(uid)


@router.post('/{uid}/points/{point_uid}/couches')
def create_sondage_couche(uid: int, point_uid: int, body: SondageCouchePayload):
    with _connect() as conn:
        feuille_row = _get_feuille_row(conn, uid)
        _ensure_point_belongs_to_feuille(conn, feuille_row, point_uid)
        if not _table_exists(conn, 'sondage_couches'):
            raise HTTPException(status_code=400, detail='Table sondage_couches indisponible')

        next_order_row = conn.execute(
            'SELECT COALESCE(MAX(ordre), 0) + 1 AS next_ordre FROM sondage_couches WHERE point_terrain_id = ?',
            (point_uid,),
        ).fetchone()
        next_order = int(next_order_row['next_ordre'] or 1)
        couche_columns = _table_columns(conn, 'sondage_couches')
        values = {
            'point_terrain_id': point_uid,
            'ordre': next_order,
            'z_haut': body.z_haut,
            'z_bas': body.z_bas,
            'texture_matrice': body.texture_matrice,
            'proportion_matrice': body.proportion_matrice,
            'elements_grossiers': body.elements_grossiers,
            'granulo_elements': body.granulo_elements,
            'forme_elements': body.forme_elements,
            'petrographie': body.petrographie,
            'structure': body.structure,
            'matiere_organique': body.matiere_organique,
            'couleur': body.couleur,
            'odeur': body.odeur,
            'consistance': body.consistance,
            'cohesion': body.cohesion,
            'oxydo_reduction': body.oxydo_reduction,
            'eau_porosite': body.eau_porosite,
            'horizon': body.horizon,
            'determination': body.determination,
            'geologie': body.geologie,
            'description_libre': body.description_libre,
            'payload_json': '{}',
            'created_at': _now_sql(),
            'updated_at': _now_sql(),
        }
        insert_values = {key: value for key, value in values.items() if key in couche_columns}
        conn.execute(
            f"INSERT INTO sondage_couches ({', '.join(insert_values.keys())}) VALUES ({', '.join('?' for _ in insert_values)})",
            list(insert_values.values()),
        )
        conn.commit()

    return get_feuille_terrain(uid)


@router.put('/{uid}/points/{point_uid}/couches/{couche_uid}')
def update_sondage_couche(uid: int, point_uid: int, couche_uid: int, body: SondageCouchePayload):
    with _connect() as conn:
        feuille_row = _get_feuille_row(conn, uid)
        _ensure_point_belongs_to_feuille(conn, feuille_row, point_uid)
        couche_row = _get_couche_row(conn, couche_uid)
        if int(couche_row['point_terrain_id']) != point_uid:
            raise HTTPException(status_code=404, detail='Couche non rattachée à ce point')

        couche_columns = _table_columns(conn, 'sondage_couches')
        values = {
            'z_haut': body.z_haut,
            'z_bas': body.z_bas,
            'texture_matrice': body.texture_matrice,
            'proportion_matrice': body.proportion_matrice,
            'elements_grossiers': body.elements_grossiers,
            'granulo_elements': body.granulo_elements,
            'forme_elements': body.forme_elements,
            'petrographie': body.petrographie,
            'structure': body.structure,
            'matiere_organique': body.matiere_organique,
            'couleur': body.couleur,
            'odeur': body.odeur,
            'consistance': body.consistance,
            'cohesion': body.cohesion,
            'oxydo_reduction': body.oxydo_reduction,
            'eau_porosite': body.eau_porosite,
            'horizon': body.horizon,
            'determination': body.determination,
            'geologie': body.geologie,
            'description_libre': body.description_libre,
            'updated_at': _now_sql(),
        }
        update_values = {key: value for key, value in values.items() if key in couche_columns}
        clause = ', '.join(f'{key} = ?' for key in update_values)
        conn.execute(
            f'UPDATE sondage_couches SET {clause} WHERE id = ?',
            list(update_values.values()) + [couche_uid],
        )
        conn.commit()

    return get_feuille_terrain(uid)


@router.delete('/{uid}/points/{point_uid}/couches/{couche_uid}')
def delete_sondage_couche(uid: int, point_uid: int, couche_uid: int):
    with _connect() as conn:
        feuille_row = _get_feuille_row(conn, uid)
        _ensure_point_belongs_to_feuille(conn, feuille_row, point_uid)
        couche_row = _get_couche_row(conn, couche_uid)
        if int(couche_row['point_terrain_id']) != point_uid:
            raise HTTPException(status_code=404, detail='Couche non rattachée à ce point')
        conn.execute('DELETE FROM sondage_couches WHERE id = ?', (couche_uid,))
        conn.commit()

    return {'ok': True}
