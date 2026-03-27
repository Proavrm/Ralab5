"""
api/qualite.py
Safe placeholder routes for legacy quality calls that are not migrated yet.
"""
from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()


@router.get("/stats")
def get_quality_stats():
    return {
        "module": "qualite",
        "status": "standby",
        "message": "Le module qualité détaillé n'est pas encore migré dans RaLab4.",
        "equipment_total": 0,
        "equipment_active": 0,
        "equipment_reformed": 0,
        "metrology_due": 0,
        "audits_open": 0,
    }


@router.get("/equipment")
def list_equipment():
    return []
