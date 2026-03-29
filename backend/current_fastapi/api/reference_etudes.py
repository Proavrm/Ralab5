# File: reference_etudes.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services.reference_sources_service import ReferenceSourcesService


router = APIRouter()
service = ReferenceSourcesService()


@router.get('/status')
def get_reference_etudes_status() -> dict:
    try:
        report = service.get_status_report()
        return report.get('sources', {}).get('etudes', {})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post('/preview')
def preview_reference_etudes_update() -> dict:
    try:
        return service.preview_update('etudes')
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post('/update')
def apply_reference_etudes_update() -> dict:
    try:
        return service.apply_update('etudes')
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc



@router.get('/rows')
def get_reference_etudes_rows(search: str = '', limit: int = 2000) -> list:
    """Retourne les lignes de la table etudes (colonnes camelCase réelles)."""
    from app.services.reference_sources_service import ETUDES_DB_PATH
    import sqlite3
    if not ETUDES_DB_PATH.exists():
        return []
    with sqlite3.connect(ETUDES_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        sql = 'SELECT * FROM etudes'
        params: list = []
        if search:
            q = f'%{search.lower()}%'
            sql += ''' WHERE LOWER(COALESCE(nAffaire,'')) LIKE ?
                    OR LOWER(COALESCE(nomAffaire,'')) LIKE ?
                    OR LOWER(COALESCE(respEtude,'')) LIKE ?
                    OR LOWER(COALESCE(ville,'')) LIKE ?
                    OR LOWER(COALESCE(filiale,'')) LIKE ?'''
            params = [q, q, q, q, q]
        sql += f' LIMIT {int(limit)}'
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]
