# File: reference_etudes.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.repositories.reference_etudes_repository import ReferenceEtudesRepository
from app.services.reference_sources_service import ReferenceSourcesService
from app.services.source_prefill_service import SourcePrefillService


router = APIRouter()
service = ReferenceSourcesService()
repo = ReferenceEtudesRepository()
prefill_service = SourcePrefillService()


@router.get('/status')
def get_reference_etudes_status() -> dict:
    try:
        report = service.get_status_report()
        return report.get('sources', {}).get('etudes', {})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get('/rows')
def list_reference_etudes_rows(
    search: str = Query(''),
    limit: int = Query(500, ge=1, le=5000),
) -> dict:
    try:
        rows = repo.list_rows(search=search, limit=limit)
        return {'rows': rows, 'count': len(rows)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get('/{row_id}')
def get_reference_etudes_row(row_id: int) -> dict:
    try:
        row = repo.get_row(row_id)
        if not row:
            raise HTTPException(status_code=404, detail='Étude introuvable')
        return row
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get('/{row_id}/affaire-prefill')
def get_reference_etudes_affaire_prefill(row_id: int) -> dict:
    try:
        return prefill_service.affaire_prefill_from_etude(row_id)
    except KeyError:
        raise HTTPException(status_code=404, detail='Étude introuvable')
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get('/{row_id}/demande-prefill')
def get_reference_etudes_demande_prefill(row_id: int) -> dict:
    try:
        return prefill_service.demande_prefill_from_etude(row_id)
    except KeyError:
        raise HTTPException(status_code=404, detail='Étude introuvable')
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
