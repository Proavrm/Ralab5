"""
api/demandes.py — RaLab4 v2
Router FastAPI — Demandes (avec gestion des dossiers physiques)
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.models.demande import (
    DemandeCreateSchema,
    DemandeResponseSchema,
    DemandeRecord,
    DemandeUpdateSchema,
)
from app.repositories.demandes_repository import DemandesRepository
from app.services.demande_folder_naming import build_demande_folder_name

router = APIRouter()
_repo = DemandesRepository()


def _record_to_response(record: DemandeRecord) -> DemandeResponseSchema:
    return DemandeResponseSchema(
        uid=record.uid,
        reference_base=record.reference_base,
        reference=record.reference,
        affaire=record.affaire,
        titre=record.titre,
        client=record.client,
        chantier=record.chantier,
        numero_dst=record.numero_dst,
        nature=record.nature,
        statut=record.statut,
        demandeur=record.demandeur,
        service=record.service,
        laboratoire=record.laboratoire,
        date_demande=record.date_demande,
        echeance=record.echeance,
        priorite=record.priorite,
        description=record.description,
        observations=record.observations,
        dossier_nom_actuel=record.dossier_nom_actuel,
        dossier_path_actuel=record.dossier_path_actuel,
        a_revoir=record.a_revoir,
        note_reconciliation=record.note_reconciliation,
        source_legacy_id=record.source_legacy_id,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


# ── GET /api/demandes ─────────────────────────────────────────────────────────
@router.get("", response_model=list[DemandeResponseSchema], summary="Listar demandes")
def list_demandes(
    statut:   Optional[str]  = Query(None),
    service:  Optional[str]  = Query(None),
    priorite: Optional[str]  = Query(None),
    search:   Optional[str]  = Query(None),
    a_revoir: Optional[bool] = Query(None),
):
    records = _repo.all(
        statut=statut, service=service,
        priorite=priorite, search=search, a_revoir=a_revoir
    )
    return [_record_to_response(r) for r in records]


# ── GET /api/demandes/next-ref ────────────────────────────────────────────────
@router.get("/next-ref", summary="Próxima referência disponível")
def next_reference():
    return {"reference": _repo.next_reference()}


# ── GET /api/demandes/filters ─────────────────────────────────────────────────
@router.get("/filters", summary="Valores disponíveis para filtros")
def filter_values():
    return {
        "statuts":      _repo.distinct_values("statut"),
        "services":     _repo.distinct_values("service"),
        "laboratoires": _repo.distinct_values("laboratoire"),
        "priorites":    _repo.distinct_values("priorite"),
    }


# ── GET /api/demandes/dossiers-root ──────────────────────────────────────────
@router.get("/dossiers-root", summary="Chemin racine des dossiers demandes")
def get_dossiers_root():
    return {
        "root": "",
        "exists": False,
        "disabled": True,
        "managed_by": "affaires",
        "message": "La creation physique des dossiers n'est plus pilotee par les demandes.",
    }


# ── GET /api/demandes/{uid} ───────────────────────────────────────────────────
@router.get("/{uid}", response_model=DemandeResponseSchema, summary="Detalhe de uma demande")
def get_demande(uid: int):
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(status_code=404, detail=f"Demande #{uid} introuvable")
    return _record_to_response(record)


# ── POST /api/demandes ────────────────────────────────────────────────────────
@router.post("", response_model=DemandeResponseSchema, status_code=status.HTTP_201_CREATED, summary="Criar nova demande")
def create_demande(body: DemandeCreateSchema):
    reference = build_demande_folder_name(
        numero_demande=body.reference_base,
        affaire_etude=body.affaire,
        chantier=body.chantier,
        client=body.client,
        titre=body.titre,
    )
    dossier_nom = body.dossier_nom_actuel or reference

    record = DemandeRecord(
        uid=0,
        reference_base=body.reference_base,
        reference=reference,
        affaire=body.affaire,
        titre=body.titre,
        client=body.client,
        chantier=body.chantier,
        numero_dst=body.numero_dst,
        nature=body.nature,
        statut=body.statut,
        demandeur=body.demandeur,
        service=body.service,
        laboratoire=body.laboratoire,
        date_demande=body.date_demande,
        echeance=body.echeance,
        priorite=body.priorite,
        description=body.description,
        observations=body.observations,
        dossier_nom_actuel=dossier_nom,
        dossier_path_actuel=body.dossier_path_actuel,
        a_revoir=body.a_revoir,
        note_reconciliation=body.note_reconciliation,
        source_legacy_id=body.source_legacy_id,
    )

    created = _repo.add(record)
    return _record_to_response(created)


# ── PUT /api/demandes/{uid} ───────────────────────────────────────────────────
@router.put("/{uid}", response_model=DemandeResponseSchema, summary="Actualizar demande")
def update_demande(uid: int, body: DemandeUpdateSchema):
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(status_code=404, detail=f"Demande #{uid} introuvable")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    return _record_to_response(_repo.update(uid, fields))


# ── DELETE /api/demandes/{uid} ────────────────────────────────────────────────
@router.delete("/{uid}", status_code=status.HTTP_204_NO_CONTENT, summary="Apagar demande")
def delete_demande(uid: int):
    if not _repo.delete(uid):
        raise HTTPException(status_code=404, detail=f"Demande #{uid} introuvable")


# ── POST /api/demandes/{uid}/sync-folder ──────────────────────────────────────
@router.post(
    "/{uid}/sync-folder",
    summary="Créer ou renommer le dossier physique de la demande",
)
def sync_folder(uid: int):
    """
    Endpoint legacy neutralise : la creation physique est geree par l'affaire.
    """
    if not _repo.get_by_uid(uid):
        raise HTTPException(404, f"Demande #{uid} introuvable")
    return {
        "success": False,
        "action": "disabled",
        "error": "La gestion des dossiers des demandes est desactivee. Passe par l'affaire RST.",
        "managed_by": "affaires",
    }


# ── GET /api/demandes/{uid}/open-folder ───────────────────────────────────────
@router.get(
    "/{uid}/open-folder",
    summary="Ouvrir le dossier dans l'explorateur",
)
def open_folder(uid: int):
    """
    Endpoint legacy neutralise : l'ouverture locale se fait depuis l'affaire.
    """
    if not _repo.get_by_uid(uid):
        raise HTTPException(404, f"Demande #{uid} introuvable")
    raise HTTPException(409, detail="La gestion locale des dossiers est maintenant pilotee depuis l'affaire RST.")


# ── GET /api/demandes/{uid}/folder-status ─────────────────────────────────────
@router.get(
    "/{uid}/folder-status",
    summary="Statut du dossier physique",
)
def folder_status(uid: int):
    """Statut legacy neutralise pour les demandes."""
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(404, f"Demande #{uid} introuvable")

    return {
        "uid": uid,
        "exists": False,
        "dossier_nom": record.dossier_nom_actuel,
        "dossier_path": record.dossier_path_actuel,
        "root": "",
        "disabled": True,
        "managed_by": "affaires",
    }
