from __future__ import annotations

from datetime import datetime
from typing import Any


def build_sc_point_payload(
    *,
    reference: str,
    point_code: str,
    source: str,
    meta: dict[str, Any] | None = None,
    couches: list[dict[str, Any]] | None = None,
    created_from_plan_uid: int | None = None,
    legacy_flat: dict[str, Any] | None = None,
    status: str = "draft",
) -> dict[str, Any]:
    """Build a normalized SC point payload while keeping legacy compatibility."""
    now_iso = datetime.now().isoformat()
    normalized_meta = {
        "affaire_nge_raw": str((meta or {}).get("affaire_nge_raw") or ""),
        "date_sondage": str((meta or {}).get("date_sondage") or ""),
        "date_redaction": str((meta or {}).get("date_redaction") or ""),
        "type_ouvrage": str((meta or {}).get("type_ouvrage") or ""),
        "partie_ouvrage": str((meta or {}).get("partie_ouvrage") or ""),
        "procede": str((meta or {}).get("procede") or ""),
        "diametre": str((meta or {}).get("diametre") or ""),
        "arret_sondage": str((meta or {}).get("arret_sondage") or ""),
        "photo_number": str((meta or {}).get("photo_number") or ""),
        "sc_number": (meta or {}).get("sc_number"),
    }
    normalized_couches: list[dict[str, Any]] = [
        {
            "description": str(item.get("description") or ""),
            "d": item.get("d"),
            "vide": item.get("vide"),
            "compacite": item.get("compacite"),
        }
        for item in (couches or [])
        if isinstance(item, dict)
    ]

    payload: dict[str, Any] = {
        "schema": "SC_POINT_V1",
        "source": str(source or "").strip() or "unknown",
        "reference": str(reference or "").strip(),
        "point_code": str(point_code or "").strip(),
        "point_type": "SONDAGE_CAROTTE",
        "meta": normalized_meta,
        "couches": normalized_couches,
        "state": {
            "status": str(status or "draft"),
            "is_complete": bool(normalized_couches),
        },
        "audit": {
            "created_at": now_iso,
            "updated_at": now_iso,
        },
    }
    if created_from_plan_uid is not None:
        payload["created_from_plan_uid"] = int(created_from_plan_uid)

    # Legacy compatibility: keep historical flat keys so existing consumers do not break.
    for key, value in (legacy_flat or {}).items():
        if key not in payload:
            payload[key] = value
    for key, value in normalized_meta.items():
        if key not in payload:
            payload[key] = value

    return payload
