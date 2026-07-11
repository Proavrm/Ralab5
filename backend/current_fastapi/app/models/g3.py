"""Modèles Pydantic pour le module G3."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class G3MissionCreateSchema(BaseModel):
    demande_id: int
    title: str = ""
    client: str = ""
    chantier: str = ""
    location: str = ""
    status: str = "À préparer"
    mission_types: list[str] = Field(default_factory=list)
    description: str = ""
    main_objective: str = ""
    conducteur: str = ""
    chef_chantier: str = ""
    rst_responsible: str = ""
    laboratoire: str = ""
    lab_intervenant: str = ""
    geotechnicien_externe: str = ""
    moa: str = ""
    moe: str = ""
    bureau_controle: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class G3MissionUpdateSchema(BaseModel):
    title: Optional[str] = None
    client: Optional[str] = None
    chantier: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    mission_types: Optional[list[str]] = None
    description: Optional[str] = None
    main_objective: Optional[str] = None
    conducteur: Optional[str] = None
    chef_chantier: Optional[str] = None
    rst_responsible: Optional[str] = None
    laboratoire: Optional[str] = None
    lab_intervenant: Optional[str] = None
    geotechnicien_externe: Optional[str] = None
    moa: Optional[str] = None
    moe: Optional[str] = None
    bureau_controle: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class G3ZoneSchema(BaseModel):
    id: Optional[int] = None
    mission_id: Optional[int] = None
    name: str = ""
    type: str = ""
    description: str = ""
    location: str = ""
    status: str = ""
    risk_level: str = "Faible"
    responsible: str = ""
    observations: str = ""
    plan_id: str = ""
    plan_object_id: str = ""


class G3ZoneCreateSchema(BaseModel):
    name: str = ""
    type: str = ""
    description: str = ""
    location: str = ""
    status: str = ""
    risk_level: str = "Faible"
    responsible: str = ""
    observations: str = ""
    plan_id: str = ""
    plan_object_id: str = ""


class G3ZoneUpdateSchema(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    risk_level: Optional[str] = None
    responsible: Optional[str] = None
    observations: Optional[str] = None
    plan_id: Optional[str] = None
    plan_object_id: Optional[str] = None


class G3DocumentSchema(BaseModel):
    id: Optional[int] = None
    mission_id: Optional[int] = None
    zone_id: Optional[int] = None
    type: str = ""
    name: str = ""
    reference: str = ""
    version: str = ""
    document_date: Optional[str] = None
    author: str = ""
    received: bool = False
    analyzed: bool = False
    used_in_report: bool = False
    observations: str = ""
    file_url: str = ""
    stored_path: str = ""
    uploaded_at: Optional[str] = None
    zone_name: str = ""


class G3DocumentCreateSchema(BaseModel):
    zone_id: Optional[int] = None
    type: str = ""
    name: str = ""
    reference: str = ""
    version: str = ""
    document_date: Optional[str] = None
    author: str = ""
    received: bool = False
    analyzed: bool = False
    used_in_report: bool = False
    observations: str = ""
    file_url: str = ""
    stored_path: str = ""


class G3DocumentUpdateSchema(BaseModel):
    zone_id: Optional[int] = None
    type: Optional[str] = None
    name: Optional[str] = None
    reference: Optional[str] = None
    version: Optional[str] = None
    document_date: Optional[str] = None
    author: Optional[str] = None
    received: Optional[bool] = None
    analyzed: Optional[bool] = None
    used_in_report: Optional[bool] = None
    observations: Optional[str] = None
    file_url: Optional[str] = None
    stored_path: Optional[str] = None
    uploaded_at: Optional[str] = None


class G3DocumentsReplaceSchema(BaseModel):
    documents: list[G3DocumentCreateSchema] = Field(default_factory=list)

class G3ObjectiveSchema(BaseModel):
    id: Optional[int] = None
    mission_id: Optional[int] = None
    zone_id: Optional[int] = None
    label: str = ""
    description: str = ""
    priority: str = "Moyenne"
    status: str = "À faire"
    responsible: str = ""
    expected_result: str = ""
    comments: str = ""
    zone_name: str = ""


class G3ObjectiveCreateSchema(BaseModel):
    zone_id: Optional[int] = None
    label: str = ""
    description: str = ""
    priority: str = "Moyenne"
    status: str = "À faire"
    responsible: str = ""
    expected_result: str = ""
    comments: str = ""


class G3ObjectiveUpdateSchema(BaseModel):
    zone_id: Optional[int] = None
    label: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    responsible: Optional[str] = None
    expected_result: Optional[str] = None
    comments: Optional[str] = None


class G3InterventionSchema(BaseModel):
    id: Optional[int] = None
    mission_id: Optional[int] = None
    zone_id: Optional[int] = None
    plan_object_id: str = ""
    number: str = ""
    type: str = ""
    phase: str = "planned"
    date: Optional[str] = None
    start_time: str = ""
    end_time: str = ""
    responsible: str = ""
    participants: str = ""
    objective: str = ""
    means: str = ""
    prerequisites: str = ""
    expected_deliverable: str = ""
    description: str = ""
    findings: str = ""
    decision: str = ""
    next_actions: str = ""
    comments: str = ""
    status: str = "À prévoir"
    weather: str = ""
    hydric_condition: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    linked_intervention_id: Optional[int] = None
    realized_from_id: Optional[int] = None
    zone_name: str = ""


class G3InterventionCreateSchema(BaseModel):
    zone_id: Optional[int] = None
    type: str = ""
    objective: str = ""
    means: str = ""
    responsible: str = ""
    prerequisites: str = ""
    date: Optional[str] = None
    status: str = "À prévoir"
    expected_deliverable: str = ""
    comments: str = ""


class G3InterventionUpdateSchema(BaseModel):
    zone_id: Optional[int] = None
    type: Optional[str] = None
    objective: Optional[str] = None
    means: Optional[str] = None
    responsible: Optional[str] = None
    prerequisites: Optional[str] = None
    date: Optional[str] = None
    status: Optional[str] = None
    expected_deliverable: Optional[str] = None
    comments: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    participants: Optional[str] = None
    description: Optional[str] = None
    findings: Optional[str] = None
    decision: Optional[str] = None
    next_actions: Optional[str] = None
    weather: Optional[str] = None
    hydric_condition: Optional[str] = None
    plan_object_id: Optional[str] = None
    payload: Optional[dict[str, Any]] = None


class G3RealizedInterventionCreateSchema(BaseModel):
    zone_id: Optional[int] = None
    type: str = ""
    objective: str = ""
    means: str = ""
    responsible: str = ""
    date: Optional[str] = None
    status: str = "Brouillon"
    description: str = ""
    comments: str = ""


class G3TestSchema(BaseModel):
    id: Optional[int] = None
    mission_id: Optional[int] = None
    zone_id: Optional[int] = None
    intervention_id: Optional[int] = None
    type: str = ""
    label: str = ""
    reference: str = ""
    test_date: Optional[str] = None
    status: str = "En attente"
    result: str = ""
    conformity: str = "En attente"
    observations: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
    zone_name: str = ""
    intervention_number: str = ""


class G3TestCreateSchema(BaseModel):
    zone_id: Optional[int] = None
    intervention_id: Optional[int] = None
    type: str = ""
    label: str = ""
    reference: str = ""
    test_date: Optional[str] = None
    status: str = "En attente"
    result: str = ""
    conformity: str = "En attente"
    observations: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)


class G3TestUpdateSchema(BaseModel):
    zone_id: Optional[int] = None
    intervention_id: Optional[int] = None
    type: Optional[str] = None
    label: Optional[str] = None
    reference: Optional[str] = None
    test_date: Optional[str] = None
    status: Optional[str] = None
    result: Optional[str] = None
    conformity: Optional[str] = None
    observations: Optional[str] = None
    payload: Optional[dict[str, Any]] = None


class G3PhotoSchema(BaseModel):
    id: Optional[int] = None
    mission_id: Optional[int] = None
    zone_id: Optional[int] = None
    intervention_id: Optional[int] = None
    caption: str = ""
    stored_path: str = ""
    use_in_report: bool = False
    sort_order: int = 0
    taken_at: Optional[str] = None
    uploaded_at: Optional[str] = None
    zone_name: str = ""
    intervention_number: str = ""


class G3PhotoCreateSchema(BaseModel):
    zone_id: Optional[int] = None
    intervention_id: Optional[int] = None
    caption: str = ""
    stored_path: str = ""
    use_in_report: bool = False
    sort_order: int = 0
    taken_at: Optional[str] = None
    uploaded_at: Optional[str] = None


class G3PhotoUpdateSchema(BaseModel):
    zone_id: Optional[int] = None
    intervention_id: Optional[int] = None
    caption: Optional[str] = None
    stored_path: Optional[str] = None
    use_in_report: Optional[bool] = None
    sort_order: Optional[int] = None
    taken_at: Optional[str] = None
    uploaded_at: Optional[str] = None


class G3NoticeSchema(BaseModel):
    id: Optional[int] = None
    mission_id: Optional[int] = None
    zone_id: Optional[int] = None
    intervention_id: Optional[int] = None
    type: str = ""
    reference: str = ""
    title: str = ""
    status: str = "Brouillon"
    notice_date: Optional[str] = None
    formulation: str = ""
    content: str = ""
    conditions: str = ""
    recommendations: str = ""
    transmitted_at: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)
    zone_name: str = ""
    intervention_number: str = ""


class G3NoticeCreateSchema(BaseModel):
    zone_id: Optional[int] = None
    intervention_id: Optional[int] = None
    type: str = ""
    reference: str = ""
    title: str = ""
    status: str = "Brouillon"
    notice_date: Optional[str] = None
    formulation: str = ""
    content: str = ""
    conditions: str = ""
    recommendations: str = ""
    transmitted_at: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)


class G3NoticeUpdateSchema(BaseModel):
    zone_id: Optional[int] = None
    intervention_id: Optional[int] = None
    type: Optional[str] = None
    reference: Optional[str] = None
    title: Optional[str] = None
    status: Optional[str] = None
    notice_date: Optional[str] = None
    formulation: Optional[str] = None
    content: Optional[str] = None
    conditions: Optional[str] = None
    recommendations: Optional[str] = None
    transmitted_at: Optional[str] = None
    payload: Optional[dict[str, Any]] = None


class G3NoticeDraftRequestSchema(BaseModel):
    type: str = ""
    zone_id: Optional[int] = None
    intervention_id: Optional[int] = None


class G3NoticeDraftSchema(BaseModel):
    formulation: str = ""
    content: str = ""
    conditions: str = ""
    recommendations: str = ""


class G3HoldPointSchema(BaseModel):
    id: Optional[int] = None
    mission_id: Optional[int] = None
    zone_id: Optional[int] = None
    notice_id: Optional[int] = None
    code: str = ""
    label: str = ""
    description: str = ""
    status: str = "À venir"
    due_date: Optional[str] = None
    validated_at: Optional[str] = None
    observations: str = ""
    requires_tests: bool = False
    requires_notice: bool = False
    zone_name: str = ""
    notice_reference: str = ""
    alerts: list[str] = Field(default_factory=list)


class G3HoldPointCreateSchema(BaseModel):
    zone_id: Optional[int] = None
    notice_id: Optional[int] = None
    code: str = ""
    label: str = ""
    description: str = ""
    status: str = "À venir"
    due_date: Optional[str] = None
    observations: str = ""
    requires_tests: bool = False
    requires_notice: bool = False


class G3HoldPointUpdateSchema(BaseModel):
    zone_id: Optional[int] = None
    notice_id: Optional[int] = None
    code: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[str] = None
    validated_at: Optional[str] = None
    observations: Optional[str] = None
    requires_tests: Optional[bool] = None
    requires_notice: Optional[bool] = None


class G3PlanningItemSchema(BaseModel):
    kind: str = ""
    item_id: int = 0
    label: str = ""
    date: Optional[str] = None
    status: str = ""
    zone_name: str = ""
    overdue: bool = False
    alert: str = ""


class G3PlanningOverviewSchema(BaseModel):
    items: list[G3PlanningItemSchema] = Field(default_factory=list)
    alerts: list[str] = Field(default_factory=list)
    overdue_count: int = 0


class G3DeliverableSchema(BaseModel):
    id: Optional[int] = None
    mission_id: Optional[int] = None
    type: str = ""
    title: str = ""
    version: str = "1"
    status: str = "À produire"
    due_date: Optional[str] = None
    generated_at: Optional[str] = None
    stored_path: str = ""
    observations: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)


class G3DeliverableCreateSchema(BaseModel):
    type: str = ""
    title: str = ""
    version: str = "1"
    status: str = "À produire"
    due_date: Optional[str] = None
    observations: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)


class G3DeliverableUpdateSchema(BaseModel):
    type: Optional[str] = None
    title: Optional[str] = None
    version: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[str] = None
    generated_at: Optional[str] = None
    stored_path: Optional[str] = None
    observations: Optional[str] = None
    payload: Optional[dict[str, Any]] = None


class G3HistorySchema(BaseModel):
    id: int
    mission_id: int
    user_name: str = ""
    action: str = ""
    entity_type: str = ""
    entity_id: Optional[int] = None
    comment: str = ""
    created_at: str = ""


class G3MissionResponseSchema(BaseModel):
    id: int
    reference: str
    affaire_rst_id: int
    demande_id: int
    affaire_ref: str = ""
    demande_ref: str = ""
    title: str = ""
    client: str = ""
    chantier: str = ""
    location: str = ""
    status: str = "À préparer"
    mission_types: list[str] = Field(default_factory=list)
    description: str = ""
    main_objective: str = ""
    conducteur: str = ""
    chef_chantier: str = ""
    rst_responsible: str = ""
    laboratoire: str = ""
    lab_intervenant: str = ""
    geotechnicien_externe: str = ""
    moa: str = ""
    moe: str = ""
    bureau_controle: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""
    zones: list[G3ZoneSchema] = Field(default_factory=list)
    documents: list[G3DocumentSchema] = Field(default_factory=list)
    objectives: list[G3ObjectiveSchema] = Field(default_factory=list)
    planned_interventions: list[G3InterventionSchema] = Field(default_factory=list)
    realized_interventions: list[G3InterventionSchema] = Field(default_factory=list)
    tests: list[G3TestSchema] = Field(default_factory=list)
    photos: list[G3PhotoSchema] = Field(default_factory=list)
    notices: list[G3NoticeSchema] = Field(default_factory=list)
    hold_points: list[G3HoldPointSchema] = Field(default_factory=list)
    deliverables: list[G3DeliverableSchema] = Field(default_factory=list)
    history: list[G3HistorySchema] = Field(default_factory=list)


class G3MissionListItemSchema(BaseModel):
    id: int
    reference: str
    affaire_ref: str = ""
    demande_ref: str = ""
    title: str = ""
    client: str = ""
    chantier: str = ""
    status: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    nb_planned: int = 0
    nb_realized: int = 0
    updated_at: str = ""


class G3ProgrammeDocumentSchema(BaseModel):
    html: str
    title: str = "Programme des reconnaissances G3"
