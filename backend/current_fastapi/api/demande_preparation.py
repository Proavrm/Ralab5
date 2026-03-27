"""
api/demande_preparation.py
Demand preparation and enabled modules routes.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.demande_preparation import (
	PREPARATION_PHASE_OPTIONS,
	DemandeConfigurationResponseSchema,
	DemandeEnabledModuleResponseSchema,
	DemandeEnabledModulesUpdateSchema,
	DemandePreparationResponseSchema,
	DemandePreparationUpdateSchema,
)
from app.repositories.demande_preparation_repository import DemandePreparationRepository
from app.repositories.demandes_rst_repository import DemandesRstRepository

router = APIRouter()
_repo = DemandePreparationRepository()
_demande_repo = DemandesRstRepository()


def _ensure_demande(demande_id: int) -> None:
	if not _demande_repo.get_by_uid(demande_id):
		raise HTTPException(404, f"Demande #{demande_id} introuvable")


@router.get('/configuration/catalog')
def configuration_catalog():
	return {
		"phase_options": PREPARATION_PHASE_OPTIONS,
		"modules": _repo.module_catalog(),
	}


@router.get('/{demande_id}/configuration', response_model=DemandeConfigurationResponseSchema)
def get_configuration(demande_id: int):
	_ensure_demande(demande_id)
	return _repo.get_configuration(demande_id)


@router.get('/{demande_id}/preparation', response_model=DemandePreparationResponseSchema)
def get_preparation(demande_id: int):
	_ensure_demande(demande_id)
	return _repo.to_prep_response(_repo.get_preparation(demande_id))


@router.put('/{demande_id}/preparation', response_model=DemandePreparationResponseSchema)
def update_preparation(demande_id: int, body: DemandePreparationUpdateSchema):
	_ensure_demande(demande_id)
	fields = {k: v for k, v in body.model_dump().items() if v is not None}
	return _repo.to_prep_response(_repo.update_preparation(demande_id, fields))


@router.get('/{demande_id}/enabled-modules', response_model=list[DemandeEnabledModuleResponseSchema])
def list_enabled_modules(demande_id: int):
	_ensure_demande(demande_id)
	return [_repo.to_module_response(item) for item in _repo.list_modules(demande_id)]


@router.put('/{demande_id}/enabled-modules', response_model=list[DemandeEnabledModuleResponseSchema])
def update_enabled_modules(demande_id: int, body: DemandeEnabledModulesUpdateSchema):
	_ensure_demande(demande_id)
	rows = _repo.update_modules(demande_id, [item.model_dump() for item in body.modules])
	return [_repo.to_module_response(item) for item in rows]
