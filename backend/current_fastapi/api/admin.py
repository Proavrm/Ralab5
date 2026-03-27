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

from api.auth import get_current_user, require_permission
from app.core.database import list_laboratoires
from app.repositories.security_repository import SecurityRepository

router = APIRouter()
_repo = SecurityRepository()

# ── dependency: só manage_users pode aceder ───────────────────────────────────
AdminUser = Depends(require_permission("manage_users"))


# ── Schemas ───────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    email:        str
    display_name: str
    role_code:    str
    service_code: str
    is_active:    bool
    permissions:  list[str] = []


class UserCreateSchema(BaseModel):
    email:        str  = Field(..., description="Email único do utilizador")
    display_name: str  = Field(..., description="Nome completo")
    role_code:    str  = Field(..., description="Código do role")
    service_code: str  = Field(..., description="Código do serviço / agência")
    is_active:    bool = Field(True)


class UserUpdateSchema(BaseModel):
    display_name: Optional[str] = None
    role_code:    Optional[str] = None
    service_code: Optional[str] = None
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
        is_active=bool(row["is_active"]),
        permissions=perms,
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

    # Verificar duplicado
    if _repo.get_user_by_email(body.email.strip().lower()):
        raise HTTPException(409, f"Utilizador '{body.email}' já existe.")

    _repo.upsert_user(
        email=body.email,
        display_name=body.display_name,
        role_code=body.role_code,
        service_code=body.service_code,
        is_active=body.is_active,
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

    _repo.upsert_user(
        email=email,
        display_name=body.display_name or row["display_name"],
        role_code=new_role,
        service_code=body.service_code or row["service_code"],
        is_active=body.is_active if body.is_active is not None else bool(row["is_active"]),
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


@router.get("/labs", summary="List laboratories available in RaLab4")
def list_labs():
    return list_laboratoires()
