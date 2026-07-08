from __future__ import annotations

import json
import re
import sqlite3
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import get_db_path
from app.services.essai_codes_catalog import ESSAI_CODE_CATALOG
from api.feuilles_terrain import _next_point_reference as _terrain_next_point_reference
from api.nivellements import ensure_nivellement_for_intervention
from api.sc_point_schema import build_sc_point_payload

router = APIRouter()
STORAGE_ROOT = Path(__file__).resolve().parents[3] / 'storage'
PLAN_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff'}


class PlanImplantationCreatePayload(BaseModel):
    scope: str = ''
    demande_id: int | None = None
    campagne_id: int | None = None
    intervention_id: int | None = None
    titre: str = ''
    date_plan: str = ''
    operateur: str = ''
    zone: str = ''
    fond_plan: str = ''
    systeme_reperage: str = ''
    repere_base: str = ''
    observations: str = ''


class PlanImplantationUpdatePayload(BaseModel):
    scope: str | None = None
    demande_id: int | None = None
    campagne_id: int | None = None
    intervention_id: int | None = None
    titre: str | None = None
    date_plan: str | None = None
    operateur: str | None = None
    zone: str | None = None
    fond_plan: str | None = None
    systeme_reperage: str | None = None
    repere_base: str | None = None
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


def _normalize_plan_storage_path(raw_path: str | None, affaire_reference: str | None) -> str:
    path = str(raw_path or '').strip()
    if not path:
        return ''

    path = path.replace('\\', '/').lstrip('/')
    if path.lower().startswith('storage/'):
        path = path[len('storage/'):]

    if not affaire_reference:
        return path

    normalized_affaire = str(affaire_reference or '').strip().upper()
    if not normalized_affaire:
        return path

    if not path.lower().startswith('plans/'):
        return path

    parts = [segment for segment in path.split('/') if segment]
    if len(parts) < 3:
        return path

    # Force all plan images into Plans/<AFFAIRE_REFERENCE>/... while preserving file/sub-path.
    tail = '/'.join(parts[2:])
    return f'Plans/{normalized_affaire}/{tail}'


def _normalize_plan_payload_paths(payload: dict[str, Any], affaire_reference: str | None) -> dict[str, Any]:
    normalized = dict(payload or {})
    canvas = normalized.get('canvas') if isinstance(normalized.get('canvas'), dict) else None
    if isinstance(canvas, dict):
        image_path = _normalize_plan_storage_path(canvas.get('image_path'), affaire_reference)
        if image_path:
            canvas = dict(canvas)
            canvas['image_path'] = image_path
            normalized['canvas'] = canvas

    canvas_by_feuille = normalized.get('canvas_by_feuille') if isinstance(normalized.get('canvas_by_feuille'), dict) else None
    if isinstance(canvas_by_feuille, dict):
        normalized_map: dict[str, Any] = {}
        for key, value in canvas_by_feuille.items():
            if not isinstance(value, dict):
                normalized_map[str(key)] = value
                continue
            entry = dict(value)
            image_path = _normalize_plan_storage_path(entry.get('image_path'), affaire_reference)
            if image_path:
                entry['image_path'] = image_path
            normalized_map[str(key)] = entry
        normalized['canvas_by_feuille'] = normalized_map

    fond_plan = _normalize_plan_storage_path(normalized.get('fond_plan'), affaire_reference)
    if fond_plan:
        normalized['fond_plan'] = fond_plan

    return normalized


def _is_canvas_created_point(payload_raw: object) -> bool:
    payload = _parse_payload(payload_raw)
    return str(payload.get('source') or '').strip().upper() == 'PLAN_IMPLANTATION_CANVAS'


def _normalize_canvas_token(value: str) -> str:
    raw = str(value or '').strip().upper()
    if not raw:
        return ''
    return ''.join(ch for ch in unicodedata.normalize('NFKD', raw) if not unicodedata.combining(ch))


def _normalize_canvas_point_family(point_code: str, point_type: str) -> str:
    code = _normalize_canvas_token(point_code)
    normalized_type = _normalize_canvas_token(point_type)
    for prefix in (
        'PLD', 'FWD', 'SCB', 'ITSR', 'SC', 'SO', 'DE', 'HAP', 'AMI', 'DF', 'PMT', 'ADH', 'ACO',
        'PL', 'VC', 'GEN', 'PA', 'CFE', 'GPR', 'ORN', 'ARR', 'EXT', 'PCG', 'DS', 'QS', 'EAU', 'PER', 'INF', 'EE', 'EA',
    ):
        if code.startswith(prefix):
            return prefix
    if 'CAROT' in normalized_type or normalized_type == 'SC':
        return 'SC'
    if 'PELLE' in normalized_type or normalized_type in {'SO', 'SP'}:
        return 'SO'
    if 'DENSITE' in normalized_type or 'ENROBE' in normalized_type or normalized_type == 'DE':
        return 'DE'
    if 'HAP' in normalized_type:
        return 'HAP'
    if 'AMI' in normalized_type or 'AMIANTE' in normalized_type:
        return 'AMI'
    if 'FWD' in normalized_type:
        return 'FWD'
    if 'DEFLEX' in normalized_type or normalized_type == 'DF':
        return 'DF'
    if 'PMT' in normalized_type or 'MACROTEXTURE' in normalized_type:
        return 'PMT'
    if 'ADH' in normalized_type or 'ADHER' in normalized_type:
        return 'ADH'
    if 'ACO' in normalized_type or 'ACOUST' in normalized_type:
        return 'ACO'
    if 'PLD' in normalized_type or 'DYNAPLAQUE' in normalized_type:
        return 'PLD'
    if 'PLAQUE' in normalized_type or normalized_type == 'PL':
        return 'PL'
    if 'VISITE' in normalized_type or normalized_type == 'VC':
        return 'VC'
    if normalized_type in {'REPERE', 'REPÈRE'}:
        return 'REPERE'
    if normalized_type == 'OBSERVATION':
        return 'OBSERVATION'
    return ''


_CANVAS_EXCLUDED_TERRAIN_CODES = frozenset({'GEN', 'VC'})
_GENERIC_CANVAS_FAMILIES = frozenset({'REPERE', 'OBSERVATION'})
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


def _fetch_feuille_for_intervention(
    conn: sqlite3.Connection,
    feuille_id: int,
    intervention_id: int,
) -> sqlite3.Row | None:
    return conn.execute(
        '''
        SELECT id, reference, demande_id, campagne_id, intervention_id, serie_id, code_feuille
        FROM feuilles_terrain
        WHERE id = ? AND intervention_id = ?
        ''',
        [int(feuille_id), int(intervention_id)],
    ).fetchone()


def _persist_terrain_point_coords(
    conn: sqlite3.Connection,
    point_uid: int,
    columns: set[str],
    *,
    plan_canvas_x: object = None,
    plan_canvas_y: object = None,
    x: object = None,
    y: object = None,
    z: object = None,
) -> None:
    if not columns:
        return
    fields: dict[str, float | None] = {}
    mapping = {
        'plan_canvas_x': plan_canvas_x,
        'plan_canvas_y': plan_canvas_y,
        'x': x,
        'y': y,
        'z': z,
    }
    for column, raw_value in mapping.items():
        if column not in columns:
            continue
        coerced = _coerce_optional_float(raw_value)
        if coerced is None:
            continue
        fields[column] = coerced
    if not fields:
        return
    clause = ', '.join(f'{column} = ?' for column in fields)
    conn.execute(
        f'UPDATE points_terrain SET {clause} WHERE id = ?',
        [*fields.values(), int(point_uid)],
    )


def _resolve_canvas_allowed_type_options(feuilles_rows: list[sqlite3.Row]) -> list[dict[str, str]]:
    feuille_codes = {
        str(item['code_feuille'] or '').strip().upper()
        for item in feuilles_rows
        if str(item['code_feuille'] or '').strip()
    }
    options: list[dict[str, str]] = []
    seen_codes: set[str] = set()
    for entry in ESSAI_CODE_CATALOG:
        if str(entry.get('domain') or '') != 'terrain':
            continue
        code = str(entry['code'] or '').strip().upper()
        if not code or code in _CANVAS_EXCLUDED_TERRAIN_CODES or code in seen_codes:
            continue
        if feuille_codes and code not in feuille_codes:
            continue
        seen_codes.add(code)
        options.append({
            'code': code,
            'label': str(entry['label'] or code),
            'domain': 'terrain',
        })
    return options


def _resolve_canvas_allowed_types(feuilles_rows: list[sqlite3.Row]) -> list[str]:
    labels = [str(item['label']) for item in _resolve_canvas_allowed_type_options(feuilles_rows)]
    seen: set[str] = set()
    allowed: list[str] = []
    for label in labels:
        if label in seen:
            continue
        seen.add(label)
        allowed.append(label)
    for generic in ('Repère', 'Observation'):
        if generic not in seen:
            allowed.append(generic)
            seen.add(generic)
    if not allowed:
        allowed = ['Repère', 'Observation']
    return allowed


def _normalize_canvas_point_type(point_type: str, code_feuille: str) -> str:
    normalized_type = _normalize_canvas_token(point_type)
    if normalized_type in {'REPERE', 'OBSERVATION'}:
        return 'Repère' if normalized_type == 'REPERE' else 'Observation'
    normalized_code = _normalize_canvas_token(code_feuille)
    if normalized_code == 'SC' or 'CAROT' in normalized_type:
        return 'SONDAGE_CAROTTE'
    if normalized_code == 'SO' or 'PELLE' in normalized_type:
        return 'SONDAGE_PELLE'
    if normalized_code == 'DE' or 'DENSITE' in normalized_type or 'ENROBE' in normalized_type:
        return 'DENSITE_ENROBES'
    return str(point_type or '').strip()


def _find_target_feuille_for_canvas_point(
    conn: sqlite3.Connection,
    plan_row: sqlite3.Row,
    point_code: str,
    point_type: str,
) -> sqlite3.Row | None:
    family = _normalize_canvas_point_family(point_code, point_type)
    if not family:
        return None

    if not plan_row['intervention_id']:
        return None

    rows = conn.execute(
        '''
        SELECT id, reference, demande_id, campagne_id, intervention_id, serie_id, code_feuille
        FROM feuilles_terrain
        WHERE intervention_id = ? AND UPPER(TRIM(code_feuille)) = ?
        ORDER BY id ASC
        ''',
        [int(plan_row['intervention_id']), family],
    ).fetchall()
    if len(rows) == 1:
        return rows[0]
    return None


def _list_canvas_feuilles(
    conn: sqlite3.Connection,
    intervention_id: int,
    family: str | None = None,
) -> list[sqlite3.Row]:
    params: list[Any] = [int(intervention_id)]
    family_sql = ''
    if family:
        family_sql = ' AND UPPER(TRIM(code_feuille)) = ?'
        params.append(str(family).strip().upper())
    return conn.execute(
        f'''
        SELECT id, reference, serie_id, intervention_id, campagne_id, demande_id, code_feuille, date_feuille
        FROM feuilles_terrain
        WHERE intervention_id = ? {family_sql}
        ORDER BY id ASC
        ''',
        params,
    ).fetchall()


def _resolve_target_feuille_for_canvas_point(
    conn: sqlite3.Connection,
    plan_row: sqlite3.Row,
    *,
    point_code: str,
    point_type: str,
    preferred_feuille_id: int | None = None,
) -> sqlite3.Row | None:
    family = _normalize_canvas_point_family(point_code, point_type)
    if not family or not plan_row['intervention_id']:
        return None

    if preferred_feuille_id is not None:
        if family in _GENERIC_CANVAS_FAMILIES:
            preferred = _fetch_feuille_for_intervention(
                conn,
                int(preferred_feuille_id),
                int(plan_row['intervention_id']),
            )
            if preferred is not None:
                return preferred
        preferred = conn.execute(
            '''
            SELECT id, reference, demande_id, campagne_id, intervention_id, serie_id, code_feuille
            FROM feuilles_terrain
            WHERE id = ? AND intervention_id = ? AND UPPER(TRIM(code_feuille)) = ?
            ''',
            [int(preferred_feuille_id), int(plan_row['intervention_id']), family],
        ).fetchone()
        if preferred is not None:
            return preferred

    target_feuille = _find_target_feuille_for_canvas_point(conn, plan_row, point_code, point_type)
    if target_feuille is not None:
        return target_feuille

    feuilles = _list_canvas_feuilles(conn, int(plan_row['intervention_id']), family)
    if len(feuilles) == 1:
        return feuilles[0]
    return None


def _build_canvas_point_scope_filters(
    columns: set[str],
    *,
    intervention_id: int | None,
    campagne_id: int | None,
    demande_id: int | None,
    alias: str = '',
) -> tuple[list[str], list[Any]]:
    prefix = f'{alias}.' if alias else ''
    where_parts: list[str] = []
    params: list[Any] = []
    if 'intervention_id' in columns and intervention_id is not None:
        where_parts.append(f'{prefix}intervention_id = ?')
        params.append(int(intervention_id))
    if 'campagne_id' in columns and campagne_id is not None:
        where_parts.append(f'({prefix}intervention_id IS NULL AND {prefix}campagne_id = ?)')
        params.append(int(campagne_id))
    if 'demande_id' in columns and demande_id is not None:
        where_parts.append(f'({prefix}intervention_id IS NULL AND ({prefix}campagne_id IS NULL OR {prefix}campagne_id = 0) AND {prefix}demande_id = ?)')
        params.append(int(demande_id))
    return where_parts, params


def _resolve_canvas_point_uid_and_feuille(
    conn: sqlite3.Connection,
    plan_row: sqlite3.Row,
    *,
    point_code: str,
    point_type: str,
    preferred_feuille_id: int | None = None,
) -> tuple[int, int | None, str | None]:
    code = str(point_code or '').strip()
    ptype = str(point_type or '').strip()
    if not code:
        raise HTTPException(status_code=400, detail='Code point vide dans le canevas')

    point_columns = _table_columns(conn, 'points_terrain')
    if not point_columns:
        raise HTTPException(status_code=400, detail='Table points_terrain indisponible')

    where_parts: list[str] = []
    params: list[Any] = []
    if plan_row['intervention_id'] is not None:
        where_parts.append('COALESCE(pt.intervention_id, st.intervention_id) = ?')
        params.append(int(plan_row['intervention_id']))
    if plan_row['campagne_id'] is not None:
        where_parts.append("""(
            COALESCE(pt.intervention_id, st.intervention_id) IS NULL
            AND COALESCE(pt.campagne_id, st.campagne_id) = ?
        )""")
        params.append(int(plan_row['campagne_id']))
    if plan_row['demande_id'] is not None:
        where_parts.append("""(
            COALESCE(pt.intervention_id, st.intervention_id) IS NULL
            AND (COALESCE(pt.campagne_id, st.campagne_id) IS NULL OR COALESCE(pt.campagne_id, st.campagne_id) = 0)
            AND COALESCE(pt.demande_id, st.demande_id) = ?
        )""")
        params.append(int(plan_row['demande_id']))
    if not where_parts:
        raise HTTPException(status_code=400, detail='Contexte intervention indisponible pour créer un point')

    where_sql = ' OR '.join(where_parts)
    existing_rows = conn.execute(
        f'''
        SELECT pt.id, ft.id AS feuille_id, ft.reference AS feuille_reference
        FROM points_terrain pt
                LEFT JOIN series_essais_terrain st ON st.id = pt.serie_id
        LEFT JOIN feuilles_terrain ft ON ft.serie_id = pt.serie_id
        WHERE ({where_sql})
          AND UPPER(TRIM(pt.point_code)) = UPPER(TRIM(?))
        ORDER BY pt.id ASC, ft.id ASC
        ''',
        [*params, code],
    ).fetchall()
    if len(existing_rows) == 1:
        existing = existing_rows[0]
        return int(existing['id']), int(existing['feuille_id']) if existing['feuille_id'] is not None else None, str(existing['feuille_reference'] or '').strip() or None
    if len(existing_rows) > 1:
        target_feuille = _resolve_target_feuille_for_canvas_point(
            conn,
            plan_row,
            point_code=code,
            point_type=ptype,
            preferred_feuille_id=preferred_feuille_id,
        )
        if target_feuille is not None:
            scoped_rows = [
                row
                for row in existing_rows
                if row['feuille_id'] is not None and int(row['feuille_id']) == int(target_feuille['id'])
            ]
            if len(scoped_rows) == 1:
                scoped = scoped_rows[0]
                return int(scoped['id']), int(scoped['feuille_id']), str(scoped['feuille_reference'] or '').strip() or None
        raise HTTPException(
            status_code=409,
            detail=(
                f"Le code point {code} existe plusieurs fois dans le périmètre de l'intervention. "
                "Précise la feuille cible ou utilise un code unique."
            ),
        )

    target_feuille = _resolve_target_feuille_for_canvas_point(
        conn,
        plan_row,
        point_code=code,
        point_type=ptype,
        preferred_feuille_id=preferred_feuille_id,
    )
    if target_feuille is None:
        family = _normalize_canvas_point_family(code, ptype)
        feuilles = _list_canvas_feuilles(conn, int(plan_row['intervention_id']), family) if plan_row['intervention_id'] and family else []
        if len(feuilles) > 1:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Plusieurs feuilles {family} existent pour cette intervention. "
                    "Sélectionne la feuille cible dans le canvas avant d'ajouter le point."
                ),
            )
        raise HTTPException(
            status_code=422,
            detail=(
                f"Impossible de mapper le point {code} ({ptype}) vers une feuille terrain unique "
                "de l'intervention (SC/SO/DE)."
            ),
        )

    next_order_row = conn.execute(
        'SELECT COALESCE(MAX(ordre), 0) + 1 AS next_ordre FROM points_terrain WHERE serie_id = ?',
        (int(target_feuille['serie_id']),),
    ).fetchone()
    next_order = int(next_order_row['next_ordre'] or 1)
    point_reference = _terrain_next_point_reference(conn, target_feuille)
    normalized_point_type = _normalize_canvas_point_type(ptype, str(target_feuille['code_feuille'] or ''))
    if normalized_point_type == 'SONDAGE_CAROTTE':
        payload_json = build_sc_point_payload(
            reference=point_reference,
            point_code=code,
            source='PLAN_IMPLANTATION_CANVAS',
            meta={},
            couches=[],
            created_from_plan_uid=int(plan_row['id']),
            legacy_flat={},
            status='draft',
        )
    else:
        payload_json = {
            'source': 'PLAN_IMPLANTATION_CANVAS',
            'created_from_plan_uid': int(plan_row['id']),
            'reference': point_reference,
            'point_code': code,
            'point_type': normalized_point_type,
        }
    values = {
        'serie_id': int(target_feuille['serie_id']),
        'intervention_id': int(target_feuille['intervention_id']) if target_feuille['intervention_id'] is not None else None,
        'campagne_id': target_feuille['campagne_id'],
        'demande_id': target_feuille['demande_id'],
        'reference': point_reference,
        'point_code': code,
        'point_type': normalized_point_type,
        'ordre': next_order,
        'localisation': '',
        'position_label': '',
        'profil': '',
        'profondeur_bas': None,
        'observation': '',
        'payload_json': json.dumps(payload_json, ensure_ascii=False),
        'created_at': _now_sql(),
    }
    insert_values = {key: value for key, value in values.items() if key in point_columns}
    columns_sql = ', '.join(insert_values.keys())
    placeholders_sql = ', '.join('?' for _ in insert_values)
    conn.execute(f'INSERT INTO points_terrain ({columns_sql}) VALUES ({placeholders_sql})', list(insert_values.values()))
    point_uid = int(conn.execute('SELECT last_insert_rowid()').fetchone()[0])
    return point_uid, int(target_feuille['id']), str(target_feuille['reference'] or '').strip() or None


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


def _get_plan_row(conn: sqlite3.Connection, uid: int) -> sqlite3.Row:
    row = conn.execute(
        '''
        SELECT
            p.*, d.reference AS demande_reference,
            a.reference AS affaire_reference,
            c.reference AS campagne_reference,
            c.label AS campagne_label,
            i.reference AS intervention_reference,
            i.type_intervention,
            i.sujet AS intervention_subject
        FROM plans_implantation p
        LEFT JOIN demandes d ON d.id = p.demande_id
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        LEFT JOIN campagnes c ON c.id = p.campagne_id
        LEFT JOIN interventions i ON i.id = p.intervention_id
        WHERE p.id = ?
        ''',
        (uid,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Plan d'implantation #{uid} introuvable")
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


def _next_plan_reference(conn: sqlite3.Connection, year: int, labo_code: str) -> str:
    prefix = f'{year}-{str(labo_code or "RST").strip().upper()}-PI'
    rows = conn.execute('SELECT reference FROM plans_implantation WHERE reference IS NOT NULL ORDER BY id ASC').fetchall()
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


def _fetch_affaire_reference_for_demande(conn: sqlite3.Connection, demande_id: int) -> str:
    row = conn.execute(
        '''
        SELECT a.reference AS affaire_reference
        FROM demandes d
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        WHERE d.id = ?
        ''',
        (int(demande_id),),
    ).fetchone()
    return str((row['affaire_reference'] if row else '') or '').strip().upper()


def _resolve_create_context(conn: sqlite3.Connection, body: PlanImplantationCreatePayload) -> dict[str, Any]:
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


# ── List endpoint ─────────────────────────────────────────────────────────────

@router.get('')
def list_plans_implantation(
    demande_id: int | None = None,
    campagne_id: int | None = None,
    intervention_id: int | None = None,
):
    with _connect() as conn:
        conditions: list[str] = []
        params: list[Any] = []
        if intervention_id is not None:
            conditions.append('p.intervention_id = ?')
            params.append(intervention_id)
        elif campagne_id is not None:
            conditions.append('p.campagne_id = ?')
            params.append(campagne_id)
        elif demande_id is not None:
            conditions.append('p.demande_id = ?')
            params.append(demande_id)

        where = f'WHERE {" AND ".join(conditions)}' if conditions else ''
        rows = conn.execute(
            f'''
            SELECT p.id, p.reference, p.titre, p.statut,
                   p.demande_id, p.campagne_id, p.intervention_id,
                   p.fond_plan, p.date_plan, p.operateur, p.zone, p.payload_json,
                   d.reference AS demande_reference,
                     a.reference AS affaire_reference,
                   c.reference AS campagne_reference,
                   i.reference AS intervention_reference
            FROM plans_implantation p
            LEFT JOIN demandes d ON d.id = p.demande_id
                 LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
            LEFT JOIN campagnes c ON c.id = p.campagne_id
            LEFT JOIN interventions i ON i.id = p.intervention_id
            {where}
            ORDER BY p.id DESC
            ''',
            params,
        ).fetchall()

        return [
            {
                **{k: row[k] for k in row.keys() if k not in ('id', 'payload_json')},
                'uid': int(row['id']),
                'payload': _normalize_plan_payload_paths(_parse_payload(row['payload_json']), row['affaire_reference']),
                'ownership_scope': _ownership_scope(dict(row)),
                'fond_plan': _normalize_plan_storage_path(row['fond_plan'], row['affaire_reference']),
            }
            for row in rows
        ]


# ── Search points by code in an intervention ─────────────────────────────────

@router.get('/search-points')
def search_intervention_points(intervention_id: int, code: str = ''):
    """Return all canvas points matching `code` across all plans in the intervention,
    plus the full list of unique codes present in the intervention (for suggestions)."""
    with _connect() as conn:
        rows = conn.execute(
            'SELECT id, reference, titre, payload_json FROM plans_implantation WHERE intervention_id = ?',
            (intervention_id,),
        ).fetchall()

        all_codes: list[str] = []
        matches: list[dict] = []
        needle = code.strip().upper() if code else ''

        for row in rows:
            payload = _parse_payload(row['payload_json'])
            canvas_points: list[dict] = payload.get('canvas', {}).get('points', [])
            for pt in canvas_points:
                pt_code = str(pt.get('code', '')).strip()
                if pt_code:
                    all_codes.append(pt_code)
                if needle and pt_code.upper() == needle:
                    matches.append({
                        'plan_uid': int(row['id']),
                        'plan_reference': row['reference'],
                        'plan_titre': row['titre'],
                        'point_type': pt.get('type', ''),
                    })

    return {
        'code': code,
        'matches': matches,
        'all_intervention_codes': sorted(set(all_codes)),
    }


@router.get('/{uid}/image-files')
def list_plan_image_files(uid: int):
    with _connect() as conn:
        row = _get_plan_row(conn, uid)

    affaire_reference = str(row['affaire_reference'] or '').strip().upper()
    if not affaire_reference:
        return {
            'affaire_reference': '',
            'directory': '',
            'files': [],
        }

    plans_dir = STORAGE_ROOT / 'Plans' / affaire_reference
    if not plans_dir.exists() or not plans_dir.is_dir():
        return {
            'affaire_reference': affaire_reference,
            'directory': f'Plans/{affaire_reference}',
            'files': [],
        }

    files: list[dict[str, Any]] = []
    for item in plans_dir.rglob('*'):
        if not item.is_file():
            continue
        if item.suffix.lower() not in PLAN_IMAGE_EXTENSIONS:
            continue
        rel_to_affaire = item.relative_to(plans_dir).as_posix()
        rel_storage_path = f'Plans/{affaire_reference}/{rel_to_affaire}'
        stat = item.stat()
        files.append({
            'name': item.name,
            'path': rel_storage_path,
            'relative_path': rel_to_affaire,
            'size_bytes': int(stat.st_size),
            'updated_at': datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S'),
        })

    files.sort(key=lambda x: (x['relative_path'].lower(), x['name'].lower()))
    return {
        'affaire_reference': affaire_reference,
        'directory': f'Plans/{affaire_reference}',
        'files': files,
    }


# ── Canvas endpoint ───────────────────────────────────────────────────────────

class PlanCanvasPayload(BaseModel):
    image_path: str | None = None
    calibration: dict | None = None
    zone_rect: dict | None = None
    points: list | None = None
    selected_feuille_id: int | None = None


class InterventionPointCreatePayload(BaseModel):
    point_code: str
    point_type: str
    feuille_id: int | None = None


@router.get('/{uid}/intervention-points')
def list_intervention_points_for_canvas(uid: int, feuille_id: int | None = None):
    with _connect() as conn:
        row = _get_plan_row(conn, uid)
        intervention_id = row['intervention_id']
        if not intervention_id:
            return {
                'intervention_id': None,
                'intervention_reference': row['intervention_reference'] or '',
                'intervention_type': row['type_intervention'] or '',
                'allowed_types': ['Repère', 'Observation'],
                'allowed_type_options': [],
                'points': [],
            }

        payload = _parse_payload(row['payload_json'])

        intervention_type = str(row['type_intervention'] or '').strip()
        family_hint = _normalize_canvas_point_family('', intervention_type)
        feuilles_rows = _list_canvas_feuilles(conn, int(intervention_id), family_hint or None)
        feuilles = [
            {
                'id': int(item['id']),
                'reference': str(item['reference'] or '').strip(),
                'code_feuille': str(item['code_feuille'] or '').strip(),
                'date_feuille': str(item['date_feuille'] or '').strip() or None,
            }
            for item in feuilles_rows
        ]
        selected_feuille_id: int | None
        if feuille_id is not None and any(int(item['id']) == int(feuille_id) for item in feuilles_rows):
            selected_feuille_id = int(feuille_id)
        elif len(feuilles_rows) == 1:
            selected_feuille_id = int(feuilles_rows[0]['id'])
        elif feuilles_rows:
            selected_feuille_id = int(max(feuilles_rows, key=lambda item: int(item['id']))['id'])
        else:
            selected_feuille_id = None

        canvas_by_feuille = payload.get('canvas_by_feuille') if isinstance(payload.get('canvas_by_feuille'), dict) else {}
        if selected_feuille_id is not None:
            selected_canvas = canvas_by_feuille.get(str(selected_feuille_id))
            if not isinstance(selected_canvas, dict):
                selected_canvas = payload.get('canvas') if isinstance(payload.get('canvas'), dict) else {}
        else:
            selected_canvas = canvas_by_feuille.get('default') if isinstance(canvas_by_feuille.get('default'), dict) else payload.get('canvas')
            if not isinstance(selected_canvas, dict):
                selected_canvas = {}

        canvas_points = selected_canvas.get('points', []) if isinstance(selected_canvas, dict) else []
        already_used_codes = {
            str(item.get('code') or '').strip().upper()
            for item in canvas_points
            if str(item.get('code') or '').strip()
        }

        pt_columns = _table_columns(conn, 'points_terrain')
        if not pt_columns:
            raise HTTPException(status_code=400, detail='Table points_terrain indisponible')

        where_parts: list[str] = []
        params: list[Any] = []
        if intervention_id:
            where_parts.append('COALESCE(pt.intervention_id, st.intervention_id) = ?')
            params.append(int(intervention_id))
        if row['campagne_id'] is not None:
            where_parts.append("""(
                COALESCE(pt.intervention_id, st.intervention_id) IS NULL
                AND COALESCE(pt.campagne_id, st.campagne_id) = ?
            )""")
            params.append(int(row['campagne_id']))
        if row['demande_id'] is not None:
            where_parts.append("""(
                COALESCE(pt.intervention_id, st.intervention_id) IS NULL
                AND (COALESCE(pt.campagne_id, st.campagne_id) IS NULL OR COALESCE(pt.campagne_id, st.campagne_id) = 0)
                AND COALESCE(pt.demande_id, st.demande_id) = ?
            )""")
            params.append(int(row['demande_id']))

        if not where_parts:
            point_rows = []
        else:
            where_sql = ' OR '.join(where_parts)
            feuille_filter_sql = ''
            query_params: list[Any] = list(params)
            if selected_feuille_id is not None:
                feuille_filter_sql = ' AND ft.id = ?'
                where_sql = f'({where_sql}) OR ft.id = ?'
                query_params.append(int(selected_feuille_id))
                query_params.append(int(selected_feuille_id))
            elif feuilles_rows:
                feuille_ids_sql = ','.join(['?'] * len(feuilles_rows))
                where_sql = f'({where_sql}) OR ft.id IN ({feuille_ids_sql})'
                query_params.extend([int(item['id']) for item in feuilles_rows])
            point_rows = conn.execute(
                f'''
                SELECT pt.id, pt.point_code, pt.point_type, pt.ordre, pt.payload_json
                       {_terrain_coord_select_sql(pt_columns)}
                      , ft.id AS feuille_id, ft.reference AS feuille_reference, ft.date_feuille AS feuille_date_essai
                FROM points_terrain pt
                LEFT JOIN series_essais_terrain st ON st.id = pt.serie_id
                LEFT JOIN feuilles_terrain ft ON ft.serie_id = st.id
                WHERE ({where_sql})
                  {feuille_filter_sql}
                ORDER BY COALESCE(pt.ordre, 0) ASC, pt.id ASC
                ''',
                query_params,
            ).fetchall()

    allowed_type_options = _resolve_canvas_allowed_type_options(feuilles_rows)
    allowed_types = _resolve_canvas_allowed_types(feuilles_rows)

    points = []
    seen_keys: set[tuple[str, int | None]] = set()
    for point_row in point_rows:
        code = str(point_row['point_code'] or '').strip()
        if not code:
            continue
        compact_code = code.upper()
        feuille_key = int(point_row['feuille_id']) if point_row['feuille_id'] is not None else None
        unique_key = (compact_code, feuille_key)
        if unique_key in seen_keys:
            continue
        seen_keys.add(unique_key)
        normalized_type = _normalize_canvas_point_type(str(point_row['point_type'] or '').strip(), _normalize_canvas_point_family(code, str(point_row['point_type'] or '').strip()))
        point_payload = {
            'uid': int(point_row['id']),
            'point_code': code,
            'point_type': normalized_type,
            'already_in_plan': code.upper() in already_used_codes,
            'is_virtual': False,
            'feuille_id': int(point_row['feuille_id']) if point_row['feuille_id'] is not None else None,
            'feuille_reference': str(point_row['feuille_reference'] or '').strip() or None,
            'feuille_date_essai': str(point_row['feuille_date_essai'] or '').strip() or None,
        }
        for column in _TERRAIN_POINT_COORD_COLUMNS:
            if column in point_row.keys():
                point_payload[column] = _coerce_optional_float(point_row[column])
        points.append(point_payload)

    # Temporary virtual placeholders (future logic) always available in picker.
    points.append({
        'uid': None,
        'point_code': 'REPERE',
        'point_type': 'Repère',
        'already_in_plan': False,
        'is_virtual': True,
    })
    points.append({
        'uid': None,
        'point_code': 'OBS',
        'point_type': 'Observation',
        'already_in_plan': False,
        'is_virtual': True,
    })

    return {
        'intervention_id': int(intervention_id),
        'intervention_reference': row['intervention_reference'] or '',
        'intervention_type': intervention_type,
        'allowed_types': allowed_types,
        'allowed_type_options': allowed_type_options,
        'feuilles': feuilles,
        'selected_feuille_id': selected_feuille_id,
        'points': points,
    }


@router.post('/{uid}/intervention-points', status_code=201)
def create_intervention_point_for_canvas(uid: int, body: InterventionPointCreatePayload):
    point_code = str(body.point_code or '').strip()
    point_type = str(body.point_type or '').strip()
    if not point_code:
        raise HTTPException(status_code=400, detail='point_code est requis')
    if not point_type:
        raise HTTPException(status_code=400, detail='point_type est requis')

    with _connect() as conn:
        row = _get_plan_row(conn, uid)
        intervention_id = row['intervention_id']
        if not intervention_id:
            raise HTTPException(status_code=400, detail='Ce plan n\'est pas lié à une intervention')

        point_columns = _table_columns(conn, 'points_terrain')
        if not point_columns:
            raise HTTPException(status_code=400, detail='Table points_terrain indisponible')

        where_parts: list[str] = []
        params: list[Any] = []
        if 'intervention_id' in point_columns and intervention_id:
            where_parts.append('intervention_id = ?')
            params.append(int(intervention_id))
        if 'campagne_id' in point_columns and row['campagne_id'] is not None:
            where_parts.append('(intervention_id IS NULL AND campagne_id = ?)')
            params.append(int(row['campagne_id']))
        if 'demande_id' in point_columns and row['demande_id'] is not None:
            where_parts.append('(intervention_id IS NULL AND (campagne_id IS NULL OR campagne_id = 0) AND demande_id = ?)')
            params.append(int(row['demande_id']))

        if not where_parts:
            raise HTTPException(status_code=400, detail='Contexte intervention indisponible pour créer un point')

        where_sql = ' OR '.join(where_parts)
        duplicate_rows = conn.execute(
            f'''
            SELECT id, point_code, point_type, payload_json
            FROM points_terrain
            WHERE ({where_sql})
              AND UPPER(TRIM(point_code)) = UPPER(TRIM(?))
            ''',
            [*params, point_code],
        ).fetchall()
        duplicate = next((item for item in duplicate_rows if not _is_canvas_created_point(item['payload_json'])), None)
        if duplicate is not None:
            raise HTTPException(status_code=409, detail=f'Le point {point_code} existe déjà dans cette intervention')

        target_feuille = _resolve_target_feuille_for_canvas_point(
            conn,
            row,
            point_code=point_code,
            point_type=point_type,
            preferred_feuille_id=int(body.feuille_id) if body.feuille_id is not None else None,
        )
        if target_feuille is None:
            family = _normalize_canvas_point_family(point_code, point_type)
            feuilles = _list_canvas_feuilles(conn, int(intervention_id), family) if family else []
            if len(feuilles) > 1:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Plusieurs feuilles {family} existent pour cette intervention. "
                        "Sélectionne la feuille cible avant de créer le point."
                    ),
                )
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Impossible de mapper le point {point_code} ({point_type}) vers une feuille terrain unique "
                    "de l'intervention (SC/SO/DE)."
                ),
            )

        next_order_row = conn.execute(
            'SELECT COALESCE(MAX(ordre), 0) + 1 AS next_ordre FROM points_terrain WHERE serie_id = ?',
            (int(target_feuille['serie_id']),),
        ).fetchone()
        next_order = int(next_order_row['next_ordre'] or 1)
        point_reference = _terrain_next_point_reference(conn, target_feuille)
        normalized_point_type = _normalize_canvas_point_type(point_type, str(target_feuille['code_feuille'] or ''))
        if normalized_point_type == 'SONDAGE_CAROTTE':
            payload_json = build_sc_point_payload(
                reference=point_reference,
                point_code=point_code,
                source='PLAN_IMPLANTATION_CANVAS',
                meta={},
                couches=[],
                created_from_plan_uid=int(uid),
                legacy_flat={},
                status='draft',
            )
        else:
            payload_json = {
                'source': 'PLAN_IMPLANTATION_CANVAS',
                'created_from_plan_uid': int(uid),
                'reference': point_reference,
                'point_code': point_code,
                'point_type': normalized_point_type,
            }
        values = {
            'serie_id': int(target_feuille['serie_id']),
            'intervention_id': int(target_feuille['intervention_id']) if target_feuille['intervention_id'] is not None else None,
            'campagne_id': target_feuille['campagne_id'],
            'demande_id': target_feuille['demande_id'],
            'reference': point_reference,
            'point_code': point_code,
            'point_type': normalized_point_type,
            'ordre': next_order,
            'localisation': '',
            'position_label': '',
            'profil': '',
            'profondeur_bas': None,
            'observation': '',
            'payload_json': json.dumps(payload_json, ensure_ascii=False),
            'created_at': _now_sql(),
        }

        insert_values = {key: value for key, value in values.items() if key in point_columns}
        columns_sql = ', '.join(insert_values.keys())
        placeholders_sql = ', '.join('?' for _ in insert_values)
        conn.execute(f'INSERT INTO points_terrain ({columns_sql}) VALUES ({placeholders_sql})', list(insert_values.values()))
        point_uid = int(conn.execute('SELECT last_insert_rowid()').fetchone()[0])
        conn.commit()

    return {
        'uid': point_uid,
        'point_code': point_code,
        'point_type': normalized_point_type,
        'feuille_id': int(target_feuille['id']) if target_feuille is not None else None,
        'feuille_reference': str(target_feuille['reference'] or '').strip() or None if target_feuille is not None else None,
    }


@router.put('/{uid}/canvas')
def update_plan_canvas(uid: int, body: PlanCanvasPayload):
    with _connect() as conn:
        row = _get_plan_row(conn, uid)
        existing_payload = _parse_payload(row['payload_json'])

        canvas: dict[str, Any] = existing_payload.get('canvas') or {}
        if body.image_path is not None:
            canvas['image_path'] = _normalize_plan_storage_path(body.image_path.strip(), row['affaire_reference'])
        if body.calibration is not None:
            canvas['calibration'] = body.calibration
        if body.zone_rect is not None:
            canvas['zone_rect'] = body.zone_rect
        if body.points is not None:
            raw_points = body.points if isinstance(body.points, list) else []
            used_codes: set[str] = set()
            normalized_points: list[dict[str, Any]] = []
            point_columns = _table_columns(conn, 'points_terrain')
            for item in raw_points:
                point = dict(item or {})
                code = str(point.get('code') or '').strip()
                if code:
                    compact = code.upper()
                    if compact in used_codes:
                        raise HTTPException(status_code=409, detail=f'Code de point dupliqué dans le canevas: {code}')
                    used_codes.add(compact)
                    point['code'] = code
                    point_type = str(point.get('type') or '').strip()
                    normalized_type = _normalize_canvas_point_type(point_type, _normalize_canvas_point_family(code, point_type))
                    point['type'] = normalized_type

                if row['intervention_id'] is not None and code and not bool(point.get('is_virtual')):
                    linked_uid = point.get('linked_uid')
                    if linked_uid in (None, '', 0):
                        point_uid, feuille_id, feuille_reference = _resolve_canvas_point_uid_and_feuille(
                            conn,
                            row,
                            point_code=code,
                            point_type=str(point.get('type') or '').strip(),
                            preferred_feuille_id=int(point.get('feuille_id')) if point.get('feuille_id') not in (None, '', 0) else None,
                        )
                        point['linked_uid'] = int(point_uid)
                        point['feuille_id'] = feuille_id
                        point['feuille_reference'] = feuille_reference
                        linked_uid = point['linked_uid']

                    if linked_uid not in (None, '', 0):
                        _persist_terrain_point_coords(
                            conn,
                            int(linked_uid),
                            point_columns,
                            plan_canvas_x=point.get('plan_canvas_x', point.get('x')),
                            plan_canvas_y=point.get('plan_canvas_y', point.get('y')),
                            x=point.get('geo_x', point.get('coord_x')),
                            y=point.get('geo_y', point.get('coord_y')),
                            z=point.get('z'),
                        )

                normalized_points.append(point)

            canvas['points'] = normalized_points

        selected_feuille_key = str(int(body.selected_feuille_id)) if body.selected_feuille_id is not None else 'default'
        canvas_by_feuille = existing_payload.get('canvas_by_feuille') if isinstance(existing_payload.get('canvas_by_feuille'), dict) else {}
        canvas_by_feuille = dict(canvas_by_feuille)
        canvas_by_feuille[selected_feuille_key] = canvas

        existing_payload['canvas_by_feuille'] = canvas_by_feuille
        # Legacy snapshot stays tied to default canvas only (avoid leaking selected feuille canvas into global fallback).
        existing_payload['canvas'] = canvas_by_feuille.get('default', existing_payload.get('canvas') or {})
        existing_payload = _normalize_plan_payload_paths(existing_payload, row['affaire_reference'])
        conn.execute(
            'UPDATE plans_implantation SET payload_json = ?, updated_at = ? WHERE id = ?',
            (json.dumps(existing_payload, ensure_ascii=False), _now_sql(), uid),
        )
        conn.commit()

    return get_plan_implantation(uid)


@router.get('/{uid}')
def get_plan_implantation(uid: int):
    with _connect() as conn:
        row = _get_plan_row(conn, uid)

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
    payload['payload'] = _normalize_plan_payload_paths(_parse_payload(payload.pop('payload_json', None)), payload.get('affaire_reference'))
    payload['fond_plan'] = _normalize_plan_storage_path(payload.get('fond_plan'), payload.get('affaire_reference'))
    payload['ownership_scope'] = _ownership_scope(payload)
    payload['ownership_origin_label'] = _ownership_origin_label(payload)
    payload['points'] = [dict(item) | {'uid': int(item['id'])} for item in point_rows]
    payload['rapports'] = [dict(item) | {'uid': int(item['id'])} for item in rapport_rows]
    return payload


@router.post('', status_code=201)
def create_plan_implantation(body: PlanImplantationCreatePayload):
    with _connect() as conn:
        context = _resolve_create_context(conn, body)

        columns = _table_columns(conn, 'plans_implantation')
        if not columns:
            raise HTTPException(status_code=400, detail="Table plans_implantation indisponible")

        demande_row = context['demande']
        intervention = context['intervention']
        reference = _next_plan_reference(
            conn,
            int(demande_row['annee'] or datetime.now().year),
            str(demande_row['labo_code'] or 'RST'),
        )
        titre = body.titre.strip() or (
            f"Plan d'implantation {intervention['type_intervention'] or intervention['reference']}"
            if intervention
            else "Plan d'implantation"
        )
        affaire_reference = _fetch_affaire_reference_for_demande(conn, int(demande_row['id']))
        fond_plan = _normalize_plan_storage_path(body.fond_plan.strip(), affaire_reference)
        repere_base = body.repere_base.strip()
        payload_json: dict[str, Any] = {
            'type_document': 'PLAN_IMPLANTATION',
            'scope': context['scope'],
            'description': (
                f"Plan d'implantation lié à {intervention['reference']}" if intervention else "Plan d'implantation"
            ),
        }
        if fond_plan:
            payload_json['fond_plan'] = fond_plan
        if repere_base:
            payload_json['repere_base'] = repere_base

        values = {
            'reference': reference,
            'demande_id': context['demande_id'],
            'campagne_id': context['campagne_id'],
            'intervention_id': context['intervention_id'],
            'titre': titre,
            'date_plan': body.date_plan or context['date_reference'] or '',
            'operateur': body.operateur.strip() or context['operateur_default'] or '',
            'zone': body.zone.strip(),
            'fond_plan': fond_plan,
            'systeme_reperage': body.systeme_reperage.strip(),
            'repere_base': repere_base,
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
            f'INSERT INTO plans_implantation ({sql_columns}) VALUES ({placeholders})',
            tuple(insert_values.values()),
        ).lastrowid
        if context['intervention_id']:
            ensure_nivellement_for_intervention(conn, int(context['intervention_id']))
        conn.commit()

    return get_plan_implantation(int(uid))


@router.put('/{uid}')
def update_plan_implantation(uid: int, body: PlanImplantationUpdatePayload):
    with _connect() as conn:
        row = _get_plan_row(conn, uid)
        columns = _table_columns(conn, 'plans_implantation')
        if not columns:
            raise HTTPException(status_code=400, detail="Table plans_implantation indisponible")

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

        titre = body.titre.strip() if body.titre is not None else (row['titre'] or "Plan d'implantation")
        fond_plan_raw = body.fond_plan.strip() if body.fond_plan is not None else (row['fond_plan'] or '')
        fond_plan = _normalize_plan_storage_path(fond_plan_raw, row['affaire_reference'])
        repere_base = body.repere_base.strip() if body.repere_base is not None else (row['repere_base'] or '')
        existing_payload = _normalize_plan_payload_paths(_parse_payload(row['payload_json']), row['affaire_reference'])
        payload_json: dict[str, Any] = {
            **existing_payload,
            'type_document': 'PLAN_IMPLANTATION',
            'scope': next_scope,
            'description': existing_payload.get('description') or f"Plan d'implantation lié à {row['intervention_reference'] or row['reference']}",
            'fond_plan': fond_plan,
            'repere_base': repere_base,
        }

        values = {
            'demande_id': int(demande['id']),
            'campagne_id': int(campagne['id']) if campagne else None,
            'intervention_id': int(intervention['id']) if intervention else None,
            'titre': titre,
            'date_plan': body.date_plan if body.date_plan is not None else (row['date_plan'] or ''),
            'operateur': body.operateur.strip() if body.operateur is not None else (row['operateur'] or ''),
            'zone': body.zone.strip() if body.zone is not None else (row['zone'] or ''),
            'fond_plan': fond_plan,
            'systeme_reperage': body.systeme_reperage.strip() if body.systeme_reperage is not None else (row['systeme_reperage'] or ''),
            'repere_base': repere_base,
            'observations': body.observations.strip() if body.observations is not None else (row['observations'] or ''),
            'payload_json': json.dumps(payload_json, ensure_ascii=False),
            'updated_at': _now_sql(),
        }
        update_values = {key: value for key, value in values.items() if key in columns}
        clause = ', '.join(f'{key} = ?' for key in update_values)
        conn.execute(
            f'UPDATE plans_implantation SET {clause} WHERE id = ?',
            list(update_values.values()) + [uid],
        )
        if intervention:
            ensure_nivellement_for_intervention(conn, int(intervention['id']))
        conn.commit()

    return get_plan_implantation(uid)


@router.delete('/{uid}', status_code=204)
def delete_plan_implantation(uid: int):
    with _connect() as conn:
        _get_plan_row(conn, uid)

        if _table_exists(conn, 'plan_implantation_points'):
            conn.execute(
                'DELETE FROM plan_implantation_points WHERE plan_implantation_id = ?',
                (int(uid),),
            )

        rapport_columns = _table_columns(conn, 'rapports')
        if 'plan_implantation_id' in rapport_columns:
            conn.execute(
                'UPDATE rapports SET plan_implantation_id = NULL WHERE plan_implantation_id = ?',
                (int(uid),),
            )

        cur = conn.execute('DELETE FROM plans_implantation WHERE id = ?', (int(uid),))
        if not cur.rowcount:
            raise HTTPException(status_code=404, detail=f"Plan d'implantation #{uid} introuvable")
        conn.commit()
