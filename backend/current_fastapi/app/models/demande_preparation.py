"""
app/models/demande_preparation.py
Modeles preparation demande.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from pydantic import BaseModel, Field

PREPARATION_PHASE_OPTIONS = [
    "\u00c0 qualifier",
    "Preparation",
    "Demarrage chantier",
    "Execution",
    "Complement",
]

DEMANDE_MODULE_CATALOG = [
    {"module_code": "interventions", "label": "Interventions terrain", "group": "Production"},
    {"module_code": "echantillons", "label": "Echantillons", "group": "Production"},
    {"module_code": "essais_laboratoire", "label": "Essais laboratoire", "group": "Production"},
    {"module_code": "essais_terrain", "label": "Essais terrain / in situ", "group": "Production"},
    {"module_code": "etude_technique", "label": "Etude / note technique", "group": "Etude"},
    {"module_code": "g3", "label": "Suivi G3", "group": "Etude"},
    {"module_code": "planning", "label": "Planning", "group": "Pilotage"},
    {"module_code": "documents", "label": "Documents", "group": "Pilotage"},
    {"module_code": "essais_externes", "label": "Essais externes", "group": "Pilotage"},
    {"module_code": "devis_facturation", "label": "Devis / facturation", "group": "Pilotage"},
]

DEMANDE_FAMILY_CATALOG = [
    {
        "family_code": "g3",
        "label": "Suivi G3",
        "group": "Etude",
        "description": "Suivi d'execution ou mission geotechnique de type G3.",
        "module_codes": ["g3", "etude_technique"],
    },
    {
        "family_code": "appui_technique",
        "label": "Appui technique",
        "group": "Etude",
        "description": "Note technique, avis ou appui d'interpretation.",
        "module_codes": ["etude_technique"],
    },
    {
        "family_code": "sondages_terrain",
        "label": "Sondages terrain",
        "group": "Terrain",
        "description": "Reconnaissance terrain, sondages et points d'observation.",
        "module_codes": ["interventions"],
    },
    {
        "family_code": "essais_in_situ",
        "label": "Essais in situ / penetrometres",
        "group": "Terrain",
        "description": "Penetrometres, controles de plateforme ou autres essais in situ.",
        "module_codes": ["interventions", "essais_terrain"],
    },
    {
        "family_code": "prelevements_terrain",
        "label": "Prelevements terrain",
        "group": "Terrain",
        "description": "Prelevements destines au laboratoire ou au suivi chantier.",
        "module_codes": ["interventions", "echantillons"],
    },
    {
        "family_code": "essais_laboratoire",
        "label": "Essais laboratoire",
        "group": "Laboratoire",
        "description": "Preparation echantillon et essais realises au laboratoire.",
        "module_codes": ["echantillons", "essais_laboratoire"],
    },
    {
        "family_code": "essais_externes",
        "label": "Essais externes",
        "group": "Pilotage",
        "description": "Prestations ou essais confies a un partenaire externe.",
        "module_codes": ["essais_externes"],
    },
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
    type_intervention_prevu: str
    finalite: str
    zone_localisation: str
    materiau_objet: str
    objectif_mission: str
    responsable_referent: str
    attribue_a: str
    priorite: str
    date_prevue: str
    nb_points_prevus: str
    types_essais_prevus: str
    criteres_conformite: str
    livrables_attendus: str
    remarques: str
    familles_prevues: list[str] = field(default_factory=list)
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
    type_intervention_prevu: Optional[str] = Field(None)
    finalite: Optional[str] = Field(None)
    zone_localisation: Optional[str] = Field(None)
    materiau_objet: Optional[str] = Field(None)
    objectif_mission: Optional[str] = Field(None)
    responsable_referent: Optional[str] = Field(None)
    attribue_a: Optional[str] = Field(None)
    priorite: Optional[str] = Field(None)
    date_prevue: Optional[str] = Field(None)
    nb_points_prevus: Optional[str] = Field(None)
    types_essais_prevus: Optional[str] = Field(None)
    criteres_conformite: Optional[str] = Field(None)
    livrables_attendus: Optional[str] = Field(None)
    remarques: Optional[str] = Field(None)
    familles_prevues: Optional[list[str]] = Field(None)


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
    type_intervention_prevu: str
    finalite: str
    zone_localisation: str
    materiau_objet: str
    objectif_mission: str
    responsable_referent: str
    attribue_a: str
    priorite: str
    date_prevue: str
    nb_points_prevus: str
    types_essais_prevus: str
    criteres_conformite: str
    livrables_attendus: str
    remarques: str
    familles_prevues: list[str] = Field(default_factory=list)
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
