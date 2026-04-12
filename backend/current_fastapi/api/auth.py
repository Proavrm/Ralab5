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
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.repositories.security_repository import SecurityRepository

router = APIRouter()
security = HTTPBearer(auto_error=False)

# ── Configuração auth / JWT ──────────────────────────────────────────────────
AUTH_MODE_ENV_VAR = "RALAB_AUTH_MODE"
AUTH_MODE_PASSWORDLESS = "passwordless"
AUTH_MODE_PROXY = "proxy"
AUTH_MODE_ACCESS_KEY = "access_key"
AUTH_MODES = {AUTH_MODE_PASSWORDLESS, AUTH_MODE_PROXY, AUTH_MODE_ACCESS_KEY}
AUTH_MODE = os.environ.get(AUTH_MODE_ENV_VAR, AUTH_MODE_PASSWORDLESS).strip().lower() or AUTH_MODE_PASSWORDLESS

if AUTH_MODE not in AUTH_MODES:
    raise RuntimeError(
        f"{AUTH_MODE_ENV_VAR} must be one of {sorted(AUTH_MODES)}. Current value: {AUTH_MODE!r}."
    )

PROXY_AUTH_HEADERS_ENV_VAR = "RALAB_PROXY_AUTH_HEADERS"
PROXY_AUTH_HEADERS = tuple(
    header.strip().lower()
    for header in os.environ.get(
        PROXY_AUTH_HEADERS_ENV_VAR,
        "Cf-Access-Authenticated-User-Email,X-Forwarded-Email,X-Auth-Request-Email,X-Forwarded-User,X-Auth-Request-User",
    ).split(",")
    if header.strip()
)

ACCESS_KEY_ENV_VAR = "RALAB_ACCESS_KEY"
ACCESS_KEY_ALLOWED_EMAILS_ENV_VAR = "RALAB_ACCESS_KEY_ALLOWED_EMAILS"
ACCESS_KEY_ALLOW_ALL_TOKEN = "*"
ACCESS_KEY = os.environ.get(ACCESS_KEY_ENV_VAR, "")
ACCESS_KEY_ALLOWED_EMAILS_RAW = {
    item.strip().lower()
    for item in os.environ.get(ACCESS_KEY_ALLOWED_EMAILS_ENV_VAR, "").split(",")
    if item.strip()
}
ACCESS_KEY_ALLOW_ALL = ACCESS_KEY_ALLOW_ALL_TOKEN in ACCESS_KEY_ALLOWED_EMAILS_RAW
ACCESS_KEY_ALLOWED_EMAILS = {
    item
    for item in ACCESS_KEY_ALLOWED_EMAILS_RAW
    if item != ACCESS_KEY_ALLOW_ALL_TOKEN
}

JWT_SECRET_ENV_VAR = "RALAB_JWT_SECRET"
JWT_LEGACY_SECRET = "ralab3-secret-dev-2026"
JWT_DEFAULT_SECRET = "ralab5-dev-jwt-secret-2026-minimum-32-bytes"
JWT_SECRET = os.environ.get(JWT_SECRET_ENV_VAR, JWT_DEFAULT_SECRET)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 12
JWT_MIN_SECRET_BYTES = 32


def _secret_len(value: str) -> int:
    return len(value.encode("utf-8"))


if _secret_len(JWT_SECRET) < JWT_MIN_SECRET_BYTES:
    raise RuntimeError(
        f"{JWT_SECRET_ENV_VAR} must be at least {JWT_MIN_SECRET_BYTES} bytes for {JWT_ALGORITHM}. "
        f"Current length: {_secret_len(JWT_SECRET)} bytes."
    )

if AUTH_MODE == AUTH_MODE_PROXY and JWT_SECRET == JWT_DEFAULT_SECRET:
    raise RuntimeError(
        f"Set {JWT_SECRET_ENV_VAR} explicitly before using {AUTH_MODE_ENV_VAR}={AUTH_MODE_PROXY!r}."
    )

if AUTH_MODE == AUTH_MODE_ACCESS_KEY:
    if len(ACCESS_KEY) < 8:
        raise RuntimeError(
            f"Set {ACCESS_KEY_ENV_VAR} to a non-empty secret of at least 8 characters before using "
            f"{AUTH_MODE_ENV_VAR}={AUTH_MODE_ACCESS_KEY!r}."
        )
    if not ACCESS_KEY_ALLOW_ALL and not ACCESS_KEY_ALLOWED_EMAILS:
        raise RuntimeError(
            f"Set {ACCESS_KEY_ALLOWED_EMAILS_ENV_VAR} to one or more comma-separated emails or '*' before using "
            f"{AUTH_MODE_ENV_VAR}={AUTH_MODE_ACCESS_KEY!r}."
        )


JWT_DECODE_SECRETS = [JWT_SECRET]
if JWT_SECRET != JWT_LEGACY_SECRET:
    JWT_DECODE_SECRETS.append(JWT_LEGACY_SECRET)

_sec_repo = SecurityRepository()


# ── Schemas ───────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    identifier: Optional[str] = None
    access_key: Optional[str] = None


class UserSchema(BaseModel):
    email:        str
    display_name: str
    role_code:    str
    service_code: str
    employment_level_code: Optional[str] = None
    employment_level_label: Optional[str] = None
    permissions:  list[str]


class LoginResponse(BaseModel):
    token:        str
    user:         UserSchema
    expires_in:   int          # segundos


class HintResponse(BaseModel):
    auth_mode: str
    windows_username: str
    proxy_identity: Optional[str]
    matched_email:    Optional[str]
    matched_name:     Optional[str]
    can_auto_login:   bool
    access_key_allows_all_users: bool = False


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
    saw_expired = False

    for secret in JWT_DECODE_SECRETS:
        try:
            return jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
        except jwt.ExpiredSignatureError:
            saw_expired = True
        except jwt.InvalidTokenError:
            continue

    if saw_expired:
        raise HTTPException(status_code=401, detail="Token expirado. Faça login novamente.")

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


def _extract_proxy_identifier(request: Request) -> str:
    for header in PROXY_AUTH_HEADERS:
        value = request.headers.get(header, "").strip()
        if value:
            return value
    return ""


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


def _resolve_proxy_user(identifier: str):
    identifier = identifier.strip().lower()
    if not identifier:
        return None

    user = _sec_repo.get_user_by_email(identifier)
    if user:
        return user

    all_users = _sec_repo.list_active_users()
    for u in all_users:
        email_prefix = u["email"].split("@")[0].lower()
        display_name = u["display_name"].lower()
        display_compact = display_name.replace(" ", ".").replace("-", ".")
        name_parts = display_name.split()

        if identifier in {email_prefix, display_name, display_compact}:
            return _sec_repo.get_user_by_email(u["email"])
        if identifier in name_parts:
            return _sec_repo.get_user_by_email(u["email"])

    return None


def _resolve_access_key_user(identifier: str):
    identifier = identifier.strip().lower()
    if not identifier:
        return None

    user = _sec_repo.get_user_by_email(identifier)
    if not user:
        return None

    if ACCESS_KEY_ALLOW_ALL:
        return user

    if user["email"].strip().lower() not in ACCESS_KEY_ALLOWED_EMAILS:
        return None

    return user


# ── GET /api/auth/hint ────────────────────────────────────────────────────────
@router.get(
    "/hint",
    response_model=HintResponse,
    summary="Auto-detecção utilizador Windows",
    description="Lê o USERNAME do Windows e tenta fazer match com um utilizador do sistema.",
)
def auth_hint(request: Request):
    if AUTH_MODE == AUTH_MODE_PROXY:
        proxy_identity = _extract_proxy_identifier(request)
        user = _resolve_proxy_user(proxy_identity) if proxy_identity else None

        return HintResponse(
            auth_mode=AUTH_MODE,
            windows_username="",
            proxy_identity=proxy_identity or None,
            matched_email=user["email"] if user and int(user["is_active"]) == 1 else None,
            matched_name=user["display_name"] if user and int(user["is_active"]) == 1 else None,
            can_auto_login=bool(user and int(user["is_active"]) == 1),
            access_key_allows_all_users=False,
        )

    if AUTH_MODE == AUTH_MODE_ACCESS_KEY:
        return HintResponse(
            auth_mode=AUTH_MODE,
            windows_username="",
            proxy_identity=None,
            matched_email=None,
            matched_name=None,
            can_auto_login=False,
            access_key_allows_all_users=ACCESS_KEY_ALLOW_ALL,
        )

    windows_username = os.environ.get("USERNAME", "").strip()

    if not windows_username:
        return HintResponse(
            auth_mode=AUTH_MODE,
            windows_username="",
            proxy_identity=None,
            matched_email=None,
            matched_name=None,
            can_auto_login=False,
            access_key_allows_all_users=False,
        )

    user = _resolve_user(windows_username)

    if user and int(user["is_active"]) == 1:
        return HintResponse(
            auth_mode=AUTH_MODE,
            windows_username=windows_username,
            proxy_identity=None,
            matched_email=user["email"],
            matched_name=user["display_name"],
            can_auto_login=True,
            access_key_allows_all_users=False,
        )

    return HintResponse(
        auth_mode=AUTH_MODE,
        windows_username=windows_username,
        proxy_identity=None,
        matched_email=None,
        matched_name=None,
        can_auto_login=False,
        access_key_allows_all_users=False,
    )


# ── GET /api/auth/users ───────────────────────────────────────────────────────
@router.get(
    "/users",
    summary="Lista de utilizadores activos",
    description="Para fallback — mostra lista de utilizadores se auto-detecção falhar.",
)
def list_users():
    if AUTH_MODE in {AUTH_MODE_PROXY, AUTH_MODE_ACCESS_KEY}:
        raise HTTPException(status_code=403, detail="Annuaire désactivé en mode proxy.")

    rows = _sec_repo.list_active_users()
    return [
        {
            "email":        row["email"],
            "display_name": row["display_name"],
            "role_code":    row["role_code"],
            "service_code": row["service_code"],
            "employment_level_code": row["employment_level_code"],
            "employment_level_label": row["employment_level_label"],
        }
        for row in rows
    ]


# ── POST /api/auth/login ──────────────────────────────────────────────────────
@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Login por username Windows ou email",
)
def login(body: LoginRequest, request: Request):
    if AUTH_MODE == AUTH_MODE_PROXY:
        identifier = _extract_proxy_identifier(request)
        if not identifier:
            raise HTTPException(
                status_code=401,
                detail="Aucune identité d'authentification fournie par le proxy.",
            )
        user = _resolve_proxy_user(identifier)
    elif AUTH_MODE == AUTH_MODE_ACCESS_KEY:
        identifier = (body.identifier or "").strip().lower()
        access_key = (body.access_key or "").strip()
        if not identifier:
            raise HTTPException(status_code=400, detail="Email professionnel requis.")
        if not access_key:
            raise HTTPException(status_code=400, detail="Clé d'accès requise.")
        if access_key != ACCESS_KEY:
            raise HTTPException(status_code=401, detail="Clé d'accès invalide.")

        user = _resolve_access_key_user(identifier)
    else:
        identifier = (body.identifier or "").strip()
        if not identifier:
            raise HTTPException(status_code=400, detail="Identifiant requis.")
        user = _resolve_user(identifier)

    if user is None:
        raise HTTPException(
            status_code=401,
            detail=f"Utilisateur '{identifier}' introuvable dans le système.",
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
            employment_level_code=user["employment_level_code"],
            employment_level_label=user["employment_level_label"],
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
        employment_level_code=user["employment_level_code"],
        employment_level_label=user["employment_level_label"],
        permissions=permissions,
    )


# ── POST /api/auth/logout ─────────────────────────────────────────────────────
@router.post("/logout", summary="Logout (client-side)")
def logout():
    # JWT é stateless — o logout é feito apagando o token no browser
    return {"message": "Déconnecté. Supprimez le token côté client."}
