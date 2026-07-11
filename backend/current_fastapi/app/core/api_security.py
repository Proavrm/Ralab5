"""Politique d'authentification HTTP pour l'API et le stockage statique."""

from __future__ import annotations

import os
from contextvars import ContextVar
from typing import Optional

from fastapi import HTTPException, Request

AUTH_MODE_ENV_VAR = "RALAB_AUTH_MODE"
AUTH_MODE_PASSWORDLESS = "passwordless"
AUTH_MODE_PROXY = "proxy"
AUTH_MODE_ACCESS_KEY = "access_key"

REQUIRE_API_AUTH_ENV_VAR = "RALAB_REQUIRE_API_AUTH"
PROTECT_STORAGE_ENV_VAR = "RALAB_PROTECT_STORAGE"
TOKEN_COOKIE_NAME = "ralab_token"

request_user_label: ContextVar[str] = ContextVar("request_user_label", default="Utilisateur")

PUBLIC_API_ROUTES: set[tuple[str, str]] = {
    ("GET", "/api/status"),
    ("GET", "/api/auth/hint"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/logout"),
}

LOCAL_USERNAME_HINT_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def auth_mode() -> str:
    return os.environ.get(AUTH_MODE_ENV_VAR, AUTH_MODE_PASSWORDLESS).strip().lower() or AUTH_MODE_PASSWORDLESS


def api_auth_required() -> bool:
    raw = os.environ.get(REQUIRE_API_AUTH_ENV_VAR, "").strip().lower()
    if raw in {"0", "false", "no", "off"}:
        return False
    if raw in {"1", "true", "yes", "on"}:
        return True
    return auth_mode() in {AUTH_MODE_PROXY, AUTH_MODE_ACCESS_KEY}


def storage_auth_required() -> bool:
    raw = os.environ.get(PROTECT_STORAGE_ENV_VAR, "").strip().lower()
    if raw in {"0", "false", "no", "off"}:
        return False
    if raw in {"1", "true", "yes", "on"}:
        return True
    return auth_mode() in {AUTH_MODE_PROXY, AUTH_MODE_ACCESS_KEY}


def _normalize_request_host(value: str) -> str:
    raw = value.split(",", 1)[0].strip().lower()
    if not raw:
        return ""
    if raw.startswith("["):
        closing_bracket = raw.find("]")
        if closing_bracket != -1:
            return raw[1:closing_bracket]
    if raw.count(":") == 1:
        return raw.split(":", 1)[0]
    return raw


def can_use_local_username_hint(request: Request | None) -> bool:
    """Aligné sur api.auth._can_use_local_windows_hint — dev local sous RALAB_AUTH_MODE=proxy."""
    if request is None:
        return False
    candidates = [
        request.headers.get("x-forwarded-host", ""),
        request.headers.get("host", ""),
    ]
    if request.client and request.client.host:
        candidates.append(request.client.host)
    normalized = {
        _normalize_request_host(candidate)
        for candidate in candidates
        if candidate and _normalize_request_host(candidate)
    }
    return bool(normalized & LOCAL_USERNAME_HINT_HOSTS)


def is_public_api_route(method: str, path: str, request: Request | None = None) -> bool:
    normalized = path.rstrip("/") or "/"
    if (method.upper(), normalized) in PUBLIC_API_ROUTES:
        return True
    if method.upper() == "GET" and normalized == "/api/auth/users":
        mode = auth_mode()
        if mode == AUTH_MODE_PASSWORDLESS:
            return True
        # localhost + proxy env : hint passwordless, annuaire login autorisé
        if mode == AUTH_MODE_PROXY and can_use_local_username_hint(request):
            return True
    return False


def extract_bearer_token(request: Request) -> Optional[str]:
    authorization = request.headers.get("Authorization", "").strip()
    if authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if token:
            return token
    cookie_token = request.cookies.get(TOKEN_COOKIE_NAME, "").strip()
    return cookie_token or None


def decode_request_token(request: Request) -> dict:
    from api.auth import _decode_token

    token = extract_bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Token obrigatório.")
    payload = _decode_token(token)
    request.state.user = payload
    request_user_label.set(str(payload.get("sub") or "Utilisateur"))
    return payload


def current_request_user_label() -> str:
    return request_user_label.get()
