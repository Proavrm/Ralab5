from app.repositories.laboratoires_repository import LaboratoireRecord
from app.services.laboratoire_detail_service import build_laboratoire_detail
from app.services.laboratoire_org_catalog import agence_for_lab, user_service_matches_lab


def _sample_lab(**overrides) -> LaboratoireRecord:
    base = dict(
        id=1,
        code="SP",
        nom="Saint-Priest",
        region="ARS",
        actif=True,
        address="29-31 rue des Tâches, 69800 Saint-Priest",
        report_header="Région Rhône Alpes - 69800 SAINT PRIEST",
        lat=45.6969,
        lon=4.9422,
        coords_updated_at="2026-01-01 10:00:00",
        responsable_email="chef.sp@example.com",
        notes="Labo principal RA",
        agence_code="RA",
    )
    base.update(overrides)
    return LaboratoireRecord(**base)


class _Row:
    def __init__(self, **kwargs):
        self._data = kwargs

    def __getitem__(self, key):
        return self._data[key]


def test_user_service_matches_lab_scope() -> None:
    assert user_service_matches_lab("SP", "SP", "ARS", "RA")
    assert user_service_matches_lab("PDC", "PDC", "ARS", "AUV")
    assert user_service_matches_lab("RA", "SP", "ARS", "RA")
    assert user_service_matches_lab("AUV", "PDC", "ARS", "AUV")
    assert user_service_matches_lab("ARS", "SP", "ARS", "RA")
    assert not user_service_matches_lab("", "SP", "ARS", "RA")
    assert not user_service_matches_lab("PDC", "SP", "ARS", "RA")


def test_agence_for_lab_codes() -> None:
    assert agence_for_lab("SP", "RA") == "RA"
    assert agence_for_lab("PDC", "AUV") == "AUV"


def test_build_laboratoire_detail_staff_and_scope(monkeypatch) -> None:
    users = [
        _Row(
            email="chef.sp@example.com",
            display_name="Chef SP",
            role_code="lab_manager",
            service_code="SP",
            employment_level_label="Cadre",
            is_active=1,
        ),
        _Row(
            email="tech.pdc@example.com",
            display_name="Tech PDC",
            role_code="technician",
            service_code="PDC",
            employment_level_label="Technicien",
            is_active=1,
        ),
    ]
    monkeypatch.setattr(
        "app.services.laboratoire_detail_service.SecurityRepository.list_all_users",
        lambda self: users,
    )
    monkeypatch.setattr(
        "app.services.laboratoire_detail_service._equipment_stats",
        lambda code: {"total": 3, "active": 2, "hs": 1, "unassigned_total": 0, "linked": True},
    )

    detail = build_laboratoire_detail(_sample_lab())

    assert detail["code"] == "SP"
    assert detail["agence_code"] == "RA"
    assert detail["region"] == "ARS"
    assert detail["responsable"]["email"] == "chef.sp@example.com"
    assert detail["staff_total_count"] == 1
    assert detail["staff_active_count"] == 1
    assert detail["equipment"]["total"] == 3
    assert detail["scope"]["user_link_field"] == "service_code"
