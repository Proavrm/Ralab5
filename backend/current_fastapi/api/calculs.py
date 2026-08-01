"""Routes API — Calculs de dimensionnement."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, Response

from app.core.api_security import current_request_user_label
from app.models.calculs import (
    AlizeFromReferenceSchema,
    AlizePayloadUpdateSchema,
    CalculationCreateSchema,
    CalculationUpdateSchema,
)
from app.repositories.calculs_repository import CalculsRepository

router = APIRouter()
_repo = CalculsRepository()


def _user() -> str:
    return current_request_user_label()


@router.get("/summary")
def get_summary(affaire_rst_id: Optional[int] = None):
    return _repo.summary(affaire_rst_id=affaire_rst_id)


@router.get("/calculations")
def list_calculations(
    type_calcul: Optional[str] = None,
    affaire_rst_id: Optional[int] = None,
    demande_id: Optional[int] = None,
    mission_id: Optional[int] = None,
    statut: Optional[str] = None,
    search: Optional[str] = None,
):
    return _repo.list_calculations(
        type_calcul=type_calcul,
        affaire_rst_id=affaire_rst_id,
        demande_id=demande_id,
        mission_id=mission_id,
        statut=statut,
        search=search,
    )


@router.post("/calculations", status_code=201)
def create_calculation(body: CalculationCreateSchema):
    try:
        return _repo.create(body, user_name=_user())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/calculations/{calculation_id}")
def get_calculation(calculation_id: int):
    row = _repo.get(calculation_id)
    if not row:
        raise HTTPException(404, f"Calcul #{calculation_id} introuvable")
    return row


@router.patch("/calculations/{calculation_id}")
def update_calculation(calculation_id: int, body: CalculationUpdateSchema):
    row = _repo.update(calculation_id, body, user_name=_user())
    if not row:
        raise HTTPException(404, f"Calcul #{calculation_id} introuvable")
    return row


@router.post("/calculations/{calculation_id}/duplicate", status_code=201)
def duplicate_calculation(calculation_id: int):
    row = _repo.duplicate(calculation_id, user_name=_user())
    if not row:
        raise HTTPException(404, f"Calcul #{calculation_id} introuvable")
    return row


@router.patch("/calculations/{calculation_id}/alize")
def update_alize(calculation_id: int, body: AlizePayloadUpdateSchema):
    row = _repo.update_alize(calculation_id, body, user_name=_user())
    if not row:
        raise HTTPException(404, f"Calcul Alizé #{calculation_id} introuvable")
    return row


@router.post("/calculations/{calculation_id}/alize/run-reglementaire")
def run_alize_reglementaire(calculation_id: int):
    """Etape 1 : NE + valeurs admissibles εt/εz (NF P98-086)."""
    try:
        row = _repo.run_reglementaire(calculation_id, user_name=_user())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not row:
        raise HTTPException(404, f"Calcul Alizé #{calculation_id} introuvable")
    return row


@router.post("/calculations/{calculation_id}/alize/run-mecanique")
def run_alize_mecanique(calculation_id: int):
    """Etape 2 : sollicitations mécaniques εt/εz (multicouche)."""
    try:
        row = _repo.run_mecanique(calculation_id, user_name=_user())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not row:
        raise HTTPException(404, f"Calcul Alizé #{calculation_id} introuvable")
    return row


@router.post("/calculations/{calculation_id}/alize/run-complet")
def run_alize_complet(calculation_id: int):
    """Etape 1 + 2 : VA réglementaires puis sollicitations mécaniques."""
    try:
        row = _repo.run_complet(calculation_id, user_name=_user())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not row:
        raise HTTPException(404, f"Calcul Alizé #{calculation_id} introuvable")
    return row


@router.post("/calculations/{calculation_id}/apply-reference")
def apply_reference(calculation_id: int, body: AlizeFromReferenceSchema):
    row = _repo.apply_reference(
        calculation_id,
        body.ref_etude_id,
        user_name=_user(),
        replace_existing=body.replace_existing,
    )
    if not row:
        raise HTTPException(404, "Calcul ou référence introuvable")
    return row


@router.get("/calculations/{calculation_id}/fiche", response_class=HTMLResponse)
def get_fiche(calculation_id: int):
    html = _repo.build_fiche_html(calculation_id)
    if not html:
        raise HTTPException(404, f"Calcul #{calculation_id} introuvable")
    return HTMLResponse(html)


@router.get("/calculations/{calculation_id}/fiche.pdf")
def get_fiche_pdf(calculation_id: int):
    detail = _repo.get(calculation_id)
    if not detail:
        raise HTTPException(404, f"Calcul #{calculation_id} introuvable")
    pdf = _repo.build_fiche_pdf(calculation_id)
    if not pdf:
        raise HTTPException(404, f"Calcul #{calculation_id} introuvable")
    from app.services.alize_fiche_export import build_fiche_export_basename

    basename = build_fiche_export_basename(detail)
    filename = f"{basename}.pdf"
    from urllib.parse import quote

    ascii_name = "".join(ch if 32 <= ord(ch) < 127 and ch not in '\\/"' else "-" for ch in basename).strip("-.") or f"calcul_{calculation_id}"
    ascii_filename = f"{ascii_name}.pdf"
    encoded = quote(filename)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_filename}"; '
                f"filename*=UTF-8''{encoded}"
            )
        },
    )


@router.get("/catalogs/alize")
def get_alize_catalogs():
    return _repo.alize_catalogs()


@router.get("/references/alize")
def search_alize_references(search: Optional[str] = None, limit: int = 50):
    return _repo.search_ref_etudes(search=search or "", limit=min(limit, 200))


@router.get("/references/alize/{ref_etude_id}")
def get_alize_reference(ref_etude_id: int):
    row = _repo.get_ref_etude(ref_etude_id)
    if not row:
        raise HTTPException(404, f"Référence Alizé #{ref_etude_id} introuvable")
    return row


@router.post("/references/alize/{ref_etude_id}/create-calculation", status_code=201)
def create_calculation_from_reference(
    ref_etude_id: int,
    nom_calcul: Optional[str] = None,
    affaire_rst_id: Optional[int] = None,
    demande_id: Optional[int] = None,
):
    row = _repo.create_from_reference(
        ref_etude_id,
        nom_calcul=nom_calcul or "",
        affaire_rst_id=affaire_rst_id,
        demande_id=demande_id,
        user_name=_user(),
    )
    if not row:
        raise HTTPException(404, f"Référence Alizé #{ref_etude_id} introuvable")
    return row
