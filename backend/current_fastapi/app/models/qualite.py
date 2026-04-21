"""
app/models/qualite.py — Modèles Qualité
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional
from pydantic import BaseModel, Field

CATEGORIES_EQ   = ["Labo", "Terrain", "Métrologie", "Informatique", "Tamis", "Vérification", "Autre"]
STATUTS_EQ      = ["En service", "En maintenance", "Hors service", "Réformé", "Non utilisé"]
CONTROL_TYPES   = ["Étalonnage", "Vérification", "Maintenance préventive", "Contrôle interne"]
CONTROL_STATUTS = ["Valide", "Non conforme", "En cours"]
PROC_FAMILIES   = ["Essais granulats", "Essais enrobés", "Essais sols", "Essais béton", "Métrologie", "Sécurité", "Management", "Informatique", "Autre"]
STD_FAMILIES    = ["Granulats", "Enrobés", "Sols", "Béton", "Métrologie", "Management qualité", "Géotechnique", "Autre"]
DOC_STATUTS     = ["En vigueur", "En révision", "Obsolète", "Projet"]
NC_SOURCES      = ["Essai", "Audit interne", "Audit externe", "Client", "Fournisseur", "Étalonnage", "Observation interne", "Autre"]
NC_SEVERITES    = ["Mineure", "Majeure", "Observation"]
NC_STATUTS      = ["Ouverte", "En cours", "Clôturée", "Vérifiée"]


# ── Equipment ────────────────────────────────────────────────────────────────
@dataclass(slots=True)
class EquipmentRecord:
    uid: int; code: str; label: str; category: str; domain: Optional[str]
    status: str; serial_number: Optional[str]; supplier: Optional[str]
    purchase_date: Optional[str]; lieu: Optional[str]
    etalonnage_interval: Optional[int]; verification_interval: Optional[int]
    presence: Optional[str]; notes: Optional[str]
    # Champs moule (Proctor / CBR)
    m_tare: Optional[float] = None; volume_cm3: Optional[float] = None
    # Champs comparateur
    division: Optional[str] = None; precision: Optional[str] = None
    # Champs anneau dynamométrique / capteur de force (IPI / CBR)
    capacite: Optional[float] = None       # Capacité maximale (kN)
    sensibilite: Optional[float] = None    # Sensibilité nominale (kN/div ou kN/mV)
    facteur_k: Optional[float] = None      # Constante de conversion retenue (kN/division)
    created_at: str = ""; updated_at: str = ""
    last_metrology: Optional[str] = None; next_metrology: Optional[str] = None

class EquipmentCreateSchema(BaseModel):
    code: str = Field(..., min_length=1); label: str = Field(..., min_length=1)
    category: str = "Labo"; domain: Optional[str] = None; status: str = "En service"
    serial_number: Optional[str] = None; supplier: Optional[str] = None
    purchase_date: Optional[str] = None; lieu: Optional[str] = None
    etalonnage_interval: Optional[int] = None; verification_interval: Optional[int] = None
    presence: Optional[str] = None; notes: Optional[str] = None
    m_tare: Optional[float] = None; volume_cm3: Optional[float] = None
    division: Optional[str] = None; precision: Optional[str] = None
    capacite: Optional[float] = None; sensibilite: Optional[float] = None
    facteur_k: Optional[float] = None

class EquipmentUpdateSchema(BaseModel):
    code: Optional[str] = None; label: Optional[str] = None; category: Optional[str] = None
    domain: Optional[str] = None; status: Optional[str] = None
    serial_number: Optional[str] = None; supplier: Optional[str] = None
    purchase_date: Optional[str] = None; lieu: Optional[str] = None
    etalonnage_interval: Optional[int] = None; verification_interval: Optional[int] = None
    presence: Optional[str] = None; notes: Optional[str] = None
    m_tare: Optional[float] = None; volume_cm3: Optional[float] = None
    division: Optional[str] = None; precision: Optional[str] = None
    capacite: Optional[float] = None; sensibilite: Optional[float] = None
    facteur_k: Optional[float] = None

class EquipmentResponseSchema(BaseModel):
    uid: int; code: str; label: str; category: str; domain: Optional[str]
    status: str; serial_number: Optional[str]; supplier: Optional[str]
    purchase_date: Optional[str]; lieu: Optional[str]
    etalonnage_interval: Optional[int]; verification_interval: Optional[int]
    presence: Optional[str]; notes: Optional[str]
    m_tare: Optional[float] = None; volume_cm3: Optional[float] = None
    division: Optional[str] = None; precision: Optional[str] = None
    capacite: Optional[float] = None; sensibilite: Optional[float] = None
    facteur_k: Optional[float] = None
    created_at: str = ""; updated_at: str = ""
    last_metrology: Optional[str] = None; next_metrology: Optional[str] = None
    model_config = {"from_attributes": True}


# ── Metrology ────────────────────────────────────────────────────────────────
@dataclass(slots=True)
class MetrologyRecord:
    uid: int; equipment_id: int; control_type: str; status: str
    reference: Optional[str]; provider: Optional[str]
    performed_on: Optional[str]; valid_until: Optional[str]; notes: Optional[str]
    created_at: str = ""; eq_code: str = ""; eq_label: str = ""; eq_category: str = ""

class MetrologyCreateSchema(BaseModel):
    equipment_id: int; control_type: str = "Étalonnage"; status: str = "Valide"
    reference: Optional[str] = None; provider: Optional[str] = None
    performed_on: Optional[str] = None; valid_until: Optional[str] = None; notes: Optional[str] = None

class MetrologyUpdateSchema(BaseModel):
    control_type: Optional[str] = None; status: Optional[str] = None
    reference: Optional[str] = None; provider: Optional[str] = None
    performed_on: Optional[str] = None; valid_until: Optional[str] = None; notes: Optional[str] = None

class MetrologyResponseSchema(BaseModel):
    uid: int; equipment_id: int; control_type: str; status: str
    reference: Optional[str]; provider: Optional[str]
    performed_on: Optional[str]; valid_until: Optional[str]; notes: Optional[str]
    created_at: str = ""; eq_code: str = ""; eq_label: str = ""; eq_category: str = ""
    model_config = {"from_attributes": True}


# ── Procedures ───────────────────────────────────────────────────────────────
@dataclass(slots=True)
class ProcedureRecord:
    uid: int; code: str; title: str; technical_family: Optional[str]
    version: str; status: str; owner: Optional[str]
    issue_date: Optional[str]; review_date: Optional[str]
    file_path: Optional[str]; notes: Optional[str]
    created_at: str = ""; updated_at: str = ""; review_due: bool = False

class ProcedureCreateSchema(BaseModel):
    code: str = Field(..., min_length=1); title: str = Field(..., min_length=1)
    technical_family: Optional[str] = None; version: str = "1.0"; status: str = "En vigueur"
    owner: Optional[str] = None; issue_date: Optional[str] = None
    review_date: Optional[str] = None; file_path: Optional[str] = None; notes: Optional[str] = None

class ProcedureUpdateSchema(BaseModel):
    code: Optional[str] = None; title: Optional[str] = None
    technical_family: Optional[str] = None; version: Optional[str] = None; status: Optional[str] = None
    owner: Optional[str] = None; issue_date: Optional[str] = None
    review_date: Optional[str] = None; file_path: Optional[str] = None; notes: Optional[str] = None

class ProcedureResponseSchema(BaseModel):
    uid: int; code: str; title: str; technical_family: Optional[str]
    version: str; status: str; owner: Optional[str]
    issue_date: Optional[str]; review_date: Optional[str]
    file_path: Optional[str]; notes: Optional[str]
    created_at: str = ""; updated_at: str = ""; review_due: bool = False
    model_config = {"from_attributes": True}


# ── Standards ────────────────────────────────────────────────────────────────
@dataclass(slots=True)
class StandardRecord:
    uid: int; code: str; title: str; technical_family: Optional[str]
    issuer: Optional[str]; version: Optional[str]; status: str
    issue_date: Optional[str]; notes: Optional[str]
    created_at: str = ""; updated_at: str = ""

class StandardCreateSchema(BaseModel):
    code: str = Field(..., min_length=1); title: str = Field(..., min_length=1)
    technical_family: Optional[str] = None; issuer: Optional[str] = None
    version: Optional[str] = None; status: str = "En vigueur"
    issue_date: Optional[str] = None; notes: Optional[str] = None

class StandardUpdateSchema(BaseModel):
    code: Optional[str] = None; title: Optional[str] = None
    technical_family: Optional[str] = None; issuer: Optional[str] = None
    version: Optional[str] = None; status: Optional[str] = None
    issue_date: Optional[str] = None; notes: Optional[str] = None

class StandardResponseSchema(BaseModel):
    uid: int; code: str; title: str; technical_family: Optional[str]
    issuer: Optional[str]; version: Optional[str]; status: str
    issue_date: Optional[str]; notes: Optional[str]
    created_at: str = ""; updated_at: str = ""
    model_config = {"from_attributes": True}


# ── Non-conformités ──────────────────────────────────────────────────────────
@dataclass(slots=True)
class NcRecord:
    uid: int; reference: str; source_type: str; severity: str; status: str
    source_ref: Optional[str]; title: Optional[str]; description: Optional[str]
    detected_on: Optional[str]; detected_by: Optional[str]
    action_immediate: Optional[str]; corrective_action: Optional[str]
    owner: Optional[str]; due_date: Optional[str]; closure_date: Optional[str]
    created_at: str = ""; updated_at: str = ""; is_late: bool = False

class NcCreateSchema(BaseModel):
    source_type: str = "Essai"; severity: str = "Mineure"; status: str = "Ouverte"
    source_ref: Optional[str] = None; title: Optional[str] = None
    description: Optional[str] = None; detected_on: Optional[str] = None
    detected_by: Optional[str] = None; action_immediate: Optional[str] = None
    corrective_action: Optional[str] = None; owner: Optional[str] = None
    due_date: Optional[str] = None

class NcUpdateSchema(BaseModel):
    source_type: Optional[str] = None; severity: Optional[str] = None; status: Optional[str] = None
    source_ref: Optional[str] = None; title: Optional[str] = None
    description: Optional[str] = None; detected_on: Optional[str] = None
    detected_by: Optional[str] = None; action_immediate: Optional[str] = None
    corrective_action: Optional[str] = None; owner: Optional[str] = None
    due_date: Optional[str] = None; closure_date: Optional[str] = None

class NcResponseSchema(BaseModel):
    uid: int; reference: str; source_type: str; severity: str; status: str
    source_ref: Optional[str]; title: Optional[str]; description: Optional[str]
    detected_on: Optional[str]; detected_by: Optional[str]
    action_immediate: Optional[str]; corrective_action: Optional[str]
    owner: Optional[str]; due_date: Optional[str]; closure_date: Optional[str]
    created_at: str = ""; updated_at: str = ""; is_late: bool = False
    model_config = {"from_attributes": True}
