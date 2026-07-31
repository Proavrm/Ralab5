"""Modèles Pydantic — module Calculs de dimensionnement (Phase 1)."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


CALCULATION_STATUSES = [
    "Brouillon",
    "Données incomplètes",
    "Prêt pour calcul",
    "Calcul en cours",
    "Résultats importés",
    "À vérifier",
    "Vérifié",
    "Validé",
    "Archivé",
    "Annulé",
    "À recalculer",
]

CALCULATION_TYPES = ["alize", "gel_degel", "talren"]


class CalculationCreateSchema(BaseModel):
    type_calcul: str = "alize"
    nom_calcul: str = ""
    affaire_rst_id: Optional[int] = None
    demande_id: Optional[int] = None
    mission_id: Optional[int] = None
    campaign_id: Optional[int] = None
    intervention_id: Optional[int] = None
    ouvrage: str = ""
    zone_label: str = ""
    auteur: str = ""
    general: dict[str, Any] = Field(default_factory=dict)


class CalculationUpdateSchema(BaseModel):
    nom_calcul: Optional[str] = None
    indice: Optional[str] = None
    version: Optional[int] = None
    statut: Optional[str] = None
    affaire_rst_id: Optional[int] = None
    demande_id: Optional[int] = None
    mission_id: Optional[int] = None
    campaign_id: Optional[int] = None
    intervention_id: Optional[int] = None
    ouvrage: Optional[str] = None
    zone_label: Optional[str] = None
    auteur: Optional[str] = None
    calculateur: Optional[str] = None
    verificateur: Optional[str] = None
    validateur: Optional[str] = None
    date_verification: Optional[str] = None
    date_validation: Optional[str] = None
    general: Optional[dict[str, Any]] = None


class AlizeLayerSchema(BaseModel):
    id: Optional[int] = None
    ordre: int = 1
    fonction: str = ""
    materiau: str = ""
    famille: str = ""
    classe: str = ""
    formulation: str = ""
    epaisseur: Optional[float] = None
    unite: str = "cm"
    module: Optional[float] = None
    poisson: Optional[float] = None
    temperature_calcul: Optional[float] = None
    frequence: Optional[float] = None
    bibliotheque: str = "NF P98-086 2019"
    assise: bool = False
    interface_sup: str = ""
    interface_inf: str = ""
    lie: bool = False
    from_library: bool = False
    modified_manually: bool = False
    justification: str = ""
    commentaire: str = ""


class AlizeCriterionSchema(BaseModel):
    id: Optional[int] = None
    critere: str = ""
    materiau: str = ""
    couche: str = ""
    profondeur: str = ""
    valeur_admissible: Optional[float] = None
    valeur_calculee: Optional[float] = None
    unite: str = ""
    marge: Optional[float] = None
    consommation: Optional[float] = None
    sens_verification: str = "inferieur_ou_egal"
    statut: str = "Non renseigné"
    commentaire: str = ""


class AlizePayloadUpdateSchema(BaseModel):
    traffic: Optional[dict[str, Any]] = None
    platform: Optional[dict[str, Any]] = None
    params: Optional[dict[str, Any]] = None
    results: Optional[dict[str, Any]] = None
    gel: Optional[dict[str, Any]] = None
    layers: Optional[list[AlizeLayerSchema]] = None
    criteria: Optional[list[AlizeCriterionSchema]] = None


class CalculationListItemSchema(BaseModel):
    id: int
    reference: str
    type_calcul: str
    nom_calcul: str
    indice: str
    version: int
    statut: str
    affaire_rst_id: Optional[int] = None
    demande_id: Optional[int] = None
    mission_id: Optional[int] = None
    affaire_ref: str = ""
    demande_ref: str = ""
    chantier: str = ""
    client: str = ""
    ouvrage: str = ""
    zone_label: str = ""
    auteur: str = ""
    updated_at: str = ""


class CalculationDetailSchema(BaseModel):
    id: int
    reference: str
    type_calcul: str
    nom_calcul: str
    indice: str
    version: int
    statut: str
    affaire_rst_id: Optional[int] = None
    demande_id: Optional[int] = None
    mission_id: Optional[int] = None
    campaign_id: Optional[int] = None
    intervention_id: Optional[int] = None
    ouvrage: str = ""
    zone_label: str = ""
    auteur: str = ""
    calculateur: str = ""
    verificateur: str = ""
    validateur: str = ""
    date_verification: Optional[str] = None
    date_validation: Optional[str] = None
    parent_calculation_id: Optional[int] = None
    general: dict[str, Any] = Field(default_factory=dict)
    affaire_ref: str = ""
    demande_ref: str = ""
    chantier: str = ""
    client: str = ""
    commune: str = ""
    adresse: str = ""
    moa: str = ""
    moe: str = ""
    responsable: str = ""
    laboratoire: str = ""
    affaire_statut: str = ""
    created_at: str = ""
    updated_at: str = ""
    alize: Optional[dict[str, Any]] = None
    readiness: dict[str, Any] = Field(default_factory=dict)


class CalculsSummarySchema(BaseModel):
    alize: int = 0
    gel_degel: int = 0
    talren: int = 0
    variantes_en_cours: int = 0
    a_verifier: int = 0
    valides: int = 0
    total: int = 0


class AlizeFromReferenceSchema(BaseModel):
    """Créer / appliquer une imitation Alizé à partir d'une étude Excel."""
    ref_etude_id: int
    nom_calcul: Optional[str] = None
    affaire_rst_id: Optional[int] = None
    demande_id: Optional[int] = None
    replace_existing: bool = True
