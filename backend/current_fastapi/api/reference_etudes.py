# File: reference_etudes.py
from __future__ import annotations
import sqlite3
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, File, HTTPException, UploadFile
from app.services.reference_sources_service import ReferenceSourcesService

router = APIRouter()
service = ReferenceSourcesService()

PROJECT_ROOT = Path(__file__).resolve().parents[3]
ETUDES_DB_PATH = PROJECT_ROOT / "backend" / "current_fastapi" / "data" / "etudes.db"
ETUDES_REFERENCE_DIR = PROJECT_ROOT / "storage" / "references" / "etudes"


def _save_uploaded_etudes_file(uploaded_file: UploadFile) -> Path:
    filename = (uploaded_file.filename or "").strip()
    if not filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Le fichier Études doit être au format .xlsx")

    ETUDES_REFERENCE_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target_path = ETUDES_REFERENCE_DIR / f"DEPA_Tableau de bord_upload_{timestamp}.xlsx"
    payload = uploaded_file.file.read()

    if not payload:
        raise HTTPException(status_code=400, detail="Fichier vide")

    target_path.write_bytes(payload)
    return target_path


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


@router.post('/preview-upload')
def preview_reference_etudes_upload(file: UploadFile = File(...)) -> dict:
    try:
        saved = _save_uploaded_etudes_file(file)
        preview = service.preview_update('etudes')
        preview['uploaded_file_path'] = str(saved)
        preview['uploaded_file_name'] = saved.name
        return preview
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post('/update-upload')
def apply_reference_etudes_upload(file: UploadFile = File(...)) -> dict:
    try:
        saved = _save_uploaded_etudes_file(file)
        result = service.apply_update('etudes')
        result['uploaded_file_path'] = str(saved)
        result['uploaded_file_name'] = saved.name
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get('/rows')
def list_reference_etudes_rows(search: str | None = None, limit: int = 2000) -> list[dict]:
    """
    Retourne les lignes de la table etudes avec noms de champs en snake_case
    pour compatibilité avec le frontend (etudes.html et EtudesPage.jsx).
    BD stocke en camelCase (nAffaire, nomAffaire…) → on mappe en snake_case.
    """
    if not ETUDES_DB_PATH.exists():
        return []
    with sqlite3.connect(ETUDES_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        sql = """
            SELECT
                id,
                nAffaire            AS numero_etude,
                nomAffaire          AS nom_affaire,
                filiale,
                orga1, orga2,
                direction,
                pays,
                dept                AS departement,
                ville,
                maitreOuvrage       AS maitre_ouvrage,
                maitreOuvre         AS maitre_oeuvre,
                mandataire,
                membresGroupement   AS membres_groupement,
                taxonimie,
                respEtude           AS responsable_etude,
                statuAffaire        AS statut_affaire,
                dateReceptionDossier        AS date_reception_dossier,
                dateInformationAttribution  AS date_information_attribution
            FROM etudes
        """
        params: list = []
        if search:
            q = f'%{search.lower()}%'
            sql += (
                " WHERE LOWER(COALESCE(nAffaire,'')) LIKE ?"
                " OR LOWER(COALESCE(nomAffaire,'')) LIKE ?"
                " OR LOWER(COALESCE(respEtude,'')) LIKE ?"
                " OR LOWER(COALESCE(ville,'')) LIKE ?"
                " OR LOWER(COALESCE(filiale,'')) LIKE ?"
            )
            params = [q, q, q, q, q]
        sql += f' LIMIT {int(limit)}'
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


@router.get('/rows/{row_id}')
def get_reference_etudes_row(row_id: int) -> dict:
    if not ETUDES_DB_PATH.exists():
        raise HTTPException(status_code=404, detail="Base etudes non disponible")
    with sqlite3.connect(ETUDES_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("""
            SELECT id,
                nAffaire AS numero_etude, nomAffaire AS nom_affaire,
                filiale, direction, pays, dept AS departement, ville,
                maitreOuvrage AS maitre_ouvrage, maitreOuvre AS maitre_oeuvre,
                mandataire, respEtude AS responsable_etude,
                statuAffaire AS statut_affaire,
                dateReceptionDossier AS date_reception_dossier,
                dateInformationAttribution AS date_information_attribution
            FROM etudes WHERE id = ?
        """, (row_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Étude #{row_id} introuvable")
    return dict(row)
