from app.repositories.laboratoires_repository import LaboratoireRecord, LaboratoiresRepository
from app.services.lab_geo_catalog import (
    distance_to_lab,
    format_distance_km,
    get_lab_geo_location,
    haversine_km,
    invalidate_lab_geo_cache,
    normalize_labo_code,
)


def _sample_lab(**overrides) -> LaboratoireRecord:
    base = dict(
        id=1,
        code="SP",
        nom="Saint-Priest",
        region="RA",
        actif=True,
        address="29-31 rue des Tâches, 69800 Saint-Priest",
        report_header="Région Rhône Alpes - 69800 SAINT PRIEST",
        lat=45.6969,
        lon=4.9422,
        coords_updated_at="2026-01-01 10:00:00",
        responsable_email="",
        notes="",
    )
    base.update(overrides)
    return LaboratoireRecord(**base)


def test_normalize_labo_code_aliases(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.lab_geo_catalog.LaboratoiresRepository.list_all",
        lambda self: [_sample_lab(), _sample_lab(id=2, code="PDC", nom="Pont-du-Château", lat=45.7964, lon=3.2425)],
    )
    invalidate_lab_geo_cache()
    assert normalize_labo_code("AUV") == "PDC"
    assert normalize_labo_code("sp") == "SP"


def test_haversine_km_same_point() -> None:
    assert haversine_km(45.7, 4.9, 45.7, 4.9) == 0.0


def test_format_distance_km() -> None:
    assert format_distance_km(0.4) == "400 m"
    assert format_distance_km(12.4) == "12,4 km"
    assert format_distance_km(125.2) == "125 km"


def test_distance_to_lab_sp(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.lab_geo_catalog.LaboratoiresRepository.list_all",
        lambda self: [_sample_lab()],
    )
    invalidate_lab_geo_cache()
    lab = get_lab_geo_location("SP")
    result = distance_to_lab("SP", lab.lat, lab.lon)
    assert result["labo_code"] == "SP"
    assert result["distance_km"] == 0.0
    assert result["distance_text"] == "0 m"
