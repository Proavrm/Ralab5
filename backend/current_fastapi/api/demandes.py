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
from app.services.demande_folder_service import DemandeFolderService

router = APIRouter()
_repo = DemandesRepository()
_folders = DemandeFolderService()


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
    """Retourne le chemin racine utilisé pour les dossiers demandes."""
    root = _folders.get_root()
    return {
        "root": str(root),
        "exists": root.exists(),
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

    # Créer le dossier physique
    folder_result = _folders.sync_folder(record)
    # On ne bloque pas la création si le dossier échoue — on log simplement
    # (le dossier peut être sur un réseau temporairement inaccessible)

    created = _repo.add(record)
    return _record_to_response(created)


# ── PUT /api/demandes/{uid} ───────────────────────────────────────────────────
@router.put("/{uid}", response_model=DemandeResponseSchema, summary="Actualizar demande")
def update_demande(uid: int, body: DemandeUpdateSchema):
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(status_code=404, detail=f"Demande #{uid} introuvable")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = _repo.update(uid, fields)

    # Synchroniser le dossier si le nom a changé
    _folders.sync_folder(updated)
    # Sauvegarder le chemin mis à jour
    if updated.dossier_path_actuel or updated.dossier_nom_actuel:
        _repo.update(uid, {
            "dossier_nom_actuel":  updated.dossier_nom_actuel,
            "dossier_path_actuel": updated.dossier_path_actuel,
        })

    return _record_to_response(updated)


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
    Crée le dossier physique si absent, ou le renomme si le nom a changé.
    Appelé depuis index.html après création/modification d'une demande.
    """
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(404, f"Demande #{uid} introuvable")

    result = _folders.sync_folder(record)

    # Mettre à jour les chemins en DB si changement
    if result.success and result.action in ("created", "renamed"):
        _repo.update(uid, {
            "dossier_nom_actuel":  record.dossier_nom_actuel,
            "dossier_path_actuel": record.dossier_path_actuel,
        })

    if not result.success:
        raise HTTPException(500, detail=result.error or "Erreur dossier")

    return result.to_dict()


# ── GET /api/demandes/{uid}/open-folder ───────────────────────────────────────
@router.get(
    "/{uid}/open-folder",
    summary="Ouvrir le dossier dans l'explorateur",
)
def open_folder(uid: int):
    """
    Ouvre le dossier de la demande dans l'explorateur de fichiers
    (Windows Explorer / Finder / Nautilus).
    Fonctionne uniquement quand le serveur tourne sur la même machine
    que l'utilisateur (usage local).
    """
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(404, f"Demande #{uid} introuvable")

    result = _folders.open_folder(record)
    if not result.success:
        raise HTTPException(404, detail=result.error or "Dossier introuvable")

    return result.to_dict()


# ── GET /api/demandes/{uid}/folder-status ─────────────────────────────────────
@router.get(
    "/{uid}/folder-status",
    summary="Statut du dossier physique",
)
def folder_status(uid: int):
    """Vérifie si le dossier physique de la demande existe."""
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(404, f"Demande #{uid} introuvable")

    exists = _folders.folder_exists(record)
    return {
        "uid": uid,
        "exists": exists,
        "dossier_nom": record.dossier_nom_actuel,
        "dossier_path": record.dossier_path_actuel,
        "root": str(_folders.get_root()),
    }
