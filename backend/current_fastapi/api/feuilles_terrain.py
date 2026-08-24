from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.database import get_db_path
from app.services.prelevement_reference_service import next_prelevement_reference
from app.services.feuille_rapport_validation_service import (
    assert_feuille_rapport_editable,
    parse_resultats_payload,
)
from api.point_code_logic import allocate_next_point_code_for_scope, point_code_exists_in_scope

router = APIRouter()


class PointTerrainPayload(BaseModel):
    point_code: str = ''
    point_type: str = 'SONDAGE_PELLE'
    localisation: str = ''
    profil: str = ''
    date_point: str = ''
    operateur: str = ''
    sondeur: str = ''
    procede: str = ''
    diametre: str = ''
    type_ouvrage: str = ''
    partie_ouvrage: str = ''
    document_reference: str = ''
    profondeur_finale_m: Optional[float] = None
    carotte_total_height_m: Optional[float] = None
    tenue_fouilles: str = ''
    venue_eau: Optional[bool] = None
    niveau_nappe: str = ''
    arret_sondage: str = ''
    equipement: str = ''
    equipment_id: Optional[int] = None
    ouvrage: str = ''
    notes: str = ''
    carotte_annotations: list[dict[str, Any]] = Field(default_factory=list)
    carotte_coupes: list[dict[str, Any]] = Field(default_factory=list)
    x: Optional[float] = None
    y: Optional[float] = None
    z: Optional[float] = None
    plan_canvas_x: Optional[float] = None
    plan_canvas_y: Optional[float] = None


class SondageCouchePayload(BaseModel):
    insert_after_uid: Optional[int] = None
    sync_neighbors: Optional[bool] = True
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
    profondeur_eau: Optional[float] = None


class PrelevementFromCouchePayload(BaseModel):
    profondeur: str = ''
    quantite: str = ''


class UpdateSondagePrelevementPayload(BaseModel):
    sondage_couche_id: Optional[int] = None
    ignore_sondage_couche_match: Optional[bool] = None


class FeuilleTerrainCreatePayload(BaseModel):
    intervention_id: int
    code_feuille: str = 'SO'
    label: str = ''
    date_feuille: str = ''
    operateur: str = ''
    observations: str = ''


class FeuilleTerrainUpdatePayload(BaseModel):
    label: str = ''
    date_feuille: str = ''
    operateur: str = ''
    observations: str = ''
    payload: Optional[dict[str, Any]] = None


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(get_db_path()))
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA journal_mode = WAL')
    # Ensure profondeur_eau column exists (idempotent migration)
    try:
        conn.execute('ALTER TABLE sondage_couches ADD COLUMN profondeur_eau REAL')
        conn.commit()
    except Exception:
        pass  # Column already exists
    try:
        conn.execute('ALTER TABLE points_terrain ADD COLUMN reference TEXT')
        conn.commit()
    except Exception:
        pass  # Column already exists
    try:
        conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_points_terrain_reference_unique ON points_terrain(reference)')
        conn.commit()
    except Exception:
        pass
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


def _normalize_feuille_code(value: object) -> str:
    return str(value or '').strip().upper()


def _default_feuille_label(code_feuille: str) -> str:
    normalized = _normalize_feuille_code(code_feuille)
    if normalized == 'SC':
        return 'Sondage carotté'
    if normalized == 'SO':
        return 'Sondage à la pelle'
    if normalized == 'VC':
        return 'Feuille de visite chantier'
    if normalized == 'PLD':
        return 'Portances dynaplaque'
    if normalized == 'PL':
        return 'Portances à la plaque'
    if normalized == 'DF':
        return 'Déflexions'
    if normalized == 'FWD':
        return 'FWD / déflexions lourdes'
    return normalized or 'Feuille terrain'


def _default_point_type(code_feuille: str) -> str:
    normalized = _normalize_feuille_code(code_feuille)
    if normalized == 'SC':
        return 'SONDAGE_CAROTTE'
    if normalized == 'SO':
        return 'SONDAGE_PELLE'
    return normalized or 'POINT_TERRAIN'


def _default_point_prefix(feuille_row: sqlite3.Row) -> str:
    code_feuille = _normalize_feuille_code(feuille_row['code_feuille'])
    if code_feuille == 'SC':
        return 'SC'
    if code_feuille == 'SO':
        return 'SP'
    if code_feuille:
        return code_feuille[:2]
    return 'PT'


def _point_reference_prefix(feuille_row: sqlite3.Row) -> str:
    code_feuille = _normalize_feuille_code(feuille_row['code_feuille'])
    if code_feuille == 'SC':
        return 'CE'
    if code_feuille == 'SO':
        return 'CS'
    if code_feuille == 'DE':
        return 'DE'
    if code_feuille:
        return code_feuille[:2]
    return 'PT'


def _next_feuille_reference(conn: sqlite3.Connection, year: int, labo_code: str, code_feuille: str) -> str:
    normalized_code = _normalize_feuille_code(code_feuille)
    if not normalized_code:
        raise HTTPException(status_code=400, detail='Code feuille manquant')

    prefix = f'{year}-{labo_code}-{normalized_code}'
    rows = conn.execute(
        'SELECT reference FROM feuilles_terrain WHERE reference LIKE ?',
        (f'{prefix}%',),
    ).fetchall()
    numbers: list[int] = []
    for row in rows:
        reference = str(row['reference'] if isinstance(row, sqlite3.Row) else row[0] or '').strip().upper()
        match = re.match(rf'^{re.escape(prefix)}(\d+)$', reference)
        if match:
            numbers.append(int(match.group(1)))
    return f'{prefix}{max(numbers, default=0) + 1:04d}'


def _resolve_year_labo_for_point_reference(feuille_row: sqlite3.Row) -> tuple[int, str]:
    feuille_reference = str(feuille_row['reference'] or '').strip().upper()
    match = re.match(r'^(\d{4})-([A-Z0-9]+)-', feuille_reference)
    if match:
        return int(match.group(1)), match.group(2)

    demande_reference = str(feuille_row['demande_reference'] or '').strip().upper()
    match = re.match(r'^(\d{4})-([A-Z0-9]+)-D\d+$', demande_reference)
    if match:
        return int(match.group(1)), match.group(2)

    return datetime.now().year, 'SP'


def _next_point_reference(conn: sqlite3.Connection, feuille_row: sqlite3.Row) -> str:
    year_ref, labo_ref = _resolve_year_labo_for_point_reference(feuille_row)
    prefix_code = _point_reference_prefix(feuille_row)
    prefix = f'{year_ref}-{labo_ref}-{prefix_code}'
    rows = conn.execute(
        'SELECT reference FROM points_terrain WHERE reference LIKE ?',
        (f'{prefix}%',),
    ).fetchall()
    numbers: list[int] = []
    for row in rows:
        reference = str(row['reference'] if isinstance(row, sqlite3.Row) else row[0] or '').strip().upper()
        match = re.match(rf'^{re.escape(prefix)}(\d+)$', reference)
        if match:
            numbers.append(int(match.group(1)))
    return f'{prefix}{max(numbers, default=0) + 1:04d}'


def _parse_depth_value(value: object) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        numeric = float(value)
        return numeric if numeric >= 0 else None
    text = str(value).strip().replace(',', '.')
    if not text:
        return None
    match = re.search(r'-?\d+(?:\.\d+)?', text)
    if not match:
        return None
    try:
        numeric = float(match.group(0))
    except ValueError:
        return None
    return numeric if numeric >= 0 else None


def _match_couche_by_depth(couches: list[dict[str, Any]], depth: Optional[float]) -> Optional[dict[str, Any]]:
    if depth is None:
        return None
    for couche in couches:
        z_haut = couche.get('z_haut')
        z_bas = couche.get('z_bas')
        if z_haut is None or z_bas is None:
            continue
        low = min(float(z_haut), float(z_bas))
        high = max(float(z_haut), float(z_bas))
        if low <= depth <= high:
            return couche
    return None


def _normalize_link_key(value: object) -> str:
    text = str(value or '').strip().upper()
    return ''.join(ch for ch in text if ch.isalnum())


def _build_point_code_pattern(point_code: object) -> Optional[re.Pattern[str]]:
    compact = _normalize_link_key(point_code)
    if not compact:
        return None
    match = re.fullmatch(r'([A-Z]+)(\d+)', compact)
    if not match:
        return None
    prefix, digits = match.groups()
    normalized_digits = str(int(digits)) if digits else '0'
    return re.compile(
        rf'(?<![A-Z0-9]){re.escape(prefix)}\s*[-_/]?\s*0*{re.escape(normalized_digits)}(?![A-Z0-9])',
        re.IGNORECASE,
    )


def _match_point_by_hints(points: list[dict[str, Any]], values: list[object]) -> Optional[dict[str, Any]]:
    raw_texts = [str(value or '').strip().upper() for value in values if str(value or '').strip()]
    if not raw_texts:
        return None

    code_candidates: dict[int, dict[str, Any]] = {}
    for point in points:
        pattern = _build_point_code_pattern(point.get('point_code'))
        if pattern is None:
            continue
        if any(pattern.search(text) for text in raw_texts):
            code_candidates[int(point['uid'])] = point
    if len(code_candidates) == 1:
        return next(iter(code_candidates.values()))

    normalized_texts = [_normalize_link_key(value) for value in raw_texts]
    normalized_texts = [value for value in normalized_texts if value]
    if not normalized_texts:
        return None

    text_candidates: dict[int, dict[str, Any]] = {}
    for point in points:
        for candidate_value in (point.get('localisation'), point.get('profil')):
            candidate_key = _normalize_link_key(candidate_value)
            if len(candidate_key) < 6:
                continue
            if any(candidate_key in text for text in normalized_texts):
                text_candidates[int(point['uid'])] = point
                break
    merged_candidates = {**code_candidates, **text_candidates}
    if len(merged_candidates) == 1:
        return next(iter(merged_candidates.values()))
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

    result = {
        'uid': int(data['id']),
        'source_essai_id': data.get('source_essai_id'),
        'reference': data.get('reference') or payload.get('reference') or '',
        'point_code': data.get('point_code') or payload.get('point_code') or f"POINT-{data['id']}",
        'point_type': data.get('point_type') or payload.get('point_type') or feuille_row['code_feuille'] or '',
        'localisation': data.get('localisation') or payload.get('localisation') or data.get('position_label') or '',
        'profil': data.get('profil') or payload.get('profil') or '',
        'date_point': payload.get('date_point') or feuille_row['date_feuille'] or '',
        'operateur': payload.get('operateur') or feuille_row['operateur'] or '',
        'profondeur_finale_m': profondeur_finale,
        'carotte_total_height_m': payload.get('carotte_total_height_m'),
        'tenue_fouilles': payload.get('tenue_fouilles') or '',
        'venue_eau': _safe_bool(payload.get('venue_eau')),
        'niveau_nappe': payload.get('niveau_nappe') or '',
        'arret_sondage': payload.get('arret_sondage') or '',
        'equipement': payload.get('equipement') or '',
        'equipment_id': payload.get('equipment_id'),
        'sondeur': payload.get('sondeur') or '',
        'procede': payload.get('procede') or '',
        'diametre': payload.get('diametre') or '',
        'type_ouvrage': payload.get('type_ouvrage') or '',
        'partie_ouvrage': payload.get('partie_ouvrage') or '',
        'document_reference': payload.get('document_reference') or '',
        'ouvrage': payload.get('ouvrage') or '',
        'notes': payload.get('notes') or data.get('observation') or '',
        'carotte_annotations': payload.get('carotte_annotations') if isinstance(payload.get('carotte_annotations'), list) else [],
        'carotte_coupes': payload.get('carotte_coupes') if isinstance(payload.get('carotte_coupes'), list) else [],
        'photo_number': payload.get('photo_number') or (payload.get('meta') or {}).get('photo_number') or '',
        'photo_stored_name': payload.get('photo_stored_name') or '',
        'photo_url': payload.get('photo_url') or '',
        'ordre': int(data.get('ordre') or 0),
        'payload': payload,
        'couches': [],
        'prelevements': [],
    }
    for column in ('x', 'y', 'z', 'plan_canvas_x', 'plan_canvas_y'):
        if column in data:
            value = data.get(column)
            result[column] = float(value) if value is not None else None
    return result


def _ensure_point_references_for_feuille(conn: sqlite3.Connection, feuille_row: sqlite3.Row) -> None:
    point_columns = _table_columns(conn, 'points_terrain')
    if 'reference' not in point_columns:
        return
    if feuille_row['serie_id'] is None:
        return

    point_rows = conn.execute(
        'SELECT id, reference, payload_json FROM points_terrain WHERE serie_id = ? ORDER BY COALESCE(ordre, 0), id',
        (feuille_row['serie_id'],),
    ).fetchall()
    missing_rows = [row for row in point_rows if not str(row['reference'] or '').strip()]
    if not missing_rows:
        return

    now_sql = _now_sql()
    for point_row in missing_rows:
        point_reference = _next_point_reference(conn, feuille_row)
        payload = _parse_payload(point_row['payload_json'])
        payload['reference'] = point_reference
        conn.execute(
            'UPDATE points_terrain SET reference = ?, payload_json = ?, created_at = COALESCE(created_at, ?) WHERE id = ?',
            (point_reference, _serialize_json(payload), now_sql, int(point_row['id'])),
        )
    conn.commit()


def _build_couche_payload(couche_row: sqlite3.Row) -> dict[str, Any]:
    data = dict(couche_row)
    payload = _parse_payload(data.get('payload_json'))
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
        'profondeur_eau': data.get('profondeur_eau'),
        # SC imported from Excel stores lab metrics in payload_json.
        'd': payload.get('d'),
        'vide': payload.get('vide'),
        'compacite': payload.get('compacite'),
        'row_source': payload.get('row'),
        'prelevements': [],
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
        couches_by_id: dict[int, dict[str, Any]] = {}
        for couche_row in couche_rows:
            couche = _build_couche_payload(couche_row)
            points_by_id[couche['point_terrain_id']]['couches'].append(couche)
            couches_by_id[couche['uid']] = couche
    else:
        couches_by_id = {}

    if point_ids and _table_exists(conn, 'prelevements'):
        prelev_columns = _table_columns(conn, 'prelevements')
        if 'point_terrain_id' in prelev_columns:
            conditions: list[str] = []
            params: list[Any] = []
            if feuille_row['intervention_id'] is not None:
                conditions.append('intervention_id = ?')
                params.append(feuille_row['intervention_id'])
            elif feuille_row['demande_id'] is not None:
                conditions.append('demande_id = ? AND (intervention_id IS NULL OR intervention_id = 0)')
                params.append(feuille_row['demande_id'])

            placeholders = ','.join('?' for _ in point_ids)
            conditions.append(f'point_terrain_id IN ({placeholders})')
            params.extend(point_ids)
            rows = conn.execute(
                f"""
                SELECT id, reference, point_terrain_id, sondage_couche_id, ignore_sondage_couche_match,
                       date_prelevement, description, quantite, materiau, zone, statut
                FROM prelevements
                WHERE {' OR '.join(f'({condition})' for condition in conditions)}
                ORDER BY id ASC
                """,
                params,
            ).fetchall()

            echantillon_hints_by_prelevement: dict[int, list[sqlite3.Row]] = {}
            prelevement_ids = [int(row['id']) for row in rows]
            if prelevement_ids:
                placeholders = ','.join('?' for _ in prelevement_ids)
                echantillon_rows = conn.execute(
                    f"""
                    SELECT prelevement_id, reference, designation, localisation
                    FROM echantillons
                    WHERE prelevement_id IN ({placeholders})
                    ORDER BY id ASC
                    """,
                    prelevement_ids,
                ).fetchall()
                for echantillon_row in echantillon_rows:
                    prelevement_id = echantillon_row['prelevement_id']
                    if prelevement_id is None:
                        continue
                    echantillon_hints_by_prelevement.setdefault(int(prelevement_id), []).append(echantillon_row)

            relink_updates: list[tuple[Optional[int], Optional[int], int, str, int]] = []
            for row in rows:
                stored_point_id = row['point_terrain_id']
                resolved_point_id: Optional[int] = None
                if stored_point_id is not None and int(stored_point_id) in points_by_id:
                    resolved_point_id = int(stored_point_id)
                else:
                    hint_rows = echantillon_hints_by_prelevement.get(int(row['id']), [])
                    match_values: list[object] = [
                        row['reference'],
                        row['zone'],
                        row['description'],
                        row['materiau'],
                    ]
                    for hint_row in hint_rows:
                        match_values.extend([
                            hint_row['reference'],
                            hint_row['designation'],
                            hint_row['localisation'],
                        ])
                    matched_point = _match_point_by_hints(points, match_values)
                    if matched_point is not None:
                        resolved_point_id = int(matched_point['uid'])

                if resolved_point_id is None or resolved_point_id not in points_by_id:
                    continue
                stored_couche_id = row['sondage_couche_id']
                ignore_match = bool(row['ignore_sondage_couche_match'] or 0)
                resolved_couche_id: Optional[int] = None
                if stored_couche_id is not None:
                    stored_couche = couches_by_id.get(int(stored_couche_id))
                    if stored_couche and int(stored_couche['point_terrain_id']) == int(resolved_point_id):
                        resolved_couche_id = int(stored_couche_id)
                if not ignore_match and resolved_couche_id is None:
                    matched_couche = _match_couche_by_depth(
                        points_by_id[int(resolved_point_id)]['couches'],
                        _parse_depth_value(row['description']),
                    )
                    if matched_couche is not None:
                        resolved_couche_id = int(matched_couche['uid'])
                if ignore_match and stored_couche_id is not None:
                    relink_updates.append((resolved_point_id, None, 1, _now_sql(), int(row['id'])))
                elif stored_point_id != resolved_point_id or stored_couche_id != resolved_couche_id:
                    relink_updates.append((resolved_point_id, resolved_couche_id, 0, _now_sql(), int(row['id'])))
                prelevement_payload = {
                    'uid': int(row['id']),
                    'reference': row['reference'] or '',
                    'point_terrain_id': int(resolved_point_id),
                    'date_prelevement': row['date_prelevement'] or '',
                    'description': row['description'] or '',
                    'quantite': row['quantite'] or '',
                    'materiau': row['materiau'] or '',
                    'zone': row['zone'] or '',
                    'statut': row['statut'] or '',
                    'sondage_couche_id': resolved_couche_id,
                    'ignore_sondage_couche_match': ignore_match,
                }
                points_by_id[int(resolved_point_id)]['prelevements'].append(prelevement_payload)
                couche_id = resolved_couche_id
                if couche_id is not None and int(couche_id) in couches_by_id:
                    couches_by_id[int(couche_id)]['prelevements'].append(prelevement_payload)
            if relink_updates:
                conn.executemany(
                    '''
                    UPDATE prelevements
                    SET point_terrain_id = ?, sondage_couche_id = ?, ignore_sondage_couche_match = ?, updated_at = ?
                    WHERE id = ?
                    ''',
                    relink_updates,
                )

    return points


def _next_point_code(conn: sqlite3.Connection, feuille_row: sqlite3.Row) -> str:
    return allocate_next_point_code_for_scope(
        conn,
        _default_point_prefix(feuille_row),
        intervention_id=int(feuille_row['intervention_id']) if feuille_row['intervention_id'] is not None else None,
        serie_id=int(feuille_row['serie_id']) if feuille_row['serie_id'] is not None else None,
        demande_id=int(feuille_row['demande_id']) if feuille_row['demande_id'] is not None else None,
    )


def _point_code_exists_in_scope(
    conn: sqlite3.Connection,
    feuille_row: sqlite3.Row,
    point_code: str,
    *,
    exclude_point_uid: int | None = None,
) -> bool:
    return point_code_exists_in_scope(
        conn,
        point_code,
        intervention_id=int(feuille_row['intervention_id']) if feuille_row['intervention_id'] is not None else None,
        serie_id=int(feuille_row['serie_id']) if feuille_row['serie_id'] is not None else None,
        demande_id=int(feuille_row['demande_id']) if feuille_row['demande_id'] is not None else None,
        exclude_point_uid=exclude_point_uid,
    )


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


def _get_prelevement_row_for_feuille(conn: sqlite3.Connection, feuille_row: sqlite3.Row, prelev_uid: int) -> sqlite3.Row:
    row = conn.execute(
        '''
        SELECT id, demande_id, intervention_id, point_terrain_id, sondage_couche_id, ignore_sondage_couche_match
        FROM prelevements
        WHERE id = ?
        ''',
        (prelev_uid,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail='Prélèvement introuvable')
    allowed = (
        (feuille_row['demande_id'] and row['demande_id'] == feuille_row['demande_id']) or
        (feuille_row['intervention_id'] and row['intervention_id'] == feuille_row['intervention_id'])
    )
    if not allowed:
        raise HTTPException(status_code=403, detail='Prélèvement non lié à cette feuille')
    return row

# ── Valeurs personnalisées pour les listes de description ───────────────────

class CustomValuePayload(BaseModel):
    champ: str
    valeur: str


def _ensure_custom_values_table(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sondage_couche_custom_values (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            champ TEXT NOT NULL,
            valeur TEXT NOT NULL,
            nb_usages INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(champ, valeur)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_scc_values_champ ON sondage_couche_custom_values(champ)")


@router.get('/custom-values')
def get_all_custom_values():
    with _connect() as conn:
        _ensure_custom_values_table(conn)
        rows = conn.execute(
            "SELECT champ, valeur, nb_usages FROM sondage_couche_custom_values ORDER BY nb_usages DESC, valeur ASC"
        ).fetchall()
    result: dict = {}
    for r in rows:
        result.setdefault(r["champ"], []).append({"valeur": r["valeur"], "nb_usages": r["nb_usages"]})
    return result


@router.get('/custom-values/{champ}')
def get_custom_values(champ: str):
    with _connect() as conn:
        _ensure_custom_values_table(conn)
        rows = conn.execute(
            "SELECT valeur, nb_usages FROM sondage_couche_custom_values WHERE champ = ? ORDER BY nb_usages DESC, valeur ASC",
            (champ,)
        ).fetchall()
    return [{"valeur": r["valeur"], "nb_usages": r["nb_usages"]} for r in rows]


@router.post('/custom-values', status_code=200)
def upsert_custom_value(body: CustomValuePayload):
    valeur = str(body.valeur or '').strip()
    champ = str(body.champ or '').strip()
    if not valeur or not champ:
        return {"ok": False}
    # Normalize: strip, lowercase for comparison but keep original case
    with _connect() as conn:
        _ensure_custom_values_table(conn)
        now = _now_sql()
        conn.execute("""
            INSERT INTO sondage_couche_custom_values (champ, valeur, nb_usages, created_at, updated_at)
            VALUES (?, ?, 1, ?, ?)
            ON CONFLICT(champ, valeur) DO UPDATE SET
                nb_usages = nb_usages + 1,
                updated_at = excluded.updated_at
        """, (champ, valeur, now, now))
        conn.commit()
    return {"ok": True}


@router.delete('/custom-values/{champ}/{valeur}', status_code=200)
def delete_custom_value(champ: str, valeur: str):
    with _connect() as conn:
        _ensure_custom_values_table(conn)
        conn.execute(
            "DELETE FROM sondage_couche_custom_values WHERE champ = ? AND valeur = ?",
            (champ, valeur)
        )
        conn.commit()
    return {"ok": True}


@router.get('')
def list_feuilles_terrain(q: str = '', limit: int = 50, code_feuille: str = ''):
    text_query = str(q or '').strip()
    normalized_code = _normalize_feuille_code(code_feuille)
    normalized_limit = max(1, min(int(limit or 50), 200))

    where_parts: list[str] = []
    params: list[Any] = []

    if normalized_code:
        where_parts.append('UPPER(COALESCE(f.code_feuille, \"\")) = ?')
        params.append(normalized_code)

    if text_query:
        where_parts.append(
            """
            (
                CAST(f.id AS TEXT) = ?
                OR COALESCE(f.reference, '') LIKE ? COLLATE NOCASE
                OR COALESCE(f.label, '') LIKE ? COLLATE NOCASE
                OR COALESCE(i.reference, '') LIKE ? COLLATE NOCASE
                OR COALESCE(d.reference, '') LIKE ? COLLATE NOCASE
                OR COALESCE(c.reference, '') LIKE ? COLLATE NOCASE
            )
            """
        )
        params.append(text_query)
        like_value = f'%{text_query}%'
        params.extend([like_value, like_value, like_value, like_value, like_value])

    where_sql = f"WHERE {' AND '.join(where_parts)}" if where_parts else ''

    with _connect() as conn:
        rows = conn.execute(
            f"""
            SELECT
                f.id AS uid,
                f.reference,
                f.code_feuille,
                f.label,
                f.date_feuille,
                f.operateur,
                f.observations,
                d.reference AS demande_reference,
                c.reference AS campagne_reference,
                i.reference AS intervention_reference,
                COALESCE((
                    SELECT COUNT(*)
                    FROM points_terrain p
                    WHERE p.serie_id = f.serie_id
                ), 0) AS points_count
            FROM feuilles_terrain f
            LEFT JOIN demandes d ON d.id = f.demande_id
            LEFT JOIN campagnes c ON c.id = f.campagne_id
            LEFT JOIN interventions i ON i.id = f.intervention_id
            {where_sql}
            ORDER BY
                CASE WHEN f.date_feuille IS NULL OR f.date_feuille = '' THEN 1 ELSE 0 END,
                f.date_feuille DESC,
                f.id DESC
            LIMIT ?
            """,
            (*params, normalized_limit),
        ).fetchall()

    return [
        {
            'uid': int(row['uid']),
            'reference': row['reference'] or '',
            'code_feuille': row['code_feuille'] or '',
            'label': row['label'] or '',
            'date_feuille': row['date_feuille'] or '',
            'operateur': row['operateur'] or '',
            'observations': row['observations'] or '',
            'demande_reference': row['demande_reference'] or '',
            'campagne_reference': row['campagne_reference'] or '',
            'intervention_reference': row['intervention_reference'] or '',
            'points_count': int(row['points_count'] or 0),
        }
        for row in rows
    ]

@router.get('/{uid}')
def get_feuille_terrain(uid: int):
    with _connect() as conn:
        row = _get_feuille_row(conn, uid)
        _ensure_point_references_for_feuille(conn, row)

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
        demande_id = row['demande_id']
        prelevement_rows = []
        prelev_columns = _table_columns(conn, 'prelevements')
        point_cols = []
        if 'point_terrain_id' in prelev_columns:
            point_cols.append('point_terrain_id')
        if 'sondage_couche_id' in prelev_columns:
            point_cols.append('sondage_couche_id')
        if 'ignore_sondage_couche_match' in prelev_columns:
            point_cols.append('ignore_sondage_couche_match')
        extra_sql = ''.join(f', {col}' for col in point_cols)
        if intervention_id:
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
        elif demande_id:
            prelevement_rows = conn.execute(
                f"""
                SELECT id, reference, date_prelevement, date_reception_labo, zone, materiau,
                       finalite, description, quantite, receptionnaire, statut{extra_sql}
                FROM prelevements
                WHERE demande_id = ?
                AND (intervention_id IS NULL OR intervention_id = 0)
                ORDER BY id ASC
                """,
                (demande_id,),
            ).fetchall()

        points = _load_points(conn, row)

        prelevement_rows_by_id = {int(item['id']): item for item in prelevement_rows}
        point_prelevement_ids = sorted(
            {
                int(prelevement['uid'])
                for point in points
                for prelevement in point.get('prelevements', [])
                if prelevement.get('uid') is not None
            }
        )
        missing_point_prelevement_ids = [item for item in point_prelevement_ids if item not in prelevement_rows_by_id]
        if missing_point_prelevement_ids:
            placeholders = ','.join('?' for _ in missing_point_prelevement_ids)
            extra_sql = ''.join(f', {col}' for col in point_cols)
            extra_rows = conn.execute(
                f"""
                SELECT id, reference, date_prelevement, date_reception_labo, zone, materiau,
                       finalite, description, quantite, receptionnaire, statut{extra_sql}
                FROM prelevements
                WHERE id IN ({placeholders})
                ORDER BY id ASC
                """,
                missing_point_prelevement_ids,
            ).fetchall()
            for item in extra_rows:
                prelevement_rows_by_id[int(item['id'])] = item

        prelevement_rows = [prelevement_rows_by_id[key] for key in sorted(prelevement_rows_by_id)]
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

    payload = dict(row)
    payload['uid'] = int(payload.pop('id'))
    payload['payload'] = _parse_payload(payload.pop('resultats_json', None))
    payload['rapports'] = [dict(item) | {'uid': int(item['id'])} for item in rapport_rows]

    prelevements = [dict(item) | {'uid': int(item['id'])} for item in prelevement_rows]
    echantillons = [dict(item) | {'uid': int(item['id'])} for item in echantillon_rows]
    essais = [dict(item) | {'uid': int(item['id'])} for item in essai_rows]

    point_prelevements_by_id = {
        int(prelevement['uid']): prelevement
        for point in points
        for prelevement in point.get('prelevements', [])
        if prelevement.get('uid') is not None
    }
    for prelevement in prelevements:
        linked_prelevement = point_prelevements_by_id.get(int(prelevement['uid']))
        if linked_prelevement is None:
            continue
        prelevement['point_terrain_id'] = linked_prelevement.get('point_terrain_id')
        prelevement['sondage_couche_id'] = linked_prelevement.get('sondage_couche_id')
        prelevement['ignore_sondage_couche_match'] = linked_prelevement.get('ignore_sondage_couche_match', False)

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


@router.post('', status_code=201)
def create_feuille_terrain(body: FeuilleTerrainCreatePayload):
    code_feuille = _normalize_feuille_code(body.code_feuille)
    if not code_feuille:
        raise HTTPException(status_code=400, detail='Code feuille manquant')

    with _connect() as conn:
        intervention = conn.execute(
            '''
            SELECT
                i.id,
                i.demande_id,
                i.campagne_id,
                i.reference,
                i.date_intervention,
                i.technicien,
                i.type_intervention,
                d.annee,
                d.labo_code,
                d.reference AS demande_reference
            FROM interventions i
            JOIN demandes d ON d.id = i.demande_id
            WHERE i.id = ?
            ''',
            (int(body.intervention_id),),
        ).fetchone()
        if intervention is None:
            raise HTTPException(status_code=404, detail=f'Intervention #{body.intervention_id} introuvable')

        # Manual flow rule: year is based on creation date.
        year_ref = datetime.now().year
        labo_ref = str(intervention['labo_code'] or 'SP').strip().upper() or 'SP'
        reference = _next_feuille_reference(conn, year_ref, labo_ref, code_feuille)
        now_sql = _now_sql()
        now_stamp = datetime.now().strftime('%Y%m%d%H%M%S')

        terrain_series_intervention_id = int(intervention['id'])
        terrain_feuille_intervention_id = int(intervention['id'])

        series_columns = _table_columns(conn, 'series_essais_terrain')
        if not series_columns:
            raise HTTPException(status_code=400, detail='Table series_essais_terrain indisponible')

        series_values = {
            'reference': f'SER-{code_feuille}-{intervention["demande_id"]}-{now_stamp}',
            'demande_id': int(intervention['demande_id']),
            'campagne_id': intervention['campagne_id'],
            'intervention_id': terrain_series_intervention_id,
            'code_essai': code_feuille,
            'libelle_essai': body.label.strip() or _default_feuille_label(code_feuille),
            'source_file': '',
            'sheet_name': '',
            'group_signature': f'MANUAL|{int(intervention["id"])}|{code_feuille}|{reference}',
            'import_mode': 'manual_intervention_create',
            'statut': 'Planifiée',
            'date_essai': body.date_feuille or intervention['date_intervention'] or '',
            'operateur': body.operateur.strip() or intervention['technicien'] or '',
            'section_controlee': '',
            'couche': '',
            'observations': body.observations.strip() or f'Création manuelle depuis {intervention["reference"]}',
            'payload_json': _serialize_json({
                'source': 'manual_intervention_create',
                'intervention_id': int(intervention['id']),
                'intervention_reference': intervention['reference'] or '',
                'code_feuille': code_feuille,
            }),
            'created_at': now_sql,
            'updated_at': now_sql,
        }
        series_insert = {key: value for key, value in series_values.items() if key in series_columns}
        series_sql = ', '.join(series_insert.keys())
        series_placeholders = ', '.join('?' for _ in series_insert)
        serie_id = conn.execute(
            f'INSERT INTO series_essais_terrain ({series_sql}) VALUES ({series_placeholders})',
            tuple(series_insert.values()),
        ).lastrowid

        feuilles_columns = _table_columns(conn, 'feuilles_terrain')
        feuille_values = {
            'reference': reference,
            'demande_id': int(intervention['demande_id']),
            'campagne_id': intervention['campagne_id'],
            'intervention_id': terrain_feuille_intervention_id,
            'serie_id': int(serie_id),
            'code_feuille': code_feuille,
            'label': body.label.strip() or _default_feuille_label(code_feuille),
            'norme': '',
            'date_feuille': body.date_feuille or intervention['date_intervention'] or '',
            'operateur': body.operateur.strip() or intervention['technicien'] or '',
            'statut': 'Planifiée',
            'observations': body.observations.strip() or f'Création manuelle depuis {intervention["reference"]}',
            'resultats_json': _serialize_json({
                'source': 'manual_intervention_create',
                'intervention_id': int(intervention['id']),
                'intervention_reference': intervention['reference'] or '',
                'demande_reference': intervention['demande_reference'] or '',
                'code_feuille': code_feuille,
            }),
            'created_at': now_sql,
            'updated_at': now_sql,
        }
        feuille_insert = {key: value for key, value in feuille_values.items() if key in feuilles_columns}
        feuille_sql = ', '.join(feuille_insert.keys())
        feuille_placeholders = ', '.join('?' for _ in feuille_insert)
        feuille_id = conn.execute(
            f'INSERT INTO feuilles_terrain ({feuille_sql}) VALUES ({feuille_placeholders})',
            tuple(feuille_insert.values()),
        ).lastrowid
        conn.commit()

    return get_feuille_terrain(int(feuille_id))


@router.put('/{uid}')
def update_feuille_terrain(uid: int, body: FeuilleTerrainUpdatePayload):
    with _connect() as conn:
        feuille_row = _get_feuille_row(conn, uid)
        existing_payload = parse_resultats_payload(feuille_row['resultats_json'])
        assert_feuille_rapport_editable(existing_payload, action='modifier cette feuille')
        feuilles_columns = _table_columns(conn, 'feuilles_terrain')
        if not feuilles_columns:
            raise HTTPException(status_code=400, detail='Table feuilles_terrain indisponible')

        label = body.label.strip() or feuille_row['label'] or _default_feuille_label(feuille_row['code_feuille'])
        date_feuille = body.date_feuille or feuille_row['date_feuille'] or ''
        operateur = body.operateur.strip() or feuille_row['operateur'] or ''
        observations = body.observations.strip() or feuille_row['observations'] or ''
        now_sql = _now_sql()

        feuille_values = {
            'label': label,
            'date_feuille': date_feuille,
            'operateur': operateur,
            'observations': observations,
            'updated_at': now_sql,
        }
        if body.payload is not None:
            feuille_values['resultats_json'] = _serialize_json(body.payload)
        feuille_update = {key: value for key, value in feuille_values.items() if key in feuilles_columns}
        if feuille_update:
            clause = ', '.join(f'{key} = ?' for key in feuille_update)
            conn.execute(
                f'UPDATE feuilles_terrain SET {clause} WHERE id = ?',
                list(feuille_update.values()) + [uid],
            )

        serie_id = feuille_row['serie_id']
        series_columns = _table_columns(conn, 'series_essais_terrain')
        if serie_id is not None and series_columns:
            series_values = {
                'libelle_essai': label,
                'date_essai': date_feuille,
                'operateur': operateur,
                'observations': observations,
                'updated_at': now_sql,
            }
            if body.payload is not None:
                series_values['payload_json'] = _serialize_json(body.payload)
            series_update = {key: value for key, value in series_values.items() if key in series_columns}
            if series_update:
                clause = ', '.join(f'{key} = ?' for key in series_update)
                conn.execute(
                    f'UPDATE series_essais_terrain SET {clause} WHERE id = ?',
                    list(series_update.values()) + [int(serie_id)],
                )

        conn.commit()

    return get_feuille_terrain(uid)


@router.delete('/{uid}', status_code=200)
def delete_feuille_terrain(uid: int):
    with _connect() as conn:
        feuille_row = _get_feuille_row(conn, uid)
        serie_id = feuille_row['serie_id']
        tables = {
            'points_terrain': _table_exists(conn, 'points_terrain'),
            'sondage_couches': _table_exists(conn, 'sondage_couches'),
            'prelevements': _table_exists(conn, 'prelevements'),
        }
        prelev_columns = _table_columns(conn, 'prelevements') if tables['prelevements'] else set()

        if serie_id is not None and tables['points_terrain']:
            point_rows = conn.execute(
                'SELECT id FROM points_terrain WHERE serie_id = ? ORDER BY id ASC',
                (int(serie_id),),
            ).fetchall()
            point_ids = [int(row['id']) for row in point_rows]
            if point_ids:
                placeholders = ','.join('?' for _ in point_ids)
                if tables['sondage_couches']:
                    conn.execute(
                        f'DELETE FROM sondage_couches WHERE point_terrain_id IN ({placeholders})',
                        point_ids,
                    )
                if tables['prelevements'] and 'point_terrain_id' in prelev_columns:
                    set_parts = ['point_terrain_id = NULL']
                    if 'sondage_couche_id' in prelev_columns:
                        set_parts.append('sondage_couche_id = NULL')
                    if 'ignore_sondage_couche_match' in prelev_columns:
                        set_parts.append('ignore_sondage_couche_match = 0')
                    params: list[Any] = []
                    if 'updated_at' in prelev_columns:
                        set_parts.append('updated_at = ?')
                        params.append(_now_sql())
                    params.extend(point_ids)
                    conn.execute(
                        f'''
                        UPDATE prelevements
                        SET {', '.join(set_parts)}
                        WHERE point_terrain_id IN ({placeholders})
                        ''',
                        params,
                    )
                conn.execute(
                    f'DELETE FROM points_terrain WHERE id IN ({placeholders})',
                    point_ids,
                )

        conn.execute('DELETE FROM feuilles_terrain WHERE id = ?', (uid,))

        if serie_id is not None:
            remaining_series_link = conn.execute(
                'SELECT 1 FROM feuilles_terrain WHERE serie_id = ? AND id <> ? LIMIT 1',
                (int(serie_id), uid),
            ).fetchone()
            if remaining_series_link is None:
                conn.execute('DELETE FROM series_essais_terrain WHERE id = ?', (int(serie_id),))

        conn.commit()

    return {'ok': True}


@router.post('/{uid}/points')
def create_point_terrain(uid: int, body: PointTerrainPayload):
    with _connect() as conn:
        feuille_row = _get_feuille_row(conn, uid)
        point_columns = _table_columns(conn, 'points_terrain')
        if not point_columns:
            raise HTTPException(status_code=400, detail='Table points_terrain indisponible')

        terrain_point_intervention_id = int(feuille_row['intervention_id']) if feuille_row['intervention_id'] else None

        next_order_row = conn.execute(
            'SELECT COALESCE(MAX(ordre), 0) + 1 AS next_ordre FROM points_terrain WHERE serie_id = ?',
            (feuille_row['serie_id'],),
        ).fetchone()
        next_order = int(next_order_row['next_ordre'] or 1)
        point_reference = _next_point_reference(conn, feuille_row)
        point_code = body.point_code.strip() or _next_point_code(conn, feuille_row)
        if _point_code_exists_in_scope(conn, feuille_row, point_code):
            raise HTTPException(status_code=409, detail=f'Le point {point_code} existe déjà dans cette intervention')
        payload_json = {
            'reference': point_reference,
            'date_point': body.date_point,
            'operateur': body.operateur,
            'sondeur': body.sondeur,
            'procede': body.procede,
            'diametre': body.diametre,
            'type_ouvrage': body.type_ouvrage,
            'partie_ouvrage': body.partie_ouvrage,
            'document_reference': body.document_reference,
            'profondeur_finale_m': body.profondeur_finale_m,
            'carotte_total_height_m': body.carotte_total_height_m,
            'tenue_fouilles': body.tenue_fouilles,
            'venue_eau': body.venue_eau,
            'niveau_nappe': body.niveau_nappe,
            'arret_sondage': body.arret_sondage,
            'equipement': body.equipement,
            'equipment_id': body.equipment_id,
            'ouvrage': body.ouvrage,
            'notes': body.notes,
            'carotte_annotations': body.carotte_annotations,
            'carotte_coupes': body.carotte_coupes,
        }

        values = {
            'serie_id': feuille_row['serie_id'],
            'intervention_id': terrain_point_intervention_id,
            'campagne_id': feuille_row['campagne_id'],
            'demande_id': feuille_row['demande_id'],
            'reference': point_reference,
            'point_code': point_code,
            'point_type': body.point_type or _default_point_type(feuille_row['code_feuille']) or 'SONDAGE_PELLE',
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
            'sondeur': body.sondeur,
            'procede': body.procede,
            'diametre': body.diametre,
            'type_ouvrage': body.type_ouvrage,
            'partie_ouvrage': body.partie_ouvrage,
            'document_reference': body.document_reference,
            'profondeur_finale_m': body.profondeur_finale_m,
            'carotte_total_height_m': body.carotte_total_height_m,
            'tenue_fouilles': body.tenue_fouilles,
            'venue_eau': body.venue_eau,
            'niveau_nappe': body.niveau_nappe,
            'arret_sondage': body.arret_sondage,
            'equipement': body.equipement,
            'equipment_id': body.equipment_id,
            'ouvrage': body.ouvrage,
            'notes': body.notes,
            'carotte_annotations': body.carotte_annotations,
            'carotte_coupes': body.carotte_coupes,
        })

        next_point_code = body.point_code.strip() or point_row['point_code']
        if _point_code_exists_in_scope(conn, feuille_row, next_point_code, exclude_point_uid=point_uid):
            raise HTTPException(status_code=409, detail=f'Le point {next_point_code} existe déjà dans cette intervention')

        values = {
            'point_code': next_point_code,
            'point_type': body.point_type or point_row['point_type'],
            'localisation': body.localisation,
            'position_label': body.localisation,
            'profil': body.profil,
            'profondeur_bas': body.profondeur_finale_m,
            'observation': body.notes,
            'payload_json': _serialize_json(existing_payload),
            'updated_at': _now_sql(),
        }
        for column in ('x', 'y', 'z', 'plan_canvas_x', 'plan_canvas_y'):
            if column in point_columns and hasattr(body, column):
                raw_value = getattr(body, column)
                values[column] = float(raw_value) if raw_value is not None else None
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

        next_order: int
        next_row_to_rebase_id: Optional[int] = None
        if body.insert_after_uid is not None:
            anchor_row = conn.execute(
                'SELECT id, ordre, point_terrain_id FROM sondage_couches WHERE id = ?',
                (body.insert_after_uid,),
            ).fetchone()
            if anchor_row and int(anchor_row['point_terrain_id']) == int(point_uid):
                anchor_order = int(anchor_row['ordre'] or 0)
                next_row = conn.execute(
                    '''
                    SELECT id
                    FROM sondage_couches
                    WHERE point_terrain_id = ? AND ordre > ?
                    ORDER BY ordre ASC, id ASC
                    LIMIT 1
                    ''',
                    (point_uid, anchor_order),
                ).fetchone()
                if next_row and body.z_bas is not None:
                    next_row_to_rebase_id = int(next_row['id'])
                conn.execute(
                    'UPDATE sondage_couches SET ordre = ordre + 1, updated_at = ? WHERE point_terrain_id = ? AND ordre > ?',
                    (_now_sql(), point_uid, anchor_order),
                )
                next_order = anchor_order + 1
            else:
                next_order_row = conn.execute(
                    'SELECT COALESCE(MAX(ordre), 0) + 1 AS next_ordre FROM sondage_couches WHERE point_terrain_id = ?',
                    (point_uid,),
                ).fetchone()
                next_order = int(next_order_row['next_ordre'] or 1)
        else:
            next_order_row = conn.execute(
                'SELECT COALESCE(MAX(ordre), 0) + 1 AS next_ordre FROM sondage_couches WHERE point_terrain_id = ?',
                (point_uid,),
            ).fetchone()
            next_order = int(next_order_row['next_ordre'] or 1)

        previous_row = conn.execute(
            '''
            SELECT id
            FROM sondage_couches
            WHERE point_terrain_id = ? AND ordre < ?
            ORDER BY ordre DESC, id DESC
            LIMIT 1
            ''',
            (point_uid, next_order),
        ).fetchone()

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
            'profondeur_eau': body.profondeur_eau,
            'payload_json': '{}',
            'created_at': _now_sql(),
            'updated_at': _now_sql(),
        }
        insert_values = {key: value for key, value in values.items() if key in couche_columns}
        conn.execute(
            f"INSERT INTO sondage_couches ({', '.join(insert_values.keys())}) VALUES ({', '.join('?' for _ in insert_values)})",
            list(insert_values.values()),
        )

        if next_row_to_rebase_id is not None and 'z_haut' in couche_columns:
            conn.execute(
                'UPDATE sondage_couches SET z_haut = ?, updated_at = ? WHERE id = ?',
                (body.z_bas, _now_sql(), next_row_to_rebase_id),
            )
        if body.sync_neighbors is not False and previous_row is not None and body.z_haut is not None and 'z_bas' in couche_columns:
            conn.execute(
                'UPDATE sondage_couches SET z_bas = ?, updated_at = ? WHERE id = ?',
                (body.z_haut, _now_sql(), int(previous_row['id'])),
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
            'profondeur_eau': body.profondeur_eau,
            'updated_at': _now_sql(),
        }
        update_values = {key: value for key, value in values.items() if key in couche_columns}
        clause = ', '.join(f'{key} = ?' for key in update_values)
        conn.execute(
            f'UPDATE sondage_couches SET {clause} WHERE id = ?',
            list(update_values.values()) + [couche_uid],
        )

        if body.sync_neighbors is not False:
            current_order = int(couche_row['ordre'] or 0)
            prev_row = conn.execute(
                '''
                SELECT id
                FROM sondage_couches
                WHERE point_terrain_id = ? AND ordre < ?
                ORDER BY ordre DESC, id DESC
                LIMIT 1
                ''',
                (point_uid, current_order),
            ).fetchone()
            next_row = conn.execute(
                '''
                SELECT id
                FROM sondage_couches
                WHERE point_terrain_id = ? AND ordre > ?
                ORDER BY ordre ASC, id ASC
                LIMIT 1
                ''',
                (point_uid, current_order),
            ).fetchone()

            if prev_row is not None and body.z_haut is not None and 'z_bas' in couche_columns:
                conn.execute(
                    'UPDATE sondage_couches SET z_bas = ?, updated_at = ? WHERE id = ?',
                    (body.z_haut, _now_sql(), int(prev_row['id'])),
                )
            if next_row is not None and body.z_bas is not None and 'z_haut' in couche_columns:
                conn.execute(
                    'UPDATE sondage_couches SET z_haut = ?, updated_at = ? WHERE id = ?',
                    (body.z_bas, _now_sql(), int(next_row['id'])),
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
        conn.execute(
            '''
            UPDATE prelevements
            SET sondage_couche_id = NULL, updated_at = ?
            WHERE point_terrain_id = ? AND sondage_couche_id = ?
            ''',
            (_now_sql(), point_uid, couche_uid),
        )
        conn.execute('DELETE FROM sondage_couches WHERE id = ?', (couche_uid,))
        conn.commit()

    return get_feuille_terrain(uid)

@router.post('/{uid}/points/{point_uid}/couches/{couche_uid}/prelevements', status_code=201)
def create_prelevement_for_couche(uid: int, point_uid: int, couche_uid: int, body: PrelevementFromCouchePayload):
    with _connect() as conn:
        feuille_row = _get_feuille_row(conn, uid)
        _ensure_point_belongs_to_feuille(conn, feuille_row, point_uid)
        couche_row = _get_couche_row(conn, couche_uid)
        if int(couche_row['point_terrain_id']) != point_uid:
            raise HTTPException(status_code=404, detail='Couche non rattachée à ce point')

        demande_id = feuille_row['demande_id']
        intervention_id = feuille_row['intervention_id']
        now = _now_sql()

        reference = next_prelevement_reference(conn, demande_id=demande_id)
        row_dem = conn.execute('SELECT annee FROM demandes WHERE id = ?', (demande_id,)).fetchone() if demande_id else None
        annee = row_dem['annee'] if row_dem else datetime.now().year

        conn.execute(
            '''INSERT INTO prelevements (
                reference, demande_id, intervention_id, source_year,
                description, quantite,
                point_terrain_id, sondage_couche_id,
                ignore_sondage_couche_match,
                statut, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)''',
            (
                reference, demande_id, intervention_id,
                annee if isinstance(annee, int) else None,
                body.profondeur, body.quantite,
                point_uid, couche_uid,
                0,
                'À trier', now, now,
            ),
        )
        conn.commit()

    return get_feuille_terrain(uid)


@router.patch('/{uid}/prelevements/{prelev_uid}', status_code=200)
def update_sondage_prelevement(uid: int, prelev_uid: int, body: UpdateSondagePrelevementPayload):
    updates = body.dict(exclude_unset=True)
    if not updates:
        return get_feuille_terrain(uid)

    with _connect() as conn:
        feuille_row = _get_feuille_row(conn, uid)
        prelevement_row = _get_prelevement_row_for_feuille(conn, feuille_row, prelev_uid)
        values: dict[str, Any] = {'updated_at': _now_sql()}

        if 'sondage_couche_id' in updates:
            target_couche_id = updates['sondage_couche_id']
            if target_couche_id is None:
                values['sondage_couche_id'] = None
            else:
                couche_row = _get_couche_row(conn, int(target_couche_id))
                target_point_id = int(couche_row['point_terrain_id'])
                _ensure_point_belongs_to_feuille(conn, feuille_row, target_point_id)
                values['point_terrain_id'] = target_point_id
                values['sondage_couche_id'] = int(target_couche_id)
                values['ignore_sondage_couche_match'] = 0

        if 'ignore_sondage_couche_match' in updates:
            ignore_match = bool(updates['ignore_sondage_couche_match'])
            values['ignore_sondage_couche_match'] = 1 if ignore_match else 0
            if ignore_match:
                values['sondage_couche_id'] = None
                if prelevement_row['point_terrain_id'] is not None:
                    values.setdefault('point_terrain_id', int(prelevement_row['point_terrain_id']))

        clause = ', '.join(f'{key} = ?' for key in values)
        conn.execute(
            f'UPDATE prelevements SET {clause} WHERE id = ?',
            list(values.values()) + [prelev_uid],
        )
        conn.commit()

    return get_feuille_terrain(uid)

@router.delete('/{uid}/points/{point_uid}', status_code=200)
def delete_point_terrain(uid: int, point_uid: int):
    with _connect() as conn:
        feuille_row = _get_feuille_row(conn, uid)
        _ensure_point_belongs_to_feuille(conn, feuille_row, point_uid)

        tables = {
            'sondage_couches': _table_exists(conn, 'sondage_couches'),
            'prelevements': _table_exists(conn, 'prelevements'),
        }

        if tables['sondage_couches']:
            conn.execute('DELETE FROM sondage_couches WHERE point_terrain_id = ?', (point_uid,))

        if tables['prelevements']:
            prelev_columns = _table_columns(conn, 'prelevements')
            if 'point_terrain_id' in prelev_columns:
                set_parts = ['point_terrain_id = NULL']
                params: list[Any] = []
                if 'sondage_couche_id' in prelev_columns:
                    set_parts.append('sondage_couche_id = NULL')
                if 'ignore_sondage_couche_match' in prelev_columns:
                    set_parts.append('ignore_sondage_couche_match = 0')
                if 'updated_at' in prelev_columns:
                    set_parts.append('updated_at = ?')
                    params.append(_now_sql())
                params.append(point_uid)
                conn.execute(
                    f'''
                    UPDATE prelevements
                    SET {', '.join(set_parts)}
                    WHERE point_terrain_id = ?
                    ''',
                    params,
                )

        conn.execute('DELETE FROM points_terrain WHERE id = ?', (point_uid,))
        conn.commit()
    return get_feuille_terrain(uid)


@router.delete('/{uid}/prelevements/{prelev_uid}', status_code=200)
def delete_prelevement(uid: int, prelev_uid: int):
    with _connect() as conn:
        feuille_row = _get_feuille_row(conn, uid)
        _get_prelevement_row_for_feuille(conn, feuille_row, prelev_uid)
        conn.execute('DELETE FROM prelevements WHERE id = ?', (prelev_uid,))
        conn.commit()
    return get_feuille_terrain(uid)
