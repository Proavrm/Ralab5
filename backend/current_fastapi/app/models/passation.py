"""
app/models/passation.py
Business models for the chantier handover module.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from pydantic import BaseModel, Field

PASSATION_SOURCES = [
    "Bureau d'études",
    "Cellule AO",
    "Agence travaux",
    "Réunion chantier",
    "Transmission interne",
    "Autre",
]

OPERATION_TYPES = [
    "Terrassement",
    "Géotechnique",
    "Route",
    "Béton",
    "Ouvrage",
    "Multimétiers",
    "Autre",
]

PHASE_OPERATION_OPTIONS = [
    "AO gagné",
    "Préparation",
    "Démarrage chantier",
    "Exécution",
    "Phase complémentaire",
]

ACTION_PRIORITY_OPTIONS = ["Basse", "Normale", "Haute", "Critique"]
ACTION_STATUS_OPTIONS = ["À lancer", "En cours", "Bloquée", "Terminée"]
ROLE_ASSIGNMENT_STATUS_OPTIONS = ["À confirmer", "Confirmé", "Refusé", "Non applicable"]
WORKFLOW_STATUS_OPTIONS = ["Brouillon", "En revue", "Prête", "Bloquée", "Annulée"]
WORKFLOW_DECISION_OPTIONS = ["À décider", "Valider", "Revoir", "Annuler"]
PERIMETER_STATUS_OPTIONS = ["Demandé", "Accepté", "Exclu"]
STRUCTURED_NEED_STATUS_OPTIONS = ["Non évalué", "Requis", "Optionnel", "Hors périmètre"]

PASSATION_PARTICIPANT_ROLES = [
    "DEMANDEUR",
    "CHEF_PROJET",
    "REFERENT_TECHNIQUE",
    "REPRESENTANT_CLIENT",
    "LAB_MANAGER",
    "FIELD_MANAGER",
    "QUALITE",
]

PASSATION_STARTUP_ITEM_CODES = [
    "CCTP_STRUCTURE",
    "CONTROL_PLAN",
    "INITIAL_VISIT",
    "DEMAND_PREPARATION",
    "INTERVENTION_PREPARATOR",
    "TECHNICIAN_ASSIGNER",
]

PASSATION_WORKSTREAM_CODES = [
    "TERRAIN",
    "LABORATOIRE",
    "ETUDE",
    "ESSAIS_EXTERNES",
    "QUALITE",
    "CLIENT",
]

PASSATION_STRUCTURED_NEED_CODES = [
    "MISSION_TERRAIN",
    "RECEPTION_PRELEVEMENTS",
    "ESSAIS_LABO",
    "ANALYSE_ETUDE",
    "ESSAIS_EXTERNES",
    "LIVRABLES_CLIENT",
]

PASSATION_DEMANDE_MODULE_CODES = [
    "interventions",
    "essais_terrain",
    "echantillons",
    "essais_laboratoire",
    "etude_technique",
    "g3",
    "essais_externes",
    "documents",
    "planning",
]

PASSATION_ROLE_CODES = [
    "DEMANDEUR_INITIAL",
    "RCE_CHANTIER",
    "REFERENT_RST",
    "CONTROL_PLAN_AUTHOR",
    "CONTROL_PLAN_VALIDATOR",
    "INITIAL_VISIT_OWNER",
    "INITIAL_VISIT_RST_PARTICIPANT",
    "INTERVENTION_PLANNER",
    "TECHNICIAN_ASSIGNER",
    "LAB_COORDINATOR",
    "FIELD_COORDINATOR",
    "EXTERNAL_TESTS_OWNER",
    "RESULTS_COORDINATOR",
]

DEFAULT_DOCUMENT_TYPES = [
    "CCTP",
    "Plans",
    "Planning travaux",
    "Mémoire technique",
    "Programme essais",
    "Études existantes",
    "Rapports géotechniques",
    "CR de passation",
    "Variantes",
    "Documents marché",
]

@dataclass(slots=True)
class PassationDocumentRecord:
    uid: int
    passation_id: int
    document_type: str
    is_received: bool
    version: str
    document_date: Optional[date]
    comment: str
    created_at: str = ""
    updated_at: str = ""

@dataclass(slots=True)
class PassationActionRecord:
    uid: int
    passation_id: int
    action_label: str
    responsable: str
    echeance: Optional[date]
    priorite: str
    statut: str
    commentaire: str
    created_at: str = ""
    updated_at: str = ""

@dataclass(slots=True)
class PassationRoleAssignmentRecord:
    uid: int
    passation_id: int
    role_code: str
    assignee: str
    assignment_status: str
    comment: str
    created_at: str = ""
    updated_at: str = ""


@dataclass(slots=True)
class PassationParticipantRecord:
    uid: int
    passation_id: int
    participant_role: str
    full_name: str
    organisation: str
    email: str
    phone: str
    comment: str
    created_at: str = ""
    updated_at: str = ""


@dataclass(slots=True)
class PassationPerimeterItemRecord:
    uid: int
    passation_id: int
    scope_category: str
    scope_label: str
    request_status: str
    notes: str
    created_at: str = ""
    updated_at: str = ""


@dataclass(slots=True)
class PassationResponsibilityItemRecord:
    uid: int
    passation_id: int
    workstream_code: str
    accountable_role_code: str
    responsible_role_code: str
    consulted_roles: str
    informed_roles: str
    notes: str
    created_at: str = ""
    updated_at: str = ""


@dataclass(slots=True)
class PassationStartupItemRecord:
    uid: int
    passation_id: int
    item_code: str
    owner_role_code: str
    owner_name: str
    status: str
    due_date: Optional[date]
    notes: str
    created_at: str = ""
    updated_at: str = ""


@dataclass(slots=True)
class PassationStructuredNeedRecord:
    uid: int
    passation_id: int
    need_code: str
    need_label: str
    request_status: str
    quantity: str
    notes: str
    created_at: str = ""
    updated_at: str = ""


@dataclass(slots=True)
class PassationDemandePreparationRecord:
    uid: int
    passation_id: int
    module_code: str
    is_required: bool
    is_ready: bool
    notes: str
    created_at: str = ""
    updated_at: str = ""

@dataclass(slots=True)
class PassationRecord:
    uid: int
    reference: str
    affaire_rst_id: int
    date_passation: date
    source: str
    operation_type: str
    phase_operation: str
    numero_etude: str
    numero_affaire_nge: str
    chantier: str
    client: str
    entreprise_responsable: str
    agence: str
    responsable: str
    description_generale: str
    contexte_marche: str
    interlocuteurs_principaux: str
    points_sensibles: str
    besoins_laboratoire: str
    besoins_terrain: str
    besoins_etude: str
    besoins_g3: str
    besoins_essais_externes: str
    besoins_equipements_specifiques: str
    besoins_ressources_humaines: str
    workflow_status: str
    workflow_decision: str
    workflow_decision_comment: str
    workflow_decided_by: str
    workflow_decided_at: Optional[date]
    synthese: str
    notes: str
    affaire_ref: str = ""
    nb_documents: int = 0
    nb_actions: int = 0
    created_at: str = ""
    updated_at: str = ""
    documents: list[PassationDocumentRecord] = field(default_factory=list)
    actions: list[PassationActionRecord] = field(default_factory=list)
    role_assignments: list[PassationRoleAssignmentRecord] = field(default_factory=list)
    participants: list[PassationParticipantRecord] = field(default_factory=list)
    perimeter_items: list[PassationPerimeterItemRecord] = field(default_factory=list)
    responsibility_items: list[PassationResponsibilityItemRecord] = field(default_factory=list)
    startup_items: list[PassationStartupItemRecord] = field(default_factory=list)
    structured_needs: list[PassationStructuredNeedRecord] = field(default_factory=list)
    demande_preparation_items: list[PassationDemandePreparationRecord] = field(default_factory=list)

class PassationDocumentSchema(BaseModel):
    uid: int | None = None
    document_type: str = Field("")
    is_received: bool = Field(False)
    version: str = Field("")
    document_date: Optional[date] = Field(None)
    comment: str = Field("")

class PassationActionSchema(BaseModel):
    uid: int | None = None
    action_label: str = Field("")
    responsable: str = Field("")
    echeance: Optional[date] = Field(None)
    priorite: str = Field("Normale")
    statut: str = Field("À lancer")
    commentaire: str = Field("")

class PassationRoleAssignmentSchema(BaseModel):
    uid: int | None = None
    role_code: str = Field("")
    assignee: str = Field("")
    assignment_status: str = Field("À confirmer")
    comment: str = Field("")


class PassationParticipantSchema(BaseModel):
    uid: int | None = None
    participant_role: str = Field("")
    full_name: str = Field("")
    organisation: str = Field("")
    email: str = Field("")
    phone: str = Field("")
    comment: str = Field("")


class PassationPerimeterItemSchema(BaseModel):
    uid: int | None = None
    scope_category: str = Field("")
    scope_label: str = Field("")
    request_status: str = Field("Demandé")
    notes: str = Field("")


class PassationResponsibilityItemSchema(BaseModel):
    uid: int | None = None
    workstream_code: str = Field("")
    accountable_role_code: str = Field("")
    responsible_role_code: str = Field("")
    consulted_roles: str = Field("")
    informed_roles: str = Field("")
    notes: str = Field("")


class PassationStartupItemSchema(BaseModel):
    uid: int | None = None
    item_code: str = Field("")
    owner_role_code: str = Field("")
    owner_name: str = Field("")
    status: str = Field("À confirmer")
    due_date: Optional[date] = Field(None)
    notes: str = Field("")


class PassationStructuredNeedSchema(BaseModel):
    uid: int | None = None
    need_code: str = Field("")
    need_label: str = Field("")
    request_status: str = Field("Non évalué")
    quantity: str = Field("")
    notes: str = Field("")


class PassationDemandePreparationItemSchema(BaseModel):
    uid: int | None = None
    module_code: str = Field("")
    is_required: bool = Field(False)
    is_ready: bool = Field(False)
    notes: str = Field("")

class PassationCreateSchema(BaseModel):
    affaire_rst_id: int = Field(...)
    date_passation: date = Field(default_factory=date.today)
    source: str = Field("")
    operation_type: str = Field("")
    phase_operation: str = Field("")
    numero_etude: str = Field("")
    numero_affaire_nge: str = Field("")
    chantier: str = Field("")
    client: str = Field("")
    entreprise_responsable: str = Field("")
    agence: str = Field("")
    responsable: str = Field("")
    description_generale: str = Field("")
    contexte_marche: str = Field("")
    interlocuteurs_principaux: str = Field("")
    points_sensibles: str = Field("")
    besoins_laboratoire: str = Field("")
    besoins_terrain: str = Field("")
    besoins_etude: str = Field("")
    besoins_g3: str = Field("")
    besoins_essais_externes: str = Field("")
    besoins_equipements_specifiques: str = Field("")
    besoins_ressources_humaines: str = Field("")
    workflow_status: str = Field("Brouillon")
    workflow_decision: str = Field("À décider")
    workflow_decision_comment: str = Field("")
    workflow_decided_by: str = Field("")
    workflow_decided_at: Optional[date] = Field(None)
    synthese: str = Field("")
    notes: str = Field("")
    documents: list[PassationDocumentSchema] = Field(default_factory=list)
    actions: list[PassationActionSchema] = Field(default_factory=list)
    role_assignments: list[PassationRoleAssignmentSchema] = Field(default_factory=list)
    participants: list[PassationParticipantSchema] = Field(default_factory=list)
    perimeter_items: list[PassationPerimeterItemSchema] = Field(default_factory=list)
    responsibility_items: list[PassationResponsibilityItemSchema] = Field(default_factory=list)
    startup_items: list[PassationStartupItemSchema] = Field(default_factory=list)
    structured_needs: list[PassationStructuredNeedSchema] = Field(default_factory=list)
    demande_preparation_items: list[PassationDemandePreparationItemSchema] = Field(default_factory=list)

class PassationUpdateSchema(BaseModel):
    affaire_rst_id: Optional[int] = None
    date_passation: Optional[date] = None
    source: Optional[str] = None
    operation_type: Optional[str] = None
    phase_operation: Optional[str] = None
    numero_etude: Optional[str] = None
    numero_affaire_nge: Optional[str] = None
    chantier: Optional[str] = None
    client: Optional[str] = None
    entreprise_responsable: Optional[str] = None
    agence: Optional[str] = None
    responsable: Optional[str] = None
    description_generale: Optional[str] = None
    contexte_marche: Optional[str] = None
    interlocuteurs_principaux: Optional[str] = None
    points_sensibles: Optional[str] = None
    besoins_laboratoire: Optional[str] = None
    besoins_terrain: Optional[str] = None
    besoins_etude: Optional[str] = None
    besoins_g3: Optional[str] = None
    besoins_essais_externes: Optional[str] = None
    besoins_equipements_specifiques: Optional[str] = None
    besoins_ressources_humaines: Optional[str] = None
    workflow_status: Optional[str] = None
    workflow_decision: Optional[str] = None
    workflow_decision_comment: Optional[str] = None
    workflow_decided_by: Optional[str] = None
    workflow_decided_at: Optional[date] = None
    synthese: Optional[str] = None
    notes: Optional[str] = None
    documents: Optional[list[PassationDocumentSchema]] = None
    actions: Optional[list[PassationActionSchema]] = None
    role_assignments: Optional[list[PassationRoleAssignmentSchema]] = None
    participants: Optional[list[PassationParticipantSchema]] = None
    perimeter_items: Optional[list[PassationPerimeterItemSchema]] = None
    responsibility_items: Optional[list[PassationResponsibilityItemSchema]] = None
    startup_items: Optional[list[PassationStartupItemSchema]] = None
    structured_needs: Optional[list[PassationStructuredNeedSchema]] = None
    demande_preparation_items: Optional[list[PassationDemandePreparationItemSchema]] = None

class PassationResponseSchema(BaseModel):
    uid: int
    reference: str
    affaire_rst_id: int
    affaire_ref: str = ""
    date_passation: date
    source: str
    operation_type: str
    phase_operation: str
    numero_etude: str
    numero_affaire_nge: str
    chantier: str
    client: str
    entreprise_responsable: str
    agence: str
    responsable: str
    description_generale: str
    contexte_marche: str
    interlocuteurs_principaux: str
    points_sensibles: str
    besoins_laboratoire: str
    besoins_terrain: str
    besoins_etude: str
    besoins_g3: str
    besoins_essais_externes: str
    besoins_equipements_specifiques: str
    besoins_ressources_humaines: str
    workflow_status: str
    workflow_decision: str
    workflow_decision_comment: str
    workflow_decided_by: str
    workflow_decided_at: Optional[date]
    synthese: str
    notes: str
    nb_documents: int = 0
    nb_actions: int = 0
    created_at: str = ""
    updated_at: str = ""
    documents: list[PassationDocumentSchema] = Field(default_factory=list)
    actions: list[PassationActionSchema] = Field(default_factory=list)
    role_assignments: list[PassationRoleAssignmentSchema] = Field(default_factory=list)
    participants: list[PassationParticipantSchema] = Field(default_factory=list)
    perimeter_items: list[PassationPerimeterItemSchema] = Field(default_factory=list)
    responsibility_items: list[PassationResponsibilityItemSchema] = Field(default_factory=list)
    startup_items: list[PassationStartupItemSchema] = Field(default_factory=list)
    structured_needs: list[PassationStructuredNeedSchema] = Field(default_factory=list)
    demande_preparation_items: list[PassationDemandePreparationItemSchema] = Field(default_factory=list)

    model_config = {"from_attributes": True}
