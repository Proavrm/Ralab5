"""Geocode an address and fetch a static map preview (plan de situation)."""
from __future__ import annotations

import io
import json
import math
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

from PIL import Image, ImageDraw

from app.services.demande_document_storage_service import (
    normalize_stored_path,
    read_affaire_sidecar_json,
    sanitize_filename,
    save_affaire_document,
    write_affaire_document_bytes,
    write_affaire_sidecar_json,
)
from app.services.site_itinerary_service import normalize_itinerary_route
from app.services.lab_geo_catalog import distance_to_lab

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
USER_AGENT = "RaLab5/1.0 (site plan capture; contact@ralab.local)"
TILE_SIZE = 256
MAX_LAT = 85.05112878
DEFAULT_SUGGESTION_LIMIT = 5
# A4 portrait ~150 dpi — plan de situation (210×297 mm)
SITE_PLAN_IMAGE_WIDTH = 1050
SITE_PLAN_IMAGE_HEIGHT = 1486
# A4 paysage ~150 dpi — itinéraire (297×210 mm)
ITINERARY_IMAGE_WIDTH = 1486
ITINERARY_IMAGE_HEIGHT = 1050
SITE_PLAN_META_VERSION = 1
SITE_PLAN_ZONE_COLORS = (
    "#2563eb",
    "#16a34a",
    "#d97706",
    "#9333ea",
    "#dc2626",
    "#0891b2",
    "#ca8a04",
    "#db2777",
)


def resolve_a4_dimensions(orientation: str = "portrait") -> tuple[int, int]:
    text = str(orientation or "portrait").strip().lower()
    if text in {"landscape", "paysage"}:
        return ITINERARY_IMAGE_WIDTH, ITINERARY_IMAGE_HEIGHT
    return SITE_PLAN_IMAGE_WIDTH, SITE_PLAN_IMAGE_HEIGHT


def _row_to_location(row: dict, fallback_query: str = "") -> dict:
    return {
        "lat": float(row["lat"]),
        "lon": float(row["lon"]),
        "label": str(row.get("display_name") or fallback_query).strip(),
    }


def _nominatim_search(query: str, *, limit: int = 1) -> list[dict]:
    text = str(query or "").strip()
    if not text:
        return []

    params = urllib.parse.urlencode(
        {
            "q": text,
            "format": "json",
            "limit": max(1, min(int(limit or 1), 10)),
            "addressdetails": 0,
            "countrycodes": "fr",
        }
    )
    request = urllib.request.Request(
        f"{NOMINATIM_URL}?{params}",
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise ValueError(f"Service de géocodage indisponible ({exc.code})") from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise ValueError(f"Service de géocodage inaccessible ({reason})") from exc
    except TimeoutError as exc:
        raise ValueError("Délai dépassé lors du géocodage") from exc

    return payload if isinstance(payload, list) else []


def _fallback_geocode_queries(address: str) -> list[str]:
    query = str(address or "").strip()
    if not query:
        return []

    parts = [part.strip() for part in query.split(",") if part.strip()]
    fallbacks: list[str] = []
    seen: set[str] = set()

    def add(candidate: str) -> None:
        text = str(candidate or "").strip()
        if not text:
            return
        key = text.casefold()
        if key in seen or key == query.casefold():
            return
        seen.add(key)
        fallbacks.append(text)

    if len(parts) >= 2:
        add(f"{parts[-2]}, {parts[-1]}, France")
    if parts:
        add(f"{parts[-1]}, France")
    if len(parts) >= 3:
        add(f"{parts[-3]}, {parts[-2]}, France")
    for part in parts:
        cp_match = re.search(r"\b(\d{5})\b", part)
        if cp_match:
            cp = cp_match.group(1)
            add(f"{cp}, France")
            town = re.sub(r"\(.*?\)", " ", part).replace(cp, " ").strip()
            town = " ".join(town.split())
            if town:
                add(f"{cp} {town}, France")
                add(f"{town}, France")
    return fallbacks


def geocode_address_candidates(address: str, *, limit: int = DEFAULT_SUGGESTION_LIMIT) -> list[dict]:
    query = str(address or "").strip()
    if not query:
        return []

    rows = _nominatim_search(query, limit=limit)
    if rows:
        return [_row_to_location(row, query) for row in rows]

    for fallback in _fallback_geocode_queries(query):
        rows = _nominatim_search(fallback, limit=limit)
        if rows:
            return [_row_to_location(row, fallback) for row in rows]
    return []


def resolve_geocode(address: str, *, limit: int = DEFAULT_SUGGESTION_LIMIT) -> dict:
    query = str(address or "").strip()
    if not query:
        raise ValueError("Adresse du chantier obligatoire")

    exact_rows = _nominatim_search(query, limit=1)
    if exact_rows:
        location = _row_to_location(exact_rows[0], query)
        return {
            "query": query,
            "found": True,
            "location": location,
            "suggestions": [],
        }

    suggestions = geocode_address_candidates(query, limit=limit)
    return {
        "query": query,
        "found": False,
        "location": None,
        "suggestions": suggestions,
    }


def geocode_address(address: str) -> dict:
    result = resolve_geocode(address, limit=1)
    if result["found"] and result["location"]:
        return result["location"]
    raise ValueError("Adresse introuvable — vérifiez rue, commune et code postal")


def build_geocode_response(address: str, *, labo_code: str = "SP", limit: int = DEFAULT_SUGGESTION_LIMIT) -> dict:
    result = resolve_geocode(address, limit=limit)
    location = result.get("location")
    distance = None
    if location:
        distance = distance_to_lab(labo_code, location["lat"], location["lon"])

    suggestions = []
    for item in result.get("suggestions") or []:
        enriched = dict(item)
        enriched["distance_to_lab"] = distance_to_lab(labo_code, item["lat"], item["lon"])
        suggestions.append(enriched)

    return {
        **result,
        "suggestions": suggestions,
        "distance_to_lab": distance,
    }


def capture_site_plan_png_at(
    lat: float,
    lon: float,
    zoom: int = 16,
    *,
    draw_marker: bool = False,
    marker_lat: float | None = None,
    marker_lon: float | None = None,
    width: int = SITE_PLAN_IMAGE_WIDTH,
    height: int = SITE_PLAN_IMAGE_HEIGHT,
) -> bytes:
    return fetch_static_map_png(
        float(lat),
        float(lon),
        zoom=zoom,
        width=width,
        height=height,
        draw_marker=draw_marker,
        marker_lat=marker_lat,
        marker_lon=marker_lon,
    )


def capture_site_plan_png(address: str, zoom: int = 16) -> tuple[bytes, dict]:
    location = geocode_address(address)
    content = capture_site_plan_png_at(location["lat"], location["lon"], zoom=zoom)
    return content, location


def save_site_plan_capture(
    affaire_reference: str,
    address: str,
    zoom: int = 16,
    *,
    labo_code: str = "SP",
    location: dict | None = None,
    map_center: dict | None = None,
    zones: list[dict] | None = None,
    pins: list[dict] | None = None,
    replace_stored_path: str | None = None,
    show_itinerary: bool = False,
    itinerary_route: list[dict] | None = None,
    orientation: str = "portrait",
) -> dict:
    normalized_zones = normalize_site_plan_zones(zones)
    normalized_pins = normalize_site_plan_pins(pins)
    normalized_route = normalize_itinerary_route(itinerary_route) if show_itinerary else []
    img_w, img_h = resolve_a4_dimensions(orientation)

    if location and location.get("lat") is not None and location.get("lon") is not None:
        point = {
            "lat": float(location["lat"]),
            "lon": float(location["lon"]),
            "label": str(location.get("label") or address).strip(),
        }
    else:
        content, point = capture_site_plan_png(address, zoom=zoom)
        content = render_site_plan_png_bytes(
            content,
            marker_lat=point["lat"],
            marker_lon=point["lon"],
            map_center_lat=point["lat"],
            map_center_lon=point["lon"],
            zoom=zoom,
            zones=normalized_zones,
            pins=normalized_pins,
            itinerary_route=normalized_route,
            width=img_w,
            height=img_h,
        )
        filename = build_site_plan_filename(point["label"])
        saved = _persist_site_plan_file(
            affaire_reference,
            content,
            filename,
            replace_stored_path=replace_stored_path,
        )
        capture = _build_capture_meta(
            address=address,
            point=point,
            view_lat=point["lat"],
            view_lon=point["lon"],
            zoom=zoom,
            labo_code=labo_code,
            zones=normalized_zones,
            pins=normalized_pins,
            show_itinerary=show_itinerary,
            itinerary_route=normalized_route,
            image_width=img_w,
            image_height=img_h,
            orientation=orientation,
        )
        saved["capture"] = capture
        _write_site_plan_sidecar(affaire_reference, saved["stored_path"], capture)
        return saved

    view = map_center if map_center and map_center.get("lat") is not None else point
    view_lat = float(view["lat"])
    view_lon = float(view["lon"])
    content = render_site_plan_png(
        view_lat,
        view_lon,
        zoom=zoom,
        marker_lat=point["lat"],
        marker_lon=point["lon"],
        zones=normalized_zones,
        pins=normalized_pins,
        itinerary_route=normalized_route,
        width=img_w,
        height=img_h,
    )

    filename = build_site_plan_filename(point["label"])
    saved = _persist_site_plan_file(
        affaire_reference,
        content,
        filename,
        replace_stored_path=replace_stored_path,
    )
    capture = _build_capture_meta(
        address=address,
        point=point,
        view_lat=view_lat,
        view_lon=view_lon,
        zoom=zoom,
        labo_code=labo_code,
        zones=normalized_zones,
        pins=normalized_pins,
        show_itinerary=show_itinerary,
        itinerary_route=normalized_route,
        image_width=img_w,
        image_height=img_h,
        orientation=orientation,
    )
    saved["capture"] = capture
    _write_site_plan_sidecar(affaire_reference, saved["stored_path"], capture)
    return saved


def load_site_plan_meta(stored_path: str, *, affaire_reference: str | None = None) -> dict | None:
    path = normalize_stored_path(stored_path)
    if not path:
        return None
    payload = read_affaire_sidecar_json(path, affaire_reference)
    if not payload:
        return None
    zones = normalize_site_plan_zones(payload.get("zones"))
    payload["zones"] = zones
    pins = normalize_site_plan_pins(payload.get("pins"))
    payload["pins"] = pins
    payload["itinerary_route"] = normalize_itinerary_route(payload.get("itinerary_route"))
    payload["show_itinerary"] = bool(payload.get("show_itinerary"))
    return payload


def build_site_plan_sidecar_path(stored_path: str) -> str:
    path = normalize_stored_path(stored_path)
    if path.lower().endswith(".png"):
        return path[:-4] + ".site_plan.json"
    return f"{path}.site_plan.json"


def normalize_site_plan_zones(zones: list[dict] | None) -> list[dict]:
    normalized: list[dict] = []
    for index, raw in enumerate(zones or []):
        if not isinstance(raw, dict):
            continue
        points = []
        for point in raw.get("points") or []:
            if not isinstance(point, dict):
                continue
            try:
                x = max(0.0, min(100.0, float(point.get("x"))))
                y = max(0.0, min(100.0, float(point.get("y"))))
            except (TypeError, ValueError):
                continue
            points.append({"x": x, "y": y})
        if len(points) < 3:
            continue
        zone_id = str(raw.get("id") or f"zone-{index + 1}").strip() or f"zone-{index + 1}"
        label = str(raw.get("label") or f"Zone {index + 1}").strip() or f"Zone {index + 1}"
        color = str(raw.get("color") or SITE_PLAN_ZONE_COLORS[index % len(SITE_PLAN_ZONE_COLORS)]).strip()
        normalized.append({
            "id": zone_id,
            "label": label,
            "color": color,
            "points": points,
        })
    return normalized


def normalize_site_plan_pins(pins: list[dict] | None) -> list[dict]:
    normalized: list[dict] = []
    for index, raw in enumerate(pins or []):
        if not isinstance(raw, dict):
            continue
        try:
            x = max(0.0, min(100.0, float(raw.get("x"))))
            y = max(0.0, min(100.0, float(raw.get("y"))))
        except (TypeError, ValueError):
            continue
        pin_id = str(raw.get("id") or f"pin-{index + 1}").strip() or f"pin-{index + 1}"
        comment = str(raw.get("comment") or f"Repère {index + 1}").strip() or f"Repère {index + 1}"
        normalized.append({
            "id": pin_id,
            "x": x,
            "y": y,
            "comment": comment[:240],
        })
    return normalized


def render_site_plan_png(
    map_center_lat: float,
    map_center_lon: float,
    *,
    zoom: int = 16,
    marker_lat: float | None = None,
    marker_lon: float | None = None,
    zones: list[dict] | None = None,
    pins: list[dict] | None = None,
    itinerary_route: list[dict] | None = None,
    width: int = SITE_PLAN_IMAGE_WIDTH,
    height: int = SITE_PLAN_IMAGE_HEIGHT,
) -> bytes:
    base = fetch_static_map_png(
        map_center_lat,
        map_center_lon,
        zoom=zoom,
        width=width,
        height=height,
        draw_marker=False,
    )
    return render_site_plan_png_bytes(
        base,
        marker_lat=marker_lat,
        marker_lon=marker_lon,
        map_center_lat=map_center_lat,
        map_center_lon=map_center_lon,
        zoom=zoom,
        zones=zones,
        pins=pins,
        itinerary_route=itinerary_route,
        width=width,
        height=height,
    )


def render_site_plan_png_bytes(
    png_content: bytes,
    *,
    marker_lat: float | None = None,
    marker_lon: float | None = None,
    map_center_lat: float | None = None,
    map_center_lon: float | None = None,
    zoom: int = 16,
    zones: list[dict] | None = None,
    pins: list[dict] | None = None,
    itinerary_route: list[dict] | None = None,
    width: int = SITE_PLAN_IMAGE_WIDTH,
    height: int = SITE_PLAN_IMAGE_HEIGHT,
) -> bytes:
    image = Image.open(io.BytesIO(png_content)).convert("RGB")
    if image.size != (width, height):
        image = image.resize((width, height), Image.Resampling.LANCZOS)

    normalized_zones = normalize_site_plan_zones(zones)
    if normalized_zones:
        image = _draw_zones_on_image(image, normalized_zones)

    normalized_route = normalize_itinerary_route(itinerary_route)
    if normalized_route and map_center_lat is not None and map_center_lon is not None:
        image = _draw_itinerary_on_image(
            image,
            normalized_route,
            float(map_center_lat),
            float(map_center_lon),
            zoom,
        )

    normalized_pins = normalize_site_plan_pins(pins)
    if normalized_pins:
        image = _draw_pins_on_image(image, normalized_pins)

    if marker_lat is not None and marker_lon is not None and map_center_lat is not None and map_center_lon is not None:
        center_x, center_y = _latlon_to_pixel(float(map_center_lat), float(map_center_lon), zoom)
        left = center_x - width / 2
        top = center_y - height / 2
        mx, my = _latlon_to_pixel(float(marker_lat), float(marker_lon), zoom)
        pin_x = int(round(mx - left))
        pin_y = int(round(my - top))
        pin_x = max(0, min(width - 1, pin_x))
        pin_y = max(0, min(height - 1, pin_y))
        _draw_location_marker(image, pin_x, pin_y)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    content = buffer.getvalue()
    if not content:
        raise ValueError("Capture carte vide")
    return content


def _persist_site_plan_file(
    affaire_reference: str,
    content: bytes,
    filename: str,
    *,
    replace_stored_path: str | None = None,
) -> dict:
    replace_path = normalize_stored_path(replace_stored_path or "")
    if replace_path:
        return write_affaire_document_bytes(replace_path, affaire_reference, content)
    return save_affaire_document(affaire_reference, content, filename)


def _build_capture_meta(
    *,
    address: str,
    point: dict,
    view_lat: float,
    view_lon: float,
    zoom: int,
    labo_code: str,
    zones: list[dict],
    pins: list[dict] | None = None,
    show_itinerary: bool = False,
    itinerary_route: list[dict] | None = None,
    image_width: int = SITE_PLAN_IMAGE_WIDTH,
    image_height: int = SITE_PLAN_IMAGE_HEIGHT,
    orientation: str = "portrait",
) -> dict:
    return {
        "version": SITE_PLAN_META_VERSION,
        "address_query": address,
        "address_label": point["label"],
        "lat": point["lat"],
        "lon": point["lon"],
        "map_center_lat": view_lat,
        "map_center_lon": view_lon,
        "zoom": zoom,
        "image_width": image_width,
        "image_height": image_height,
        "orientation": orientation,
        "zones": zones,
        "pins": normalize_site_plan_pins(pins),
        "show_itinerary": bool(show_itinerary),
        "itinerary_route": normalize_itinerary_route(itinerary_route),
        "source": "map_capture",
        "distance_to_lab": distance_to_lab(labo_code, point["lat"], point["lon"]),
    }


def _write_site_plan_sidecar(affaire_reference: str, stored_path: str, capture: dict) -> str:
    sidecar = {
        "version": capture.get("version", SITE_PLAN_META_VERSION),
        "address_query": capture.get("address_query"),
        "address_label": capture.get("address_label"),
        "lat": capture.get("lat"),
        "lon": capture.get("lon"),
        "map_center_lat": capture.get("map_center_lat"),
        "map_center_lon": capture.get("map_center_lon"),
        "zoom": capture.get("zoom"),
        "image_width": capture.get("image_width", SITE_PLAN_IMAGE_WIDTH),
        "image_height": capture.get("image_height", SITE_PLAN_IMAGE_HEIGHT),
        "orientation": capture.get("orientation", "portrait"),
        "zones": capture.get("zones") or [],
        "pins": normalize_site_plan_pins(capture.get("pins")),
        "show_itinerary": bool(capture.get("show_itinerary")),
        "itinerary_route": normalize_itinerary_route(capture.get("itinerary_route")),
        "source": capture.get("source", "map_capture"),
        "stored_path": normalize_stored_path(stored_path),
    }
    return write_affaire_sidecar_json(stored_path, affaire_reference, sidecar)


def _hex_to_rgba(color: str, alpha: int = 64) -> tuple[int, int, int, int]:
    text = str(color or "").strip().lstrip("#")
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    if len(text) != 6:
        return (37, 99, 235, alpha)
    try:
        r = int(text[0:2], 16)
        g = int(text[2:4], 16)
        b = int(text[4:6], 16)
    except ValueError:
        return (37, 99, 235, alpha)
    return (r, g, b, alpha)


def _draw_lab_marker(image: Image.Image, x: int, y: int) -> None:
    draw = ImageDraw.Draw(image)
    size = 9
    draw.rectangle(
        (x - size, y - size, x + size, y + size),
        fill="#1d4ed8",
        outline="#ffffff",
        width=3,
    )


def _draw_itinerary_on_image(
    image: Image.Image,
    route: list[dict],
    map_center_lat: float,
    map_center_lon: float,
    zoom: int,
) -> Image.Image:
    if len(route) < 2:
        return image

    width, height = image.size
    center_x, center_y = _latlon_to_pixel(map_center_lat, map_center_lon, zoom)
    left = center_x - width / 2
    top = center_y - height / 2
    pixel_points: list[tuple[int, int]] = []
    for point in route:
        mx, my = _latlon_to_pixel(float(point["lat"]), float(point["lon"]), zoom)
        pixel_points.append((int(round(mx - left)), int(round(my - top))))

    draw = ImageDraw.Draw(image)
    if len(pixel_points) >= 2:
        draw.line(pixel_points, fill="#7c3aed", width=4, joint="curve")

    lab_x, lab_y = pixel_points[0]
    lab_x = max(0, min(width - 1, lab_x))
    lab_y = max(0, min(height - 1, lab_y))
    _draw_lab_marker(image, lab_x, lab_y)
    return image


def _draw_zones_on_image(image: Image.Image, zones: list[dict]) -> Image.Image:
    width, height = image.size
    rgba = image.convert("RGBA")
    overlay = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    o_draw = ImageDraw.Draw(overlay, "RGBA")

    for zone in zones:
        points = [
            (float(point["x"]) / 100.0 * width, float(point["y"]) / 100.0 * height)
            for point in zone.get("points") or []
        ]
        if len(points) < 3:
            continue
        fill = _hex_to_rgba(zone.get("color"), alpha=48)
        o_draw.polygon(points, fill=fill)

    rgba = Image.alpha_composite(rgba, overlay)
    draw = ImageDraw.Draw(rgba)
    for zone in zones:
        points = [
            (float(point["x"]) / 100.0 * width, float(point["y"]) / 100.0 * height)
            for point in zone.get("points") or []
        ]
        if len(points) < 3:
            continue
        outline = _hex_to_rgba(zone.get("color"), alpha=255)[:3]
        draw.polygon(points, outline=outline, width=3)
        label = str(zone.get("label") or "").strip()
        if label:
            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            lx = sum(xs) / len(xs)
            ly = sum(ys) / len(ys)
            bbox = draw.textbbox((0, 0), label)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]
            tx = max(4, min(width - text_w - 4, lx - text_w / 2))
            ty = max(4, min(height - text_h - 4, ly - text_h / 2))
            draw.rectangle(
                (tx - 4, ty - 2, tx + text_w + 4, ty + text_h + 2),
                fill=(255, 255, 255, 220),
            )
            draw.text((tx, ty), label, fill=outline)

    return rgba.convert("RGB")


def _latlon_to_pixel(lat: float, lon: float, zoom: int) -> tuple[float, float]:
    clamped_lat = max(min(lat, MAX_LAT), -MAX_LAT)
    scale = TILE_SIZE * (2 ** zoom)
    x = (lon + 180.0) / 360.0 * scale
    sin_lat = math.sin(math.radians(clamped_lat))
    y = (0.5 - math.log((1 + sin_lat) / (1 - sin_lat)) / (4 * math.pi)) * scale
    return x, y


def _fetch_osm_tile(zoom: int, x: int, y: int) -> bytes:
    url = OSM_TILE_URL.format(z=zoom, x=x, y=y)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            content = response.read()
    except urllib.error.HTTPError as exc:
        raise ValueError(f"Tuile cartographique indisponible ({exc.code})") from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        raise ValueError(f"Service cartographique inaccessible ({reason})") from exc
    except TimeoutError as exc:
        raise ValueError("Délai dépassé lors du chargement des tuiles carte") from exc
    if not content:
        raise ValueError("Tuile cartographique vide")
    return content


def _draw_location_marker(image: Image.Image, x: int, y: int) -> None:
    draw = ImageDraw.Draw(image)
    radius = 10
    draw.ellipse(
        (x - radius, y - radius, x + radius, y + radius),
        fill="#e03131",
        outline="#ffffff",
        width=3,
    )
    draw.ellipse(
        (x - 4, y - 4, x + 4, y + 4),
        fill="#ffffff",
    )


def _draw_annotation_marker(draw: ImageDraw.ImageDraw, x: int, y: int, index: int) -> None:
    radius = 8
    draw.ellipse(
        (x - radius, y - radius, x + radius, y + radius),
        fill="#f59e0b",
        outline="#ffffff",
        width=2,
    )
    label = str(index + 1)
    bbox = draw.textbbox((0, 0), label)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    draw.text(
        (x - text_w / 2, y - text_h / 2 - 1),
        label,
        fill="#ffffff",
    )
    draw.line((x, y + radius, x, y + radius + 6), fill="#f59e0b", width=2)


def _draw_pins_on_image(image: Image.Image, pins: list[dict]) -> Image.Image:
    width, height = image.size
    draw = ImageDraw.Draw(image)
    for index, pin in enumerate(pins):
        x = int(round(float(pin["x"]) / 100.0 * width))
        y = int(round(float(pin["y"]) / 100.0 * height))
        x = max(0, min(width - 1, x))
        y = max(0, min(height - 1, y))
        _draw_annotation_marker(draw, x, y, index)
        comment = str(pin.get("comment") or "").strip()
        if not comment:
            continue
        if len(comment) > 48:
            comment = comment[:45] + "..."
        bbox = draw.textbbox((0, 0), comment)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        tx = max(4, min(width - text_w - 4, x + 12))
        ty = max(4, min(height - text_h - 4, y - text_h - 8))
        draw.rectangle(
            (tx - 4, ty - 2, tx + text_w + 4, ty + text_h + 2),
            fill=(255, 247, 237),
            outline=(245, 158, 11),
        )
        draw.text((tx, ty), comment, fill=(120, 53, 15))
    return image


def _draw_attribution(image: Image.Image) -> None:
    draw = ImageDraw.Draw(image)
    text = "© OpenStreetMap contributors"
    padding = 6
    bbox = draw.textbbox((0, 0), text)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = image.width - text_w - padding * 2
    y = image.height - text_h - padding * 2
    draw.rectangle(
        (x - padding, y - padding, x + text_w + padding, y + text_h + padding),
        fill=(255, 255, 255, 220),
    )
    draw.text((x, y), text, fill="#334155")


def fetch_static_map_png(
    lat: float,
    lon: float,
    zoom: int = 16,
    width: int = SITE_PLAN_IMAGE_WIDTH,
    height: int = SITE_PLAN_IMAGE_HEIGHT,
    *,
    draw_marker: bool = True,
    marker_lat: float | None = None,
    marker_lon: float | None = None,
) -> bytes:
    zoom = max(10, min(int(zoom or 16), 19))
    width = max(256, min(int(width or 1024), 2048))
    height = max(256, min(int(height or 640), 2048))

    center_x, center_y = _latlon_to_pixel(lat, lon, zoom)
    left = center_x - width / 2
    top = center_y - height / 2

    tile_x_min = int(math.floor(left / TILE_SIZE))
    tile_y_min = int(math.floor(top / TILE_SIZE))
    tile_x_max = int(math.floor((left + width - 1) / TILE_SIZE))
    tile_y_max = int(math.floor((top + height - 1) / TILE_SIZE))

    image = Image.new("RGB", (width, height), "#eef2f7")

    for tile_x in range(tile_x_min, tile_x_max + 1):
        for tile_y in range(tile_y_min, tile_y_max + 1):
            tile_bytes = _fetch_osm_tile(zoom, tile_x, tile_y)
            tile_image = Image.open(io.BytesIO(tile_bytes)).convert("RGB")
            dest_x = int(round(tile_x * TILE_SIZE - left))
            dest_y = int(round(tile_y * TILE_SIZE - top))
            image.paste(tile_image, (dest_x, dest_y))

    if draw_marker:
        if marker_lat is not None and marker_lon is not None:
            mx, my = _latlon_to_pixel(float(marker_lat), float(marker_lon), zoom)
            pin_x = int(round(mx - left))
            pin_y = int(round(my - top))
            pin_x = max(0, min(width - 1, pin_x))
            pin_y = max(0, min(height - 1, pin_y))
            _draw_location_marker(image, pin_x, pin_y)
        else:
            _draw_location_marker(image, width // 2, height // 2)
    _draw_attribution(image)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    content = buffer.getvalue()
    if not content:
        raise ValueError("Capture carte vide")
    return content


def build_site_plan_filename(address: str) -> str:
    slug = re.sub(r"[^\w\- ]+", "", str(address or "").strip())[:48].strip() or "chantier"
    slug = re.sub(r"\s+", "_", slug)
    stamp = datetime.now().strftime("%Y%m%d")
    return sanitize_filename(f"plan_situation__{slug}__{stamp}.png")


def build_itinerary_filename(address: str) -> str:
    slug = re.sub(r"[^\w\- ]+", "", str(address or "").strip())[:48].strip() or "chantier"
    slug = re.sub(r"\s+", "_", slug)
    stamp = datetime.now().strftime("%Y%m%d")
    return sanitize_filename(f"itineraire__{slug}__{stamp}.png")


def build_itinerary_sidecar_path(stored_path: str) -> str:
    path = normalize_stored_path(stored_path)
    if path.lower().endswith(".png"):
        return path[:-4] + ".itinerary.json"
    return f"{path}.itinerary.json"


def load_itinerary_meta(stored_path: str, *, affaire_reference: str | None = None) -> dict | None:
    path = normalize_stored_path(stored_path)
    if not path:
        return None
    return _read_itinerary_sidecar(path, affaire_reference)


def save_itinerary_capture(
    affaire_reference: str,
    address: str,
    zoom: int = 13,
    *,
    labo_code: str = "SP",
    location: dict | None = None,
    map_center: dict | None = None,
    itinerary_route: list[dict] | None = None,
    replace_stored_path: str | None = None,
    orientation: str = "landscape",
) -> dict:
    normalized_route = normalize_itinerary_route(itinerary_route)
    if len(normalized_route) < 2:
        raise ValueError("Itinéraire routier invalide ou incomplet")
    img_w, img_h = resolve_a4_dimensions(orientation)

    if not location or location.get("lat") is None or location.get("lon") is None:
        raise ValueError("Point chantier obligatoire pour l'itinéraire")

    point = {
        "lat": float(location["lat"]),
        "lon": float(location["lon"]),
        "label": str(location.get("label") or address).strip(),
    }
    view = map_center if map_center and map_center.get("lat") is not None else point
    view_lat = float(view["lat"])
    view_lon = float(view["lon"])
    content = render_site_plan_png(
        view_lat,
        view_lon,
        zoom=zoom,
        marker_lat=point["lat"],
        marker_lon=point["lon"],
        zones=[],
        itinerary_route=normalized_route,
        width=img_w,
        height=img_h,
    )
    filename = build_itinerary_filename(point["label"])
    saved = _persist_site_plan_file(
        affaire_reference,
        content,
        filename,
        replace_stored_path=replace_stored_path,
    )
    capture = _build_itinerary_capture_meta(
        address=address,
        point=point,
        view_lat=view_lat,
        view_lon=view_lon,
        zoom=zoom,
        labo_code=labo_code,
        itinerary_route=normalized_route,
        image_width=img_w,
        image_height=img_h,
        orientation=orientation,
    )
    saved["capture"] = capture
    _write_itinerary_sidecar(affaire_reference, saved["stored_path"], capture)
    return saved


def _build_itinerary_capture_meta(
    *,
    address: str,
    point: dict,
    view_lat: float,
    view_lon: float,
    zoom: int,
    labo_code: str,
    itinerary_route: list[dict],
    image_width: int = ITINERARY_IMAGE_WIDTH,
    image_height: int = ITINERARY_IMAGE_HEIGHT,
    orientation: str = "landscape",
) -> dict:
    return {
        "version": SITE_PLAN_META_VERSION,
        "capture_kind": "itinerary",
        "address_query": address,
        "address_label": point["label"],
        "lat": point["lat"],
        "lon": point["lon"],
        "map_center_lat": view_lat,
        "map_center_lon": view_lon,
        "zoom": zoom,
        "image_width": image_width,
        "image_height": image_height,
        "orientation": orientation,
        "zones": [],
        "itinerary_route": normalize_itinerary_route(itinerary_route),
        "source": "map_capture",
        "distance_to_lab": distance_to_lab(labo_code, point["lat"], point["lon"]),
    }


def _write_itinerary_sidecar(affaire_reference: str, stored_path: str, capture: dict) -> str:
    sidecar = {
        "version": capture.get("version", SITE_PLAN_META_VERSION),
        "capture_kind": "itinerary",
        "address_query": capture.get("address_query"),
        "address_label": capture.get("address_label"),
        "lat": capture.get("lat"),
        "lon": capture.get("lon"),
        "map_center_lat": capture.get("map_center_lat"),
        "map_center_lon": capture.get("map_center_lon"),
        "zoom": capture.get("zoom"),
        "image_width": capture.get("image_width", ITINERARY_IMAGE_WIDTH),
        "image_height": capture.get("image_height", ITINERARY_IMAGE_HEIGHT),
        "orientation": capture.get("orientation", "landscape"),
        "itinerary_route": normalize_itinerary_route(capture.get("itinerary_route")),
        "source": capture.get("source", "map_capture"),
        "stored_path": normalize_stored_path(stored_path),
    }
    sidecar_path = build_itinerary_sidecar_path(stored_path)
    return _write_sidecar_json_at_path(sidecar_path, affaire_reference, sidecar)


def _read_itinerary_sidecar(stored_path: str, affaire_reference: str | None = None) -> dict | None:
    sidecar_path = build_itinerary_sidecar_path(stored_path)
    payload = _read_sidecar_json_at_path(sidecar_path, affaire_reference)
    if not payload:
        return None
    payload["itinerary_route"] = normalize_itinerary_route(payload.get("itinerary_route"))
    return payload


def _write_sidecar_json_at_path(sidecar_path: str, affaire_reference: str, payload: dict) -> str:
    from app.services.demande_document_storage_service import (
        DOCUMENTS_DIR,
        STORAGE_ROOT,
        normalize_affaire_reference,
        normalize_stored_path,
    )

    path = normalize_stored_path(sidecar_path)
    ref = normalize_affaire_reference(affaire_reference)
    parts = [segment for segment in path.split("/") if segment]
    target = STORAGE_ROOT.joinpath(*parts)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _read_sidecar_json_at_path(sidecar_path: str, affaire_reference: str | None = None) -> dict | None:
    from app.services.demande_document_storage_service import (
        DOCUMENTS_DIR,
        STORAGE_ROOT,
        normalize_affaire_reference,
        normalize_stored_path,
    )

    path = normalize_stored_path(sidecar_path)
    parts = [segment for segment in path.split("/") if segment]
    target = STORAGE_ROOT.joinpath(*parts)
    storage_root = STORAGE_ROOT.resolve()
    try:
        target.resolve().relative_to(storage_root)
    except ValueError:
        return None

    if affaire_reference:
        ref = normalize_affaire_reference(affaire_reference)
        affaire_dir = (STORAGE_ROOT / DOCUMENTS_DIR / ref).resolve()
        try:
            target.resolve().relative_to(affaire_dir)
        except ValueError:
            return None

    if not target.is_file():
        return None
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None
