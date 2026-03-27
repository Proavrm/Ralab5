"""
api/auth.py
Router FastAPI — Autenticação
Fluxo: Windows USERNAME → match security.db → JWT token

Endpoints:
  GET  /api/auth/hint     → USERNAME do Windows (auto-detecção)
  GET  /api/auth/users    → lista de utilizadores activos (para fallback)
  POST /api/auth/login    → login por username/email → JWT
  GET  /api/auth/me       → perfil do utilizador autenticado
  POST /api/auth/logout   → invalida token (client-side)
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.repositories.security_repository import SecurityRepository

router = APIRouter()
security = HTTPBearer(auto_error=False)

# ── Configuração JWT ──────────────────────────────────────────────────────────
# Em produção, mudar para variável de ambiente
JWT_SECRET    = "ralab3-secret-dev-2026"
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 12

_sec_repo = SecurityRepository()


# ── Schemas ───────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    identifier: str          # Windows username OU email


class UserSchema(BaseModel):
    email:        str
    display_name: str
    role_code:    str
    service_code: str
    permissions:  list[str]


class LoginResponse(BaseModel):
    token:        str
    user:         UserSchema
    expires_in:   int          # segundos


class HintResponse(BaseModel):
    windows_username: str
    matched_email:    Optional[str]
    matched_name:     Optional[str]
    can_auto_login:   bool


# ── Helpers JWT ───────────────────────────────────────────────────────────────
def _create_token(email: str, role_code: str, permissions: list[str]) -> str:
    payload = {
        "sub":         email,
        "role":        role_code,
        "permissions": permissions,
        "iat":         datetime.now(timezone.utc),
        "exp":         datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado. Faça login novamente.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido.")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Dependency — valida JWT e devolve payload."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Token obrigatório.")
    return _decode_token(credentials.credentials)


def require_permission(permission: str):
    """Dependency factory — verifica permissão específica."""
    def checker(current=Depends(get_current_user)):
        if permission not in current.get("permissions", []):
            raise HTTPException(status_code=403, detail=f"Permissão '{permission}' necessária.")
        return current
    return checker


# ── Resolução utilizador ──────────────────────────────────────────────────────
def _resolve_user(identifier: str):
    """
    Tenta encontrar o utilizador por:
    1. email exacto
    2. Windows username → comparar com display_name ou prefixo de email
    """
    identifier = identifier.strip().lower()
    if not identifier:
        return None

    # Tentativa 1: email directo
    user = _sec_repo.get_user_by_email(identifier)
    if user:
        return user

    # Tentativa 2: Windows username → procurar em todos os utilizadores
    all_users = _sec_repo.list_active_users()
    for u in all_users:
        email_prefix = u["email"].split("@")[0].lower()
        name_lower   = u["display_name"].lower().replace(" ", ".").replace("-", ".")

        if identifier == email_prefix:
            return _sec_repo.get_user_by_email(u["email"])
        if identifier in name_lower:
            return _sec_repo.get_user_by_email(u["email"])
        # "marco" → "marco.costa", "marco pereira", etc.
        name_parts = u["display_name"].lower().split()
        if identifier in name_parts:
            return _sec_repo.get_user_by_email(u["email"])

    return None


# ── GET /api/auth/hint ────────────────────────────────────────────────────────
@router.get(
    "/hint",
    response_model=HintResponse,
    summary="Auto-detecção utilizador Windows",
    description="Lê o USERNAME do Windows e tenta fazer match com um utilizador do sistema.",
)
def auth_hint():
    windows_username = os.environ.get("USERNAME", "").strip()

    if not windows_username:
        return HintResponse(
            windows_username="",
            matched_email=None,
            matched_name=None,
            can_auto_login=False,
        )

    user = _resolve_user(windows_username)

    if user and int(user["is_active"]) == 1:
        return HintResponse(
            windows_username=windows_username,
            matched_email=user["email"],
            matched_name=user["display_name"],
            can_auto_login=True,
        )

    return HintResponse(
        windows_username=windows_username,
        matched_email=None,
        matched_name=None,
        can_auto_login=False,
    )


# ── GET /api/auth/users ───────────────────────────────────────────────────────
@router.get(
    "/users",
    summary="Lista de utilizadores activos",
    description="Para fallback — mostra lista de utilizadores se auto-detecção falhar.",
)
def list_users():
    rows = _sec_repo.list_active_users()
    return [
        {
            "email":        row["email"],
            "display_name": row["display_name"],
            "role_code":    row["role_code"],
            "service_code": row["service_code"],
        }
        for row in rows
    ]


# ── POST /api/auth/login ──────────────────────────────────────────────────────
@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Login por username Windows ou email",
)
def login(body: LoginRequest):
    user = _resolve_user(body.identifier)

    if user is None:
        raise HTTPException(
            status_code=401,
            detail=f"Utilisateur '{body.identifier}' introuvable dans le système.",
        )

    if int(user["is_active"]) != 1:
        raise HTTPException(status_code=401, detail="Compte inactif.")

    permissions = _sec_repo.get_permissions_for_role(user["role_code"])
    token = _create_token(user["email"], user["role_code"], permissions)

    return LoginResponse(
        token=token,
        expires_in=JWT_EXPIRE_HOURS * 3600,
        user=UserSchema(
            email=user["email"],
            display_name=user["display_name"],
            role_code=user["role_code"],
            service_code=user["service_code"],
            permissions=permissions,
        ),
    )


# ── GET /api/auth/me ──────────────────────────────────────────────────────────
@router.get(
    "/me",
    response_model=UserSchema,
    summary="Perfil do utilizador autenticado",
)
def me(current=Depends(get_current_user)):
    user = _sec_repo.get_user_by_email(current["sub"])
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")

    permissions = _sec_repo.get_permissions_for_role(user["role_code"])
    return UserSchema(
        email=user["email"],
        display_name=user["display_name"],
        role_code=user["role_code"],
        service_code=user["service_code"],
        permissions=permissions,
    )


# ── POST /api/auth/logout ─────────────────────────────────────────────────────
@router.post("/logout", summary="Logout (client-side)")
def logout():
    # JWT é stateless — o logout é feito apagando o token no browser
    return {"message": "Déconnecté. Supprimez le token côté client."}
