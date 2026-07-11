"""Middleware — JWT obligatoire sur /api/* et stockage statique (modes proxy / access_key)."""

from __future__ import annotations

from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.api_security import (
    api_auth_required,
    decode_request_token,
    is_public_api_route,
    storage_auth_required,
)


class RequireAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        if path.startswith("/api/"):
            if api_auth_required() and not is_public_api_route(request.method, path):
                try:
                    decode_request_token(request)
                except HTTPException as exc:
                    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

        elif storage_auth_required() and (
            path.startswith("/storage/") or path.startswith("/api/storage/")
        ):
            try:
                decode_request_token(request)
            except HTTPException as exc:
                return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

        return await call_next(request)
