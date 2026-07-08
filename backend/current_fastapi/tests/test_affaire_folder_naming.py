from datetime import date

from app.models.affaire_rst import AffaireRstRecord
from app.services.affaire_folder_naming import build_affaire_folder_name_from_record


def _record(**overrides):
    base = dict(
        uid=1,
        reference="2026-RA-044",
        annee=2026,
        region="RA",
        numero=44,
        client="CNR",
        titulaire="GUINTOLI",
        chantier="CNR voirie de desserte à parcelle",
        affaire_nge="",
        date_ouverture=date.today(),
        date_cloture=None,
        statut="En cours",
        statut_offre="",
        responsable="",
        source_legacy_id=None,
        dossier_nom="",
        dossier_path="",
        site="LOIRE-SUR-RHÔNE (69)",
        maitre_ouvrage="CNR",
        maitre_oeuvre="EGIS Lyon",
        numero_etude="26-07-10-1",
        filiale="GUINTOLI",
    )
    base.update(overrides)
    return AffaireRstRecord(**base)


def test_folder_name_without_titulaire_prefix() -> None:
    name = build_affaire_folder_name_from_record(_record())
    assert name == (
        "2026-RA-044 - 26-07-10-1 - LOIRE-SUR-RHÔNE (69) - "
        "CNR voirie de desserte à parcelle"
    )
    assert "GUINTOLI" not in name


def test_folder_name_uses_moa_when_client_empty() -> None:
    name = build_affaire_folder_name_from_record(
        _record(client="", maitre_ouvrage="Ville de Lyon", chantier="Voirie centrale")
    )
    assert name.endswith("Ville de Lyon_Voirie centrale")


def test_folder_name_client_differs_from_moa() -> None:
    name = build_affaire_folder_name_from_record(
        _record(client="Facturation SP", maitre_ouvrage="CNR", chantier="Voirie parcelle")
    )
    assert name.endswith("Facturation SP_Voirie parcelle")
