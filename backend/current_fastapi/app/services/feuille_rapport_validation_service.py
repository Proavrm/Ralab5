from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException

LOCKED_RAPPORT_STATUSES = frozenset({"Validé technique", "Émis", "Refusé"})
CORRECTION_REQUESTED_STATUS = "Correction demandée"


def _clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


def parse_resultats_payload(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    text = _clean(raw)
    if not text:
        return {}
    try:
        data = json.loads(text)
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def rapport_status_from_payload(payload: dict[str, Any]) -> str:
    status = _clean(
        payload.get("rapport_status")
        or payload.get("validation_status")
        or payload.get("report_status")
    )
    if status.lower() in {"correction demandee", "correction demandée"}:
        return CORRECTION_REQUESTED_STATUS
    return status or "Brouillon"


def is_feuille_rapport_locked(payload: dict[str, Any]) -> bool:
    status = rapport_status_from_payload(payload)
    if status == CORRECTION_REQUESTED_STATUS:
        return False
    if status in {"", "Brouillon", "À valider"}:
        return False
    return status in LOCKED_RAPPORT_STATUSES


def assert_feuille_rapport_editable(payload: dict[str, Any], *, action: str = "modifier cette feuille") -> None:
    if not is_feuille_rapport_locked(payload):
        return
    status = rapport_status_from_payload(payload)
    raise HTTPException(
        status_code=409,
        detail=(
            f"Feuille verrouillée — rapport « {status} ». "
            f"Impossible de {action} tant qu'une correction n'est pas demandée."
        ),
    )
