"""Coordonnées laboratoires — lecture depuis la table laboratoires (source centrale)."""
from __future__ import annotations

import math
from dataclasses import dataclass

from app.repositories.laboratoires_repository import LaboratoireRecord, LaboratoiresRepository

_LAB_CODE_ALIASES = {
    "AUV": "PDC",
    "PONT-DU-CHATEAU": "PDC",
    "SAINT-PRIEST": "SP",
}

_geo_cache: dict[str, "LabGeoLocation"] | None = None


@dataclass(frozen=True, slots=True)
class LabGeoLocation:
    code: str
    label: str
    lat: float
    lon: float
    address: str = ""
    report_header: str = ""


def invalidate_lab_geo_cache() -> None:
    global _geo_cache
    _geo_cache = None


def normalize_labo_code(code: str | None) -> str:
    text = str(code or "SP").strip().upper()
    if not text:
        return "SP"
    aliased = _LAB_CODE_ALIASES.get(text, text)
    cache = _load_geo_cache()
    if aliased in cache:
        return aliased
    if "SP" in cache:
        return "SP"
    return aliased


def _record_to_location(record: LaboratoireRecord) -> LabGeoLocation | None:
    if record.lat is None or record.lon is None:
        return None
    return LabGeoLocation(
        code=record.code,
        label=record.nom,
        lat=float(record.lat),
        lon=float(record.lon),
        address=record.address,
        report_header=record.report_header,
    )


def _load_geo_cache() -> dict[str, LabGeoLocation]:
    global _geo_cache
    if _geo_cache is not None:
        return _geo_cache

    cache: dict[str, LabGeoLocation] = {}
    for record in LaboratoiresRepository().list_all():
        location = _record_to_location(record)
        if location is not None:
            cache[record.code.upper()] = location
    _geo_cache = cache
    return cache


def get_lab_geo_location(labo_code: str | None) -> LabGeoLocation:
    cache = _load_geo_cache()
    code = normalize_labo_code(labo_code)
    location = cache.get(code)
    if location is not None:
        return location
    fallback = cache.get("SP")
    if fallback is not None:
        return fallback
    raise ValueError(f"Coordonnées laboratoire indisponibles pour {labo_code or 'SP'}")


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def format_distance_km(distance_km: float) -> str:
    value = max(float(distance_km or 0), 0.0)
    if value < 1:
        return f"{int(round(value * 1000))} m"
    if value < 100:
        rounded = round(value, 1)
        text = f"{rounded:.1f}".replace(".", ",")
        if text.endswith(",0"):
            text = text[:-2]
        return f"{text} km"
    return f"{int(round(value))} km"


def distance_to_lab(labo_code: str | None, lat: float, lon: float) -> dict:
    lab = get_lab_geo_location(labo_code)
    km = haversine_km(float(lat), float(lon), lab.lat, lab.lon)
    return {
        "labo_code": lab.code,
        "labo_label": lab.label,
        "labo_address": lab.address,
        "labo_lat": lab.lat,
        "labo_lon": lab.lon,
        "distance_km": round(km, 2),
        "distance_text": format_distance_km(km),
    }
