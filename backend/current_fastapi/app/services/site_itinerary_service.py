"""Itinéraire routier labo → chantier (OSRM / OpenStreetMap)."""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

from app.services.lab_geo_catalog import distance_to_lab, format_distance_km, get_lab_geo_location

OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving"
USER_AGENT = "RaLab5/1.0 (site plan itinerary; contact@ralab.local)"
MAX_ROUTE_POINTS = 160


def _simplify_route_points(points: list[dict], *, max_points: int = MAX_ROUTE_POINTS) -> list[dict]:
    if len(points) <= max_points:
        return points
    step = max(1, len(points) // max_points)
    simplified = [points[index] for index in range(0, len(points), step)]
    if simplified[-1] != points[-1]:
        simplified.append(points[-1])
    return simplified


def normalize_itinerary_route(route: list[dict] | None) -> list[dict]:
    normalized: list[dict] = []
    for raw in route or []:
        if not isinstance(raw, dict):
            continue
        try:
            lat = float(raw.get("lat"))
            lon = float(raw.get("lon"))
        except (TypeError, ValueError):
            continue
        normalized.append({"lat": lat, "lon": lon})
    return normalized


def fetch_driving_route(lon1: float, lat1: float, lon2: float, lat2: float) -> dict:
    coords = f"{float(lon1)},{float(lat1)};{float(lon2)},{float(lat2)}"
    params = urllib.parse.urlencode({
        "overview": "full",
        "geometries": "geojson",
        "steps": "false",
    })
    url = f"{OSRM_ROUTE_URL}/{coords}?{params}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise ValueError(f"Calcul d'itinéraire indisponible ({exc.code})") from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise ValueError(f"Service d'itinéraire inaccessible ({reason})") from exc
    except TimeoutError as exc:
        raise ValueError("Délai dépassé lors du calcul d'itinéraire") from exc

    if payload.get("code") != "Ok":
        message = str(payload.get("message") or payload.get("code") or "Itinéraire introuvable")
        raise ValueError(message)

    routes = payload.get("routes") or []
    if not routes:
        raise ValueError("Itinéraire introuvable")

    route = routes[0]
    geometry = route.get("geometry") or {}
    coordinates = geometry.get("coordinates") or []
    points = [{"lat": float(lat), "lon": float(lon)} for lon, lat in coordinates if lat is not None and lon is not None]
    if len(points) < 2:
        raise ValueError("Itinéraire vide")

    return {
        "points": _simplify_route_points(points),
        "distance_m": float(route.get("distance") or 0),
        "duration_s": float(route.get("duration") or 0),
    }


def build_site_plan_itinerary(labo_code: str, site_lat: float, site_lon: float) -> dict:
    lab = get_lab_geo_location(labo_code)
    routing = fetch_driving_route(lab.lon, lab.lat, float(site_lon), float(site_lat))
    route = routing["points"]
    route_meta = distance_to_lab(labo_code, float(site_lat), float(site_lon))
    driving_km = round(float(routing.get("distance_m") or 0) / 1000.0, 2)
    duration_min = int(round(float(routing.get("duration_s") or 0) / 60.0))

    return {
        "labo_code": lab.code,
        "labo_label": lab.label,
        "labo_lat": lab.lat,
        "labo_lon": lab.lon,
        "labo_address": lab.address,
        "site_lat": float(site_lat),
        "site_lon": float(site_lon),
        "route": route,
        "distance_to_lab": route_meta,
        "driving_distance_km": driving_km,
        "driving_distance_text": format_distance_km(driving_km),
        "driving_duration_min": duration_min,
    }
