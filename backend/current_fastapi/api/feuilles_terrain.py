from __future__ import annotations

import json
import re
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
    profondeur_eau: Optional[float] = None


class PrelevementFromCouchePayload(BaseModel):
    profondeur: str = ''
    quantite: str = ''


class UpdateSondagePrelevementPayload(BaseModel):
    sondage_couche_id: Optional[int] = None
    ignore_sondage_couche_match: Optional[bool] = None


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
        'profondeur_eau': data.get('profondeur_eau'),
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

    return {'ok': True}

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

        # Generate reference
        row_dem = conn.execute('SELECT annee, labo_code FROM demandes WHERE id = ?', (demande_id,)).fetchone() if demande_id else None
        annee = row_dem['annee'] if row_dem else datetime.now().year
        labo = row_dem['labo_code'] if row_dem else 'SP'
        prefix = f'{annee}-{labo}-P'
        existing = conn.execute('SELECT reference FROM prelevements WHERE reference LIKE ?', (f'{prefix}%',)).fetchall()
        nums = [int(r['reference'][len(prefix):]) for r in existing if r['reference'][len(prefix):].isdigit()]
        reference = f'{prefix}{max(nums, default=0) + 1:04d}'

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
        conn.execute('DELETE FROM sondage_couches WHERE point_terrain_id = ?', (point_uid,))
        conn.execute(
            '''
            UPDATE prelevements
            SET point_terrain_id = NULL, sondage_couche_id = NULL, ignore_sondage_couche_match = 0, updated_at = ?
            WHERE point_terrain_id = ?
            ''',
            (_now_sql(), point_uid),
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
