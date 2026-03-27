"""
app/models/demande_preparation.py
Demand preparation and enabled modules models.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from pydantic import BaseModel, Field

PREPARATION_PHASE_OPTIONS = [
	"À qualifier",
	"Préparation",
	"Démarrage chantier",
	"Exécution",
	"Complément",
]

DEMANDE_MODULE_CATALOG = [
	{"module_code": "interventions", "label": "Interventions terrain", "group": "Production"},
	{"module_code": "echantillons", "label": "Échantillons", "group": "Production"},
	{"module_code": "essais_laboratoire", "label": "Essais laboratoire", "group": "Production"},
	{"module_code": "essais_terrain", "label": "Essais terrain / in situ", "group": "Production"},
	{"module_code": "etude_technique", "label": "Étude / note technique", "group": "Étude"},
	{"module_code": "g3", "label": "Suivi G3", "group": "Étude"},
	{"module_code": "planning", "label": "Planning", "group": "Pilotage"},
	{"module_code": "documents", "label": "Documents", "group": "Pilotage"},
	{"module_code": "essais_externes", "label": "Essais externes", "group": "Pilotage"},
	{"module_code": "devis_facturation", "label": "Devis / facturation", "group": "Pilotage"},
]


@dataclass(slots=True)
class DemandePreparationRecord:
	uid: int
	demande_id: int
	phase_operation: str
	contexte_operationnel: str
	objectifs: str
	points_vigilance: str
	contraintes_acces: str
	contraintes_delais: str
	contraintes_hse: str
	attentes_client: str
	programme_previsionnel: str
	ressources_notes: str
	commentaires: str
	created_at: str = ""
	updated_at: str = ""


@dataclass(slots=True)
class DemandeEnabledModuleRecord:
	uid: int
	demande_id: int
	module_code: str
	is_enabled: bool
	label: str = ""
	group: str = ""
	created_at: str = ""
	updated_at: str = ""


class DemandePreparationUpdateSchema(BaseModel):
	phase_operation: Optional[str] = Field(None)
	contexte_operationnel: Optional[str] = Field(None)
	objectifs: Optional[str] = Field(None)
	points_vigilance: Optional[str] = Field(None)
	contraintes_acces: Optional[str] = Field(None)
	contraintes_delais: Optional[str] = Field(None)
	contraintes_hse: Optional[str] = Field(None)
	attentes_client: Optional[str] = Field(None)
	programme_previsionnel: Optional[str] = Field(None)
	ressources_notes: Optional[str] = Field(None)
	commentaires: Optional[str] = Field(None)


class DemandePreparationResponseSchema(BaseModel):
	uid: int
	demande_id: int
	phase_operation: str
	contexte_operationnel: str
	objectifs: str
	points_vigilance: str
	contraintes_acces: str
	contraintes_delais: str
	contraintes_hse: str
	attentes_client: str
	programme_previsionnel: str
	ressources_notes: str
	commentaires: str
	created_at: str
	updated_at: str


class DemandeEnabledModuleResponseSchema(BaseModel):
	uid: int
	demande_id: int
	module_code: str
	label: str
	group: str
	is_enabled: bool
	created_at: str
	updated_at: str


class DemandeEnabledModuleUpdateSchema(BaseModel):
	module_code: str = Field(...)
	is_enabled: bool = Field(False)


class DemandeEnabledModulesUpdateSchema(BaseModel):
	modules: list[DemandeEnabledModuleUpdateSchema] = Field(default_factory=list)


class DemandeConfigurationResponseSchema(BaseModel):
	preparation: DemandePreparationResponseSchema
	modules: list[DemandeEnabledModuleResponseSchema]


class PassationDemandePrefillSchema(BaseModel):
	demande: dict = Field(default_factory=dict)
	preparation: dict = Field(default_factory=dict)
	modules: list[str] = Field(default_factory=list)
