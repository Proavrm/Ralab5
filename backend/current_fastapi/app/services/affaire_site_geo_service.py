"""Géolocalisation affaire — persistance et distance laboratoire."""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.services.lab_geo_catalog import distance_to_lab

if TYPE_CHECKING:
    from app.models.affaire_rst import AffaireRstRecord
    from app.repositories.affaires_rst_repository import AffairesRstRepository


def build_affaire_site_geo(record: AffaireRstRecord, *, labo_code: str = "SP") -> dict | None:
    lat = getattr(record, "site_lat", None)
    lon = getattr(record, "site_lon", None)
    if lat is None or lon is None:
        return None
    label = str(getattr(record, "site_geocode_label", "") or "").strip()
    payload = {
        "lat": float(lat),
        "lon": float(lon),
        "label": label,
    }
    payload["distance_to_lab"] = distance_to_lab(labo_code, payload["lat"], payload["lon"])
    return payload


def persist_affaire_site_geo(
    repo: AffairesRstRepository,
    uid: int,
    *,
    lat: float,
    lon: float,
    label: str = "",
) -> None:
    repo.update(
        uid,
        {
            "site_lat": float(lat),
            "site_lon": float(lon),
            "site_geocode_label": str(label or "").strip(),
        },
    )
