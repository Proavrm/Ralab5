from io import BytesIO
from unittest.mock import patch

from PIL import Image

from app.services.site_map_capture_service import (
    _latlon_to_pixel,
    fetch_static_map_png,
    normalize_site_plan_pins,
    normalize_site_plan_zones,
    render_site_plan_png_bytes,
)


def _fake_tile_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (256, 256), "#dbeafe").save(buffer, format="PNG")
    return buffer.getvalue()


def test_latlon_to_pixel_center_tile() -> None:
    x, y = _latlon_to_pixel(0.0, 0.0, 0)
    assert x == 128.0
    assert y == 128.0


def test_fetch_static_map_png_builds_png() -> None:
    with patch(
        "app.services.site_map_capture_service._fetch_osm_tile",
        return_value=_fake_tile_bytes(),
    ):
        content = fetch_static_map_png(45.7578, 4.8320, zoom=16, width=512, height=512)

    assert content.startswith(b"\x89PNG")
    assert len(content) > 1000


def test_normalize_site_plan_zones_requires_three_points() -> None:
    zones = normalize_site_plan_zones([
        {"id": "z1", "label": "A", "points": [{"x": 1, "y": 2}, {"x": 3, "y": 4}]},
        {"id": "z2", "label": "B", "points": [{"x": 10, "y": 10}, {"x": 20, "y": 10}, {"x": 15, "y": 25}]},
    ])
    assert len(zones) == 1
    assert zones[0]["id"] == "z2"


def test_normalize_site_plan_pins() -> None:
    pins = normalize_site_plan_pins([
        {"id": "p1", "x": 150, "y": -5, "comment": "  Accès camion  "},
        {"x": 40, "y": 55},
    ])
    assert len(pins) == 2
    assert pins[0]["x"] == 100.0
    assert pins[0]["y"] == 0.0
    assert pins[0]["comment"] == "Accès camion"
    assert pins[1]["comment"] == "Repère 2"


def test_render_site_plan_png_bytes_draws_zones() -> None:
    with patch(
        "app.services.site_map_capture_service._fetch_osm_tile",
        return_value=_fake_tile_bytes(),
    ):
        base = fetch_static_map_png(45.7578, 4.8320, zoom=16, width=512, height=512, draw_marker=False)

    zones = normalize_site_plan_zones([
        {
            "id": "z1",
            "label": "Chantier",
            "color": "#2563eb",
            "points": [
                {"x": 20, "y": 20},
                {"x": 80, "y": 20},
                {"x": 50, "y": 70},
            ],
        },
    ])
    content = render_site_plan_png_bytes(
        base,
        marker_lat=45.7578,
        marker_lon=4.8320,
        map_center_lat=45.7578,
        map_center_lon=4.8320,
        zoom=16,
        zones=zones,
        width=512,
        height=512,
    )
    assert content.startswith(b"\x89PNG")
    assert len(content) > len(base)


def test_render_site_plan_png_bytes_draws_pins() -> None:
    with patch(
        "app.services.site_map_capture_service._fetch_osm_tile",
        return_value=_fake_tile_bytes(),
    ):
        base = fetch_static_map_png(45.7578, 4.8320, zoom=16, width=512, height=512, draw_marker=False)

    pins = normalize_site_plan_pins([
        {"id": "p1", "x": 30, "y": 40, "comment": "Accès chantier"},
    ])
    content = render_site_plan_png_bytes(
        base,
        marker_lat=45.7578,
        marker_lon=4.8320,
        map_center_lat=45.7578,
        map_center_lon=4.8320,
        zoom=16,
        pins=pins,
        width=512,
        height=512,
    )
    assert content.startswith(b"\x89PNG")
    assert len(content) > len(base)
