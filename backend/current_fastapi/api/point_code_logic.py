from __future__ import annotations

import re
import sqlite3
from typing import Optional


def _normalize_prefix(prefix: object) -> str:
    return str(prefix or '').strip().upper()


def _build_scope_where_clause(
    *,
    intervention_id: int | None,
    serie_id: int | None,
    demande_id: int | None,
) -> tuple[str, tuple[int, ...]]:
    if intervention_id is not None:
        return 'intervention_id = ?', (int(intervention_id),)
    if serie_id is not None:
        return 'serie_id = ?', (int(serie_id),)
    if demande_id is not None:
        return 'demande_id = ?', (int(demande_id),)
    raise ValueError('A scope identifier is required (intervention_id, serie_id, or demande_id)')


def point_code_exists_in_scope(
    conn: sqlite3.Connection,
    point_code: str,
    *,
    intervention_id: int | None = None,
    serie_id: int | None = None,
    demande_id: int | None = None,
    exclude_point_uid: int | None = None,
) -> bool:
    normalized = str(point_code or '').strip()
    if not normalized:
        return False

    scope_sql, scope_params = _build_scope_where_clause(
        intervention_id=intervention_id,
        serie_id=serie_id,
        demande_id=demande_id,
    )

    where_parts = [scope_sql, 'UPPER(TRIM(point_code)) = UPPER(TRIM(?))']
    params: list[object] = [*scope_params, normalized]
    if exclude_point_uid is not None:
        where_parts.append('id <> ?')
        params.append(int(exclude_point_uid))

    row = conn.execute(
        f"SELECT id FROM points_terrain WHERE {' AND '.join(where_parts)} LIMIT 1",
        tuple(params),
    ).fetchone()
    return row is not None


def collect_used_point_numbers(
    conn: sqlite3.Connection,
    prefix: str,
    *,
    intervention_id: int | None = None,
    serie_id: int | None = None,
    demande_id: int | None = None,
) -> set[int]:
    normalized_prefix = _normalize_prefix(prefix)
    if not normalized_prefix:
        return set()

    scope_sql, scope_params = _build_scope_where_clause(
        intervention_id=intervention_id,
        serie_id=serie_id,
        demande_id=demande_id,
    )
    rows = conn.execute(
        f"SELECT point_code FROM points_terrain WHERE {scope_sql}",
        scope_params,
    ).fetchall()

    pattern = re.compile(rf'^{re.escape(normalized_prefix)}\\s*0*(\\d+)$', re.IGNORECASE)
    used_numbers: set[int] = set()
    for row in rows:
        code = str(row['point_code'] if isinstance(row, sqlite3.Row) else row[0] or '').strip().upper()
        match = pattern.match(code)
        if match:
            used_numbers.add(int(match.group(1)))
    return used_numbers


def allocate_next_point_code_for_scope(
    conn: sqlite3.Connection,
    prefix: str,
    *,
    intervention_id: int | None = None,
    serie_id: int | None = None,
    demande_id: int | None = None,
    preferred_number: Optional[int] = None,
    reserved_numbers: Optional[set[int]] = None,
) -> str:
    normalized_prefix = _normalize_prefix(prefix)
    if not normalized_prefix:
        raise ValueError('Point code prefix is required')

    used_numbers = collect_used_point_numbers(
        conn,
        normalized_prefix,
        intervention_id=intervention_id,
        serie_id=serie_id,
        demande_id=demande_id,
    )
    if reserved_numbers:
        used_numbers.update(int(item) for item in reserved_numbers if int(item) > 0)

    if isinstance(preferred_number, int) and preferred_number > 0 and preferred_number not in used_numbers:
        chosen = int(preferred_number)
    else:
        chosen = max(used_numbers, default=0) + 1

    if reserved_numbers is not None:
        reserved_numbers.add(chosen)
    return f'{normalized_prefix}{chosen}'
