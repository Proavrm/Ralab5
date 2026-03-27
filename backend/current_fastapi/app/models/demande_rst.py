"""
File: demande_rst.py
Purpose: Demande RST models.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field

TYPES_MISSION = [
    "À définir", "Études G1", "Études G2", "Exploitation G3",
    "Essais Labo", "Avis Technique", "Externe", "Autre",
]

STATUTS_DEMANDE = [
    "À qualifier", "Demande", "En Cours", "Répondu", "Fini", "Envoyé - Perdu",
]

PRIORITES = ["Basse", "Normale", "Haute", "Critique"]

LABO_CODES = ["SP", "PDC", "CHB", "CLM"]


@dataclass(slots=True)
class DemandeRstRecord:
    uid: int
    reference: str
    annee: int
    labo_code: str
    numero: int
    affaire_rst_id: int
    numero_dst: str
    type_mission: str
    nature: str
    description: str
    observations: str
    demandeur: str
    date_reception: date
    date_echeance: Optional[date]
    date_cloture: Optional[date]
    statut: str
    priorite: str
    a_revoir: bool
    note_reconciliation: str
    suivi_notes: str
    dossier_nom: str
    dossier_path: str
    rapport_ref: str
    rapport_envoye: bool
    date_envoi_rapport: Optional[date]
    devis_ref: str
    facture_ref: str
    source_legacy_id: Optional[int]
    created_at: str = ""
    updated_at: str = ""
    affaire_ref: str = ""
    client: str = ""
    chantier: str = ""
    affaire_nge: str = ""
    nb_echantillons: int = 0
    nb_interventions: int = 0


class DemandeRstCreateSchema(BaseModel):
    affaire_rst_id: Optional[int] = Field(None, description="ID de l'affaire RST parente")
    labo_code: str = Field("SP")
    numero_dst: str = Field("")
    type_mission: str = Field("À définir")
    nature: str = Field("")
    description: str = Field("")
    observations: str = Field("")
    demandeur: str = Field("")
    date_reception: date = Field(default_factory=date.today)
    date_echeance: Optional[date] = Field(None)
    statut: str = Field("À qualifier")
    priorite: str = Field("Normale")
    a_revoir: bool = Field(False)
    note_reconciliation: str = Field("")
    suivi_notes: str = Field("")
    dossier_nom: str = Field("")
    dossier_path: str = Field("")
    rapport_ref: str = Field("")
    devis_ref: str = Field("")
    facture_ref: str = Field("")
    source_type: Optional[Literal["dst", "affaire_nge", "etude"]] = Field(None)
    source_id: Optional[int] = Field(None)


class DemandeRstUpdateSchema(BaseModel):
    numero_dst: Optional[str] = None
    type_mission: Optional[str] = None
    nature: Optional[str] = None
    description: Optional[str] = None
    observations: Optional[str] = None
    demandeur: Optional[str] = None
    date_reception: Optional[date] = None
    date_echeance: Optional[date] = None
    date_cloture: Optional[date] = None
    statut: Optional[str] = None
    priorite: Optional[str] = None
    a_revoir: Optional[bool] = None
    note_reconciliation: Optional[str] = None
    suivi_notes: Optional[str] = None
    dossier_nom: Optional[str] = None
    dossier_path: Optional[str] = None
    rapport_ref: Optional[str] = None
    rapport_envoye: Optional[bool] = None
    date_envoi_rapport: Optional[date] = None
    devis_ref: Optional[str] = None
    facture_ref: Optional[str] = None


class DemandeRstResponseSchema(BaseModel):
    uid: int
    reference: str
    annee: int
    labo_code: str
    numero: int
    affaire_rst_id: int
    affaire_ref: str = ""
    client: str = ""
    chantier: str = ""
    affaire_nge: str = ""
    numero_dst: str
    type_mission: str
    nature: str
    description: str
    observations: str
    demandeur: str
    date_reception: date
    date_echeance: Optional[date]
    date_cloture: Optional[date]
    statut: str
    priorite: str
    a_revoir: bool
    note_reconciliation: str
    suivi_notes: str
    dossier_nom: str
    dossier_path: str
    rapport_ref: str
    rapport_envoye: bool
    date_envoi_rapport: Optional[date]
    devis_ref: str
    facture_ref: str
    source_legacy_id: Optional[int]
    nb_echantillons: int = 0
    nb_interventions: int = 0
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}
