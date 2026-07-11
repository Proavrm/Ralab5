from datetime import date

from app.models.affaire_rst import AffaireRstRecord
from app.repositories.laboratoires_repository import LaboratoireRecord
from app.services.affaire_site_geo_service import build_affaire_site_geo, persist_affaire_site_geo
from app.services.lab_geo_catalog import invalidate_lab_geo_cache


class _FakeRepo:
    def __init__(self) -> None:
        self.updates: list[tuple[int, dict]] = []

    def update(self, uid: int, fields: dict):
        self.updates.append((uid, fields))
        return None


def _sample_affaire(**overrides) -> AffaireRstRecord:
    base = dict(
        uid=1,
        reference="2026-RA-001",
        annee=2026,
        region="RA",
        numero=1,
        client="Client",
        titulaire="",
        chantier="Chantier",
        affaire_nge="",
        date_ouverture=date.today(),
        date_cloture=None,
        statut="En cours",
        statut_offre="",
        responsable="",
        source_legacy_id=None,
        dossier_nom="",
        dossier_path="",
        site="Lyon",
        adresse_ouvrage="1 rue Test",
        site_lat=45.7578,
        site_lon=4.8320,
        site_geocode_label="Lyon, France",
    )
    base.update(overrides)
    return AffaireRstRecord(**base)


def _sample_lab() -> LaboratoireRecord:
    return LaboratoireRecord(
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
    )


def test_build_affaire_site_geo(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.lab_geo_catalog.LaboratoiresRepository.list_all",
        lambda self: [_sample_lab()],
    )
    invalidate_lab_geo_cache()

    record = _sample_affaire()
    geo = build_affaire_site_geo(record, labo_code="SP")
    assert geo is not None
    assert geo["lat"] == 45.7578
    assert geo["distance_to_lab"]["labo_code"] == "SP"
    assert geo["distance_to_lab"]["distance_km"] >= 0


def test_build_affaire_site_geo_missing_coords() -> None:
    record = _sample_affaire(site_lat=None, site_lon=None)
    assert build_affaire_site_geo(record) is None


def test_persist_affaire_site_geo() -> None:
    repo = _FakeRepo()
    persist_affaire_site_geo(repo, 12, lat=45.7, lon=4.9, label="Lyon")
    assert repo.updates == [(12, {"site_lat": 45.7, "site_lon": 4.9, "site_geocode_label": "Lyon"})]
