"""
app/models/demande.py  — RaLab4 v2
DemandeRecord + schemas Pydantic com todos os campos do RaLab4.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date
from typing import Optional
from pydantic import BaseModel, Field


@dataclass(slots=True)
class DemandeRecord:
    uid: int
    reference_base: str
    reference: str
    affaire: str
    titre: str
    client: str
    chantier: str
    numero_dst: str
    nature: str
    statut: str
    demandeur: str
    service: str
    laboratoire: str
    date_demande: date
    echeance: Optional[date]
    priorite: str
    description: str
    observations: str
    dossier_nom_actuel: str = ""
    dossier_path_actuel: str = ""
    a_revoir: bool = False
    note_reconciliation: str = ""
    source_legacy_id: Optional[int] = None
    created_at: str = ""
    updated_at: str = ""

    def review_label(self) -> str:
        return "À revoir" if self.a_revoir else "OK"

    def dossier_display_name(self) -> str:
        if self.dossier_nom_actuel.strip():
            return self.dossier_nom_actuel.strip()
        if self.dossier_path_actuel.strip():
            return self.dossier_path_actuel.strip().replace("\\", "/").rstrip("/").split("/")[-1]
        return ""


# ── Schemas Pydantic ──────────────────────────────────────────────────────────

class DemandeCreateSchema(BaseModel):
    reference_base:      str            = Field(..., description="Ex: 2026-RA-001")
    affaire:             str            = Field("Non communiqué")
    titre:               str            = Field("Non communiqué")
    client:              str            = Field("Non communiqué")
    chantier:            str            = Field("Non communiqué")
    numero_dst:          str            = Field("")
    nature:              str            = Field("")
    statut:              str            = Field("À qualifier")
    demandeur:           str            = Field("")
    service:             str            = Field("RST")
    laboratoire:         str            = Field("À définir")
    date_demande:        date           = Field(default_factory=date.today)
    echeance:            Optional[date] = Field(None)
    priorite:            str            = Field("Normale")
    description:         str            = Field("")
    observations:        str            = Field("")
    dossier_nom_actuel:  str            = Field("")
    dossier_path_actuel: str            = Field("")
    a_revoir:            bool           = Field(False)
    note_reconciliation: str            = Field("")
    source_legacy_id:    Optional[int]  = Field(None)


class DemandeUpdateSchema(BaseModel):
    affaire:             Optional[str]  = None
    titre:               Optional[str]  = None
    client:              Optional[str]  = None
    chantier:            Optional[str]  = None
    numero_dst:          Optional[str]  = None
    nature:              Optional[str]  = None
    statut:              Optional[str]  = None
    demandeur:           Optional[str]  = None
    service:             Optional[str]  = None
    laboratoire:         Optional[str]  = None
    date_demande:        Optional[date] = None
    echeance:            Optional[date] = None
    priorite:            Optional[str]  = None
    description:         Optional[str]  = None
    observations:        Optional[str]  = None
    dossier_nom_actuel:  Optional[str]  = None
    dossier_path_actuel: Optional[str]  = None
    a_revoir:            Optional[bool] = None
    note_reconciliation: Optional[str]  = None
    source_legacy_id:    Optional[int]  = None


class DemandeResponseSchema(BaseModel):
    uid:                 int
    reference_base:      str
    reference:           str
    affaire:             str
    titre:               str
    client:              str
    chantier:            str
    numero_dst:          str
    nature:              str
    statut:              str
    demandeur:           str
    service:             str
    laboratoire:         str
    date_demande:        date
    echeance:            Optional[date]
    priorite:            str
    description:         str
    observations:        str
    dossier_nom_actuel:  str
    dossier_path_actuel: str
    a_revoir:            bool
    note_reconciliation: str
    source_legacy_id:    Optional[int]
    created_at:          str
    updated_at:          str

    model_config = {"from_attributes": True}
