"""API annuaire contacts — vue globale et filtres dossier."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.repositories.affaires_rst_repository import AffairesRstRepository
from app.services.affaire_contact_service import AffaireContactService

router = APIRouter()
_contacts = AffaireContactService()
_affaires = AffairesRstRepository()


class ContactDirectorySchema(BaseModel):
    id: int | None = None
    affaire_rst_id: int | None = None
    affaire_uid: int | None = None
    affaire_reference: str = ""
    affaire_chantier: str = ""
    full_name: str = ""
    role_label: str = ""
    organisation: str = ""
    phone: str = ""
    email: str = ""
    notes: str = ""
    display_label: str = ""
    agence_code: str = ""
    agence_label: str = ""
    region_code: str = ""
    region_label: str = ""
    source_type: str = ""
    source_ref: str = ""
    use_count: int = 0
    last_used_at: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


def _resolve_affaire_internal_id(uid: int | None) -> int | None:
    if uid is None:
        return None
    record = _affaires.get_by_uid(int(uid))
    if not record:
        raise HTTPException(404, f"Affaire #{uid} introuvable")
    return int(record.uid)


@router.get("", response_model=list[ContactDirectorySchema])
def list_contacts_directory(
    q: str = Query("", description="Recherche nom, fonction, entreprise, affaire…"),
    organisation: str = Query("", description="Filtrer par entreprise"),
    role_label: str = Query("", description="Filtrer par fonction"),
    affaire_id: int | None = Query(None, description="Filtrer par affaire RST (uid)"),
):
    affaire_internal_id = _resolve_affaire_internal_id(affaire_id)
    return _contacts.list_all_contacts(
        q=q,
        organisation=organisation,
        role_label=role_label,
        affaire_rst_id=affaire_internal_id,
    )


@router.get("/organisations", response_model=list[str])
def list_contacts_organisations(
    affaire_id: int | None = Query(None, description="Limiter aux contacts d'une affaire"),
):
    affaire_internal_id = _resolve_affaire_internal_id(affaire_id)
    return _contacts.list_all_organisations(affaire_internal_id)


class ContactSyncSourceStats(BaseModel):
    scanned: int = 0
    synced: int = 0
    skipped: int = 0


class ContactSyncResultSchema(BaseModel):
    scanned: int = 0
    synced: int = 0
    skipped: int = 0
    sources: dict[str, ContactSyncSourceStats] = {}


@router.post("/sync", response_model=ContactSyncResultSchema)
def sync_contacts_directory(
    affaire_id: int | None = Query(None, description="Limiter la synchronisation à une affaire"),
):
    affaire_internal_id = _resolve_affaire_internal_id(affaire_id)
    return _contacts.sync_all_sources(affaire_internal_id)
