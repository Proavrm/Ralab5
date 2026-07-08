from app.repositories.demande_preparation_repository import build_preparation_reference


def test_build_preparation_reference_from_demande_ref():
    assert build_preparation_reference("2026-SP-D0052") == "2026-SP-PR0052"


def test_build_preparation_reference_from_demande_parts():
    assert build_preparation_reference("", annee=2026, labo_code="SP", numero=52) == "2026-SP-PR0052"
