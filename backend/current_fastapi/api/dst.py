"""
api/dst.py
Router FastAPI — DST
Endpoints:
  GET    /api/dst                  → lista DST (com pesquisa e limite)
  GET    /api/dst/status           → estado da base DST
  GET    /api/dst/columns          → colunas disponíveis na tabela
  GET    /api/dst/{row_id}         → detalhe de um registo DST
  POST   /api/dst/import           → importar ficheiro Excel DST (upload)
"""
from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, status
from pydantic import BaseModel

from app.repositories.dst_repository import DstRecord, DstRepository
from app.services.dst_import_service import DstImportResult, DstImportService
from app.services.source_prefill_service import SourcePrefillService

router = APIRouter()

_repo    = DstRepository()
_service = DstImportService()
prefill_service = SourcePrefillService()


# ── Schemas de resposta ───────────────────────────────────────────────────────
class DstRowSchema(BaseModel):
    row_id: int
    data:   dict[str, Any]

    model_config = {"from_attributes": True}


class DstStatusSchema(BaseModel):
    available: bool
    db_path:   str
    row_count: int
    columns:   list[str]


class DstImportResultSchema(BaseModel):
    inserted:      int
    updated:       int
    skipped:       int
    total_rows:    int
    sheet_name:    str
    db_created:    bool
    table_created: bool


# ── helpers ───────────────────────────────────────────────────────────────────
def _record_to_schema(r: DstRecord) -> DstRowSchema:
    return DstRowSchema(row_id=r.row_id, data=r.data)


def _result_to_schema(r: DstImportResult) -> DstImportResultSchema:
    return DstImportResultSchema(
        inserted=r.inserted,
        updated=r.updated,
        skipped=r.skipped,
        total_rows=r.total_rows,
        sheet_name=r.sheet_name,
        db_created=r.db_created,
        table_created=r.table_created,
    )


# ── GET /api/dst/status ───────────────────────────────────────────────────────
@router.get(
    "/status",
    response_model=DstStatusSchema,
    summary="Estado da base DST",
    description="Informa se a base existe, quantas linhas tem e quais as colunas disponíveis.",
)
def dst_status():
    return DstStatusSchema(
        available=_repo.is_available,
        db_path=str(_repo.db_path),
        row_count=_repo.count() if _repo.is_available else 0,
        columns=_repo.get_columns(),
    )


# ── GET /api/dst/columns ──────────────────────────────────────────────────────
@router.get(
    "/columns",
    response_model=list[str],
    summary="Colunas disponíveis na tabela DST",
)
def dst_columns():
    return _repo.get_columns()


# ── GET /api/dst ──────────────────────────────────────────────────────────────
@router.get(
    "",
    response_model=list[DstRowSchema],
    summary="Listar registos DST",
    description="Devolve os registos DST com pesquisa livre e limite de linhas.",
)
def list_dst(
    search:  Optional[str] = Query(None,  description="Pesquisa livre em todos os campos"),
    column:  Optional[str] = Query(None,  description="Limitar pesquisa a esta coluna"),
    limit:   int           = Query(2000,  ge=1, le=10000, description="Número máximo de linhas"),
):
    if not _repo.is_available:
        return []

    records = _repo.search(
        search_text=search or "",
        column_name=column,
        limit=limit,
    )
    return [_record_to_schema(r) for r in records]



# ── GET /api/dst/search ───────────────────────────────────────────────────────
@router.get(
    "/search",
    summary="Recherche rapide DST pour picker",
    description="Retourne id, N° chrono, libellé, demandeur et échéance pour le picker dans le modal demande.",
)
def search_dst_quick(q: str = Query("", description="N° chrono ou libellé projet")):
    if not _repo.is_available:
        return []
    records = _repo.search(search_text=q.strip(), limit=50)
    results = []
    for r in records:
        d = r.data
        chrono   = str(d.get("N° chrono", "") or "").strip()
        libelle  = str(d.get("Libellé du projet", "") or d.get("Objet de la demande (Problématiques, Hypothèses, Objectifs, Remarques)", "") or "").strip()
        demandeur = str(d.get("Demandeur", "") or "").strip()
        echeance  = str(d.get("Remise souhaitée", "") or d.get("Echéance", "") or "").strip()
        # Tronquer l'objet à 120 chars pour l'affichage
        if len(libelle) > 120: libelle = libelle[:120] + "…"
        results.append({
            "id":        r.row_id,
            "chrono":    chrono,
            "libelle":   libelle,
            "demandeur": demandeur,
            "echeance":  echeance[:10] if echeance else "",
        })
    return results


# ── GET /api/dst/{row_id} ─────────────────────────────────────────────────────
@router.get(
    "/{row_id}",
    response_model=DstRowSchema,
    summary="Detalhe de um registo DST",
)
def get_dst(row_id: int):
    if not _repo.is_available:
        raise HTTPException(status_code=503, detail="Base DST não disponível")

    record = _repo.get_by_id(row_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Registo DST #{row_id} introuvable")

    return _record_to_schema(record)


# ── GET /api/dst/{row_id}/affaire-prefill ─────────────────────────────────────
@router.get("/{row_id}/affaire-prefill")
def dst_affaire_prefill(row_id: int):
    try:
        return prefill_service.affaire_prefill_from_dst(row_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="DST introuvable")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── GET /api/dst/{row_id}/demande-prefill ─────────────────────────────────────
@router.get("/{row_id}/demande-prefill")
def dst_demande_prefill(row_id: int):
    try:
        return prefill_service.demande_prefill_from_dst(row_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="DST introuvable")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── POST /api/dst/import ──────────────────────────────────────────────────────
@router.post(
    "/import",
    response_model=DstImportResultSchema,
    status_code=status.HTTP_200_OK,
    summary="Importar ficheiro Excel DST",
    description=(
        "Recebe um ficheiro .xlsx via upload, importa para a base DST "
        "(insert + update por N° chrono) e devolve o resultado."
    ),
)
async def import_dst_excel(
    file:       UploadFile = File(..., description="Ficheiro Excel DST (.xlsx)"),
    sheet_name: str        = Query("ExcelMergeQuery", description="Nome da folha Excel"),
):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail="Ficheiro inválido — apenas .xlsx ou .xls são aceites.",
        )

    # Guardar o upload num ficheiro temporário
    content = await file.read()

    with tempfile.NamedTemporaryFile(
        suffix=Path(file.filename).suffix,
        delete=False,
    ) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        result = _service.import_excel(tmp_path, sheet_name=sheet_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur import: {exc}")
    finally:
        tmp_path.unlink(missing_ok=True)

    return _result_to_schema(result)
