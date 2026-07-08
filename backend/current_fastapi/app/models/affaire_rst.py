"""
app/models/affaire_rst.py — RaLab4
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date
from typing import Optional
from pydantic import BaseModel, Field

STATUTS_AFFAIRE = ["À qualifier", "Offre en cours", "En cours", "Terminée", "Archivée"]

TITULAIRES = [
    "", "NGE GC", "NGE Energie", "NGE Routes", "EHTP",
    "NGE E.S.", "NGE Transitions", "Lyaudet", "Autre",
]


class DistanceToLabSchema(BaseModel):
    labo_code: str
    labo_label: str
    labo_address: str = ""
    labo_lat: float
    labo_lon: float
    distance_km: float
    distance_text: str


class AffaireSiteGeoSchema(BaseModel):
    lat: float
    lon: float
    label: str = ""
    distance_to_lab: DistanceToLabSchema


@dataclass(slots=True)
class AffaireRstRecord:
    uid:             int
    reference:       str
    annee:           int
    region:          str
    numero:          int
    client:          str
    titulaire:       str
    chantier:        str
    affaire_nge:     str
    date_ouverture:  date
    date_cloture:    Optional[date]
    statut:          str
    statut_offre:    str
    responsable:     str
    source_legacy_id: Optional[int]
    dossier_nom:     str
    dossier_path:    str
    site:            str = ""
    adresse_ouvrage: str = ""
    maitre_ouvrage:  str = ""
    maitre_oeuvre:   str = ""
    numero_etude:    str = ""
    filiale:         str = ""
    autre_reference: str = ""
    site_lat:        Optional[float] = None
    site_lon:        Optional[float] = None
    site_geocode_label: str = ""
    date_debut_travaux_prevue: Optional[date] = None
    created_at:      str = ""
    updated_at:      str = ""
    nb_demandes:        int = 0
    nb_demandes_actives: int = 0


class AffaireRstCreateSchema(BaseModel):
    reference:      str            = Field(..., description="Ex: 2026-RA-042")
    client:         str            = Field("Non communiqué")
    maitre_ouvrage: str            = Field("")
    maitre_oeuvre:  str            = Field("")
    titulaire:      str            = Field("")
    chantier:       str            = Field("Non communiqué")
    site:           str            = Field("")
    adresse_ouvrage: str           = Field("")
    numero_etude:   str            = Field("")
    affaire_nge:    str            = Field("")
    filiale:        str            = Field("")
    autre_reference: str           = Field("")
    dossier_nom:    str            = Field("")
    dossier_path:   str            = Field("")
    date_ouverture: date           = Field(default_factory=date.today)
    date_cloture:   Optional[date] = Field(None)
    date_debut_travaux_prevue: Optional[date] = Field(None)
    statut:         str            = Field("À qualifier")
    statut_offre:   str            = Field("")
    responsable:    str            = Field("")


class AffaireRstUpdateSchema(BaseModel):
    reference:      Optional[str]  = None
    client:         Optional[str]  = None
    maitre_ouvrage: Optional[str]  = None
    maitre_oeuvre:  Optional[str]  = None
    titulaire:      Optional[str]  = None
    chantier:       Optional[str]  = None
    site:           Optional[str]  = None
    adresse_ouvrage: Optional[str] = None
    numero_etude:   Optional[str]  = None
    affaire_nge:    Optional[str]  = None
    filiale:        Optional[str]  = None
    autre_reference: Optional[str] = None
    dossier_nom:    Optional[str]  = None
    dossier_path:   Optional[str]  = None
    date_ouverture: Optional[date] = None
    date_cloture:   Optional[date] = None
    date_debut_travaux_prevue: Optional[date] = None
    statut:         Optional[str]  = None
    statut_offre:   Optional[str]  = None
    responsable:    Optional[str]  = None


class AffaireRstResponseSchema(BaseModel):
    uid:             int
    reference:       str
    annee:           int
    region:          str
    numero:          int
    client:          str
    maitre_ouvrage:  str = ""
    maitre_oeuvre:   str = ""
    titulaire:       str
    chantier:        str
    site:            str = ""
    adresse_ouvrage: str = ""
    site_lat:        Optional[float] = None
    site_lon:        Optional[float] = None
    site_geocode_label: str = ""
    numero_etude:    str = ""
    affaire_nge:     str = ""
    filiale:         str = ""
    autre_reference: str = ""
    dossier_nom:     str = ""
    dossier_nom_prevu: str = ""
    dossier_path:    str = ""
    site_lat:        Optional[float] = None
    site_lon:        Optional[float] = None
    site_geocode_label: str = ""
    site_geo:        Optional[AffaireSiteGeoSchema] = None
    dossier_mode:    str = "pending"
    dossier_status:  str = "pending"
    dossier_root:    str = ""
    dossier_exists:  bool = False
    dossier_can_sync: bool = False
    dossier_can_open: bool = False
    dossier_message: str = ""
    date_ouverture:  date
    date_cloture:    Optional[date]
    date_debut_travaux_prevue: Optional[date] = None
    statut:          str
    statut_offre:    str = ""
    responsable:     str
    source_legacy_id: Optional[int]
    created_at:      str
    updated_at:      str
    nb_demandes:        int = 0
    nb_demandes_actives: int = 0

    model_config = {"from_attributes": True}
