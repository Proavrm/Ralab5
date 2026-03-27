# File: reference_sources.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services.reference_sources_service import ReferenceSourcesService


router = APIRouter()
service = ReferenceSourcesService()


@router.get('/status')
def get_reference_sources_status() -> dict:
    return service.get_status_report()


@router.post('/preview/{source_type}')
def preview_reference_source_update(source_type: str) -> dict:
    if source_type not in ('affaires', 'etudes'):
        raise HTTPException(status_code=400, detail='source_type invalide')
    try:
        return service.preview_update(source_type)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post('/update/{source_type}')
def apply_reference_source_update(source_type: str) -> dict:
    if source_type not in ('affaires', 'etudes'):
        raise HTTPException(status_code=400, detail='source_type invalide')
    try:
        return service.apply_update(source_type)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
