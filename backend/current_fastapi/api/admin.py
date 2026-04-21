"""
api/admin.py
Administrative API routes for RaLab4.
Protegido por permissão 'manage_users'.

Endpoints:
  GET    /api/admin/users                        → lista utilizadores
  GET    /api/admin/users/{email}                → detalhe utilizador
  POST   /api/admin/users                        → criar utilizador
  PUT    /api/admin/users/{email}                → actualizar utilizador
  PATCH  /api/admin/users/{email}/active         → activar / desactivar

  GET    /api/admin/roles                        → lista roles com permissões
  PUT    /api/admin/roles/{role_code}/permissions → redefinir permissões de um role

  GET    /api/admin/permissions                  → lista todas as permissões
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
import sqlite3

from api.auth import get_current_user, require_permission
from app.core.database import list_laboratoires
from app.repositories.competency_repository import CompetencyRepository
from app.repositories.security_repository import SecurityRepository

router = APIRouter()
_repo = SecurityRepository()
_competency_repo = CompetencyRepository()

# ── dependency: só manage_users pode aceder ───────────────────────────────────
AdminUser = Depends(require_permission("manage_users"))


# ── Schemas ───────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    email:        str
    display_name: str
    role_code:    str
    service_code: str
    employment_level_code: Optional[str] = None
    employment_level_label: Optional[str] = None
    is_active:    bool
    permissions:  list[str] = []


class UserCreateSchema(BaseModel):
    email:        str  = Field(..., description="Email único do utilizador")
    display_name: str  = Field(..., description="Nome completo")
    role_code:    str  = Field(..., description="Código do role")
    service_code: str  = Field(..., description="Código do serviço / agência")
    employment_level_code: Optional[str] = Field(None, description="Code du niveau / emploi")
    is_active:    bool = Field(True)


class UserUpdateSchema(BaseModel):
    display_name: Optional[str] = None
    role_code:    Optional[str] = None
    service_code: Optional[str] = None
    employment_level_code: Optional[str] = None
    is_active:    Optional[bool] = None


class ActivePatchSchema(BaseModel):
    is_active: bool


class RoleOut(BaseModel):
    role_code:   str
    label:       str
    permissions: list[str] = []


class PermissionOut(BaseModel):
    permission_code: str
    label:           str


class EmploymentLevelOut(BaseModel):
    employment_level_code: str
    label: str
    sort_order: int


class CompetencyLevelOut(BaseModel):
    level_code: str
    sort_order: int
    label: str
    description: str


class CompetencyOut(BaseModel):
    competency_id: int
    source_key: str
    domain: str
    context_type: str
    label: str
    reference: Optional[str] = None
    publication_date: Optional[str] = None
    simplified_protocol: Optional[str] = None
    certification: Optional[str] = None
    standard_referent: Optional[str] = None
    standard_update_impact: Optional[str] = None
    trainer_name: Optional[str] = None
    is_active: bool


class UserCompetencyAssessmentOut(BaseModel):
    assessment_id: int
    user_email: str
    competency_id: int
    source_key: str
    domain: str
    context_type: str
    competency_label: str
    reference: Optional[str] = None
    level_code: str
    level_label: str
    level_description: str
    assessed_at: str
    assessor_name: Optional[str] = None
    source_type: str
    source_reference: Optional[str] = None
    notes: Optional[str] = None


class UserCompetencyAssessmentCreateSchema(BaseModel):
    competency_id: int
    level_code: str
    assessed_at: Optional[str] = None
    assessor_name: Optional[str] = None
    source_type: str = Field("manual")
    source_reference: Optional[str] = None
    notes: Optional[str] = None


class UserProfileOut(BaseModel):
    user_email: str
    phone: Optional[str] = None
    agency_name: Optional[str] = None
    location_name: Optional[str] = None
    manager_name: Optional[str] = None
    professional_title: Optional[str] = None
    employee_reference: Optional[str] = None
    employment_start_date: Optional[str] = None
    last_reviewed_at: Optional[str] = None
    next_review_due_date: Optional[str] = None
    certifications_notes: Optional[str] = None
    authorizations_notes: Optional[str] = None
    training_notes: Optional[str] = None
    documents_notes: Optional[str] = None
    profile_notes: Optional[str] = None
    signature_display_name: Optional[str] = None
    signature_role_title: Optional[str] = None
    signature_image_data: Optional[str] = None
    signature_notes: Optional[str] = None
    signature_scale_percent: int = 100
    signature_offset_x: int = 0
    signature_offset_y: int = 0


class UserProfileUpdateSchema(BaseModel):
    phone: Optional[str] = None
    agency_name: Optional[str] = None
    location_name: Optional[str] = None
    manager_name: Optional[str] = None
    professional_title: Optional[str] = None
    employee_reference: Optional[str] = None
    employment_start_date: Optional[str] = None
    last_reviewed_at: Optional[str] = None
    next_review_due_date: Optional[str] = None
    certifications_notes: Optional[str] = None
    authorizations_notes: Optional[str] = None
    training_notes: Optional[str] = None
    documents_notes: Optional[str] = None
    profile_notes: Optional[str] = None
    signature_display_name: Optional[str] = None
    signature_role_title: Optional[str] = None
    signature_image_data: Optional[str] = None
    signature_notes: Optional[str] = None
    signature_scale_percent: Optional[int] = None
    signature_offset_x: Optional[int] = None
    signature_offset_y: Optional[int] = None


class RolePermissionsUpdateSchema(BaseModel):
    permissions: list[str] = Field(..., description="Lista completa de permission_codes para este role")


# ── helpers ───────────────────────────────────────────────────────────────────

def _build_user_out(row) -> UserOut:
    perms = _repo.get_permissions_for_role(row["role_code"])
    return UserOut(
        email=row["email"],
        display_name=row["display_name"],
        role_code=row["role_code"],
        service_code=row["service_code"],
        employment_level_code=row["employment_level_code"],
        employment_level_label=row["employment_level_label"],
        is_active=bool(row["is_active"]),
        permissions=perms,
    )


def _build_competency_out(row) -> CompetencyOut:
    return CompetencyOut(
        competency_id=int(row["competency_id"]),
        source_key=row["source_key"],
        domain=row["domain"],
        context_type=row["context_type"],
        label=row["label"],
        reference=row["reference"],
        publication_date=row["publication_date"],
        simplified_protocol=row["simplified_protocol"],
        certification=row["certification"],
        standard_referent=row["standard_referent"],
        standard_update_impact=row["standard_update_impact"],
        trainer_name=row["trainer_name"],
        is_active=bool(row["is_active"]),
    )


def _build_user_competency_assessment_out(row) -> UserCompetencyAssessmentOut:
    return UserCompetencyAssessmentOut(
        assessment_id=int(row["assessment_id"]),
        user_email=row["user_email"],
        competency_id=int(row["competency_id"]),
        source_key=row["source_key"],
        domain=row["domain"],
        context_type=row["context_type"],
        competency_label=row["competency_label"],
        reference=row["reference"],
        level_code=row["level_code"],
        level_label=row["level_label"],
        level_description=row["level_description"],
        assessed_at=row["assessed_at"],
        assessor_name=row["assessor_name"],
        source_type=row["source_type"],
        source_reference=row["source_reference"],
        notes=row["notes"],
    )


def _build_user_profile_out(user_email: str, row) -> UserProfileOut:
    if row is None:
        return UserProfileOut(user_email=user_email.strip().lower())

    return UserProfileOut(
        user_email=row["user_email"],
        phone=row["phone"],
        agency_name=row["agency_name"],
        location_name=row["location_name"],
        manager_name=row["manager_name"],
        professional_title=row["professional_title"],
        employee_reference=row["employee_reference"],
        employment_start_date=row["employment_start_date"],
        last_reviewed_at=row["last_reviewed_at"],
        next_review_due_date=row["next_review_due_date"],
        certifications_notes=row["certifications_notes"],
        authorizations_notes=row["authorizations_notes"],
        training_notes=row["training_notes"],
        documents_notes=row["documents_notes"],
        profile_notes=row["profile_notes"],
        signature_display_name=row["signature_display_name"],
        signature_role_title=row["signature_role_title"],
        signature_image_data=row["signature_image_data"],
        signature_notes=row["signature_notes"],
        signature_scale_percent=int(row["signature_scale_percent"]) if row["signature_scale_percent"] is not None else 100,
        signature_offset_x=int(row["signature_offset_x"]) if row["signature_offset_x"] is not None else 0,
        signature_offset_y=int(row["signature_offset_y"]) if row["signature_offset_y"] is not None else 0,
    )


# ── USERS ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserOut], summary="Listar todos os utilizadores")
def list_users(_=AdminUser):
    rows = _repo.list_all_users()
    return [_build_user_out(r) for r in rows]


@router.get("/users/{email}", response_model=UserOut, summary="Detalhe de um utilizador")
def get_user(email: str, _=AdminUser):
    row = _repo.get_user_by_email(email)
    if not row:
        raise HTTPException(404, f"Utilizador '{email}' não encontrado.")
    return _build_user_out(row)


@router.post("/users", response_model=UserOut, status_code=201, summary="Criar utilizador")
def create_user(body: UserCreateSchema, _=AdminUser):
    # Verificar se o role existe
    if not _repo.get_role_by_code(body.role_code):
        raise HTTPException(400, f"Role '{body.role_code}' não existe.")

    if body.employment_level_code and not _repo.get_employment_level(body.employment_level_code):
        raise HTTPException(400, f"Niveau '{body.employment_level_code}' non reconnu.")

    # Verificar duplicado
    if _repo.get_user_by_email(body.email.strip().lower()):
        raise HTTPException(409, f"Utilizador '{body.email}' já existe.")

    _repo.upsert_user(
        email=body.email,
        display_name=body.display_name,
        role_code=body.role_code,
        service_code=body.service_code,
        is_active=body.is_active,
        employment_level_code=body.employment_level_code,
    )
    row = _repo.get_user_by_email(body.email.strip().lower())
    return _build_user_out(row)


@router.put("/users/{email}", response_model=UserOut, summary="Actualizar utilizador")
def update_user(email: str, body: UserUpdateSchema, _=AdminUser):
    row = _repo.get_user_by_email(email)
    if not row:
        raise HTTPException(404, f"Utilizador '{email}' não encontrado.")

    # Se mudar o role, verificar que existe
    new_role = body.role_code or row["role_code"]
    if body.role_code and not _repo.get_role_by_code(body.role_code):
        raise HTTPException(400, f"Role '{body.role_code}' não existe.")

    employment_level_code = row["employment_level_code"]
    if "employment_level_code" in body.model_fields_set:
        employment_level_code = body.employment_level_code or None
        if employment_level_code and not _repo.get_employment_level(employment_level_code):
            raise HTTPException(400, f"Niveau '{employment_level_code}' non reconnu.")

    _repo.upsert_user(
        email=email,
        display_name=body.display_name or row["display_name"],
        role_code=new_role,
        service_code=body.service_code or row["service_code"],
        is_active=body.is_active if body.is_active is not None else bool(row["is_active"]),
        employment_level_code=employment_level_code,
    )
    updated = _repo.get_user_by_email(email.strip().lower())
    return _build_user_out(updated)


@router.patch("/users/{email}/active", response_model=UserOut, summary="Activar / desactivar utilizador")
def toggle_user_active(email: str, body: ActivePatchSchema, current=Depends(get_current_user)):
    # Não pode desactivar a si próprio
    if current["sub"].lower() == email.strip().lower() and not body.is_active:
        raise HTTPException(400, "Não podes desactivar a tua própria conta.")

    row = _repo.get_user_by_email(email)
    if not row:
        raise HTTPException(404, f"Utilizador '{email}' não encontrado.")

    _repo.set_user_active(email, body.is_active)
    updated = _repo.get_user_by_email(email.strip().lower())
    return _build_user_out(updated)


# ── ROLES ─────────────────────────────────────────────────────────────────────

@router.get("/roles", response_model=list[RoleOut], summary="Listar roles com permissões")
def list_roles(_=AdminUser):
    rows = _repo.list_roles()
    result = []
    for r in rows:
        perms = _repo.get_permissions_for_role(r["role_code"])
        result.append(RoleOut(role_code=r["role_code"], label=r["label"], permissions=perms))
    return result


@router.put(
    "/roles/{role_code}/permissions",
    response_model=RoleOut,
    summary="Redefinir permissões de um role",
    description="Substitui a lista completa de permissões do role. Envia a lista nova completa.",
)
def update_role_permissions(role_code: str, body: RolePermissionsUpdateSchema, _=AdminUser):
    role = _repo.get_role_by_code(role_code)
    if not role:
        raise HTTPException(404, f"Role '{role_code}' não existe.")

    # Verificar que todas as permissões existem
    all_perms = {r["permission_code"] for r in _repo.list_permissions()}
    unknown = [p for p in body.permissions if p not in all_perms]
    if unknown:
        raise HTTPException(400, f"Permissões desconhecidas: {unknown}")

    _repo.replace_role_permissions(role_code, body.permissions)
    return RoleOut(role_code=role["role_code"], label=role["label"], permissions=body.permissions)


# ── PERMISSIONS ───────────────────────────────────────────────────────────────

@router.get("/permissions", response_model=list[PermissionOut], summary="Listar todas as permissões")
def list_permissions(_=AdminUser):
    rows = _repo.list_permissions()
    return [PermissionOut(permission_code=r["permission_code"], label=r["label"]) for r in rows]


@router.get("/employment-levels", response_model=list[EmploymentLevelOut], summary="Listar níveis / emplois")
def list_employment_levels(_=AdminUser):
    rows = _repo.list_employment_levels()
    return [
        EmploymentLevelOut(
            employment_level_code=row["employment_level_code"],
            label=row["label"],
            sort_order=row["sort_order"],
        )
        for row in rows
    ]


@router.get("/competency-levels", response_model=list[CompetencyLevelOut], summary="Listar niveaux de compétence")
def list_competency_levels(_=AdminUser):
    rows = _competency_repo.list_levels()
    return [
        CompetencyLevelOut(
            level_code=row["level_code"],
            sort_order=int(row["sort_order"]),
            label=row["label"],
            description=row["description"],
        )
        for row in rows
    ]


@router.get("/competencies", response_model=list[CompetencyOut], summary="Listar catalogue des compétences")
def list_competencies(_=AdminUser):
    rows = _competency_repo.list_catalog(include_inactive=False)
    return [_build_competency_out(row) for row in rows]


@router.get(
    "/users/{email}/competency-assessments/current",
    response_model=list[UserCompetencyAssessmentOut],
    summary="Niveaux courants de compétences d'un utilisateur",
)
def list_user_current_competency_assessments(email: str, _=AdminUser):
    user = _repo.get_user_by_email(email)
    if not user:
        raise HTTPException(404, f"Utilizador '{email}' não encontrado.")

    rows = _competency_repo.list_user_current_assessments(email)
    return [_build_user_competency_assessment_out(row) for row in rows]


@router.get(
    "/users/{email}/competency-assessments",
    response_model=list[UserCompetencyAssessmentOut],
    summary="Historique des évaluations de compétences d'un utilisateur",
)
def list_user_competency_assessments(email: str, _=AdminUser):
    user = _repo.get_user_by_email(email)
    if not user:
        raise HTTPException(404, f"Utilizador '{email}' não encontrado.")

    rows = _competency_repo.list_user_assessment_history(email)
    return [_build_user_competency_assessment_out(row) for row in rows]


@router.post(
    "/users/{email}/competency-assessments",
    response_model=UserCompetencyAssessmentOut,
    status_code=201,
    summary="Ajouter une évaluation de compétence",
)
def create_user_competency_assessment(email: str, body: UserCompetencyAssessmentCreateSchema, _=AdminUser):
    user = _repo.get_user_by_email(email)
    if not user:
        raise HTTPException(404, f"Utilizador '{email}' não encontrado.")

    competency = _competency_repo.get_competency(body.competency_id)
    if not competency:
        raise HTTPException(404, f"Compétence '{body.competency_id}' introuvable.")
    if not bool(competency["is_active"]):
        raise HTTPException(400, "Cette compétence est inactive et ne peut plus être évaluée.")

    level = _competency_repo.get_level(body.level_code)
    if not level:
        raise HTTPException(400, f"Niveau '{body.level_code}' non reconnu.")

    try:
        assessment_id = _competency_repo.create_assessment(
            user_email=email,
            competency_id=body.competency_id,
            level_code=body.level_code,
            assessed_at=body.assessed_at,
            assessor_name=body.assessor_name,
            source_type=body.source_type,
            source_reference=body.source_reference,
            notes=body.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Une évaluation existe déjà pour cette date.") from exc

    rows = _competency_repo.list_user_assessment_history(email)
    row = next((candidate for candidate in rows if int(candidate["assessment_id"]) == assessment_id), None)
    if row is None:
        raise HTTPException(status_code=500, detail="Évaluation créée mais non retrouvée.")

    return _build_user_competency_assessment_out(row)


@router.delete(
    "/users/{email}/competency-assessments/{assessment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Supprimer une évaluation de compétence",
)
def delete_user_competency_assessment(email: str, assessment_id: int, _=AdminUser):
    user = _repo.get_user_by_email(email)
    if not user:
        raise HTTPException(404, f"Utilizador '{email}' não encontrado.")

    deleted = _competency_repo.delete_assessment(email, assessment_id)
    if not deleted:
        raise HTTPException(404, f"Évaluation '{assessment_id}' introuvable pour cet utilisateur.")

    return None


@router.get(
    "/users/{email}/profile",
    response_model=UserProfileOut,
    summary="Fiche detaillee d'un utilisateur",
)
def get_user_profile(email: str, _=AdminUser):
    user = _repo.get_user_by_email(email)
    if not user:
        raise HTTPException(404, f"Utilizador '{email}' não encontrado.")

    row = _repo.get_user_profile(email)
    return _build_user_profile_out(email, row)


@router.put(
    "/users/{email}/profile",
    response_model=UserProfileOut,
    summary="Mettre a jour la fiche detaillee d'un utilisateur",
)
def update_user_profile(email: str, body: UserProfileUpdateSchema, _=AdminUser):
    user = _repo.get_user_by_email(email)
    if not user:
        raise HTTPException(404, f"Utilizador '{email}' não encontrado.")

    _repo.upsert_user_profile(
        user_email=email,
        phone=body.phone,
        agency_name=body.agency_name,
        location_name=body.location_name,
        manager_name=body.manager_name,
        professional_title=body.professional_title,
        employee_reference=body.employee_reference,
        employment_start_date=body.employment_start_date,
        last_reviewed_at=body.last_reviewed_at,
        next_review_due_date=body.next_review_due_date,
        certifications_notes=body.certifications_notes,
        authorizations_notes=body.authorizations_notes,
        training_notes=body.training_notes,
        documents_notes=body.documents_notes,
        profile_notes=body.profile_notes,
        signature_display_name=body.signature_display_name,
        signature_role_title=body.signature_role_title,
        signature_image_data=body.signature_image_data,
        signature_notes=body.signature_notes,
        signature_scale_percent=body.signature_scale_percent,
        signature_offset_x=body.signature_offset_x,
        signature_offset_y=body.signature_offset_y,
    )
    row = _repo.get_user_profile(email)
    return _build_user_profile_out(email, row)


@router.get("/labs", summary="List laboratories available in RaLab4")
def list_labs():
    return list_laboratoires()
