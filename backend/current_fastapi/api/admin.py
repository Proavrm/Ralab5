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
from app.repositories.laboratoires_repository import LaboratoiresRepository
from app.services.lab_geo_catalog import invalidate_lab_geo_cache
from app.services.laboratoire_detail_service import (
    build_laboratoire_detail,
    list_laboratoires_summary,
    list_laboratoires_with_org,
)
from app.services.laboratoire_org_catalog import list_org_regions_payload, invalidate_org_cache
from app.services.laboratoire_code_service import rename_laboratoire_code, delete_laboratoire_code
from app.repositories.org_repository import OrgRepository
from app.repositories.competency_repository import CompetencyRepository
from app.services.competency_rst_mapping import RST_CODE_SET, rst_code_catalog_payload, rst_code_label
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
    rst_code: Optional[str] = None
    rst_label: Optional[str] = None
    is_active: bool


class CompetencyRstCodeUpdateSchema(BaseModel):
    rst_code: Optional[str] = None


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
        rst_code=str(row["rst_code"]).strip().upper() if row["rst_code"] else None,
        rst_label=rst_code_label(row["rst_code"]) if row["rst_code"] else None,
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


@router.get("/competencies/rst-code-options", summary="Options de codes RST opérationnels")
def list_competency_rst_code_options(_=AdminUser):
    return {
        "options": rst_code_catalog_payload(),
    }


@router.patch(
    "/competencies/{competency_id}/rst-code",
    response_model=CompetencyOut,
    summary="Associer un code RST à une compétence",
)
def update_competency_rst_code(competency_id: int, body: CompetencyRstCodeUpdateSchema, _=AdminUser):
    normalized = str(body.rst_code or "").strip().upper() or None
    if normalized and normalized not in RST_CODE_SET:
        raise HTTPException(400, f"Code RST '{normalized}' non reconnu.")

    row = _competency_repo.update_rst_code(competency_id, normalized)
    if not row:
        raise HTTPException(404, f"Compétence '{competency_id}' introuvable.")
    return _build_competency_out(row)


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


@router.get("/labs", summary="List laboratories with org grouping (region ARS, agences, labos)")
def list_labs(_user=Depends(get_current_user)):
    return list_laboratoires_with_org()


@router.get("/labs/org-regions", summary="Organisation regions and attached agencies/labs")
def list_org_regions(_user=Depends(get_current_user)):
    return list_org_regions_payload(list_laboratoires_summary())


@router.get("/labs/rst-regions", summary="Legacy alias — org regions")
def list_rst_regions_legacy(_user=Depends(get_current_user)):
    return list_org_regions_payload(list_laboratoires_summary())


@router.get("/labs/{code}", summary="Laboratory detail — personnel, equipment, scope")
def get_lab_detail(code: str, _user=Depends(get_current_user)):
    record = LaboratoiresRepository().get_by_code(code)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Laboratoire {code} introuvable")
    return build_laboratoire_detail(record)


class LaboratoireGeoUpdateSchema(BaseModel):
    nom: Optional[str] = None
    region: Optional[str] = None
    agence_code: Optional[str] = None
    address: Optional[str] = None
    report_header: Optional[str] = None
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lon: Optional[float] = Field(None, ge=-180, le=180)
    is_active: Optional[bool] = None
    responsable_email: Optional[str] = None
    notes: Optional[str] = None
    new_code: Optional[str] = None


class LaboratoireRenameSchema(BaseModel):
    new_code: str


class OrgRegionUpsertSchema(BaseModel):
    code: str
    label: str
    is_active: bool = True


class AgenceUpsertSchema(BaseModel):
    code: str
    label: str
    region_code: str
    is_active: bool = True


class LaboratoireCreateSchema(BaseModel):
    code: str
    nom: str
    region: str = "ARS"
    agence_code: str
    address: str = ""
    report_header: str = ""
    is_active: bool = True


@router.put("/labs/{code}", summary="Update laboratory reference")
def update_lab_geo(code: str, body: LaboratoireGeoUpdateSchema, _admin=AdminUser):
    fields = body.model_dump(exclude_unset=True)
    new_code = fields.pop("new_code", None)
    target_code = str(code).strip().upper()

    if new_code:
        try:
            rename_laboratoire_code(target_code, new_code)
        except LookupError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
        target_code = str(new_code).strip().upper()

    if "is_active" in fields:
        fields["actif"] = 1 if fields.pop("is_active") else 0
    if "responsable_email" in fields and fields["responsable_email"] is not None:
        fields["responsable_email"] = str(fields["responsable_email"]).strip().casefold()
    try:
        record = LaboratoiresRepository().update_geo(target_code, fields) if fields else LaboratoiresRepository().get_by_code(target_code)
        if record is None:
            raise LookupError(f"Laboratoire {target_code} introuvable")
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    invalidate_lab_geo_cache()
    invalidate_org_cache()
    return build_laboratoire_detail(record)


@router.post("/labs/{code}/rename", summary="Rename laboratory code")
def rename_lab_code(code: str, body: LaboratoireRenameSchema, _admin=AdminUser):
    try:
        result = rename_laboratoire_code(code, body.new_code)
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    invalidate_lab_geo_cache()
    invalidate_org_cache()
    record = LaboratoiresRepository().get_by_code(result["new_code"])
    return {
        **result,
        "detail": build_laboratoire_detail(record),
    }


@router.delete("/labs/{code}", status_code=200, summary="Delete laboratory (no active references)")
def delete_lab(code: str, _admin=AdminUser):
    try:
        result = delete_laboratoire_code(code)
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    invalidate_lab_geo_cache()
    invalidate_org_cache()
    return result


@router.get("/org/regions", summary="List organisation regions")
def list_org_regions_admin(_admin=AdminUser):
    repo = OrgRepository()
    return [
        {"code": row.code, "label": row.label, "is_active": row.actif}
        for row in repo.list_regions()
    ]


@router.put("/org/regions/{code}", summary="Create or update organisation region")
def upsert_org_region(code: str, body: OrgRegionUpsertSchema, _admin=AdminUser):
    repo = OrgRepository()
    record = repo.upsert_region(code, body.label, body.is_active)
    invalidate_org_cache()
    return {"code": record.code, "label": record.label, "is_active": record.actif}


@router.get("/org/agences", summary="List agencies")
def list_agences_admin(_admin=AdminUser):
    repo = OrgRepository()
    return [
        {
            "code": row.code,
            "label": row.label,
            "region_code": row.region_code,
            "is_active": row.actif,
        }
        for row in repo.list_agences()
    ]


@router.put("/org/agences/{code}", summary="Create or update agency")
def upsert_agence(code: str, body: AgenceUpsertSchema, _admin=AdminUser):
    repo = OrgRepository()
    if not repo.get_region(body.region_code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Région '{body.region_code}' inconnue.")
    record = repo.upsert_agence(code, body.label, body.region_code, body.is_active)
    invalidate_org_cache()
    return {
        "code": record.code,
        "label": record.label,
        "region_code": record.region_code,
        "is_active": record.actif,
    }


@router.post("/labs", status_code=201, summary="Create laboratory")
def create_lab(body: LaboratoireCreateSchema, _admin=AdminUser):
    code = str(body.code or "").strip().upper()
    if not code:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code labo requis.")
    repo = OrgRepository()
    if not repo.get_region(body.region):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Région '{body.region}' inconnue.")
    if not repo.get_agence(body.agence_code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Agence '{body.agence_code}' inconnue.")
    if LaboratoiresRepository().get_by_code(code):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Laboratoire '{code}' existe déjà.")

    from app.core.database import get_db_path

    with sqlite3.connect(str(get_db_path())) as conn:
        conn.execute(
            """
            INSERT INTO laboratoires (code, nom, region, agence_code, address, report_header, actif)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                code,
                str(body.nom or "").strip(),
                str(body.region or "").strip().upper(),
                str(body.agence_code or "").strip().upper(),
                str(body.address or "").strip(),
                str(body.report_header or "").strip(),
                1 if body.is_active else 0,
            ),
        )
        conn.commit()

    invalidate_lab_geo_cache()
    invalidate_org_cache()
    record = LaboratoiresRepository().get_by_code(code)
    if record is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Création labo échouée.")
    return build_laboratoire_detail(record)
