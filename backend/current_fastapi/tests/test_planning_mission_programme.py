import json

from api.planning import (
    _format_mission_essai_entry,
    _mission_programme_from_observations,
)


def test_mission_programme_formats_essais_and_prep_points():
    observations = json.dumps({
        "mission_essais_prevus": [
            {"code": "VC", "label": "Feuille de visite chantier", "norme": ""},
            {"code": "DE", "label": "Densité enrobés", "norme": "NF P98-241-1"},
            {"code": "DE", "label": "Densité enrobés", "norme": "NF P94-061-1"},
        ],
        "prep_points_a_realiser": "2 sondages zone A",
    })

    programme = _mission_programme_from_observations(observations)

    assert "VC — Feuille de visite chantier" in programme
    assert "DE (NF P98-241-1)" in programme
    assert "DE (NF P94-061-1)" in programme
    assert "2 sondages zone A" in programme


def test_format_mission_essai_entry_prefers_norme_for_duplicate_codes():
    assert _format_mission_essai_entry({
        "code": "DE",
        "label": "Densité enrobés",
        "norme": "NF P98-241-1",
    }) == "DE (NF P98-241-1)"
