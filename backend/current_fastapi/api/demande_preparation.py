"""
api/demande_preparation.py
Demand preparation and enabled modules routes.
"""
from __future__ import annotations

import re

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
from app.repositories.competency_repository import CompetencyRepository
from app.services.competency_rst_mapping import rst_code_catalog_payload, rst_code_label

router = APIRouter()
_repo = DemandePreparationRepository()
_demande_repo = DemandesRstRepository()
_competency_repo = CompetencyRepository()


def _ensure_demande(demande_id: int) -> None:
	if not _demande_repo.get_by_uid(demande_id):
		raise HTTPException(404, f"Demande #{demande_id} introuvable")


@router.get('/configuration/catalog')
def configuration_catalog():
	return {
		"phase_options": PREPARATION_PHASE_OPTIONS,
		"families": _repo.family_catalog(),
		"modules": _repo.module_catalog(),
	}


def _consignes_code_for_competency(row) -> str:
	return f"id:{int(row['competency_id'])}"


def _chip_label_for_competency(row) -> str:
	aliases = _aliases_for_competency(row)
	if aliases:
		return aliases[0]
	reference = str(row["reference"] or "").strip()
	if reference and len(reference) <= 14:
		return reference
	if reference:
		return reference[:12] + "…"
	return f"#{int(row['competency_id'])}"


def _aliases_for_competency(row) -> list[str]:
	label = str(row["label"] or "")
	aliases = []
	for match in re.finditer(r"\(([A-Z0-9][A-Z0-9/-]*)\)", label, flags=re.IGNORECASE):
		alias = match.group(1).strip().upper()
		if alias and alias not in aliases:
			aliases.append(alias)
	return aliases


@router.get('/configuration/consignes-essais-catalog')
def consignes_essais_catalog():
	rows = _competency_repo.list_catalog(include_inactive=False)
	grouped: dict[str, list[dict]] = {}
	mapped_count = 0
	for row in rows:
		domain = str(row["domain"] or "Autre").strip() or "Autre"
		context_type = str(row["context_type"] or "").strip()
		title = domain if not context_type else f"{domain} · {context_type}"
		rst_code = str(row["rst_code"] or "").strip().upper() or None
		if rst_code:
			mapped_count += 1
		grouped.setdefault(title, []).append({
			"competency_id": int(row["competency_id"]),
			"code": _consignes_code_for_competency(row),
			"rst_code": rst_code,
			"rst_label": rst_code_label(rst_code) if rst_code else None,
			"label": str(row["label"] or "").strip(),
			"reference": str(row["reference"] or "").strip() or None,
			"context_type": context_type,
			"domain": domain,
			"chip_label": rst_code or _chip_label_for_competency(row),
			"aliases": _aliases_for_competency(row),
		})
	groups = [
		{"title": title, "items": items}
		for title, items in sorted(grouped.items(), key=lambda item: item[0].casefold())
	]
	return {
		"source": "competency_catalog",
		"count": len(rows),
		"mapped_count": mapped_count,
		"rst_codes": rst_code_catalog_payload(),
		"groups": groups,
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
