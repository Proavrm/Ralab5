from app.services.site_plan_requirements_service import (
    assert_adresse_ouvrage,
    has_plan_situation_file,
    validate_demande_site_plan_requirements,
    validate_passation_site_plan_requirements,
)


def test_has_plan_situation_file() -> None:
    assert has_plan_situation_file([]) is False
    assert has_plan_situation_file([
        {"document_type": "Plan de situation", "stored_path": ""},
    ]) is False
    assert has_plan_situation_file([
        {"document_type": "Plan de situation", "stored_path": "documents/2026-RA-023/plan.png"},
    ]) is True


def test_validate_passation_requires_adresse_and_plan() -> None:
    try:
        validate_passation_site_plan_requirements(adresse_ouvrage="", documents=[])
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "Adresse" in str(exc)

    try:
        validate_passation_site_plan_requirements(
            adresse_ouvrage="12 avenue de la République, Lyon",
            documents=[{"document_type": "CCTP", "stored_path": "documents/x.pdf"}],
        )
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "Plan de situation" in str(exc)


def test_validate_demande_with_passation_accepts_passation_plan() -> None:
    assert_adresse_ouvrage("12 avenue de la République, Lyon")
    validate_demande_site_plan_requirements(
        adresse_ouvrage="12 avenue de la République, Lyon",
        demande_documents=[],
        passation_uid=1,
        passation_documents=[
            {"document_type": "Plan de situation", "stored_path": "documents/2026-RA-023/plan.png"},
        ],
    )
