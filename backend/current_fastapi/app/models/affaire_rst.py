"""
app/models/affaire_rst.py — RaLab4
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date
from typing import Optional
from pydantic import BaseModel, Field

STATUTS_AFFAIRE = ["À qualifier", "En cours", "Terminée", "Archivée"]

TITULAIRES = [
    "", "NGE GC", "NGE Energie", "NGE Routes", "EHTP",
    "NGE E.S.", "NGE Transitions", "Lyaudet", "Autre",
]


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
    responsable:     str
    source_legacy_id: Optional[int]
    site:            str = ""
    numero_etude:    str = ""
    filiale:         str = ""
    created_at:      str = ""
    updated_at:      str = ""
    nb_demandes:        int = 0
    nb_demandes_actives: int = 0


class AffaireRstCreateSchema(BaseModel):
    reference:      str            = Field(..., description="Ex: 2026-RA-042")
    client:         str            = Field("Non communiqué")
    titulaire:      str            = Field("")
    chantier:       str            = Field("Non communiqué")
    site:           str            = Field("")
    numero_etude:   str            = Field("")
    affaire_nge:    str            = Field("")
    filiale:        str            = Field("")
    date_ouverture: date           = Field(default_factory=date.today)
    date_cloture:   Optional[date] = Field(None)
    statut:         str            = Field("À qualifier")
    responsable:    str            = Field("")


class AffaireRstUpdateSchema(BaseModel):
    client:         Optional[str]  = None
    titulaire:      Optional[str]  = None
    chantier:       Optional[str]  = None
    site:           Optional[str]  = None
    numero_etude:   Optional[str]  = None
    affaire_nge:    Optional[str]  = None
    filiale:        Optional[str]  = None
    date_ouverture: Optional[date] = None
    date_cloture:   Optional[date] = None
    statut:         Optional[str]  = None
    responsable:    Optional[str]  = None


class AffaireRstResponseSchema(BaseModel):
    uid:             int
    reference:       str
    annee:           int
    region:          str
    numero:          int
    client:          str
    titulaire:       str
    chantier:        str
    site:            str = ""
    numero_etude:    str = ""
    affaire_nge:     str = ""
    filiale:         str = ""
    date_ouverture:  date
    date_cloture:    Optional[date]
    statut:          str
    responsable:     str
    source_legacy_id: Optional[int]
    created_at:      str
    updated_at:      str
    nb_demandes:        int = 0
    nb_demandes_actives: int = 0

    model_config = {"from_attributes": True}
