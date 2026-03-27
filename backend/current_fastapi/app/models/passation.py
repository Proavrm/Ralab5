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
    synthese: str
    notes: str
    affaire_ref: str = ""
    nb_documents: int = 0
    nb_actions: int = 0
    created_at: str = ""
    updated_at: str = ""
    documents: list[PassationDocumentRecord] = field(default_factory=list)
    actions: list[PassationActionRecord] = field(default_factory=list)

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
    synthese: str = Field("")
    notes: str = Field("")
    documents: list[PassationDocumentSchema] = Field(default_factory=list)
    actions: list[PassationActionSchema] = Field(default_factory=list)

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
    synthese: Optional[str] = None
    notes: Optional[str] = None
    documents: Optional[list[PassationDocumentSchema]] = None
    actions: Optional[list[PassationActionSchema]] = None

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
    synthese: str
    notes: str
    nb_documents: int = 0
    nb_actions: int = 0
    created_at: str = ""
    updated_at: str = ""
    documents: list[PassationDocumentSchema] = Field(default_factory=list)
    actions: list[PassationActionSchema] = Field(default_factory=list)

    model_config = {"from_attributes": True}
